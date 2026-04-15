#!/usr/bin/env bash
# scripts/stop-tailscale-serve.sh — tear down the Tailscale HTTPS proxy for CCHQ.

set -eu

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale CLI not found." >&2
  exit 1
fi

echo "==> sudo tailscale serve reset"
sudo tailscale serve reset
echo "Tailscale serve config cleared."
