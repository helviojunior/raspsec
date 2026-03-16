from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.services.firewall import FirewallService


class FirewallConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "rules": FirewallService.get_rules(),
            "nat_rules": FirewallService.get_nat_rules(),
            "chain_mappings": FirewallService.get_chain_mappings(),
        })


class FirewallRuleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        if not data.get("chain") or not data.get("action"):
            return Response({"detail": "Chain e action sao obrigatorios."}, status=400)
        FirewallService.save_rule(data)
        return Response({"detail": "Regra salva com sucesso."})

    def put(self, request):
        data = request.data
        if not data.get("id"):
            return Response({"detail": "ID da regra e obrigatorio."}, status=400)
        FirewallService.save_rule(data)
        return Response({"detail": "Regra atualizada com sucesso."})

    def delete(self, request):
        rule_id = request.data.get("id") or request.query_params.get("id")
        if not rule_id:
            return Response({"detail": "ID da regra e obrigatorio."}, status=400)
        FirewallService.delete_rule(rule_id)
        return Response({"detail": "Regra removida com sucesso."})


class NatRuleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        if not data.get("source_chain") or not data.get("dest_chain"):
            return Response({"detail": "Source e dest chain sao obrigatorios."}, status=400)
        FirewallService.save_nat_rule(data)
        return Response({"detail": "Regra NAT salva com sucesso."})

    def put(self, request):
        data = request.data
        if not data.get("id"):
            return Response({"detail": "ID da regra e obrigatorio."}, status=400)
        FirewallService.save_nat_rule(data)
        return Response({"detail": "Regra NAT atualizada com sucesso."})

    def delete(self, request):
        rule_id = request.data.get("id") or request.query_params.get("id")
        if not rule_id:
            return Response({"detail": "ID da regra e obrigatorio."}, status=400)
        FirewallService.delete_nat_rule(rule_id)
        return Response({"detail": "Regra NAT removida com sucesso."})


class FirewallReorderView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        rule_type = request.data.get("type", "rule")
        ordered_ids = request.data.get("ordered_ids", [])
        if not ordered_ids:
            return Response({"detail": "Lista de IDs é obrigatória."}, status=400)
        if rule_type == "nat":
            FirewallService.reorder_nat_rules(ordered_ids)
        else:
            FirewallService.reorder_rules(ordered_ids)
        return Response({"detail": "Ordem atualizada com sucesso."})


class FirewallApplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        FirewallService.apply()
        return Response({"detail": "Firewall aplicado com sucesso."})
