import logging
import os

log = logging.getLogger(__name__)

# SSH host key files that ssh-keygen -A generates
SSH_HOST_KEYS = [
    "/etc/ssh/ssh_host_rsa_key",
    "/etc/ssh/ssh_host_ecdsa_key",
    "/etc/ssh/ssh_host_ed25519_key",
]


def watchdog():
    """Periodic health check — runs every minute via django-crontab."""
    from raspsec.dbmodels.device_info import DeviceInfo
    from raspsec.dbmodels.service_status import ServiceStatus
    from raspsec.libs.cmd import Exec

    log.info("Watchdog running...")

    # ── 1. First boot: store MAC addresses ──
    _handle_first_boot(DeviceInfo, Exec)

    # ── 2. Ensure SSH host keys exist ──
    _ensure_ssh_keys(Exec)

    # ── 3. Ensure SSH service is enabled and running ──
    ssh_ok = _ensure_service(Exec, "ssh.service")

    # ── 4. Ensure DHCP server (dnsmasq) is running ──
    dhcp_ok = _ensure_service(Exec, "dnsmasq.service")

    # ── 5. Ensure WiFi AP (hostapd) is running ──
    ap_ok = _ensure_service(Exec, "hostapd.service")

    # ── Update managment-network status ──
    _update_managment_network(ServiceStatus, ssh_ok, dhcp_ok, ap_ok)

    # ── 6. Enable IPv4 forwarding and mark router as healthy ──
    _ensure_router(Exec, ServiceStatus)

    # ── 7. Check nginx for frontend status ──
    _check_frontend(Exec, ServiceStatus)

    # ── 8. Firewall (placeholder) ──
    _check_firewall(ServiceStatus)

    log.info("Watchdog complete.")


def _handle_first_boot(DeviceInfo, Exec):
    """On first boot, store the MAC addresses of eth0 and wlan0."""
    if DeviceInfo.objects.filter(key="first_boot_done").exists():
        return

    log.info("First boot detected — capturing MAC addresses.")

    # eth0 MAC
    eth0_mac = _read_mac("eth0", Exec)
    if eth0_mac:
        DeviceInfo.objects.update_or_create(
            key="mac_eth0", defaults={"value": eth0_mac}
        )

    # wlan0 MAC
    wlan0_mac = _read_mac("wlan0", Exec)
    if wlan0_mac:
        DeviceInfo.objects.update_or_create(
            key="mac_wlan0", defaults={"value": wlan0_mac}
        )

    # Mark first boot as done
    DeviceInfo.objects.create(key="first_boot_done", value="true")
    log.info(f"MAC addresses stored: eth0={eth0_mac}, wlan0={wlan0_mac}")


def _read_mac(interface, Exec):
    """Read MAC address from /sys/class/net/<iface>/address."""
    path = f"/sys/class/net/{interface}/address"
    if os.path.isfile(path):
        try:
            with open(path, "r") as f:
                return f.read().strip()
        except Exception as e:
            log.warning(f"Could not read MAC for {interface}: {e}")
    return ""


def _ensure_ssh_keys(Exec):
    """Generate SSH host keys if they don't exist."""
    missing = [k for k in SSH_HOST_KEYS if not os.path.isfile(k)]
    if missing:
        log.info("SSH host keys missing, generating...")
        Exec.execute("sudo /usr/bin/ssh-keygen -A", raise_error=False)


def _ensure_service(Exec, service_name):
    """Enable and start a systemd service. Returns True if active."""
    # Enable
    Exec.execute(
        f"sudo /usr/bin/systemctl enable {service_name}",
        raise_error=False,
    )

    # Check if active
    ret, out = Exec.execute(
        f"sudo /usr/bin/systemctl is-active {service_name}",
        raise_error=False,
    )

    if out.strip() == "active":
        return True

    # Not active — try to start
    log.info(f"{service_name} not active, starting...")
    ret, out = Exec.execute(
        f"sudo /usr/bin/systemctl start {service_name}",
        raise_error=False,
    )

    # Verify again
    ret, out = Exec.execute(
        f"sudo /usr/bin/systemctl is-active {service_name}",
        raise_error=False,
    )
    return out.strip() == "active"


def _update_managment_network(ServiceStatus, ssh_ok, dhcp_ok, ap_ok):
    """Update the managment-network service status based on checks."""
    try:
        svc = ServiceStatus.objects.get(slug="managment-network")
    except ServiceStatus.DoesNotExist:
        return

    all_ok = ssh_ok and dhcp_ok and ap_ok

    if all_ok:
        svc.status = ServiceStatus.Status.HEALTHY
        svc.message = "SSH, DHCP e AP operacionais."
    else:
        failures = []
        if not ssh_ok:
            failures.append("SSH")
        if not dhcp_ok:
            failures.append("DHCP (dnsmasq)")
        if not ap_ok:
            failures.append("AP (hostapd)")

        svc.status = ServiceStatus.Status.UNHEALTHY
        svc.message = f"Serviços com falha: {', '.join(failures)}"

    svc.save(update_fields=["status", "message", "updated"])


def _ensure_router(Exec, ServiceStatus):
    """Enable IPv4 forwarding via sysctl and mark router as healthy."""
    try:
        svc = ServiceStatus.objects.get(slug="router")
    except ServiceStatus.DoesNotExist:
        return

    # Enable ip_forward
    Exec.execute(
        "sudo /usr/sbin/sysctl -w net.ipv4.ip_forward=1",
        raise_error=False,
    )

    # Verify
    ret, out = Exec.execute(
        "/usr/sbin/sysctl -n net.ipv4.ip_forward",
        raise_error=False,
    )

    if out.strip() == "1":
        svc.status = ServiceStatus.Status.HEALTHY
        svc.message = "IPv4 forwarding habilitado."
    else:
        svc.status = ServiceStatus.Status.UNHEALTHY
        svc.message = "Falha ao habilitar IPv4 forwarding."

    svc.save(update_fields=["status", "message", "updated"])


def _check_frontend(Exec, ServiceStatus):
    """Check if nginx is active and mark frontend status accordingly."""
    try:
        svc = ServiceStatus.objects.get(slug="frontend")
    except ServiceStatus.DoesNotExist:
        return

    ret, out = Exec.execute(
        "sudo /usr/bin/systemctl is-active nginx.service",
        raise_error=False,
    )

    if out.strip() == "active":
        svc.status = ServiceStatus.Status.HEALTHY
        svc.message = "Nginx operacional."
    else:
        # Try to start
        Exec.execute(
            "sudo /usr/bin/systemctl start nginx.service",
            raise_error=False,
        )
        ret, out = Exec.execute(
            "sudo /usr/bin/systemctl is-active nginx.service",
            raise_error=False,
        )
        if out.strip() == "active":
            svc.status = ServiceStatus.Status.HEALTHY
            svc.message = "Nginx iniciado pelo watchdog."
        else:
            svc.status = ServiceStatus.Status.UNHEALTHY
            svc.message = "Falha ao iniciar Nginx."

    svc.save(update_fields=["status", "message", "updated"])


def _check_firewall(ServiceStatus):
    """Placeholder — mark firewall as healthy until actual rules are implemented."""
    try:
        svc = ServiceStatus.objects.get(slug="firewall")
    except ServiceStatus.DoesNotExist:
        return

    svc.status = ServiceStatus.Status.HEALTHY
    svc.message = "Aguardando implementação."
    svc.save(update_fields=["status", "message", "updated"])
