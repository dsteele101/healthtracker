#!/usr/bin/env bash
#
# Nightly Postgres backup.
#
# Writes a compressed custom-format dump to ./backups on the host, verifies it,
# and only then prunes old ones.
#
# Usage:  scripts/backup.sh
# Cron:   15 3 * * *  cd /srv/healthtracker && scripts/backup.sh >> backups/backup.log 2>&1

set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
SERVICE="${POSTGRES_SERVICE:-postgres}"

# cron runs with a minimal PATH and no shell profile; docker usually isn't on it.
export PATH="/usr/local/bin:/usr/bin:/bin:/snap/bin:$PATH"

log() { printf '%s  %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

trap 'die "failed at line $LINENO"' ERR

# .env holds POSTGRES_USER / POSTGRES_DB. Sourced rather than parsed so the
# same values the stack runs with are the ones dumped.
if [[ -f "$REPO_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_DIR/.env"
  set +a
fi

PGUSER="${POSTGRES_USER:-tracker}"
PGDATABASE="${POSTGRES_DB:-tracker}"

# How to reach Postgres. Defaults to the compose service; overridable so the
# same code path can be exercised against a plain local server (see
# scripts/backup-selftest.sh) rather than only being tested in production.
if [[ -n "${PG_EXEC:-}" ]]; then
  read -r -a PG_PREFIX <<<"$PG_EXEC"
elif [[ "${PG_EXEC-unset}" == "" ]]; then
  PG_PREFIX=()   # explicitly empty: run the binaries directly
else
  PG_PREFIX=(docker compose exec -T "$SERVICE")
fi

pg() { if [[ ${#PG_PREFIX[@]} -eq 0 ]]; then "$@"; else "${PG_PREFIX[@]}" "$@"; fi; }

mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
TARGET="$BACKUP_DIR/tracker-$STAMP.dump"

if [[ ${#PG_PREFIX[@]} -gt 0 ]]; then
  command -v "${PG_PREFIX[0]}" >/dev/null || die "${PG_PREFIX[0]} not found on PATH"
fi

log "dumping $PGDATABASE -> $(basename "$TARGET")"

# -Fc: compressed custom format, so pg_restore can be selective later.
# Written to a .partial name first so an interrupted run never leaves a
# truncated file that later looks like a valid backup.
pg pg_dump -U "$PGUSER" -d "$PGDATABASE" -Fc --no-owner --no-privileges \
  > "$TARGET.partial" || die "pg_dump failed"

# --- verify before trusting it ------------------------------------------------

SIZE=$(wc -c < "$TARGET.partial" | tr -d ' ')
[[ "$SIZE" -gt 1000 ]] || die "dump is only ${SIZE} bytes, refusing to keep it"

# Reads the archive's table of contents. Catches truncation and corruption
# without needing a database to restore into.
#
# The archive is fed on stdin with no filename argument. Naming /dev/stdin
# instead makes pg_restore try to seek the "file" and fail with "did not find
# magic string in file header" even on a perfectly good dump — which would have
# made this check reject every backup ever taken.
pg pg_restore --list < "$TARGET.partial" > /dev/null 2>&1 \
  || die "dump failed pg_restore --list; not a usable archive"

# Confirm the tables that matter are actually in there. A dump of an empty or
# wrong database would pass the size and format checks above.
TOC=$(pg pg_restore --list < "$TARGET.partial" 2>/dev/null)
for table in exercise_types exercise_entries ddr_entries ddr_songs; do
  grep -q "TABLE DATA public $table" <<<"$TOC" \
    || die "dump is missing table data for $table"
done

mv "$TARGET.partial" "$TARGET"
log "wrote $(basename "$TARGET") (${SIZE} bytes)"

# --- prune, only now that a good backup exists --------------------------------

# Ordering is deliberate: pruning before the new dump is verified would let one
# broken run delete every good backup on the box.
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name 'tracker-*.dump' -type f \
  -mtime +"$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')
[[ "$DELETED" -gt 0 ]] && log "pruned $DELETED backup(s) older than ${RETENTION_DAYS}d"

# Clean up stale .partial files from previous interrupted runs.
find "$BACKUP_DIR" -maxdepth 1 -name 'tracker-*.dump.partial' -type f -mtime +1 -delete

KEPT=$(find "$BACKUP_DIR" -maxdepth 1 -name 'tracker-*.dump' -type f | wc -l | tr -d ' ')
log "done — $KEPT backup(s) retained"
