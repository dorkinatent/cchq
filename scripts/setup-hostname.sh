#!/usr/bin/env bash
# scripts/setup-hostname.sh — set the Mac's Bonjour / Tailscale hostnames to
# a memorable name so CCUI is reachable at `<name>.local` on the LAN and
# `<name>.<tailnet>.ts.net` over Tailscale.
#
# Usage:
#   ./scripts/setup-hostname.sh [name]
#
# If `name` is omitted, defaults to "ccui".
#
# Safe to re-run — overwrites existing values. Reboots are not required,
# though LAN peers' DNS caches may take ~60s to pick up the new .local name.

set -eu

NAME="${1:-ccui}"

if [[ "$NAME" =~ [^a-z0-9-] ]]; then
  echo "Hostname must be lowercase alphanumeric + dashes only (got: $NAME)" >&2
  exit 1
fi

echo "Setting hostnames to: $NAME"
echo

# macOS has three hostname slots. For Bonjour (the thing that makes .local work)
# only LocalHostName matters. Set HostName too so `hostname` in shells matches.
echo "==> sudo scutil --set LocalHostName $NAME"
sudo scutil --set LocalHostName "$NAME"
echo "==> sudo scutil --set HostName $NAME"
sudo scutil --set HostName "$NAME"

# ComputerName is what Finder shows. Leave it alone by default — user may have
# it set to something personal. Uncomment to override:
# sudo scutil --set ComputerName "$NAME"

# Tailscale: rename the node so MagicDNS resolves <name>.<tailnet>.ts.net.
# Requires `tailscale` CLI to be installed AND the machine already authenticated.
if command -v tailscale >/dev/null 2>&1; then
  # `tailscale up --hostname` reconfigures without re-authing if already up.
  echo "==> sudo tailscale up --hostname=$NAME"
  sudo tailscale up --hostname="$NAME" >/dev/null
  echo "    tailscale node renamed. MagicDNS may take ~60s to propagate."
else
  echo "    (tailscale CLI not found — skipping tailnet rename)"
fi

echo
cat <<EOF
Done.

Try these from your phone (same Wi-Fi as the Mac):
  http://$NAME.local:3000/

And via Tailscale (cellular OK):
  http://$NAME.<your-tailnet>.ts.net:3000/

If Bonjour resolution is slow, flush the phone's mDNS:
  - iPhone: toggle Wi-Fi off and on
  - macOS:  sudo killall -HUP mDNSResponder
EOF
