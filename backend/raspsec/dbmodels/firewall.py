from django.db import models

from raspsec.dbmodels.base import Base


class FirewallRule(Base):
    class Chain(models.TextChoices):
        INTERNAL = "internal", "Internal"
        IMPLANT = "implant", "Implant"
        OUTSIDE = "outside", "Outside"

    class Protocol(models.TextChoices):
        ANY = "any", "ANY"
        TCP = "tcp", "TCP"
        UDP = "udp", "UDP"
        ICMP = "icmp", "ICMP"

    class Action(models.TextChoices):
        ALLOW = "allow", "Allow"
        DENY = "deny", "Deny"

    chain = models.CharField(max_length=20, choices=Chain.choices)
    protocol = models.CharField(max_length=10, choices=Protocol.choices, default=Protocol.ANY)
    port = models.CharField(max_length=50, blank=True, default="", help_text="Port or range. Empty = all ports.")
    source_ip = models.CharField(max_length=50, blank=True, default="", help_text="CIDR or empty for any.")
    action = models.CharField(max_length=10, choices=Action.choices)
    priority = models.IntegerField(default=100)
    description = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        db_table = "raspsec_firewall_rule"
        ordering = ["chain", "priority"]
        verbose_name = "Firewall Rule"
        verbose_name_plural = "Firewall Rules"

    def __str__(self):
        port = self.port or "ANY"
        return f"{self.chain} {self.protocol}/{port} -> {self.action}"


class NatRule(Base):
    class Chain(models.TextChoices):
        INTERNAL = "internal", "Internal"
        IMPLANT = "implant", "Implant"
        OUTSIDE = "outside", "Outside"

    class NatType(models.TextChoices):
        MASQUERADE = "masquerade", "Masquerade"
        SNAT = "snat", "SNAT"
        DNAT = "dnat", "DNAT"

    class Protocol(models.TextChoices):
        ANY = "any", "ANY"
        TCP = "tcp", "TCP"
        UDP = "udp", "UDP"

    source_chain = models.CharField(max_length=20, choices=Chain.choices)
    dest_chain = models.CharField(max_length=20, choices=Chain.choices)
    nat_type = models.CharField(max_length=20, choices=NatType.choices, default=NatType.MASQUERADE)
    protocol = models.CharField(max_length=10, choices=Protocol.choices, default=Protocol.ANY)
    port = models.CharField(max_length=50, blank=True, default="")
    dest_ip = models.CharField(max_length=50, blank=True, default="", help_text="For DNAT: destination IP.")
    dest_port = models.CharField(max_length=50, blank=True, default="", help_text="For DNAT: destination port.")
    priority = models.IntegerField(default=100)
    description = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        db_table = "raspsec_nat_rule"
        ordering = ["priority"]
        verbose_name = "NAT Rule"
        verbose_name_plural = "NAT Rules"

    def __str__(self):
        return f"{self.source_chain} -> {self.dest_chain} ({self.nat_type})"


class ChainMapping(Base):
    """Maps network interfaces to firewall chains."""

    class Chain(models.TextChoices):
        INTERNAL = "internal", "Internal"
        IMPLANT = "implant", "Implant"
        OUTSIDE = "outside", "Outside"

    interface = models.CharField(max_length=50, unique=True)
    chain = models.CharField(max_length=20, choices=Chain.choices)

    class Meta:
        db_table = "raspsec_chain_mapping"
        verbose_name = "Chain Mapping"
        verbose_name_plural = "Chain Mappings"

    def __str__(self):
        return f"{self.interface} -> {self.chain}"
