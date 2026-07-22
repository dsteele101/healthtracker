#!/usr/bin/env bash
#
# Proves the latest backup can actually be restored.
#
# Restores into a scratch database inside the running Postgres container,
# counts rows, and drops it again. Never touches the live database.
#
# An untested backup is a guess. Run this after setting up the cron, and again
# any time the schema changes.
#
# Usage:  scripts/restore-check.sh [path/to/backup.dump]

set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
SERVICE="${POSTGRES_SERVICE:-postgres}"
SCRATCH_DB="restore_check_$$"

export PATH="/usr/local/bin:/usr/bin:/bin:/snap/bin:$PATH"

log() { printf '%s  %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

if [[ -f "$REPO_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_DIR/.env"
  set +a
fi
PGUSER="${POSTGRES_USER:-tracker}"
PGDATABASE="${POSTGRES_DB:-tracker}"

# Same overridable wrapper as backup.sh: defaults to the compose service,
# but can target a plain local server for testing.
if [[ -n "${PG_EXEC:-}" ]]; then
  read -r -a PG_PREFIX <<<"$PG_EXEC"
elif [[ "${PG_EXEC-unset}" == "" ]]; then
  PG_PREFIX=()
else
  PG_PREFIX=(docker compose exec -T "$SERVICE")
fi

pg() { if [[ ${#PG_PREFIX[@]} -eq 0 ]]; then "$@"; else "${PG_PREFIX[@]}" "$@"; fi; }

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  DUMP=$(find "$BACKUP_DIR" -maxdepth 1 -name 'tracker-*.dump' -type f \
    | sort | tail -n 1)
fi
[[ -n "$DUMP" && -f "$DUMP" ]] || die "no backup found in $BACKUP_DIR"

log "checking $(basename "$DUMP")"

psql_scratch() { pg psql -U "$PGUSER" -d "$SCRATCH_DB" -tAc "$1"; }

# Always drop the scratch database, even if the restore fails partway.
cleanup() {
  pg dropdb -U "$PGUSER" --if-exists "$SCRATCH_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

pg createdb -U "$PGUSER" "$SCRATCH_DB" || die "could not create scratch database"

pg pg_restore -U "$PGUSER" -d "$SCRATCH_DB" --no-owner --no-privileges \
  < "$DUMP" >/dev/null 2>&1 || die "pg_restore failed"

log "restored into scratch database, counting rows"

FAILED=0
for table in exercise_types exercise_entries ddr_entries ddr_songs; do
  restored=$(psql_scratch "SELECT count(*) FROM $table;" | tr -d '[:space:]')
  live=$(pg psql -U "$PGUSER" -d "$PGDATABASE" \
    -tAc "SELECT count(*) FROM $table;" | tr -d '[:space:]')

  # The live database may have moved on since the dump was taken, so the
  # restored count should be at most the live one — never more.
  if [[ "$restored" -gt "$live" ]]; then
    log "  WARN  $table: backup has $restored, live has $live (live lost rows?)"
    FAILED=1
  else
    log "  ok    $table: $restored restored (live: $live)"
  fi
done

[[ "$FAILED" -eq 0 ]] || die "restore check found discrepancies"
log "restore check passed"
