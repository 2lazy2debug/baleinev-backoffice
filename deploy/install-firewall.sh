#!/usr/bin/env bash
#
# Install blv-firewall.sh as a boot-time unit and snapshot the table.
#
# blv-firewall.service re-applying the rules at every boot is the ONLY thing
# keeping this port closed — a flushed or rebuilt table comes back closed
# because the unit runs again, not because anything replays a file. LeadDesk's
# rules work the same way, via docker-egress-nat.service.
#
# /etc/iptables/rules.v4 is written as a diagnostic snapshot, nothing more.
# There is no netfilter-persistent and no iptables-persistent on this box
# (checked below), so nothing restores it. Writing it is still worth doing: the
# file already exists, it predates the switch to "iptables": false in
# daemon.json, and restoring THAT version today would set FORWARD to DROP and
# recreate DOCKER chains bound to bridges that no longer exist. A current
# snapshot is the safer thing to leave lying around than a stale one.
#
# Usage (on the server, as root, from the checkout root):
#   sudo ./deploy/install-firewall.sh
#
# Verify from somewhere else afterwards: `nc -vz <box> 3100` must TIME OUT.
# A refused connection means the DROP is missing and something answered.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run this as root — it writes /usr/local/sbin, /etc/systemd/system" >&2
  echo "       and /etc/iptables." >&2
  exit 1
fi

SERVICE_NAME="${BLV_SERVICE_NAME:-blv}"
PORT="${BLV_PORT:-3100}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/blv-firewall.sh"
DEST="/usr/local/sbin/$SERVICE_NAME-firewall.sh"

# A copy, not a symlink into the checkout: a deploy detaches the checkout to a
# new tag, and the firewall must not depend on what that tag happens to contain.
echo "Installing $DEST…"
install -m 0755 "$SRC" "$DEST"

UNIT="/etc/systemd/system/$SERVICE_NAME-firewall.service"
echo "Installing $UNIT…"
cat > "$UNIT" <<EOF
[Unit]
Description=blv port $PORT ingress rules (loopback + docker bridge only)
# Docker's daemon.json on this box sets "iptables": false, so Docker never
# rewrites the table underneath us — but ordering after it costs nothing and
# keeps the intent readable.
After=network-pre.target docker.service
Wants=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=BLV_PORT=$PORT
ExecStart=$DEST

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME-firewall.service"

echo
iptables -S INPUT | grep -- "--dport $PORT" || {
  echo "ERROR: no rules for :$PORT in the INPUT chain after applying them." >&2
  exit 1
}

# Snapshot the whole current table — both apps' rules and the NAT rule, since
# that is what a snapshot is. Back up any existing file first: the one this
# replaces may be older than the box's current networking model, and throwing
# it away silently would destroy the only record of what changed.
if [[ -d /etc/iptables ]]; then
  echo
  if [[ -f /etc/iptables/rules.v4 ]]; then
    BACKUP="/etc/iptables/rules.v4.bak-$(date +%Y-%m-%d)"
    if [[ ! -f "$BACKUP" ]]; then
      echo "Backing up the existing rules.v4 to $BACKUP…"
      cp -a /etc/iptables/rules.v4 "$BACKUP"
    fi
  fi
  echo "Writing a snapshot of the current table to /etc/iptables/rules.v4…"
  iptables-save > /etc/iptables/rules.v4

  # Say so plainly rather than letting the line above imply persistence.
  if ! systemctl list-unit-files 2>/dev/null |
       grep -qE '^(netfilter|iptables)-persistent\.service'; then
    echo "NOTE: nothing restores rules.v4 on this box — no netfilter-persistent," >&2
    echo "      no iptables-persistent. $SERVICE_NAME-firewall.service is what" >&2
    echo "      re-applies the rules at boot. The file is a diagnostic only." >&2
  fi
else
  echo
  echo "NOTE: /etc/iptables does not exist, so no snapshot was written." >&2
  echo "      The unit still re-applies the rules at boot, which is the part" >&2
  echo "      that matters." >&2
fi

echo
echo "Done. Verify from OUTSIDE the box — it must time out, not refuse:"
echo "  nc -vz <this-host> $PORT"
