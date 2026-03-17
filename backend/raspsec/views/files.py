import os
import re
import time
import mimetypes

from django.http import FileResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.libs.cmd import Exec
from raspsec.libs.log import StrataLogger

logger = StrataLogger("FilesView")

DOWNLOADS_ROOT = "/app/data/downloads"
LOGS_SYMLINK = os.path.join(DOWNLOADS_ROOT, "logs")

# Files that should never be served
BLOCKED_EXTENSIONS = {".sh", ".py", ".pyc", ".pyo", ".env", ".key", ".pem"}


def _safe_resolve(user_path):
    """Resolve a user-supplied path safely within DOWNLOADS_ROOT.

    Returns the resolved absolute path, or None if it escapes the root.
    Follows symlinks (e.g. logs -> /var/log) but the *logical* prefix must
    still start with DOWNLOADS_ROOT so we only allow our own symlinks.
    """
    # Strip leading slashes to prevent absolute path bypass
    user_path = user_path.lstrip("/")

    # Reject null bytes (path injection)
    if "\x00" in user_path:
        return None

    # Normalise but do NOT resolve symlinks yet — we want the logical path
    joined = os.path.normpath(os.path.join(DOWNLOADS_ROOT, user_path))

    # The logical path must stay inside the root
    if not joined.startswith(DOWNLOADS_ROOT + "/") and joined != DOWNLOADS_ROOT:
        return None

    # Now resolve symlinks to get the real filesystem path
    real = os.path.realpath(joined)

    # The real path must be either inside DOWNLOADS_ROOT or inside /var/log
    # (our only allowed symlink target)
    allowed_roots = [
        os.path.realpath(DOWNLOADS_ROOT),
        "/var/log",
    ]
    if not any(
        real == root or real.startswith(root + "/")
        for root in allowed_roots
    ):
        return None

    return joined  # return the logical path for display, real for access


def _ensure_downloads_dir():
    """Ensure the downloads directory structure exists."""
    os.makedirs(DOWNLOADS_ROOT, exist_ok=True)
    os.makedirs(os.path.join(DOWNLOADS_ROOT, "captures"), exist_ok=True)
    os.makedirs(os.path.join(DOWNLOADS_ROOT, "startup_script"), exist_ok=True)

    # Create symlink for /var/log if it doesn't exist
    if not os.path.exists(LOGS_SYMLINK):
        try:
            os.symlink("/var/log", LOGS_SYMLINK)
        except OSError:
            # Might need sudo
            Exec.execute(
                f"sudo /bin/ln -sf /var/log {LOGS_SYMLINK}",
                raise_error=False,
            )


class FileListView(APIView):
    """List files and directories within the downloads directory."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_downloads_dir()

        rel_path = request.query_params.get("path", "")

        # Validate and resolve path
        abs_path = _safe_resolve(rel_path) if rel_path else DOWNLOADS_ROOT

        if abs_path is None:
            return Response({"detail": "Caminho inválido."}, status=400)

        # Follow symlinks to get to the real path for reading
        real_path = os.path.realpath(abs_path)

        if not os.path.isdir(real_path):
            return Response({"detail": "Diretório não encontrado."}, status=404)

        entries = []
        try:
            for name in sorted(os.listdir(real_path)):
                entry_path = os.path.join(real_path, name)
                try:
                    stat = os.stat(entry_path)
                except OSError:
                    continue

                is_dir = os.path.isdir(entry_path)
                is_link = os.path.islink(os.path.join(abs_path, name))

                entries.append({
                    "name": name,
                    "is_dir": is_dir,
                    "is_link": is_link,
                    "size": stat.st_size if not is_dir else None,
                    "modified": stat.st_mtime,
                })
        except PermissionError:
            # Use sudo ls for permission-restricted dirs (e.g. /var/log subdirs)
            ret, out = Exec.execute(
                f"sudo /bin/ls -la --time-style=+%s {real_path}",
                raise_error=False,
            )
            if ret == 0:
                for line in out.strip().splitlines()[1:]:  # skip "total" line
                    parts = line.split(None, 7)
                    if len(parts) < 8:
                        continue
                    perms = parts[0]
                    size_str = parts[4]
                    mtime_str = parts[5]
                    name = parts[7]
                    if name in (".", ".."):
                        continue
                    is_dir = perms.startswith("d")
                    is_link = perms.startswith("l")
                    if is_link and " -> " in name:
                        name = name.split(" -> ")[0]
                    try:
                        size = int(size_str) if not is_dir else None
                    except ValueError:
                        size = None
                    try:
                        mtime = float(mtime_str)
                    except ValueError:
                        mtime = 0
                    entries.append({
                        "name": name,
                        "is_dir": is_dir,
                        "is_link": is_link,
                        "size": size,
                        "modified": mtime,
                    })

        # Compute the display path (relative to DOWNLOADS_ROOT)
        if abs_path == DOWNLOADS_ROOT:
            display_path = ""
        else:
            display_path = os.path.relpath(abs_path, DOWNLOADS_ROOT)

        return Response({
            "path": display_path,
            "entries": entries,
        })


class FileDownloadView(APIView):
    """Download a file from the downloads directory."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_downloads_dir()

        rel_path = request.query_params.get("path", "")
        if not rel_path:
            return Response({"detail": "Caminho não informado."}, status=400)

        abs_path = _safe_resolve(rel_path)
        if abs_path is None:
            return Response({"detail": "Caminho inválido."}, status=400)

        real_path = os.path.realpath(abs_path)

        if os.path.isdir(real_path):
            return Response({"detail": "Não é possível baixar diretórios."}, status=400)

        # Check if file exists (try with sudo for permission-restricted files)
        if not os.path.isfile(real_path):
            # May need sudo to check
            ret, _ = Exec.execute(f"sudo /usr/bin/test -f {real_path}", raise_error=False)
            if ret != 0:
                return Response({"detail": "Arquivo não encontrado."}, status=404)

        filename = os.path.basename(real_path)

        # Block sensitive file types
        _, ext = os.path.splitext(filename)
        if ext.lower() in BLOCKED_EXTENSIONS:
            return Response({"detail": "Tipo de arquivo bloqueado."}, status=403)

        # Force application/octet-stream for extensionless files so browsers
        # don't try to append .txt or similar
        _, ext = os.path.splitext(filename)
        content_type = mimetypes.guess_type(filename)[0] if ext else None
        if not content_type:
            content_type = "application/octet-stream"

        # For files we can read directly
        try:
            fd = open(real_path, "rb")
            response = FileResponse(
                fd,
                content_type=content_type,
                as_attachment=True,
                filename=filename,
            )
            # Ensure header is accessible to frontend JS
            response["Access-Control-Expose-Headers"] = "Content-Disposition"
            return response
        except PermissionError:
            # Copy to temp with sudo then serve
            tmp_path = f"/tmp/raspsec_dl_{os.getpid()}_{filename}"
            ret, out = Exec.execute(
                f"sudo /bin/cp {real_path} {tmp_path} && sudo /bin/chmod 644 {tmp_path}",
                raise_error=False,
            )
            if ret != 0:
                return Response({"detail": f"Erro ao ler arquivo: {out}"}, status=500)

            fd = open(tmp_path, "rb")
            response = FileResponse(
                fd,
                content_type=content_type,
                as_attachment=True,
                filename=filename,
            )
            response["Access-Control-Expose-Headers"] = "Content-Disposition"
            # Django FileResponse closes fd, we just need to clean up tmp
            response._tmp_path = tmp_path
            return response


class FileDeleteView(APIView):
    """Delete a file from the downloads directory (not symlinked dirs)."""
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        _ensure_downloads_dir()

        rel_path = request.data.get("path", "")
        if not rel_path:
            return Response({"detail": "Caminho não informado."}, status=400)

        abs_path = _safe_resolve(rel_path)
        if abs_path is None:
            return Response({"detail": "Caminho inválido."}, status=400)

        real_path = os.path.realpath(abs_path)

        # Do NOT allow deleting inside /var/log (symlinked logs dir)
        if real_path.startswith("/var/log"):
            return Response({"detail": "Não é permitido apagar arquivos de log do sistema."}, status=403)

        if os.path.isdir(real_path):
            return Response({"detail": "Não é permitido apagar diretórios."}, status=403)

        if not os.path.isfile(real_path):
            return Response({"detail": "Arquivo não encontrado."}, status=404)

        try:
            os.unlink(real_path)
        except PermissionError:
            Exec.execute(f"sudo /bin/rm -f {real_path}", raise_error=False)

        logger.log(f"File deleted: {rel_path}")
        return Response({"detail": "Arquivo removido."})
