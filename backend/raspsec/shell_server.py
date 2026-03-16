#!/usr/bin/env python3
"""
RaspSec WebSocket PTY Shell Server.

Standalone asyncio server that bridges WebSocket <-> real PTY sessions.
Authenticates using the same JWE tokens as the REST API.

Usage:
    python3 -m raspsec.shell_server              # Unix socket (production)
    python3 -m raspsec.shell_server --port 8765   # TCP (development)
"""

import asyncio
import fcntl
import json
import os
import pty
import signal
import struct
import sys
import termios

# Bootstrap Django so we can reuse JWE auth
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "stratasec.settings")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import django  # noqa: E402
django.setup()

import websockets  # noqa: E402
from raspsec.jwe_auth import decode_token  # noqa: E402

SOCKET_PATH = "/run/raspsec/shell.sock"
SHELL = "/bin/bash"
MAX_READ = 32768
AUTH_TIMEOUT = 10


def _set_winsize(fd, rows, cols):
    """Set PTY window size."""
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def _authenticate(token_str):
    """Validate JWE token. Returns payload dict or None."""
    try:
        return decode_token(token_str)
    except Exception:
        return None


async def shell_handler(websocket):
    """Handle a single WebSocket shell session."""

    # ── Step 1: Authenticate via first message ──
    try:
        raw = await asyncio.wait_for(websocket.recv(), timeout=AUTH_TIMEOUT)
        msg = json.loads(raw)
        if msg.get("type") != "auth" or not msg.get("token"):
            await websocket.close(4001, "Expected auth message")
            return
    except (asyncio.TimeoutError, json.JSONDecodeError):
        await websocket.close(4001, "Auth timeout")
        return

    payload = _authenticate(msg["token"])
    if not payload:
        await websocket.send(json.dumps({"type": "auth", "status": "error"}))
        await websocket.close(4003, "Unauthorized")
        return

    await websocket.send(json.dumps({"type": "auth", "status": "ok"}))

    # ── Step 2: Spawn PTY ──
    pid, master_fd = pty.fork()

    if pid == 0:
        # Child process — exec login shell
        env = {
            "TERM": "xterm-256color",
            "HOME": os.path.expanduser("~"),
            "USER": os.environ.get("USER", "stratasec"),
            "LOGNAME": os.environ.get("USER", "stratasec"),
            "SHELL": SHELL,
            "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "LANG": os.environ.get("LANG", "en_US.UTF-8"),
        }
        os.execvpe(SHELL, [SHELL, "--login"], env)
        sys.exit(1)

    # ── Step 3: Bridge PTY <-> WebSocket ──
    loop = asyncio.get_event_loop()

    async def pty_to_ws():
        """Forward PTY output to WebSocket."""
        while True:
            try:
                data = await loop.run_in_executor(None, os.read, master_fd, MAX_READ)
                if not data:
                    break
                await websocket.send(data)
            except OSError:
                break

    async def ws_to_pty():
        """Forward WebSocket input to PTY."""
        async for message in websocket:
            if isinstance(message, str):
                # Check for control messages (resize) — only if it looks like JSON object
                if message.startswith("{"):
                    try:
                        ctrl = json.loads(message)
                        if isinstance(ctrl, dict) and ctrl.get("type") == "resize":
                            _set_winsize(master_fd, ctrl["rows"], ctrl["cols"])
                            continue
                    except (json.JSONDecodeError, KeyError, TypeError):
                        pass
                os.write(master_fd, message.encode("utf-8"))
            else:
                os.write(master_fd, message)

    try:
        done, pending = await asyncio.wait(
            [asyncio.create_task(pty_to_ws()), asyncio.create_task(ws_to_pty())],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
        try:
            os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            pass


async def main():
    # Parse --port flag for TCP mode (development)
    tcp_port = None
    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--port" and i < len(sys.argv) - 1:
            tcp_port = int(sys.argv[i + 1])

    if tcp_port:
        async with websockets.serve(shell_handler, "0.0.0.0", tcp_port):
            print(f"Shell server listening on TCP :{tcp_port}")
            await asyncio.Future()
    else:
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)
        async with websockets.unix_serve(shell_handler, SOCKET_PATH):
            os.chmod(SOCKET_PATH, 0o660)
            print(f"Shell server listening on {SOCKET_PATH}")
            await asyncio.Future()


if __name__ == "__main__":
    # Auto-reap zombie children
    signal.signal(signal.SIGCHLD, signal.SIG_IGN)
    asyncio.run(main())
