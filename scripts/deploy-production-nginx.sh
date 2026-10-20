#!/usr/bin/env bash

set -Eeuo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
deploy_host=${WOW_TRADER_DEPLOY_HOST:-root@89.167.46.193}
helper_source_config="$repository_root/infra/nginx/helper.kfcguild.online.conf"
apex_source_config="$repository_root/infra/nginx/kfcguild.online.conf"
helper_active_config=/etc/nginx/sites-available/helper.kfcguild.online
apex_active_config=/etc/nginx/sites-available/kfcguild.online
deployment_id=$(date -u +%Y%m%dT%H%M%SZ)
helper_staged_config="/tmp/wow-trader-helper-nginx-$deployment_id.conf"
apex_staged_config="/tmp/wow-trader-apex-nginx-$deployment_id.conf"
helper_backup_config="$helper_active_config.before-wow-trader-$deployment_id"
apex_backup_config="$apex_active_config.before-wow-trader-$deployment_id"

if [[ ! "$deploy_host" =~ ^[A-Za-z0-9._@:-]+$ ]]; then
  echo "WOW_TRADER_DEPLOY_HOST contains unsupported characters" >&2
  exit 2
fi
for source_config in "$helper_source_config" "$apex_source_config"; do
  if [[ ! -r "$source_config" ]]; then
    echo "Nginx source config is not readable: $source_config" >&2
    exit 2
  fi
done

rsync -az "$helper_source_config" "$deploy_host:$helper_staged_config"
rsync -az "$apex_source_config" "$deploy_host:$apex_staged_config"

ssh "$deploy_host" 'bash -s' -- \
  "$helper_staged_config" \
  "$apex_staged_config" \
  "$helper_active_config" \
  "$apex_active_config" \
  "$helper_backup_config" \
  "$apex_backup_config" <<'REMOTE'
set -Eeuo pipefail

helper_staged_config=$1
apex_staged_config=$2
helper_active_config=$3
apex_active_config=$4
helper_backup_config=$5
apex_backup_config=$6

if [[ ! "$helper_staged_config" =~ ^/tmp/wow-trader-helper-nginx-[0-9TZ]+\.conf$ ]] ||
  [[ ! "$apex_staged_config" =~ ^/tmp/wow-trader-apex-nginx-[0-9TZ]+\.conf$ ]]; then
  echo "Unexpected staged Nginx paths" >&2
  exit 2
fi
if [[ "$helper_active_config" != /etc/nginx/sites-available/helper.kfcguild.online ]] ||
  [[ "$apex_active_config" != /etc/nginx/sites-available/kfcguild.online ]]; then
  echo "Unexpected active Nginx paths" >&2
  exit 2
fi
if [[ "$helper_backup_config" != "$helper_active_config".before-wow-trader-* ]] ||
  [[ "$apex_backup_config" != "$apex_active_config".before-wow-trader-* ]]; then
  echo "Unexpected backup Nginx paths" >&2
  exit 2
fi
for required_config in \
  "$helper_active_config" \
  "$apex_active_config" \
  "$helper_staged_config" \
  "$apex_staged_config"; do
  if [[ ! -f "$required_config" ]]; then
    echo "Required Nginx config is missing: $required_config" >&2
    exit 2
  fi
done

install -o root -g root -m 0644 "$helper_active_config" "$helper_backup_config"
install -o root -g root -m 0644 "$apex_active_config" "$apex_backup_config"
install -o root -g root -m 0644 "$helper_staged_config" "$helper_active_config"
install -o root -g root -m 0644 "$apex_staged_config" "$apex_active_config"

if ! nginx -t || ! systemctl reload nginx || ! systemctl is-active --quiet nginx; then
  echo "Nginx activation failed; restoring both host configurations" >&2
  install -o root -g root -m 0644 "$helper_backup_config" "$helper_active_config"
  install -o root -g root -m 0644 "$apex_backup_config" "$apex_active_config"
  nginx -t
  systemctl reload nginx
  rm -f -- "$helper_staged_config" "$apex_staged_config"
  exit 1
fi

rm -f -- "$helper_staged_config" "$apex_staged_config"
echo "Activated $helper_active_config and $apex_active_config"
echo "Rollback copies: $helper_backup_config and $apex_backup_config"
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

legacy_location=$(
  curl --silent --show-error --head --max-time 30 \
    --output /dev/null \
    --write-out '%{redirect_url}' \
    https://helper.kfcguild.online/forever/encyclopedia
)
if [[ "$legacy_location" != https://kfcguild.online/tools/forever/encyclopedia ]]; then
  echo "Legacy Helper redirect smoke failed: $legacy_location" >&2
  exit 1
fi

already_prefixed_location=$(
  curl --silent --show-error --head --max-time 30 \
    --output /dev/null \
    --write-out '%{redirect_url}' \
    https://helper.kfcguild.online/tools/forever/encyclopedia
)
if [[ "$already_prefixed_location" != https://kfcguild.online/tools/forever/encyclopedia ]]; then
  echo "Prefixed legacy redirect smoke failed: $already_prefixed_location" >&2
  exit 1
fi

for public_url in \
  https://kfcguild.online/ \
  https://kfcguild.online/tools \
  https://kfcguild.online/tools/robots.txt \
  https://kfcguild.online/tools/sitemap.xml; do
  curl --fail --silent --show-error --max-time 30 "$public_url" >/dev/null
done

tools_html=$(curl --fail --silent --show-error --max-time 30 https://kfcguild.online/tools)
if [[ "$tools_html" != *'<link rel="canonical" href="https://kfcguild.online/tools"'* ]]; then
  echo "Apex tools canonical smoke failed" >&2
  exit 1
fi

echo "Apex tools routes and one-to-one legacy redirects are healthy."

simulator_html=$(curl --fail --silent --show-error --max-time 30 \
  https://kfcguild.online/tools/forever/simulator/warrior)
simulator_release=$(
  node -e '
    let html = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { html += chunk; });
    process.stdin.on("end", () => {
      const match = /src="\/tools\/forever-sim\/([a-f0-9]{24})\/warrior\//.exec(html);
      if (!match) process.exit(1);
      process.stdout.write(match[1]);
    });
  ' <<<"$simulator_html"
)
for asset_name in sim_worker.js lib.wasm assets/database/db.json kfc-workspace.css; do
  curl --fail --silent --show-error --head --max-time 30 \
    "https://kfcguild.online/forever-sim/$simulator_release/$asset_name" >/dev/null
done
echo "Immutable simulator asset URLs are healthy after the base-path migration."
