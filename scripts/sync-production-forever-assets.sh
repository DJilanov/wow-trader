#!/usr/bin/env bash

set -Eeuo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
asset_directory=${1:-}
asset_release_name=${2:-}
deploy_host=${WOW_TRADER_DEPLOY_HOST:-root@89.167.46.193}
deploy_root=${WOW_TRADER_DEPLOY_ROOT:-/home/wow-trader-system}

if [[ -z "$asset_directory" || -z "$asset_release_name" ]]; then
  echo "Usage: scripts/sync-production-forever-assets.sh <asset-root> <asset-release-name>" >&2
  exit 2
fi
if [[ ! "$deploy_host" =~ ^[A-Za-z0-9._@:-]+$ ]]; then
  echo "WOW_TRADER_DEPLOY_HOST contains unsupported characters" >&2
  exit 2
fi
if [[ ! "$deploy_root" =~ ^/home/[A-Za-z0-9._/-]+$ || "$deploy_root" == *".."* ]]; then
  echo "WOW_TRADER_DEPLOY_ROOT must be a safe absolute path below /home" >&2
  exit 2
fi
if [[ ! "$asset_release_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Asset release name contains unsupported characters" >&2
  exit 2
fi

asset_directory=$(cd "$asset_directory" && pwd)
node "$repository_root/scripts/verify-forever-assets.mjs" "$asset_directory"

remote_asset_directory="$deploy_root/shared/forever-preview-assets/releases/$asset_release_name"
ssh "$deploy_host" "test ! -e '$remote_asset_directory' && mkdir -p '$remote_asset_directory'"
rsync -az "$asset_directory/manifest.json" "$asset_directory/icons" "$asset_directory/backgrounds" \
  "$repository_root/scripts/verify-forever-assets.mjs" \
  "$deploy_host:$remote_asset_directory/"
ssh "$deploy_host" \
  "node '$remote_asset_directory/verify-forever-assets.mjs' '$remote_asset_directory' && ln -sfn '$remote_asset_directory' '$deploy_root/shared/forever-preview-assets/current'"

echo "Synchronized and activated Forever visual assets $asset_release_name"
