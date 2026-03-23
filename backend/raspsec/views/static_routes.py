from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.services.static_routes import StaticRoutesService


class StaticRoutesConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "routes": StaticRoutesService.get_routes(),
        })


class StaticRouteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        if not data.get("destination"):
            return Response({"detail": "Destination é obrigatório."}, status=400)
        StaticRoutesService.save_route(data)
        return Response({"detail": "Rota salva com sucesso."})

    def put(self, request):
        data = request.data
        if not data.get("id"):
            return Response({"detail": "ID da rota é obrigatório."}, status=400)
        StaticRoutesService.save_route(data)
        return Response({"detail": "Rota atualizada com sucesso."})

    def delete(self, request):
        route_id = request.data.get("id") or request.query_params.get("id")
        if not route_id:
            return Response({"detail": "ID da rota é obrigatório."}, status=400)
        StaticRoutesService.delete_route(route_id)
        return Response({"detail": "Rota removida com sucesso."})


class StaticRoutesReorderView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        ordered_ids = request.data.get("ordered_ids", [])
        if not ordered_ids:
            return Response({"detail": "Lista de IDs é obrigatória."}, status=400)
        StaticRoutesService.reorder_routes(ordered_ids)
        return Response({"detail": "Ordem atualizada com sucesso."})


class StaticRoutesApplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        StaticRoutesService.apply()
        return Response({"detail": "Rotas aplicadas com sucesso."})
