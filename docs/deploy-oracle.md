# Wamiro on Oracle Cloud (Always Free, ARM Ampere) — deployment runbook

Target: **one Oracle Always Free VM.Standard.A1.Flex** — 4 vCPU / 12 GB RAM /
200 GB boot volume, Ubuntu 22.04 (aarch64). PostgreSQL stays on AWS RDS.

Memory budget on a 12 GB box:

| Service | ~RAM |
| --- | --- |
| Wamiro (Next.js) | 0.5 GB |
| Caddy | 0.1 GB |
| Wamiro mail worker (IMAP polling) | 0.1 GB |
| Meilisearch / Paperless-ngx (optional later) | 1.0 GB |
| OS + headroom | 10.3 GB |

> Post-Phase-6 cutover: Frappe HR and Zammad are **no longer deployed** —
> attendance, leave, payroll, and helpdesk run natively inside Wamiro.
> Sections 4–5 moved to the historical appendix at the end of this file.

## 1. Instance

- Shape: VM.Standard.A1.Flex, 4 OCPU / 12 GB
- Image: Ubuntu 22.04 (aarch64)
- Networking: allow inbound 80/443; SSH from your IP only
- Attach/reserve a public IP; point DNS A records:
  - `wamiro.example.com` → app

> If creation fails with "out of capacity", retry periodically or upgrade to
> Pay-As-You-Go (still free within Always Free limits, far better availability).

## 2. Base software (ARM64)

```bash
sudo apt update && sudo apt upgrade -y
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Node 22 (arm64 build installs automatically)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs caddy git

# Docker (for Zammad; ARM64 images included)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

## 3. Wamiro (identical to Lightsail flow)

```bash
sudo mkdir -p /opt/wamiro && sudo chown ubuntu:ubuntu /opt/wamiro
cd /opt/wamiro            # clone repo here
cp .env.example .env && vi .env   # DATABASE_URL (RDS), APP_URL=https://wamiro.example.com
npm ci
npm run build
npm run db:migrate:raw    # applies all pending migrations
```

systemd unit `/etc/systemd/system/wamiro.service`:

```ini
[Unit]
Description=Wamiro
After=network.target
[Service]
User=ubuntu
WorkingDirectory=/opt/wamiro
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
[Install]
WantedBy=multi-user.target
```

Caddy site for the app:

```
wamiro.example.com {
    reverse_proxy localhost:3000
}
```

## 4. Verify

```bash
curl -s https://wamiro.example.com/api/v1/health   # {"ok":true,"db":true}
```

## 5. Backups

- RDS automated backups cover all Wamiro data (including attachments and HR
  documents under `WAMIRO_DATA_DIR`).

---

## Appendix A — Historical: Zammad + Frappe deployments (removed in Phase 6 cutover)

The following sections describe the pre-cutover setup where Wamiro delegated
helpdesk to Zammad and the HR employee master to Frappe HR. Both were removed
in Phase 6 — the native `/tickets` module and the native people/payroll modules
are the only implementation. Kept for historical record; do not reinstall.

### A.1 Zammad (Docker Compose)

```bash
cd /opt && git clone https://github.com/zammad/zammad-docker-compose.git zammad
cd zammad
cp .env.example .env
vi .env    # set POSTGRES_PASS, REDIS_PASSWORD, and ELASTICSEARCH_HEAP_SIZE=1g
docker compose up -d
```

First start takes several minutes (migrations run automatically).
Then in Zammad UI: Admin → Token Access → create an API token → put it plus
`https://helpdesk.example.com` into Wamiro's `.env` as `ZAMMAD_BASE_URL` /
`ZAMMAD_TOKEN` → `sudo systemctl restart wamiro`.

Caddy:

```
helpdesk.example.com {
    reverse_proxy localhost:8080
}
```

(Compose exposes zammad-nginx on 8080.)

### A.2 Frappe HR (bench install — interactive)

```bash
# prerequisites (MariaDB local, redis, python, node already present)
sudo apt install -y mariadb-server redis-server libffi-dev libmariadb-dev pkg-config python3-dev
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'StrongMariaPass'; FLUSH PRIVILEGES;"
pip3 install frappe-bench
cd /opt && bench init frappe-bench --frappe-branch version-15
cd frappe-bench
bench new-site hr.example.com --db-root-password StrongMariaPass --admin-password StrongAdminPass
bench get-app hrms --branch version-15
bench --site hr.example.com install-app hrms
bench setup nginx --yes || true        # optional; Caddy can proxy instead
bench start                            # dev runner — use supervisor for prod:
bench setup production                 # configures nginx+supervisor; disable nginx if using Caddy
```

Caddy (if bypassing Frappe's nginx):

```
hr.example.com {
    reverse_proxy localhost:8000
}
```

Create an API user in Frappe (API key/secret) with HR roles, then set in
Wamiro's `.env`: `FRAPPE_BASE_URL=https://hr.example.com`,
`FRAPPE_TOKEN=key:secret`. The Sync button appears under Admin.

- Zammad volumes: back up Postgres DB (can live in RDS by creating a second
  database there and editing compose envs) and /opt/zammad.
