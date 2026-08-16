#!/usr/bin/env bash
#
# Green-light a halted release.
#
# When a tag says `requires-env` or `requires-manual`, self-update.sh refuses to
# deploy it and leaves a state/pending-<tag> marker. Once you have done the
# manual part — edited app/.env, installed the system package, whatever the tag
# message asked for — run this. The next timer tick deploys it.
#
# Usage (as the app user, from the checkout root):
#   ./deploy/approve.sh v1.2.0

set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "Usage: $0 <tag>   e.g. $0 v1.2.0" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKOUT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="${BLV_STATE_DIR:-$(cd "$CHECKOUT_ROOT/.." && pwd)/state}"
SERVICE_NAME="${BLV_SERVICE_NAME:-blv}"

# Approving something that was never halted is a typo, and the deploy it was
# meant to unblock stays stuck until someone notices. Say so.
if [[ ! -f "$STATE_DIR/pending-$TAG" ]]; then
  echo "WARNING: no pending-$TAG marker in $STATE_DIR — check the tag name." >&2
  echo "         Pending now:" >&2
  ls -1 "$STATE_DIR" 2>/dev/null | sed -n 's/^pending-/           /p' >&2 || true
fi

mkdir -p "$STATE_DIR"
touch "$STATE_DIR/approved-$TAG"
rm -f "$STATE_DIR/pending-$TAG"

echo "Approved $TAG. It deploys on the next tick, within ~2 minutes — that is the"
echo "normal path and needs nothing further."
echo
echo "To start it immediately instead, from an account with full sudo (the app"
echo "user's sudoers rule covers only restarting the app itself, on purpose):"
echo "  sudo systemctl start $SERVICE_NAME-updater.service"
