#!/usr/bin/env bash

set -Eeuo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
manifest_path=${1:-}

if [[ -z "$manifest_path" ]]; then
  echo "Usage: scripts/publish-catalog-production.sh <manifest> [--tbc-golden] [--publish]" >&2
  exit 2
fi
shift

require_tbc_golden=false
publish=false
for argument in "$@"; do
  case "$argument" in
    --tbc-golden) require_tbc_golden=true ;;
    --publish) publish=true ;;
    *)
      echo "Unknown argument: $argument" >&2
      exit 2
      ;;
  esac
done

: "${DATABASE_URL:?DATABASE_URL must point to the SSH-tunneled production database}"

manifest_path=$(cd "$(dirname "$manifest_path")" && pwd)/$(basename "$manifest_path")
if [[ ! -f "$manifest_path" ]]; then
  echo "Catalog manifest does not exist: $manifest_path" >&2
  exit 1
fi

cd "$repository_root"
corepack pnpm catalog:audit "$manifest_path"

validation_arguments=(catalog:validate "$manifest_path")
if [[ "$require_tbc_golden" == true ]]; then
  validation_arguments+=(--tbc-golden)
fi
corepack pnpm "${validation_arguments[@]}"
corepack pnpm catalog:import "$manifest_path"

if [[ "$publish" == true ]]; then
  corepack pnpm catalog:import "$manifest_path" --publish
else
  echo "Imported as reviewed. Re-run with --publish after reviewing the report and syncing media."
fi
