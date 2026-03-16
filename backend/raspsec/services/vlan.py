import re

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger
from raspsec.dbmodels.firewall import ChainMapping

CONFIG_FILE = "vlans.yml"

DEFAULT_CONFIG = {
    "vlans": [],
    # Each VLAN entry:
    # {
    #     "parent": "eth0",
    #     "vlan_id": 90,
    #     "ip_address": "10.0.90.1/24",
    #     "enabled": True,
    # }
}

logger = StrataLogger("VlanService")

VLAN_ID_RE = re.compile(r"^\d+$")


class VlanService:

    @staticmethod
    def get_config():
        return load_config(CONFIG_FILE, DEFAULT_CONFIG)

    @staticmethod
    def get_system_vlans():
        """List VLAN interfaces currently active on the system."""
        ret, out = Exec.execute("cat /proc/net/vlan/config 2>/dev/null", raise_error=False)
        if ret != 0 or not out.strip():
            return []

        vlans = []
        for line in out.strip().splitlines()[2:]:  # skip header lines
            parts = line.split("|")
            if len(parts) >= 3:
                name = parts[0].strip()
                vlan_id = parts[1].strip()
                parent = parts[2].strip()
                vlans.append({
                    "name": name,
                    "vlan_id": int(vlan_id),
                    "parent": parent,
                })
        return vlans

    @staticmethod
    def _iface_name(parent, vlan_id):
        """Generate VLAN interface name: ethX.VLAN_ID."""
        return f"{parent}.{vlan_id}"

    @staticmethod
    def save_vlans(vlans):
        """Save VLAN list and apply."""
        # Validate
        for v in vlans:
            VlanService._validate(v)

        config = {"vlans": vlans}
        save_config(CONFIG_FILE, config)
        VlanService.apply()

    @staticmethod
    def add_vlan(data):
        """Add a single VLAN."""
        VlanService._validate(data)
        config = VlanService.get_config()
        vlans = config.get("vlans", [])

        # Check for duplicate
        for v in vlans:
            if v["parent"] == data["parent"] and v["vlan_id"] == data["vlan_id"]:
                raise ValueError(f"VLAN {data['vlan_id']} already exists on {data['parent']}")

        vlans.append(data)
        save_config(CONFIG_FILE, {"vlans": vlans})
        VlanService._create_vlan(data)

        # Inherit chain from parent interface
        iface = VlanService._iface_name(data["parent"], data["vlan_id"])
        VlanService._inherit_parent_chain(data["parent"], iface)

    @staticmethod
    def remove_vlan(parent, vlan_id):
        """Remove a VLAN by parent and VLAN ID."""
        config = VlanService.get_config()
        vlans = config.get("vlans", [])
        vlans = [v for v in vlans if not (v["parent"] == parent and v["vlan_id"] == vlan_id)]
        save_config(CONFIG_FILE, {"vlans": vlans})

        # Remove from system
        iface = VlanService._iface_name(parent, vlan_id)
        Exec.execute(f"sudo /sbin/ip link delete {iface}", raise_error=False)
        logger.log(f"Removed VLAN {iface}")

    @staticmethod
    def apply():
        """Remove all VLANs and recreate from config."""
        config = VlanService.get_config()
        vlans = config.get("vlans", [])

        logger.log("Applying VLAN configuration...")

        # Ensure 8021q module is loaded
        Exec.execute("sudo /sbin/modprobe 8021q", raise_error=False)

        # Remove existing VLANs that we manage
        current = VlanService.get_system_vlans()
        for cv in current:
            Exec.execute(f"sudo /sbin/ip link delete {cv['name']}", raise_error=False)

        # Recreate enabled VLANs
        for v in vlans:
            if v.get("enabled", True):
                VlanService._create_vlan(v)

        logger.log("VLAN configuration applied.")

    @staticmethod
    def _create_vlan(data):
        """Create a single VLAN interface on the system."""
        parent = data["parent"]
        vlan_id = data["vlan_id"]
        iface = VlanService._iface_name(parent, vlan_id)

        # Ensure parent is up
        Exec.execute(f"sudo /sbin/ip link set {parent} up", raise_error=False)

        # Create VLAN interface with proper ethX.ID naming
        Exec.execute(
            f"sudo /sbin/ip link add link {parent} name {iface} type vlan id {vlan_id}",
            raise_error=False,
        )

        # Set IP if configured
        ip_addr = data.get("ip_address", "")
        if ip_addr:
            Exec.execute(f"sudo /sbin/ip addr add {ip_addr} dev {iface}", raise_error=False)

        # Bring up
        Exec.execute(f"sudo /sbin/ip link set {iface} up", raise_error=False)

        logger.log(f"Created VLAN {iface} (ID {vlan_id} on {parent})")

    @staticmethod
    def _validate(data):
        """Validate VLAN entry."""
        parent = data.get("parent", "")
        vlan_id = data.get("vlan_id")

        if not parent:
            raise ValueError("parent interface is required")
        if not re.match(r"^(eth\d+|wlan\d+|usb\d+)$", parent):
            raise ValueError(f"Invalid parent interface: {parent}")
        if vlan_id is None or not isinstance(vlan_id, int) or vlan_id < 1 or vlan_id > 4094:
            raise ValueError(f"vlan_id must be between 1 and 4094, got: {vlan_id}")

    @staticmethod
    def _inherit_parent_chain(parent, vlan_iface):
        """Copy the firewall chain from the parent interface to the VLAN."""
        try:
            parent_chain = ChainMapping.objects.filter(interface=parent).values_list("chain", flat=True).first()
            if parent_chain:
                ChainMapping.objects.update_or_create(
                    interface=vlan_iface,
                    defaults={"chain": parent_chain},
                )
                logger.log(f"VLAN {vlan_iface} inherited chain '{parent_chain}' from {parent}")
        except Exception as e:
            logger.log(f"Failed to inherit chain for {vlan_iface}: {e}")

    @staticmethod
    def apply_on_boot():
        """Called at startup to recreate VLANs."""
        config = VlanService.get_config()
        vlans = config.get("vlans", [])
        if not vlans:
            return

        Exec.execute("sudo /sbin/modprobe 8021q", raise_error=False)
        for v in vlans:
            if v.get("enabled", True):
                VlanService._create_vlan(v)
        logger.log("VLANs restored on boot.")
