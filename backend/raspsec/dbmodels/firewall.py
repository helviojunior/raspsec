from django.db import models

from raspsec.dbmodels.base import Base


class FirewallRule(Base):
    class Chain(models.TextChoices):
        INTERNAL = "internal", "Internal"
        IMPLANT = "implant", "Implant"
        OUTSIDE = "outside", "Outside"
        FIREWALL = "firewall", "Firewall (Self)"

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
    is_system = models.BooleanField(default=False, help_text="System rules cannot be deleted or reordered.")

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
        FIREWALL = "firewall", "Firewall (Self)"

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
    is_system = models.BooleanField(default=False, help_text="System rules cannot be deleted or reordered.")

    class Meta:
        db_table = "raspsec_nat_rule"
        ordering = ["priority"]
        verbose_name = "NAT Rule"
        verbose_name_plural = "NAT Rules"

    def __str__(self):
        return f"{self.source_chain} -> {self.dest_chain} ({self.nat_type})"


class ForwardingRule(Base):
    """Port forwarding rules (DNAT + optional SNAT for source masquerade)."""

    class Chain(models.TextChoices):
        INTERNAL = "internal", "Internal"
        IMPLANT = "implant", "Implant"
        OUTSIDE = "outside", "Outside"

    class Protocol(models.TextChoices):
        TCP = "tcp", "TCP"
        UDP = "udp", "UDP"
        BOTH = "tcp_udp", "TCP+UDP"

    source_chain = models.CharField(max_length=20, choices=Chain.choices)
    dest_ip = models.CharField(max_length=50, help_text="Destination IP to match (e.g. 10.10.10.10)")
    protocol = models.CharField(max_length=10, choices=Protocol.choices, default=Protocol.TCP)
    ports = models.CharField(max_length=200, help_text="Comma-separated ports (e.g. 80,443,8080)")
    forward_ip = models.CharField(max_length=50, help_text="Target host IP (e.g. 1.1.1.1)")
    forward_port = models.CharField(max_length=50, blank=True, default="", help_text="Target port (empty = same as original)")
    masquerade_source = models.BooleanField(default=False, help_text="Add SNAT rule to masquerade source IP")
    priority = models.IntegerField(default=100)
    description = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        db_table = "raspsec_forwarding_rule"
        ordering = ["priority"]
        verbose_name = "Forwarding Rule"
        verbose_name_plural = "Forwarding Rules"

    def __str__(self):
        return f"{self.source_chain} {self.dest_ip}:{self.ports} -> {self.forward_ip}:{self.forward_port or self.ports}"


class ChainMapping(Base):
    """Maps network interfaces to firewall chains."""

    class Chain(models.TextChoices):
        INTERNAL = "internal", "Internal"
        IMPLANT = "implant", "Implant"
        OUTSIDE = "outside", "Outside"
        FIREWALL = "firewall", "Firewall (Self)"

    interface = models.CharField(max_length=50, unique=True)
    chain = models.CharField(max_length=20, choices=Chain.choices)

    class Meta:
        db_table = "raspsec_chain_mapping"
        verbose_name = "Chain Mapping"
        verbose_name_plural = "Chain Mappings"

    def __str__(self):
        return f"{self.interface} -> {self.chain}"
