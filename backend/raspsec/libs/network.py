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

    # Build whitelist of interfaces that dhcpcd should manage
    dhcp_cfg = load_config("dhcp_clients.yml", {"interfaces": {}})
    dhcp_ifaces = dhcp_cfg.get("interfaces", {})
    no_gw_cfg = load_config("dhcp_no_gateway.yml", {"interfaces": {}})
    no_gw_ifaces = no_gw_cfg.get("interfaces", {})

    # Allowed interfaces: server-managed (wlan0 AP, usb0 gadget, eth servers) + DHCP clients
    allowed = set()

    # wlan0: AP mode gets static IP, client mode gets DHCP
    wlan0_is_dhcp_client = dhcp_ifaces.get("wlan0", False)
    if not wlan0_is_dhcp_client:
        allowed.add("wlan0")  # AP mode — managed as server
    else:
        allowed.add("wlan0")  # Client mode — DHCP

    # usb0 gadget
    if usb.get("enabled"):
        allowed.add("usb0")

    # Eth server interfaces
    eth_servers = load_config("eth_servers.yml", {"interfaces": {}})
    for iface_name, iface_cfg in eth_servers.get("interfaces", {}).items():
        if iface_cfg.get("enabled") and iface_cfg.get("networking"):
            allowed.add(iface_name)

    # Explicit DHCP client interfaces
    for iface_name, enabled in dhcp_ifaces.items():
        if enabled:
            allowed.add(iface_name)

    # Build allowinterfaces line (only these get DHCP from dhcpcd)
    allow_list = " ".join(sorted(allowed))

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
        f"# Only manage explicitly allowed interfaces\n"
        f"allowinterfaces {allow_list}\n"
    )

    # wlan0 section — only when in AP mode (static IP)
    if not wlan0_is_dhcp_client:
        wnet = wifi.get("networking", _WIFI_NET_DEFAULTS)
        content += _interface_section("wlan0", wnet)

    # usb0 section (only when USB gadget is enabled)
    if usb.get("enabled"):
        unet = usb.get("networking", _USB_NET_DEFAULTS)
        content += _interface_section("usb0", unet)

    # eth server interfaces (static IP)
    for iface_name, iface_cfg in eth_servers.get("interfaces", {}).items():
        if iface_cfg.get("enabled") and iface_cfg.get("networking"):
            content += _interface_section(iface_name, iface_cfg["networking"])

    # DHCP client interfaces with nogateway option
    for iface_name, enabled in dhcp_ifaces.items():
        if not enabled:
            continue
        no_gw = no_gw_ifaces.get(iface_name, False)
        content += (
            f"\n# DHCP client on {iface_name}{' (no default route)' if no_gw else ''}\n"
            f"interface {iface_name}\n"
        )
        if no_gw:
            content += "nogateway\n"

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
