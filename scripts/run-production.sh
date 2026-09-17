#!/usr/bin/env bash

set -Eeuo pipefail

application=${1:-}
environment_file=${WOW_TRADER_ENV_FILE:-}

if [[ -z "$environment_file" || ! -r "$environment_file" ]]; then
  echo "WOW_TRADER_ENV_FILE must reference a readable production environment file" >&2
  exit 1
fi

set -a
# The production environment file is root-owned, mode 0600, and uses shell-compatible KEY=value
# entries so secrets never need to appear in the PM2 ecosystem declaration.
source "$environment_file"
set +a

case "$application" in
  web)
    : "${DATABASE_URL:?DATABASE_URL is required}"
    : "${FOREVER_ASSET_ROOT:?FOREVER_ASSET_ROOT is required}"
    : "${WOW_TRADER_WORLD_SNAPSHOT:?WOW_TRADER_WORLD_SNAPSHOT is required}"
    : "${WOW_TRADER_WORLD_MEDIA_ROOT:?WOW_TRADER_WORLD_MEDIA_ROOT is required}"
    : "${WOW_TRADER_MEDIA_ROOT:?WOW_TRADER_MEDIA_ROOT is required}"
    : "${WOW_TRADER_WEB_HOST:?WOW_TRADER_WEB_HOST is required}"
    : "${WOW_TRADER_WEB_PORT:?WOW_TRADER_WEB_PORT is required}"
    exec node apps/web/node_modules/next/dist/bin/next start apps/web \
      --hostname "$WOW_TRADER_WEB_HOST" \
      --port "$WOW_TRADER_WEB_PORT"
    ;;
  ingest)
    : "${DATABASE_URL:?DATABASE_URL is required}"
    : "${INGEST_API_HOST:?INGEST_API_HOST is required}"
    : "${INGEST_API_KEYS:?INGEST_API_KEYS is required}"
    : "${INGEST_API_PORT:?INGEST_API_PORT is required}"
    : "${RAW_UPLOAD_DIR:?RAW_UPLOAD_DIR is required}"
    : "${WEB_ORIGIN:?WEB_ORIGIN is required}"
    exec node apps/ingest-api/dist/server.js
    ;;
  *)
    echo "Usage: scripts/run-production.sh <web|ingest>" >&2
    exit 2
    ;;
esac
