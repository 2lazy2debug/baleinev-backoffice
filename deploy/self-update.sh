#!/usr/bin/env bash
#
# The tag-driven deploy pipeline. Run every ~2 minutes by blv-updater.timer as
# the `blv` user. It reacts to release tags pushed to origin: back up first,
# migrate only when the tag says so, halt for a human when the tag says so,
# health-check, and auto-roll-back on failure.
#
# The tag vocabulary and the operator's view are in docs/production.md:
#   non-breaking / requires-migration / requires-env / requires-manual: <note>
#   / no-deploy
#
# Idempotent. The common tick finds no new tag and exits 0 cheaply and
# silently, and an flock keeps a slow build from overlapping the next tick.
#
# Usage (normally invoked by systemd; safe to run by hand from the checkout):
#   ./deploy/self-update.sh

set -euo pipefail

# --- Paths --------------------------------------------------------------------
# This repo's npm project is NOT the repo root: the checkout root holds app/,
# docs/, soa/, deploy/, and the Next project is <checkout>/app. So `git` runs at
# CHECKOUT_ROOT and every npm/npx/docker-compose call runs in PROJECT_ROOT.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKOUT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$CHECKOUT_ROOT/app"
# State and backups live BESIDE the checkout, never inside it, so that
# `git checkout tags/<tag>` cannot touch them. Defaults match /opt/blv.
STATE_DIR="${BLV_STATE_DIR:-$(cd "$CHECKOUT_ROOT/.." && pwd)/state}"
BACKUP_DIR="${BLV_BACKUP_DIR:-$(cd "$CHECKOUT_ROOT/.." && pwd)/backups}"
LOCK_FILE="$STATE_DIR/self-update.lock"
DEPLOYED_TAG_FILE="$STATE_DIR/deployed-tag"
LAST_DEPLOY_FILE="$STATE_DIR/last-deploy.json"

SERVICE_NAME="${BLV_SERVICE_NAME:-blv}"
HEALTH_URL="http://127.0.0.1:${PORT:-3100}/api/health"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
# Disk is the binding constraint on this box (docs/production.md), and every
# deploy writes a snapshot and rebuilds .next. Keep the newest three.
BACKUP_KEEP="${BACKUP_KEEP:-3}"

log()  { echo "[self-update] $*"; }
fail() { echo "[self-update] ERROR: $*" >&2; }

# --- Outcome record -----------------------------------------------------------
# Minimal JSON string escaping: quotes, backslashes, newlines.
json_str() {
  local s="${1//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  printf '"%s"' "$s"
}

# record <status> <tag> <message> — what the last tick did, for an operator
# reading state/last-deploy.json after the fact.
record() {
  local status="$1" tag="$2" msg="$3" stamp
  stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"status":%s,"tag":%s,"message":%s,"at":%s}\n' \
    "$(json_str "$status")" "$(json_str "$tag")" \
    "$(json_str "$msg")" "$(json_str "$stamp")" > "$LAST_DEPLOY_FILE"
}

# --- Read DB credentials from app/.env for the backup -------------------------
env_val() {
  # Extract KEY=value from .env without executing it.
  local key="$1"
  sed -n "s/^${key}=//p" "$PROJECT_ROOT/.env" | head -1 | sed 's/^"//;s/"$//'
}

# --- Pre-deploy snapshot ------------------------------------------------------
# A shell pg_dump rather than an npm script: this repo has no `npm run backup`,
# and a backup that does not depend on the app building is a backup that still
# works on the day the build is what broke.
#
# Uploads live in Postgres (ExpenseReport.proofData), so this dump is a COMPLETE
# backup — there is no blob store to snapshot alongside it.
#
# stdout is the archive path and nothing else; the readable report goes to
# stderr, where the journal picks it up.
make_backup() {
  local tag="$1" user db stamp work zip
  user="$(env_val POSTGRES_USER)"
  db="$(env_val POSTGRES_DB)"
  if [[ -z "$user" || -z "$db" ]]; then
    fail "POSTGRES_USER / POSTGRES_DB missing from app/.env; cannot back up."
    return 1
  fi

  stamp="$(date -u +%Y-%m-%dT%H-%M-%S)"
  work="$(mktemp -d)"
  zip="$BACKUP_DIR/pre-${tag}-${stamp}.zip"

  # `docker compose` resolves through app/docker-compose.yml, whose project is
  # pinned `name: blv` — so `db` is blv-db-1 and never LeadDesk's app-db-1.
  if ! ( cd "$PROJECT_ROOT" && docker compose exec -T db \
          pg_dump -U "$user" -d "$db" \
          --clean --if-exists --no-owner --no-privileges ) > "$work/dump.sql"; then
    fail "pg_dump failed."
    rm -rf "$work"
    return 1
  fi
  # Constraints live in the dump's tail; a truncated dump restores rows but no
  # PRIMARY KEYs / UNIQUE indexes / FOREIGN KEYs, and psql still exits 0.
  if ! tail -c 4096 "$work/dump.sql" | grep -q -- "-- PostgreSQL database dump complete"; then
    fail "pg_dump output is truncated (no completion marker); refusing to keep this backup."
    rm -rf "$work"
    return 1
  fi
  # .env travels with the dump: restoring a database whose password nobody has
  # is not a restore. It is why the backups directory is mode 700.
  cp "$PROJECT_ROOT/.env" "$work/.env"
  if ! ( cd "$work" && zip -j -q "$zip" dump.sql .env ); then
    fail "zipping the backup failed."
    rm -rf "$work"
    return 1
  fi
  rm -rf "$work"

  # Retain the newest N pre-deploy backups; prune older ones.
  ls -1t "$BACKUP_DIR"/pre-*.zip 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) \
    | xargs -r rm -f

  printf '%s\n' "$zip"
}

# Restore a snapshot archive into the db container. Refuses a truncated dump —
# a half-loaded database is worse than a migrated one.
restore_backup() {
  local zip="$1" user db work
  user="$(env_val POSTGRES_USER)"
  db="$(env_val POSTGRES_DB)"
  work="$(mktemp -d)"
  unzip -o -q "$zip" -d "$work"
  if ! tail -c 4096 "$work/dump.sql" | grep -q -- "-- PostgreSQL database dump complete"; then
    fail "backup $zip is truncated (no pg_dump completion marker); refusing to restore it."
    rm -rf "$work"
    return 1
  fi
  ( cd "$PROJECT_ROOT" && docker compose exec -T db \
      psql -U "$user" -d "$db" -v ON_ERROR_STOP=1 --quiet ) < "$work/dump.sql"
  local rc=$?
  rm -rf "$work"
  return $rc
}

# --- Health check -------------------------------------------------------------
# /api/health does a real database round trip, so this proves the app can reach
# Postgres and not merely that Node started (app/app/api/health/route.ts). It is
# also in proxy.ts's early-return list, so it answers 200 and not a 307 to
# /login — without that the gate would fail every deploy.
wait_healthy() {
  local deadline=$(( SECONDS + HEALTH_TIMEOUT ))
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# --- Build and activate a tag -------------------------------------------------
# build_and_start <tag> <migrate:true|false>. Returns non-zero on the first
# failing step, which is what triggers the rollback in main().
build_and_start() {
  local tag="$1" migrate="$2"
  # The checkout is the repo root; the build is in app/. Never conflate them.
  git -C "$CHECKOUT_ROOT" checkout -q --detach "tags/$tag"
  cd "$PROJECT_ROOT"
  # --omit=dev: everything `next build` touches is a real dependency, which is
  # what moving typescript/tailwind/prisma/tsx into `dependencies` bought us.
  npm ci --omit=dev
  # The generated client is gitignored, so a fresh checkout has none.
  npx prisma generate
  if [[ "$migrate" == "true" ]]; then
    npx prisma migrate deploy
  fi
  npm run build
  sudo systemctl restart "$SERVICE_NAME"
  wait_healthy
}

# =============================================================================
main() {
  mkdir -p "$STATE_DIR" "$BACKUP_DIR"
  cd "$CHECKOUT_ROOT"

  # --- Single-instance lock ---------------------------------------------------
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "another run holds the lock; skipping this tick."
    exit 0
  fi

  # Tags are the whole trigger. Without an origin (development, or a hand run
  # on a clone) the local tags are all there is, and saying so beats failing.
  if git remote get-url origin >/dev/null 2>&1; then
    log "fetching tags…"
    git fetch --tags --prune --quiet origin
  else
    log "no origin remote; working from local tags only."
  fi

  local latest_tag deployed_tag
  latest_tag="$(git tag -l 'v*' --sort=-v:refname | head -1)"
  if [[ -z "$latest_tag" ]]; then
    log "no release tags; nothing to do."
    exit 0
  fi

  deployed_tag=""
  if [[ -f "$DEPLOYED_TAG_FILE" ]]; then
    deployed_tag="$(cat "$DEPLOYED_TAG_FILE")"
  fi

  # The common case. Stay quiet and cheap — this runs every two minutes forever.
  [[ "$latest_tag" == "$deployed_tag" ]] && exit 0

  # A tag whose deploy already failed is quarantined, so the timer does not
  # crash-loop through a backup and a full rebuild every two minutes. A higher
  # tag is unaffected; remove the marker to retry this one deliberately.
  if [[ -f "$STATE_DIR/failed-$latest_tag" ]]; then
    log "$latest_tag failed before and is quarantined (rm $STATE_DIR/failed-$latest_tag to retry)."
    exit 0
  fi

  # Releases are annotated tags; the message is the directive. A lightweight
  # tag carries no message at all, so it has nothing to say and is not deployed.
  if [[ "$(git cat-file -t "$latest_tag" 2>/dev/null)" != "tag" ]]; then
    log "$latest_tag is lightweight (no directive); recording as seen, not deploying."
    echo "$latest_tag" > "$DEPLOYED_TAG_FILE"
    record seen "$latest_tag" "lightweight tag ignored"
    exit 0
  fi

  local message
  message="$(git tag -l --format='%(contents)' "$latest_tag")"
  log "new tag $latest_tag (was: ${deployed_tag:-none})"

  # --- Directives -------------------------------------------------------------
  # Read as independent FLAGS, not as one enum. A release can legitimately need
  # two at once, and the honest reading of a message carrying both
  # `requires-migration` and `requires-env` is "halt for the .env review, then
  # migrate", not "pick one". Directives compose; no-deploy wins over everything
  # because it means "not a release".
  local no_deploy=false needs_env=false needs_manual=false migrate=false manual_note=""
  grep -qiw 'no-deploy'          <<<"$message" && no_deploy=true
  grep -qiw 'requires-env'       <<<"$message" && needs_env=true
  grep -qiw 'requires-migration' <<<"$message" && migrate=true
  if grep -qi 'requires-manual'  <<<"$message"; then
    needs_manual=true
    manual_note="$(sed -n 's/.*requires-manual:[[:space:]]*//Ip' <<<"$message" | head -1)"
  fi

  if [[ "$no_deploy" == true ]]; then
    log "$latest_tag is no-deploy; recording as seen."
    echo "$latest_tag" > "$DEPLOYED_TAG_FILE"
    record seen "$latest_tag" "no-deploy tag"
    exit 0
  fi

  # --- Human gates ------------------------------------------------------------
  if [[ "$needs_env" == true || "$needs_manual" == true ]]; then
    if [[ ! -f "$STATE_DIR/approved-$latest_tag" ]]; then
      # Both are named when both apply — the operator has two things to do, and
      # a message that mentions one of them is a message that gets half obeyed.
      local reason=""
      if [[ "$needs_env" == true ]]; then reason="requires-env"; fi
      if [[ "$needs_manual" == true ]]; then
        reason="${reason:+$reason; }requires-manual: ${manual_note:-(no note)}"
      fi
      touch "$STATE_DIR/pending-$latest_tag"
      fail "HALT: $latest_tag needs a human ($reason)."
      fail "Do the manual part, then: ./deploy/approve.sh $latest_tag"
      record pending "$latest_tag" "$reason"
      exit 0
    fi
    log "$latest_tag was approved; proceeding."
  fi

  # --- Deploy -----------------------------------------------------------------
  log "deploying $latest_tag (migrate=$migrate)…"

  local backup_path=""
  if ! backup_path="$(make_backup "$latest_tag")"; then
    fail "pre-deploy snapshot failed; nothing was changed."
    record failed "$latest_tag" "backup failed (no changes made)"
    exit 1
  fi
  log "snapshot written: $backup_path"

  # Past this line, a failure rolls back to the previously deployed tag.
  if build_and_start "$latest_tag" "$migrate"; then
    echo "$latest_tag" > "$DEPLOYED_TAG_FILE"
    rm -f "$STATE_DIR/pending-$latest_tag" "$STATE_DIR/approved-$latest_tag"
    log "deployed $latest_tag successfully."
    if [[ "$migrate" == true ]]; then
      record deployed "$latest_tag" "ok (migrated)"
    else
      record deployed "$latest_tag" "ok"
    fi
    exit 0
  fi

  # --- Rollback ---------------------------------------------------------------
  fail "deploy of $latest_tag failed; rolling back."
  touch "$STATE_DIR/failed-$latest_tag"

  if [[ -z "$deployed_tag" ]]; then
    fail "no previous tag on record — cannot auto-roll-back. Manual recovery needed."
    fail "pre-deploy snapshot: $backup_path"
    record failed "$latest_tag" "deploy failed; no previous tag to roll back to"
    exit 1
  fi

  # Only when a migration ran. A migration may be irreversible, so restoring the
  # snapshot is the safe way to put the schema back before the old code is built
  # against it — but restoring when nothing migrated would throw away every write
  # made during the build window to fix a problem that was never in the database.
  if [[ "$migrate" == true ]]; then
    fail "a migration ran; restoring the pre-deploy snapshot…"
    restore_backup "$backup_path" \
      || fail "SNAPSHOT RESTORE FAILED — the database may be inconsistent: $backup_path"
  fi

  if build_and_start "$deployed_tag" false; then
    fail "rolled back to $deployed_tag."
    record rolled-back "$latest_tag" "deploy failed; rolled back to $deployed_tag"
    exit 1
  fi

  fail "ROLLBACK ALSO FAILED. The service may be down. Snapshot: $backup_path"
  record failed "$latest_tag" "deploy AND rollback failed; manual recovery needed"
  exit 1
}

# Called on the last line on purpose. `git checkout` replaces files in this very
# directory while the script is running, and bash reads a script incrementally
# by byte offset — so nothing may remain unread once the checkout happens. With
# every branch inside functions and this as the final line, bash has consumed
# the whole file before main() does anything.
main "$@"
