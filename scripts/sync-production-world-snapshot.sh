#!/usr/bin/env bash

set -Eeuo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
snapshot_directory=${1:-}
snapshot_release_name=${2:-}
application_release_name=${3:-}
deploy_host=${WOW_TRADER_DEPLOY_HOST:-root@89.167.46.193}
deploy_root=${WOW_TRADER_DEPLOY_ROOT:-/home/wow-trader-system}

if [[ -z "$snapshot_directory" || -z "$snapshot_release_name" || -z "$application_release_name" ]]; then
  echo "Usage: scripts/sync-production-world-snapshot.sh <snapshot-root> <snapshot-release-name> <application-release-name>" >&2
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
if [[ ! "$snapshot_release_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Snapshot release name contains unsupported characters" >&2
  exit 2
fi
if [[ ! "$application_release_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Application release name contains unsupported characters" >&2
  exit 2
fi

snapshot_directory=$(cd "$snapshot_directory" && pwd)
manifest_path="$snapshot_directory/manifest.json"
application_release_directory="$deploy_root/releases/$application_release_name"
remote_snapshot_directory="$deploy_root/shared/world-snapshots/releases/$snapshot_release_name"

if [[ ! -f "$manifest_path" || ! -f "$snapshot_directory/map-media-manifest.json" ]]; then
  echo "Snapshot root must contain manifest.json and map-media-manifest.json" >&2
  exit 1
fi

cd "$repository_root"
corepack pnpm world:audit "$manifest_path" >/dev/null

ssh "$deploy_host" \
  "test -d '$application_release_directory' && test ! -e '$remote_snapshot_directory' && mkdir -p '$remote_snapshot_directory'"
rsync -az \
  "$snapshot_directory/manifest.json" \
  "$snapshot_directory/map-media-manifest.json" \
  "$snapshot_directory/normalized" \
  "$snapshot_directory/media" \
  "$deploy_host:$remote_snapshot_directory/"
ssh "$deploy_host" \
  "cd '$application_release_directory' && corepack pnpm world:audit '$remote_snapshot_directory/manifest.json' >/dev/null && ln -sfn '$remote_snapshot_directory' '$deploy_root/shared/world-snapshots/current'"

echo "Synchronized and activated world snapshot $snapshot_release_name"
