"""
Shared network persistence utilities.

Writes OS-level config files (dhcpcd.conf) from YAML configs so that
network services work correctly on boot without the backend.
"""
import ipaddress
import tempfile

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config
from raspsec.libs.log import StrataLogger

DHCPCD_CONF = "/etc/dhcpcd.conf"

logger = StrataLogger("NetworkPersist")

_WIFI_NET_DEFAULTS = {
    "interface_ip": "172.21.255.1",
    "subnet_mask": "255.255.255.0",
    "dns_mode": "system",
    "dns_servers": [],
}

_USB_NET_DEFAULTS = {
    "interface_ip": "172.21.254.1",
    "subnet_mask": "255.255.255.0",
    "dns_mode": "system",
    "dns_servers": [],
}


def write_dhcpcd():
    """Write complete /etc/dhcpcd.conf from wifi and usb YAML configs.

    Both wlan0 and usb0 sections are derived from the persisted YAML files.
    eth0 is denied DHCP (no client, no server).
    """
    wifi = load_config("managment_ap.yml", {})
    usb = load_config("ethernet_over_usb.yml", {})

    content = (
        "# RaspSec default configuration\n"
        "hostname\n"
        "clientid\n"
        "persistent\n"
        "option rapid_commit\n"
        "option domain_name_servers, domain_name, domain_search, host_name\n"
        "option classless_static_routes\n"
        "option ntp_servers\n"
        "require dhcp_server_identifier\n"
        "slaac private\n"
        "nohook lookup-hostname\n"
        "\n"
        "# Disable DHCP client on eth0 (wired uplink — managed externally)\n"
        "denyinterfaces eth0\n"
    )

    # wlan0 section (always present — interface keeps its IP even with AP off)
    wnet = wifi.get("networking", _WIFI_NET_DEFAULTS)
    content += _interface_section("wlan0", wnet)

    # usb0 section (only when USB gadget is enabled)
    if usb.get("enabled"):
        unet = usb.get("networking", _USB_NET_DEFAULTS)
        content += _interface_section("usb0", unet)

    # Add DHCP client interfaces (e.g., eth0 when user enables DHCP)
    dhcp_cfg = load_config("dhcp_clients.yml", {"interfaces": {}})
    dhcp_ifaces = dhcp_cfg.get("interfaces", {})

    # Build deny list: interfaces that are NOT DHCP clients
    deny_list = []
    for iface_name, enabled in dhcp_ifaces.items():
        if not enabled:
            continue
    # eth0 gets DHCP client only if explicitly enabled
    if not dhcp_ifaces.get("eth0", False):
        # Already denied above in the base config
        pass
    else:
        # Remove the denyinterfaces eth0 line since user wants DHCP client
        content = content.replace("denyinterfaces eth0\n", "")

    # Add any other DHCP-client-enabled interfaces (VLANs, etc.)
    for iface_name, enabled in dhcp_ifaces.items():
        if enabled and iface_name != "eth0":
            content += (
                f"\n# DHCP client on {iface_name}\n"
                f"interface {iface_name}\n"
            )

    logger.log(f"Writing dhcpcd config to {DHCPCD_CONF}")
    write_system_file(DHCPCD_CONF, content)


def _interface_section(iface, net):
    """Generate a dhcpcd interface stanza."""
    ip = net.get("interface_ip", "172.21.255.1")
    mask = net.get("subnet_mask", "255.255.255.0")
    prefix = ipaddress.IPv4Network(f"0.0.0.0/{mask}").prefixlen

    dns_line = "9.9.9.9 1.1.1.1"
    if net.get("dns_mode") == "custom" and net.get("dns_servers"):
        dns_line = " ".join(net["dns_servers"])

    return (
        f"\n# RaspSec {iface} configuration\n"
        f"interface {iface}\n"
        f"static ip_address={ip}/{prefix}\n"
        f"static routers={ip}\n"
        f"static domain_name_servers={dns_line}\n"
        "nogateway\n"
    )


def write_system_file(path, content):
    """Write content to a system file via sudo."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".conf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    Exec.execute(f"sudo /bin/cp {tmp_path} {path}")
    Exec.execute(f"/bin/rm -f {tmp_path}", raise_error=False)
