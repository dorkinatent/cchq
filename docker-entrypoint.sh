#!/bin/sh
set -eu

echo "╔══════════════════════════════════════╗"
echo "║           CCHQ Starting              ║"
echo "╚══════════════════════════════════════╝"

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"

echo "⏳ Waiting for database at ${DB_HOST}:${DB_PORT}..."
MAX_RETRIES=60
RETRY=0
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" 2>&1; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "❌ Database not ready after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "  Attempt $RETRY/$MAX_RETRIES — retrying in 2s..."
  sleep 2
done
echo "✅ Database is ready."

echo "🔄 Running database migrations..."
npx drizzle-kit push --force 2>&1 || {
  echo "⚠️  Migration failed — the app may still work if the schema is already up to date."
}
echo "✅ Migrations complete."

echo "🚀 Starting CCHQ on port ${PORT:-3000}..."
exec node server.js
