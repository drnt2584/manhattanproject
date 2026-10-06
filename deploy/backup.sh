#!/bin/sh
# Nightly database backup. Schedule with: crontab -e
#   15 2 * * * /path/to/notify/deploy/backup.sh >> /usr/local/var/log/notify/backup.log 2>&1
set -eu
DIR="${BACKUP_DIR:-$HOME/notify-backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
pg_dump --format=custom --dbname="${DATABASE_URL:-postgres://notify@127.0.0.1:5432/notify}" --file="$DIR/notify-$STAMP.dump"
find "$DIR" -name 'notify-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date) backup ok: $DIR/notify-$STAMP.dump"
