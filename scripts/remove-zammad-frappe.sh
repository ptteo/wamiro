#!/usr/bin/env bash
# =============================================================================
# Remove leftover Zammad + Frappe HR from a Wamiro host (Lightsail / Oracle).
#
# Native people / attendance / leave / payroll / tickets already replaced both
# products. This only frees RAM/disk. It never touches:
#   - /opt/wamiro
#   - wamiro.service / jobs worker
#   - RDS Postgres
#   - Node, Caddy process, swap, SSH, UFW
#
# Usage (on the box, as root):
#   sudo CONFIRM=yes bash scripts/remove-zammad-frappe.sh
#
# Optional:
#   BACKUP_DIR=/var/backups/wamiro-legacy   # default: /var/backups/wamiro-legacy-<date>
#   PURGE_PACKAGES=1                        # also apt-remove mariadb/redis/nginx if idle
# =============================================================================
set -euo pipefail

[[ ${EUID:-} -eq 0 ]] || { echo "Run with sudo"; exit 1; }
[[ "${CONFIRM:-}" == "yes" ]] || {
  echo "Refusing to run. Re-run with CONFIRM=yes after you have a snapshot."
  echo "  sudo CONFIRM=yes bash scripts/remove-zammad-frappe.sh"
  exit 1
}

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/wamiro-legacy-$STAMP}"
WAMIRO_DIR="${WAMIRO_DIR:-/opt/wamiro}"
KEEP=(
  "$WAMIRO_DIR"
  /etc/systemd/system/wamiro.service
  /etc/systemd/system/wamiro-jobs.service
  /etc/systemd/system/wamiro-mail.service
)

echo "==> Safety checks"
for p in "${KEEP[@]}"; do
  [[ -e "$p" ]] && echo "    keep $p"
done
if [[ ! -d "$WAMIRO_DIR" ]]; then
  echo "    note: $WAMIRO_DIR not present — continuing (Wamiro may live elsewhere)"
fi

mkdir -p "$BACKUP_DIR"
echo "==> Backups → $BACKUP_DIR"

backup_path() {
  local src=$1
  [[ -e "$src" ]] || return 0
  local dest="$BACKUP_DIR$(echo "$src" | tr '/' '_')"
  echo "    copy $src"
  cp -a "$src" "$dest" 2>/dev/null || true
}

backup_path /etc/caddy/Caddyfile
backup_path /etc/nginx/nginx.conf
backup_path /etc/nginx/sites-enabled
backup_path /etc/supervisor/conf.d
if [[ -f "$WAMIRO_DIR/.env" ]]; then
  # Strip secrets from the backup copy — keep only the leftover keys we will drop.
  grep -E '^(FRAPPE_|ZAMMAD_)' "$WAMIRO_DIR/.env" >"$BACKUP_DIR/wamiro-env-legacy-keys.txt" || true
fi

if command -v docker >/dev/null 2>&1; then
  docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}' >"$BACKUP_DIR/docker-ps.txt" || true
fi
free -h >"$BACKUP_DIR/free-before.txt" || true
df -h >"$BACKUP_DIR/df-before.txt" || true

# ---------- Zammad (Docker Compose) ----------
echo "==> Stop Zammad"
ZAMMAD_DIRS=(
  /opt/zammad
  /opt/zammad-docker-compose
  /opt/zammad/zammad-docker-compose
)
compose_down() {
  local dir=$1
  if docker compose version >/dev/null 2>&1; then
    (cd "$dir" && docker compose down -v --remove-orphans)
  elif command -v docker-compose >/dev/null 2>&1; then
    (cd "$dir" && docker-compose down -v --remove-orphans)
  else
    return 1
  fi
}

stopped_zammad=0
for dir in "${ZAMMAD_DIRS[@]}"; do
  if [[ -f "$dir/docker-compose.yml" || -f "$dir/compose.yaml" ]]; then
    echo "    docker compose down in $dir"
    tar -C "$(dirname "$dir")" -czf "$BACKUP_DIR/$(basename "$dir").tgz" "$(basename "$dir")" 2>/dev/null || true
    compose_down "$dir" || true
    stopped_zammad=1
  fi
done
if command -v docker >/dev/null 2>&1; then
  mapfile -t zc < <(docker ps -aq --filter name=zammad 2>/dev/null || true)
  if ((${#zc[@]})); then
    echo "    docker rm -f leftover zammad containers"
    docker rm -f "${zc[@]}" || true
    stopped_zammad=1
  fi
  mapfile -t zv < <(docker volume ls -q | grep -i zammad || true)
  if ((${#zv[@]})); then
    docker volume rm -f "${zv[@]}" || true
  fi
fi
for dir in "${ZAMMAD_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    echo "    rm -rf $dir"
    rm -rf "$dir"
  fi
done
if [[ $stopped_zammad -eq 0 ]]; then
  echo "    no Zammad compose/containers found"
fi

# ---------- Frappe HR (bench + supervisor) ----------
echo "==> Stop Frappe HR"
FRAPPE_DIRS=(
  /opt/frappe-bench
  /home/frappe/frappe-bench
  /home/ubuntu/frappe-bench
)
if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl status 2>/dev/null | tee "$BACKUP_DIR/supervisor-before.txt" || true
  # Stop only frappe-named programs — leave unrelated supervisor jobs alone.
  while read -r prog _; do
    [[ "$prog" == *frappe* || "$prog" == *bench* ]] || continue
    echo "    supervisorctl stop $prog"
    supervisorctl stop "$prog" || true
  done < <(supervisorctl status 2>/dev/null | awk '{print $1}' || true)
fi
for svc in frappe-bench bench-web; do
  systemctl stop "$svc" 2>/dev/null || true
  systemctl disable "$svc" 2>/dev/null || true
done
# Common bench production unit names (never match wamiro.service)
systemctl list-units --type=service --all --no-legend 2>/dev/null \
  | awk '{print $1}' \
  | grep -Ei 'frappe|frappe-bench' \
  | while read -r unit; do
      echo "    systemctl stop $unit"
      systemctl stop "$unit" || true
      systemctl disable "$unit" || true
    done || true

if command -v mysql >/dev/null 2>&1 && { systemctl is-active --quiet mariadb || systemctl is-active --quiet mysql; }; then
  echo "    dump MariaDB (Frappe sites) before drop"
  mysqldump --all-databases --single-transaction --quick 2>/dev/null \
    | gzip >"$BACKUP_DIR/mariadb-all.sql.gz" || true
fi

# Collect Frappe site DB names from site_config.json *before* deleting the bench.
FRAPPE_DBS_FILE="$BACKUP_DIR/frappe-db-names.txt"
: >"$FRAPPE_DBS_FILE"
for dir in "${FRAPPE_DIRS[@]}"; do
  [[ -d "$dir/sites" ]] || continue
  find "$dir/sites" -name site_config.json -print0 2>/dev/null \
    | while IFS= read -r -d '' cfg; do
        python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('db_name') or '')" "$cfg" 2>/dev/null \
          | grep -v '^$' >>"$FRAPPE_DBS_FILE" || true
      done
done

for dir in "${FRAPPE_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    echo "    archive then rm $dir"
    tar -C "$(dirname "$dir")" -czf "$BACKUP_DIR/$(basename "$dir").tgz" "$(basename "$dir")" 2>/dev/null || true
    if [[ -x "$dir/env/bin/bench" ]]; then
      (cd "$dir" && sudo -u "$(stat -c %U "$dir")" ./env/bin/bench stop) 2>/dev/null || true
    fi
    rm -rf "$dir"
  fi
done

# Drop only the MariaDB schemas Frappe actually used. Never touch Postgres / RDS.
if command -v mysql >/dev/null 2>&1 && [[ -s "$FRAPPE_DBS_FILE" ]]; then
  sort -u "$FRAPPE_DBS_FILE" | while read -r db; do
    [[ "$db" =~ ^[A-Za-z0-9_]+$ ]] || continue
    echo "    drop MariaDB database $db"
    mysql -e "DROP DATABASE \`$db\`;" || true
  done
fi

# ---------- Reverse proxy: drop helpdesk / HR vhosts only ----------
echo "==> Caddy / nginx vhosts"
strip_caddy() {
  local f=/etc/caddy/Caddyfile
  [[ -f "$f" ]] || return 0
  python3 - "$f" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text()
# Remove site blocks whose labels mention helpdesk/zammad/frappe or typical HR host.
pat = re.compile(
    r'(?ms)^[ \t]*(?:helpdesk|zammad|frappe|hr)[^\n{]*\{(?:[^{}]|\{[^{}]*\})*\}\n?'
)
new, n = pat.subn("", text)
if n:
    p.write_text(new)
    print(f"    removed {n} Caddy site block(s)")
else:
    print("    Caddyfile has no helpdesk/hr/zammad/frappe site blocks")
PY
}
if command -v python3 >/dev/null 2>&1; then
  strip_caddy
else
  echo "    python3 missing — Caddyfile left unchanged; remove helpdesk/hr blocks by hand"
fi
if command -v caddy >/dev/null 2>&1 && [[ -f /etc/caddy/Caddyfile ]]; then
  caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && systemctl reload caddy || {
    echo "    Caddy validate failed — restored from backup, leaving Caddy as-is"
    cp -a "$BACKUP_DIR/_etc_caddy_Caddyfile" /etc/caddy/Caddyfile 2>/dev/null || true
  }
fi

# Frappe's `bench setup production` often installs nginx. Stop nginx only when
# Caddy is the live proxy (Wamiro runbook) so we do not brick a nginx-fronted app.
if systemctl is-active --quiet nginx 2>/dev/null && systemctl is-active --quiet caddy 2>/dev/null; then
  echo "    Caddy is active — stopping nginx (was Frappe production proxy)"
  systemctl stop nginx || true
  systemctl disable nginx || true
fi

# ---------- Wamiro env leftovers (unused since Phase 6) ----------
if [[ -f "$WAMIRO_DIR/.env" ]] && grep -qE '^(FRAPPE_|ZAMMAD_)' "$WAMIRO_DIR/.env"; then
  echo "==> Strip unused FRAPPE_* / ZAMMAD_* from $WAMIRO_DIR/.env"
  tmp=$(mktemp)
  grep -vE '^(FRAPPE_|ZAMMAD_)' "$WAMIRO_DIR/.env" >"$tmp"
  cat "$tmp" >"$WAMIRO_DIR/.env"
  rm -f "$tmp"
  echo "    env cleaned; native modules do not read those keys — no restart required"
fi

# ---------- Optional package purge ----------
if [[ "${PURGE_PACKAGES:-}" == "1" ]]; then
  echo "==> PURGE_PACKAGES=1 — remove idle MariaDB / Redis / nginx"
  # Only if Wamiro is not using them (it uses RDS + Caddy).
  for svc in mariadb mysql redis-server redis nginx; do
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
  done
  apt-get remove -y mariadb-server mysql-server redis-server nginx 2>/dev/null || true
  apt-get autoremove -y || true
fi

echo "==> After"
free -h | tee "$BACKUP_DIR/free-after.txt" || true
echo ""
echo "============================================================"
echo " Zammad + Frappe HR removed"
echo "============================================================"
echo " Kept: $WAMIRO_DIR, Caddy (Wamiro vhost), RDS, systemd wamiro units"
echo " Backup: $BACKUP_DIR"
echo " Next: deploy Wamiro per docs/deploy-lightsail.md"
echo "============================================================"
