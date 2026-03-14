from raspsec.libs.cmd import Exec
from raspsec.libs.log import StrataLogger

logger = StrataLogger("FirewallService")

CHAINS = ["RASPSEC_IMPLANT", "RASPSEC_INTERNAL", "RASPSEC_OUTSIDE"]

DEFAULT_CHAIN_MAPPINGS = {
    "eth0": "implant",
    "wlan0": "internal",
    "usb0": "internal",
}

DEFAULT_RULES = [
    {"chain": "internal", "protocol": "any", "port": "", "source_ip": "", "action": "allow", "priority": 0, "description": "Allow all from Internal"},
    {"chain": "outside", "protocol": "any", "port": "", "source_ip": "", "action": "deny", "priority": 0, "description": "Deny all from Outside"},
    {"chain": "implant", "protocol": "any", "port": "", "source_ip": "", "action": "deny", "priority": 0, "description": "Deny all from Implant"},
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

        # Default rules
        if not FirewallRule.objects.exists():
            for rule in DEFAULT_RULES:
                FirewallRule.objects.create(**rule)

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
            .values("id", "chain", "protocol", "port", "source_ip", "action", "priority", "description", "enabled")
        )

    @staticmethod
    def get_nat_rules():
        from raspsec.dbmodels.firewall import NatRule
        return list(
            NatRule.objects.all()
            .order_by("priority")
            .values("id", "source_chain", "dest_chain", "nat_type", "protocol", "port", "dest_ip", "dest_port", "priority", "description", "enabled")
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
            FirewallRule.objects.create(**fields)
        FirewallService.apply()

    @staticmethod
    def delete_rule(rule_id):
        from raspsec.dbmodels.firewall import FirewallRule
        FirewallRule.objects.filter(id=rule_id).delete()
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
            NatRule.objects.filter(id=rule_id).update(**fields)
        else:
            NatRule.objects.create(**fields)
        FirewallService.apply()

    @staticmethod
    def delete_nat_rule(rule_id):
        from raspsec.dbmodels.firewall import NatRule
        NatRule.objects.filter(id=rule_id).delete()
        FirewallService.apply()

    @staticmethod
    def apply():
        """Flush and rebuild all iptables rules from DB."""
        from raspsec.dbmodels.firewall import ChainMapping, FirewallRule, NatRule

        mappings = {m.interface: m.chain for m in ChainMapping.objects.all()}
        rules = FirewallRule.objects.filter(enabled=True).order_by("chain", "priority")
        nat_rules = NatRule.objects.filter(enabled=True).order_by("priority")

        logger.log("Applying firewall rules...")

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

        # ── NAT rules ──
        for nat in nat_rules:
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
