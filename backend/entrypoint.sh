#!/usr/bin/env bash
set -e

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-stratasec.settings}"

echo "==> Waiting for database..."
until python -c "
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stratasec.settings')
import django
django.setup()
from django.db import connections
connections['default'].ensure_connection()
" 2>/dev/null; do
    echo "    Database unavailable, retrying in 2s..."
    sleep 2
done
echo "==> Database is ready."

echo "==> Checking migrations..."
python manage.py makemigrations --noinput
python manage.py showmigrations --list 2>&1 | grep '\[ \]' && PENDING=1 || PENDING=0

if [ "$PENDING" = "1" ]; then
    echo "==> Applying pending migrations..."
    python manage.py migrate --noinput
else
    echo "==> All migrations are up to date."
fi

echo "==> Collecting static files..."
python manage.py collectstatic --noinput 2>/dev/null || true

echo "==> Starting application..."
exec "$@"
