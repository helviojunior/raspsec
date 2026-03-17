import os

from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger

CONFIG_FILE = "startup_script.yml"
SCRIPT_PATH = "/app/data/startup_script.sh"
LOG_DIR = "/app/data/downloads/startup_script"
LOG_FILE = f"{LOG_DIR}/output.log"
SERVICE_NAME = "raspsec-startup-script"
SERVICE_FILE = f"/etc/systemd/system/{SERVICE_NAME}.service"

DEFAULT_CONFIG = {
    "enabled": False,
    "script": "",
}

UNIT_TEMPLATE = """\
[Unit]
Description=RaspSec User Startup Script
After=network-online.target raspsec-backend.service dnsmasq.service dhcpcd.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash {script_path}
StandardOutput=append:{log_file}
StandardError=append:{log_file}

[Install]
WantedBy=multi-user.target
"""

logger = StrataLogger("StartupScriptService")


class StartupScriptService:

    @staticmethod
    def get_config():
        """Return current startup script config."""
        config = load_config(CONFIG_FILE, DEFAULT_CONFIG)
        # Also read the actual script content from disk for consistency
        if os.path.isfile(SCRIPT_PATH):
            try:
                with open(SCRIPT_PATH, "r") as f:
                    config["script"] = f.read()
            except OSError:
                pass
        return config

    @staticmethod
    def save_script(script, enabled):
        """Save the startup script and enable/disable the systemd service."""
        # Save script content to disk
        os.makedirs(os.path.dirname(SCRIPT_PATH), exist_ok=True)
        with open(SCRIPT_PATH, "w") as f:
            f.write(script)
        Exec.execute(f"sudo /bin/chmod +x {SCRIPT_PATH}", raise_error=False)

        # Ensure log directory exists
        os.makedirs(LOG_DIR, exist_ok=True)

        # Save config
        save_config(CONFIG_FILE, {"enabled": enabled, "script": script})

        # Write systemd unit
        unit_content = UNIT_TEMPLATE.format(
            script_path=SCRIPT_PATH,
            log_file=LOG_FILE,
        )
        tmp = "/tmp/raspsec-startup-script.service"
        with open(tmp, "w") as f:
            f.write(unit_content)
        Exec.execute(f"sudo /bin/cp {tmp} {SERVICE_FILE}", raise_error=False)
        Exec.execute("sudo /usr/bin/systemctl daemon-reload", raise_error=False)

        if enabled:
            Exec.execute(f"sudo /usr/bin/systemctl enable {SERVICE_NAME}.service", raise_error=False)
        else:
            Exec.execute(f"sudo /usr/bin/systemctl disable {SERVICE_NAME}.service", raise_error=False)

        logger.log(f"Startup script saved, enabled={enabled}")

    @staticmethod
    def get_status():
        """Return whether the service is active/enabled, plus log output."""
        ret_active, out_active = Exec.execute(
            f"sudo /usr/bin/systemctl is-active {SERVICE_NAME}.service",
            raise_error=False,
        )
        ret_enabled, out_enabled = Exec.execute(
            f"sudo /usr/bin/systemctl is-enabled {SERVICE_NAME}.service",
            raise_error=False,
        )

        # Read output log from disk (last 200 lines)
        log_output = ""
        if os.path.isfile(LOG_FILE):
            try:
                ret, out = Exec.execute(
                    f"sudo /usr/bin/tail -n 200 {LOG_FILE}",
                    raise_error=False,
                )
                if ret == 0:
                    log_output = out.strip()
            except Exception:
                pass

        return {
            "active": out_active.strip() if ret_active == 0 else "inactive",
            "enabled": out_enabled.strip() if ret_enabled == 0 else "disabled",
            "log": log_output,
            "log_path": LOG_FILE,
        }

    @staticmethod
    def clear_log():
        """Truncate the output log file."""
        if os.path.isfile(LOG_FILE):
            Exec.execute(f"sudo /usr/bin/truncate -s 0 {LOG_FILE}", raise_error=False)

    @staticmethod
    def run_now():
        """Execute the startup script immediately (manually)."""
        if not os.path.isfile(SCRIPT_PATH):
            raise ValueError("Nenhum script configurado.")

        # Ensure log dir exists
        os.makedirs(LOG_DIR, exist_ok=True)

        ret, out = Exec.execute(
            f"sudo /usr/bin/systemctl start {SERVICE_NAME}.service",
            raise_error=False,
        )
        if ret != 0:
            raise RuntimeError(f"Erro ao executar script: {out}")
        logger.log("Startup script executed manually.")

    @staticmethod
    def stop():
        """Stop the running startup script service."""
        Exec.execute(
            f"sudo /usr/bin/systemctl stop {SERVICE_NAME}.service",
            raise_error=False,
        )
        logger.log("Startup script service stopped.")
