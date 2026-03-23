#!/usr/bin/env python3
"""
RaspSec WebSocket Spectrum Analyser Server.

Standalone asyncio server that continuously scans WiFi networks
and streams spectrum data to connected clients via WebSocket.

Usage:
    python3 -m raspsec.spectrum_server              # Unix socket (production)
    python3 -m raspsec.spectrum_server --port 8766   # TCP (development)
"""

import asyncio
import json
import os
import re
import subprocess
import sys

# Bootstrap Django so we can reuse JWE auth
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "stratasec.settings")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import django  # noqa: E402
django.setup()

import websockets  # noqa: E402
from raspsec.jwe_auth import decode_token  # noqa: E402

SOCKET_PATH = "/run/raspsec/spectrum.sock"
AUTH_TIMEOUT = 10
SCAN_INTERVAL = 2  # seconds between scans
IW_BIN = "/usr/sbin/iw"
IP_BIN = "/sbin/ip"


def _authenticate(token_str):
    """Validate JWE token. Returns payload dict or None."""
    try:
        return decode_token(token_str)
    except Exception:
        return None


def _get_wifi_interfaces():
    """List wireless interfaces via iw dev."""
    try:
        proc = asyncio.subprocess.PIPE
        result = os.popen(f"sudo {IW_BIN} dev 2>/dev/null").read()
        interfaces = []
        for line in result.splitlines():
            line = line.strip()
            if line.startswith("Interface "):
                interfaces.append(line.split()[1])
        return interfaces
    except Exception:
        return []


def _parse_scan_output(raw):
    """
    Parse iw scan dump output into detailed network list
    with channel width info for spectrum display.
    """
    networks = []
    current = None
    in_ht_oper = False
    in_vht_oper = False

    for line in raw.splitlines():
        stripped = line.strip()

        if line.startswith("BSS ") or stripped.startswith("BSS "):
            if current:
                _finalize_network(current)
                networks.append(current)
            bssid_match = re.match(r"BSS ([0-9a-f:]{17})", stripped)
            current = {
                "bssid": bssid_match.group(1) if bssid_match else "",
                "ssid": "",
                "frequency": 0,
                "signal": -100,
                "channel": 0,
                "channel_width": 20,
                "security": "Open",
            }
            in_ht_oper = False
            in_vht_oper = False
        elif current is None:
            continue
        elif stripped.startswith("SSID:"):
            current["ssid"] = stripped[5:].strip()
        elif stripped.startswith("freq:"):
            try:
                current["frequency"] = int(stripped[5:].strip())
            except ValueError:
                pass
        elif stripped.startswith("signal:"):
            try:
                current["signal"] = float(stripped[7:].strip().split()[0])
            except (ValueError, IndexError):
                pass
        elif "WPA" in stripped or "RSN" in stripped:
            if current["security"] == "Open":
                current["security"] = "WPA/WPA2"
        elif stripped.startswith("HT operation:"):
            in_ht_oper = True
            in_vht_oper = False
        elif stripped.startswith("VHT operation:"):
            in_vht_oper = True
            in_ht_oper = False
        elif in_ht_oper:
            if stripped.startswith("* primary channel:"):
                try:
                    current["channel"] = int(stripped.split(":")[1].strip())
                except (ValueError, IndexError):
                    pass
            elif stripped.startswith("* secondary channel offset:"):
                offset = stripped.split(":")[1].strip()
                if offset in ("above", "below"):
                    current["channel_width"] = max(current["channel_width"], 40)
            elif not stripped.startswith("*"):
                in_ht_oper = False
        elif in_vht_oper:
            if stripped.startswith("* channel width:"):
                match = re.search(r"(\d+)\s*\((\d+)\s*MHz\)", stripped)
                if match:
                    current["channel_width"] = int(match.group(2))
                else:
                    # channel width field: 0=20/40, 1=80, 2=160, 3=80+80
                    try:
                        cw = int(stripped.split(":")[1].strip().split()[0])
                        widths = {0: 40, 1: 80, 2: 160, 3: 80}
                        current["channel_width"] = widths.get(cw, 40)
                    except (ValueError, IndexError):
                        pass
            elif not stripped.startswith("*"):
                in_vht_oper = False

    if current:
        _finalize_network(current)
        networks.append(current)

    return networks


def _finalize_network(net):
    """Derive channel from frequency if not set."""
    freq = net["frequency"]
    if net["channel"] == 0 and freq > 0:
        net["channel"] = _freq_to_channel(freq)


def _freq_to_channel(freq):
    """Convert frequency (MHz) to WiFi channel number."""
    if 2412 <= freq <= 2484:
        if freq == 2484:
            return 14
        return (freq - 2407) // 5
    elif 5170 <= freq <= 5835:
        return (freq - 5000) // 5
    return 0


def _run_scan_sync(interface):
    """Trigger scan and return parsed results (blocking)."""
    # Ensure interface is up
    subprocess.run(
        ["sudo", IP_BIN, "link", "set", interface, "up"],
        capture_output=True, timeout=10,
    )

    # Trigger scan (may fail if already scanning — ok)
    subprocess.run(
        ["sudo", IW_BIN, "dev", interface, "scan", "trigger"],
        capture_output=True, timeout=10,
    )

    # Wait for scan to complete
    import time
    time.sleep(1.5)

    # Dump results
    result = subprocess.run(
        ["sudo", IW_BIN, "dev", interface, "scan", "dump"],
        capture_output=True, timeout=15,
    )

    if result.returncode != 0:
        return []

    return _parse_scan_output(result.stdout.decode("utf-8", errors="replace"))


async def _run_scan(interface):
    """Run scan in thread executor to avoid blocking the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run_scan_sync, interface)


async def spectrum_handler(websocket):
    """Handle a single WebSocket spectrum session."""

    # ── Step 1: Authenticate ──
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

    # Get available interfaces
    interfaces = _get_wifi_interfaces()
    await websocket.send(json.dumps({
        "type": "auth",
        "status": "ok",
        "interfaces": interfaces,
    }))

    # ── Step 2: Wait for client to select interface ──
    selected_iface = None
    scanning = False

    async def handle_messages():
        nonlocal selected_iface, scanning
        async for message in websocket:
            try:
                msg = json.loads(message)
                if msg.get("type") == "start":
                    iface = msg.get("interface", "")
                    if re.match(r"^[a-zA-Z0-9._-]+$", iface):
                        selected_iface = iface
                        scanning = True
                elif msg.get("type") == "stop":
                    scanning = False
                elif msg.get("type") == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass

    async def scan_loop():
        nonlocal scanning
        while True:
            if scanning and selected_iface:
                try:
                    networks = await _run_scan(selected_iface)
                    await websocket.send(json.dumps({
                        "type": "scan",
                        "interface": selected_iface,
                        "networks": networks,
                    }))
                except Exception:
                    scanning = False
                    break
            await asyncio.sleep(SCAN_INTERVAL)

    try:
        done, pending = await asyncio.wait(
            [asyncio.create_task(handle_messages()),
             asyncio.create_task(scan_loop())],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
    except Exception:
        pass


async def main():
    tcp_port = None
    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--port" and i < len(sys.argv) - 1:
            tcp_port = int(sys.argv[i + 1])

    if tcp_port:
        async with websockets.serve(spectrum_handler, "0.0.0.0", tcp_port):
            print(f"Spectrum server listening on TCP :{tcp_port}")
            await asyncio.Future()
    else:
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)
        async with websockets.unix_serve(spectrum_handler, SOCKET_PATH):
            os.chmod(SOCKET_PATH, 0o660)
            print(f"Spectrum server listening on {SOCKET_PATH}")
            await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
