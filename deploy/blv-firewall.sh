#!/usr/bin/env bash
#
# Close port 3100 to the world.
#
# `next start` binds 0.0.0.0 and there is no way to tell it otherwise, so the
# app is reachable directly on :3100 unless something stops it — bypassing
# Caddy, and with it TLS. This is that something, and it is the same shape as
# /usr/local/sbin/leaddesk-firewall.sh, which does the identical job for :3000.
#
# Loopback is allowed because Caddy reaches the app through host.docker.internal
# and the pipeline's health gate curls 127.0.0.1. 172.16.0.0/12 is allowed
# because that is where Docker's bridge networks live — the proxy container's
# source address. Everything else is DROPped (not REJECTed): an external scan
# should time out, not learn that something is listening.
#
# Installed as blv-firewall.service by install-firewall.sh, which also persists
# the result to /etc/iptables/rules.v4. Idempotent — it deletes its own rules
# before adding them, so re-running it never stacks duplicates.
#
# Usage (as root):
#   /usr/local/sbin/blv-firewall.sh

set -euo pipefail

PORT="${BLV_PORT:-3100}"
DOCKER_SUBNET="172.16.0.0/12"

# Delete a rule if it is present, and say nothing if it is not. `iptables -D`
# on a missing rule exits non-zero, which under `set -e` would abort the first
# run of the script — the run where nothing exists yet.
drop_rule() {
  while iptables -C "$@" 2>/dev/null; do
    iptables -D "$@"
  done
}

RULE_LOOPBACK=(INPUT -p tcp --dport "$PORT" -s 127.0.0.1 -j ACCEPT)
RULE_DOCKER=(INPUT -p tcp --dport "$PORT" -s "$DOCKER_SUBNET" -j ACCEPT)
RULE_DENY=(INPUT -p tcp --dport "$PORT" -j DROP)

drop_rule "${RULE_LOOPBACK[@]}"
drop_rule "${RULE_DOCKER[@]}"
drop_rule "${RULE_DENY[@]}"

# Order matters and -I prepends, so insert the DROP first and the ACCEPTs on top
# of it. Getting this backwards locks out Caddy and takes the site down while
# leaving the port open to nobody in particular.
iptables -I "${RULE_DENY[@]}"
iptables -I "${RULE_DOCKER[@]}"
iptables -I "${RULE_LOOPBACK[@]}"

echo "[blv-firewall] :$PORT — ACCEPT 127.0.0.1, ACCEPT $DOCKER_SUBNET, DROP the rest."
