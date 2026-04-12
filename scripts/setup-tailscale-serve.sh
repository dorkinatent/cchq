#!/usr/bin/env bash
# scripts/setup-tailscale-serve.sh — put CCUI behind Tailscale's reverse proxy
# at https://<mac>.<tailnet>.ts.net (port 443, TLS terminated by Tailscale).
#
# Requires: Tailscale installed and authenticated on this Mac, and the Mac's
# tailnet (or your account) has MagicDNS enabled.
#
# Safe to re-run — re-applies the serve config.

set -eu

PORT="${1:-3000}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale CLI not found. Install Tailscale first." >&2
  exit 1
fi

# Confirm tailscale is logged in / up.
if ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale is not running or not authenticated. Run 'sudo tailscale up' first." >&2
  exit 1
fi

echo "==> sudo tailscale serve --bg --https=443 http://localhost:$PORT"
sudo tailscale serve --bg --https=443 "http://localhost:$PORT"

HOSTNAME_TS="$(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*' | head -1 | sed 's/"DNSName":"//;s/\.$//' || true)"

echo
cat <<EOF
Tailscale serve is up. CCUI should now be reachable at:

  https://${HOSTNAME_TS:-<mac>.<tailnet>.ts.net}/

(No port. HTTPS. Reachable from any device on your tailnet.)

First load may take a few seconds while Tailscale fetches a cert.

Stop with:  ./scripts/stop-tailscale-serve.sh
Inspect:    tailscale serve status
EOF
