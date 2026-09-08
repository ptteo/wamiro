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

> Attendance, leave, payroll, and helpdesk run natively inside Wamiro.
> Do **not** install Zammad or Frappe HR. If an older box still has them,
> run `sudo CONFIRM=yes bash scripts/remove-zammad-frappe.sh`.

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
```

## 3. Wamiro (identical to Lightsail flow)

```bash
sudo mkdir -p /opt/wamiro && sudo chown ubuntu:ubuntu /opt/wamiro
cd /opt/wamiro            # clone repo here
cp .env.example .env && vi .env   # DATABASE_URL, APP_URL, SECRET_KEY
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
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1
Restart=always
[Install]
WantedBy=multi-user.target
```

Caddy site for the app (bind the Node process to loopback; rate limits trust
the first `X-Forwarded-For` hop, so port 3000 must not be public):

```
{
    servers {
        trusted_proxies static 127.0.0.1/32
    }
}

wamiro.example.com {
    reverse_proxy 127.0.0.1:3000
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

## Leftover Zammad / Frappe HR

Do not reinstall either product. If this VM still has `/opt/zammad` or
`/opt/frappe-bench` from before the native-HR cutover:

```bash
cd /opt/wamiro
sudo CONFIRM=yes bash scripts/remove-zammad-frappe.sh
```

The script stops those stacks, archives them under `/var/backups/`, and leaves
Wamiro, Caddy, Node, and RDS alone. See `docs/deploy-lightsail.md` §9.
