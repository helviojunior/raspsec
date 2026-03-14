from django.db import models

from raspsec.dbmodels.base import Base


class DnsServer(Base):
    class Status(models.TextChoices):
        UP = "up", "Up"
        DOWN = "down", "Down"
        UNKNOWN = "unknown", "Unknown"

    ip = models.GenericIPAddressField(unique=True)
    source = models.CharField(max_length=100, default="auto")
    enabled = models.BooleanField(default=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.UNKNOWN,
    )
    priority = models.IntegerField(default=100)

    class Meta:
        db_table = "raspsec_dns_server"
        ordering = ["priority", "ip"]
        verbose_name = "DNS Server"
        verbose_name_plural = "DNS Servers"

    def __str__(self):
        return f"{self.ip} [{self.status}] (pri={self.priority})"
