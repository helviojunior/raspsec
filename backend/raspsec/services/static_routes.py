from django.db.models import Max

from raspsec.libs.cmd import Exec
from raspsec.libs.log import StrataLogger
from raspsec.dbmodels.routing import StaticRoute
from raspsec.dbmodels.firewall import ChainMapping

logger = StrataLogger("StaticRoutesService")


IANA_PRIVATE_ROUTES = [
    {"destination": "10.0.0.0/8", "description": "IANA Private — Class A"},
    {"destination": "172.16.0.0/12", "description": "IANA Private — Class B"},
    {"destination": "192.168.0.0/16", "description": "IANA Private — Class C"},
]


class StaticRoutesService:

    @staticmethod
    def ensure_defaults():
        """Create default IANA private routes via implant chain if none exist."""
        if StaticRoute.objects.exists():
            return

        for i, route in enumerate(IANA_PRIVATE_ROUTES):
            StaticRoute.objects.create(
                destination=route["destination"],
                gateway="",
                interface="",
                chain="implant",
                metric=100,
                description=route["description"],
                enabled=True,
                priority=i * 10,
            )

        logger.log("Default IANA private routes created (chain=implant)")

    @staticmethod
    def get_routes():
        """Return all static routes as dicts, ordered by priority."""
        return list(
            StaticRoute.objects.all().order_by("priority").values(
                "id", "destination", "gateway", "interface", "chain",
                "metric", "description", "priority", "enabled",
            )
        )

    @staticmethod
    def save_route(data):
        """Create or update a static route."""
        route_id = data.get("id")
        if route_id:
            route = StaticRoute.objects.get(id=route_id)
            route.destination = data.get("destination", route.destination)
            route.gateway = data.get("gateway", route.gateway)
            route.interface = data.get("interface", route.interface)
            route.chain = data.get("chain", route.chain)
            route.metric = int(data.get("metric", route.metric))
            route.description = data.get("description", route.description)
            route.enabled = data.get("enabled", route.enabled)
            route.save()
        else:
            # Auto-priority: after last existing route
            max_prio = StaticRoute.objects.aggregate(m=Max("priority"))["m"] or 0
            StaticRoute.objects.create(
                destination=data.get("destination", ""),
                gateway=data.get("gateway", ""),
                interface=data.get("interface", ""),
                chain=data.get("chain", ""),
                metric=int(data.get("metric", 100)),
                description=data.get("description", ""),
                enabled=data.get("enabled", True),
                priority=max_prio + 10,
            )

    @staticmethod
    def delete_route(route_id):
        """Delete a static route."""
        StaticRoute.objects.filter(id=route_id).delete()

    @staticmethod
    def reorder_routes(ordered_ids):
        """Set priorities from ordered ID list."""
        for i, rid in enumerate(ordered_ids):
            StaticRoute.objects.filter(id=rid).update(priority=i)

    @staticmethod
    def remove_all():
        """Remove all managed static routes from the system."""
        routes = StaticRoute.objects.all().order_by("priority")
        chain_map = {cm.interface: cm.chain for cm in ChainMapping.objects.all()}
        chain_ifaces = {}
        for iface, chain in chain_map.items():
            chain_ifaces.setdefault(chain, []).append(iface)

        for route in routes:
            interfaces = StaticRoutesService._resolve_interfaces(route, chain_ifaces)
            # Also try removing by explicit interface if set
            if route.interface and route.interface not in interfaces:
                interfaces.append(route.interface)
            for iface in interfaces:
                StaticRoutesService._remove_route(route, iface)

        logger.log("All managed static routes removed.")

    @staticmethod
    def apply():
        """Remove all managed routes then re-apply for interfaces that are up.

        Routes are only active when their target interface is up.
        The gateway is inherited from the interface's default route.
        """
        # Clean first
        StaticRoutesService.remove_all()

        routes = StaticRoute.objects.filter(enabled=True).order_by("priority")
        chain_map = {cm.interface: cm.chain for cm in ChainMapping.objects.all()}
        chain_ifaces = {}
        for iface, chain in chain_map.items():
            chain_ifaces.setdefault(chain, []).append(iface)

        for route in routes:
            interfaces = StaticRoutesService._resolve_interfaces(route, chain_ifaces)
            for iface in interfaces:
                if not iface or not StaticRoutesService._iface_is_up(iface):
                    continue
                gateway = route.gateway or StaticRoutesService._get_interface_gateway(iface)
                if not gateway:
                    continue
                StaticRoutesService._add_route(route, iface, gateway)

        logger.log("Static routes applied for up interfaces.")

    @staticmethod
    def apply_for_interface(iface_name):
        """Apply static routes when an interface comes up.

        Routes that target this interface (directly or via chain) are activated.
        If the route has no explicit gateway, the interface's gateway is used.
        """
        routes = StaticRoute.objects.filter(enabled=True).order_by("priority")
        chain_map = {cm.interface: cm.chain for cm in ChainMapping.objects.all()}
        iface_chain = chain_map.get(iface_name, "")

        iface_gw = StaticRoutesService._get_interface_gateway(iface_name)
        if not iface_gw:
            logger.log(f"No gateway found for {iface_name}, skipping static routes")
            return

        applied = 0
        for route in routes:
            match = False
            if route.interface == iface_name:
                match = True
            elif route.chain and route.chain == iface_chain:
                match = True
            elif not route.interface and not route.chain:
                match = True

            if match:
                gateway = route.gateway or iface_gw
                StaticRoutesService._add_route(route, iface_name, gateway)
                applied += 1

        if applied:
            logger.log(f"Applied {applied} static routes for {iface_name} (gw={iface_gw})")

    @staticmethod
    def remove_for_interface(iface_name):
        """Remove static routes when an interface goes down."""
        routes = StaticRoute.objects.filter(enabled=True).order_by("priority")
        chain_map = {cm.interface: cm.chain for cm in ChainMapping.objects.all()}
        iface_chain = chain_map.get(iface_name, "")

        for route in routes:
            match = False
            if route.interface == iface_name:
                match = True
            elif route.chain and route.chain == iface_chain:
                match = True

            if match:
                StaticRoutesService._remove_route(route, iface_name)

    @staticmethod
    def _resolve_interfaces(route, chain_ifaces):
        """Resolve which interfaces a route should be applied to."""
        if route.interface:
            return [route.interface]
        if route.chain:
            return chain_ifaces.get(route.chain, [])
        return []

    @staticmethod
    def _iface_is_up(iface_name):
        """Check if interface is UP."""
        if not iface_name:
            return False
        ret, out = Exec.execute(f"/sbin/ip link show {iface_name}", raise_error=False)
        return ret == 0 and "UP" in out

    @staticmethod
    def _get_interface_gateway(iface_name):
        """Get gateway for an interface.

        1. Check routing table (normal DHCP with default route)
        2. Read stored DHCP gateway from hook (dhcp_gateways.yml)
        3. Parse dhcpcd lease directly (most reliable for nogateway)
        """
        # 1. Check current routing table
        ret, out = Exec.execute(f"/sbin/ip route show dev {iface_name}", raise_error=False)
        if ret == 0:
            for line in out.strip().splitlines():
                if line.startswith("default via "):
                    return line.split()[2]

        # 2. Read stored DHCP gateway from hook
        from raspsec.libs.config import load_config
        gw_cfg = load_config("dhcp_gateways.yml", {"interfaces": {}})
        stored_gw = gw_cfg.get("interfaces", {}).get(iface_name, "")
        if stored_gw:
            return stored_gw

        # 3. Parse dhcpcd lease
        ret, out = Exec.execute(
            f"/sbin/dhcpcd --dumplease {iface_name}",
            raise_error=False,
        )
        if ret == 0 and out.strip():
            for line in out.strip().splitlines():
                if line.startswith("routers="):
                    gw = line.split("=", 1)[1].split()[0]
                    if gw:
                        return gw

        # 4. Parse dhclient lease file
        import re
        ret, out = Exec.execute(
            "/bin/cat /var/lib/dhcp/dhclient.leases",
            raise_error=False,
        )
        if ret == 0:
            # Find leases for this interface, get last routers value
            current_iface = None
            last_gw = ""
            for line in out.splitlines():
                line = line.strip()
                if line.startswith("lease {"):
                    current_iface = None
                elif f'interface "{iface_name}"' in line:
                    current_iface = iface_name
                elif current_iface == iface_name and "option routers" in line:
                    match = re.search(r"option routers\s+([\d.]+)", line)
                    if match:
                        last_gw = match.group(1)
            if last_gw:
                return last_gw

        return ""

    @staticmethod
    def _add_route(route, iface, gateway):
        """Add a single route to the system."""
        cmd = f"sudo /sbin/ip route replace {route.destination} via {gateway} dev {iface} metric {route.metric}"

        ret, out = Exec.execute(cmd, raise_error=False)
        if ret != 0:
            logger.log(f"Failed to add route {route.destination}: {out}")
        else:
            logger.log(f"Route added: {route.destination} via {gateway} dev {iface} metric {route.metric}")

    @staticmethod
    def _remove_route(route, iface):
        """Remove a single route from the system."""
        cmd = f"sudo /sbin/ip route del {route.destination} dev {iface} metric {route.metric}"
        Exec.execute(cmd, raise_error=False)
