#!/bin/sh
set -e

# Automatically run pending database migrations on API startup if enabled
if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "Running database migrations via Alembic..."
    cd /app/services/api && python -m alembic upgrade head
fi

exec "$@"
