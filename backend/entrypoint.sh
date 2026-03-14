#!/usr/bin/env bash

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-stratasec.settings}"

# Ensure data directory exists for SQLite
mkdir -p /app/data

echo "==> Running migrations..."
python manage.py makemigrations --noinput 2>&1 || echo "WARN: makemigrations failed"
python manage.py migrate --noinput 2>&1 || echo "WARN: migrate failed"

echo "==> Collecting static files..."
python manage.py collectstatic --noinput 2>/dev/null || true

echo "==> Registering cron jobs..."
python manage.py crontab add 2>&1 || echo "WARN: crontab add failed"

echo "==> Entrypoint complete."

exit 0