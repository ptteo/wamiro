#!/usr/bin/env bash
# =============================================================================
# Wamiro — Oracle Cloud Always Free (A1.Flex 4vCPU/12GB, Ubuntu 22.04 ARM)
# Turnkey installer: base deps + Wamiro app + Caddy TLS.
#
# Usage:
#   git clone <repo> /opt/wamiro && cd /opt/wamiro
#   cp .env.example .env && nano .env        # set DATABASE_URL + APP_URL first
#   sudo bash scripts/install-oracle.sh
#
# Idempotent — safe to re-run. Do not install Zammad or Frappe HR on this
# box; HR and tickets are native Wamiro modules.
# =============================================================================
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run with sudo"; exit 1; }
APP_DIR="${APP_DIR:-/opt/wamiro}"
DOMAIN="${DOMAIN:-}"
[[ -f "$APP_DIR/.env" ]] && DOMAIN=$(grep -oP '^APP_URL=https?://\K[^/]+' "$APP_DIR/.env" | head -1)
echo "==> Domain: ${DOMAIN:-<not set, Caddy will serve on :80>}"

echo "==> [1/6] System deps"
apt update -qq && apt upgrade -y -qq
apt install -y -qq curl git caddy

echo "==> [2/6] Swap (4G — protects the DB driver during builds)"
if [[ ! -f /swapfile ]]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> [3/6] Node.js 22"
if ! command -v node >/dev/null || [[ $(node -v | cut -dv -f2 | cut -d. -f1) -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y -qq nodejs
fi
node -v

echo "==> [4/6] Build Wamiro"
cd "$APP_DIR"
sudo -u ubuntu npm ci --no-audit --no-fund 2>/dev/null || npm ci --no-audit --no-fund
npm run build
mkdir -p data && chown ubuntu:ubuntu data   # document storage dir

echo "==> [5/6] systemd service"
cat > /etc/systemd/system/wamiro.service <<EOF
[Unit]
Description=Wamiro Company OS
After=network.target postgresql.service
[Service]
User=ubuntu
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now wamiro
sleep 3
curl -fsS http://localhost:3000/api/v1/health && echo " ← health OK"

echo "==> [6/6] Caddy reverse proxy"
if [[ -n "$DOMAIN" ]]; then
  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:3000
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
    }
}
EOF
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  echo "    https://$DOMAIN ready (Caddy auto-TLS)"
else
  echo "    APP_URL not set — configure Caddy manually later"
fi

echo ""
echo "============================================================"
echo " WAMIRO IS LIVE"
echo "============================================================"
echo " Next steps:"
echo "   1. sudo -u ubuntu npm run db:migrate:raw   # if not yet run"
echo "   2. sudo -u ubuntu npm run db:seed          # demo users"
echo "   3. If this box still has leftover Zammad/Frappe from an older"
echo "      install: sudo CONFIRM=yes bash scripts/remove-zammad-frappe.sh"
echo "============================================================"
