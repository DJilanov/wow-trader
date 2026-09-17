#!/usr/bin/env bash
set -euo pipefail

definitions_revision="${WOWDBDEFS_REVISION:-e6828ce1a61ad05e9693e762fcfd39666454cc62}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
definitions_checkout="$repository_root/.cache/wowdbdefs/$definitions_revision"
wow_root="${WOW_ROOT:-/Applications/World of Warcraft}"
snapshot_output="${CATALOG_OUTPUT:-$repository_root/artifacts}"
dotnet_bin="${DOTNET_BIN:-}"
wow_product="${WOW_PRODUCT:-wow_anniversary}"
wow_locale="${WOW_LOCALE:-enUS}"
wow_region="${WOW_REGION:-eu}"

if [[ -z "$dotnet_bin" ]]; then
  dotnet_bin="$(command -v dotnet || true)"
fi
if [[ -z "$dotnet_bin" && -x "$HOME/.dotnet/dotnet" ]]; then
  dotnet_bin="$HOME/.dotnet/dotnet"
fi
if [[ -z "$dotnet_bin" ]]; then
  echo "A .NET 10 SDK is required. Set DOTNET_BIN or install it from https://dotnet.microsoft.com/download." >&2
  exit 1
fi

if [[ ! -d "$definitions_checkout/.git" ]]; then
  mkdir -p "$(dirname "$definitions_checkout")"
  git clone --filter=blob:none --no-checkout https://github.com/wowdev/WoWDBDefs.git "$definitions_checkout"
  git -C "$definitions_checkout" checkout --detach "$definitions_revision"
fi

extractor_revision="$(git -C "$repository_root" rev-parse HEAD 2>/dev/null || true)"
extractor_args=(
  snapshot
  --wow-root "$wow_root"
  --product "$wow_product"
  --locale "$wow_locale"
  --region "$wow_region"
  --definitions "$definitions_checkout/definitions"
  --definitions-revision "$definitions_revision"
  --output "$snapshot_output"
)
if [[ -n "$extractor_revision" ]]; then
  extractor_args+=(--extractor-revision "$extractor_revision")
fi

"$dotnet_bin" run \
  --project "$repository_root/tools/extractor-dotnet/WowTrader.Extractor.csproj" \
  --configuration Release \
  -- "${extractor_args[@]}"
