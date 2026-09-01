#!/usr/bin/env bash
# =============================================================================
# Wamiro backup (§54): nightly pg_dump of the application database.
# Install on the app VM (or any host that can reach RDS):
#   sudo cp scripts/backup.sh /etc/cron.daily/wamiro-backup
#   sudo chmod +x /etc/cron.daily/wamiro-backup
#
# Requires DATABASE_URL in the environment (or /opt/wamiro/.env).
# Retention: 14 local, copy off-box weekly for real DR.
# RPO target: 24h (RDS automated backups + WAL give point-in-time recovery —
# verify with `aws rds describe-db-instance-backups`).
# Restore: see docs/deploy-oracle.md "Backups" and the RDS restore flow.
# =============================================================================
set -euo pipefail

if [[ -f /opt/wamiro/.env ]]; then
  set -a; source /opt/wamiro/.env; set +a
fi
: "${DATABASE_URL:?DATABASE_URL required}"

BACKUP_DIR="${BACKUP_DIR:-/opt/backups}"
KEEP_DAYS=14
STAMP=$(date +%F_%H%M)
mkdir -p "$BACKUP_DIR"

echo "==> dumping $STAMP"
pg_dump "$DATABASE_URL" --no-owner --no-privileges \
  | gzip > "$BACKUP_DIR/wamiro-$STAMP.sql.gz"

echo "==> pruning > $KEEP_DAYS days"
find "$BACKUP_DIR" -name 'wamiro-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "==> latest:"
ls -lh "$BACKUP_DIR"/wamiro-"$STAMP".sql.gz
