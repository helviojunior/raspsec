from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger
from raspsec.libs.network import write_dhcpcd, write_system_file, DHCPCD_CONF
from raspsec.dbmodels.firewall import ChainMapping
from raspsec.services.bridge import BridgeService
from raspsec.services.vlan import VlanService

import os
import re

logger = StrataLogger("DevicesView")

# Interfaces managed as servers (static IP, DHCP server) — not eligible for DHCP client
MANAGED_INTERFACES = {"wlan0", "usb0"}
DHCP_CLIENT_CONFIG = "dhcp_clients.yml"


class DevicesView(APIView):
    """List all network interfaces with status, MAC, carrier, and chain."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        interfaces = _get_all_interfaces()
        chain_map = {cm.interface: cm.chain for cm in ChainMapping.objects.all()}
        vlans = VlanService.get_config().get("vlans", [])
        dhcp_clients = _get_dhcp_client_config()

        for iface in interfaces:
            iface["chain"] = chain_map.get(iface["name"], "")
            iface["managed"] = iface["name"] in MANAGED_INTERFACES
            iface["dhcp_client"] = dhcp_clients.get(iface["name"], False)

        bridge = BridgeService.get_bridge()

        return Response({
            "interfaces": interfaces,
            "vlans": vlans,
            "bridge": bridge,
        })


class DeviceToggleView(APIView):
    """Enable or disable a network interface."""
    permission_classes = [IsAuthenticated]

    def put(self, request):
        name = request.data.get("interface", "")
        enabled = request.data.get("enabled", True)

        if not _valid_iface(name):
            return Response({"detail": "Interface inválida."}, status=400)

        action = "up" if enabled else "down"
        ret, out = Exec.execute(
            f"sudo /sbin/ip link set {name} {action}",
            raise_error=False,
        )

        if ret != 0:
            return Response({"detail": f"Erro ao alterar interface: {out}"}, status=500)

        logger.log(f"Interface {name} set {action}")
        return Response({"detail": f"Interface {name} {'habilitada' if enabled else 'desabilitada'}."})


class DeviceMacView(APIView):
    """Change MAC address of a network interface."""
    permission_classes = [IsAuthenticated]

    def put(self, request):
        name = request.data.get("interface", "")
        mac = request.data.get("mac", "").strip().lower()

        if not _valid_iface(name):
            return Response({"detail": "Interface inválida."}, status=400)

        if not re.match(r"^([0-9a-f]{2}:){5}[0-9a-f]{2}$", mac):
            return Response({"detail": "MAC address inválido."}, status=400)

        # Must bring down, change MAC, bring up
        Exec.execute(f"sudo /sbin/ip link set {name} down", raise_error=False)
        ret, out = Exec.execute(
            f"sudo /sbin/ip link set {name} address {mac}",
            raise_error=False,
        )
        Exec.execute(f"sudo /sbin/ip link set {name} up", raise_error=False)

        if ret != 0:
            return Response({"detail": f"Erro ao alterar MAC: {out}"}, status=500)

        logger.log(f"MAC of {name} changed to {mac}")
        return Response({"detail": f"MAC de {name} alterado para {mac}."})


class DeviceDhcpClientView(APIView):
    """Enable or disable DHCP client on an interface."""
    permission_classes = [IsAuthenticated]

    def put(self, request):
        name = request.data.get("interface", "")
        enabled = request.data.get("enabled", False)

        if not _valid_iface(name):
            return Response({"detail": "Interface inválida."}, status=400)

        if name in MANAGED_INTERFACES:
            return Response({"detail": f"{name} é gerenciada como servidor, não pode usar DHCP client."}, status=400)

        dhcp_clients = _get_dhcp_client_config()
        dhcp_clients[name] = bool(enabled)
        save_config(DHCP_CLIENT_CONFIG, {"interfaces": dhcp_clients})

        # Regenerate dhcpcd.conf and restart
        _apply_dhcp_client_config()

        action = "habilitado" if enabled else "desabilitado"
        logger.log(f"DHCP client {action} on {name}")
        return Response({"detail": f"DHCP client {action} em {name}."})


class DeviceChainView(APIView):
    """Set firewall chain mapping for an interface."""
    permission_classes = [IsAuthenticated]

    def put(self, request):
        name = request.data.get("interface", "")
        chain = request.data.get("chain", "")

        if not _valid_iface(name):
            return Response({"detail": "Interface inválida."}, status=400)

        if chain not in ("internal", "implant", "outside", ""):
            return Response({"detail": "Chain inválida."}, status=400)

        if chain:
            ChainMapping.objects.update_or_create(
                interface=name,
                defaults={"chain": chain},
            )
        else:
            ChainMapping.objects.filter(interface=name).delete()

        # Re-apply firewall to pick up new chain mapping
        try:
            from raspsec.services.firewall import FirewallService
            FirewallService.apply()
        except Exception as e:
            logger.log(f"Failed to reapply firewall: {e}")

        logger.log(f"Chain of {name} set to '{chain}'")
        return Response({"detail": f"Chain de {name} alterada para '{chain}'."})


class BridgeView(APIView):
    """Manage network bridge between two wired ethernet interfaces."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return current bridge configuration."""
        bridge = BridgeService.get_bridge()
        # If bridge is active, check if br0 is really up on the system
        if bridge:
            ret, out = Exec.execute("/sbin/ip link show br0", raise_error=False)
            bridge["active"] = ret == 0 and "UP" in out
        return Response({"bridge": bridge})

    def post(self, request):
        """Create a new bridge."""
        port1 = request.data.get("port1", "")
        port2 = request.data.get("port2", "")

        try:
            bridge = BridgeService.create_bridge(port1, port2)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        except Exception as e:
            logger.log(f"Bridge creation failed: {e}")
            return Response({"detail": f"Erro ao criar bridge: {e}"}, status=500)

        return Response({"bridge": bridge, "detail": f"Bridge br0 criada: {port1} ↔ {port2}."})

    def delete(self, request):
        """Remove the bridge."""
        try:
            BridgeService.remove_bridge()
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        except Exception as e:
            logger.log(f"Bridge removal failed: {e}")
            return Response({"detail": f"Erro ao remover bridge: {e}"}, status=500)

        return Response({"detail": "Bridge br0 removida."})


class DeviceDetailView(APIView):
    """Get full details of a single interface for the edit page."""
    permission_classes = [IsAuthenticated]

    def get(self, request, name):
        if not _valid_iface(name):
            return Response({"detail": "Interface inválida."}, status=400)

        interfaces = _get_all_interfaces()
        iface = next((i for i in interfaces if i["name"] == name), None)
        if not iface:
            return Response({"detail": "Interface não encontrada."}, status=404)

        chain_map = {cm.interface: cm.chain for cm in ChainMapping.objects.all()}
        dhcp_clients = _get_dhcp_client_config()
        iface["chain"] = chain_map.get(name, "")
        iface["managed"] = name in MANAGED_INTERFACES
        iface["dhcp_client"] = dhcp_clients.get(name, False)

        # MTU
        try:
            with open(f"/sys/class/net/{name}/mtu") as f:
                iface["mtu"] = int(f.read().strip())
        except (OSError, IOError, ValueError):
            iface["mtu"] = 1500

        # Speed and duplex (physical only)
        iface["speed"] = ""
        iface["duplex"] = ""
        if iface["type"] == "physical":
            try:
                with open(f"/sys/class/net/{name}/speed") as f:
                    iface["speed"] = f.read().strip()
            except (OSError, IOError):
                pass
            try:
                with open(f"/sys/class/net/{name}/duplex") as f:
                    iface["duplex"] = f.read().strip()
            except (OSError, IOError):
                pass

        # Description from config
        desc_config = load_config("interface_descriptions.yml", {"interfaces": {}})
        iface["description"] = desc_config.get("interfaces", {}).get(name, "")

        return Response(iface)


class DeviceUpdateView(APIView):
    """Update interface settings (enable, description, chain, MAC, MTU, DHCP, wifi mode)."""
    permission_classes = [IsAuthenticated]

    def put(self, request, name):
        if not _valid_iface(name):
            return Response({"detail": "Interface inválida."}, status=400)

        data = request.data
        errors = []

        # Enable/disable
        if "enabled" in data:
            action = "up" if data["enabled"] else "down"
            ret, out = Exec.execute(f"sudo /sbin/ip link set {name} {action}", raise_error=False)
            if ret != 0:
                errors.append(f"Erro ao alterar estado: {out}")

        # Description
        if "description" in data:
            desc_config = load_config("interface_descriptions.yml", {"interfaces": {}})
            descs = desc_config.get("interfaces", {})
            descs[name] = data["description"]
            save_config("interface_descriptions.yml", {"interfaces": descs})

        # Chain
        if "chain" in data:
            chain = data["chain"]
            if chain and chain in ("internal", "implant", "outside"):
                ChainMapping.objects.update_or_create(interface=name, defaults={"chain": chain})
            elif chain == "":
                ChainMapping.objects.filter(interface=name).delete()
            try:
                from raspsec.services.firewall import FirewallService
                FirewallService.apply()
            except Exception as e:
                errors.append(f"Erro ao aplicar firewall: {e}")

        # MAC
        if "mac" in data:
            mac = data["mac"].strip().lower()
            if re.match(r"^([0-9a-f]{2}:){5}[0-9a-f]{2}$", mac):
                Exec.execute(f"sudo /sbin/ip link set {name} down", raise_error=False)
                ret, out = Exec.execute(f"sudo /sbin/ip link set {name} address {mac}", raise_error=False)
                Exec.execute(f"sudo /sbin/ip link set {name} up", raise_error=False)
                if ret != 0:
                    errors.append(f"Erro ao alterar MAC: {out}")
            else:
                errors.append("MAC address inválido.")

        # MTU
        if "mtu" in data:
            mtu = int(data["mtu"]) if str(data["mtu"]).isdigit() else 0
            if 68 <= mtu <= 9000:
                ret, out = Exec.execute(f"sudo /sbin/ip link set {name} mtu {mtu}", raise_error=False)
                if ret != 0:
                    errors.append(f"Erro ao alterar MTU: {out}")
            elif mtu != 0:
                errors.append("MTU deve estar entre 68 e 9000.")

        # DHCP client
        if "dhcp_client" in data and name not in MANAGED_INTERFACES:
            dhcp_clients = _get_dhcp_client_config()
            dhcp_clients[name] = bool(data["dhcp_client"])
            save_config(DHCP_CLIENT_CONFIG, {"interfaces": dhcp_clients})
            _apply_dhcp_client_config()

        # WiFi mode
        if "wifi_mode" in data:
            mode = data["wifi_mode"]
            if mode in ("ap", "client"):
                current_modes = _get_wifi_modes()
                current_mode = current_modes.get(name, "none")
                if current_mode != mode:
                    try:
                        if current_mode == "ap":
                            from raspsec.services.wifi import WifiService
                            config = WifiService.get_config()
                            config["ap"]["enabled"] = False
                            WifiService.save_ap(config["ap"])
                        elif current_mode == "client":
                            from raspsec.services.wifi_client import WifiClientService
                            WifiClientService.disconnect(name)
                        if mode == "ap":
                            from raspsec.services.wifi import WifiService
                            config = WifiService.get_config()
                            config["ap"]["enabled"] = True
                            WifiService.save_ap(config["ap"])
                    except Exception as e:
                        errors.append(f"Erro ao alterar modo WiFi: {e}")

        if errors:
            return Response({"detail": "; ".join(errors)}, status=400)

        logger.log(f"Interface {name} updated: {list(data.keys())}")
        return Response({"detail": f"Interface {name} atualizada com sucesso."})


class DeviceWifiModeView(APIView):
    """Switch a wireless interface between AP and Client mode."""
    permission_classes = [IsAuthenticated]

    def put(self, request):
        name = request.data.get("interface", "")
        mode = request.data.get("mode", "")  # "ap" or "client"

        if not _valid_iface(name):
            return Response({"detail": "Interface inválida."}, status=400)
        if mode not in ("ap", "client"):
            return Response({"detail": "Modo inválido. Use 'ap' ou 'client'."}, status=400)

        current_modes = _get_wifi_modes()
        current_mode = current_modes.get(name, "none")

        if current_mode == mode:
            return Response({"detail": f"{name} já está em modo {mode.upper()}."})

        try:
            if current_mode == "ap":
                # Stop AP and persist disabled state
                from raspsec.services.wifi import WifiService
                config = WifiService.get_config()
                config["ap"]["enabled"] = False
                WifiService.save_ap(config["ap"])
                logger.log(f"Stopped AP on {name}")
            elif current_mode == "client":
                # Stop client on this interface
                from raspsec.services.wifi_client import WifiClientService
                WifiClientService.disconnect(name)
                logger.log(f"Disconnected client on {name}")

            if mode == "ap":
                from raspsec.services.wifi import WifiService
                config = WifiService.get_config()
                config["ap"]["enabled"] = True
                WifiService.save_ap(config["ap"])
                logger.log(f"Started AP on {name}")
            # client mode: don't auto-connect, just ensure AP is stopped
            # user will connect via WiFi Client tab

        except Exception as e:
            logger.log(f"Failed to switch {name} to {mode}: {e}")
            return Response({"detail": f"Erro ao alternar modo: {e}"}, status=500)

        label = "Access Point" if mode == "ap" else "Client"
        return Response({"detail": f"{name} alterada para modo {label}."})


def _valid_iface(name):
    """Validate interface name to prevent injection."""
    return bool(name) and re.match(r"^[a-zA-Z0-9._-]+$", name)


def _get_all_interfaces():
    """Get all network interfaces with IP, MAC, state, and carrier."""
    interfaces = []

    ret, out = Exec.execute("/sbin/ip -o link show", raise_error=False)
    if ret != 0:
        return interfaces

    iface_data = {}
    for line in out.strip().splitlines():
        match = re.match(r"^\d+:\s+(\S+?)(?:@\S+)?:\s+<([^>]*)>.*state\s+(\S+)", line)
        if not match:
            continue
        name = match.group(1)
        if name == "lo":
            continue
        flags = match.group(2)
        state = match.group(3)
        mac_match = re.search(r"link/\S+\s+([\da-fA-F:]{17})", line)
        mac = mac_match.group(1) if mac_match else ""

        # Detect interface type
        itype = "physical"
        if name.startswith("br"):
            itype = "bridge"
        elif "." in name:
            itype = "vlan"
        elif name.startswith("usb"):
            itype = "usb"
        elif name.startswith("wlan"):
            itype = "wireless"

        iface_data[name] = {
            "name": name,
            "type": itype,
            "mac": mac,
            "ip": "",
            "state": state,
            "up": "UP" in flags,
            "carrier": _has_carrier(name),
        }

    # Get IPs
    ret, out = Exec.execute("/sbin/ip -o addr show", raise_error=False)
    if ret == 0:
        for line in out.strip().splitlines():
            parts = line.split()
            if len(parts) >= 4 and parts[2] == "inet":
                name = parts[1]
                if name in iface_data and not iface_data[name]["ip"]:
                    iface_data[name]["ip"] = parts[3]

    # Add wifi mode for wireless interfaces
    wifi_modes = _get_wifi_modes()
    for name, data in iface_data.items():
        if data["type"] == "wireless":
            data["wifi_mode"] = wifi_modes.get(name, "none")

    return list(iface_data.values())


def _get_wifi_modes():
    """Detect wifi mode (ap/client/none) for each wireless interface.

    Uses `iw dev` output to check interface type:
      - type AP → ap mode (hostapd running)
      - type managed → could be client (wpa_supplicant) or idle
    Also checks if hostapd/wpa_supplicant is actually running.
    """
    modes = {}

    ret, out = Exec.execute("/usr/sbin/iw dev", raise_error=False)
    if ret != 0:
        return modes

    current_iface = None
    current_type = None
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("Interface "):
            if current_iface and current_type:
                modes[current_iface] = current_type
            current_iface = line.split()[1]
            current_type = "none"
        elif line.startswith("type "):
            iw_type = line.split()[1]
            if iw_type == "AP":
                current_type = "ap"
            elif iw_type == "managed":
                current_type = "none"  # will check wpa_supplicant below

    if current_iface and current_type:
        modes[current_iface] = current_type

    # For "none" mode interfaces, check if wpa_supplicant is running
    for iface, mode in list(modes.items()):
        if mode == "none":
            ret, out = Exec.execute(
                f"sudo /usr/bin/pgrep -f 'wpa_supplicant.*-i {iface}'",
                raise_error=False,
            )
            if ret == 0 and out.strip():
                modes[iface] = "client"

    return modes


def _has_carrier(iface):
    """Check if a network cable is connected (carrier detected)."""
    carrier_path = f"/sys/class/net/{iface}/carrier"
    try:
        with open(carrier_path) as f:
            return f.read().strip() == "1"
    except (OSError, IOError):
        return False


def _get_dhcp_client_config():
    """Load DHCP client config from YAML. Returns {iface: bool}."""
    config = load_config(DHCP_CLIENT_CONFIG, {"interfaces": {}})
    return config.get("interfaces", {})


def _apply_dhcp_client_config():
    """Regenerate dhcpcd.conf with DHCP client settings and restart."""
    from raspsec.libs.network import write_dhcpcd
    write_dhcpcd()
    Exec.execute("sudo /usr/bin/systemctl restart dhcpcd.service", raise_error=False)
