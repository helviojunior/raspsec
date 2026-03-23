from django.db import models

from raspsec.dbmodels.base import Base


class StaticRoute(Base):
    """Static route with metric-based ordering and interface/chain binding."""

    destination = models.CharField(
        max_length=50, help_text="Destination network in CIDR (e.g. 10.0.0.0/8) or 'default'."
    )
    gateway = models.CharField(
        max_length=50, blank=True, default="",
        help_text="Next-hop gateway IP. Empty for on-link routes."
    )
    interface = models.CharField(
        max_length=50, blank=True, default="",
        help_text="Outgoing interface (e.g. eth0). Empty to use chain binding."
    )
    chain = models.CharField(
        max_length=20, blank=True, default="",
        help_text="Firewall chain — route applies when any interface in this chain is up."
    )
    metric = models.IntegerField(default=100)
    description = models.CharField(max_length=200, blank=True, default="")
    priority = models.IntegerField(default=100, help_text="Display/drag order.")

    class Meta:
        db_table = "raspsec_static_route"
        ordering = ["priority"]
        verbose_name = "Static Route"
        verbose_name_plural = "Static Routes"

    def __str__(self):
        via = f"via {self.gateway}" if self.gateway else "on-link"
        target = self.interface or self.chain or "any"
        return f"{self.destination} {via} dev {target} metric {self.metric}"
