#!/usr/bin/env bash

set -Eeuo pipefail

deploy_root=${WOW_TRADER_DEPLOY_ROOT:-/home/wow-trader-system}
release_name=${1:-}

if [[ ! "$deploy_root" =~ ^/home/[A-Za-z0-9._/-]+$ || "$deploy_root" == *".."* ]]; then
  echo "WOW_TRADER_DEPLOY_ROOT must be a safe absolute path below /home" >&2
  exit 2
fi
if [[ -z "$release_name" || ! "$release_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Usage: scripts/activate-production.sh <release-name>" >&2
  exit 2
fi

release_directory="$deploy_root/releases/$release_name"

required_paths=(
  "$release_directory/apps/web/.next/BUILD_ID"
  "$release_directory/apps/ingest-api/dist/server.js"
  "$deploy_root/shared/env/web.env"
  "$deploy_root/shared/env/ingest.env"
  "$deploy_root/shared/forever-preview-assets/current"
  "$deploy_root/shared/media/current"
  "$deploy_root/shared/world-snapshots/current/manifest.json"
  "$deploy_root/shared/world-snapshots/current/media/map-art"
  "$deploy_root/shared/raw-uploads"
)

for required_path in "${required_paths[@]}"; do
  if [[ ! -e "$required_path" ]]; then
    echo "Cannot activate: missing $required_path" >&2
    exit 1
  fi
done

ln -sfn "$release_directory" "$deploy_root/current"
WOW_TRADER_DEPLOY_ROOT="$deploy_root" pm2 startOrReload \
  "$deploy_root/current/ecosystem.config.cjs" \
  --env production
pm2 save

wait_for_url() {
  local label=$1
  local url=$2
  for _attempt in {1..30}; do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      echo "$label is healthy"
      return 0
    fi
    sleep 1
  done
  echo "$label did not become healthy within 30 seconds" >&2
  return 1
}

wait_for_url "Ingestion API" "http://127.0.0.1:19211/health"
wait_for_url "Web application" "http://127.0.0.1:19210/api/v1/data-status"

echo "Activated $release_name"
