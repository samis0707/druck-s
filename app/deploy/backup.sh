#!/usr/bin/env bash
# Nächtliches Datenbank-Backup: pg_dump -> gzip -> Object Storage (rclone-Remote "scw").
# Cron (Benutzer mit Docker-Zugriff): 15 3 * * * /opt/druckraum/app/deploy/backup.sh >> /var/log/druckraum-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
docker compose -f docker-compose.scaleway.yml exec -T postgres pg_dump -U dam --no-owner dam \
  | gzip -9 \
  | rclone rcat "scw:${BACKUP_BUCKET}/db/dam-${STAMP}.sql.gz"
# 30 Tage aufbewahren
rclone delete --min-age 30d "scw:${BACKUP_BUCKET}/db"
echo "backup ok ${STAMP}"
