import re

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.services.wifi_client import WifiClientService


def _valid_iface(name):
    return bool(name) and re.match(r"^[a-zA-Z0-9._-]+$", name)


class WifiClientScanView(APIView):
    """Scan for available WiFi networks on a given interface."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        interface = request.query_params.get("interface", "")
        if not _valid_iface(interface):
            return Response({"detail": "Interface inválida."}, status=400)

        try:
            networks = WifiClientService.scan(interface)
            return Response({"networks": networks})
        except Exception as e:
            return Response({"detail": str(e)}, status=500)


class WifiClientConnectView(APIView):
    """Connect to a WiFi network as client."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        interface = request.data.get("interface", "")
        if not _valid_iface(interface):
            return Response({"detail": "Interface inválida."}, status=400)

        profile = request.data.get("profile", {})
        if not profile.get("ssid"):
            return Response({"detail": "SSID é obrigatório."}, status=400)

        try:
            WifiClientService.connect(interface, profile)
            return Response({
                "detail": f"Conectado a {profile['ssid']} via {interface}."
            })
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        except RuntimeError as e:
            return Response({"detail": str(e)}, status=500)


class WifiClientDisconnectView(APIView):
    """Disconnect WiFi client on an interface."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        interface = request.data.get("interface", "")
        if not _valid_iface(interface):
            return Response({"detail": "Interface inválida."}, status=400)

        try:
            WifiClientService.disconnect(interface)
            return Response({"detail": f"Desconectado de {interface}."})
        except Exception as e:
            return Response({"detail": str(e)}, status=500)


class WifiClientStatusView(APIView):
    """Get WiFi client connection status."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        interface = request.query_params.get("interface", "")
        if not _valid_iface(interface):
            return Response({"detail": "Interface inválida."}, status=400)

        status = WifiClientService.status(interface)
        return Response(status)


class WifiClientProfilesView(APIView):
    """List and delete saved WiFi client profiles."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profiles = WifiClientService.get_profiles()
        return Response({"profiles": profiles})

    def delete(self, request):
        interface = request.data.get("interface", "")
        ssid = request.data.get("ssid", "")

        if not interface or not ssid:
            return Response({"detail": "Interface e SSID são obrigatórios."}, status=400)

        WifiClientService.delete_profile(interface, ssid)
        return Response({"detail": f"Perfil '{ssid}' removido."})

    def put(self, request):
        """Toggle auto-connect for a profile."""
        interface = request.data.get("interface", "")
        ssid = request.data.get("ssid", "")
        auto_connect = request.data.get("auto_connect", False)

        if not interface or not ssid:
            return Response({"detail": "Interface e SSID são obrigatórios."}, status=400)

        WifiClientService.set_auto_connect(interface, ssid, auto_connect)
        return Response({"detail": f"Auto-connect {'habilitado' if auto_connect else 'desabilitado'} para '{ssid}'."})
