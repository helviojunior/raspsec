from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.dbmodels.service_status import ServiceStatus


class HealthView(APIView):
    """Public endpoint returning service health status."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        services = ServiceStatus.objects.all().order_by("friendly_name")
        required_healthy = not services.filter(
            required=True,
        ).exclude(status=ServiceStatus.Status.HEALTHY).exists()

        data = {
            "ready": required_healthy,
            "services": [
                {
                    "slug": s.slug,
                    "friendly_name": s.friendly_name,
                    "status": s.status,
                    "message": s.message,
                    "required": s.required,
                }
                for s in services
            ],
        }
        return Response(data)
