"""
WiFi Client service — scan, connect, disconnect, manage profiles.

Manages wpa_supplicant configuration for connecting a wireless interface
as a client (station mode) to external networks, including enterprise
802.1X (PEAP, TLS).
"""
import os
import re
import tempfile

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger
from raspsec.libs.network import write_system_file
from raspsec.dbmodels.firewall import ChainMapping

CONFIG_FILE = "wifi_client.yml"
WPA_SUPPLICANT_DIR = "/etc/wpa_supplicant"
CERTS_DIR = "/app/data/wifi_certs"

logger = StrataLogger("WifiClientService")

# Auth types
AUTH_OPEN = "open"
AUTH_WPA_PSK = "wpa-psk"
AUTH_WPA3_SAE = "wpa3-sae"
AUTH_8021X_PEAP = "802.1x-peap"
AUTH_8021X_TLS = "802.1x-tls"
AUTH_8021X_TTLS = "802.1x-ttls"

VALID_AUTH_TYPES = {AUTH_OPEN, AUTH_WPA_PSK, AUTH_WPA3_SAE,
                    AUTH_8021X_PEAP, AUTH_8021X_TLS, AUTH_8021X_TTLS}

DEFAULT_CONFIG = {
    "profiles": [],
}


def _valid_iface(name):
    return bool(name) and re.match(r"^[a-zA-Z0-9._-]+$", name)


def _wpa_conf_path(interface):
    return f"{WPA_SUPPLICANT_DIR}/wpa_supplicant-{interface}.conf"


class WifiClientService:

    # ── Scan ──

    @staticmethod
    def scan(interface):
        """Trigger a scan and return visible networks."""
        if not _valid_iface(interface):
            raise ValueError("Interface inválida.")

        # Ensure interface is up
        Exec.execute(f"sudo /sbin/ip link set {interface} up", raise_error=False)

        # Trigger scan (may fail if already scanning — that's ok)
        Exec.execute(f"sudo /usr/sbin/iw dev {interface} scan trigger",
                     raise_error=False)

        # Get scan results
        ret, out = Exec.execute(
            f"sudo /usr/sbin/iw dev {interface} scan dump",
            raise_error=False,
        )
        if ret != 0:
            return []

        return _parse_scan_results(out)

    # ── Connect ──

    @staticmethod
    def connect(interface, profile):
        """Connect to a network using a profile dict."""
        if not _valid_iface(interface):
            raise ValueError("Interface inválida.")

        auth_type = profile.get("auth_type", AUTH_WPA_PSK)
        if auth_type not in VALID_AUTH_TYPES:
            raise ValueError(f"Tipo de autenticação inválido: {auth_type}")

        ssid = profile.get("ssid", "")
        if not ssid:
            raise ValueError("SSID é obrigatório.")

        # Save certificates if provided (base64 content)
        cert_paths = _save_certificates(interface, profile)

        # Generate wpa_supplicant config
        conf_content = _generate_wpa_conf(profile, cert_paths)
        conf_path = _wpa_conf_path(interface)

        logger.log(f"Writing wpa_supplicant config for {interface}")
        write_system_file(conf_path, conf_content)

        # Stop any existing wpa_supplicant on this interface
        WifiClientService.disconnect(interface)

        # Start wpa_supplicant
        Exec.execute(f"sudo /sbin/ip link set {interface} up", raise_error=False)
        ret, out = Exec.execute(
            f"sudo /usr/sbin/wpa_supplicant -B -i {interface} "
            f"-c {conf_path} -D nl80211,wext",
            raise_error=False,
        )
        if ret != 0:
            raise RuntimeError(f"Falha ao iniciar wpa_supplicant: {out}")

        # Request DHCP
        Exec.execute(
            f"sudo /usr/sbin/dhclient -v {interface}",
            raise_error=False,
        )

        # Auto-set chain to 'implant' when wlan0 is used as client
        if interface == "wlan0":
            _set_chain(interface, "implant")
            logger.log(f"Auto-set wlan0 chain to 'implant' (client mode)")

        # Save profile
        _save_profile(interface, profile)

        logger.log(f"Connected {interface} to {ssid}")

    # ── Disconnect ──

    @staticmethod
    def disconnect(interface):
        """Disconnect and stop wpa_supplicant on an interface."""
        if not _valid_iface(interface):
            raise ValueError("Interface inválida.")

        Exec.execute(
            f"sudo /usr/bin/killall -q wpa_supplicant || true",
            raise_error=False,
        )
        # More targeted: kill only the process for this interface
        Exec.execute(
            f"sudo /usr/bin/pkill -f 'wpa_supplicant.*-i {interface}'",
            raise_error=False,
        )
        Exec.execute(
            f"sudo /usr/sbin/dhclient -r {interface}",
            raise_error=False,
        )
        Exec.execute(
            f"sudo /sbin/ip addr flush dev {interface}",
            raise_error=False,
        )

        # Auto-revert wlan0 chain to 'internal' when disconnecting (back to AP mode)
        if interface == "wlan0":
            _set_chain(interface, "internal")
            logger.log(f"Auto-set wlan0 chain to 'internal' (AP mode)")

        logger.log(f"Disconnected {interface}")

    # ── Status ──

    @staticmethod
    def status(interface):
        """Get current connection status for an interface."""
        if not _valid_iface(interface):
            return {"connected": False}

        ret, out = Exec.execute(
            f"sudo /usr/sbin/wpa_cli -i {interface} status",
            raise_error=False,
        )
        if ret != 0:
            return {"connected": False, "interface": interface}

        info = {}
        for line in out.strip().splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                info[k.strip()] = v.strip()

        connected = info.get("wpa_state") == "COMPLETED"
        return {
            "connected": connected,
            "interface": interface,
            "ssid": info.get("ssid", ""),
            "bssid": info.get("bssid", ""),
            "ip": info.get("ip_address", ""),
            "freq": info.get("freq", ""),
            "key_mgmt": info.get("key_mgmt", ""),
            "wpa_state": info.get("wpa_state", ""),
        }

    # ── Profiles ──

    @staticmethod
    def get_profiles():
        config = load_config(CONFIG_FILE, DEFAULT_CONFIG)
        profiles = config.get("profiles", [])
        # Strip sensitive fields for listing
        safe = []
        for p in profiles:
            safe.append({
                "interface": p.get("interface", ""),
                "ssid": p.get("ssid", ""),
                "auth_type": p.get("auth_type", ""),
                "identity": p.get("identity", ""),
                "has_password": bool(p.get("password")),
            })
        return safe

    @staticmethod
    def delete_profile(interface, ssid):
        config = load_config(CONFIG_FILE, DEFAULT_CONFIG)
        profiles = config.get("profiles", [])
        config["profiles"] = [
            p for p in profiles
            if not (p.get("interface") == interface and p.get("ssid") == ssid)
        ]
        save_config(CONFIG_FILE, config)
        logger.log(f"Deleted WiFi client profile: {ssid} on {interface}")


# ── Private helpers ──

def _set_chain(interface, chain):
    """Update the firewall chain mapping for an interface and re-apply firewall."""
    ChainMapping.objects.update_or_create(
        interface=interface,
        defaults={"chain": chain},
    )
    try:
        from raspsec.services.firewall import FirewallService
        FirewallService.apply()
    except Exception as e:
        logger.log(f"Failed to reapply firewall after chain change: {e}")


def _parse_scan_results(raw):
    """Parse iw scan dump output into a list of networks."""
    networks = []
    current = None

    for line in raw.splitlines():
        line = line.strip()

        if line.startswith("BSS "):
            if current:
                networks.append(current)
            bssid_match = re.match(r"BSS ([0-9a-f:]{17})", line)
            current = {
                "bssid": bssid_match.group(1) if bssid_match else "",
                "ssid": "",
                "frequency": 0,
                "signal": -100,
                "security": "Open",
            }
        elif current is None:
            continue
        elif line.startswith("SSID:"):
            current["ssid"] = line[5:].strip()
        elif line.startswith("freq:"):
            try:
                current["frequency"] = int(line[5:].strip())
            except ValueError:
                pass
        elif line.startswith("signal:"):
            try:
                current["signal"] = float(line[7:].strip().split()[0])
            except (ValueError, IndexError):
                pass
        elif "WPA" in line or "RSN" in line:
            if "802.1X" in line or "EAP" in line:
                current["security"] = "802.1X"
            elif "SAE" in line:
                current["security"] = "WPA3-SAE"
            elif current["security"] == "Open":
                current["security"] = "WPA/WPA2"
        elif "WEP" in line:
            current["security"] = "WEP"

    if current:
        networks.append(current)

    # Deduplicate by SSID, keeping strongest signal
    seen = {}
    for net in networks:
        ssid = net["ssid"]
        if not ssid:
            continue
        if ssid not in seen or net["signal"] > seen[ssid]["signal"]:
            seen[ssid] = net

    result = list(seen.values())
    result.sort(key=lambda n: n["signal"], reverse=True)
    return result


def _save_certificates(interface, profile):
    """Save cert/key content to files, return paths."""
    os.makedirs(CERTS_DIR, exist_ok=True)
    paths = {}

    prefix = f"{interface}_{profile.get('ssid', 'net').replace(' ', '_')}"

    for field, filename in [
        ("ca_cert_content", f"{prefix}_ca.pem"),
        ("client_cert_content", f"{prefix}_client.pem"),
        ("private_key_content", f"{prefix}_key.pem"),
    ]:
        content = profile.get(field, "")
        if content:
            path = os.path.join(CERTS_DIR, filename)
            with open(path, "w") as f:
                f.write(content)
            os.chmod(path, 0o600)
            paths[field.replace("_content", "")] = path

    return paths


def _generate_wpa_conf(profile, cert_paths):
    """Generate wpa_supplicant.conf content."""
    auth_type = profile.get("auth_type", AUTH_WPA_PSK)
    ssid = profile["ssid"]

    lines = [
        "ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev",
        "update_config=1",
        "country=BR",
        "",
        "network={",
        f'    ssid="{ssid}"',
    ]

    if profile.get("bssid"):
        lines.append(f'    bssid={profile["bssid"]}')

    if auth_type == AUTH_OPEN:
        lines.append("    key_mgmt=NONE")

    elif auth_type == AUTH_WPA_PSK:
        password = profile.get("password", "")
        lines.append("    key_mgmt=WPA-PSK")
        lines.append(f'    psk="{password}"')

    elif auth_type == AUTH_WPA3_SAE:
        password = profile.get("password", "")
        lines.append("    key_mgmt=SAE")
        lines.append(f'    sae_password="{password}"')
        lines.append("    ieee80211w=2")

    elif auth_type == AUTH_8021X_PEAP:
        lines.append("    key_mgmt=WPA-EAP")
        lines.append("    eap=PEAP")
        identity = profile.get("identity", "")
        password = profile.get("password", "")
        lines.append(f'    identity="{identity}"')
        lines.append(f'    password="{password}"')
        phase2 = profile.get("phase2", "auth=MSCHAPV2")
        lines.append(f'    phase2="{phase2}"')
        if cert_paths.get("ca_cert"):
            lines.append(f'    ca_cert="{cert_paths["ca_cert"]}"')
        if profile.get("anonymous_identity"):
            lines.append(f'    anonymous_identity="{profile["anonymous_identity"]}"')

    elif auth_type == AUTH_8021X_TLS:
        lines.append("    key_mgmt=WPA-EAP")
        lines.append("    eap=TLS")
        identity = profile.get("identity", "")
        lines.append(f'    identity="{identity}"')
        if cert_paths.get("ca_cert"):
            lines.append(f'    ca_cert="{cert_paths["ca_cert"]}"')
        if cert_paths.get("client_cert"):
            lines.append(f'    client_cert="{cert_paths["client_cert"]}"')
        if cert_paths.get("private_key"):
            lines.append(f'    private_key="{cert_paths["private_key"]}"')
        if profile.get("private_key_password"):
            lines.append(f'    private_key_passwd="{profile["private_key_password"]}"')

    elif auth_type == AUTH_8021X_TTLS:
        lines.append("    key_mgmt=WPA-EAP")
        lines.append("    eap=TTLS")
        identity = profile.get("identity", "")
        password = profile.get("password", "")
        lines.append(f'    identity="{identity}"')
        lines.append(f'    password="{password}"')
        phase2 = profile.get("phase2", "auth=MSCHAPV2")
        lines.append(f'    phase2="{phase2}"')
        if cert_paths.get("ca_cert"):
            lines.append(f'    ca_cert="{cert_paths["ca_cert"]}"')
        if profile.get("anonymous_identity"):
            lines.append(f'    anonymous_identity="{profile["anonymous_identity"]}"')

    # Scan SSID (for hidden networks)
    if profile.get("hidden"):
        lines.append("    scan_ssid=1")

    lines.append("}")
    lines.append("")

    return "\n".join(lines)


def _save_profile(interface, profile):
    """Save or update a connection profile."""
    config = load_config(CONFIG_FILE, DEFAULT_CONFIG)
    profiles = config.get("profiles", [])

    ssid = profile["ssid"]
    # Remove existing profile with same interface+ssid
    profiles = [
        p for p in profiles
        if not (p.get("interface") == interface and p.get("ssid") == ssid)
    ]

    saved = dict(profile)
    saved["interface"] = interface
    # Don't store cert content in YAML (already saved as files)
    for key in ["ca_cert_content", "client_cert_content", "private_key_content"]:
        saved.pop(key, None)

    profiles.append(saved)
    config["profiles"] = profiles
    save_config(CONFIG_FILE, config)
