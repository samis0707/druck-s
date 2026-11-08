# dmp druckraum auf Scaleway betreiben

Ein Server, ein Befehl: Caddy (HTTPS), App, Postgres und ClamAV laufen per Docker Compose auf einer Instanz.
Dateien liegen im Scaleway Object Storage, Mails gehen über Scaleway Transactional Email (TEM). Alles in Paris (`fr-par`).

## Kosten (netto, Preise Stand 25.09.2026 von scaleway.com, bitte in der Konsole gegenprüfen)

| Baustein | Wahl | ca. pro Monat |
|---|---|---|
| Instanz | DEV1-M (3 vCPU, 4 GB) | 14,74 € |
| Öffentliche IPv4 | Flexible IP | kleiner Aufpreis, in der Konsole prüfen |
| Object Storage | Standard One Zone 0,008 €/GB, Multi-AZ 0,016 €/GB, 75 GB Traffic frei | unter 1 € bei wenigen GB |
| Transactional Email | Essential: 300 Mails inklusive, danach 0,25 € je 1000 | 0 € bei kleinem Volumen |
| Snapshot (optional) | 0,000049 €/GB/Std | ca. 1,50 € für 40 GB |

Richtwert insgesamt: rund 20 € pro Monat. RAM-Budget der 4 GB: ClamAV 2 GB, App 0,75 GB, Postgres 0,5 GB, Caddy 0,1 GB, Rest System.
DEV1-S (2 GB) ist für ClamAV zu knapp. Eine verwaltete Datenbank (Aufpreis) und Coolify (braucht selbst rund 1 GB RAM) sind bewusst nicht enthalten.

## Einrichtung

1. **Projekt und Zugänge.** In der Scaleway-Konsole ein Projekt anlegen. Unter IAM eine Application mit einem API-Schlüssel erstellen, der nur auf den Bucket und TEM zugreifen darf.
2. **Object Storage.** Bucket in `fr-par` anlegen (Privat, ohne öffentliche Freigabe). Zweiter Bucket oder Präfix für Backups.
3. **Transactional Email.** Domain in TEM hinzufügen und die angezeigten DNS-Einträge (SPF, DKIM, DMARC) beim Domain-Anbieter setzen. SMTP-Host und Port aus der TEM-Konsole in `.env` übernehmen (Benutzer = Projekt-ID, Passwort = API-Secret-Key). Alternativ Brevo-HTTP-API: `BREVO_API_KEY` setzen, dann sind die SMTP-Variablen optional (siehe README, Abschnitt „E-Mail-Versand“).
4. **Instanz.** DEV1-M, Ubuntu 24.04, Zone `fr-par-1`, SSH-Schlüssel hinterlegen, Sicherheitsgruppe nur 22, 80 und 443 erlauben. Flexible IPv4 zuweisen.
5. **DNS.** A-Record der Domain auf die Instanz-IP.
6. **Server vorbereiten** (per SSH):
   ```bash
   sudo apt update && sudo apt -y upgrade
   sudo apt -y install docker.io docker-compose-v2 git rclone unattended-upgrades ufw
   sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   sudo usermod -aG docker $USER   # danach neu einloggen
   ```
7. **Code holen.** In GitLab unter Settings › Repository › Deploy tokens einen Token mit `read_repository` erzeugen:
   ```bash
   sudo mkdir -p /opt/druckraum && sudo chown $USER /opt/druckraum
   git clone https://<token-user>:<token>@gitlab.com/digitalemedienprint/drucks.git /opt/druckraum
   cd /opt/druckraum/app
   cp deploy/scaleway.env.example .env && chmod 600 .env
   ```
8. **`.env` ausfüllen.** Zufallswerte mit `openssl rand -hex 32` erzeugen (`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`).
9. **Starten.**
   ```bash
   docker compose -f docker-compose.scaleway.yml up -d --build
   docker compose -f docker-compose.scaleway.yml logs -f app
   ```
   Beim ersten Start lädt ClamAV die Signaturen, das dauert einige Minuten. Bis dahin markiert die App Dateien als „Manuell prüfen“.
10. **Ersten Staff-Zugang anlegen** (es gibt keine Selbstregistrierung):
    ```bash
    docker compose -f docker-compose.scaleway.yml exec postgres psql -U dam -d dam -c \
      "insert into \"user\" (id,email,name,role,status) values (gen_random_uuid(),'name@digitalemedien.de','Name','staff','customer')"
    ```
    Danach unter `/staff/login` per Code anmelden.
11. **Backups.** rclone-Remote `scw` einrichten (`rclone config`: Provider Scaleway, Region `fr-par`, Endpoint `s3.fr-par.scw.cloud`), `BACKUP_BUCKET` in `.env` setzen und Cron eintragen:
    ```
    15 3 * * * /opt/druckraum/app/deploy/backup.sh >> /var/log/druckraum-backup.log 2>&1
    ```
    Wiederherstellung: `rclone cat scw:<bucket>/db/dam-<stempel>.sql.gz | gunzip | docker compose -f docker-compose.scaleway.yml exec -T postgres psql -U dam dam`.

## Updates

```bash
cd /opt/druckraum && git pull && cd app && docker compose -f docker-compose.scaleway.yml up -d --build
```

Migrationen laufen beim Start der App automatisch (`db/migrate.js`).

## Prüfen

- `https://<domain>/api/health` zeigt `ok: true` für Datenbank, Speicher und Mail.
- Testupload, Code-Mail, Freigabe: Mails kommen über TEM an.
- `docker stats` zeigt, ob ClamAV innerhalb seines 2-GB-Limits bleibt.
