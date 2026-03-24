"""Persistent interface naming service.

Maps MAC addresses to stable ethX/wlanX names via udev rules.
When a new USB network adapter (ethernet or WiFi) is detected, it gets
registered and a MAC-based udev rule is generated so the name persists
across reboots and reconnections.
"""

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger
from raspsec.libs.network import write_system_file

CONFIG_FILE = "interface_names.yml"
POLICY_FILE = "dongle_policy.yml"
UDEV_RULES_FILE = "/etc/udev/rules.d/80-raspsec-net.rules"

DEFAULT_POLICY = {
    "mode": "auto_connect",   # "none" or "auto_connect"
    "default_chain": "outside",  # firewall chain for auto-connected dongles
}

logger = StrataLogger("IfaceNamesService")


class IfaceNamesService:

    @staticmethod
    def get_config():
        """Return full config: {interfaces: {eth0: {mac: "...", builtin: true}, ...}}"""
        return load_config(CONFIG_FILE, {"interfaces": {}})

    @staticmethod
    def get_name_for_mac(mac):
        """Lookup the assigned name for a given MAC. Returns None if not found."""
        config = IfaceNamesService.get_config()
        for name, info in config.get("interfaces", {}).items():
            if info.get("mac", "").lower() == mac.lower():
                return name
        return None

    @staticmethod
    def get_all_mappings():
        """Return dict of all MAC→name mappings: {eth0: {mac, builtin, label}, ...}"""
        return IfaceNamesService.get_config().get("interfaces", {})

    @staticmethod
    def register_builtin(name, mac):
        """Register the built-in ethernet (eth0) if not already known."""
        config = IfaceNamesService.get_config()
        interfaces = config.get("interfaces", {})

        if name in interfaces:
            # Update MAC if changed (shouldn't happen, but be safe)
            if interfaces[name].get("mac", "").lower() != mac.lower():
                interfaces[name]["mac"] = mac.lower()
                config["interfaces"] = interfaces
                save_config(CONFIG_FILE, config)
            return

        interfaces[name] = {
            "mac": mac.lower(),
            "builtin": True,
        }
        config["interfaces"] = interfaces
        save_config(CONFIG_FILE, config)
        logger.log(f"Registered built-in interface {name} ({mac})")

    @staticmethod
    def register_interface(mac, prefix="eth"):
        """Register a new USB adapter. Returns the assigned name (ethX or wlanX)."""
        mac = mac.lower()

        # Check if already registered
        existing_name = IfaceNamesService.get_name_for_mac(mac)
        if existing_name:
            return existing_name

        config = IfaceNamesService.get_config()
        interfaces = config.get("interfaces", {})

        # Find the next available number for this prefix
        prefix_len = len(prefix)
        used_numbers = set()
        for name in interfaces.keys():
            if name.startswith(prefix):
                try:
                    used_numbers.add(int(name[prefix_len:]))
                except ValueError:
                    pass

        # eth0/wlan0 is typically built-in, start USB at 1
        next_num = 1
        while next_num in used_numbers:
            next_num += 1

        new_name = f"{prefix}{next_num}"
        interfaces[new_name] = {
            "mac": mac,
            "builtin": False,
        }
        config["interfaces"] = interfaces
        save_config(CONFIG_FILE, config)

        # Regenerate udev rules so name persists
        IfaceNamesService.write_udev_rules()

        logger.log(f"Registered new interface {new_name} ({mac})")
        return new_name

    @staticmethod
    def forget_interface(name):
        """Remove a registered interface. Returns True if removed, raises ValueError if built-in."""
        config = IfaceNamesService.get_config()
        interfaces = config.get("interfaces", {})

        if name not in interfaces:
            raise ValueError(f"Interface {name} não está registrada.")

        if interfaces[name].get("builtin"):
            raise ValueError(f"Não é possível esquecer a interface built-in {name}.")

        del interfaces[name]
        config["interfaces"] = interfaces
        save_config(CONFIG_FILE, config)

        # Clean up related configs
        IfaceNamesService._cleanup_interface_config(name)

        # Regenerate udev rules
        IfaceNamesService.write_udev_rules()

        logger.log(f"Forgot interface {name}")
        return True

    @staticmethod
    def _cleanup_interface_config(name):
        """Remove all configs associated with a forgotten interface."""
        # DHCP client config
        try:
            dhcp_cfg = load_config("dhcp_clients.yml", {"interfaces": {}})
            ifaces = dhcp_cfg.get("interfaces", {})
            if name in ifaces:
                del ifaces[name]
                save_config("dhcp_clients.yml", {"interfaces": ifaces})
        except Exception:
            pass

        # Interface descriptions
        try:
            desc_cfg = load_config("interface_descriptions.yml", {"interfaces": {}})
            descs = desc_cfg.get("interfaces", {})
            if name in descs:
                del descs[name]
                save_config("interface_descriptions.yml", {"interfaces": descs})
        except Exception:
            pass

        # Eth server config
        try:
            from raspsec.services.eth_server import EthServerService
            if EthServerService.is_server(name):
                EthServerService.disable_server(name)
            eth_cfg = EthServerService.get_config()
            ifaces = eth_cfg.get("interfaces", {})
            if name in ifaces:
                del ifaces[name]
                save_config("eth_servers.yml", eth_cfg)
        except Exception:
            pass

        # Chain mapping
        try:
            from raspsec.dbmodels.firewall import ChainMapping
            ChainMapping.objects.filter(interface=name).delete()
        except Exception:
            pass

        # IPv4 mode
        try:
            ipv4_cfg = load_config("ipv4_modes.yml", {"interfaces": {}})
            modes = ipv4_cfg.get("interfaces", {})
            if name in modes:
                del modes[name]
                save_config("ipv4_modes.yml", {"interfaces": modes})
        except Exception:
            pass

        # No default route flag
        try:
            no_gw_cfg = load_config("dhcp_no_gateway.yml", {"interfaces": {}})
            no_gw = no_gw_cfg.get("interfaces", {})
            if name in no_gw:
                del no_gw[name]
                save_config("dhcp_no_gateway.yml", {"interfaces": no_gw})
        except Exception:
            pass

        # WiFi client profiles (for wlan interfaces)
        if name.startswith("wlan"):
            try:
                wifi_cfg = load_config("wifi_client.yml", {"profiles": {}})
                profiles = wifi_cfg.get("profiles", {})
                if name in profiles:
                    del profiles[name]
                    save_config("wifi_client.yml", {"profiles": profiles})
            except Exception:
                pass

        # Regenerate dhcpcd.conf (update allowinterfaces)
        try:
            from raspsec.libs.network import write_dhcpcd
            write_dhcpcd()
            Exec.execute("sudo /usr/bin/systemctl restart dhcpcd.service", raise_error=False)
        except Exception:
            pass

        logger.log(f"Cleaned up configs for {name}")

    @staticmethod
    def write_udev_rules():
        """Generate /etc/udev/rules.d/80-raspsec-net.rules from registered interfaces."""
        config = IfaceNamesService.get_config()
        interfaces = config.get("interfaces", {})

        # Separate registered adapters by type (exclude built-in)
        registered = {n: i for n, i in sorted(interfaces.items()) if not i.get("builtin")}

        lines = [
            "# RaspSec — Persistent network interface naming",
            "#",
            "# Built-in: eth0 (driver-based), wlan0 (built-in WiFi)",
            "# USB gadget: usb0 (g_ether), RNDIS/CDC: usb1+",
            "# USB adapters: ethX / wlanX / usbX (MAC-based, persistent)",
            "# Auto-generated by RaspSec — do not edit manually",
            "",
            "# Built-in ethernet (BCM2711/RP1 — identified by driver on platform bus)",
            'SUBSYSTEM=="net", ACTION=="add", DRIVERS=="bcmgenet", KERNEL=="en*", NAME="eth0"',
            'SUBSYSTEM=="net", ACTION=="add", DRIVERS=="macb", KERNEL=="en*", NAME="eth0"',
            "",
            "# Registered USB adapters (MAC-based persistent naming)",
        ]

        for name, info in registered.items():
            mac = info.get("mac", "")
            if not mac:
                continue
            lines.append(f'SUBSYSTEM=="net", ACTION=="add", ATTR{{address}}=="{mac}", NAME="{name}"')

        lines.append("")
        lines.append("# USB gadget (g_ether) — always named usb0")
        lines.append('SUBSYSTEM=="net", ACTION=="add", DRIVERS=="g_ether", NAME="usb0"')
        lines.append("")
        lines.append("# RNDIS/CDC USB devices (usb* kernel name) — rename to usb1, usb2, ...")
        lines.append("# Must come after g_ether rule so gadget keeps usb0")
        lines.append(
            'SUBSYSTEM=="net", ACTION=="add", SUBSYSTEMS=="usb", KERNEL=="usb*", DRIVERS!="g_ether", '
            'PROGRAM="/bin/sh -c \'echo usb$(($(ls -d /sys/class/net/usb[0-9]* 2>/dev/null | wc -l)))\'", NAME="%c"'
        )
        lines.append("")
        lines.append("# Fallback for unknown USB ethernet adapters (en* kernel name) — next available ethX")
        lines.append(
            'SUBSYSTEM=="net", ACTION=="add", SUBSYSTEMS=="usb", KERNEL=="en*", '
            'PROGRAM="/bin/sh -c \'echo eth$(($(ls -d /sys/class/net/eth[0-9]* 2>/dev/null | wc -l)))\'", NAME="%c"'
        )
        lines.append("")
        lines.append("# Fallback for unknown USB WiFi adapters — next available wlanX")
        lines.append(
            'SUBSYSTEM=="net", ACTION=="add", SUBSYSTEMS=="usb", KERNEL=="wl*", '
            'PROGRAM="/bin/sh -c \'echo wlan$(($(ls -d /sys/class/net/wlan[0-9]* 2>/dev/null | wc -l)))\'", NAME="%c"'
        )
        lines.append("")

        content = "\n".join(lines)
        write_system_file(UDEV_RULES_FILE, content)
        Exec.execute("sudo /usr/bin/udevadm control --reload-rules", raise_error=False)
        logger.log("Udev rules regenerated")

    @staticmethod
    def get_policy():
        """Return dongle policy config."""
        return load_config(POLICY_FILE, DEFAULT_POLICY)

    @staticmethod
    def save_policy(data):
        """Save dongle policy config."""
        policy = {
            "mode": data.get("mode", "none"),
            "default_chain": data.get("default_chain", ""),
        }
        save_config(POLICY_FILE, policy)
        logger.log(f"Dongle policy saved: {policy}")

    @staticmethod
    def _apply_auto_connect(name):
        """Apply auto-connect policy to a newly registered interface."""
        policy = IfaceNamesService.get_policy()
        if policy.get("mode") != "auto_connect":
            return

        # Bring interface up
        Exec.execute(f"sudo /sbin/ip link set {name} up", raise_error=False)

        # Enable DHCP client and persist ipv4 mode
        dhcp_cfg = load_config("dhcp_clients.yml", {"interfaces": {}})
        ifaces = dhcp_cfg.get("interfaces", {})
        ifaces[name] = True
        save_config("dhcp_clients.yml", {"interfaces": ifaces})

        ipv4_modes = load_config("ipv4_modes.yml", {"interfaces": {}}).get("interfaces", {})
        ipv4_modes[name] = "dhcp"
        save_config("ipv4_modes.yml", {"interfaces": ipv4_modes})

        from raspsec.libs.network import write_dhcpcd
        write_dhcpcd()
        Exec.execute("sudo /usr/bin/systemctl restart dhcpcd.service", raise_error=False)

        # Set default chain
        chain = policy.get("default_chain", "")
        if chain and chain in ("internal", "implant", "outside"):
            from raspsec.dbmodels.firewall import ChainMapping
            ChainMapping.objects.update_or_create(
                interface=name, defaults={"chain": chain}
            )
            try:
                from raspsec.services.firewall import FirewallService
                FirewallService.apply()
            except Exception:
                pass

        logger.log(f"Auto-connected {name} (chain={chain})")

    @staticmethod
    def sync_current_interfaces():
        """Detect currently connected interfaces and register any unknown ones.

        Called at startup and when listing interfaces to auto-register new adapters.
        Handles both ethX and wlanX interfaces.
        """
        ret, out = Exec.execute("/sbin/ip -o link show", raise_error=False)
        if ret != 0:
            return

        # Built-in interfaces (driver-detected, index 0)
        BUILTIN_NAMES = {"eth0", "wlan0"}

        import re
        for line in out.strip().splitlines():
            match = re.match(r"^\d+:\s+(\S+?)(?:@\S+)?:\s+<([^>]*)>", line)
            if not match:
                continue
            name = match.group(1)

            # Track eth, wlan, and usb interfaces (skip usb0 = g_ether gadget)
            if not (name.startswith("eth") or name.startswith("wlan") or name.startswith("usb")):
                continue
            if name == "lo" or name == "usb0":
                continue

            mac_match = re.search(r"link/\S+\s+([\da-fA-F:]{17})", line)
            if not mac_match:
                continue
            mac = mac_match.group(1).lower()

            # Skip all-zeros MAC (interface not ready)
            if mac == "00:00:00:00:00:00":
                continue

            config = IfaceNamesService.get_config()
            interfaces = config.get("interfaces", {})

            if name in interfaces:
                # Already registered with this name — update MAC if needed
                if interfaces[name].get("mac", "").lower() != mac:
                    interfaces[name]["mac"] = mac
                    save_config(CONFIG_FILE, {"interfaces": interfaces})
                # For non-builtin interfaces, check if they need auto-connect
                # (e.g. dongle was unplugged and replugged)
                if not interfaces[name].get("builtin"):
                    dhcp_cfg = load_config("dhcp_clients.yml", {"interfaces": {}})
                    if not dhcp_cfg.get("interfaces", {}).get(name, False):
                        # Not yet configured as DHCP client — apply policy
                        IfaceNamesService._apply_auto_connect(name)
                        # If policy is none, ensure ipv4_mode reflects that
                        policy = IfaceNamesService.get_policy()
                        if policy.get("mode") != "auto_connect":
                            ipv4_modes = load_config("ipv4_modes.yml", {"interfaces": {}}).get("interfaces", {})
                            ipv4_modes[name] = "none"
                            save_config("ipv4_modes.yml", {"interfaces": ipv4_modes})
                continue

            # Check if this MAC is registered under a different name
            existing_name = IfaceNamesService.get_name_for_mac(mac)
            if existing_name:
                # MAC known but name doesn't match — udev will fix it next plug
                continue

            # New unknown interface — register it
            if name in BUILTIN_NAMES:
                IfaceNamesService.register_builtin(name, mac)
            else:
                # For USB adapters that already got a name from the fallback rule,
                # register them with their current name
                interfaces[name] = {
                    "mac": mac,
                    "builtin": False,
                }
                config["interfaces"] = interfaces
                save_config(CONFIG_FILE, config)
                IfaceNamesService.write_udev_rules()
                logger.log(f"Auto-registered interface {name} ({mac})")

                # Apply dongle policy (auto-connect if configured)
                IfaceNamesService._apply_auto_connect(name)
