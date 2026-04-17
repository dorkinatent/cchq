#!/usr/bin/env bash
# scripts/uninstall-launchagent.sh — unload and remove the CCHQ LaunchAgent.

set -eu

LABEL="app.cchq"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Uninstalled ${LABEL} (removed $PLIST)"
else
  echo "No plist at $PLIST — nothing to uninstall."
fi
