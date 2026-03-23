import re

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger

CONFIG_FILE = "bridge.yml"

DEFAULT_CONFIG = {
    "bridge": None,
    # When active:
    # {
    #     "name": "br0",
    #     "port1": "eth0",
    #     "port2": "eth2",
    #     "enabled": True,
    # }
}

logger = StrataLogger("BridgeService")

IFACE_RE = re.compile(r"^eth\d+$")

SYSCTL_BRIDGE = {
    "net.bridge.bridge-nf-call-ip6tables": "0",
    "net.bridge.bridge-nf-call-iptables": "0",
    "net.bridge.bridge-nf-call-arptables": "0",
}


class BridgeService:

    @staticmethod
    def get_config():
        return load_config(CONFIG_FILE, DEFAULT_CONFIG)

    @staticmethod
    def get_bridge():
        """Return the current bridge config dict, or None."""
        config = BridgeService.get_config()
        return config.get("bridge")

    @staticmethod
    def create_bridge(port1, port2):
        """Create a bridge between two wired ethernet interfaces."""
        BridgeService._validate(port1, port2)

        # Check no bridge already exists
        current = BridgeService.get_bridge()
        if current:
            raise ValueError(
                f"Já existe uma bridge ativa ({current['name']}: "
                f"{current['port1']} + {current['port2']}). Remova antes de criar outra."
            )

        bridge = {
            "name": "br0",
            "port1": port1,
            "port2": port2,
            "enabled": True,
        }

        # Disable eth server mode on member ports (can't serve DHCP on bridge members)
        from raspsec.services.eth_server import EthServerService
        for port in [port1, port2]:
            if EthServerService.is_server(port):
                EthServerService.disable_server(port)
                logger.log(f"Disabled eth server mode on {port} (bridge member)")

        save_config(CONFIG_FILE, {"bridge": bridge})
        BridgeService._apply_bridge(bridge)

        logger.log(f"Bridge br0 created: {port1} <-> {port2}")
        return bridge

    @staticmethod
    def remove_bridge():
        """Tear down the bridge and restore interfaces."""
        current = BridgeService.get_bridge()
        if not current:
            raise ValueError("Nenhuma bridge configurada.")

        BridgeService._teardown_bridge(current)
        save_config(CONFIG_FILE, {"bridge": None})
        logger.log("Bridge br0 removed.")

    @staticmethod
    def apply_on_boot():
        """Called at startup to recreate bridge from saved config."""
        bridge = BridgeService.get_bridge()
        if not bridge or not bridge.get("enabled", False):
            return

        # Ensure eth server mode is disabled on bridge member ports
        from raspsec.services.eth_server import EthServerService
        for port in [bridge["port1"], bridge["port2"]]:
            if EthServerService.is_server(port):
                EthServerService.disable_server(port)
                logger.log(f"Disabled eth server on {port} (bridge member, boot)")

        BridgeService._apply_bridge(bridge)
        logger.log("Bridge restored on boot.")

    # ── Internal helpers ──

    @staticmethod
    def _validate(port1, port2):
        """Validate that both ports are wired ethernet interfaces."""
        if not IFACE_RE.match(port1):
            raise ValueError(f"Interface inválida: {port1}. Somente interfaces ethernet cabeada (ethX).")
        if not IFACE_RE.match(port2):
            raise ValueError(f"Interface inválida: {port2}. Somente interfaces ethernet cabeada (ethX).")
        if port1 == port2:
            raise ValueError("As duas interfaces devem ser diferentes.")

        # Verify both exist on the system
        for iface in [port1, port2]:
            ret, _ = Exec.execute(f"cat /sys/class/net/{iface}/type", raise_error=False)
            if ret != 0:
                raise ValueError(f"Interface {iface} não encontrada no sistema.")

        # Warn (but proceed) if interfaces are in server mode — they will be disabled
        from raspsec.services.eth_server import EthServerService
        for iface in [port1, port2]:
            if EthServerService.is_server(iface):
                logger.log(f"Warning: {iface} is in server mode, will be disabled for bridge")

    @staticmethod
    def _apply_bridge(bridge):
        """Create the bridge on the system."""
        name = bridge["name"]
        port1 = bridge["port1"]
        port2 = bridge["port2"]

        # Load bridge kernel module
        Exec.execute("sudo /sbin/modprobe bridge", raise_error=False)
        Exec.execute("sudo /sbin/modprobe br_netfilter", raise_error=False)

        # Disable bridge netfilter (transparent bridge, no iptables interference)
        for key, val in SYSCTL_BRIDGE.items():
            Exec.execute(f"sudo /usr/sbin/sysctl -w {key}={val}", raise_error=False)

        # Set both ports to promisc mode and bring up
        for port in [port1, port2]:
            Exec.execute(f"sudo /sbin/ip link set {port} promisc on", raise_error=False)
            Exec.execute(f"sudo /sbin/ip link set {port} up", raise_error=False)

        # Remove any IP from bridge ports (bridges shouldn't have IPs on member ports)
        for port in [port1, port2]:
            Exec.execute(f"sudo /sbin/ip addr flush dev {port}", raise_error=False)

        # Create the bridge
        Exec.execute(f"sudo /sbin/ip link add name {name} type bridge", raise_error=False)

        # Set bridge parameters (no STP, no forwarding delay)
        Exec.execute(f"sudo /sbin/ip link set {name} type bridge stp_state 0", raise_error=False)
        Exec.execute(f"sudo /sbin/ip link set {name} type bridge forward_delay 0", raise_error=False)

        # Add ports to bridge
        for port in [port1, port2]:
            Exec.execute(f"sudo /sbin/ip link set {port} master {name}", raise_error=False)

        # Bring bridge up
        Exec.execute(f"sudo /sbin/ip link set {name} up", raise_error=False)

        # Allow bridged traffic through iptables FORWARD
        Exec.execute(
            "sudo /usr/sbin/iptables -I FORWARD -m physdev --physdev-is-bridged -j ACCEPT",
            raise_error=False,
        )

        logger.log(f"Bridge {name} applied: {port1} + {port2}")

    @staticmethod
    def _teardown_bridge(bridge):
        """Remove the bridge and restore interfaces."""
        name = bridge["name"]
        port1 = bridge["port1"]
        port2 = bridge["port2"]

        # Bring bridge down
        Exec.execute(f"sudo /sbin/ip link set {name} down", raise_error=False)

        # Remove ports from bridge
        for port in [port1, port2]:
            Exec.execute(f"sudo /sbin/ip link set {port} nomaster", raise_error=False)

        # Delete the bridge interface
        Exec.execute(f"sudo /sbin/ip link delete {name} type bridge", raise_error=False)

        # Disable promisc on ports and bring them down
        for port in [port1, port2]:
            Exec.execute(f"sudo /sbin/ip link set {port} promisc off", raise_error=False)
            Exec.execute(f"sudo /sbin/ip link set {port} down", raise_error=False)

        # Remove the iptables bridge rule
        Exec.execute(
            "sudo /usr/sbin/iptables -D FORWARD -m physdev --physdev-is-bridged -j ACCEPT",
            raise_error=False,
        )

        logger.log(f"Bridge {name} torn down, ports restored.")
