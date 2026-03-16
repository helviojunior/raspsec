from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger
from raspsec.libs.network import write_dhcpcd, write_system_file

CONFIG_FILE = "managment_ap.yml"

HOSTAPD_CONF = "/etc/hostapd/hostapd.conf"
DNSMASQ_CONF = "/etc/dnsmasq.d/090_wlan0.conf"

FACTORY_SSID = "RaspSec"

DEFAULT_CONFIG = {
    "ap": {
        "ssid": FACTORY_SSID,
        "bssid": "",
        "password": "@Pass123",
        "hidden": False,
        "enabled": True,
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
    def _generate_unique_ssid():
        """Generate SSID from wlan0 MAC: STRATA_XXXXXXXX (last 8 hex digits)."""
        try:
            with open("/sys/class/net/wlan0/address", "r") as f:
                mac = f.read().strip()
            # e.g. dc:a6:32:99:e4:fb → 3299e4fb → STRATA_3299E4FB
            suffix = mac.replace(":", "")[-8:].upper()
            return f"STRATA_{suffix}"
        except (FileNotFoundError, IOError):
            logger.log("Could not read wlan0 MAC, keeping default SSID")
            return FACTORY_SSID

    @staticmethod
    def apply_config():
        """Re-apply saved configuration on boot."""
        config = WifiService.get_config()
        logger.log("Applying WiFi config on boot...")

        # On first boot, replace factory SSID with unique name based on MAC
        if config["ap"].get("ssid") == FACTORY_SSID:
            unique_ssid = WifiService._generate_unique_ssid()
            if unique_ssid != FACTORY_SSID:
                config["ap"]["ssid"] = unique_ssid
                save_config(CONFIG_FILE, config)
                logger.log(f"SSID set to {unique_ssid}")

        WifiService._write_hostapd(config)
        write_dhcpcd()
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

        write_dhcpcd()
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
        write_system_file(HOSTAPD_CONF, content)

    # ── dnsmasq (DHCP server) ──

    @staticmethod
    def _write_dnsmasq(config):
        net = config["networking"]

        if not net.get("dhcp_enabled"):
            content = "# RaspSec wlan0 - DHCP disabled\ninterface=wlan0\n"
        else:
            gw = net.get("interface_ip", "172.21.255.1")
            content = (
                "# RaspSec wlan0 configuration\n"
                "interface=wlan0\n"
                "domain-needed\n"
                f"dhcp-range=set:wlan0net,{net['range_start']},{net['range_end']},{net['subnet_mask']},12h\n"
                "# Routes to all IANA private networks via RaspSec\n"
                f"dhcp-option=tag:wlan0net,121,10.0.0.0/8,{gw},172.16.0.0/12,{gw},192.168.0.0/16,{gw}\n"
                f"dhcp-option=tag:wlan0net,6,{gw}\n"
            )

        logger.log(f"Writing dnsmasq config to {DNSMASQ_CONF}")
        write_system_file(DNSMASQ_CONF, content)

    # ── Service management ──

    @staticmethod
    def _start_ap(config):
        logger.log("Starting Access Point services...")

        write_dhcpcd()
        WifiService._write_dnsmasq(config)

        # Ensure wireless interface is ready before starting hostapd
        Exec.execute("sudo /usr/sbin/rfkill unblock wifi", raise_error=False)
        Exec.execute("sudo /usr/sbin/ip link set wlan0 up", raise_error=False)
        Exec.execute("sudo /usr/sbin/iw reg set BR", raise_error=False)

        Exec.execute("sudo /usr/bin/systemctl stop hostapd.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl stop dnsmasq.service", raise_error=False)

        # Persist enabled state so AP starts on next boot without backend
        Exec.execute("sudo /usr/bin/systemctl enable hostapd.service", raise_error=False)

        Exec.execute("sudo /usr/bin/systemctl start hostapd.service")
        Exec.execute("sudo /usr/bin/systemctl start dnsmasq.service")

        logger.log("Access Point started.")

    @staticmethod
    def _stop_ap():
        logger.log("Stopping Access Point services...")

        # Persist disabled state so AP stays off on next boot without backend
        Exec.execute("sudo /usr/bin/systemctl disable hostapd.service", raise_error=False)

        Exec.execute("sudo /usr/bin/systemctl stop hostapd.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl stop dnsmasq.service", raise_error=False)
        logger.log("Access Point stopped.")

    @staticmethod
    def _restart_services():
        logger.log("Restarting network services...")
        Exec.execute("sudo /usr/bin/systemctl restart dnsmasq.service", raise_error=False)
        logger.log("Network services restarted.")
