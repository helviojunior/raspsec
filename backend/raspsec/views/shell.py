import os
import subprocess

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class ShellExecView(APIView):
    """Execute a shell command as the service user and return output."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cmd = request.data.get("cmd", "").strip()
        cwd = request.data.get("cwd", "").strip() or os.path.expanduser("~")

        if not cmd:
            return Response({"output": "", "cwd": cwd, "code": 0})

        if not os.path.isdir(cwd):
            cwd = os.path.expanduser("~")

        # Handle cd command to update cwd
        if cmd == "cd" or cmd.startswith("cd "):
            target = cmd[3:].strip() if cmd.startswith("cd ") else ""
            if not target or target == "~":
                new_cwd = os.path.expanduser("~")
            elif target.startswith("/"):
                new_cwd = target
            elif target.startswith("~"):
                new_cwd = os.path.expanduser(target)
            else:
                new_cwd = os.path.join(cwd, target)

            new_cwd = os.path.realpath(new_cwd)

            if os.path.isdir(new_cwd):
                return Response({"output": "", "cwd": new_cwd, "code": 0})
            else:
                return Response({
                    "output": f"bash: cd: {target}: No such file or directory\n",
                    "cwd": cwd,
                    "code": 1,
                })

        env = os.environ.copy()
        env["TERM"] = "dumb"
        env["COLUMNS"] = "200"

        try:
            proc = subprocess.run(
                cmd,
                shell=True,
                cwd=cwd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            stdout = proc.stdout.decode("utf-8", errors="replace")
            stderr = proc.stderr.decode("utf-8", errors="replace")
            return Response({
                "output": stdout,
                "stderr": stderr,
                "cwd": cwd,
                "code": proc.returncode,
            })
        except subprocess.TimeoutExpired:
            return Response({
                "output": "",
                "stderr": "Command timed out (30s limit).\n",
                "cwd": cwd,
                "code": 124,
            })
        except Exception as e:
            return Response({
                "output": "",
                "stderr": f"Error: {str(e)}\n",
                "cwd": cwd,
                "code": 1,
            })


class ShellInfoView(APIView):
    """Return shell session info (user, hostname, home dir)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import socket
        return Response({
            "user": os.environ.get("USER", "stratasec"),
            "hostname": socket.gethostname(),
            "home": os.path.expanduser("~"),
            "cwd": os.path.expanduser("~"),
        })
