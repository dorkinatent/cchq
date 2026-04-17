#!/usr/bin/env bash
# scripts/stop-cloudflare-tunnel.sh — stop the CCHQ Cloudflare Tunnel.
#
# Kills any running cloudflared process for the "cchq" tunnel.
# Does NOT delete the tunnel — re-run setup-cloudflare-tunnel.sh to restart.

set -eu

TUNNEL_NAME="cchq"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found." >&2
  exit 1
fi

# Find and kill the cloudflared process running our tunnel.
PIDS="$(pgrep -f "cloudflared tunnel.*run.*$TUNNEL_NAME" || true)"

if [ -n "$PIDS" ]; then
  echo "==> Stopping cloudflared tunnel '$TUNNEL_NAME' (PID $PIDS)"
  echo "$PIDS" | xargs kill 2>/dev/null || true
  echo "Tunnel stopped."
else
  echo "No running cloudflared process found for tunnel '$TUNNEL_NAME'."
fi
