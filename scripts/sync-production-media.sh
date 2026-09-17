#!/usr/bin/env bash

set -Eeuo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
media_directory=${1:-}
media_release_name=${2:-}
deploy_host=${WOW_TRADER_DEPLOY_HOST:-root@89.167.46.193}
deploy_root=${WOW_TRADER_DEPLOY_ROOT:-/home/wow-trader-system}

if [[ -z "$media_directory" || -z "$media_release_name" ]]; then
  echo "Usage: scripts/sync-production-media.sh <media-build-directory> <media-release-name>" >&2
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
if [[ ! "$media_release_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Media release name contains unsupported characters" >&2
  exit 2
fi

media_directory=$(cd "$media_directory" && pwd)
node "$repository_root/scripts/verify-item-media.mjs" "$media_directory"

remote_media_directory="$deploy_root/shared/media/releases/$media_release_name"
ssh "$deploy_host" "test ! -e '$remote_media_directory' && mkdir -p '$remote_media_directory'"
rsync -az "$media_directory/manifest.json" "$media_directory/icons" \
  "$deploy_host:$remote_media_directory/"
ssh "$deploy_host" \
  "node '$deploy_root/current/scripts/verify-item-media.mjs' '$remote_media_directory' && ln -sfn '$remote_media_directory/icons' '$deploy_root/shared/media/current'"

echo "Synchronized and activated item media $media_release_name"
