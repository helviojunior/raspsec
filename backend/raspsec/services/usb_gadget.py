from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger
from raspsec.libs.network import write_dhcpcd, write_system_file

CONFIG_FILE = "ethernet_over_usb.yml"
DNSMASQ_CONF = "/etc/dnsmasq.d/090_usb0.conf"
MODPROBE_CONF = "/etc/modprobe.d/raspsec-usb-gadget.conf"

DEFAULT_CONFIG = {
    "enabled": True,
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

        # Persist to OS-level configs (dhcpcd for IP, dnsmasq for DHCP server)
        write_dhcpcd()
        UsbGadgetService._write_dnsmasq(config)

        if config["enabled"]:
            Exec.execute("sudo /usr/bin/systemctl restart dhcpcd.service", raise_error=False)
            Exec.execute("sudo /usr/bin/systemctl restart dnsmasq.service", raise_error=False)

    # ── USB Gadget mode ──

    @staticmethod
    def _enable_gadget(config):
        """Enable USB Ethernet gadget (dwc2 + g_ether) and configure networking."""
        logger.log("Enabling USB Gadget mode...")

        # Load dwc2 overlay
        Exec.execute("sudo /sbin/modprobe dwc2", raise_error=False)

        # Persist dtoverlay=dwc2 in peripheral mode in /boot/firmware/config.txt
        ret, out = Exec.execute(
            "/bin/grep -c 'dtoverlay=dwc2' /boot/firmware/config.txt",
            raise_error=False,
        )
        if out.strip() == "0" or ret != 0:
            Exec.execute(
                "echo 'dtoverlay=dwc2,dr_mode=peripheral' | sudo /usr/bin/tee -a /boot/firmware/config.txt",
                raise_error=False,
            )
        else:
            # Ensure existing entry uses peripheral mode
            Exec.execute(
                "sudo /usr/bin/sed -i 's/dtoverlay=dwc2.*/dtoverlay=dwc2,dr_mode=peripheral/' /boot/firmware/config.txt",
                raise_error=False,
            )

        # Persist dwc2 in /etc/modules (g_ether is managed by raspsec-usb-gadget.service)
        ret, _ = Exec.execute(
            "/bin/grep -c '^dwc2$' /etc/modules",
            raise_error=False,
        )
        if ret != 0:
            Exec.execute(
                "echo 'dwc2' | sudo /usr/bin/tee -a /etc/modules",
                raise_error=False,
            )

        # Ensure the USB gadget service is enabled and started
        Exec.execute("sudo /usr/bin/systemctl enable raspsec-usb-gadget.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl start raspsec-usb-gadget.service", raise_error=False)

        # Persist IP config in dhcpcd.conf and DHCP server in dnsmasq
        write_dhcpcd()
        UsbGadgetService._write_dnsmasq(config)

        # Restart dhcpcd to pick up new usb0 static IP
        Exec.execute("sudo /usr/bin/systemctl restart dhcpcd.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl restart dnsmasq.service", raise_error=False)

        logger.log("USB Gadget mode enabled.")

    @staticmethod
    def _disable_gadget():
        """Disable USB Ethernet gadget."""
        logger.log("Disabling USB Gadget mode...")

        Exec.execute("sudo /usr/bin/systemctl stop raspsec-usb-gadget.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl disable raspsec-usb-gadget.service", raise_error=False)
        Exec.execute("sudo /sbin/modprobe -r g_ether", raise_error=False)

        # Remove dnsmasq config for usb0
        Exec.execute(f"sudo /bin/rm -f {DNSMASQ_CONF}", raise_error=False)

        # Update dhcpcd.conf (usb0 section will be excluded since enabled=false)
        write_dhcpcd()

        Exec.execute("sudo /usr/bin/systemctl restart dhcpcd.service", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl restart dnsmasq.service", raise_error=False)

        logger.log("USB Gadget mode disabled.")

    # ── modprobe (USB gadget branding) ──

    @staticmethod
    def _get_mac_suffix():
        """Return last 6 hex digits of wlan0 MAC (uppercase), e.g. 'A1B2C3'."""
        try:
            with open("/sys/class/net/wlan0/address") as f:
                mac = f.read().strip()
            return mac.replace(":", "")[-6:].upper()
        except OSError:
            return "000000"

    @staticmethod
    def _write_modprobe_conf():
        """Write modprobe config with MAC-based product name."""
        suffix = UsbGadgetService._get_mac_suffix()
        content = (
            f'options g_ether iManufacturer="StrataSec"'
            f' iProduct="RaspSec USB-C {suffix}"'
            f' iSerialNumber="raspsec-{suffix}"\n'
        )
        logger.log(f"Writing USB gadget branding: RaspSec USB-C {suffix}")
        write_system_file(MODPROBE_CONF, content)

    # ── dnsmasq (DHCP server for usb0) ──

    @staticmethod
    def _write_dnsmasq(config):
        net = config["networking"]

        if not net.get("dhcp_enabled"):
            content = "# RaspSec usb0 - DHCP disabled\ninterface=usb0\n"
        else:
            gw = net["interface_ip"]
            content = (
                "# RaspSec usb0 (Ethernet over USB) configuration\n"
                "interface=usb0\n"
                "domain-needed\n"
                f"dhcp-range=set:usb0net,{net['range_start']},{net['range_end']},{net['subnet_mask']},12h\n"
                "# No default gateway — keeps existing gateways on the PC as primary\n"
                "dhcp-option=tag:usb0net,3\n"
                "# Routes to all IANA private networks via RaspSec\n"
                f"dhcp-option=tag:usb0net,121,10.0.0.0/8,{gw},172.16.0.0/12,{gw},192.168.0.0/16,{gw}\n"
                f"dhcp-option=tag:usb0net,6,{gw}\n"
            )

        logger.log(f"Writing dnsmasq config to {DNSMASQ_CONF}")
        write_system_file(DNSMASQ_CONF, content)
