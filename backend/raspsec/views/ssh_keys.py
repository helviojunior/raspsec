import os
import re

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger

CONFIG_FILE = "ssh_keys.yml"
AUTHORIZED_KEYS = "/root/.ssh/authorized_keys"

DEFAULT_CONFIG = {"keys": []}

logger = StrataLogger("SSHKeysView")


def _sync_to_disk(keys):
    """Write all enabled keys to /root/.ssh/authorized_keys."""
    Exec.execute("sudo /bin/mkdir -p /root/.ssh", raise_error=False)
    lines = []
    for k in keys:
        if k.get("enabled", True) and k.get("key", "").strip():
            comment = k.get("name", "").strip()
            key_line = k["key"].strip()
            if comment and not key_line.endswith(comment):
                key_line = f"{key_line} {comment}"
            lines.append(key_line)

    content = "\n".join(lines) + "\n" if lines else ""
    from raspsec.libs.network import write_system_file
    write_system_file(AUTHORIZED_KEYS, content)
    Exec.execute(f"sudo /bin/chmod 600 {AUTHORIZED_KEYS}", raise_error=False)
    Exec.execute("sudo /bin/chmod 700 /root/.ssh", raise_error=False)
    logger.log(f"Synced {len(lines)} SSH keys to {AUTHORIZED_KEYS}")


class SSHKeysView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = load_config(CONFIG_FILE, DEFAULT_CONFIG)
        return Response({"keys": config.get("keys", [])})

    def post(self, request):
        """Add a new SSH key."""
        name = request.data.get("name", "").strip()
        key = request.data.get("key", "").strip()

        if not name:
            return Response({"detail": "Nome é obrigatório."}, status=400)
        if not key:
            return Response({"detail": "Chave SSH é obrigatória."}, status=400)
        if not re.match(r"^(ssh-rsa|ssh-ed25519|ecdsa-sha2-\S+|ssh-dss)\s", key):
            return Response({"detail": "Formato de chave SSH inválido."}, status=400)

        config = load_config(CONFIG_FILE, DEFAULT_CONFIG)
        keys = config.get("keys", [])

        # Check duplicate
        for k in keys:
            if k.get("key", "").split()[1:2] == key.split()[1:2]:
                return Response({"detail": "Esta chave já está cadastrada."}, status=400)

        keys.append({"name": name, "key": key, "enabled": True})
        save_config(CONFIG_FILE, {"keys": keys})
        _sync_to_disk(keys)

        return Response({"detail": f"Chave '{name}' adicionada."})

    def put(self, request):
        """Update a key (enable/disable or rename)."""
        index = request.data.get("index")
        if index is None:
            return Response({"detail": "Índice é obrigatório."}, status=400)

        config = load_config(CONFIG_FILE, DEFAULT_CONFIG)
        keys = config.get("keys", [])

        if index < 0 or index >= len(keys):
            return Response({"detail": "Índice inválido."}, status=400)

        if "name" in request.data:
            keys[index]["name"] = request.data["name"]
        if "enabled" in request.data:
            keys[index]["enabled"] = request.data["enabled"]

        save_config(CONFIG_FILE, {"keys": keys})
        _sync_to_disk(keys)

        return Response({"detail": "Chave atualizada."})

    def delete(self, request):
        """Remove a key by index."""
        index = request.data.get("index")
        if index is None:
            return Response({"detail": "Índice é obrigatório."}, status=400)

        config = load_config(CONFIG_FILE, DEFAULT_CONFIG)
        keys = config.get("keys", [])

        if index < 0 or index >= len(keys):
            return Response({"detail": "Índice inválido."}, status=400)

        removed = keys.pop(index)
        save_config(CONFIG_FILE, {"keys": keys})
        _sync_to_disk(keys)

        return Response({"detail": f"Chave '{removed.get('name', '')}' removida."})
