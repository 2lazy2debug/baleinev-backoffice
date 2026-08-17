#!/usr/bin/env bash
#
# Install (or refresh) the systemd unit that runs `next start` in production.
#
# Why a script and not a static unit: node is often installed by a version
# manager at a per-user, version-specific path that is NOT on the system PATH,
# and systemd has no login shell to find it with. This resolves the ABSOLUTE
# node path on THIS machine at install time and bakes it into the unit.
#
# **Re-run it after every Node upgrade** — an upgrade moves that path and the
# service stops starting with an error that says only "no such file".
#
# Usage (on the server, from the checkout root):
#   ./deploy/install-service.sh
#
# Needs root: it writes /etc/systemd/system and enables the service. Run it as
# root, or through sudo from a user who has it — `blv` is a system account with
# no sudo rights, so it cannot install its own unit. The service still runs as
# `blv`: the user baked into the unit is the OWNER OF THE CHECKOUT, not whoever
# typed the command (override with BLV_RUN_USER=…).

set -euo pipefail

SERVICE_NAME="${BLV_SERVICE_NAME:-blv}"
PORT="${PORT:-3100}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKOUT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$CHECKOUT_ROOT/app"     # the npm project, and the unit's WorkingDirectory
TEMPLATE="$SCRIPT_DIR/blv.service.template"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: 'node' is not on PATH. Run this as the user that owns the app," >&2
  echo "       with its version manager loaded, so the right binary is found." >&2
  exit 1
fi
NODE_BIN="$(readlink -f "$NODE_BIN")"   # de-reference symlinks to the real path
NODE_BIN_DIR="$(dirname "$NODE_BIN")"

# Whose app is this? The checkout's owner. That answer is right in every way the
# installer is actually run — as root, through sudo, or as the app user itself —
# whereas "the caller" is wrong the moment the app user has no sudo rights and
# root has to do the installing, which is exactly the case here: the unit would
# silently be written with User=root and the app would run as root over blv's
# 600-mode .env.
RUN_USER="${BLV_RUN_USER:-$(stat -c '%U' "$CHECKOUT_ROOT")}"
RUN_GROUP="$(id -gn "$RUN_USER")"

# `command -v node` answers for the CALLER, but the unit runs as RUN_USER, so
# the pinned path has to be one RUN_USER can execute. These are not the same
# answer on a box with a version manager: an interactive root shell that sources
# nvm resolves node to /root/.nvm/versions/node/vXX/bin/node, and /root is mode
# 700. The unit would then be written with a path that exists, is executable by
# root, and is unreachable for the app user — failing at start with a permission
# error or "no such file" that names a file you can see is right there. Catch it
# here, where the cause is still obvious.
if [[ "$(id -un)" == "$RUN_USER" ]]; then
  NODE_REACHABLE="$(test -x "$NODE_BIN" && echo yes || echo no)"
else
  NODE_REACHABLE="$(sudo -u "$RUN_USER" test -x "$NODE_BIN" && echo yes || echo no)"
fi
if [[ "$NODE_REACHABLE" != yes ]]; then
  echo "ERROR: $RUN_USER cannot execute $NODE_BIN, so the unit would fail at" >&2
  echo "       start. This is what a version manager in the CALLER's shell does" >&2
  echo "       — nvm under /root resolves to a path only root can reach." >&2
  echo "       Re-run with the system node:" >&2
  echo "         sudo env PATH=/usr/bin:/bin $0" >&2
  exit 1
fi

if [[ ! -f "$PROJECT_ROOT/.next/BUILD_ID" ]]; then
  echo "ERROR: no production build ($PROJECT_ROOT/.next/BUILD_ID is missing)." >&2
  echo "       Run ./install.sh, or 'npm run build' in app/, first." >&2
  exit 1
fi

if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
  echo "ERROR: $PROJECT_ROOT/.env does not exist. The app reads DATABASE_URL," >&2
  echo "       AUTH_SECRET, NEXTAUTH_URL and PASSWORD_VAULT_KEY from it and has" >&2
  echo "       no fallback for any of them. Run ./install.sh first." >&2
  exit 1
fi
# It holds the database password, the session secret, the vault master key, and
# it is inside every backup. Mode 600, applied rather than asserted.
chmod 600 "$PROJECT_ROOT/.env"

echo "Rendering $SERVICE_NAME.service:"
echo "  User=$RUN_USER  Group=$RUN_GROUP"
echo "  WorkingDirectory=$PROJECT_ROOT"
echo "  node=$NODE_BIN"
echo "  Port=$PORT"

RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED"' EXIT
sed \
  -e "s#@USER@#$RUN_USER#g" \
  -e "s#@GROUP@#$RUN_GROUP#g" \
  -e "s#@WORKDIR@#$PROJECT_ROOT#g" \
  -e "s#@NODE_BIN_DIR@#$NODE_BIN_DIR#g" \
  -e "s#@NODE_BIN@#$NODE_BIN#g" \
  -e "s#@PORT@#$PORT#g" \
  "$TEMPLATE" > "$RENDERED"

DEST="/etc/systemd/system/$SERVICE_NAME.service"
echo "Installing to $DEST (sudo)…"
sudo install -m 0644 "$RENDERED" "$DEST"
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"

echo
sudo systemctl --no-pager --full status "$SERVICE_NAME" || true
echo
echo "Done. Logs:   journalctl -u $SERVICE_NAME -f"
echo "     Health:  curl -fsS http://127.0.0.1:$PORT/api/health"
