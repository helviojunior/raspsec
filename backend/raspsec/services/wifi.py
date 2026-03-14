import ipaddress

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger

CONFIG_FILE = "managment_ap.yml"

HOSTAPD_CONF = "/etc/hostapd/hostapd.conf"
DNSMASQ_CONF = "/etc/dnsmasq.d/090_wlan0.conf"
DHCPCD_CONF = "/etc/dhcpcd.conf"

DEFAULT_CONFIG = {
    "ap": {
        "ssid": "RaspSec",
        "bssid": "",
        "password": "@Pass123",
        "hidden": False,
        "enabled": False,
    },
    "networking": {
        "dhcp_enabled": True,
        "interface_ip": "172.21.255.1",
        "range_start": "172.21.255.50",
        "range_end": "172.21.255.100",
        "subnet_mask": "255.255.255.0",
        "dns_mode": "system",
        "dns_servers": [],
    },
}

logger = StrataLogger("WifiService")


class WifiService:

    @staticmethod
    def get_config():
        return load_config(CONFIG_FILE, DEFAULT_CONFIG)

    @staticmethod
    def apply_config():
        """Re-apply saved configuration on boot."""
        config = WifiService.get_config()
        logger.log("Applying WiFi config on boot...")

        WifiService._write_hostapd(config)
        WifiService._write_dhcpcd(config)
        WifiService._write_dnsmasq(config)

        if config["ap"].get("enabled"):
            WifiService._start_ap(config)
        else:
            WifiService._stop_ap()

    @staticmethod
    def save_ap(data):
        config = WifiService.get_config()
        config["ap"] = data
        save_config(CONFIG_FILE, config)

        WifiService._write_hostapd(config)

        if data.get("enabled"):
            WifiService._start_ap(config)
        else:
            WifiService._stop_ap()

    @staticmethod
    def save_networking(data):
        config = WifiService.get_config()
        config["networking"] = data
        save_config(CONFIG_FILE, config)

        WifiService._write_dhcpcd(config)
        WifiService._write_dnsmasq(config)

        if config["ap"].get("enabled"):
            WifiService._restart_services()

    # ── hostapd.conf ──

    @staticmethod
    def _write_hostapd(config):
        ap = config["ap"]
        lines = [
            "driver=nl80211",
            "ctrl_interface=/var/run/hostapd",
            "ctrl_interface_group=0",
            "beacon_int=100",
            "auth_algs=1",
            "wpa_key_mgmt=WPA-PSK",
            f"ssid={ap['ssid']}",
            "channel=1",
            "hw_mode=g",
            f"wpa_passphrase={ap['password']}",
            "interface=wlan0",
            "wpa=2",
            "wpa_pairwise=CCMP",
            "country_code=BR",
            f"ignore_broadcast_ssid={'1' if ap.get('hidden') else '0'}",
        ]

        if ap.get("bssid"):
            lines.append(f"bssid={ap['bssid']}")

        content = "\n".join(lines) + "\n"

        logger.log(f"Writing hostapd config to {HOSTAPD_CONF}")
        WifiService._write_system_file(HOSTAPD_CONF, content)

    # ── dhcpcd.conf (interface IP) ──

    @staticmethod
    def _write_dhcpcd(config):
        net = config["networking"]
        ip = net["interface_ip"]
        mask = net["subnet_mask"]

        prefix = ipaddress.IPv4Network(f"0.0.0.0/{mask}").prefixlen

        dns_line = "9.9.9.9 1.1.1.1"
        if net.get("dns_mode") == "custom" and net.get("dns_servers"):
            dns_line = " ".join(net["dns_servers"])

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
            "# RaspSec wlan0 configuration\n"
            "interface wlan0\n"
            f"static ip_address={ip}/{prefix}\n"
            f"static routers={ip}\n"
            f"static domain_name_servers={dns_line}\n"
            "nogateway\n"
        )

        logger.log(f"Writing dhcpcd config to {DHCPCD_CONF}")
        WifiService._write_system_file(DHCPCD_CONF, content)

    # ── dnsmasq (DHCP server) ──

    @staticmethod
    def _write_dnsmasq(config):
        net = config["networking"]

        if not net.get("dhcp_enabled"):
            content = "# RaspSec wlan0 - DHCP disabled\ninterface=wlan0\n"
        else:
            dns_option = "9.9.9.9,1.1.1.1"
            if net.get("dns_mode") == "custom" and net.get("dns_servers"):
                dns_option = ",".join(net["dns_servers"])

            content = (
                "# RaspSec wlan0 configuration\n"
                "interface=wlan0\n"
                "domain-needed\n"
                f"dhcp-range={net['range_start']},{net['range_end']},{net['subnet_mask']},12h\n"
                f"dhcp-option=6,{dns_option}\n"
            )

        logger.log(f"Writing dnsmasq config to {DNSMASQ_CONF}")
        WifiService._write_system_file(DNSMASQ_CONF, content)

    # ── Service management ──

    @staticmethod
    def _start_ap(config):
        logger.log("Starting Access Point services...")

        WifiService._write_dhcpcd(config)
        WifiService._write_dnsmasq(config)

        Exec.execute("sudo /usr/bin/systemctl stop hostapd.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl stop dnsmasq.service", raise_error=False)

        Exec.execute("sudo /usr/bin/systemctl start hostapd.service")
        Exec.execute("sudo /usr/bin/systemctl start dnsmasq.service")

        logger.log("Access Point started.")

    @staticmethod
    def _stop_ap():
        logger.log("Stopping Access Point services...")
        Exec.execute("sudo /usr/bin/systemctl stop hostapd.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl stop dnsmasq.service", raise_error=False)
        logger.log("Access Point stopped.")

    @staticmethod
    def _restart_services():
        logger.log("Restarting network services...")
        Exec.execute("sudo /usr/bin/systemctl restart dnsmasq.service", raise_error=False)
        logger.log("Network services restarted.")

    # ── Helpers ──

    @staticmethod
    def _write_system_file(path, content):
        """Write content to a system file via sudo."""
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".conf", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        Exec.execute(f"sudo /bin/cp {tmp_path} {path}")
        Exec.execute(f"/bin/rm -f {tmp_path}", raise_error=False)
