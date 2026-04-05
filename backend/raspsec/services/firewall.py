from django.db import models
from raspsec.libs.cmd import Exec
from raspsec.libs.log import StrataLogger

logger = StrataLogger("FirewallService")

CHAINS = ["RASPSEC_IMPLANT", "RASPSEC_INTERNAL", "RASPSEC_OUTSIDE", "RASPSEC_FIREWALL"]

DEFAULT_CHAIN_MAPPINGS = {
    "eth0": "implant",
    "wlan0": "internal",
    "usb0": "internal",
}

ANTI_LOCKOUT_RULES = [
    {"chain": "internal", "protocol": "tcp", "port": "443", "source_ip": "", "action": "allow", "priority": -2, "description": "Anti-lockout: HTTPS", "is_system": True},
    {"chain": "internal", "protocol": "tcp", "port": "22", "source_ip": "", "action": "allow", "priority": -1, "description": "Anti-lockout: SSH", "is_system": True},
]

DEFAULT_RULES = [
    {"chain": "internal", "protocol": "any", "port": "", "source_ip": "", "action": "allow", "priority": 10, "description": "Allow all from Internal"},
    {"chain": "outside", "protocol": "any", "port": "", "source_ip": "", "action": "deny", "priority": 10, "description": "Deny all from Outside"},
    {"chain": "implant", "protocol": "any", "port": "", "source_ip": "", "action": "deny", "priority": 10, "description": "Deny all from Implant"},
]

ANTI_LOCKOUT_NAT_RULES = [
    {"source_chain": "internal", "dest_chain": "firewall", "nat_type": "masquerade", "protocol": "any", "port": "", "dest_ip": "", "dest_port": "", "priority": -1, "description": "Anti-lockout: No NAT Internal → Firewall", "enabled": False, "is_system": True},
]

DEFAULT_NAT_RULES = [
    {"source_chain": "internal", "dest_chain": "outside", "nat_type": "masquerade", "protocol": "any", "port": "", "dest_ip": "", "dest_port": "", "priority": 0, "description": "NAT Internal → Outside"},
    {"source_chain": "internal", "dest_chain": "implant", "nat_type": "masquerade", "protocol": "any", "port": "", "dest_ip": "", "dest_port": "", "priority": 1, "description": "NAT Internal → Implant"},
    {"source_chain": "firewall", "dest_chain": "implant", "nat_type": "masquerade", "protocol": "any", "port": "", "dest_ip": "", "dest_port": "", "priority": 2, "description": "NAT Firewall → Implant"},
]


class FirewallService:

    @staticmethod
    def ensure_defaults():
        """Create default chain mappings and firewall rules if none exist."""
        from raspsec.dbmodels.firewall import ChainMapping, FirewallRule

        # Chain mappings
        for iface, chain in DEFAULT_CHAIN_MAPPINGS.items():
            ChainMapping.objects.get_or_create(
                interface=iface,
                defaults={"chain": chain},
            )

        # Anti-lockout rules (always recreated if missing)
        for rule in ANTI_LOCKOUT_RULES:
            FirewallRule.objects.get_or_create(
                is_system=True,
                description=rule["description"],
                defaults=rule,
            )

        # Default rules
        if FirewallRule.objects.filter(is_system=False).count() == 0:
            for rule in DEFAULT_RULES:
                FirewallRule.objects.create(**rule)

        # Anti-lockout NAT rules (always recreated if missing)
        from raspsec.dbmodels.firewall import NatRule
        for rule in ANTI_LOCKOUT_NAT_RULES:
            NatRule.objects.get_or_create(
                is_system=True,
                description=rule["description"],
                defaults=rule,
            )

        # Default NAT rules
        if NatRule.objects.filter(is_system=False).count() == 0:
            for rule in DEFAULT_NAT_RULES:
                NatRule.objects.create(**rule)

    @staticmethod
    def get_chain_mappings():
        from raspsec.dbmodels.firewall import ChainMapping
        return list(ChainMapping.objects.all().values("id", "interface", "chain"))

    @staticmethod
    def get_rules():
        from raspsec.dbmodels.firewall import FirewallRule
        return list(
            FirewallRule.objects.all()
            .order_by("chain", "priority")
            .values("id", "chain", "protocol", "port", "source_ip", "action", "priority", "description", "enabled", "is_system")
        )

    @staticmethod
    def get_nat_rules():
        from raspsec.dbmodels.firewall import NatRule
        return list(
            NatRule.objects.all()
            .order_by("priority")
            .values("id", "source_chain", "dest_chain", "nat_type", "protocol", "port", "dest_ip", "dest_port", "priority", "description", "enabled", "is_system")
        )

    @staticmethod
    def save_rule(data):
        from raspsec.dbmodels.firewall import FirewallRule
        rule_id = data.get("id")
        fields = {
            "chain": data["chain"],
            "protocol": data.get("protocol", "any"),
            "port": data.get("port", ""),
            "source_ip": data.get("source_ip", ""),
            "action": data["action"],
            "priority": data.get("priority", 100),
            "description": data.get("description", ""),
            "enabled": data.get("enabled", True),
        }
        if rule_id:
            FirewallRule.objects.filter(id=rule_id).update(**fields)
        else:
            # New rules go to the top (priority 0, shift others down)
            FirewallRule.objects.filter(chain=fields["chain"]).update(
                priority=models.F("priority") + 1
            )
            fields["priority"] = 0
            FirewallRule.objects.create(**fields)
        FirewallService.apply()

    @staticmethod
    def delete_rule(rule_id):
        from raspsec.dbmodels.firewall import FirewallRule
        FirewallRule.objects.filter(id=rule_id, is_system=False).delete()
        FirewallService.apply()

    @staticmethod
    def reorder_rules(ordered_ids):
        """Reorder rules by a list of IDs (first = priority 0)."""
        from raspsec.dbmodels.firewall import FirewallRule
        for i, rule_id in enumerate(ordered_ids):
            FirewallRule.objects.filter(id=rule_id).update(priority=i)
        FirewallService.apply()

    @staticmethod
    def save_nat_rule(data):
        from raspsec.dbmodels.firewall import NatRule
        rule_id = data.get("id")
        fields = {
            "source_chain": data["source_chain"],
            "dest_chain": data["dest_chain"],
            "nat_type": data.get("nat_type", "masquerade"),
            "protocol": data.get("protocol", "any"),
            "port": data.get("port", ""),
            "dest_ip": data.get("dest_ip", ""),
            "dest_port": data.get("dest_port", ""),
            "priority": data.get("priority", 100),
            "description": data.get("description", ""),
            "enabled": data.get("enabled", True),
        }
        if rule_id:
            NatRule.objects.filter(id=rule_id, is_system=False).update(**fields)
        else:
            # New NAT rules go to the top (after system rules)
            NatRule.objects.filter(is_system=False).update(priority=models.F("priority") + 1)
            fields["priority"] = 0
            NatRule.objects.create(**fields)
        FirewallService.apply()

    @staticmethod
    def delete_nat_rule(rule_id):
        from raspsec.dbmodels.firewall import NatRule
        NatRule.objects.filter(id=rule_id, is_system=False).delete()
        FirewallService.apply()

    @staticmethod
    def reorder_nat_rules(ordered_ids):
        """Reorder NAT rules by a list of IDs (first = priority 0)."""
        from raspsec.dbmodels.firewall import NatRule
        for i, rule_id in enumerate(ordered_ids):
            NatRule.objects.filter(id=rule_id).update(priority=i)
        FirewallService.apply()

    @staticmethod
    def get_forwarding_rules():
        from raspsec.dbmodels.firewall import ForwardingRule
        return list(
            ForwardingRule.objects.all()
            .order_by("priority")
            .values("id", "source_chain", "dest_ip", "protocol", "ports",
                    "forward_ip", "forward_port", "masquerade_source",
                    "priority", "description", "enabled")
        )

    @staticmethod
    def save_forwarding_rule(data):
        from raspsec.dbmodels.firewall import ForwardingRule
        rule_id = data.get("id")
        fields = {
            "source_chain": data["source_chain"],
            "dest_ip": data["dest_ip"],
            "protocol": data.get("protocol", "tcp"),
            "ports": data["ports"],
            "forward_ip": data["forward_ip"],
            "forward_port": data.get("forward_port", ""),
            "masquerade_source": data.get("masquerade_source", False),
            "priority": data.get("priority", 100),
            "description": data.get("description", ""),
            "enabled": data.get("enabled", True),
        }
        if rule_id:
            ForwardingRule.objects.filter(id=rule_id).update(**fields)
        else:
            ForwardingRule.objects.filter().update(priority=models.F("priority") + 1)
            fields["priority"] = 0
            ForwardingRule.objects.create(**fields)
        FirewallService.apply()

    @staticmethod
    def delete_forwarding_rule(rule_id):
        from raspsec.dbmodels.firewall import ForwardingRule
        ForwardingRule.objects.filter(id=rule_id).delete()
        FirewallService.apply()

    @staticmethod
    def reorder_forwarding_rules(ordered_ids):
        from raspsec.dbmodels.firewall import ForwardingRule
        for i, rule_id in enumerate(ordered_ids):
            ForwardingRule.objects.filter(id=rule_id).update(priority=i)
        FirewallService.apply()

    @staticmethod
    def apply():
        """Flush and rebuild all iptables rules from DB."""
        from raspsec.dbmodels.firewall import ChainMapping, FirewallRule, NatRule, ForwardingRule

        mappings = {m.interface: m.chain for m in ChainMapping.objects.all()}
        rules = FirewallRule.objects.filter(enabled=True).order_by("chain", "priority")
        nat_rules = NatRule.objects.filter(enabled=True).order_by("priority")

        logger.log(f"Applying firewall rules... mappings={mappings}, rules={rules.count()}, nat_rules={nat_rules.count()}")

        if not mappings:
            logger.log("WARNING: No chain mappings found! Firewall will have no interface rules.")
            # Try to recreate defaults before proceeding
            FirewallService.ensure_defaults()
            mappings = {m.interface: m.chain for m in ChainMapping.objects.all()}
            rules = FirewallRule.objects.filter(enabled=True).order_by("chain", "priority")
            nat_rules = NatRule.objects.filter(enabled=True).order_by("priority")
            logger.log(f"After ensure_defaults: mappings={mappings}, rules={rules.count()}, nat_rules={nat_rules.count()}")

        # ── Flush ──
        for chain in CHAINS:
            Exec.execute(f"sudo /usr/sbin/iptables -F {chain} 2>/dev/null || true", raise_error=False)
            Exec.execute(f"sudo /usr/sbin/iptables -X {chain} 2>/dev/null || true", raise_error=False)
        Exec.execute("sudo /usr/sbin/iptables -F INPUT", raise_error=False)
        Exec.execute("sudo /usr/sbin/iptables -F FORWARD", raise_error=False)
        Exec.execute("sudo /usr/sbin/iptables -t nat -F POSTROUTING", raise_error=False)
        Exec.execute("sudo /usr/sbin/iptables -t nat -F PREROUTING", raise_error=False)

        # ── Default policies ──
        Exec.execute("sudo /usr/sbin/iptables -P OUTPUT ACCEPT", raise_error=False)
        Exec.execute("sudo /usr/sbin/iptables -P INPUT DROP", raise_error=False)
        Exec.execute("sudo /usr/sbin/iptables -P FORWARD DROP", raise_error=False)

        # Allow established/related
        Exec.execute("sudo /usr/sbin/iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT", raise_error=False)
        Exec.execute("sudo /usr/sbin/iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT", raise_error=False)

        # Allow loopback
        Exec.execute("sudo /usr/sbin/iptables -A INPUT -i lo -j ACCEPT", raise_error=False)

        # ── Create custom chains ──
        for chain in CHAINS:
            Exec.execute(f"sudo /usr/sbin/iptables -N {chain}", raise_error=False)

        # ── Jump to custom chains based on interface ──
        for iface, chain_name in mappings.items():
            iptables_chain = f"RASPSEC_{chain_name.upper()}"
            Exec.execute(
                f"sudo /usr/sbin/iptables -A INPUT -i {iface} -j {iptables_chain}",
                raise_error=False,
            )
            Exec.execute(
                f"sudo /usr/sbin/iptables -A FORWARD -i {iface} -j {iptables_chain}",
                raise_error=False,
            )

        # ── Firewall rules ──
        for rule in rules:
            iptables_chain = f"RASPSEC_{rule.chain.upper()}"
            target = "ACCEPT" if rule.action == "allow" else "DROP"
            cmd = f"sudo /usr/sbin/iptables -A {iptables_chain}"

            if rule.protocol != "any":
                cmd += f" -p {rule.protocol}"
            if rule.port:
                cmd += f" --dport {rule.port}"
            if rule.source_ip:
                cmd += f" -s {rule.source_ip}"

            cmd += f" -j {target}"
            Exec.execute(cmd, raise_error=False)

        # ── Anti-lockout: ensure no NAT between internal and firewall ──
        # Build set of exempt paths (internal↔firewall) from system NAT rules
        exempt_paths = set()
        for snat in NatRule.objects.filter(is_system=True):
            exempt_paths.add((snat.source_chain, snat.dest_chain))

        # ── NAT rules ──
        for nat in nat_rules:
            # Skip paths covered by anti-lockout
            if (nat.source_chain, nat.dest_chain) in exempt_paths:
                continue

            src_ifaces = [i for i, c in mappings.items() if c == nat.source_chain]
            dst_ifaces = [i for i, c in mappings.items() if c == nat.dest_chain]

            for src_if in src_ifaces:
                for dst_if in dst_ifaces:
                    # FORWARD allow for this NAT path
                    Exec.execute(
                        f"sudo /usr/sbin/iptables -A FORWARD -i {src_if} -o {dst_if} -j ACCEPT",
                        raise_error=False,
                    )

                    if nat.nat_type == "masquerade":
                        cmd = f"sudo /usr/sbin/iptables -t nat -A POSTROUTING -o {dst_if}"
                        if nat.protocol != "any":
                            cmd += f" -p {nat.protocol}"
                        if nat.port:
                            cmd += f" --dport {nat.port}"
                        cmd += " -j MASQUERADE"
                        Exec.execute(cmd, raise_error=False)

                    elif nat.nat_type == "dnat" and nat.dest_ip:
                        cmd = f"sudo /usr/sbin/iptables -t nat -A PREROUTING -i {src_if}"
                        if nat.protocol != "any":
                            cmd += f" -p {nat.protocol}"
                        if nat.port:
                            cmd += f" --dport {nat.port}"
                        to_dest = nat.dest_ip
                        if nat.dest_port:
                            to_dest += f":{nat.dest_port}"
                        cmd += f" -j DNAT --to-destination {to_dest}"
                        Exec.execute(cmd, raise_error=False)

        # ── Forwarding rules (DNAT + optional SNAT) ──
        fwd_rules = ForwardingRule.objects.filter(enabled=True).order_by("priority")
        for fwd in fwd_rules:
            src_ifaces = [i for i, c in mappings.items() if c == fwd.source_chain]
            protocols = ["tcp", "udp"] if fwd.protocol == "tcp_udp" else [fwd.protocol]

            for proto in protocols:
                for src_if in src_ifaces:
                    # PREROUTING DNAT: redirect incoming traffic to forward target
                    cmd = f"sudo /usr/sbin/iptables -t nat -A PREROUTING -i {src_if}"
                    cmd += f" -d {fwd.dest_ip} -p {proto}"
                    cmd += f" -m multiport --dports {fwd.ports}"
                    to_dest = fwd.forward_ip
                    if fwd.forward_port:
                        to_dest += f":{fwd.forward_port}"
                    cmd += f" -j DNAT --to-destination {to_dest}"
                    Exec.execute(cmd, raise_error=False)

                    # FORWARD: allow the DNATed traffic
                    fwd_cmd = f"sudo /usr/sbin/iptables -A FORWARD -i {src_if}"
                    fwd_cmd += f" -d {fwd.forward_ip} -p {proto}"
                    fwd_cmd += f" -m multiport --dports {fwd.forward_port or fwd.ports}"
                    fwd_cmd += " -j ACCEPT"
                    Exec.execute(fwd_cmd, raise_error=False)

                # POSTROUTING MASQUERADE: use outgoing interface IP so return traffic routes back
                if fwd.masquerade_source:
                    snat_cmd = f"sudo /usr/sbin/iptables -t nat -A POSTROUTING"
                    snat_cmd += f" -d {fwd.forward_ip} -p {proto}"
                    snat_cmd += f" -m multiport --dports {fwd.forward_port or fwd.ports}"
                    snat_cmd += " -j MASQUERADE"
                    Exec.execute(snat_cmd, raise_error=False)

        # ── Save rules persistently ──
        Exec.execute("sudo /usr/sbin/iptables-save | sudo /usr/bin/tee /etc/iptables/rules.v4 > /dev/null", raise_error=False)

        logger.log("Firewall rules applied.")

    @staticmethod
    def get_interface_chain(interface):
        """Get chain for an unknown interface (defaults to outside)."""
        from raspsec.dbmodels.firewall import ChainMapping
        try:
            return ChainMapping.objects.get(interface=interface).chain
        except ChainMapping.DoesNotExist:
            # Auto-assign unknown interfaces to outside
            ChainMapping.objects.create(interface=interface, chain="outside")
            return "outside"
