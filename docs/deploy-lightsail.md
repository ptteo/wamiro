# Wamiro on AWS Lightsail — deployment runbook

Target: one Lightsail instance (Ubuntu 22.04, ≥2 GB RAM recommended for
builds; 1 GB works with a swap file) + your existing RDS Postgres.

## 1. RDS preparation

- Security group: allow inbound 5432 **only** from the Lightsail instance's
  private/public IP.
- Database created (e.g. `wamiro`), user with DDL rights for migrations.
- Keep `sslmode=require` in the connection string.
- Enable automated backups + retention (7 days minimum).

## 2. Instance setup

```bash
# as ubuntu user
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs caddy
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile   # only on 1 GB boxes
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. App install

```bash
sudo mkdir -p /opt/wamiro && sudo chown ubuntu:ubuntu /opt/wamiro
# copy the repo to /opt/wamiro (git clone or rsync)
cd /opt/wamiro
cp .env.example .env && vi .env    # set DATABASE_URL, APP_URL
npm ci
npm run build
npm run db:generate                 # once, to emit migrations from schema
npm run db:migrate                  # first deploy only
```

## 4. systemd service

`/etc/systemd/system/wamiro.service`:

```ini
[Unit]
Description=Wamiro Company OS
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/wamiro
EnvironmentFile=/opt/wamiro/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now wamiro
```

## 5. Caddy reverse proxy (automatic HTTPS)

`/etc/caddy/Caddyfile`:

```
your-domain.com {
    reverse_proxy localhost:3000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options DENY
    }
}
```

```bash
sudo systemctl reload caddy
```

Point DNS A record at the instance. Caddy obtains certificates automatically.

## 6. Backups & recovery

- RDS automated backups are the primary recovery mechanism — verify a restore
  into a scratch instance before go-live.
- Optional nightly logical dump:

```bash
# crontab -e (ubuntu)
15 2 * * * pg_dump "$DATABASE_URL" | gzip > /opt/wamiro/backups/wamiro-$(date +\%F).sql.gz
```

Keep 14 days; copy off-instance weekly. Test restores quarterly.

## 7. Health check & monitoring

`GET /api/v1/health` returns `{"ok":true,"db":true}` (HTTP 200) when the app
and database are reachable, 503 otherwise. Point uptime monitoring at it, e.g.
UptimeRobot (free) or a systemd timer with curl.

## 8. Updates

```bash
cd /opt/wamiro
git pull
npm ci
npm run build
npm run db:migrate     # expand-safe migrations only
sudo systemctl restart wamiro
```

Rollback: redeploy previous git tag; migrations are additive by policy.
