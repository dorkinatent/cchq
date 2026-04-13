#!/usr/bin/env bash
# scripts/install-launchagent.sh — install the CCUI LaunchAgent so the server
# starts on login and restarts on crash.
#
# Safe to re-run: unloads any existing app.ccui before re-loading.
#
# IMPORTANT: run this from a production-ready checkout (e.g. main branch after
# merging). The installed agent will `npm run start` from the directory this
# script lives in — that checkout must have a current `npm run build` output.

set -eu

LABEL="app.ccui"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$HOME/Library/Logs/ccui"
PLIST_SRC="$PROJECT_DIR/scripts/${LABEL}.plist.template"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"

mkdir -p "$LOG_DIR" "$(dirname "$PLIST_DST")"

# Substitute placeholders in the template into the LaunchAgents dir.
sed -e "s|{{PROJECT_DIR}}|$PROJECT_DIR|g" \
    -e "s|{{LOG_DIR}}|$LOG_DIR|g" \
    "$PLIST_SRC" > "$PLIST_DST"

# Unload first so we pick up changes if the agent is already loaded.
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

cat <<EOF
Loaded $LABEL
  plist:   $PLIST_DST
  project: $PROJECT_DIR
  logs:    $LOG_DIR

Next.js should be reachable at http://localhost:3000/ within ~60s.
Tail logs with:  tail -f "$LOG_DIR"/stderr.log
Uninstall with:  "$PROJECT_DIR/scripts/uninstall-launchagent.sh"
EOF
