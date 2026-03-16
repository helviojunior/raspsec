from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger
from raspsec.libs.network import write_dhcpcd, write_system_file, DHCPCD_CONF
from raspsec.dbmodels.firewall import ChainMapping
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

        return Response({
            "interfaces": interfaces,
            "vlans": vlans,
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
        if "." in name:
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

    return list(iface_data.values())


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
