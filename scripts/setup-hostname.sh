#!/usr/bin/env bash
# scripts/setup-hostname.sh — set the Tailscale node name so CCHQ is reachable
# at `<name>.<tailnet>.ts.net` from any device on your tailnet (including
# cellular). Does NOT touch the Mac's LocalHostName/HostName.
#
# Usage:
#   ./scripts/setup-hostname.sh [name]
#
# If `name` is omitted, defaults to "cchq".
#
# Safe to re-run — overwrites the existing Tailscale hostname.

set -eu

NAME="${1:-cchq}"

if [[ "$NAME" =~ [^a-z0-9-] ]]; then
  echo "Hostname must be lowercase alphanumeric + dashes only (got: $NAME)" >&2
  exit 1
fi

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale CLI not found. Install Tailscale first, then re-run." >&2
  exit 1
fi

echo "==> sudo tailscale up --hostname=$NAME"
sudo tailscale up --hostname="$NAME" >/dev/null
echo "Tailscale node renamed to: $NAME"
echo "MagicDNS may take ~60s to propagate."
echo
cat <<EOF
Try from your phone (Tailscale on, Wi-Fi or cellular both fine):
  http://$NAME.<your-tailnet>.ts.net:3000/

Find your tailnet name with:  tailscale status
EOF
