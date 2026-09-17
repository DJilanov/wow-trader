#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
wow_root="${WOW_ROOT:-/Applications/World of Warcraft}"
wow_product="${WOW_PRODUCT:-wow_anniversary}"
wow_locale="${WOW_LOCALE:-enUS}"
wow_region="${WOW_REGION:-eu}"
icon_ids_path="${ICON_IDS_PATH:-}"
icon_output="${ICON_OUTPUT:-}"
dotnet_bin="${DOTNET_BIN:-}"

if [[ -z "$icon_ids_path" || -z "$icon_output" ]]; then
  echo "ICON_IDS_PATH and ICON_OUTPUT are required." >&2
  exit 1
fi

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

"$dotnet_bin" run \
  --project "$repository_root/tools/extractor-dotnet/WowTrader.Extractor.csproj" \
  --configuration Release \
  -- icons \
  --wow-root "$wow_root" \
  --product "$wow_product" \
  --locale "$wow_locale" \
  --region "$wow_region" \
  --ids "$icon_ids_path" \
  --output "$icon_output"
