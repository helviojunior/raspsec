from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.services.wifi import WifiService


class WifiConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = WifiService.get_config()
        return Response(config)


class WifiApView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        data = request.data
        required = ["ssid", "password"]
        for field in required:
            if not data.get(field):
                return Response(
                    {"detail": f"Campo '{field}' é obrigatório."},
                    status=400,
                )

        ap = {
            "ssid": data["ssid"],
            "bssid": data.get("bssid", ""),
            "password": data["password"],
            "hidden": bool(data.get("hidden", False)),
            "enabled": bool(data.get("enabled", False)),
        }

        WifiService.save_ap(ap)
        return Response({"detail": "Access Point configurado com sucesso."})


class WifiNetworkingView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        data = request.data

        net = {
            "dhcp_enabled": bool(data.get("dhcp_enabled", False)),
            "interface_ip": data.get("interface_ip", "10.3.141.1"),
            "range_start": data.get("range_start", "10.3.141.50"),
            "range_end": data.get("range_end", "10.3.141.254"),
            "subnet_mask": data.get("subnet_mask", "255.255.255.0"),
            "dns_mode": data.get("dns_mode", "system"),
            "dns_servers": data.get("dns_servers", []),
        }

        WifiService.save_networking(net)
        return Response({"detail": "Configurações de rede salvas com sucesso."})
