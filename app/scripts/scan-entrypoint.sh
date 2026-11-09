#!/bin/sh
# Start des Batch-Virenscans (Dockerfile.scan). Railway hängt Volumes root-eigen ein; als root wird
# deshalb nur das Signaturverzeichnis dem Nutzer clamav übergeben, danach läuft alles (freshclam,
# node, clamscan) ohne root-Rechte. Startet der Container schon als Nicht-root, direkt los.
set -eu
DB_DIR="${CLAMAV_DB_DIR:-/var/lib/clamav}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DB_DIR"
  chown -R clamav:clamav "$DB_DIR"
  exec setpriv --reuid=clamav --regid=clamav --init-groups --inh-caps=-all \
    env HOME=/tmp node /opt/scan/scan-pending.mjs "$@"
fi
exec node /opt/scan/scan-pending.mjs "$@"
