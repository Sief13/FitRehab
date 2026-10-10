#!/bin/sh
# Runs when the container starts: bring the database schema up to date, then start the API.
set -e

echo "Applying database migrations..."
alembic upgrade head

echo "Starting the API..."
# One worker is enough for a small server; --proxy-headers trusts X-Forwarded-* from CloudFront/nginx
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
