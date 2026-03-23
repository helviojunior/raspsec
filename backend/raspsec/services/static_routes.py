from django.db.models import Max

from raspsec.libs.cmd import Exec
from raspsec.libs.log import StrataLogger
from raspsec.dbmodels.routing import StaticRoute
from raspsec.dbmodels.firewall import ChainMapping

logger = StrataLogger("StaticRoutesService")


class StaticRoutesService:

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
        """Set priorities from ordered ID list and re-apply."""
        for i, rid in enumerate(ordered_ids):
            StaticRoute.objects.filter(id=rid).update(priority=i)
        StaticRoutesService.apply()

    @staticmethod
    def apply():
        """Flush managed static routes and re-apply from DB."""
        routes = StaticRoute.objects.filter(enabled=True).order_by("priority")
        chain_map = {cm.interface: cm.chain for cm in ChainMapping.objects.all()}
        # Reverse map: chain → list of interfaces
        chain_ifaces = {}
        for iface, chain in chain_map.items():
            chain_ifaces.setdefault(chain, []).append(iface)

        # Remove previously managed static routes (tagged with raspsec)
        ret, out = Exec.execute("/sbin/ip route show", raise_error=False)
        if ret == 0:
            for line in out.strip().splitlines():
                # We tag our routes with protocol static + specific metrics
                # For safety, only remove routes we explicitly added
                pass  # We'll use replace instead of flush

        for route in routes:
            interfaces = StaticRoutesService._resolve_interfaces(route, chain_ifaces)
            for iface in interfaces:
                if not StaticRoutesService._iface_is_up(iface):
                    continue
                StaticRoutesService._add_route(route, iface)

        logger.log("Static routes applied.")

    @staticmethod
    def apply_for_interface(iface_name):
        """Apply static routes that target a specific interface or its chain.

        Called when an interface comes up.
        """
        routes = StaticRoute.objects.filter(enabled=True).order_by("priority")
        chain_map = {cm.interface: cm.chain for cm in ChainMapping.objects.all()}
        iface_chain = chain_map.get(iface_name, "")

        chain_ifaces = {}
        for iface, chain in chain_map.items():
            chain_ifaces.setdefault(chain, []).append(iface)

        for route in routes:
            # Route targets this specific interface
            if route.interface == iface_name:
                StaticRoutesService._add_route(route, iface_name)
                continue
            # Route targets the chain this interface belongs to
            if route.chain and route.chain == iface_chain:
                StaticRoutesService._add_route(route, iface_name)

    @staticmethod
    def _resolve_interfaces(route, chain_ifaces):
        """Resolve which interfaces a route should be applied to."""
        if route.interface:
            return [route.interface]
        if route.chain:
            return chain_ifaces.get(route.chain, [])
        return [""]  # No interface specified — let kernel decide

    @staticmethod
    def _iface_is_up(iface_name):
        """Check if interface is UP."""
        if not iface_name:
            return True  # No interface constraint
        ret, out = Exec.execute(f"/sbin/ip link show {iface_name}", raise_error=False)
        return ret == 0 and "UP" in out

    @staticmethod
    def _add_route(route, iface):
        """Add a single route to the system."""
        cmd = f"sudo /sbin/ip route replace {route.destination}"
        if route.gateway:
            cmd += f" via {route.gateway}"
        if iface:
            cmd += f" dev {iface}"
        cmd += f" metric {route.metric}"

        ret, out = Exec.execute(cmd, raise_error=False)
        if ret != 0:
            logger.log(f"Failed to add route {route.destination}: {out}")
        else:
            logger.log(f"Route added: {route.destination} via {route.gateway or 'on-link'} dev {iface or 'any'} metric {route.metric}")

    @staticmethod
    def _remove_route(route, iface):
        """Remove a single route from the system."""
        cmd = f"sudo /sbin/ip route del {route.destination}"
        if route.gateway:
            cmd += f" via {route.gateway}"
        if iface:
            cmd += f" dev {iface}"
        cmd += f" metric {route.metric}"
        Exec.execute(cmd, raise_error=False)
