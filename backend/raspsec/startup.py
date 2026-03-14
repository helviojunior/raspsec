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
            log.exception("Environment file '.env' not found, creating a default one!")
            create_default_dot_env()
            os.kill(os.getpid(), signal.SIGTERM)

        # Ensure default superadmin exists
        _ensure_superadmin()

        from django.core.cache import cache
        cache.set("app:healthy", True, timeout=60)

        log.info("Startup ok.")
    except Exception:
        log.exception("Fail running startup tasks.")


def create_default_dot_env():
    dotenv_path = Path(settings.DATA_DIR) / ".env"
    private_key_path = Path(settings.DATA_DIR) / "rsa_private.pem"
    public_key_path = Path(settings.DATA_DIR) / "rsa_public.pem"

    data = {
        "SECRET_KEY": ''.join(
                random.choice(string.ascii_lowercase + string.ascii_uppercase + string.digits + string.punctuation)
                for _ in range(random.randint(60, 80)))
    }

    if not private_key_path.exists():
        data['RSA_PASSPHRASE'] = ''.join(
                random.choice(string.ascii_lowercase + string.ascii_uppercase + string.digits + string.punctuation)
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