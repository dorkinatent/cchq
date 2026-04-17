#!/usr/bin/env bash
# scripts/cchq-start.sh — launched by the CCHQ LaunchAgent on login.
#
# Ensures local Supabase is up, then starts the production Next.js server.
# Intended to be the single ProgramArgument for app.cchq.plist.
#
# Logs write to ~/Library/Logs/cchq/{stdout,stderr,supabase}.log via the plist's
# StandardOutPath/StandardErrorPath; this script additionally tees supabase
# output to its own log for easier triage.

set -eu

# cd into the project root (this script lives in scripts/).
cd "$(dirname "$0")/.."

LOG_DIR="$HOME/Library/Logs/cchq"
mkdir -p "$LOG_DIR"

# launchd provides a minimal environment. Extend PATH so `supabase`, `node`,
# `npm` from Homebrew / nvm resolve.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Start Supabase if it isn't already running. `supabase start` is idempotent:
# it no-ops if the stack is up.
if command -v supabase >/dev/null 2>&1; then
  supabase start >>"$LOG_DIR/supabase.log" 2>&1 || true
else
  echo "[cchq-start] supabase CLI not found on PATH" >&2
fi

# Wait up to 30s for Supabase REST to respond before handing control to Next.
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:54321/rest/v1/ >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Handoff: replace this shell with `npm run start` so launchd tracks Next.js
# directly (KeepAlive restarts Next if it crashes without needing a wrapper).
exec npm run start
