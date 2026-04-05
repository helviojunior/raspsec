#!/bin/bash
#
# RaspSec — Linux Installer for Debian/Ubuntu
#
# Prepares a Debian/Ubuntu machine to run RaspSec by installing all
# system dependencies, cloning the repository, building the frontend,
# configuring services, and setting up networking.
#
# Usage:
#   wget --no-cache -q -O- https://raw.githubusercontent.com/helviojunior/raspsec/main/linux_install.sh | sudo bash
#
set -e

# ── Colors and helpers ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[-]${NC} $*"; }
step()  { echo -e "\n${CYAN}==>${NC} ${CYAN}$*${NC}"; }

REPO_URL="https://github.com/helviojunior/raspsec.git"
INSTALL_DIR="/opt/raspsec"
BRANCH="main"
NODE_MAJOR=20

# ── Step 0: Root check ─────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
    error "This script must be run as root."
    error "Usage: wget --no-cache -q -O- https://raw.githubusercontent.com/helviojunior/raspsec/main/linux_install.sh | sudo bash"
    exit 1
fi

# ── Step 1: User confirmation ──────────────────────────────────────
echo ""
echo "============================================================"
echo "  RaspSec — Linux Installer for Debian/Ubuntu"
echo "============================================================"
echo ""
warn "This script will make significant changes to this system:"
echo ""
echo "  - Install system packages (nginx, dnsmasq, hostapd, etc.)"
echo "  - Create the 'raspsec' system user with sudo privileges"
echo "  - Replace Nginx configuration"
echo "  - Install and enable systemd services"
echo "  - Configure network interfaces (dhcpcd, dnsmasq, hostapd)"
echo "  - Configure iptables firewall rules"
echo "  - Install Node.js ${NODE_MAJOR}.x and build the frontend"
echo "  - Install Python dependencies system-wide"
echo "  - Clone the repository to ${INSTALL_DIR}"
echo ""
warn "DO NOT run this on a production machine!"
warn "This is intended for dedicated RaspSec appliances only."
echo ""
read -r -p "Do you want to continue? [y/N] " confirm
case "$confirm" in
    [yY][eE][sS]|[yY]) ;;
    *)
        echo "Aborted."
        exit 0
        ;;
esac

# ── Step 2: Detect architecture ────────────────────────────────────
step "Detecting system architecture..."

ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
case "$ARCH" in
    amd64|x86_64)  GO_ARCH="amd64"; NODE_ARCH="x64" ;;
    arm64|aarch64) GO_ARCH="arm64"; NODE_ARCH="arm64" ;;
    armhf|armv7l)  GO_ARCH="armv6l"; NODE_ARCH="armv7l" ;;
    *)
        error "Unsupported architecture: ${ARCH}"
        exit 1
        ;;
esac
info "Architecture: ${ARCH} (Go: ${GO_ARCH}, Node: ${NODE_ARCH})"

# ── Step 3: Install system packages ────────────────────────────────
step "Installing system packages..."

export DEBIAN_FRONTEND=noninteractive

apt-get update -y

# Pre-seed debconf for non-interactive installs
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
echo wireshark-common wireshark-common/install-setuid boolean false | debconf-set-selections

apt-get install -y --no-install-recommends \
    nginx-extras openssl \
    python3 python3-pip python3-venv python3-dev \
    build-essential \
    uwsgi uwsgi-plugin-python3 \
    git curl wget jq \
    hostapd dnsmasq iptables-persistent dhcpcd5 iw \
    vnstat qrencode isoquery rsyslog \
    tcpdump macchanger vim xxd sqlite3 python3-pil \
    traceroute dnsutils \
    bind9 \
    wireless-tools net-tools rfkill \
    aircrack-ng \
    tshark \
    reaver bully \
    cowpatty \
    hashcat hcxdumptool hcxtools \
    strongswan strongswan-pki strongswan-swanctl \
    libcharon-extra-plugins libstrongswan-extra-plugins charon-systemd \
    openvpn \
    ca-certificates gnupg

info "System packages installed."

# ── Step 4: Install Node.js ────────────────────────────────────────
step "Installing Node.js ${NODE_MAJOR}.x..."

if command -v node &>/dev/null && node -v | grep -q "^v${NODE_MAJOR}\."; then
    info "Node.js $(node -v) already installed, skipping."
else
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y nodejs
    info "Node.js $(node -v) installed."
fi

# ── Step 5: Install Go ─────────────────────────────────────────────
step "Installing Go..."

GO_VERSION="1.24.1"
if command -v go &>/dev/null && go version | grep -q "go${GO_VERSION}"; then
    info "Go ${GO_VERSION} already installed, skipping."
else
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -O /tmp/go.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf /tmp/go.tar.gz
    ln -sf /usr/local/go/bin/go /usr/bin/go
    ln -sf /usr/local/go/bin/gofmt /usr/bin/gofmt
    rm -f /tmp/go.tar.gz
    info "Go $(go version) installed."
fi

# ── Step 6: Create raspsec user ────────────────────────────────────
step "Creating raspsec user..."

if id "raspsec" &>/dev/null; then
    info "User 'raspsec' already exists."
    for group in sudo www-data; do
        if ! id -nG "raspsec" | grep -qw "$group"; then
            usermod -aG "$group" raspsec
        fi
    done
else
    useradd -m -s /bin/bash -G sudo,www-data -c "RaspSec Admin" raspsec
    echo "raspsec:@Pass123" | chpasswd
    info "User 'raspsec' created (default password: @Pass123)."
fi

# Passwordless sudo
echo "raspsec ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/010_raspsec
chmod 0440 /etc/sudoers.d/010_raspsec

# ── Step 7: Clone repository ───────────────────────────────────────
step "Cloning RaspSec repository to ${INSTALL_DIR}..."

if [ -d "${INSTALL_DIR}/.git" ]; then
    info "Repository already exists, pulling latest changes..."
    cd "${INSTALL_DIR}"
    git fetch origin
    git reset --hard "origin/${BRANCH}"
else
    rm -rf "${INSTALL_DIR}"
    git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi

info "Repository ready at ${INSTALL_DIR}."

# ── Step 8: Install Python dependencies ────────────────────────────
step "Installing Python dependencies..."

pip3 install --break-system-packages wheel
pip3 install --break-system-packages -r "${INSTALL_DIR}/backend/requirements.txt"

# Pyrit (optional)
pip3 install --break-system-packages pyrit 2>/dev/null || \
    warn "pyrit install failed (optional — handshake detection fallback)"

info "Python dependencies installed."

# ── Step 9: Build frontend ─────────────────────────────────────────
step "Building frontend..."

cd "${INSTALL_DIR}/frontend"

# Resolve app version from git
APP_VERSION=$(cd "${INSTALL_DIR}" && git describe --tags --abbrev=0 2>/dev/null || echo "0.1.0")
APP_VERSION="${APP_VERSION#v}"
info "App version: ${APP_VERSION}"

npm ci --silent --legacy-peer-deps

# Inject version into package.json
sed -i "s/\"version\": \".*\"/\"version\": \"${APP_VERSION}\"/" package.json

APP_VERSION="${APP_VERSION}" CI=true npm run build --silent

info "Frontend built."

# ── Step 10: Create app directories ────────────────────────────────
step "Setting up application directories..."

mkdir -p /app/html
mkdir -p /app/backend
mkdir -p /app/data
mkdir -p /etc/raspsec/tls
mkdir -p /var/log/raspsec
mkdir -p /run/raspsec
mkdir -p /usr/share/raspsec
mkdir -p /etc/issue.d

# ── Step 11: Deploy frontend ───────────────────────────────────────
step "Deploying frontend to /app/html..."

rsync -a --delete "${INSTALL_DIR}/frontend/build/" /app/html/
info "Frontend deployed."

# ── Step 12: Deploy backend ────────────────────────────────────────
step "Deploying backend to /app/backend..."

rsync -a --delete \
    --exclude='__pycache__' --exclude='*.pyc' \
    --exclude='data/' --exclude='.env' \
    --exclude='db.sqlite3' --exclude='db.sqlite3-journal' \
    --exclude='db.sqlite3-wal' --exclude='db.sqlite3-shm' \
    --exclude='staticfiles/' --exclude='media/' \
    --include='*/migrations/__init__.py' --exclude='*/migrations/*.py' \
    "${INSTALL_DIR}/backend/" /app/backend/

# Inject version into settings.py
sed -i "s/^VERSION *= *['\"].*['\"]$/VERSION = '${APP_VERSION}'/" /app/backend/stratasec/settings.py

info "Backend deployed."

# ── Step 13: Configure Nginx ───────────────────────────────────────
step "Configuring Nginx..."

rm -f /etc/nginx/sites-enabled/default
cp "${INSTALL_DIR}/raspberry/config/nginx-raspsec.conf" /etc/nginx/nginx.conf

info "Nginx configured."

# ── Step 14: Install uWSGI config ──────────────────────────────────
step "Installing uWSGI configuration..."

cp "${INSTALL_DIR}/raspberry/config/uwsgi-raspsec.ini" /etc/raspsec/uwsgi-raspsec.ini

info "uWSGI configured."

# ── Step 15: Install systemd services ──────────────────────────────
step "Installing systemd services..."

# Core services
cp "${INSTALL_DIR}/raspberry/config/raspsec-backend.service"    /etc/systemd/system/
cp "${INSTALL_DIR}/raspberry/config/raspsec-tls-init.service"   /etc/systemd/system/
cp "${INSTALL_DIR}/raspberry/config/raspsec-shell.service"      /etc/systemd/system/
cp "${INSTALL_DIR}/raspberry/config/raspsec-spectrum.service"   /etc/systemd/system/
cp "${INSTALL_DIR}/raspberry/config/raspsec-log-dirs.service"   /etc/systemd/system/
cp "${INSTALL_DIR}/raspberry/config/raspsec-wifi-unblock.service" /etc/systemd/system/
cp "${INSTALL_DIR}/raspberry/config/raspsec-usb-gadget.service" /etc/systemd/system/
cp "${INSTALL_DIR}/raspberry/config/raspsec-issue.service"      /etc/systemd/system/
cp "${INSTALL_DIR}/raspberry/config/raspsec-issue.timer"        /etc/systemd/system/

info "Systemd services installed."

# ── Step 16: Install helper scripts ────────────────────────────────
step "Installing helper scripts..."

cp "${INSTALL_DIR}/raspberry/scripts/"*.sh /usr/share/raspsec/ 2>/dev/null || true
chmod +x /usr/share/raspsec/*.sh

# Network info banner (also used by raspsec-issue.service)
cp "${INSTALL_DIR}/raspberry/scripts/network-info-banner.sh" /usr/local/bin/raspsec-banner.sh
chmod +x /usr/local/bin/raspsec-banner.sh

# dhcpcd gateway hook
if [ -d /lib/dhcpcd/dhcpcd-hooks ]; then
    cp "${INSTALL_DIR}/raspberry/scripts/dhcpcd-gateway-hook.sh" \
       /lib/dhcpcd/dhcpcd-hooks/99-raspsec-gateway
    chmod +x /lib/dhcpcd/dhcpcd-hooks/99-raspsec-gateway
fi

info "Helper scripts installed."

# ── Step 17: Configure networking ──────────────────────────────────
step "Configuring networking..."

# hostapd
cp "${INSTALL_DIR}/raspberry/config/hostapd.conf" /etc/hostapd/hostapd.conf
mkdir -p /etc/default
echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd

# hostapd override (bring wlan0 up before start)
mkdir -p /etc/systemd/system/hostapd.service.d
cp "${INSTALL_DIR}/raspberry/config/hostapd-override.conf" \
   /etc/systemd/system/hostapd.service.d/override.conf

# dnsmasq
cp "${INSTALL_DIR}/raspberry/config/090_raspsec.conf" /etc/dnsmasq.d/
cp "${INSTALL_DIR}/raspberry/config/090_wlan0.conf"   /etc/dnsmasq.d/
cp "${INSTALL_DIR}/raspberry/config/090_usb0.conf"    /etc/dnsmasq.d/
rm -f /etc/dnsmasq.d/090_raspap.conf

# dhcpcd
cp "${INSTALL_DIR}/raspberry/config/dhcpcd.conf" /etc/dhcpcd.conf

# udev rules
cp "${INSTALL_DIR}/raspberry/config/80-raspsec-net.rules" /etc/udev/rules.d/

# iptables
mkdir -p /etc/iptables
cp "${INSTALL_DIR}/raspberry/config/rules.v4" /etc/iptables/rules.v4

# Modprobe (USB gadget branding)
cp "${INSTALL_DIR}/raspberry/config/raspsec-usb-gadget.conf" /etc/modprobe.d/

# NetworkManager unmanaged (if NM is installed)
if [ -d /etc/NetworkManager/conf.d ]; then
    cp "${INSTALL_DIR}/raspberry/config/10-raspsec-unmanaged.conf" /etc/NetworkManager/conf.d/
fi

info "Networking configured."

# ── Step 18: Configure journald (volatile) ─────────────────────────
step "Configuring journald for volatile storage..."

mkdir -p /etc/systemd/journald.conf.d
cp "${INSTALL_DIR}/raspberry/config/journald-volatile.conf" \
   /etc/systemd/journald.conf.d/raspsec.conf

info "Journald configured."

# ── Step 19: Install default data files ────────────────────────────
step "Installing default configuration files..."

for f in defaults.json blocklists.json dns-servers.json ethernet_over_usb.yml managment_ap.yml firewall.conf; do
    if [ ! -f "/app/data/$f" ]; then
        cp "${INSTALL_DIR}/raspberry/config/$f" /app/data/ 2>/dev/null || true
    fi
done

info "Default configuration files installed."

# ── Step 20: Set permissions ───────────────────────────────────────
step "Setting file permissions..."

chown -R raspsec:www-data /app
chmod -R 755 /app
chmod -R 775 /app/data
chown raspsec:www-data /var/log/raspsec
chown raspsec:www-data /run/raspsec

info "Permissions set."

# ── Step 21: Install shell prompt ──────────────────────────────────
step "Installing RaspSec shell prompt..."

cat > /etc/profile.d/raspsec-prompt.sh << 'PROMPT_EOF'
export TERM="xterm-color"
prompt_symbol="→"
export PS1="\[\033[0;31m\]\342\224\214\342\224\200\$([[ \$? != 0 ]] && echo \"[\[\033[0;31m\]\342\234\227\[\033[0;37m\]]\342\224\200\")[$(if [[ ${EUID} == 0 ]]; then echo '\[\033[01;31m\]root\[\033[01;33m\]${prompt_symbol}\[\033[01;96m\]\h'; else echo '\[\033[01;31m\]\u\[\033[01;33m\]${prompt_symbol}\[\033[01;96m\]\h'; fi)\[\033[0;31m\]]\342\224\200[\[\033[0;32m\]\w\[\033[0;31m\]]\n\[\033[0;31m\]\342\224\224\342\224\200\342\224\200\342\225\274 \[\033[0m\]\[\e[01;33m\]\\$\[\e[0m\]"
PROMPT_EOF

# Ensure prompt loads in interactive non-login shells
if ! grep -q 'raspsec-prompt' /etc/bash.bashrc 2>/dev/null; then
    echo '' >> /etc/bash.bashrc
    echo '# RaspSec custom prompt' >> /etc/bash.bashrc
    echo '[ -f /etc/profile.d/raspsec-prompt.sh ] && . /etc/profile.d/raspsec-prompt.sh' >> /etc/bash.bashrc
fi

info "Shell prompt installed."

# ── Step 22: Set hostname ──────────────────────────────────────────
step "Setting hostname to 'raspsec'..."

echo "raspsec" > /etc/hostname
hostnamectl set-hostname raspsec 2>/dev/null || true
if ! grep -q "raspsec" /etc/hosts; then
    sed -i '1s/^/127.0.0.1 raspsec\n/' /etc/hosts
fi

info "Hostname set."

# ── Step 23: Django setup ──────────────────────────────────────────
step "Running Django setup (migrations, static files, cron)..."

cd /app/backend
export DJANGO_SETTINGS_MODULE=stratasec.settings

python3 manage.py makemigrations --noinput 2>&1 || warn "makemigrations had issues"
python3 manage.py migrate --noinput 2>&1 || warn "migrate had issues"
python3 manage.py collectstatic --noinput 1>/dev/null 2>&1 || true

# Register cron jobs as raspsec user
su -c 'cd /app/backend && python3 manage.py crontab add 2>/dev/null' raspsec || true

# Fix DB permissions after migration
chown -R raspsec:www-data /app/backend/db.sqlite3 2>/dev/null || true
chown -R raspsec:www-data /app/data/ 2>/dev/null || true
chmod 664 /app/backend/db.sqlite3 2>/dev/null || true

info "Django setup complete."

# ── Step 24: Enable and start services ─────────────────────────────
step "Enabling systemd services..."

systemctl daemon-reload

# Unmask hostapd (Debian masks it by default)
systemctl unmask hostapd 2>/dev/null || true

# Enable services
systemctl enable \
    raspsec-log-dirs.service \
    raspsec-tls-init.service \
    raspsec-backend.service \
    raspsec-shell.service \
    raspsec-spectrum.service \
    raspsec-wifi-unblock.service \
    raspsec-usb-gadget.service \
    raspsec-issue.timer \
    nginx.service \
    hostapd.service \
    dnsmasq.service \
    ssh.service \
    2>/dev/null

info "Services enabled."

# ── Step 25: Generate TLS certificate ──────────────────────────────
step "Generating self-signed TLS certificate..."

if [ ! -f /etc/raspsec/tls/tls.cer ]; then
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /etc/raspsec/tls/tls.key \
        -out /etc/raspsec/tls/tls.cer \
        -subj "/C=BR/ST=SP/L=SaoPaulo/O=RaspSec/CN=raspsec.local"
    info "TLS certificate generated."
else
    info "TLS certificate already exists, skipping."
fi

# ── Step 26: Start services ────────────────────────────────────────
step "Starting services..."

systemctl restart raspsec-log-dirs.service 2>/dev/null || true
systemctl restart raspsec-backend.service
systemctl restart raspsec-shell.service
systemctl restart raspsec-spectrum.service
systemctl restart dnsmasq.service 2>/dev/null || true
systemctl restart nginx.service
systemctl start raspsec-issue.timer 2>/dev/null || true

# Wait for backend
sleep 3

info "Services started."

# ── Step 27: Cleanup ───────────────────────────────────────────────
step "Cleaning up..."

apt-get autoremove -y 2>/dev/null || true
apt-get clean 2>/dev/null || true

info "Cleanup complete."

# ── Step 28: Verify ────────────────────────────────────────────────
step "Verifying installation..."

echo ""
echo "  Service Status:"
for svc in raspsec-backend raspsec-shell raspsec-spectrum raspsec-tls-init nginx dnsmasq; do
    STATUS=$(systemctl is-active "$svc" 2>/dev/null || echo "unknown")
    printf "    %-25s %s\n" "$svc" "$STATUS"
done

echo ""
echo "  Health Check:"
HEALTH=$(curl -sk https://localhost/api/health/ 2>/dev/null)
READY=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['ready'])" 2>/dev/null)
echo "    ready: ${READY:-unknown}"

# ── Done ────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo -e "  ${GREEN}RaspSec installation complete!${NC}"
echo "============================================================"
echo ""
echo "  Repository:  ${INSTALL_DIR}"
echo "  Frontend:    /app/html"
echo "  Backend:     /app/backend"
echo "  Data:        /app/data"
echo "  Configs:     /etc/raspsec"
echo ""
echo "  Web UI:      https://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost')"
echo "  Default user: raspsec / @Pass123"
echo ""
warn "Remember to change the default password!"
warn "A reboot is recommended to apply all changes."
echo ""
