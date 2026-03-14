from django.db import models

from raspsec.dbmodels.base import Base


class ServiceStatus(Base):
    class Status(models.TextChoices):
        HEALTHY = "healthy", "Healthy"
        UNHEALTHY = "unhealthy", "Unhealthy"
        DEGRADED = "degraded", "Degraded"
        STOPPED = "stopped", "Stopped"

    slug = models.SlugField(max_length=100, unique=True)
    friendly_name = models.CharField(max_length=200)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.UNHEALTHY,
    )
    message = models.TextField(blank=True, default="")
    required = models.BooleanField(default=False)

    class Meta:
        db_table = "raspsec_service_status"
        verbose_name = "Service Status"
        verbose_name_plural = "Service Statuses"

    def __str__(self):
        return f"{self.friendly_name} [{self.status}]"
