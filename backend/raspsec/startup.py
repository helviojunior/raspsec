import os
import sys
import logging
import random
import signal
import string
from pathlib import Path
from django.conf import settings

log = logging.getLogger(__name__)

# Flag de módulo para evitar execuções repetidas no mesmo processo
_ALREADY_RAN = False

# Comandos do manage.py que NÃO devem disparar o startup
_SKIP_COMMANDS = {
    "collectstatic", "migrate", "makemigrations", "showmigrations",
    "check", "shell", "dbshell", "inspectdb", "flush",
    "createsuperuser", "changepassword", "compilemessages",
    "makemessages", "squashmigrations", "test", "sendtestemail",
    "crontab",
}


def _should_run_now() -> bool:
    """
    Garante que on_startup só execute quando o app está servindo via
    WSGI/ASGI (gunicorn, uwsgi, daphne, runserver), e não durante
    comandos de build/manage (collectstatic, migrate, etc.).
    """
    # Gunicorn, uwsgi, daphne etc. não passam por manage.py —
    # sys.argv[0] não será manage.py, então permitimos a execução.
    if len(sys.argv) > 0 and os.path.basename(sys.argv[0]) in ("manage.py", "django-admin"):
        command = sys.argv[1] if len(sys.argv) > 1 else ""
        if command in _SKIP_COMMANDS:
            return False
        # runserver em DEV: só roda no processo filho (evita execução dupla do autoreloader)
        if command == "runserver" and settings.DEBUG:
            return os.environ.get("RUN_MAIN") == "true" or os.environ.get("WERKZEUG_RUN_MAIN") == "true"

    return True


def _ensure_superadmin():
    """Create default superadmin if no admin user exists."""
    from raspsec.models import User
    if not User.objects.filter(is_admin=True).exists():
        User.objects.create_superuser(
            username='stratasec',
            password='@Pass123',
            first_name='StrataSec',
            last_name='Admin',
        )
        log.info("Default superadmin 'stratasec' created.")


def on_startup():
    global _ALREADY_RAN
    if _ALREADY_RAN:
        return
    if not _should_run_now():
        return
    _ALREADY_RAN = True

    try:
        log.info("Running startup tasks...")

        env_path = Path(settings.DATA_DIR) / ".env"
        if not env_path.exists():
            log.warning("Environment file '.env' not found, creating a default one.")
            create_default_dot_env()
            if env_path.exists():
                log.info(".env created, restarting to load new settings...")
                os.kill(os.getpid(), signal.SIGTERM)
            else:
                log.error("Failed to create .env — check /app/data permissions")
                return

        # Ensure default superadmin exists
        _ensure_superadmin()

        # Ensure default services exist (status is updated by watchdog cron)
        _ensure_services()

        # Ensure firewall defaults
        _ensure_firewall_defaults()

        # Verify and fix boot configs before applying network
        _verify_boot_configs()

        # Ensure downloads directory structure
        _ensure_downloads_dir()

        # Apply network configurations
        _apply_network_configs()

        # Start watchdog cron
        _start_watchdog()

        # Run watchdog immediately so services are healthy before first cron tick
        _run_watchdog_now()

        from django.core.cache import cache
        cache.set("app:healthy", True, timeout=60)

        log.info("Startup ok.")
    except Exception:
        log.exception("Fail running startup tasks.")


DEFAULT_SERVICES = [
    {"slug": "managment-network", "friendly_name": "Management Network", "required": True},
    {"slug": "router",            "friendly_name": "Router",             "required": True},
    {"slug": "frontend",          "friendly_name": "Frontend",           "required": True},
    {"slug": "firewall",          "friendly_name": "Firewall",           "required": True},
]


def _ensure_services():
    """Create default services if they don't exist."""
    from raspsec.models import ServiceStatus
    for svc in DEFAULT_SERVICES:
        ServiceStatus.objects.get_or_create(
            slug=svc["slug"],
            defaults={
                "friendly_name": svc["friendly_name"],
                "required": svc["required"],
                "status": ServiceStatus.Status.UNHEALTHY,
                "message": "",
            },
        )
    log.info("Default services ensured.")


def _reset_service_status():
    """Reset all services to Unhealthy on startup."""
    from raspsec.models import ServiceStatus
    ServiceStatus.objects.all().update(
        status=ServiceStatus.Status.UNHEALTHY,
        message="Aguardando watchdog...",
    )
    log.info("All service statuses reset to Unhealthy.")


def _ensure_firewall_defaults():
    """Create default firewall chain mappings and rules."""
    try:
        from raspsec.services.firewall import FirewallService
        FirewallService.ensure_defaults()
        log.info("Firewall defaults ensured.")
    except Exception as e:
        log.warning(f"Failed to ensure firewall defaults: {e}")


def _verify_boot_configs():
    """Verify and auto-fix boot configurations (config.txt, rfkill, etc)."""
    try:
        from raspsec.libs.boot_check import verify_and_fix, detect_pi_model
        pi_info = detect_pi_model()
        if pi_info["raw"]:
            log.info(f"Detected board: {pi_info['raw']}")
        remaining = verify_and_fix(runtime=True, sudo=True)
        for level, msg in remaining:
            if level == "warn":
                log.warning(f"Boot check: {msg}")
            elif level == "error":
                log.error(f"Boot check: {msg}")
        log.info("Boot config verification complete.")
    except Exception as e:
        log.warning(f"Failed to verify boot configs: {e}")


def _ensure_downloads_dir():
    """Create the downloads directory structure and symlinks."""
    try:
        from raspsec.views.files import _ensure_downloads_dir as ensure
        ensure()
        log.info("Downloads directory ready.")
    except Exception as e:
        log.warning(f"Failed to setup downloads dir: {e}")


def _apply_network_configs():
    """Apply saved network configurations on boot."""
    try:
        from raspsec.services.wifi import WifiService
        WifiService.apply_config()
        log.info("WiFi config applied.")

        # If AP is disabled, check for auto-connect WiFi client profile
        config = WifiService.get_config()
        if not config["ap"].get("enabled"):
            from raspsec.services.wifi_client import WifiClientService
            profile = WifiClientService.get_auto_connect_profile("wlan0")
            if profile:
                try:
                    WifiClientService.connect("wlan0", profile)
                    log.info(f"WiFi client auto-connected to {profile.get('ssid')}")
                except Exception as e:
                    log.warning(f"WiFi client auto-connect failed: {e}")
            else:
                # Fallback: restore from existing wpa_supplicant config
                import os
                wpa_conf = "/etc/wpa_supplicant/wpa_supplicant-wlan0.conf"
                if os.path.exists(wpa_conf):
                    from raspsec.libs.cmd import Exec
                    Exec.execute("sudo /sbin/ip link set wlan0 up", raise_error=False)
                    Exec.execute(
                        f"sudo /usr/sbin/wpa_supplicant -B -i wlan0 -c {wpa_conf} -D nl80211,wext",
                        raise_error=False,
                    )
                    Exec.execute("sudo /sbin/dhclient wlan0", raise_error=False)
                    log.info("WiFi client mode restored from saved config.")
    except Exception as e:
        log.warning(f"Failed to apply WiFi config: {e}")

    try:
        from raspsec.services.usb_gadget import UsbGadgetService
        UsbGadgetService.apply_config()
        log.info("USB Gadget config applied.")
    except Exception as e:
        log.warning(f"Failed to apply USB Gadget config: {e}")

    try:
        from raspsec.services.iface_names import IfaceNamesService
        IfaceNamesService.sync_current_interfaces()
        log.info("Interface names synced.")
    except Exception as e:
        log.warning(f"Failed to sync interface names: {e}")

    try:
        from raspsec.services.eth_server import EthServerService
        EthServerService.apply_config()
        log.info("Eth Server config applied.")
    except Exception as e:
        log.warning(f"Failed to apply Eth Server config: {e}")

    try:
        from raspsec.services.static_routes import StaticRoutesService
        StaticRoutesService.apply()
        log.info("Static routes applied.")
    except Exception as e:
        log.warning(f"Failed to apply static routes: {e}")

    try:
        from raspsec.services.dns import DnsService
        DnsService.apply_on_boot()
        log.info("DNS config applied.")
    except Exception as e:
        log.warning(f"Failed to apply DNS config: {e}")

    try:
        from raspsec.services.vlan import VlanService
        VlanService.apply_on_boot()
        log.info("VLAN config applied.")
    except Exception as e:
        log.warning(f"Failed to apply VLAN config: {e}")

    try:
        from raspsec.services.bridge import BridgeService
        BridgeService.apply_on_boot()
        log.info("Bridge config applied.")
    except Exception as e:
        log.warning(f"Failed to apply bridge config: {e}")

    try:
        from raspsec.services.firewall import FirewallService
        FirewallService.apply()
        log.info("Firewall rules applied.")
    except Exception as e:
        log.warning(f"Failed to apply firewall rules: {e}")


def _start_watchdog():
    """Register and start the watchdog cron job."""
    from django.core.management import call_command
    try:
        call_command("crontab", "add")
        log.info("Watchdog cron job registered.")
    except Exception as e:
        log.warning(f"Could not register crontab: {e}")


def _run_watchdog_now():
    """Run watchdog immediately so services are healthy on startup."""
    try:
        from raspsec.cron import watchdog
        watchdog()
        log.info("Initial watchdog run complete.")
    except Exception as e:
        log.warning(f"Initial watchdog run failed: {e}")


def create_default_dot_env():
    dotenv_path = Path(settings.DATA_DIR) / ".env"
    private_key_path = Path(settings.DATA_DIR) / "rsa_private.pem"
    public_key_path = Path(settings.DATA_DIR) / "rsa_public.pem"

    data = {
        "SECRET_KEY": ''.join(
                random.choice(string.ascii_lowercase + string.ascii_uppercase + string.punctuation + '!@#$*()_-')
                for _ in range(random.randint(60, 80)))
    }

    if not private_key_path.exists():
        data['RSA_PASSPHRASE'] = ''.join(
                random.choice(string.ascii_lowercase + string.ascii_uppercase + string.punctuation + '!@#$*()_-')
                for _ in range(random.randint(40, 60)))
        data['RSA_KEY_PATH'] = private_key_path.name
        generate_rsa_keypair(str(private_key_path), str(public_key_path), data['RSA_PASSPHRASE'])
        with open(public_key_path, 'r', encoding="UTF-8") as fpub:
            pk = fpub.read()
            pk = pk.replace('-----BEGIN PUBLIC KEY-----', '')
            pk = pk.replace('-----END PUBLIC KEY-----', '')
            pk = pk.replace('\r', '').replace('\n', '')
        data['RSA_PUB_KEY'] = pk
        try:
            os.unlink(public_key_path)
        except Exception:
            pass

    default_config = "\n".join(
        f"{k}={v}"
        for k, v in data.items()
    )
    with open(dotenv_path, 'w', encoding="UTF-8") as f:
        f.write(default_config)
        f.write("\n")

    try:
        # Em sistemas POSIX, restringe leitura da chave privada ao usuário
        dotenv_path.chmod(0o600)
    except Exception:
        pass  # Ignora em sistemas que não suportam chmod


def generate_rsa_keypair(
    private_key_path: str | Path = "rsa_private.pem",
    public_key_path: str | Path = "rsa_public.pem",
    passphrase: str | None = None,
) -> None:
    """
    Gera um par de chaves RSA 4096 bits e salva em disco (PEM).
    Se 'passphrase' for fornecida, a chave privada é cifrada no PEM.
    """
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)

    # Serializar chave privada (PEM), opcionalmente com criptografia
    if passphrase:
        encryption_algo = serialization.BestAvailableEncryption(passphrase.encode("utf-8"))
    else:
        encryption_algo = serialization.NoEncryption()

    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=encryption_algo,
    )

    # Serializar chave pública (PEM)
    public_key = private_key.public_key()
    pub_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    # Salvar em disco com permissões razoáveis
    private_key_path = Path(private_key_path)
    public_key_path = Path(public_key_path)
    private_key_path.write_bytes(priv_pem)
    public_key_path.write_bytes(pub_pem)

    try:
        # Em sistemas POSIX, restringe leitura da chave privada ao usuário
        private_key_path.chmod(0o600)
    except Exception:
        pass  # Ignora em sistemas que não suportam chmod