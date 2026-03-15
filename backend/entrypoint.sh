#!/usr/bin/env bash

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-stratasec.settings}"

# Ensure data directory exists and is writable
sudo /bin/mkdir -p /app/data
sudo /bin/chown stratasec:www-data /app/data
sudo /bin/chmod 775 /app/data

# Ensure log directory exists (tmpfs may not have it yet)
sudo /bin/mkdir -p /var/log/raspsec
sudo /bin/chown stratasec:www-data /var/log/raspsec

echo "==> Running migrations..."
python manage.py makemigrations --noinput 2>&1 || echo "WARN: makemigrations failed"
python manage.py migrate --noinput 2>&1 || echo "WARN: migrate failed"

echo "==> Collecting static files..."
python manage.py collectstatic --noinput 1>/dev/null 2>/dev/null || true

echo "==> Registering cron jobs..."
python manage.py crontab add 2>&1 || echo "WARN: crontab add failed"

echo "==> Entrypoint complete."

exit 0