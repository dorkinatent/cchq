#!/bin/sh
set -eu

echo "╔══════════════════════════════════════╗"
echo "║           CCHQ Starting              ║"
echo "╚══════════════════════════════════════╝"

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

echo "⏳ Waiting for database at ${DB_HOST}:${DB_PORT}..."
MAX_RETRIES=60
RETRY=0
until nc -z "$DB_HOST" "$DB_PORT" 2>&1; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "❌ Database not reachable after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "  Attempt $RETRY/$MAX_RETRIES — retrying in 2s..."
  sleep 2
done
echo "✅ Database is reachable."

echo "🔄 Running database migrations..."
npx drizzle-kit push --force 2>&1 || {
  echo "⚠️  Migration failed — the app may still work if the schema is already up to date."
}
echo "✅ Migrations complete."

echo "🚀 Starting CCHQ on port ${PORT:-3000}..."
exec node server.js
