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
web_environment_file="$deploy_root/shared/env/web.env"

ssh "$deploy_host" "test ! -e '$release_directory' && mkdir -p '$release_directory'"

rsync -az \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.*.local' \
  --exclude='.next/' \
  --exclude='.next-*/' \
  --exclude='.turbo/' \
  --exclude='.cache/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='apps/desktop/.webpack/' \
  --exclude='apps/desktop/out/' \
  --exclude='artifacts/' \
  --exclude='catalog-snapshots/' \
  --exclude='raw-uploads/' \
  --exclude='coverage/' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.log' \
  --exclude='.wow-trader-companion-state.json' \
  "$repository_root/" "$deploy_host:$release_directory/"

ssh "$deploy_host" "cd '$release_directory' && chmod 0755 scripts/*.sh && corepack pnpm install --frozen-lockfile && if [ -r '$web_environment_file' ]; then . '$web_environment_file'; fi && if [ \"\${SEO_RUM_ENABLED:-false}\" = true ]; then export SEO_RUM_ENABLED SEO_RUM_ROOT SEO_RUM_SAMPLE_RATE; export SEO_RUM_BUILD='$release_name'; fi && if [ \"\${TOOL_USAGE_ENABLED:-false}\" = true ]; then export TOOL_USAGE_ENABLED TOOL_USAGE_ROOT; export TOOL_USAGE_BUILD='$release_name'; fi && corepack pnpm check && corepack pnpm format:check && test -f apps/web/.next/standalone/apps/web/server.js && mkdir -p apps/web/.next/standalone/apps/web/.next/static apps/web/.next/standalone/apps/web/public && rsync -a --delete apps/web/.next/static/ apps/web/.next/standalone/apps/web/.next/static/ && rsync -a --delete apps/web/public/ apps/web/.next/standalone/apps/web/public/ && for generated_path in .turbo apps/desktop/.webpack apps/desktop/out apps/web/.next/cache; do if [ -d \"\$generated_path\" ]; then find \"\$generated_path\" -mindepth 1 -delete && rmdir \"\$generated_path\"; fi; done"

ssh "$deploy_host" "cd '$release_directory' && bash scripts/stage-static-delivery.sh '$release_name' '$deploy_root'"

echo "Staged and verified $release_directory, including compressed immutable asset delivery"
echo "Activate only after database migrations, environment files, and item media are ready."
