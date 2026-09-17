# WoW Trader Companion

The companion safely parses `WOW_TRADER_SAVED` from the collector's SavedVariables file without
executing Lua, validates every field, computes the canonical SHA-256 payload checksum, and uploads
each scan exactly once from the local state file.

The root `pnpm dev` command starts watch mode automatically for the installed WoW product. The only
player actions are the in-game Auctionator scan and `/reload` or logout. Watch mode discovers all
account-wide collector files, waits for two matching file signatures before reading, and retries a
failed parse or upload with bounded exponential backoff. A scan is recorded locally only after the
API confirms `processed`; an accepted-but-unconfirmed request remains retryable and idempotent.

```bash
pnpm --filter @wow-trader/companion build

pnpm --filter @wow-trader/companion dev discover \
  --wow-root "/Applications/World of Warcraft/_anniversary_"

pnpm --filter @wow-trader/companion dev inspect \
  --saved-variables "/path/to/WTF/Account/<account>/SavedVariables/WowTraderCollector.lua"

WOW_TRADER_INGEST_API_KEY="..." pnpm --filter @wow-trader/companion dev upload \
  --saved-variables "/path/to/WowTraderCollector.lua" \
  --endpoint "http://localhost:4000"

WOW_TRADER_INGEST_API_KEY="..." pnpm --filter @wow-trader/companion dev watch \
  --wow-root "/Applications/World of Warcraft/_anniversary_" \
  --endpoint "http://localhost:4000"
```

Production endpoints must use HTTPS. The API key is accepted through the environment or a protected
`--api-key-file`, so it is not written into SavedVariables or exposed in command arguments. Run the
companion only after logging out or `/reload`, when WoW has flushed the collector data to disk.

On macOS, `pnpm companion:install:macos` creates and starts the per-user
`online.kfcguild.wow-trader-companion` LaunchAgent. It watches the Anniversary client by default,
persists scan IDs under `~/Library/Application Support/WowTraderCompanion`, and survives login and
process crashes. `pnpm companion:uninstall:macos` stops the service but deliberately retains its
state and protected API key so a reinstall cannot replay old scans.
