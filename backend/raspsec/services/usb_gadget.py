import ipaddress

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger

CONFIG_FILE = "ethernet_over_usb.yml"
DNSMASQ_CONF = "/etc/dnsmasq.d/090_usb0.conf"

DEFAULT_CONFIG = {
    "enabled": False,
    "networking": {
        "dhcp_enabled": True,
        "interface_ip": "172.21.254.1",
        "range_start": "172.21.254.50",
        "range_end": "172.21.254.100",
        "subnet_mask": "255.255.255.0",
        "dns_mode": "system",
        "dns_servers": [],
    },
}

logger = StrataLogger("UsbGadgetService")


class UsbGadgetService:

    @staticmethod
    def get_config():
        return load_config(CONFIG_FILE, DEFAULT_CONFIG)

    @staticmethod
    def apply_config():
        """Re-apply saved configuration on boot."""
        config = UsbGadgetService.get_config()
        logger.log("Applying USB Gadget config on boot...")

        if config.get("enabled"):
            UsbGadgetService._enable_gadget(config)
        else:
            UsbGadgetService._disable_gadget()

    @staticmethod
    def save_gadget(data):
        config = UsbGadgetService.get_config()
        config["enabled"] = data.get("enabled", False)
        save_config(CONFIG_FILE, config)

        if config["enabled"]:
            UsbGadgetService._enable_gadget(config)
        else:
            UsbGadgetService._disable_gadget()

    @staticmethod
    def save_networking(data):
        config = UsbGadgetService.get_config()
        config["networking"] = data
        save_config(CONFIG_FILE, config)

        UsbGadgetService._write_dnsmasq(config)
        UsbGadgetService._apply_interface_ip(config)

        if config["enabled"]:
            UsbGadgetService._restart_dnsmasq()

    # ── USB Gadget mode ──

    @staticmethod
    def _enable_gadget(config):
        """Enable USB Ethernet gadget (dwc2 + g_ether) and configure networking."""
        logger.log("Enabling USB Gadget mode...")

        # Load dwc2 overlay and g_ether module
        Exec.execute("sudo /sbin/modprobe dwc2", raise_error=False)
        Exec.execute("sudo /sbin/modprobe g_ether", raise_error=False)

        # Ensure dtoverlay=dwc2 is in /boot/config.txt
        ret, out = Exec.execute(
            "/bin/grep -c 'dtoverlay=dwc2' /boot/firmware/config.txt",
            raise_error=False,
        )
        if out.strip() == "0" or ret != 0:
            Exec.execute(
                "echo 'dtoverlay=dwc2' | sudo /usr/bin/tee -a /boot/firmware/config.txt",
                raise_error=False,
            )

        # Ensure dwc2 and g_ether are in /etc/modules
        for module in ["dwc2", "g_ether"]:
            ret, _ = Exec.execute(
                f"/bin/grep -c '^{module}$' /etc/modules",
                raise_error=False,
            )
            if ret != 0:
                Exec.execute(
                    f"echo '{module}' | sudo /usr/bin/tee -a /etc/modules",
                    raise_error=False,
                )

        # Configure interface and DHCP
        UsbGadgetService._apply_interface_ip(config)
        UsbGadgetService._write_dnsmasq(config)
        UsbGadgetService._restart_dnsmasq()

        logger.log("USB Gadget mode enabled.")

    @staticmethod
    def _disable_gadget():
        """Disable USB Ethernet gadget."""
        logger.log("Disabling USB Gadget mode...")

        Exec.execute("sudo /sbin/modprobe -r g_ether", raise_error=False)

        # Remove dnsmasq config for usb0
        Exec.execute(f"sudo /bin/rm -f {DNSMASQ_CONF}", raise_error=False)
        UsbGadgetService._restart_dnsmasq()

        logger.log("USB Gadget mode disabled.")

    # ── Interface IP ──

    @staticmethod
    def _apply_interface_ip(config):
        """Set static IP on usb0 interface."""
        net = config["networking"]
        ip = net["interface_ip"]
        mask = net["subnet_mask"]
        prefix = ipaddress.IPv4Network(f"0.0.0.0/{mask}").prefixlen

        # Flush and set IP
        Exec.execute("sudo /sbin/ip addr flush dev usb0", raise_error=False)
        Exec.execute(
            f"sudo /sbin/ip addr add {ip}/{prefix} dev usb0",
            raise_error=False,
        )
        Exec.execute("sudo /sbin/ip link set usb0 up", raise_error=False)

    # ── dnsmasq (DHCP server for usb0) ──

    @staticmethod
    def _write_dnsmasq(config):
        net = config["networking"]

        if not net.get("dhcp_enabled"):
            content = "# RaspSec usb0 - DHCP disabled\ninterface=usb0\n"
        else:
            dns_option = "9.9.9.9,1.1.1.1"
            if net.get("dns_mode") == "custom" and net.get("dns_servers"):
                dns_option = ",".join(net["dns_servers"])

            content = (
                "# RaspSec usb0 (Ethernet over USB) configuration\n"
                "interface=usb0\n"
                "domain-needed\n"
                f"dhcp-range={net['range_start']},{net['range_end']},{net['subnet_mask']},12h\n"
                f"dhcp-option=6,{dns_option}\n"
            )

        logger.log(f"Writing dnsmasq config to {DNSMASQ_CONF}")
        UsbGadgetService._write_system_file(DNSMASQ_CONF, content)

    @staticmethod
    def _restart_dnsmasq():
        Exec.execute("sudo /usr/bin/systemctl restart dnsmasq.service", raise_error=False)

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
