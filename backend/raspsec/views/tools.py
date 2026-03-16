import re
import subprocess
import os
import tempfile
import signal
import time

from django.http import FileResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# Active captures: { session_id: { pid, pcap_path, interface, filter, started } }
_active_captures = {}


def _run(cmd, timeout=30):
    """Run a command and return output."""
    env = os.environ.copy()
    env["TERM"] = "dumb"
    env["COLUMNS"] = "200"
    env["PATH"] = (
        "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:"
        + env.get("PATH", "")
    )
    try:
        proc = subprocess.run(
            cmd, shell=True, cwd="/tmp", env=env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=timeout,
        )
        return {
            "output": (proc.stdout + proc.stderr).decode("utf-8", errors="replace"),
            "code": proc.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"output": f"Command timed out ({timeout}s limit).\n", "code": 124}
    except Exception as e:
        return {"output": f"Error: {e}\n", "code": 1}


def _safe_host(value):
    """Validate hostname/IP to prevent injection."""
    if not value:
        return None
    if not re.match(r'^[a-zA-Z0-9._:-]+$', value):
        return None
    return value


class DeviceStatusView(APIView):
    """Return ifconfig -a output."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        result = _run("/sbin/ifconfig -a")
        return Response(result)


class PingView(APIView):
    """Ping a host."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        host = _safe_host(request.data.get("host", ""))
        if not host:
            return Response({"output": "Host inválido.\n", "code": 1}, status=400)

        count = min(int(request.data.get("count", 4)), 20)
        interface = _safe_host(request.data.get("interface", ""))

        cmd = f"/bin/ping -c {count} -W 3"
        if interface:
            cmd += f" -I {interface}"
        cmd += f" {host}"

        result = _run(cmd, timeout=count * 5 + 10)
        return Response(result)


class DnsCheckView(APIView):
    """DNS lookup."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        host = _safe_host(request.data.get("host", ""))
        if not host:
            return Response({"output": "Host inválido.\n", "code": 1}, status=400)

        record_type = request.data.get("type", "A").upper()
        if record_type not in ("A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA", "PTR", "SRV"):
            record_type = "A"

        server = _safe_host(request.data.get("server", ""))

        # Try dig first, fall back to nslookup, then host
        if os.path.isfile("/usr/bin/dig"):
            cmd = f"/usr/bin/dig {host} {record_type}"
            if server:
                cmd += f" @{server}"
            cmd += " +short +noall +answer +authority"
        elif os.path.isfile("/usr/bin/nslookup"):
            cmd = f"/usr/bin/nslookup -type={record_type} {host}"
            if server:
                cmd += f" {server}"
        elif os.path.isfile("/usr/bin/host"):
            cmd = f"/usr/bin/host -t {record_type} {host}"
            if server:
                cmd += f" {server}"
        else:
            return Response({"output": "Nenhuma ferramenta DNS encontrada (dig/nslookup/host).\n", "code": 1})

        result = _run(cmd, timeout=15)
        return Response(result)


class HttpCheckView(APIView):
    """HTTP connectivity check."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        url = request.data.get("url", "").strip()
        if not url:
            return Response({"output": "URL inválida.\n", "code": 1}, status=400)

        # Basic URL validation
        if not re.match(r'^https?://', url):
            url = "http://" + url

        # Sanitize — only allow safe chars in URL
        if not re.match(r'^https?://[a-zA-Z0-9._/:%?&=@#~+,-]+$', url):
            return Response({"output": "URL contém caracteres inválidos.\n", "code": 1}, status=400)

        method = request.data.get("method", "GET").upper()
        if method not in ("GET", "HEAD"):
            method = "GET"

        flag = "-I" if method == "HEAD" else "-i"
        result = _run(
            f"/usr/bin/curl -sS {flag} -o /dev/null -w "
            f"'HTTP/%{{http_version}} %{{http_code}}\\n"
            f"Time: %{{time_total}}s\\n"
            f"DNS: %{{time_namelookup}}s\\n"
            f"Connect: %{{time_connect}}s\\n"
            f"TLS: %{{time_appconnect}}s\\n"
            f"TTFB: %{{time_starttransfer}}s\\n"
            f"Size: %{{size_download}} bytes\\n"
            f"IP: %{{remote_ip}}:%{{remote_port}}\\n' "
            f"--max-time 15 --connect-timeout 10 '{url}'",
            timeout=20,
        )
        return Response(result)


class TracerouteView(APIView):
    """Traceroute to a host."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        host = _safe_host(request.data.get("host", ""))
        if not host:
            return Response({"output": "Host inválido.\n", "code": 1}, status=400)

        max_hops = min(int(request.data.get("max_hops", 20)), 30)

        # Use traceroute if available, otherwise fall back to tracepath
        if os.path.isfile("/usr/sbin/traceroute"):
            cmd = f"sudo /usr/sbin/traceroute -n -m {max_hops} -w 3 {host}"
        elif os.path.isfile("/usr/bin/traceroute"):
            cmd = f"sudo /usr/bin/traceroute -n -m {max_hops} -w 3 {host}"
        elif os.path.isfile("/usr/bin/tracepath"):
            cmd = f"/usr/bin/tracepath -n -m {max_hops} {host}"
        else:
            return Response({"output": "Nenhuma ferramenta de traceroute encontrada.\n", "code": 1})

        result = _run(cmd, timeout=max_hops * 5 + 10)
        return Response(result)


# ── Packet Capture ──

CAPTURE_DIR = "/tmp/raspsec_captures"


def _valid_iface(name):
    return bool(name) and re.match(r"^[a-zA-Z0-9._-]+$", name)


def _safe_filter(value):
    """Sanitize BPF filter — allow only safe characters."""
    if not value:
        return ""
    # BPF filters use: alphanumeric, spaces, dots, colons, slashes,
    # parentheses, and/or/not, comparison operators
    if not re.match(r'^[a-zA-Z0-9 ._:/\-()!<>=&|]+$', value):
        return ""
    return value


class CaptureStartView(APIView):
    """Start a tcpdump capture."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        interface = request.data.get("interface", "")
        bpf_filter = _safe_filter(request.data.get("filter", ""))
        max_packets = min(int(request.data.get("max_packets", 0)), 100000)

        if not _valid_iface(interface):
            return Response({"detail": "Interface inválida."}, status=400)

        # Check if there's already an active capture
        _cleanup_dead_captures()
        if _active_captures:
            return Response(
                {"detail": "Já existe uma captura em andamento. Pare-a antes de iniciar outra."},
                status=409,
            )

        # Create capture directory
        os.makedirs(CAPTURE_DIR, exist_ok=True)

        # Generate unique pcap filename
        ts = time.strftime("%Y%m%d_%H%M%S")
        pcap_path = os.path.join(CAPTURE_DIR, f"capture_{interface}_{ts}.pcap")

        # Build tcpdump command
        cmd = f"sudo /usr/sbin/tcpdump -i {interface} -w {pcap_path}"
        if max_packets > 0:
            cmd += f" -c {max_packets}"
        if bpf_filter:
            cmd += f" {bpf_filter}"

        env = os.environ.copy()
        env["PATH"] = (
            "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:"
            + env.get("PATH", "")
        )

        try:
            proc = subprocess.Popen(
                cmd, shell=True, cwd="/tmp", env=env,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
        except Exception as e:
            return Response({"detail": f"Erro ao iniciar tcpdump: {e}"}, status=500)

        session_id = str(proc.pid)
        _active_captures[session_id] = {
            "pid": proc.pid,
            "proc": proc,
            "pcap_path": pcap_path,
            "interface": interface,
            "filter": bpf_filter,
            "started": time.time(),
        }

        return Response({
            "session_id": session_id,
            "interface": interface,
            "filter": bpf_filter,
            "pcap_path": pcap_path,
        })


class CaptureStatusView(APIView):
    """Get status of active capture."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _cleanup_dead_captures()

        if not _active_captures:
            return Response({"active": False})

        session_id, cap = next(iter(_active_captures.items()))
        elapsed = time.time() - cap["started"]

        # Get file size
        pcap_size = 0
        if os.path.isfile(cap["pcap_path"]):
            pcap_size = os.path.getsize(cap["pcap_path"])

        # Get packet count from stderr (tcpdump prints stats there)
        packets = 0
        proc = cap.get("proc")
        if proc and proc.poll() is not None:
            # Process ended — read stderr for stats
            stderr = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
            match = re.search(r"(\d+) packets captured", stderr)
            if match:
                packets = int(match.group(1))

        return Response({
            "active": True,
            "session_id": session_id,
            "interface": cap["interface"],
            "filter": cap["filter"],
            "elapsed": round(elapsed, 1),
            "pcap_size": pcap_size,
            "packets": packets,
        })


class CaptureStopView(APIView):
    """Stop capture and return the pcap file."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _cleanup_dead_captures()

        if not _active_captures:
            return Response({"detail": "Nenhuma captura ativa."}, status=404)

        session_id, cap = next(iter(_active_captures.items()))
        pcap_path = cap["pcap_path"]
        proc = cap.get("proc")

        # Send SIGTERM to tcpdump (needs to go to the sudo child)
        try:
            subprocess.run(
                f"sudo /bin/kill {cap['pid']}",
                shell=True, timeout=5,
            )
        except Exception:
            pass

        # Wait for process to finish
        if proc:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

        # Small delay for file flush
        time.sleep(0.5)

        # Remove from active
        del _active_captures[session_id]

        # Return pcap file
        if os.path.isfile(pcap_path) and os.path.getsize(pcap_path) > 0:
            filename = os.path.basename(pcap_path)
            response = FileResponse(
                open(pcap_path, "rb"),
                content_type="application/vnd.tcpdump.pcap",
                as_attachment=True,
                filename=filename,
            )
            # Schedule cleanup after response is sent
            response._pcap_cleanup_path = pcap_path
            return response
        else:
            # Clean up empty file
            if os.path.isfile(pcap_path):
                os.unlink(pcap_path)
            return Response(
                {"detail": "Captura vazia — nenhum pacote capturado."},
                status=204,
            )


def _cleanup_dead_captures():
    """Remove captures whose process has exited."""
    dead = []
    for sid, cap in _active_captures.items():
        proc = cap.get("proc")
        if proc and proc.poll() is not None:
            dead.append(sid)
    for sid in dead:
        del _active_captures[sid]
