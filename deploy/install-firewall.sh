#!/usr/bin/env bash
#
# Install blv-firewall.sh as a boot-time unit and persist its rules.
#
# Two mechanisms on purpose, because this box already has both and they cover
# different failures:
#   - blv-firewall.service re-applies the rules at every boot, so a flushed or
#     rebuilt table comes back closed.
#   - iptables-save > /etc/iptables/rules.v4 keeps them across a restart of
#     netfilter-persistent, which is what LeadDesk's rules rely on.
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

# Persist for netfilter-persistent. This rewrites the file LeadDesk's rules also
# live in, which is correct: it is a snapshot of the whole current table, and
# the current table contains both apps' rules.
if [[ -d /etc/iptables ]]; then
  echo
  echo "Persisting the full table to /etc/iptables/rules.v4…"
  iptables-save > /etc/iptables/rules.v4
else
  echo
  echo "WARNING: /etc/iptables does not exist, so nothing was persisted." >&2
  echo "         The unit still re-applies the rules at boot." >&2
fi

echo
echo "Done. Verify from OUTSIDE the box — it must time out, not refuse:"
echo "  nc -vz <this-host> $PORT"
