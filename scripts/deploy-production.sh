#!/usr/bin/env bash

set -Eeuo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
deploy_host=${WOW_TRADER_DEPLOY_HOST:-root@89.167.46.193}
deploy_root=${WOW_TRADER_DEPLOY_ROOT:-/home/wow-trader-system}
release_name=${1:-worktree-$(date -u +%Y%m%dT%H%M%SZ)}

if [[ ! "$deploy_host" =~ ^[A-Za-z0-9._@:-]+$ ]]; then
  echo "WOW_TRADER_DEPLOY_HOST contains unsupported characters" >&2
  exit 2
fi
if [[ ! "$deploy_root" =~ ^/home/[A-Za-z0-9._/-]+$ || "$deploy_root" == *".."* ]]; then
  echo "WOW_TRADER_DEPLOY_ROOT must be a safe absolute path below /home" >&2
  exit 2
fi
if [[ ! "$release_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Release name may contain only letters, numbers, dot, underscore, and hyphen" >&2
  exit 2
fi

release_directory="$deploy_root/releases/$release_name"

ssh "$deploy_host" "test ! -e '$release_directory' && mkdir -p '$release_directory'"

rsync -az \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.*.local' \
  --exclude='.next/' \
  --exclude='.turbo/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='artifacts/' \
  --exclude='catalog-snapshots/' \
  --exclude='raw-uploads/' \
  --exclude='coverage/' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.log' \
  --exclude='.wow-trader-companion-state.json' \
  "$repository_root/" "$deploy_host:$release_directory/"

ssh "$deploy_host" "cd '$release_directory' && chmod 0755 scripts/*.sh && corepack pnpm install --frozen-lockfile && corepack pnpm check && corepack pnpm format:check"

echo "Staged and verified $release_directory"
echo "Activate only after database migrations, environment files, and item media are ready."
