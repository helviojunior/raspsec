from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.services.vlan import VlanService


class VlanConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = VlanService.get_config()
        system_vlans = VlanService.get_system_vlans()
        return Response({
            "vlans": config.get("vlans", []),
            "system_vlans": system_vlans,
        })


class VlanView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        try:
            vlan = {
                "parent": data.get("parent", "eth0"),
                "vlan_id": int(data.get("vlan_id", 0)),
                "ip_address": data.get("ip_address", ""),
                "enabled": bool(data.get("enabled", True)),
            }
            VlanService.add_vlan(vlan)
            return Response({"detail": f"VLAN {vlan['vlan_id']} criada em {vlan['parent']}."})
        except (ValueError, TypeError) as e:
            return Response({"detail": str(e)}, status=400)

    def delete(self, request):
        parent = request.data.get("parent", "eth0")
        vlan_id = request.data.get("vlan_id")
        if vlan_id is None:
            return Response({"detail": "vlan_id é obrigatório."}, status=400)
        VlanService.remove_vlan(parent, int(vlan_id))
        return Response({"detail": f"VLAN {vlan_id} removida de {parent}."})


class VlanApplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        VlanService.apply()
        return Response({"detail": "VLANs reaplicadas."})
