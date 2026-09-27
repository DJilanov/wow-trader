#!/usr/bin/env bash

set -Eeuo pipefail

release_root=${1:-}
deploy_host=${WOW_TRADER_DEPLOY_HOST:-root@89.167.46.193}
deploy_root=${WOW_TRADER_DEPLOY_ROOT:-/home/wow-trader-system}

if [[ -z "$release_root" || ! -r "$release_root/latest.json" ]]; then
  echo "Usage: scripts/sync-production-companion-release.sh <release-root>" >&2
  exit 2
fi
if [[ ! "$deploy_host" =~ ^[A-Za-z0-9._@:-]+$ ]]; then
  echo "Invalid deployment host" >&2
  exit 2
fi
if [[ ! "$deploy_root" =~ ^/home/[A-Za-z0-9._/-]+$ || "$deploy_root" == *".."* ]]; then
  echo "Invalid deployment root" >&2
  exit 2
fi

version=$(node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(manifest.version)) process.exit(2);
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) process.exit(2);
  for (const asset of manifest.assets) {
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._()-]{1,180}$/.test(asset.filename)) process.exit(2);
    const file = `${process.argv[2]}/releases/${manifest.version}/${asset.filename}`;
    if (!fs.statSync(file).isFile()) process.exit(2);
  }
  process.stdout.write(manifest.version);
' "$release_root/latest.json" "$release_root")

remote_root="$deploy_root/shared/companion-releases"
remote_release="$remote_root/releases/$version"
remote_manifest="$remote_root/latest.$version.json"

ssh "$deploy_host" "mkdir -p '$remote_release'"
rsync -az --checksum --partial "$release_root/releases/$version/" "$deploy_host:$remote_release/"
rsync -az "$release_root/latest.json" "$deploy_host:$remote_manifest"
ssh "$deploy_host" "node - '$remote_root' '$remote_manifest'" <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const manifestPath = process.argv[3];
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
for (const asset of manifest.assets) {
  const filePath = path.join(root, "releases", manifest.version, asset.filename);
  const contents = fs.readFileSync(filePath);
  const digest = crypto.createHash("sha256").update(contents).digest("hex");
  if (contents.length !== asset.byteSize || digest !== asset.sha256) {
    throw new Error(`Release verification failed for ${asset.filename}`);
  }
}
fs.renameSync(manifestPath, path.join(root, "latest.json"));
NODE

echo "Synchronized Companion $version to $remote_root"
