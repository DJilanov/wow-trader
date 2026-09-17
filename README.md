# WoW Trader

WoW Trader is a build-aware World of Warcraft economy platform. It extracts a versioned profession
catalog from the installed client, records Auction House price depth through an addon and companion,
and produces explainable crafting and market analysis.

The current implementation targets TBC Anniversary build `2.5.6.69795` so the complete data path can
be tested before Forever ships. See [`blueprint.md`](./blueprint.md) for the architecture,
[`context.md`](./context.md) for live status, and
[`docs/market-workspace-plan.md`](./docs/market-workspace-plan.md) for market valuation and staged
recommendation work. See
[`docs/runbooks/tbc-validation.md`](./docs/runbooks/tbc-validation.md) for the tested workflow and
Forever migration checklist.

## Requirements

- Node.js 20.20 or newer
- pnpm 9.15.9
- .NET SDK 10 for the isolated CASC/DB2 extractor
- Docker with Compose for local PostgreSQL, Redis, and MinIO
- A local TBC client for extraction and Auctionator `335` for the collector integration test

## Install and verify

```bash
pnpm install
pnpm check
```

The root check runs strict TypeScript, ESLint, unit tests, and production builds for every JavaScript
workspace. The extractor is checked separately:

```bash
dotnet build tools/extractor-dotnet/WowTrader.Extractor.csproj --configuration Release
```

## Local application

```bash
pnpm dev
```

That single command creates `.env` with a random local ingestion key when needed, installs the
locked dependencies, finds and starts OrbStack or Docker Desktop, starts PostgreSQL, applies
migrations, builds the workspace, and checks for the exact installed WoW product/build,
locale, hotfix, and definitions revision. If that catalog is not already published locally, it
extracts, audits, validates, imports, and publishes it before starting Next.js and Fastify. Repeated
runs reuse healthy infrastructure, dependencies, artifacts, and the published catalog. The same
bootstrap discovers every distinct item icon file ID in that published build, converts the client
BLP assets to browser-ready PNGs, and exposes them to Next.js; no separate media command is needed.
It also reuses or initializes the reviewed WoW Forever preview snapshot and its complete local visual
asset manifest, so the Forever library never fetches third-party data or images in a browser request.
It also starts the companion watcher, which discovers collector SavedVariables for every local WoW
account and uploads new scans after WoW flushes them.

The website defaults to `http://localhost:3000`, ingestion to `http://localhost:4000`, and API docs
to `http://localhost:4000/docs`. Use `pnpm dev:setup` to run only the idempotent bootstrap without
leaving the application servers running.

The home page is the KFC Helper game/tool chooser. The TBC market workbench is at `/tbc/trader`:
select a collected realm, search recipes/items/reagents, filter by profession and
AH/vendor/disenchant route, and sort real depth-aware one-craft quotes by profit, ROI, or
specialization uplift. Account-network mode recursively replaces overpriced intermediates with
deterministic crafts performed by selected profession specialists, while showing the raw AH
purchases, savings, leftovers, and alt-transfer route. TBC profiles cover Alchemy, Blacksmithing,
Engineering, Leatherworking, and Tailoring specializations and their locked recipes.
Mastery results visibly use a build-locked provisional expected-yield model because its proc
distribution is server-side; base profit remains visible. Disenchanting uses the build-locked TBC
item class/quality/item-level distribution, the client-extracted skill requirement, and supported
live AH quotes for every possible material.

The TBC Encyclopedia at `/tbc/encyclopedia` searches the published schema-v3 catalog by name or
exact ID. Item results show client-backed, in-game-style stat previews on hover and keyboard focus;
desktop previews automatically move below a result when the space above would clip them, while the
mobile preview remains a viewport-bounded bottom panel. The item detail page reserves a visible
`Loot info` section for the next acquisition-data phase and labels source/drop chance as pending or
unknown rather than inferring them from client presence. The Helper shell uses the same KFC mark,
Cinzel/Inter/JetBrains Mono typography, dark-gold palette, navigation, and compact card language as
`kfcguild.online`. Detail pages include damage and derived DPS, stats, restrictions, sockets,
gems/enchants, item
effects, and item sets. BiS calculation and acquisition/drop sources are deliberately separate later
phases rather than unproven fields on the item record. The implementation and those phase boundaries
are documented in
[`docs/item-library-bis-sources-plan.md`](docs/item-library-bis-sources-plan.md).

The WoW Forever Encyclopedia at `/forever/encyclopedia` exposes the reviewed BlizzCon demo archive:
all nine interactive talent calculators, class spellbooks, racials, class abilities, Legacy perks,
and the source changelog. Talent builds obey level, tier, rank, and prerequisite rules and share a
snapshot-bound link. Preview evidence remains separate from extracted client facts, and incomplete,
estimated, or Classic-fallback text is labeled in the UI. The importer, evidence contract, asset
handling, and release reconciliation are documented in
[`docs/talents-forever-integration-plan.md`](docs/talents-forever-integration-plan.md).

The account-network calculation, safety boundaries, and Forever migration steps are documented in
[`docs/account-crafting-network.md`](docs/account-crafting-network.md).

## Production

The no-Docker TBC and WoW Forever preview deployment is live at
`https://helper.kfcguild.online`. It uses the server's PostgreSQL installation and named PM2
processes while extraction, catalog review, media generation, and companion collection stay on the
maintainer machine. The complete topology, deployment, publication, rollback, and storage gate are in
[`docs/production-deployment.md`](docs/production-deployment.md).

To publish a reviewed local catalog, open a short-lived SSH tunnel, load the owner connection string
from a protected local secret file, and run the guarded publisher against an explicit manifest:

```bash
ssh -N -L 55432:127.0.0.1:5432 root@89.167.46.193
set -a
. /path/to/protected/owner.env
set +a
./scripts/publish-catalog-production.sh /absolute/path/to/manifest.json --tbc-golden --publish
```

The production companion endpoint is `https://helper.kfcguild.online`. Keep its bearer key outside
the repository and use a state file outside the worktree. Unattended 30-minute collection remains
disabled until the documented retention and monitoring gate is implemented.

## TBC catalog

```bash
CATALOG_OUTPUT=/tmp/wow-trader-tbc pnpm extract:tbc
manifest=$(find /tmp/wow-trader-tbc/catalog-snapshots -name manifest.json -print -quit)
pnpm catalog:audit "$manifest"
pnpm catalog:validate "$manifest" --tbc-golden
pnpm catalog:import "$manifest"
pnpm catalog:import "$manifest" --publish
```

`catalog:audit` verifies every raw and normalized file against its manifest checksum and count. It
then proves that every name-bearing `Item`/`ItemSparse`/`ItemSearchName` source ID is normalized,
every selected field matches its source, and the complete source records are retained in
`rawRecord`. Structural item IDs with no localized metadata are reported separately rather than
misclassified as lost catalog items.

The first import deliberately leaves a build in `review_required`. Re-run the validated exact
snapshot with `--publish` only after review. Both import and promotion are idempotent.

## Auction House collection

Install [`apps/addon/WowTraderCollector`](./apps/addon/WowTraderCollector) next to Auctionator. A
normal Auctionator full scan is compacted into SavedVariables. With `pnpm dev` running, the normal
workflow has no filesystem or upload commands:

1. Open the Auction House and run `/wowtrader scan`.
2. When the scan finishes, run `/reload` or log out so WoW writes SavedVariables.
3. The companion waits for the file to stabilize and uploads every unseen scan automatically.

The supported no-Terminal client is the Electron **WoW Trader Companion**. During maintainer alpha,
run it from source with the production ingestion endpoint:

```bash
pnpm desktop:dev
```

Development mode deliberately forces `https://helper.kfcguild.online`, including when an older
localhost endpoint remains in the saved desktop settings. It therefore requires a dedicated
production collector token; the generated key in the repository's `.env` is local-only.

Build a local macOS application bundle with:

```bash
pnpm desktop:package
open "apps/desktop/out/WoW Trader Companion-darwin-x64/WoW Trader Companion.app"
```

The first-run dashboard discovers TBC automatically, accepts a dedicated collector token into
macOS secure storage, verifies/installs collector `0.4.0`, and explains the required Auctionator
scan plus `/reload` boundary. It keeps watching from the tray after the window closes. Use
`Automatic uploads` for normal operation and `Check for scans now` for an immediate manual pass.
TBC and Forever roots can be configured independently. Local state and redacted rotating logs live
under the operating system's application-data directory, not in this repository.

`pnpm desktop:make` creates unsigned local ZIP/DMG artifacts. Do not distribute those artifacts to
players yet: public release still requires per-installation pairing, branded application artwork,
macOS signing/notarization, Windows signing, and clean-machine acceptance tests. The complete release
gates are in [`docs/desktop-companion-plan.md`](docs/desktop-companion-plan.md).

The following commands remain available for diagnostics and one-off operation:

```bash
pnpm --filter @wow-trader/companion dev discover \
  --wow-root "/Applications/World of Warcraft/_anniversary_"

pnpm --filter @wow-trader/companion dev inspect \
  --saved-variables "/path/to/WTF/Account/<account>/SavedVariables/WowTraderCollector.lua"

WOW_TRADER_INGEST_API_KEY="..." pnpm --filter @wow-trader/companion dev upload \
  --saved-variables "/path/to/WowTraderCollector.lua" \
  --endpoint "http://localhost:4000"
```

The watcher never scans the Auction House itself and cannot see in-memory addon data before a
`/reload` or logout. Upload IDs are stable, the API rejects conflicting reuse, and both the API and
local companion state make retries idempotent.

For an unattended macOS watcher, build and install the per-user LaunchAgent with a dedicated
ingestion key. The installer stores the key in a mode-0600 file, keeps it out of process arguments,
starts the service immediately, and writes logs under `~/Library/Logs/WowTraderCompanion`:

```bash
WOW_TRADER_INGEST_API_KEY="..." pnpm companion:install:macos
pnpm companion:uninstall:macos
```

The installed watcher uses `https://helper.kfcguild.online` and the Anniversary product by default;
`--endpoint` and `--wow-root` override them. Do not enable recurring production collection until the
retention/storage gate in the deployment runbook is satisfied.

Do not commit extracted game data, raw uploads, companion state, credentials, or private
authorization documents.
