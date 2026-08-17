#!/usr/bin/env bash
#
# Install (or refresh) the tag-driven deploy pipeline:
#
#   blv-updater.service          oneshot, runs deploy/self-update.sh
#   blv-updater.timer            polls origin for new release tags every ~2 min
#   /etc/sudoers.d/blv-deploy    lets the pipeline restart the app, and nothing else
#
# Like install-service.sh it resolves the ABSOLUTE node path on THIS box and
# pins it into the unit, so the pipeline's npm/npx run without a login shell.
# **Re-run it after every Node upgrade.**
#
# Usage (on the server, from the checkout root):
#   ./deploy/install-updater.sh
#
# Needs root: writes /etc/systemd/system and /etc/sudoers.d, enables the timer.
# Run it as root, or through sudo from a user who has it — `blv` is a system
# account with no sudo rights. The units still run as `blv`: the user they are
# rendered with is the OWNER OF THE CHECKOUT, not the caller (BLV_RUN_USER=…
# overrides it).

set -euo pipefail

SERVICE_NAME="${BLV_SERVICE_NAME:-blv}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKOUT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PARENT_DIR="$(cd "$CHECKOUT_ROOT/.." && pwd)"
SERVICE_TEMPLATE="$SCRIPT_DIR/blv-updater.service.template"
TIMER_SRC="$SCRIPT_DIR/blv-updater.timer"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: 'node' is not on PATH. Run this as the app user, with its version" >&2
  echo "       manager loaded, so the right binary is found." >&2
  exit 1
fi
NODE_BIN="$(readlink -f "$NODE_BIN")"
NODE_BIN_DIR="$(dirname "$NODE_BIN")"

# The checkout's owner, not the caller — see install-service.sh for why. Getting
# this wrong here also writes a sudoers rule for the wrong user.
RUN_USER="${BLV_RUN_USER:-$(stat -c '%U' "$CHECKOUT_ROOT")}"
RUN_GROUP="$(id -gn "$RUN_USER")"

# The pipeline's backup runs `docker compose exec db pg_dump`, which needs the
# docker socket. Without the group the first deploy fails at the snapshot — the
# one step designed to fail safe, but still a deploy that never happens.
if ! id -nG "$RUN_USER" | tr ' ' '\n' | grep -qx docker; then
  echo "WARNING: $RUN_USER is not in the 'docker' group, so the pre-deploy" >&2
  echo "         pg_dump will fail and no tag will ever deploy. Fix with:" >&2
  echo "           sudo usermod -aG docker $RUN_USER   (then log in again)" >&2
fi

# Every deploy writes a snapshot and rebuilds .next. Neither is large on its own;
# together on a small VPS they are the thing that fills the disk first.
AVAIL_KB="$(df -Pk "$CHECKOUT_ROOT" | awk 'NR==2 {print $4}')"
if [[ -n "$AVAIL_KB" && "$AVAIL_KB" -lt 3000000 ]]; then
  echo "WARNING: only $((AVAIL_KB / 1024)) MB free here. Each deploy writes a" >&2
  echo "         pre-deploy snapshot and rebuilds .next — free some space." >&2
fi

echo "Rendering $SERVICE_NAME-updater.service:"
echo "  User=$RUN_USER  Group=$RUN_GROUP"
echo "  WorkingDirectory=$CHECKOUT_ROOT"
echo "  node bin dir=$NODE_BIN_DIR"

RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED"' EXIT
sed \
  -e "s#@USER@#$RUN_USER#g" \
  -e "s#@GROUP@#$RUN_GROUP#g" \
  -e "s#@WORKDIR@#$CHECKOUT_ROOT#g" \
  -e "s#@NODE_BIN_DIR@#$NODE_BIN_DIR#g" \
  "$SERVICE_TEMPLATE" > "$RENDERED"

echo "Installing units to /etc/systemd/system (sudo)…"
sudo install -m 0644 "$RENDERED" "/etc/systemd/system/$SERVICE_NAME-updater.service"
sudo install -m 0644 "$TIMER_SRC" "/etc/systemd/system/$SERVICE_NAME-updater.timer"

# --- Sudoers: restart and status of the app service. Nothing else. ------------
# The path must be the one sudo will resolve `systemctl` to under the PATH
# pinned in the updater unit, which puts /usr/bin ahead of /sbin and /bin. sudo
# matches the command path literally and does not follow symlinks, so a rule
# written for /usr/bin against a box that resolves /bin fails as a password
# prompt in a non-interactive timer — i.e. as a deploy that hangs, not as an
# error anyone reads.
SYSTEMCTL="/usr/bin/systemctl"
if [[ ! -x "$SYSTEMCTL" ]]; then
  SYSTEMCTL="$(command -v systemctl || true)"
  [[ -n "$SYSTEMCTL" ]] || { echo "ERROR: systemctl not found." >&2; exit 1; }
fi
SUDOERS="$(mktemp)"
cat > "$SUDOERS" <<EOF
# Installed by deploy/install-updater.sh — lets the deploy pipeline bounce the
# app after a build without an interactive password. Two commands, no wildcard:
# a rule ending in a bare 'systemctl' or a '*' is a root shell with extra steps.
$RUN_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart $SERVICE_NAME, $SYSTEMCTL status $SERVICE_NAME
EOF
# visudo -c before installing: a syntactically broken sudoers file can lock
# every user out of sudo on the box, including the one fixing it. This box also
# runs LeadDesk, so that outage would not be this app's alone.
if sudo visudo -c -f "$SUDOERS" >/dev/null; then
  sudo install -m 0440 "$SUDOERS" "/etc/sudoers.d/$SERVICE_NAME-deploy"
else
  echo "ERROR: the generated sudoers file failed validation; not installing it." >&2
  rm -f "$SUDOERS"
  exit 1
fi
rm -f "$SUDOERS"

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME-updater.timer"

echo
echo "One thing left, and skipping it redeploys what is already running:"
echo "record the tag that is live right now, so the first tick sees no change."
echo
echo "  mkdir -p $PARENT_DIR/state"
echo "  git -C $CHECKOUT_ROOT describe --tags --exact-match > $PARENT_DIR/state/deployed-tag"
echo
sudo systemctl --no-pager list-timers "$SERVICE_NAME-updater.timer" || true
echo
echo "Done. Watch deploys with:  journalctl -u $SERVICE_NAME-updater.service -f"
