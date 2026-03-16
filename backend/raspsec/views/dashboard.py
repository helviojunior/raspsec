import os
import re

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config
from raspsec.dbmodels.service_status import ServiceStatus
from raspsec.dbmodels.firewall import ChainMapping


class DashboardView(APIView):
    """Aggregated dashboard data: system info, interfaces, clients, services."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        system = _get_system_info()
        interfaces = _get_interfaces_summary()
        wifi_info = _get_wifi_info()
        clients = _get_clients()
        services = _get_service_status()
        freq_bands = _get_frequency_bands()

        return Response({
            "system": system,
            "interfaces": interfaces,
            "wifi": wifi_info,
            "clients": clients,
            "services": services,
            "frequency_bands": freq_bands,
        })


def _get_system_info():
    """Get hostname, device model, memory, CPU temp."""
    info = {
        "hostname": "",
        "model": "",
        "memory_mb": 0,
        "memory_used_mb": 0,
        "cpu_temp": 0.0,
        "uptime": "",
    }

    # Hostname
    ret, out = Exec.execute("/usr/bin/hostname", raise_error=False)
    if ret == 0:
        info["hostname"] = out.strip()

    # Device model
    try:
        with open("/proc/device-tree/model", "r") as f:
            info["model"] = f.read().strip().rstrip("\x00")
    except (OSError, IOError):
        info["model"] = "Unknown Device"

    # Memory (total + used)
    try:
        meminfo = {}
        with open("/proc/meminfo", "r") as f:
            for line in f:
                m = re.match(r"(\w+):\s+(\d+)", line)
                if m:
                    meminfo[m.group(1)] = int(m.group(2))
        total = meminfo.get("MemTotal", 0)
        available = meminfo.get("MemAvailable", 0)
        info["memory_mb"] = round(total / 1024)
        info["memory_used_mb"] = round((total - available) / 1024)
    except (OSError, IOError):
        pass

    # CPU temperature
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            info["cpu_temp"] = round(int(f.read().strip()) / 1000, 1)
    except (OSError, IOError):
        pass

    # Uptime
    ret, out = Exec.execute("/usr/bin/uptime -p", raise_error=False)
    if ret == 0:
        info["uptime"] = out.strip()

    return info


def _get_interfaces_summary():
    """Get all network interfaces with state, IP, MAC, type, chain, carrier."""
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

        itype = "physical"
        if "." in name:
            itype = "vlan"
        elif name.startswith("usb"):
            itype = "usb"
        elif name.startswith("wlan"):
            itype = "wireless"
        elif name.startswith("ppp") or name.startswith("wwan"):
            itype = "cellular"

        carrier = False
        try:
            with open(f"/sys/class/net/{name}/carrier") as f:
                carrier = f.read().strip() == "1"
        except (OSError, IOError):
            pass

        iface_data[name] = {
            "name": name,
            "type": itype,
            "mac": mac,
            "ip": "",
            "state": state,
            "up": "UP" in flags,
            "carrier": carrier,
            "chain": "",
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

    # VLAN carrier follows parent interface carrier
    for name, data in iface_data.items():
        if data["type"] == "vlan" and "." in name:
            parent = name.split(".")[0]
            if parent in iface_data:
                data["carrier"] = iface_data[parent]["carrier"]

    # Add chain mappings
    chain_map = {cm.interface: cm.chain for cm in ChainMapping.objects.all()}
    for name, data in iface_data.items():
        data["chain"] = chain_map.get(name, "")

    return list(iface_data.values())


def _get_wifi_info():
    """Get WiFi AP information from config."""
    config = load_config("managment_ap.yml", {})
    ap = config.get("ap", {})
    networking = config.get("networking", {})

    return {
        "ssid": ap.get("ssid", ""),
        "enabled": ap.get("enabled", False),
        "interface_ip": networking.get("interface_ip", ""),
        "subnet_mask": networking.get("subnet_mask", ""),
    }


def _get_clients():
    """Count connected clients per interface."""
    wifi_clients = 0

    # WiFi clients via iw station dump
    ret, out = Exec.execute("sudo /usr/sbin/iw dev wlan0 station dump", raise_error=False)
    if ret == 0:
        wifi_clients = out.count("Station ")

    # Count neighbors per interface (excludes FAILED state)
    clients_by_iface = {}
    ret, out = Exec.execute("/sbin/ip neigh show", raise_error=False)
    if ret == 0:
        for line in out.strip().splitlines():
            # Skip entries with FAILED state (no real client)
            if "FAILED" in line:
                continue
            # Extract dev name: "IP dev IFACE lladdr MAC STATE"
            dev_match = re.search(r"\bdev\s+(\S+)", line)
            if not dev_match:
                continue
            iface = dev_match.group(1)
            # Skip loopback
            if iface == "lo":
                continue
            # Skip wlan0 — those are counted via iw station dump
            if iface == "wlan0":
                continue
            clients_by_iface[iface] = clients_by_iface.get(iface, 0) + 1

    lan_clients = sum(clients_by_iface.values())

    return {
        "wifi": wifi_clients,
        "lan": lan_clients,
        "by_interface": clients_by_iface,
    }


def _get_service_status():
    """Get status of key services for the dashboard."""
    statuses = {}

    # AP status (hostapd)
    ret, out = Exec.execute(
        "sudo /usr/bin/systemctl is-active hostapd.service",
        raise_error=False,
    )
    statuses["ap"] = out.strip() == "active"

    # Firewall — check if iptables has RASPSEC chains active
    ret, out = Exec.execute(
        "sudo /usr/sbin/iptables -L RASPSEC_FIREWALL -n",
        raise_error=False,
    )
    statuses["firewall"] = ret == 0

    # VPN (check common VPN interfaces)
    vpn_active = False
    for vpn_iface in ["tun0", "wg0", "ppp0"]:
        ret, _ = Exec.execute(
            f"/sbin/ip link show {vpn_iface}",
            raise_error=False,
        )
        if ret == 0:
            vpn_active = True
            break
    statuses["vpn"] = vpn_active

    # USB Gadget — check if usb0 interface is up
    ret, out = Exec.execute(
        "/sbin/ip link show usb0",
        raise_error=False,
    )
    statuses["usb_gadget"] = ret == 0 and "UP" in out

    return statuses


def _get_frequency_bands():
    """Detect active WiFi frequency band."""
    bands = {"2.4G": False, "5G": False}

    ret, out = Exec.execute("sudo /usr/sbin/iw dev wlan0 info", raise_error=False)
    if ret == 0:
        freq_match = re.search(r"channel\s+\d+\s+\((\d+)\s+MHz\)", out)
        if freq_match:
            freq = int(freq_match.group(1))
            if freq < 3000:
                bands["2.4G"] = True
            else:
                bands["5G"] = True

    return bands
