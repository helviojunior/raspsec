from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger
from raspsec.libs.network import write_dhcpcd, write_system_file

CONFIG_FILE = "eth_servers.yml"

DNSMASQ_PREFIX = "/etc/dnsmasq.d/090_"

DEFAULT_NETWORKING = {
    "dhcp_enabled": True,
    "interface_ip": "172.21.253.1",
    "range_start": "172.21.253.50",
    "range_end": "172.21.253.100",
    "subnet_mask": "255.255.255.0",
    "dns_mode": "system",
    "dns_servers": [],
}

# Each eth interface gets a unique /24 subnet
_SUBNET_MAP = {
    "eth0": ("172.21.253.1", "172.21.253.50", "172.21.253.100"),
    "eth1": ("172.21.252.1", "172.21.252.50", "172.21.252.100"),
    "eth2": ("172.21.251.1", "172.21.251.50", "172.21.251.100"),
    "eth3": ("172.21.250.1", "172.21.250.50", "172.21.250.100"),
}

logger = StrataLogger("EthServerService")


class EthServerService:

    @staticmethod
    def get_config():
        """Return full eth_servers config: {interfaces: {eth0: {enabled, networking: {...}}, ...}}"""
        return load_config(CONFIG_FILE, {"interfaces": {}})

    @staticmethod
    def is_server(iface_name):
        """Check if an ethernet interface is in server mode."""
        config = EthServerService.get_config()
        iface_cfg = config.get("interfaces", {}).get(iface_name, {})
        return iface_cfg.get("enabled", False)

    @staticmethod
    def get_interface_config(iface_name):
        """Get server config for a specific interface."""
        config = EthServerService.get_config()
        return config.get("interfaces", {}).get(iface_name, {})

    @staticmethod
    def _default_networking(iface_name):
        """Return default networking config for an interface."""
        defaults = _SUBNET_MAP.get(iface_name, ("172.21.253.1", "172.21.253.50", "172.21.253.100"))
        return {
            "dhcp_enabled": True,
            "interface_ip": defaults[0],
            "range_start": defaults[1],
            "range_end": defaults[2],
            "subnet_mask": "255.255.255.0",
            "dns_mode": "system",
            "dns_servers": [],
        }

    @staticmethod
    def enable_server(iface_name):
        """Enable server mode on an ethernet interface."""
        config = EthServerService.get_config()
        interfaces = config.get("interfaces", {})

        if iface_name not in interfaces or not interfaces[iface_name].get("networking"):
            interfaces[iface_name] = {
                "enabled": True,
                "networking": EthServerService._default_networking(iface_name),
            }
        else:
            interfaces[iface_name]["enabled"] = True

        config["interfaces"] = interfaces
        save_config(CONFIG_FILE, config)

        # Disable DHCP client (can't be client and server at the same time)
        from raspsec.libs.config import load_config as lc, save_config as sc
        dhcp_cfg = lc("dhcp_clients.yml", {"interfaces": {}})
        dhcp_ifaces = dhcp_cfg.get("interfaces", {})
        dhcp_ifaces[iface_name] = False
        sc("dhcp_clients.yml", {"interfaces": dhcp_ifaces})

        # Apply configs
        EthServerService._apply(iface_name, interfaces[iface_name])

        logger.log(f"Server mode enabled on {iface_name}")

    @staticmethod
    def disable_server(iface_name):
        """Disable server mode on an ethernet interface."""
        config = EthServerService.get_config()
        interfaces = config.get("interfaces", {})

        if iface_name in interfaces:
            interfaces[iface_name]["enabled"] = False

        config["interfaces"] = interfaces
        save_config(CONFIG_FILE, config)

        # Remove dnsmasq config
        dnsmasq_conf = f"{DNSMASQ_PREFIX}{iface_name}.conf"
        Exec.execute(f"sudo /bin/rm -f {dnsmasq_conf}", raise_error=False)

        # Flush IP and regenerate dhcpcd
        Exec.execute(f"sudo /sbin/ip addr flush dev {iface_name}", raise_error=False)
        write_dhcpcd()
        Exec.execute("sudo /usr/bin/systemctl restart dhcpcd.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl restart dnsmasq.service", raise_error=False)

        logger.log(f"Server mode disabled on {iface_name}")

    @staticmethod
    def save_networking(iface_name, data):
        """Save networking config for an eth server interface."""
        config = EthServerService.get_config()
        interfaces = config.get("interfaces", {})

        if iface_name not in interfaces:
            interfaces[iface_name] = {"enabled": True}

        interfaces[iface_name]["networking"] = data
        config["interfaces"] = interfaces
        save_config(CONFIG_FILE, config)

        if interfaces[iface_name].get("enabled"):
            EthServerService._apply(iface_name, interfaces[iface_name])

        logger.log(f"Networking config saved for {iface_name}")

    @staticmethod
    def _apply(iface_name, iface_config):
        """Apply server config: dhcpcd static IP + dnsmasq DHCP server."""
        write_dhcpcd()
        EthServerService._write_dnsmasq(iface_name, iface_config)

        Exec.execute("sudo /usr/bin/systemctl restart dhcpcd.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl restart dnsmasq.service", raise_error=False)

    @staticmethod
    def _write_dnsmasq(iface_name, iface_config):
        """Write dnsmasq config for an eth server interface."""
        net = iface_config.get("networking", EthServerService._default_networking(iface_name))
        dnsmasq_conf = f"{DNSMASQ_PREFIX}{iface_name}.conf"
        tag = f"{iface_name}net"

        if not net.get("dhcp_enabled"):
            content = f"# RaspSec {iface_name} - DHCP disabled\ninterface={iface_name}\n"
        else:
            gw = net["interface_ip"]
            content = (
                f"# RaspSec {iface_name} (Server Mode) configuration\n"
                f"interface={iface_name}\n"
                "domain-needed\n"
                f"dhcp-range=set:{tag},{net['range_start']},{net['range_end']},{net['subnet_mask']},12h\n"
                f"dhcp-option=tag:{tag},3,{gw}\n"
                f"dhcp-option=tag:{tag},6,{gw}\n"
            )

        logger.log(f"Writing dnsmasq config to {dnsmasq_conf}")
        write_system_file(dnsmasq_conf, content)

    @staticmethod
    def apply_config():
        """Re-apply all eth server configs on boot."""
        config = EthServerService.get_config()
        interfaces = config.get("interfaces", {})

        for iface_name, iface_cfg in interfaces.items():
            if iface_cfg.get("enabled"):
                logger.log(f"Applying server config for {iface_name} on boot...")
                EthServerService._apply(iface_name, iface_cfg)
            else:
                # Ensure dnsmasq config is removed for disabled servers
                dnsmasq_conf = f"{DNSMASQ_PREFIX}{iface_name}.conf"
                Exec.execute(f"sudo /bin/rm -f {dnsmasq_conf}", raise_error=False)
