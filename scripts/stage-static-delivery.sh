#!/usr/bin/env bash
set -Eeuo pipefail

release_name=${1:-}
deploy_root=${2:-/home/wow-trader-system}
if [[ ! "$release_name" =~ ^[A-Za-z0-9._-]+$ ]] ||
  [[ ! "$deploy_root" =~ ^/home/[A-Za-z0-9._/-]+$ || "$deploy_root" == *".."* ]]; then
  echo "Usage: scripts/stage-static-delivery.sh <release-name> [deploy-root]" >&2
  exit 2
fi
repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
if [[ -r "$deploy_root/shared/env/web.env" ]]; then
  source "$deploy_root/shared/env/web.env"
fi
simulator_root=${FOREVER_SIMULATOR_ROOT:-$deploy_root/shared/forever-simulator}
delivery_root="$deploy_root/shared/static-delivery"
delivery_directory="$delivery_root/releases/$release_name"
helper_static="$repository_root/apps/web/.next/static"
guild_static=${WOW_TRADER_GUILD_STATIC_ROOT:-/home/kfc-website-system/.next/static}
test -d "$helper_static"
test -d "$simulator_root"
mkdir -p "$delivery_root/releases"
arguments=(--simulator-root "$simulator_root" --helper-static "$helper_static" --output "$delivery_directory" --prepare)
if [[ -d "$guild_static" ]]; then arguments+=(--guild-static "$guild_static"); fi
if [[ -f "$delivery_root/current/completed.json" ]]; then arguments+=(--previous-delivery "$delivery_root/current"); fi
node "$repository_root/scripts/prepare-static-delivery.mjs" "${arguments[@]}"
node "$repository_root/scripts/verify-static-delivery.mjs" --directory "$delivery_directory"
nginx -t -p "$delivery_directory/" -c nginx-smoke.conf
echo "Verified static delivery stage: $delivery_directory (not activated)."
