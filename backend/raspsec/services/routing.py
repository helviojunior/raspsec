from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger

CONFIG_FILE = "routing.yml"

DEFAULT_CONFIG = {
    "gateways": [],
    # Each gateway entry:
    # {
    #     "gateway": "10.3.141.1",
    #     "interface": "wlan0",
    #     "enabled": True,
    #     "metric": 0,
    # }
}

logger = StrataLogger("RoutingService")


class RoutingService:

    @staticmethod
    def get_config():
        return load_config(CONFIG_FILE, DEFAULT_CONFIG)

    @staticmethod
    def save_gateways(gateways):
        """Save gateway list (ordered by priority) and apply."""
        config = {"gateways": gateways}
        save_config(CONFIG_FILE, config)
        RoutingService.apply_routes()

    @staticmethod
    def apply_routes():
        """Read saved config and enforce default gateway routes."""
        config = RoutingService.get_config()
        gateways = config.get("gateways", [])

        if not gateways:
            return

        logger.log("Applying routing configuration...")

        # Get current default routes
        current = RoutingService._get_current_defaults()

        # Remove all current default routes
        for route in current:
            Exec.execute(
                f"sudo /sbin/ip route del default via {route['gateway']} dev {route['interface']}",
                raise_error=False,
            )

        # Re-add enabled gateways in priority order (lowest metric = highest priority)
        base_metric = 100
        for i, gw in enumerate(gateways):
            if not gw.get("enabled", True):
                continue
            metric = base_metric + i
            Exec.execute(
                f"sudo /sbin/ip route add default via {gw['gateway']} dev {gw['interface']} metric {metric}",
                raise_error=False,
            )

        logger.log("Routing configuration applied.")

    @staticmethod
    def check_and_enforce():
        """Called by watchdog — verify current routes match config, re-apply if not."""
        config = RoutingService.get_config()
        gateways = config.get("gateways", [])

        if not gateways:
            return

        current = RoutingService._get_current_defaults()

        # Build expected state
        expected = []
        base_metric = 100
        for i, gw in enumerate(gateways):
            if not gw.get("enabled", True):
                continue
            expected.append({
                "gateway": gw["gateway"],
                "interface": gw["interface"],
                "metric": str(base_metric + i),
            })

        # Compare: same gateways in same order with same metrics?
        current_keys = [(r["gateway"], r["interface"], r.get("metric", "0")) for r in current]
        expected_keys = [(r["gateway"], r["interface"], r["metric"]) for r in expected]

        if current_keys != expected_keys:
            logger.log("Route drift detected, re-applying...")
            RoutingService.apply_routes()

    @staticmethod
    def _get_current_defaults():
        """Get current default routes from the system."""
        ret, out = Exec.execute(
            "/sbin/ip -o route show default",
            raise_error=False,
        )
        if ret != 0:
            return []

        routes = []
        for line in out.strip().splitlines():
            if not line.strip():
                continue
            parts = line.split()
            gw = ""
            iface = ""
            metric = "0"
            for j, p in enumerate(parts):
                if p == "via" and j + 1 < len(parts):
                    gw = parts[j + 1]
                elif p == "dev" and j + 1 < len(parts):
                    iface = parts[j + 1]
                elif p == "metric" and j + 1 < len(parts):
                    metric = parts[j + 1]
            if gw:
                routes.append({"gateway": gw, "interface": iface, "metric": metric})

        # Sort by metric
        routes.sort(key=lambda r: int(r.get("metric", "0")))
        return routes
