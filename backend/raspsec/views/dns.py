from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.services.dns import DnsService


class DnsConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        servers = DnsService.get_servers()
        return Response({"servers": servers})


class DnsSyncView(APIView):
    """Force a re-discovery of DNS servers from DHCP."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        servers = DnsService.sync_from_dhcp()
        return Response({"servers": servers})


class DnsServersView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        servers = request.data.get("servers", [])
        sanitized = []
        for s in servers:
            sanitized.append({
                "ip": s.get("ip", ""),
                "source": s.get("source", "manual"),
                "enabled": bool(s.get("enabled", True)),
            })
        DnsService.save_servers(sanitized)
        return Response({"detail": "Configuracao DNS salva com sucesso."})
