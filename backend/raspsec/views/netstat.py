import re

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.libs.cmd import Exec
from raspsec.services.routing import RoutingService


class NetworkStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        interfaces = _get_interfaces()
        routes = _get_routes()
        gateway_config = RoutingService.get_config().get("gateways", [])
        return Response({
            "interfaces": interfaces,
            "routes": routes,
            "gateway_config": gateway_config,
        })


class GatewayConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        gateways = request.data.get("gateways", [])
        sanitized = []
        for gw in gateways:
            sanitized.append({
                "gateway": gw.get("gateway", ""),
                "interface": gw.get("interface", ""),
                "enabled": bool(gw.get("enabled", True)),
            })
        RoutingService.save_gateways(sanitized)
        return Response({"detail": "Configuração de gateways salva com sucesso."})


def _get_interfaces():
    """Parse `ip -o addr show` to get interface info."""
    interfaces = {}

    # Get all interfaces with flags/mac from `ip -o link show`
    ret, out = Exec.execute("/sbin/ip -o link show", raise_error=False)
    if ret == 0:
        for line in out.strip().splitlines():
            match = re.match(r'^\d+:\s+(\S+?)(?:@\S+)?:\s+<([^>]*)>', line)
            if match:
                name = match.group(1)
                flags = match.group(2)
                mac_match = re.search(r'link/\S+\s+([\da-fA-F:]{17})', line)
                mac = mac_match.group(1) if mac_match else ""
                interfaces[name] = {
                    "name": name,
                    "ip": "",
                    "mac": mac,
                    "flags": flags,
                }

    # Get IPs from `ip -o addr show`
    ret, out = Exec.execute("/sbin/ip -o addr show", raise_error=False)
    if ret == 0:
        for line in out.strip().splitlines():
            parts = line.split()
            if len(parts) >= 4 and parts[2] == "inet":
                name = parts[1]
                ip = parts[3]  # includes CIDR
                if name in interfaces and not interfaces[name]["ip"]:
                    interfaces[name]["ip"] = ip

    return list(interfaces.values())


def _get_routes():
    """Parse `route -n` to get routing table."""
    ret, out = Exec.execute("/usr/sbin/route -n", raise_error=False)
    if ret != 0:
        return []

    routes = []
    lines = out.strip().splitlines()
    # Skip header lines (first 2)
    for line in lines[2:]:
        parts = line.split()
        if len(parts) >= 8:
            routes.append({
                "destination": parts[0],
                "gateway": parts[1],
                "genmask": parts[2],
                "flags": parts[3],
                "metric": parts[4],
                "ref": parts[5],
                "use": parts[6],
                "interface": parts[7],
            })

    return routes
