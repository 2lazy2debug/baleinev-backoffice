#!/usr/bin/env bash
#
# Install this app's site block into the shared /opt/caddy project and reload.
#
# Caddy on this box serves two hosts from one container, importing one file per
# site from conf.d/. So this script never recreates the container and never
# touches leaddesk.caddy — it copies one file in, validates the WHOLE config,
# and only then reloads. `caddy reload` is graceful: no dropped connections, no
# downtime, and no certificate re-issue.
#
# The validation is the point. A parse error in this file takes BOTH hosts down,
# and a container that fails to start after a recreate takes them down until
# someone notices. Validate first, reload second, never the other way round.
#
# Usage (on the server, as root, from the checkout root):
#   sudo ./deploy/install-caddy-site.sh

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run this as root — /opt/caddy is owned by neither app user." >&2
  exit 1
fi

CADDY_DIR="${CADDY_DIR:-/opt/caddy}"
SITE_NAME="blv.caddy"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/$SITE_NAME"
DEST="$CADDY_DIR/conf.d/$SITE_NAME"

if [[ ! -d "$CADDY_DIR" ]]; then
  echo "ERROR: $CADDY_DIR does not exist. The shared proxy has not been" >&2
  echo "       extracted yet — see docs/production.md, 'Extract Caddy'." >&2
  exit 1
fi

# Stage into a temp copy of conf.d so validation runs against the config as it
# WOULD be, without the live directory ever holding an unvalidated file.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$CADDY_DIR/Caddyfile" "$STAGE/Caddyfile"
mkdir -p "$STAGE/conf.d"
cp "$CADDY_DIR"/conf.d/*.caddy "$STAGE/conf.d/" 2>/dev/null || true
cp "$SRC" "$STAGE/conf.d/$SITE_NAME"

# ACME_EMAIL is referenced by the global block; caddy validate fails on an
# unset placeholder, so feed it the same value the container gets.
ACME_EMAIL="$(sed -n 's/^ACME_EMAIL=//p' "$CADDY_DIR/.env" | head -1 | sed 's/^"//;s/"$//')"
if [[ -z "$ACME_EMAIL" ]]; then
  echo "ERROR: ACME_EMAIL is not set in $CADDY_DIR/.env." >&2
  exit 1
fi

echo "Validating the full config with $SITE_NAME in place…"
docker run --rm \
  -e ACME_EMAIL="$ACME_EMAIL" \
  -v "$STAGE:/etc/caddy:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "Installing $DEST…"
install -m 0644 "$SRC" "$DEST"

echo "Reloading the running proxy (graceful — no recreate, no downtime)…"
( cd "$CADDY_DIR" && docker compose exec -w /etc/caddy caddy \
    caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile )

echo
echo "Done. The certificate is issued on the first request, so this may take a"
echo "few seconds the very first time:"
echo "  curl -sI https://blv.cabras.ch"
echo
echo "Both hosts share this proxy — check the other one too:"
echo "  curl -sI https://leaddesk.cabras.ch"
