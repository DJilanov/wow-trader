# WoW Trader Project Blueprint

Status: Initial architecture blueprint
Date: 2026-09-15
Repository: `DJilanov/wow-trader`

## 1. Product objective

WoW Trader will be a version-aware World of Warcraft economy platform that combines:

- An extracted catalog of items, professions, recipes, reagents, outputs, cooldowns, and other economic transformations.
- Auction House snapshots collected at regular intervals.
- Player-specific profession, recipe, inventory, and cooldown information collected by the addon with player consent.
- Observed evidence for world drops, vendors, and crafting outcomes, plus build-locked static
  disenchant tables with optional outcome observations for verification.
- A recommendation engine that calculates realistic profit, capital requirements, market depth, risk, and expected time to sell.

The initial product is focused on WoW: Forever professions and trading. Combat and class-scaling analysis can later reuse the build/version infrastructure, but it is not part of the first trading release.

The platform must never present a client record as proof that content is currently obtainable. Existence, availability, source, and probability are separate facts with separate evidence.

## 2. Core architecture decision

Use TypeScript across the website, APIs, workers, shared contracts, and economic calculations. Use Lua only inside the WoW addon. Keep a small .NET extraction utility if the mature CASC and DB2 libraries prove materially safer than JavaScript alternatives.

The .NET component must contain no product or economic business logic. Its contract is limited to:

1. Reading a named WoW product/build.
2. Extracting and parsing selected client tables.
3. Applying the matching client hotfix cache.
4. Emitting versioned NDJSON/JSON manifests that the TypeScript pipeline validates and imports.
5. Reading catalog-referenced media by file data ID and converting BLP images into a manifested,
   browser-ready local asset set.

This isolates .NET at the unstable binary-format boundary while keeping the actual product in the JavaScript ecosystem.

```text
WoW CASC archives ─┐                       ┌─> manifested item PNGs ─> website
                   ├─> catalog extractor ──┴> immutable snapshot ─> catalog importer
DBCache.bin ───────┘                                               │
                                                                   ▼
Addon/API AH scans ─> ingestion API ─> market observations ─> economic graph
Addon discoveries ─> evidence API ─> source/outcome evidence ─────┘
                                                                  │
                                                                  ▼
                                              recommendations and Next.js website
```

## 3. Authorization assumptions

The project assumes Blizzard authorization covers the intended uses. Before public launch, retain written confirmation for each applicable scope:

- Client table extraction.
- Publication of derived item, spell, and recipe metadata.
- Publication or delivery of Blizzard icons and other media assets.
- Auction House collection frequency and automation level.
- A desktop companion or other upload mechanism, if used.
- Retention and aggregation of player-contributed observations.

Authorization artifacts are operational/legal records and must not be committed to this repository if they contain confidential information.

## 4. Proposed monorepo

Use a `pnpm` workspace with Turborepo for task orchestration. Use strict TypeScript and a single shared lint/format configuration.

```text
wow-trader/
├── apps/
│   ├── web/                    # Next.js App Router website and public BFF
│   ├── ingest-api/             # Fastify API for scans and addon observations
│   ├── worker/                 # Import, aggregation, graph, and recommendation jobs
│   ├── companion/              # Optional desktop/CLI SavedVariables uploader
│   └── addon/                  # Lua addon or integration module
├── packages/
│   ├── contracts/              # Versioned Zod schemas and API payload types
│   ├── db/                     # PostgreSQL schema, migrations, and typed access
│   ├── catalog/                # Static catalog normalization and validation
│   ├── economics/              # Pure pricing and transformation-graph logic
│   ├── market/                 # Order-book, history, liquidity, and forecast logic
│   ├── evidence/               # Source confidence and probability estimation
│   ├── ui/                     # Shared accessible UI components
│   ├── config/                 # Shared TypeScript, ESLint, and test config
│   └── observability/          # Logging, metrics, tracing, and error reporting
├── tools/
│   └── extractor-dotnet/       # CASC/DB2/hotfix adapter only
├── fixtures/
│   ├── catalog/                # Small licensed/golden table fixtures
│   ├── addon-payloads/         # Valid and invalid ingestion examples
│   └── market/                 # Deterministic market scenarios
├── infra/
│   ├── compose/                # Local PostgreSQL, Redis, object store, ClickHouse
│   ├── migrations/             # Non-ORM operational migrations if needed
│   └── deployment/             # Production manifests and runbooks
├── docs/
│   ├── data-contracts/
│   ├── runbooks/
│   └── decisions/              # Architecture decision records
├── pnpm-workspace.yaml
├── turbo.json
└── blueprint.md
```

Do not create all packages on day one. Add a package only when a working feature owns code that belongs there.

## 5. Technology choices

### Application layer

- Next.js with the App Router for the website.
- TypeScript in strict mode.
- Fastify for high-volume ingestion rather than routing bulk uploads through Next.js.
- Zod for external boundary validation and versioned contracts.
- REST/JSON with generated OpenAPI for addon/companion/public integration. GraphQL is not needed initially.
- PostgreSQL for the catalog, accounts, evidence, current market state, and recommendations.
- Redis and BullMQ for jobs, locks, and short-lived caches.
- S3-compatible object storage for immutable compressed source payloads and extraction artifacts.
- ClickHouse when multi-realm Auction House volume exceeds reasonable PostgreSQL partitioning. Begin with PostgreSQL only for the first controlled realm if that materially shortens delivery time.

### Extraction layer

Preferred first implementation:

- TACTSharp for local/CDN CASC access.
- DBCD for WDC/DB2 parsing and `DBCache.bin` application.
- A pinned WoWDBDefs revision for build-specific schemas.
- A current supported .NET SDK for this tool only.

The current development Mac does not have `dotnet` installed. Installing the SDK is an explicit implementation step when the extractor is started; it is not required for the web services.

A TypeScript-only extraction spike is acceptable, but it must meet the same golden tests, current WDC support, hotfix support, and build-schema handling. Do not replace mature parsers merely to avoid one isolated runtime.

### Money and numeric rules

- Store money as integer copper, never floating point.
- Use PostgreSQL `bigint` for prices and aggregated values.
- Serialize values that can exceed JavaScript's safe integer range as decimal strings at API boundaries.
- Store probabilities as fixed-precision decimals with sample size and confidence interval.
- Store timestamps in UTC and render in the user's locale.
- Keep WoW IDs numeric, but never assume IDs are contiguous or discoverable by range scanning.

## 6. Static catalog extraction

### 6.1 Snapshot identity

Every extraction is immutable and identified by:

- Product identifier, such as `wow_anniversary`.
- Semantic client version and build number.
- Build key and CDN key.
- Locale.
- Root/encoding manifest identifiers when available.
- `DBCache.bin` content hash.
- WoWDBDefs commit hash.
- Extractor version and source commit.
- Extraction timestamp.

Never identify a snapshot by `2.5.6` alone. Multiple builds and hotfix states can share the same client version.

### 6.2 Initial table set

Identity and localization:

- `Item`
- `ItemSparse`
- `ItemSearchName`
- `ItemClass`
- `ItemSubClass`
- `SpellName`
- `SkillLine`

Recipe topology:

- `SkillLineAbility`
- `SpellEffect`
- `SpellLearnSpell`
- `SpellReagents`
- `ItemEffect`
- `SpellCooldowns`
- `SpellCategories`
- `SpellLevels`
- `SpellCastTimes`
- `SpellEquippedItems`
- `SpellTotems`
- `SpellItemEnchantment`

Economic and source hints:

- `ItemDisenchantLoot`
- `ItemExtendedCost`
- `JournalEncounter`
- `JournalEncounterItem`
- Relevant quest tables only when a concrete source relationship is verified.

The list is expanded only after a new Forever mechanic demonstrates a missing relationship.

### 6.3 Recipe discovery

Start with profession skill lines, not localized item names:

```text
SkillLine.ID
  -> SkillLineAbility.SkillLine
  -> SkillLineAbility.Spell
  -> recipe/crafting SpellID
```

Classify candidate recipe spells by semantic effect:

- Creates one or more items.
- Applies an enchantment.
- Converts one resource into another.
- Creates a profession service or persistent object.
- Triggers another spell that performs one of the above.

Resolve inputs and outputs:

```text
recipe SpellID
  -> SpellReagents: reagent IDs and quantities
  -> SpellEffect: output item, triggered spell, quantity information
  -> SpellItemEnchantment: enchantment output
  -> SpellCooldowns/SpellCategories: individual or shared cooldown
```

Resolve the item that teaches a world-drop recipe:

```text
recipe SpellID
  <- SpellLearnSpell.LearnSpellID
  <- learning SpellID
  <- ItemEffect.SpellID
  -> ItemEffect.ParentItemID
```

The parser must support:

- No teaching item.
- Multiple teaching items.
- One item teaching multiple recipes.
- Triggered-spell chains with a cycle guard and maximum depth.
- Multiple or probabilistic outputs.
- Enchantments with no tradeable output item.
- Recipes that reuse existing item or spell IDs.
- Records present in the client but unavailable on the server.

Do not encode the DB2 limit of eight reagent columns into the domain schema. Normalize every non-zero reagent into its own row.

### 6.4 Hotfix overlay

The pipeline order is mandatory:

1. Extract base DB2 records.
2. Parse with the exact build definition.
3. Apply the matching `DBCache.bin` records.
4. Retain base and effective values for auditing.
5. Normalize effective records.
6. Validate and publish atomically.

A missing or incompatible hotfix cache must be visible in the snapshot status. It must not silently publish a base-only catalog as current.

### 6.5 Snapshot artifacts

Store artifacts under a deterministic prefix:

```text
catalog-snapshots/{product}/{build}/{locale}/{hotfix-hash}/
├── manifest.json
├── raw/
│   ├── Item.ndjson.gz
│   ├── SpellEffect.ndjson.gz
│   └── ...
├── normalized/
│   ├── items.ndjson.gz
│   ├── spells.ndjson.gz
│   ├── recipes.ndjson.gz
│   ├── recipe-inputs.ndjson.gz
│   ├── recipe-outputs.ndjson.gz
│   └── recipe-teaching-items.ndjson.gz
├── validation-report.json
└── checksums.sha256
```

The TypeScript catalog importer owns the normalized contract. The extractor may emit raw table rows plus a proposed normalized form, but the importer revalidates everything before database writes.

### 6.6 Build diffing

Compare effective normalized snapshots, not raw binary offsets. Produce:

- Added, removed, and changed items.
- Added, removed, and changed crafting spells.
- Reagent quantity changes.
- Output quantity or output identity changes.
- Skill requirement changes.
- Cooldown changes.
- Newly discovered teaching-item relationships.
- Localization-only changes.
- Records that became inaccessible or encrypted.

Build diffs are first-class stored artifacts and an internal review UI. Large count changes should block automatic publication until reviewed.

## 7. Catalog data model

Use stable entities plus build-specific versions.

Core tables:

```text
game_build
item
item_version
spell
spell_version
profession
recipe
recipe_version
recipe_input
recipe_output
recipe_teaching_item
recipe_requirement
recipe_cooldown
entity_localization
content_availability
```

Important recipe fields:

```text
recipe_version
- build_id
- recipe_spell_id
- profession_id
- required_skill
- craft_time_ms
- output_kind
- output_determinism
- extraction_status
- raw_record_json
```

Important availability fields:

```text
content_availability
- build_id
- entity_kind
- entity_id
- state                 # client_only, announced, observed, available, disabled
- region
- phase
- effective_from
- effective_until
- evidence_id
```

Preserve `raw_record_json` for forward compatibility and auditability. Unknown fields must not be discarded.

## 8. Evidence and rare world-drop recipes

Client extraction can establish that a recipe exists and how it crafts. It normally cannot establish an authoritative source or drop probability. Model sources as claims backed by evidence.

```text
source_claim
- claim_id
- build_id
- item_id
- source_kind           # creature, boss, object, quest, vendor, trainer, discovery
- source_entity_id
- map_id
- difficulty_id
- phase
- evidence_type         # blizzard_feed, client_journal, addon_observation, manual_review
- status                # unverified, probable, verified, contradicted
- first_seen_at
- last_seen_at
```

```text
drop_observation
- observation_id
- claim_id
- anonymous_installation_id
- occurred_at
- source_guid_hash
- item_id
- quantity
- group_context
- payload_id
```

```text
attempt_observation
- observation_id
- source_entity_id
- build_id
- occurred_at
- eligible_attempts
- denominator_quality
- payload_id
```

Estimate drop probability only when a defensible denominator exists. A loot observation without eligible attempts proves a source relationship but does not establish a drop rate.

Publish sample size and a confidence interval with every estimated rate. For generic world drops, prefer zone/creature-family estimates rather than inventing a precise mob rate.

## 9. Addon and companion responsibilities

### Addon

Collect only through available/authorized WoW APIs:

- Complete or partial Auction House snapshots.
- Item links and item variation fields.
- Known recipes and profession skill.
- Optional inventory and bank quantities.
- Loot-window item links and source GUID information.
- Recent creature deaths or boss encounters needed for source evidence.
- Craft results, proc quantities, and cooldown state.
- Disenchant results.
- Merchant and trainer views.
- Auction sale, expiration, cancellation, and posting events where exposed.

The addon must record the client build, addon version, schema version, locale, region, realm, faction/AH type, scan start/end time, and completeness.

Do not collect or upload seller names. They are unnecessary for economic calculations.

### Companion

A standard Lua addon cannot perform HTTP uploads. The companion is responsible for:

- Discovering the correct account/SavedVariables files.
- Running continuously as a tray/background watcher across every configured WoW installation and
  account, without requiring the player to provide file paths or run an upload command.
- Reading only completed, flushed payloads.
- Avoiding reads during partial file writes.
- Comparing immutable scan IDs and character-profile revisions so a filesystem change uploads only
  genuinely new data from the character that produced it.
- Compressing and uploading payloads through the authenticated ingestion API; the companion must
  never connect directly to PostgreSQL.
- Retrying idempotently.
- Waiting for the ingestion receipt, then surfacing accepted, processed, duplicate, rejected, and
  retrying states together with the last successful database update.
- Triggering no manual website refresh requirement: after processing, affected market summaries,
  opportunity caches, and scan-freshness state are refreshed and become visible to the web app.
- Showing the user the last successful upload and any parsing error, including which character and
  market produced the scan without exposing that identity publicly.
- Never writing secrets into SavedVariables.

The watcher can only observe data after WoW flushes SavedVariables. It must clearly prompt for
`/reload` or logout after an in-game scan rather than claiming it can read the running client's
memory. Multiple filesystem notifications, companion restarts, network retries, and server retries
must remain harmless through scan-ID and payload-checksum idempotency.

The TypeScript CLI and end-to-end upload path are proven. The Electron tray application specified in
[`docs/desktop-companion-plan.md`](docs/desktop-companion-plan.md) is implemented for maintainer alpha
over the same `packages/companion-core` service. It handles verified addon installation, multiple
product roots, encrypted credentials, automatic/manual reconciliation, tray/login lifecycle, and
local activity/error presentation without exposing filesystem or network privileges to its renderer.
The CLI remains a diagnostic adapter. Public distribution remains gated on per-installation pairing,
signing/notarization, Windows validation, and the production retention/monitoring gate.

If Blizzard provides an authorized direct AH endpoint, prefer it for scheduled market snapshots and use the addon for player-specific and observational data.

## 10. Ingestion contracts

Every payload has an envelope:

```text
schemaVersion
payloadType
payloadId
addonVersion
clientProduct
clientBuild
locale
region
realmId
auctionHouseType
anonymousInstallationId
capturedAt
completedAt
completeness
checksum
data
```

Requirements:

- `payloadId` is globally idempotent.
- The server verifies the checksum after decompression.
- Unsupported schema versions return a clear non-retryable error.
- Unknown IDs are accepted into quarantine, not silently dropped.
- Raw accepted payloads are stored immutably before normalization.
- Normalization can be replayed after a bug fix.
- Duplicate scans from multiple collectors can improve completeness but must not multiply market quantity.

Initial endpoints:

```text
POST /v1/uploads/auction-scan
POST /v1/uploads/profession-snapshot
POST /v1/uploads/loot-observations
POST /v1/uploads/crafting-outcomes
POST /v1/uploads/disenchant-outcomes
POST /v1/uploads/vendor-snapshot
GET  /v1/uploads/{payloadId}
```

Use short-lived upload credentials or signed upload URLs. Do not embed a permanent service credential in the addon.

## 11. Auction House history

Represent an item market key using all economically meaningful link attributes. Base item ID alone is insufficient for equipment with suffixes, enchantments, charges, or other variants.

Store full price levels, not only minimum buyout:

```text
market_scan
- scan_id
- market_id
- build_id
- started_at
- completed_at
- completeness
- collector_count
- raw_payload_uri
```

```text
auction_price_level
- scan_id
- item_market_key
- unit_price_copper
- quantity
- listing_count
```

Derived series:

- Minimum actionable price.
- Quantity-weighted percentiles.
- Available quantity within 1%, 5%, and 10% of the minimum.
- Estimated acquisition cost for several quantities.
- Listing churn.
- Volatility.
- Liquidity score.
- Data freshness and scan completeness.

Do not treat an auction disappearing between scans as a confirmed sale. It may have sold, expired, or been cancelled. Maintain separate observed and inferred sale labels.

Suggested retention:

- Raw compressed scan payloads: 14-30 days.
- Thirty-minute price levels: at least 180 days.
- Hourly and daily aggregates: indefinitely.
- Confirmed personal sale events: indefinitely after anonymization.

## 12. Economic transformation graph

Model the economy as items/currencies/services connected by constrained transformations.

Examples:

```text
reagents -> crafted item
item -> disenchant outcome distribution
element -> transmuted element
materials -> profession service/enchantment
gold -> vendor item
item -> vendor gold
item -> Auction House expected revenue
```

Every transformation can carry:

- Input quantities.
- Deterministic or probabilistic outputs.
- Profession and skill requirements.
- Required recipe knowledge.
- Cooldown and shared cooldown group.
- Required tool, station, location, reputation, or phase.
- Cast/craft time.
- Per-character or per-account capacity.
- Confidence and evidence source.

Guard against cycles such as vendor conversions and reciprocal transmutes. Profit search must use capacities and bounded quantities rather than allowing an unbounded theoretical arbitrage loop.

## 13. Profit calculations

### Acquisition cost

Use order-book depth for the requested quantity:

```text
acquisitionCost(item, quantity) =
  sum(priceLevel.unitPrice * quantityTakenAtLevel)
```

Select the cheapest valid acquisition path among:

- Auction House depth.
- Vendor cost and availability.
- Crafting from components.
- Player-owned inventory valued at opportunity cost.

### Crafting profit

```text
expectedRevenue =
  sum(expectedOutputQuantity * expectedNetSalePrice)

expectedProfit =
  expectedRevenue
  - reagentAcquisitionCost
  - vendorAndToolCosts
  - expectedDepositLoss
  - cooldownShadowPrice
```

Expected net sale price includes Auction House cut, fill probability, liquidity, and the amount the user intends to sell.

### Craft and disenchant

```text
expectedDisenchantValue =
  sum(outcomeProbability * outcomeQuantity * realizableMaterialPrice)
```

Use the exact probability distribution for probabilistic brackets and deterministic output only where
the table is deterministic. Bind each static table to verified client builds, show the item-level and
skill bracket, and show sample size/confidence only when observed outcomes are used to audit or
replace a reference distribution.

### Recommendation output

Each recommendation returns:

- Action and exact quantity.
- Expected profit in copper/gold.
- Worst/base/best scenario.
- ROI.
- Required capital.
- Market depth consumed.
- Estimated time to sell.
- Required profession/recipe/cooldown.
- Data freshness.
- Confidence score and its limiting factors.

The system should recommend `craft 6`, not merely claim that an item has a positive unit margin while only one unit can realistically sell.

## 14. Price forecasting

Forecasting is not the first milestone. Establish clean history and a backtesting harness before adding complex models.

Baseline models:

- Rolling median and median absolute deviation.
- Exponentially weighted price and supply.
- Hour-of-day and day-of-week seasonality.
- Order-book imbalance and recent listing churn.
- Reagent/output parity from the crafting graph.
- Realm-relative and region-relative deviation.
- Known phase/release events.

Evaluation:

- Walk-forward validation only.
- No random train/test split for time-series data.
- Report direction accuracy, absolute error, calibration, and simulated decision profit after fees.
- Compare every model with a naive last-price/rolling-median baseline.
- Reject models that improve prediction metrics but reduce realized decision quality.

Forever launch is a regime change. Historical Classic prices should be treated as weak priors, not direct forecasts.

## 15. Website information architecture

The public helper is deployed at `helper.kfcguild.online`. Game identity is part of every primary URL
because entity IDs and build facts overlap across products. Current routes:

```text
/
/tbc
/tbc/trader
/tbc/encyclopedia
/tbc/encyclopedia/items/[itemId]
/tbc/encyclopedia/recipes/[spellId]
/tbc/encyclopedia/professions/[slug]
/forever
/markets/[region]/[realm]
/calculator/crafting
/calculator/disenchanting
/sources/[itemId]
/profile/professions
/profile/inventory
/data-status
```

Forever Trader and Encyclopedia remain disabled until their own audited client-product build is
published; Trader additionally requires a matching accepted AH scan. Legacy unscoped detail routes
remain temporary compatibility aliases, but new links must use game-scoped routes.

Important user-facing states:

- Loading, empty, stale, incomplete scan, and error states.
- Recipe present in client but not confirmed available.
- Source unknown versus source verified.
- Unsupported disenchant build/bracket or incomplete material prices.
- Price available but market too shallow.
- Recipe profitable per unit but demand-constrained.
- User cannot perform the action because the recipe, skill, cooldown, or tool is missing.

Every calculated result should link to the input prices, recipe version, market snapshot, and confidence explanation used to produce it.

## 16. Jobs and update cadence

```text
On new game build:
  extract -> apply hotfixes -> normalize -> validate -> diff -> review -> publish

On new AH scan:
  validate -> archive raw -> deduplicate -> aggregate price levels
  -> refresh current market state -> recompute affected opportunities

On new observation:
  validate -> archive raw -> update evidence -> recompute affected confidence/rates

Nightly:
  compact history -> build aggregates -> run data-quality checks -> back up catalog
```

Recompute only graph branches affected by changed market items. A reagent price change should invalidate recipes that consume it and downstream transformations, not the entire catalog.

## 17. Verification strategy

### Extractor tests

- Golden build metadata fixture.
- Golden table parsing fixtures.
- Base-only versus hotfixed effective record tests.
- Triggered-spell cycle tests.
- Missing table/definition and encrypted record behavior.
- Build-to-build diff snapshots.

Required initial golden recipe:

```text
Recipe item 13486
  -> teaches recipe spell 17563
  -> consumes item 12808
  -> produces item 7080
```

Add fixtures for:

- A trainer recipe with no teaching item.
- An enchantment with no physical output.
- A recipe with multiple outputs.
- A cooldown/shared-cooldown recipe.
- A triggered-spell output.

### TypeScript tests

- Unit tests for pure normalization and economic functions.
- Property tests for money arithmetic, order-book consumption, and bounded graph search.
- Contract tests using real addon payload fixtures.
- PostgreSQL integration tests for idempotency and build publication.
- Worker tests proving affected-graph invalidation.
- Playwright tests for critical website flows.
- Forecast walk-forward tests with leakage detection.

### Publication gates

A catalog build cannot become current when:

- Required tables failed to parse.
- Hotfix state is missing unexpectedly.
- Referential-integrity checks fail.
- Recipe/item counts change beyond configured review thresholds.
- A golden recipe fails.
- Normalized checksums are inconsistent.

## 18. Security and privacy

- Never accept executable Lua or JavaScript in uploads.
- Parse SavedVariables with a constrained parser; do not evaluate Lua.
- Set compressed and decompressed upload-size limits.
- Protect against decompression bombs and deeply nested payloads.
- Validate every external field and reject invalid numeric ranges.
- Rate-limit by credential and anonymous installation ID.
- Store no seller names and no chat content.
- Hash source GUIDs when the raw value is not needed.
- Separate public market data from private character inventories.
- Encrypt secrets and private player data at rest.
- Log payload IDs and validation outcomes, not full private payload contents.
- Maintain deletion/export paths for account-linked player information.

## 19. Observability and operations

Track:

- Latest extracted and published build.
- Latest hotfix hash per locale/region.
- Scan age and completeness per market.
- Upload acceptance, rejection, and duplicate rates.
- Unknown-item quarantine size.
- Catalog validation failures.
- Opportunity computation duration and backlog.
- Price anomaly count.
- Forecast calibration and backtest performance.

Use structured logs with request/payload/job correlation IDs. Expose a public data-status page so users understand when recommendations are based on stale or incomplete information.

## 20. Delivery sequence

### Milestone 0: repository foundation

- Initialize the pnpm/Turborepo workspace.
- Add strict TypeScript, linting, formatting, testing, and CI.
- Add local PostgreSQL and object-storage development services.
- Define the first extraction manifest and normalized catalog contracts.

Acceptance: clean installation and all checks run from documented root commands.

### Milestone 1: extraction proof of concept

- Build the isolated .NET extractor.
- Read the installed `wow_anniversary` build.
- Extract the minimum recipe tables.
- Apply `DBCache.bin`.
- Emit immutable raw and normalized artifacts.
- Pass the `13486 -> 17563 -> 12808/7080` golden test.

Acceptance: one command produces a validated snapshot and deterministic checksum.

### Milestone 2: Forever catalog and diff

- Run against the first accessible Forever build.
- Diff against the selected pre-Forever baseline.
- Review newly added/modified profession recipes.
- Import the catalog into PostgreSQL.
- Expose item, recipe, and profession read APIs.

Acceptance: every discovered recipe has an explicit extraction status, even when teaching item, output, or availability is unknown.

### Milestone 3: Auction House ingestion

- Define the addon payload.
- Accept idempotent full-scan uploads.
- Store raw payloads and normalized price levels.
- Build current price, depth, freshness, and history APIs.

Acceptance: repeated upload of the same payload does not duplicate market quantity or history.

### Milestone 4: crafting calculator

- Build deterministic crafting graph edges.
- Calculate depth-aware reagent costs and output value.
- Handle AH cut, deposits, cooldowns, and player recipe eligibility.
- Publish explainable opportunity results.

Acceptance: fixture-based calculations agree exactly with hand-calculated scenarios.

### Milestone 5: personalized addon experience

- Import known recipes and optional inventory.
- Filter opportunities to actions the character can perform.
- Add cooldown and capital constraints.
- Provide shopping and crafting plans.

Acceptance: the same market produces different valid plans for characters with different professions and recipes.

### Milestone 6: evidence and probabilistic transformations

- Ingest loot and crafting observations, plus optional disenchant verification outcomes.
- Build source confidence and probability estimates where mechanics are not already static.
- Add build-versioned static craft-and-disenchant and evidence-backed expected farming value.

Acceptance: the UI never displays an estimated probability without sample size and confidence information.

### Milestone 7: forecasts and alerts

- Establish naive and statistical baselines.
- Add walk-forward backtests.
- Publish ranges and confidence rather than guaranteed direction.
- Add opportunity and price-change alerts.

Acceptance: every promoted model beats the configured naive baseline out of sample.

## 21. Immediate first sprint

The first sprint should produce infrastructure, not a visual prototype:

1. Scaffold the monorepo and contracts package.
2. Define `catalog-snapshot-manifest.v1` and normalized recipe schemas.
3. Install and pin the extraction toolchain.
4. Extract the current installed build as the baseline fixture.
5. Prove base-plus-hotfix parsing.
6. Generate and inspect the known recipe graph.
7. Add deterministic golden tests and a build-diff command.
8. Only then scaffold the Next.js catalog pages against real imported data.

Proposed extractor commands:

```text
wow-trader-extractor snapshot \
  --wow-root "/Applications/World of Warcraft" \
  --product wow_anniversary \
  --locale enUS \
  --output ./artifacts

pnpm catalog:validate ./artifacts/<snapshot>/manifest.json
pnpm catalog:diff <baseline-manifest> <forever-manifest>
pnpm catalog:import <forever-manifest>
```

## 22. Explicit non-goals

- Automating gameplay, purchasing, posting, movement, or combat.
- Claiming that a client-side record is currently obtainable without evidence.
- Claiming that an inferred auction disappearance is a confirmed sale.
- Promising future price movement or guaranteed profit.
- Tracking named sellers or exposing player identities.
- Copying AtlasLoot or Auctionator datasets without respecting their licenses.
- Putting binary parsing or build-specific DB2 assumptions into the website.

## 23. Definition of a trustworthy recommendation

A recommendation is publishable only when it identifies:

- The exact game build and recipe version.
- The market and snapshot time.
- The price depth used for every input and output.
- The user's applicable profession/recipe constraints when personalized.
- Fees, deposits, cooldowns, and expected output distributions.
- Expected sale capacity rather than unlimited theoretical volume.
- Data freshness and completeness.
- Confidence and the facts that reduce it.

This traceability is the platform's primary product advantage. The goal is not merely to show that a margin exists; it is to explain whether a particular player can execute it, at what quantity, with how much capital, and with what realistic risk.
