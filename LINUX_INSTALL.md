# RaspSec — Linux Installation Guide

This guide explains how to install RaspSec on a **Debian/Ubuntu** machine using the automated installer script.

## Requirements

- **OS:** Debian 12 (Bookworm) or Ubuntu 22.04+ (64-bit)
- **Architecture:** amd64 (x86_64), arm64 (aarch64), or armhf (armv7l)
- **RAM:** 1 GB minimum (2 GB recommended)
- **Disk:** 4 GB free space minimum
- **Network:** Internet access (to download packages and clone the repository)
- **Privileges:** Root access (sudo)

> **Warning:** This script makes significant changes to the system configuration (Nginx, iptables, systemd services, network interfaces). **Do not run it on a production machine.**

## Quick Install

Run the following command as root:

```bash
wget --no-cache -q -O- https://raw.githubusercontent.com/helviojunior/raspsec/main/linux_install.sh | sudo bash
```

Or using `curl`:

```bash
curl -fsSL https://raw.githubusercontent.com/helviojunior/raspsec/main/linux_install.sh | sudo bash
```

The script will ask for confirmation before making any changes.

## What the Installer Does

### System Packages

Installs the following packages via `apt`:

- **Web server:** nginx-extras, openssl
- **Application server:** uwsgi, uwsgi-plugin-python3
- **Python:** python3, python3-pip, python3-venv, python3-dev
- **Build tools:** build-essential, git, curl, wget, jq
- **Networking:** hostapd, dnsmasq, dhcpcd5, iptables-persistent, iw, wireless-tools, net-tools, rfkill
- **DNS:** bind9, dnsutils
- **Security tools:** aircrack-ng, tshark, reaver, bully, cowpatty, hashcat, hcxdumptool, hcxtools, tcpdump, macchanger
- **VPN:** strongswan (full suite), openvpn
- **Utilities:** vnstat, qrencode, isoquery, rsyslog, vim, xxd, sqlite3, traceroute

### Runtime Environments

- **Node.js 20.x** — used to build the React frontend
- **Go 1.24.1** — used for networking tools
- **Python 3** — Django backend and system scripts

### User Setup

Creates a `raspsec` system user:

- Groups: `sudo`, `www-data`
- Default password: `@Pass123`
- Passwordless sudo enabled
- Shell: `/bin/bash`

### Repository

Clones the repository to `/opt/raspsec` from the `main` branch.

### Application Deployment

| Component | Location |
|-----------|----------|
| Repository | `/opt/raspsec` |
| Frontend (React build) | `/app/html` |
| Backend (Django) | `/app/backend` |
| Application data | `/app/data` |
| TLS certificates | `/etc/raspsec/tls` |
| uWSGI config | `/etc/raspsec/uwsgi-raspsec.ini` |
| Helper scripts | `/usr/share/raspsec` |
| Log files | `/var/log/raspsec` |

### Systemd Services

| Service | Description |
|---------|-------------|
| `raspsec-backend.service` | uWSGI application server |
| `raspsec-shell.service` | WebSocket shell (PTY) server |
| `raspsec-spectrum.service` | WebSocket spectrum analyzer server |
| `raspsec-tls-init.service` | Auto-generates TLS certificate on first boot |
| `raspsec-log-dirs.service` | Creates log directories on tmpfs |
| `raspsec-wifi-unblock.service` | Unblocks WiFi and sets regulatory domain |
| `raspsec-usb-gadget.service` | USB Ethernet gadget (g_ether) |
| `raspsec-issue.timer` | Updates login banner with network info |

### Network Configuration

- **dhcpcd:** Static IPs on `wlan0` (172.21.255.1/24) and `usb0` (172.21.254.1/24)
- **dnsmasq:** DHCP server for `wlan0` and `usb0` subnets
- **hostapd:** WiFi access point (SSID: `RaspSec`, password: `@Pass123`)
- **iptables:** Default DROP policy with RaspSec chain rules
- **Nginx:** HTTPS on port 443 with self-signed certificate, HTTP redirects to HTTPS

### Network Interfaces

| Interface | Role | IP Address |
|-----------|------|------------|
| `eth0` | WAN uplink (implant) | DHCP disabled |
| `wlan0` | Management AP | 172.21.255.1/24 |
| `usb0` | USB Ethernet gadget | 172.21.254.1/24 |

## Post-Installation

### Access the Web UI

After installation, access the RaspSec web interface:

- **URL:** `https://<machine-ip>`
- **Default credentials:** `raspsec` / `@Pass123`

### Change Default Password

```bash
sudo passwd raspsec
```

Also change the WiFi AP password by editing `/etc/hostapd/hostapd.conf`.

### Reboot

A reboot is recommended after installation to ensure all services start correctly:

```bash
sudo reboot
```

### Verify Services

```bash
# Check service status
sudo systemctl status raspsec-backend
sudo systemctl status raspsec-shell
sudo systemctl status raspsec-spectrum
sudo systemctl status nginx

# Check health endpoint
curl -sk https://localhost/api/health/
```

## Re-running the Installer

The script is idempotent — it can be safely re-run to update an existing installation. It will:

- Pull the latest code from the repository
- Rebuild the frontend
- Re-deploy backend and frontend files
- Re-apply configurations
- Preserve existing data in `/app/data`

## Troubleshooting

### Backend fails to start

Check the logs:

```bash
sudo journalctl -u raspsec-backend -f
sudo cat /var/log/raspsec/uwsgi.log
```

### Nginx returns 502

Ensure the backend socket exists and has correct permissions:

```bash
ls -la /run/raspsec/uwsgi.sock
sudo systemctl restart raspsec-backend
sudo systemctl restart nginx
```

### WiFi AP not visible

```bash
sudo systemctl status hostapd
sudo rfkill list
sudo rfkill unblock wifi
sudo systemctl restart hostapd
```

### Django migration errors

```bash
cd /app/backend
sudo -u raspsec python3 manage.py makemigrations --noinput
sudo -u raspsec python3 manage.py migrate --noinput
```
