import ipaddress
import os
import re
import socket

from raspsec.libs.cmd import Exec
from raspsec.libs.log import StrataLogger

NAMED_OPTIONS = "/etc/bind/named.conf.options"

RFC1918_ACLS = [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
]

logger = StrataLogger("DnsService")


class DnsService:

    @staticmethod
    def get_servers():
        """Return all DNS servers ordered by priority."""
        from raspsec.dbmodels.dns_server import DnsServer
        return list(
            DnsServer.objects.all()
            .order_by("priority", "ip")
            .values("id", "ip", "source", "enabled", "status", "priority")
        )

    @staticmethod
    def save_servers(servers_data):
        """Save server list from API (ordered by priority, with enabled flag)."""
        from raspsec.dbmodels.dns_server import DnsServer

        for i, s in enumerate(servers_data):
            DnsServer.objects.update_or_create(
                ip=s["ip"],
                defaults={
                    "source": s.get("source", "manual"),
                    "enabled": s.get("enabled", True),
                    "priority": i,
                },
            )

        DnsService._apply_all()

    @staticmethod
    def sync_from_dhcp():
        """Discover DNS servers and merge into DB (preserving user overrides)."""
        from raspsec.dbmodels.dns_server import DnsServer

        discovered = DnsService._discover_dns_servers()
        existing_ips = set(DnsServer.objects.values_list("ip", flat=True))
        has_manual = DnsServer.objects.filter(source="manual").exists()

        changed = False

        # Add newly discovered servers
        max_priority = (DnsServer.objects.order_by("-priority").values_list("priority", flat=True).first() or -1) + 1
        for ip, source in discovered.items():
            if ip not in existing_ips:
                # Auto-sort: private IPs get lower priority number (higher priority)
                if not has_manual and _is_private_ip(ip):
                    pri = 0
                else:
                    pri = max_priority
                    max_priority += 1

                DnsServer.objects.create(
                    ip=ip, source=source, enabled=True, priority=pri,
                )
                changed = True

        # Remove servers no longer present (skip manually added ones)
        current_ips = set(discovered.keys())
        removed = DnsServer.objects.exclude(source="manual").exclude(ip__in=current_ips)
        if removed.exists():
            removed.delete()
            changed = True

        # Re-number priorities if no manual ordering was ever set
        if changed and not has_manual:
            DnsService._auto_sort_priorities()

        if changed:
            DnsService._apply_all()
            logger.log("DNS servers synced from DHCP.")

        return DnsService.get_servers()

    @staticmethod
    def health_check():
        """UDP port 53 keep-alive check for each DNS server."""
        from raspsec.dbmodels.dns_server import DnsServer

        for server in DnsServer.objects.all():
            alive = _dns_probe(server.ip)
            new_status = "up" if alive else "down"
            if server.status != new_status:
                server.status = new_status
                server.save(update_fields=["status", "updated"])

        return DnsService.get_servers()

    @staticmethod
    def apply_on_boot():
        """Re-apply BIND config and routes from DB on boot."""
        from raspsec.dbmodels.dns_server import DnsServer
        if DnsServer.objects.exists():
            DnsService._apply_all()
            logger.log("DNS config applied on boot from DB.")

    # ── Internal ──

    @staticmethod
    def _auto_sort_priorities():
        """Re-number priorities: private IPs first, then public."""
        from raspsec.dbmodels.dns_server import DnsServer

        servers = list(DnsServer.objects.all().order_by("priority", "ip"))
        servers.sort(key=lambda s: (0 if _is_private_ip(s.ip) else 1, s.ip))
        for i, s in enumerate(servers):
            if s.priority != i:
                s.priority = i
                s.save(update_fields=["priority", "updated"])

    @staticmethod
    def _apply_all():
        """Write BIND config, apply static routes, reload BIND."""
        servers = DnsService.get_servers()
        DnsService._write_bind_config(servers)
        DnsService._apply_static_routes(servers)
        DnsService._reload_bind()

    @staticmethod
    def _discover_dns_servers():
        """Discover DNS servers from DHCP leases on all interfaces."""
        discovered = {}

        # Parse /etc/resolv.conf
        if os.path.isfile("/etc/resolv.conf"):
            try:
                with open("/etc/resolv.conf", "r") as f:
                    for line in f:
                        m = re.match(r'^\s*nameserver\s+([\d.]+)', line)
                        if m:
                            ip = m.group(1)
                            if ip not in ("127.0.0.1", "::1"):
                                discovered[ip] = "resolv.conf"
            except Exception:
                pass

        # Parse dhcpcd lease files
        lease_dir = "/var/lib/dhcpcd"
        if os.path.isdir(lease_dir):
            for fname in os.listdir(lease_dir):
                if fname.endswith(".lease"):
                    iface = fname.replace(".lease", "").replace("dhcpcd-", "")
                    try:
                        with open(os.path.join(lease_dir, fname), "r") as f:
                            for line in f:
                                m = re.match(r'^\s*domain_name_servers\s*=\s*(.*)', line)
                                if m:
                                    for ip in re.findall(r'[\d.]+', m.group(1)):
                                        if ip not in ("127.0.0.1",):
                                            discovered[ip] = iface
                    except Exception:
                        pass

        # resolvectl (systemd-resolved)
        ret, out = Exec.execute(
            "/usr/bin/resolvectl dns 2>/dev/null || true",
            raise_error=False,
        )
        if ret == 0 and out.strip():
            for line in out.strip().splitlines():
                m = re.match(r'.*\((\w+)\):\s+(.*)', line)
                if m:
                    iface = m.group(1)
                    for ip in re.findall(r'[\d.]+', m.group(2)):
                        if ip not in ("127.0.0.1",):
                            discovered[ip] = iface

        return discovered

    # ── BIND9 config ──

    @staticmethod
    def _write_bind_config(servers):
        """Write BIND9 named.conf.options with forwarders and ACLs."""
        enabled = [s for s in servers if s.get("enabled", True)]
        forwarders = "".join(f"        {s['ip']};\n" for s in enabled)
        acl_entries = "".join(f"        {net};\n" for net in RFC1918_ACLS)

        content = (
            '// RaspSec managed — do not edit manually\n'
            'acl "private-nets" {\n'
            f'{acl_entries}'
            '};\n\n'
            'options {\n'
            '    directory "/var/cache/bind";\n\n'
            '    forwarders {\n'
            f'{forwarders}'
            '    };\n\n'
            '    forward only;\n\n'
            '    allow-query { localhost; private-nets; };\n'
            '    allow-recursion { localhost; private-nets; };\n\n'
            '    dnssec-validation auto;\n'
            '    listen-on { any; };\n'
            '    listen-on-v6 { none; };\n'
            '};\n'
        )

        logger.log(f"Writing BIND config to {NAMED_OPTIONS}")
        _write_system_file(NAMED_OPTIONS, content)

    # ── Static routes ──

    @staticmethod
    def _apply_static_routes(servers):
        """Add static routes for each enabled DNS server via its source interface gateway."""
        for server in servers:
            if not server.get("enabled", True):
                continue
            ip = server["ip"]
            source = server.get("source", "")
            if source and source not in ("resolv.conf", "manual"):
                ret, out = Exec.execute(
                    f"/sbin/ip route show default dev {source}",
                    raise_error=False,
                )
                gw_match = re.search(r'via\s+([\d.]+)', out)
                if gw_match:
                    gw = gw_match.group(1)
                    Exec.execute(
                        f"sudo /sbin/ip route replace {ip}/32 via {gw} dev {source}",
                        raise_error=False,
                    )

    @staticmethod
    def _reload_bind():
        Exec.execute("sudo /usr/bin/systemctl reload-or-restart bind9.service", raise_error=False)


# ── Helpers ──

def _is_private_ip(ip_str):
    try:
        return ipaddress.ip_address(ip_str).is_private
    except ValueError:
        return False


def _write_system_file(path, content):
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".conf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    Exec.execute(f"sudo /bin/cp {tmp_path} {path}")
    Exec.execute(f"/bin/rm -f {tmp_path}", raise_error=False)


def _dns_probe(ip, timeout=3):
    query = (
        b'\x12\x34\x01\x00\x00\x01\x00\x00'
        b'\x00\x00\x00\x00\x00\x00\x01\x00\x01'
    )
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        sock.sendto(query, (ip, 53))
        data, _ = sock.recvfrom(512)
        sock.close()
        return len(data) > 0
    except Exception:
        try:
            sock.close()
        except Exception:
            pass
        return False
