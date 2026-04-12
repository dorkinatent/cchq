#!/usr/bin/env bash
# scripts/uninstall-launchagent.sh — unload and remove the CCUI LaunchAgent.

set -eu

PLIST="$HOME/Library/LaunchAgents/com.charlie.ccui.plist"

if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Uninstalled com.charlie.ccui (removed $PLIST)"
else
  echo "No plist at $PLIST — nothing to uninstall."
fi
