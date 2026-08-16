#!/usr/bin/env bash
#
# First-time installer for the Baleinev backoffice. Idempotent — re-running it
# is safe, and it never overwrites an existing .env without asking.
#
#   node/docker preflight → npm ci --omit=dev in app/ → .env → state/ and
#   backups/ beside the checkout → Postgres container → prisma generate →
#   prisma migrate deploy → optional seed → npm run build
#
# It deliberately does **not** start the app. `.env` gets read by a human first
# — the one file no installer should be trusted to have got right. The systemd
# unit comes next, from ./deploy/install-service.sh.
#
# Two deliberate differences from the reference installers in the sibling repos
# (NurseAsAService, LeadDesk), both because this box is SHARED with a live app:
#
#   - It does not install Node. The units pin an absolute node path, and an nvm
#     Node under the app user would shadow the system one that LeadDesk's units
#     also resolve. docs/production.md, decision "no Node change".
#   - It does not install Docker. Installing or restarting the daemon here would
#     bounce every container on the box, LeadDesk's database included.
#
# Both are checked and explained instead, which is the useful half anyway.
#
# Usage (from the checkout root, as the user that will own the app — `blv`):
#   ./install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKOUT_ROOT="$SCRIPT_DIR"
# The npm project is NOT the repo root: the checkout holds app/, deploy/, docs/,
# soa/, and the Next project is <checkout>/app. Every npm/npx/docker-compose
# call below runs there; only git runs at the checkout root.
PROJECT_ROOT="$CHECKOUT_ROOT/app"
ENV_FILE="$PROJECT_ROOT/.env"
# State and backups live BESIDE the checkout so `git checkout tags/<tag>` in the
# deploy pipeline cannot touch them. Same defaults as deploy/self-update.sh.
PARENT_DIR="$(cd "$CHECKOUT_ROOT/.." && pwd)"
STATE_DIR="${BLV_STATE_DIR:-$PARENT_DIR/state}"
BACKUP_DIR="${BLV_BACKUP_DIR:-$PARENT_DIR/backups}"

# Next 16 declares node >= 20.9.0; .nvmrc records the major this app is built
# against, and the server should match it (docs/production.md).
NODE_MIN_MAJOR=20
NODE_MIN_MINOR=9
NVMRC="$(cat "$CHECKOUT_ROOT/.nvmrc" 2>/dev/null || echo "")"

DEFAULT_PORT=5434
DEFAULT_DOMAIN="https://blv.cabras.ch"

# --- Output -------------------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; BLUE=$'\e[34m'; RESET=$'\e[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi
step() { echo; echo "${BOLD}${BLUE}==>${RESET} ${BOLD}$*${RESET}"; }
info() { echo "    $*"; }
ok()   { echo "    ${GREEN}✓${RESET} $*"; }
warn() { echo "    ${YELLOW}!${RESET} $*" >&2; }
die()  { echo "${RED}ERROR:${RESET} $*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1; }

# --- Prompts ------------------------------------------------------------------
prompt_default() { # prompt_default VAR "Question" "default"
  local __var="$1" __q="$2" __def="${3:-}" __ans
  if [[ -n "$__def" ]]; then
    read -r -p "    ${__q} [${DIM}${__def}${RESET}]: " __ans
    __ans="${__ans:-$__def}"
  else
    read -r -p "    ${__q}: " __ans
  fi
  printf -v "$__var" '%s' "$__ans"
}
prompt_required() { # non-empty, echoed — for things that are not secrets
  local __var="$1" __q="$2" __ans=""
  while :; do
    read -r -p "    ${__q}: " __ans
    [[ -n "$__ans" ]] && break
    warn "Cannot be empty."
  done
  printf -v "$__var" '%s' "$__ans"
}
prompt_secret() { # hidden, confirmed, non-empty
  local __var="$1" __q="$2" __a="" __b=""
  while :; do
    read -r -s -p "    ${__q}: " __a; echo
    [[ -n "$__a" ]] || { warn "Cannot be empty."; continue; }
    read -r -s -p "    ${__q} (confirm): " __b; echo
    [[ "$__a" == "$__b" ]] && break
    warn "They did not match."
  done
  printf -v "$__var" '%s' "$__a"
}
confirm() { local __a; read -r -p "    $1 [y/N]: " __a; [[ "$__a" =~ ^[Yy]$ ]]; }

# RFC-3986 percent-encoding, so a generated password with a `@`, `/` or `#` in
# it cannot silently corrupt DATABASE_URL — the failure that looks like a wrong
# password and is not one.
urlencode() {
  # LC_ALL=C so the loop walks BYTES: percent-encoding is defined on bytes, and
  # in a UTF-8 locale bash would hand back one multi-byte character at a time
  # and encode it as a single wrong %XX.
  local LC_ALL=C s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_-]) out+="$c" ;;
      *) printf -v c '%%%02X' "'$c"; out+="$c" ;;
    esac
  done
  printf '%s' "$out"
}

read_env_val() {
  local key="$1" line
  line="$(sed -n "s/^${key}=//p" "$ENV_FILE" 2>/dev/null | tail -n1 || true)"
  line="${line%\"}"; line="${line#\"}"
  printf '%s' "$line"
}

# The vault master key is AES-256-GCM: app/lib/secret-crypto.ts refuses anything
# that does not decode to exactly 32 bytes. Checked here, where the fix is one
# retry, rather than at the first attempt to read a password months later.
vault_key_ok() {
  local n
  n="$(printf '%s' "$1" | base64 -d 2>/dev/null | wc -c)" || return 1
  [[ "$n" -eq 32 ]]
}

echo "${BOLD}Baleinev backoffice installer${RESET}"
echo "    checkout : $CHECKOUT_ROOT"
echo "    app      : $PROJECT_ROOT"
echo "    state    : $STATE_DIR"
echo "    backups  : $BACKUP_DIR"

# ==============================================================================
step "1/6  Preflight"
# ==============================================================================
need node || die "Node is not installed. This box runs it system-wide; do not
       install a per-user one — the systemd units pin an absolute node path."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if (( NODE_MAJOR < NODE_MIN_MAJOR )) ||
   (( NODE_MAJOR == NODE_MIN_MAJOR && NODE_MINOR < NODE_MIN_MINOR )); then
  die "Node $(node -v) is older than v${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}, which Next 16 requires."
fi
ok "Node $(node -v) / npm $(npm -v)."
if [[ -n "$NVMRC" && "$NODE_MAJOR" != "$NVMRC" ]]; then
  warn "This box runs Node $(node -v) but .nvmrc pins $NVMRC. Not fatal, but the"
  warn "lockfile is resolved against one npm major and 'npm ci' is stricter than"
  warn "'npm install' — see docs/production.md."
fi

need docker || die "Docker is not installed, and this installer will not install it:
       the daemon restart would bounce every container on this shared box."
docker compose version >/dev/null 2>&1 || die "'docker compose' (the plugin) is not available."
docker info >/dev/null 2>&1 || die "Cannot talk to the Docker daemon. If you were just added
       to the 'docker' group, log out and back in for it to take effect."
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) with the compose plugin."

need openssl || die "openssl is required to generate secrets."
# zip/unzip are the deploy pipeline's own dependency, not this script's:
# self-update.sh writes and reads every pre-deploy snapshot with them. Warn now
# so it is fixed on install day and not discovered as a deploy that never lands.
for t in zip unzip; do
  need "$t" || warn "'$t' is missing. deploy/self-update.sh needs it for the pre-deploy
      snapshot, so no tag will ever deploy:  sudo apt-get install -y zip unzip"
done

# ==============================================================================
step "2/6  Dependencies"
# ==============================================================================
# --omit=dev on purpose: it is exactly what deploy/self-update.sh installs, so a
# build that secretly needs a devDependency fails here, on a machine someone is
# watching, instead of during the first unattended deploy.
info "npm ci --omit=dev  (in app/) …"
( cd "$PROJECT_ROOT" && npm ci --omit=dev )
ok "Dependencies installed."
# The Prisma client is generated in step 5, once .env exists: `prisma generate`
# resolves env("DATABASE_URL") out of app/.env, which a first run has not written yet.

# ==============================================================================
step "3/6  Configuration (app/.env)"
# ==============================================================================
POSTGRES_USER=""; POSTGRES_PASSWORD=""; POSTGRES_DB=""; POSTGRES_PORT=""

write_env=1
if [[ -f "$ENV_FILE" ]]; then
  ok "app/.env already exists."
  if confirm "Rewrite it from scratch? (the current one is kept as .env.bak.<stamp>)"; then
    cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
    chmod 600 "$ENV_FILE.bak."* 2>/dev/null || true
    info "Kept a copy."
  else
    write_env=0
    POSTGRES_USER="$(read_env_val POSTGRES_USER)"
    POSTGRES_DB="$(read_env_val POSTGRES_DB)"
    POSTGRES_PORT="$(read_env_val POSTGRES_PORT)"
    info "Keeping the existing app/.env."
  fi
fi

if [[ "$write_env" -eq 1 ]]; then
  info "These answers initialise the Postgres container and the app together."
  info "Both read this one file, so they cannot drift apart."
  echo
  prompt_default POSTGRES_USER "Database user" "blv"
  if confirm "Generate a strong database password?"; then
    POSTGRES_PASSWORD="$(openssl rand -hex 24)"; ok "Generated."
  else
    prompt_secret POSTGRES_PASSWORD "Database password"
  fi
  prompt_default POSTGRES_DB "Database name" "baleinev_comptes"
  # 5432 is the legacy container on the production box and 5433 is LeadDesk's.
  prompt_default POSTGRES_PORT "Host port for Postgres (loopback only)" "$DEFAULT_PORT"
  echo

  prompt_default NEXTAUTH_URL "Public URL of the app" "$DEFAULT_DOMAIN"
  AUTH_SECRET="$(openssl rand -base64 32)"
  ok "Generated AUTH_SECRET (it only signs sessions; rotating it signs everyone out)."
  echo

  # The vault key is the one secret that CANNOT be regenerated on a machine that
  # will receive existing entries: AES-256-GCM ciphertext is unreadable without
  # the exact key that wrote it, and nothing warns you — the entries simply never
  # decrypt again. So paste is offered first, and it is the right answer whenever
  # password entries are being carried over from elsewhere.
  info "Passwords vault master key."
  info "${DIM}Carrying entries over from another install? Paste ITS key — a new one"
  info "makes every imported entry permanently undecryptable.${RESET}"
  if confirm "Paste an existing PASSWORD_VAULT_KEY?"; then
    while :; do
      prompt_secret PASSWORD_VAULT_KEY "PASSWORD_VAULT_KEY (base64, 32 bytes)"
      vault_key_ok "$PASSWORD_VAULT_KEY" && break
      warn "That does not decode to 32 bytes. Copy it exactly, whitespace included."
    done
    ok "Using the pasted key."
  else
    PASSWORD_VAULT_KEY="$(openssl rand -base64 32)"
    warn "Generated a NEW key. Any vault entry encrypted with a different key"
    warn "cannot be read with this one — that is by design, and irreversible."
  fi
  echo

  # Never defaulted in code: an admin account with a password this repo knows is
  # an admin account everyone knows. `npm run db:seed` upserts BY EMAIL, so these
  # values are also how an existing admin gets their password reset.
  info "First admin account, created by 'npm run db:seed'."
  prompt_required ADMIN_EMAIL "Admin email"
  prompt_default  ADMIN_NAME  "Admin display name" "Baleinev Admin"
  prompt_secret   ADMIN_PASSWORD "Admin password"
  echo

  DB_URL="postgresql://${POSTGRES_USER}:$(urlencode "$POSTGRES_PASSWORD")@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"

  info "Writing $ENV_FILE …"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Written by install.sh on $(date -Iseconds).
# Every variable the app reads is documented in .env.example.

# ---- Database -------------------------------------------------------------
# POSTGRES_* initialise the container in docker-compose.yml and are only ever
# read on an EMPTY volume. DATABASE_URL must agree with them.
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_PORT=${POSTGRES_PORT}
DATABASE_URL=${DB_URL}

# ---- Auth -----------------------------------------------------------------
AUTH_SECRET=${AUTH_SECRET}
NEXTAUTH_URL=${NEXTAUTH_URL}

# ---- First admin account (npm run db:seed, upserts by email) --------------
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_NAME=${ADMIN_NAME}

# ---- Passwords vault ------------------------------------------------------
# 32 bytes, base64. Changing it makes every stored secret unreadable.
PASSWORD_VAULT_KEY=${PASSWORD_VAULT_KEY}
EOF
  chmod 600 "$ENV_FILE"
  ok "Wrote app/.env (mode 600)."
fi

[[ -n "$POSTGRES_USER" && -n "$POSTGRES_DB" ]] || die "POSTGRES_USER / POSTGRES_DB missing from app/.env."
POSTGRES_PORT="${POSTGRES_PORT:-$DEFAULT_PORT}"

# ==============================================================================
step "4/6  State and snapshots"
# ==============================================================================
# Beside the checkout, never inside it: a deploy detaches the checkout to a new
# tag, and neither the pipeline's memory of what is live nor its snapshots may
# be something a tag can overwrite. 700 on both — every snapshot contains .env
# and the whole ledger.
mkdir -p "$STATE_DIR" "$BACKUP_DIR"
chmod 700 "$STATE_DIR" "$BACKUP_DIR"
ok "Pipeline state at $STATE_DIR, snapshots at $BACKUP_DIR (mode 700)."

# ==============================================================================
step "5/6  Database"
# ==============================================================================
cd "$PROJECT_ROOT"

info "Starting Postgres…"
docker compose up -d db

info "Waiting for it to accept connections…"
DB_UP=0
for _ in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    DB_UP=1; break
  fi
  sleep 2
done
if [[ "$DB_UP" -ne 1 ]]; then
  warn "Postgres never became ready for user '$POSTGRES_USER' / db '$POSTGRES_DB'."
  warn "A postgres volume from an earlier install keeps its ORIGINAL credentials —"
  warn "POSTGRES_* only initialise an empty volume, so this reads as a timeout and"
  warn "never as an auth error. Either put those credentials back in app/.env, or"
  warn "'docker compose down -v' (DESTROYS the database) and re-run."
  die "Check: docker compose logs db"
fi
ok "Postgres is ready on 127.0.0.1:$POSTGRES_PORT."

info "Generating the Prisma client…"; npx prisma generate; ok "Prisma client generated."
info "Applying migrations…"; npx prisma migrate deploy; ok "Migrations applied."

# Optional, and No is the right answer whenever data is about to be imported:
# seeding first only creates a row that the import then has to reconcile.
# docs/production.md, "Restore the legacy data".
echo
info "The seed upserts the ADMIN_* account by email. Skip it if you are about to"
info "restore or import an existing database — seed it afterwards instead."
if confirm "Run 'npm run db:seed' now?"; then
  npm run db:seed
  ok "Admin account seeded."
else
  info "Skipped. Run 'npm run db:seed' in app/ when the data is in place."
fi

# ==============================================================================
step "6/6  Build"
# ==============================================================================
info "npm run build …"; npm run build; ok "Production build complete."

# ==============================================================================
echo
echo "${BOLD}${GREEN}Installed. The app is deliberately NOT running.${RESET}"
echo
echo "    Read ${BOLD}app/.env${RESET} before starting anything — it is the one file an"
echo "    installer should not be trusted to have got right."
echo
echo "    Then, in order (docs/production.md):"
echo "      ./deploy/install-service.sh                 # systemd unit, starts the app on 3100"
echo "      sudo ./deploy/install-firewall.sh           # close :3100 to the world"
echo "      sudo ./deploy/install-caddy-site.sh         # HTTPS via the shared /opt/caddy proxy"
echo "      ./deploy/install-updater.sh                 # the deploy timer"
echo "      git describe --tags --exact-match > $STATE_DIR/deployed-tag"
echo
echo "    ${DIM}App logs:   journalctl -u blv -f${RESET}"
echo "    ${DIM}Postgres:   docker compose logs -f db   (from app/)${RESET}"
echo "    ${DIM}Health:     curl -fsS http://127.0.0.1:3100/api/health${RESET}"
