"""
Boot configuration verifier.

Validates that OS-level configs (config.txt, /etc/modules, hostapd, rfkill)
are correct for WiFi AP and USB Gadget operation. Adapts checks based on
the detected Raspberry Pi model.

Used both at image build time (standalone) and at backend startup (imported).

Usage (standalone):
    python3 boot_check.py [--fix]

Usage (imported):
    from raspsec.libs.boot_check import verify_and_fix
    issues = verify_and_fix()
"""

import re
import subprocess
import sys

BOOT_CONFIG = "/boot/firmware/config.txt"
ETC_MODULES = "/etc/modules"
HOSTAPD_CONF = "/etc/hostapd/hostapd.conf"
HOSTAPD_DEFAULT = "/etc/default/hostapd"
DHCPCD_CONF = "/etc/dhcpcd.conf"
DATA_DIR = "/app/data"

REQUIRED_MODULES = ["dwc2", "g_ether"]
REQUIRED_YAMLS = ["managment_ap.yml", "ethernet_over_usb.yml"]
COUNTRY_CODE = "BR"


# ── Pi model detection ──

def detect_pi_model():
    """Detect Raspberry Pi model. Returns dict with model info.

    Keys:
        raw: full model string (e.g. "Raspberry Pi 4 Model B Rev 1.2")
        generation: int (0, 3, 4, 5) — 0 if unknown
        has_otg: bool — whether the board supports USB OTG/gadget mode
        otg_port: str — which port supports OTG
        usb_gadget_supported: bool — whether USB gadget is viable
    """
    raw = _read_file("/proc/device-tree/model")
    if raw:
        raw = raw.strip().rstrip("\x00")
    else:
        raw = ""

    info = {
        "raw": raw,
        "generation": 0,
        "has_otg": False,
        "otg_port": "",
        "usb_gadget_supported": False,
    }

    raw_lower = raw.lower()

    if "pi 5" in raw_lower:
        info["generation"] = 5
        # Pi 5 uses RP1 southbridge — dwc2 OTG is NOT supported
        info["has_otg"] = False
        info["usb_gadget_supported"] = False
    elif "pi 4" in raw_lower or "pi 400" in raw_lower or "compute module 4" in raw_lower:
        info["generation"] = 4
        info["has_otg"] = True
        info["otg_port"] = "USB-C (power port)"
        info["usb_gadget_supported"] = True
    elif "pi 3" in raw_lower or "compute module 3" in raw_lower:
        info["generation"] = 3
        # Pi 3 has no OTG-capable USB port
        info["has_otg"] = False
        info["usb_gadget_supported"] = False
    elif "pi zero 2" in raw_lower:
        info["generation"] = 0  # Zero family
        info["has_otg"] = True
        info["otg_port"] = "micro-USB (data port)"
        info["usb_gadget_supported"] = True
    elif "pi zero" in raw_lower:
        info["generation"] = 0
        info["has_otg"] = True
        info["otg_port"] = "micro-USB (data port)"
        info["usb_gadget_supported"] = True

    return info


# ── File helpers ──

def _read_file(path):
    try:
        with open(path, "r") as f:
            return f.read()
    except FileNotFoundError:
        return None


def _write_file(path, content, sudo=False):
    if sudo:
        proc = subprocess.run(
            ["sudo", "/usr/bin/tee", path],
            input=content.encode(),
            stdout=subprocess.DEVNULL,
        )
        return proc.returncode == 0

    with open(path, "w") as f:
        f.write(content)
    return True


def _run(cmd, check=False):
    proc = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return proc.returncode, proc.stdout.strip()


# ── config.txt parsing ──

def _parse_config_txt(content):
    """Parse config.txt into sections: list of (section_name, lines)."""
    sections = []
    current_section = "global"
    current_lines = []

    for line in content.splitlines():
        stripped = line.strip()
        match = re.match(r'^\[(\w+)\]$', stripped)
        if match:
            sections.append((current_section, current_lines))
            current_section = match.group(1)
            current_lines = []
        else:
            current_lines.append(line)

    sections.append((current_section, current_lines))
    return sections


def _rebuild_config_txt(sections):
    """Rebuild config.txt from parsed sections."""
    parts = []
    for name, lines in sections:
        if name != "global":
            parts.append(f"[{name}]")
        parts.extend(lines)
    return "\n".join(parts) + "\n"


# ── Checks ──

def check_config_txt(content, pi_info):
    """Check config.txt for USB gadget issues."""
    issues = []

    if content is None:
        issues.append(("error", f"{BOOT_CONFIG} not found"))
        return issues

    if not pi_info["usb_gadget_supported"]:
        # No gadget support — just warn, don't check dwc2 overlay
        return issues

    sections = _parse_config_txt(content)

    # Check 1: dtoverlay=dwc2 must be in [all] section with dr_mode=peripheral
    dwc2_locations = []
    for section_name, lines in sections:
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "dtoverlay=dwc2" in stripped:
                dwc2_locations.append((section_name, stripped))

    if not dwc2_locations:
        issues.append(("fix", "dtoverlay=dwc2,dr_mode=peripheral missing from config.txt"))
    else:
        for section_name, line in dwc2_locations:
            if section_name != "all":
                issues.append((
                    "fix",
                    f"dtoverlay=dwc2 is in [{section_name}] section, must be in [all]",
                ))
            if "dr_mode=peripheral" not in line:
                issues.append((
                    "fix",
                    f"dtoverlay=dwc2 missing dr_mode=peripheral: '{line}'",
                ))

    # Check 2: otg_mode=1 must NOT be present (forces xHCI host mode, blocks dwc2 peripheral)
    for section_name, lines in sections:
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if re.match(r'^otg_mode\s*=\s*1', stripped):
                issues.append((
                    "fix",
                    f"otg_mode=1 in [{section_name}] blocks USB gadget mode — must be removed",
                ))

    return issues


def fix_config_txt(content, sudo=False):
    """Fix config.txt issues in-place. Returns new content."""
    sections = _parse_config_txt(content)
    changed = False

    # Remove dtoverlay=dwc2 from wrong sections
    for i, (section_name, lines) in enumerate(sections):
        new_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("#"):
                new_lines.append(line)
                continue
            if "dtoverlay=dwc2" in stripped and section_name != "all":
                changed = True
                continue  # drop it
            new_lines.append(line)
        sections[i] = (section_name, new_lines)

    # Remove otg_mode=1 from all sections (with preceding comments)
    for i, (section_name, lines) in enumerate(sections):
        new_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("#") and "otg_mode" not in stripped:
                new_lines.append(line)
                continue
            if re.match(r'^otg_mode\s*=\s*1', stripped):
                changed = True
                while new_lines and new_lines[-1].strip().startswith("#") and "otg_mode" in new_lines[-1].lower():
                    new_lines.pop()
                continue
            new_lines.append(line)
        sections[i] = (section_name, new_lines)

    # Ensure [all] section exists and has correct dtoverlay=dwc2
    all_idx = None
    for i, (section_name, lines) in enumerate(sections):
        if section_name == "all":
            all_idx = i
            break

    if all_idx is None:
        sections.append(("all", ["dtoverlay=dwc2,dr_mode=peripheral"]))
        changed = True
    else:
        section_name, lines = sections[all_idx]
        has_dwc2 = False
        for j, line in enumerate(lines):
            if "dtoverlay=dwc2" in line and not line.strip().startswith("#"):
                lines[j] = "dtoverlay=dwc2,dr_mode=peripheral"
                has_dwc2 = True
                changed = True
        if not has_dwc2:
            lines.append("dtoverlay=dwc2,dr_mode=peripheral")
            changed = True
        sections[all_idx] = (section_name, lines)

    if changed:
        new_content = _rebuild_config_txt(sections)
        _write_file(BOOT_CONFIG, new_content, sudo=sudo)
        return new_content

    return content


def check_modules(content, pi_info):
    """Check /etc/modules has dwc2 and g_ether."""
    issues = []

    if not pi_info["usb_gadget_supported"]:
        return issues

    if content is None:
        issues.append(("error", f"{ETC_MODULES} not found"))
        return issues

    lines = [l.strip() for l in content.splitlines() if l.strip() and not l.strip().startswith("#")]
    for mod in REQUIRED_MODULES:
        if mod not in lines:
            issues.append(("fix", f"Module '{mod}' missing from {ETC_MODULES}"))

    return issues


def fix_modules(content, sudo=False):
    """Ensure dwc2 and g_ether are in /etc/modules."""
    lines = [l.strip() for l in content.splitlines() if l.strip() and not l.strip().startswith("#")]
    new_content = content.rstrip("\n") + "\n"
    changed = False

    for mod in REQUIRED_MODULES:
        if mod not in lines:
            new_content += f"{mod}\n"
            changed = True

    if changed:
        _write_file(ETC_MODULES, new_content, sudo=sudo)

    return new_content


def check_hostapd():
    """Check hostapd configuration."""
    issues = []

    content = _read_file(HOSTAPD_CONF)
    if content is None:
        issues.append(("warn", f"{HOSTAPD_CONF} not found (will be generated on first AP start)"))
        return issues

    if f"country_code={COUNTRY_CODE}" not in content:
        issues.append(("warn", f"country_code={COUNTRY_CODE} not found in {HOSTAPD_CONF}"))

    default = _read_file(HOSTAPD_DEFAULT)
    if default and "DAEMON_CONF" not in default:
        issues.append(("fix", f"DAEMON_CONF not set in {HOSTAPD_DEFAULT}"))

    return issues


def check_data_dir():
    """Check that YAML configs are in the correct DATA_DIR."""
    import os
    issues = []

    for yml in REQUIRED_YAMLS:
        correct = os.path.join(DATA_DIR, yml)
        wrong = os.path.join("/app/backend/data", yml)
        if not os.path.isfile(correct):
            if os.path.isfile(wrong):
                issues.append((
                    "fix",
                    f"{yml} is in /app/backend/data/ instead of {DATA_DIR} — backend can't find it",
                ))
            else:
                issues.append(("warn", f"{yml} not found in {DATA_DIR}"))

    return issues


def fix_data_dir():
    """Move YAML configs from wrong dir to correct DATA_DIR."""
    import os
    os.makedirs(DATA_DIR, exist_ok=True)

    for yml in REQUIRED_YAMLS:
        correct = os.path.join(DATA_DIR, yml)
        wrong = os.path.join("/app/backend/data", yml)
        if not os.path.isfile(correct) and os.path.isfile(wrong):
            _run(f"sudo /bin/cp {wrong} {correct}")


def check_dhcpcd():
    """Check that dhcpcd.conf has static IP for active interfaces."""
    import os
    issues = []

    content = _read_file(DHCPCD_CONF)
    if content is None:
        issues.append(("warn", f"{DHCPCD_CONF} not found"))
        return issues

    # Check usb0 static IP when USB gadget is enabled
    yml_path = os.path.join(DATA_DIR, "ethernet_over_usb.yml")
    yml_content = _read_file(yml_path)
    if yml_content and "enabled: true" in yml_content:
        if "interface usb0" not in content:
            issues.append(("fix", f"usb0 static IP section missing from {DHCPCD_CONF} — dhcpcd will act as DHCP client"))

    # Check wlan0 static IP (always needed for AP)
    if "interface wlan0" not in content:
        issues.append(("fix", f"wlan0 static IP section missing from {DHCPCD_CONF}"))

    return issues


def check_rfkill():
    """Check if WiFi is blocked by rfkill (runtime only)."""
    issues = []
    ret, out = _run("rfkill list wifi")
    if "Soft blocked: yes" in out or "Hard blocked: yes" in out:
        issues.append(("fix", "WiFi is blocked by rfkill"))
    return issues


def fix_rfkill():
    """Unblock WiFi via rfkill."""
    _run("sudo /usr/sbin/rfkill unblock wifi")
    _run(f"sudo /usr/sbin/iw reg set {COUNTRY_CODE}")


# ── Main API ──

def verify(runtime=False, pi_info=None):
    """Run all checks. Returns list of (level, message) tuples.

    Args:
        runtime: If True, also check runtime state (rfkill, UDC).
        pi_info: Pi model info dict. Auto-detected if None.
    """
    if pi_info is None:
        pi_info = detect_pi_model()

    issues = []

    # Pi model warnings
    if pi_info["raw"] and not pi_info["usb_gadget_supported"]:
        gen = pi_info["generation"]
        if gen == 5:
            issues.append(("warn", f"Raspberry Pi 5 detected — USB gadget mode is NOT supported (RP1 controller)"))
        elif gen == 3:
            issues.append(("warn", f"Raspberry Pi 3 detected — no USB OTG port available for gadget mode"))
        else:
            issues.append(("warn", f"USB gadget not supported on this board: {pi_info['raw']}"))

    config_txt = _read_file(BOOT_CONFIG)
    issues.extend(check_config_txt(config_txt, pi_info))

    modules = _read_file(ETC_MODULES)
    issues.extend(check_modules(modules, pi_info))

    issues.extend(check_hostapd())

    issues.extend(check_data_dir())
    issues.extend(check_dhcpcd())

    if runtime:
        issues.extend(check_rfkill())

        if pi_info["usb_gadget_supported"]:
            ret, out = _run("ls /sys/class/udc/ 2>/dev/null")
            if not out.strip():
                issues.append(("warn", "No UDC available — USB gadget will not work until reboot"))

            ret, out = _run("lsmod 2>/dev/null")
            if "dwc2" not in (out or ""):
                issues.append((
                    "warn",
                    "dwc2 module not loaded (dwc_otg may have taken over) — reboot required after config.txt fix",
                ))

    return issues


def verify_and_fix(runtime=False, sudo=True):
    """Run all checks and auto-fix what we can. Returns remaining issues."""
    pi_info = detect_pi_model()
    issues = verify(runtime=runtime, pi_info=pi_info)

    if not issues:
        return []

    fix_msgs = [msg for lvl, msg in issues if lvl == "fix"]
    has_config_fix = any("config.txt" in m or "otg_mode" in m for m in fix_msgs)
    has_modules_fix = any(ETC_MODULES in m for m in fix_msgs)
    has_rfkill_fix = any("rfkill" in m for m in fix_msgs)
    has_data_fix = any("/app/backend/data/" in m for m in fix_msgs)
    has_dhcpcd_fix = any("dhcpcd" in m.lower() or "usb0 static" in m for m in fix_msgs)

    if has_data_fix:
        fix_data_dir()

    if has_config_fix:
        content = _read_file(BOOT_CONFIG)
        if content:
            fix_config_txt(content, sudo=sudo)

    if has_modules_fix:
        content = _read_file(ETC_MODULES)
        if content:
            fix_modules(content, sudo=sudo)

    if has_rfkill_fix:
        fix_rfkill()

    if has_dhcpcd_fix:
        # Re-generate dhcpcd.conf from YAML (requires backend libs)
        try:
            from raspsec.libs.network import write_dhcpcd
            write_dhcpcd()
        except ImportError:
            pass  # standalone mode — can't regenerate

    # Re-verify to report remaining issues
    return verify(runtime=runtime, pi_info=pi_info)


# ── Standalone usage (image build & manual debug) ──

if __name__ == "__main__":
    fix_mode = "--fix" in sys.argv

    pi_info = detect_pi_model()

    print("RaspSec Boot Config Verifier")
    print("=" * 40)

    if pi_info["raw"]:
        print(f"Board: {pi_info['raw']}")
        if pi_info["usb_gadget_supported"]:
            print(f"USB OTG: supported via {pi_info['otg_port']}")
        else:
            print("USB OTG: NOT supported on this board")
    else:
        print("Board: unknown (not running on Raspberry Pi?)")

    print()

    issues = verify(runtime=True, pi_info=pi_info)

    if not issues:
        print("OK: All boot configurations are correct.")
        sys.exit(0)

    for level, msg in issues:
        prefix = {"error": "ERROR", "fix": "FIXABLE", "warn": "WARNING"}[level]
        print(f"  [{prefix}] {msg}")

    errors = [i for i in issues if i[0] == "error"]
    fixable = [i for i in issues if i[0] == "fix"]

    if fixable and fix_mode:
        print(f"\nApplying {len(fixable)} fix(es)...")
        remaining = verify_and_fix(runtime=True, sudo=True)
        remaining_fixable = [i for i in remaining if i[0] == "fix"]
        if remaining_fixable:
            print("FAILED: Some issues could not be fixed:")
            for _, msg in remaining_fixable:
                print(f"  [STILL BROKEN] {msg}")
            sys.exit(1)
        else:
            print("OK: All fixable issues resolved.")
    elif fixable and not fix_mode:
        print(f"\n{len(fixable)} issue(s) can be auto-fixed. Run with --fix to apply.")
        sys.exit(1)

    if errors:
        sys.exit(1)
