import re

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.libs.cmd import Exec
from raspsec.libs.log import StrataLogger

logger = StrataLogger("SystemConfig")


class SystemConfigView(APIView):
    """Get and update system-level settings (hostname, etc)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ret, out = Exec.execute("/usr/bin/hostname", raise_error=False)
        hostname = out.strip() if ret == 0 else ""
        return Response({"hostname": hostname})

    def put(self, request):
        hostname = request.data.get("hostname", "").strip().lower()

        if not hostname:
            return Response({"detail": "Hostname é obrigatório."}, status=400)
        if not re.match(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", hostname):
            return Response({"detail": "Hostname inválido. Use apenas letras minúsculas, números e hifens."}, status=400)

        # Apply hostname
        Exec.execute(f"sudo /usr/bin/hostnamectl set-hostname {hostname}", raise_error=False)
        Exec.execute(f"sudo /bin/bash -c 'echo {hostname} > /etc/hostname'", raise_error=False)

        # Update /etc/hosts
        Exec.execute(
            f"sudo /bin/sed -i 's/127\\.0\\.1\\.1.*/127.0.1.1\\t{hostname}/' /etc/hosts",
            raise_error=False,
        )

        logger.log(f"Hostname changed to {hostname}")
        return Response({"detail": f"Hostname alterado para '{hostname}'."})
