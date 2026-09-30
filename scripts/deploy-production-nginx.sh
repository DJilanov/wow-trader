#!/usr/bin/env bash

set -Eeuo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
deploy_host=${WOW_TRADER_DEPLOY_HOST:-root@89.167.46.193}
source_config="$repository_root/infra/nginx/helper.kfcguild.online.conf"
active_config=/etc/nginx/sites-available/helper.kfcguild.online
deployment_id=$(date -u +%Y%m%dT%H%M%SZ)
staged_config="/tmp/wow-trader-helper-nginx-$deployment_id.conf"
backup_config="$active_config.before-wow-trader-$deployment_id"

if [[ ! "$deploy_host" =~ ^[A-Za-z0-9._@:-]+$ ]]; then
  echo "WOW_TRADER_DEPLOY_HOST contains unsupported characters" >&2
  exit 2
fi
if [[ ! -r "$source_config" ]]; then
  echo "Nginx source config is not readable: $source_config" >&2
  exit 2
fi

rsync -az "$source_config" "$deploy_host:$staged_config"

ssh "$deploy_host" 'bash -s' -- "$staged_config" "$active_config" "$backup_config" <<'REMOTE'
set -Eeuo pipefail

staged_config=$1
active_config=$2
backup_config=$3

if [[ ! "$staged_config" =~ ^/tmp/wow-trader-helper-nginx-[0-9TZ]+\.conf$ ]]; then
  echo "Unexpected staged Nginx path" >&2
  exit 2
fi
if [[ "$active_config" != /etc/nginx/sites-available/helper.kfcguild.online ]]; then
  echo "Unexpected active Nginx path" >&2
  exit 2
fi
if [[ "$backup_config" != "$active_config".before-wow-trader-* ]]; then
  echo "Unexpected backup Nginx path" >&2
  exit 2
fi
if [[ ! -f "$active_config" || ! -f "$staged_config" ]]; then
  echo "Active or staged Nginx config is missing" >&2
  exit 2
fi

install -o root -g root -m 0644 "$active_config" "$backup_config"
install -o root -g root -m 0644 "$staged_config" "$active_config"

if ! nginx -t || ! systemctl reload nginx || ! systemctl is-active --quiet nginx; then
  echo "Nginx activation failed; restoring $backup_config" >&2
  install -o root -g root -m 0644 "$backup_config" "$active_config"
  nginx -t
  systemctl reload nginx
  rm -f -- "$staged_config"
  exit 1
fi

rm -f -- "$staged_config"
echo "Activated $active_config; rollback copy: $backup_config"
REMOTE

response_file=$(mktemp -t wow-trader-nginx-smoke.XXXXXX)
trap 'rm -f -- "$response_file"' EXIT
http_status=$(
  node -e 'process.stdout.write(JSON.stringify({schemaVersion:1,padding:"x".repeat(1024*1024)}))' |
    curl --silent --show-error --max-time 30 \
      --output "$response_file" \
      --write-out '%{http_code}' \
      --header 'Authorization: Bearer invalid-large-body-smoke-token' \
      --header 'Content-Type: application/json' \
      --data-binary @- \
      https://helper.kfcguild.online/v1/uploads/auction-scan
)

response_error=$(
  node -e '
    const fs = require("node:fs");
    try {
      const response = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(typeof response.error === "string" ? response.error : "");
    } catch {}
  ' "$response_file"
)
if [[ "$http_status" != 422 || "$response_error" != validation_failed ]]; then
  echo "Large-body edge smoke failed with HTTP $http_status and error '$response_error'" >&2
  head -c 500 "$response_file" >&2
  echo >&2
  exit 1
fi

echo "Large-body edge smoke reached ingestion validation (HTTP 422 validation_failed)."
