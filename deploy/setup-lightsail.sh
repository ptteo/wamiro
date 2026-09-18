#!/usr/bin/env bash
# One-shot Lightsail setup: Caddy + systemd (app + jobs worker).
# Run on the server as ubuntu AFTER npm ci, build, migrate, and .env exist:
#   cd ~/wamiro && bash deploy/setup-lightsail.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="${SUDO_USER:-$(whoami)}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
SERVICE_DIR="${APP_DIR:-$APP_HOME/wamiro}"

if [[ ! -f "$SERVICE_DIR/.env" ]]; then
  echo "ERROR: $SERVICE_DIR/.env missing. Create it first."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found. Install Node 22 first."
  exit 1
fi

if [[ ! -d "$SERVICE_DIR/.next-build" && ! -d "$SERVICE_DIR/.next" ]]; then
  echo "ERROR: no production build found. Run: npm ci && npm run build"
  exit 1
fi

echo "==> Installing Caddy (official repo)"
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt update
  sudo NEEDRESTART_MODE=a apt install -y caddy
fi
caddy version

echo "==> Caddyfile"
sudo cp "$SERVICE_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile

echo "==> systemd: wamiro.service"
sudo tee /etc/systemd/system/wamiro.service >/dev/null <<EOF
[Unit]
Description=Wamiro Company OS
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$SERVICE_DIR
EnvironmentFile=$SERVICE_DIR/.env
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

echo "==> systemd: wamiro-jobs.service"
sudo tee /etc/systemd/system/wamiro-jobs.service >/dev/null <<EOF
[Unit]
Description=Wamiro background jobs
After=network.target wamiro.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$SERVICE_DIR
EnvironmentFile=$SERVICE_DIR/.env
ExecStart=/usr/bin/npm run jobs:worker
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "$SERVICE_DIR/data"

echo "==> Firewall (ufw)"
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp || true
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
  sudo ufw deny 3000/tcp || true
  sudo ufw --force enable || true
fi

echo "==> Start services"
sudo systemctl daemon-reload
sudo systemctl enable caddy wamiro wamiro-jobs
sudo systemctl restart caddy wamiro wamiro-jobs

sleep 2
echo ""
echo "==> Status"
sudo systemctl --no-pager status caddy wamiro wamiro-jobs || true
echo ""
curl -sf http://127.0.0.1:3000/api/v1/health/live && echo " — app OK" || echo "WARN: app health check failed"
echo ""
echo "Done. Open: https://work-portal.howdyanalytics.com"
echo "Logs: journalctl -u wamiro -f"
