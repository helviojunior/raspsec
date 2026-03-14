from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.services.usb_gadget import UsbGadgetService


class UsbGadgetConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = UsbGadgetService.get_config()
        return Response(config)


class UsbGadgetToggleView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        data = request.data
        gadget = {
            "enabled": bool(data.get("enabled", False)),
        }
        UsbGadgetService.save_gadget(gadget)
        return Response({"detail": "USB Gadget Mode atualizado com sucesso."})


class UsbGadgetNetworkingView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        data = request.data
        net = {
            "dhcp_enabled": bool(data.get("dhcp_enabled", False)),
            "interface_ip": data.get("interface_ip", "172.21.254.1"),
            "range_start": data.get("range_start", "172.21.254.50"),
            "range_end": data.get("range_end", "172.21.254.100"),
            "subnet_mask": data.get("subnet_mask", "255.255.255.0"),
            "dns_mode": data.get("dns_mode", "system"),
            "dns_servers": data.get("dns_servers", []),
        }
        UsbGadgetService.save_networking(net)
        return Response({"detail": "Configurações de rede USB salvas com sucesso."})
