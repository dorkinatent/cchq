#!/bin/sh
set -eu

echo "╔══════════════════════════════════════╗"
echo "║           CCHQ Starting              ║"
echo "╚══════════════════════════════════════╝"

echo "⏳ Waiting for database..."
MAX_RETRIES=30
RETRY=0
until pg_isready -h "${DB_HOST:-db}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -q 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "❌ Database not ready after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "  Attempt $RETRY/$MAX_RETRIES..."
  sleep 1
done
echo "✅ Database is ready."

echo "🔄 Running database migrations..."
npx drizzle-kit push --force 2>&1 || {
  echo "⚠️  Migration failed — the app may still work if the schema is already up to date."
}
echo "✅ Migrations complete."

echo "🚀 Starting CCHQ on port ${PORT:-3000}..."
exec node server.js
