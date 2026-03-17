from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.services.sliver import SliverService


class SliverConfigView(APIView):
    """Get or update Sliver C2 configuration."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = SliverService.get_config()
        status = SliverService.get_status()
        interfaces = SliverService.get_interfaces()
        return Response({**config, **status, "interfaces": interfaces})

    def put(self, request):
        data = request.data
        if not data.get("url") and data.get("enabled"):
            return Response({"detail": "URL do servidor C2 é obrigatória."}, status=400)

        config = SliverService.save_config(data)
        return Response({
            "detail": "Configuração salva com sucesso.",
            "config": config,
        })
