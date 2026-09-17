# Market workspace and recommendation plan

Last updated: 2026-09-15

## Implementation progress

Phase 1 is implemented against the first live Spineshatter scan. `/` is now the market workbench with
market selection, catalog search, profession and realization-route tabs, profit/ROI sorting, and
expandable calculations. AH output value uses the quantity-weighted p10 ask and requires at least
three supporting listings; inputs consume exact order-book depth. Vendor exit is evaluated
independently from catalog sell prices. Disenchant now uses the build-locked static TBC distribution,
client-extracted item level and Enchanting requirement, and live material quotes. TBC Alchemy
specialization profiles now apply build-specific eligibility and show
base profit separately from provisional mastery expected value. Rows use build-native item icons and
a denser decision table. The legacy `/opportunities` route redirects to the workbench so two
calculation implementations cannot present contradictory rankings.

The collection-automation part of Phase 2 is also implemented. `pnpm dev` supplies the detected WoW
product root and local credentials to a long-running companion watcher. It discovers multiple
account-wide collector files, waits for writes to stabilize, retries failures, and persists uploaded
scan IDs. Stable payload IDs make a crash between API acceptance and local state persistence safe to
replay. Extended scan-source/quality diagnostics remain before community collection is enabled.

Item-media bootstrap is implemented as part of the same command. It queries the published catalog's
distinct `IconFileDataID` values, reads those CASC files by file data ID, decodes BLP1/BLP2, emits
immutable PNGs plus a checksum manifest, and reuses a complete build-specific set on later starts.
For the verified build, 3,163 of 3,165 distinct references decode; the two non-BLP source assets are
recorded as unavailable and render the normal placeholder instead of failing bootstrap.

## Outcome

Replace the current landing-style home page with the primary working surface of WoW Trader: a
searchable, realm-specific profession workspace that ranks what the player can make and the best
realization route for each result:

```text
buy inputs -> craft -> sell on AH
                    -> vendor
                    -> disenchant -> sell/use materials
```

Recommendations must use actionable Auction House depth, not a single minimum price, and must state
what is observed, inferred, or still unknown.

## What the live test proved

The installed TBC client, Auctionator 335, collector, companion, ingestion API, PostgreSQL catalog,
and website now work end to end. The first real EU/Spineshatter Alliance scan contained:

- 12,225 variant-aware market keys.
- 7,050 base item IDs.
- 58,581 unit-price levels.
- 170,028 listings and 1,022,041 listed units.
- Build 69795 and complete catalog compatibility.

This is enough for current order-book costs and quoted one-craft margins. It is not enough for a
normal-price baseline, liquidity, seasonality, or a defensible price forecast.

## Auctionator data-source decision

Auctionator scans inside WoW through Blizzard's permitted Auction House API. On this TBC client it
uses `QueryAuctionItems(..., getAll=true)`, gates the action with `CanSendAuctionQuery()`, and exposes
the completed raw scan through its internal full-scan event.

Auctionator writes its account-wide state to:

```text
WTF/Account/<account>/SavedVariables/Auctionator.lua
```

Its `AUCTIONATOR_PRICE_DATABASE` is database version 8. Realm data is serialized as CBOR on logout.
For each market key it retains:

- `m`: last observed minimum unit price.
- `l`: lowest observed daily minimum.
- `h`: highest observed daily minimum.
- `a`: highest observed daily available quantity.

The configured history retention is 21 days. It does not retain each 30-minute order book or its
price levels. Therefore:

1. The canonical WoW Trader source remains the collector's copy of Auctionator's completed raw scan.
   It preserves exact unit-price depth in `WOW_TRADER_SAVED`.
2. Auctionator's own database may later be imported as optional, explicitly lower-confidence daily
   bootstrap history. It must never drive depth-sensitive crafting costs or be mixed silently with
   full snapshots.
3. The collector currently uses an Auctionator internal event because the supported external API
   exposes only last price and a database-update callback. Pin the tested Auctionator version and run
   a live contract test for every supported addon/client update.

No website or desktop process scans the AH. The player must be in WoW with the Auction House open.
WoW only flushes SavedVariables on `/reload` or logout, so an external companion cannot see a scan
before that flush.

## Collection workflow

### Near-term TBC workflow

1. Player opens the Auction House and starts an Auctionator scan or `/wowtrader scan`.
2. The collector aggregates listings by exact market key and unit price and queues the snapshot.
3. Player runs `/reload` or logs out.
4. Companion discovers every account-wide `WowTraderCollector.lua`, waits until the file size and
   modification time are stable, parses it without executing Lua, and uploads unseen scan IDs.
5. The API archives the immutable payload, deduplicates it, stores price levels, refreshes summaries,
   and recomputes affected opportunities.

`companion discover` and `companion watch` commands are implemented so users do not provide account
paths or API commands manually. Watch mode cannot remove the required WoW flush; it automates
everything after the file becomes visible.

### Automatic character-scan watcher contract

The supported end-user installation must keep the companion watcher running in the background. It
discovers every account-wide collector file under each configured WoW product and treats the
collector's immutable scan IDs—not a raw modification timestamp—as the source of truth.

For a scan performed on any character:

1. The collector records the originating character/profile key, realm, faction, client build,
   Auctionator version, scan ID, completion time, and quality counters with the completed scan.
2. WoW flushes the account-wide file after `/reload` or logout. The addon should make this required
   final step obvious when a completed scan is still only in memory.
3. The watcher waits for size and modification time to remain stable across consecutive polls,
   parses the file without executing Lua, and compares contained scan IDs/profile revisions with its
   durable local state.
4. Every unseen scan is uploaded through the authenticated ingestion API with bounded exponential
   retry. Duplicate filesystem events, restarts, and uncertain HTTP outcomes are safe because the
   payload ID, scan ID, checksum, and server uniqueness constraints are idempotent.
5. The ingestion transaction archives the raw evidence, normalizes the new market depth, updates the
   per-market latest-scan pointer, builds summary observations, invalidates/recomputes opportunity
   caches, and records a processed or rejected receipt. The companion never receives database
   credentials and never writes directly to PostgreSQL.
6. The website observes the new processed scan automatically through short status polling initially
   and server-sent events later. Market freshness, scan history, and recommendations update without
   a manual upload command or page reload.
7. The tray/status UI shows `waiting for WoW flush`, `uploading`, `processing`, `up to date`, or an
   actionable error, plus the private originating character and market. Character identity is used
   only for the player's account profile and is never included in public market responses.

Acceptance: perform a scan on either of two characters, run `/reload`, and observe exactly one new
database scan and refreshed Trader recommendations without entering a path, starting a command, or
refreshing the browser. Repeat notifications and companion/server restarts must not create a second
scan; a rejected payload must remain retryable only after the underlying problem changes.

Implemented watcher foundation (2026-09-16): collector `0.2.0` records optional character
provenance while remaining compatible with older version-1 SavedVariables; the API stores that
identity only on the private raw upload; the companion waits for `processed`, retries with a
5-second-to-5-minute bounded exponential schedule, and supports a protected API-key file; the
macOS LaunchAgent installer keeps it running without `pnpm dev`; and the Trader polls a lightweight
per-market status endpoint and refreshes itself after a newer processed scan. The remaining watcher
work is a packaged tray/status UI, multiple configured product roots in one process, and the summary/
opportunity-cache job described below. The database still normalizes full depth synchronously.

Auctionator's legacy scanner is server-gated and presents a 15-minute cooldown. A 30-minute target is
reasonable while a player is online and opening the AH, but cannot be guaranteed for an offline
realm. Long-term coverage comes from multiple opted-in collectors. Separate collector observations;
never sum two users' snapshots as though they were one larger order book.

### Scan-quality metadata

Extend uploads with:

- Auctionator version and AH API flavor.
- Returned listing count and invalid/skipped row count.
- Scan duration.
- Collector schema version.
- File flush time as distinct from in-game completion time.

Mark stale, incomplete, build-mismatched, and structurally abnormal scans before they can refresh the
current market view.

## Primary product experience

### Home page

The home page becomes a compact market search workspace, not a marketing page.

Top controls:

- One large item/recipe/ID search box.
- Market selector: region, realm, faction/neutral AH.
- Scan freshness and data-quality indicator.
- Optional character selector once known-recipe collection exists.

Profession tabs:

```text
All | Alchemy | Blacksmithing | Enchanting | Engineering | Leatherworking
    | Tailoring | Cooking | First Aid | Mining
```

Only professions present in the published build are shown. The selected tab is encoded in the URL,
so results are linkable and browser navigation works.

Result filters:

- Best route, AH, disenchant, or vendor.
- Known recipes only, when character data exists.
- Minimum profit and ROI.
- Available capital.
- Required skill and cooldown use.
- Data confidence and scan freshness.
- Sort by recommended total profit, profit per craft, ROI, or confidence.

### Opportunity row

Each row answers a decision rather than showing raw catalog metadata:

- What to craft and how many.
- Best route: AH, vendor, or disenchant.
- Reagent acquisition cost at the consumed price levels.
- Expected take-home value and every fee.
- Profit per craft, recommended total profit, ROI, and required capital.
- Output discount/premium versus its normal range.
- Depth/liquidity and confidence.
- Recipe ownership, skill, cooldown, phase, or evidence limitation.

Expanding a row shows the exact reagent levels consumed, output valuation, alternative routes, scan
ID/time, catalog build, and reasons a seemingly higher margin was rejected.

### Honest empty states

- No scan: show how to collect one.
- Stale scan: show catalog data but suppress actionable ranking.
- One or too few scans: show current quoted margins but no normal-price signal.
- Missing disenchant bracket or material quote: disable that route with the reason, not a zero value.
- Unknown recipe ownership: show `eligibility unknown`, not `you can craft this`.

## Valuation model

### Profession specialization

Specialization is a player profile layered over the immutable recipe graph, not a mutation of base
catalog quantities. The current TBC model recognizes client spell IDs `28672` (Transmutation
Master), `28675` (Potion Master), and `28677` (Elixir Master). It classifies transmutations by the
normalized conversion topology and Potion/Elixir/Flask recipes by output item class/subclass.

The client proves those abilities and eligible recipe shapes, but it does not contain the
server-side proc distribution. Build `wow_anniversary:69795` therefore uses an explicitly versioned
provisional model of `1.20×` expected output with a possible `1–5×` craft result. Every affected row
shows expected yield, mastery uplift, base profit, model version, and this evidence limitation.
Before replacing the assumption, collect build/specialization/recipe/output quantities from
consenting characters and require a minimum sample plus confidence interval. Forever receives a new
versioned definition after its own client and observed behavior are validated; it must not inherit
the TBC model implicitly.

The profile now also covers the build-locked TBC Blacksmithing, Engineering, Leatherworking, and
Tailoring branches. Specialist-only recipes are removed unless the matching branch is selected.
Tailoring specialists receive the guaranteed double output on their matching specialty cloth;
Alchemy mastery remains provisional expected value. Selecting `All branches` means multiple
specialist alts, not that one character can hold incompatible branches.

### Account crafting network

The `Use alt-crafted materials` option evaluates recipe inputs through the account-wide deterministic
production graph. For each intermediate it compares an exact-depth AH purchase with eligible recipe
chains, aggregates shared raw-leaf demand before pricing, rounds integer craft batches upward, and
shows leftovers and cross-profession transfers. Internal materials retain their raw acquisition cost
and do not pay an AH fee. Time-gated crafts are excluded unconditionally, and mastery expected procs,
random-output recipes, Prospecting, and disenchant outputs cannot promise downstream quantities.

The detailed implementation and Forever migration checklist are in
`docs/account-crafting-network.md`.

### Inputs

For quantity `q`, consume the actual cheapest price levels until `q` is filled. If depth is
insufficient, the candidate is not viable at that quantity. Do not multiply the minimum listing by
the requested quantity.

Vendor purchase prices are usable only when a vendor source and availability are established. An
`ItemSparse.BuyPrice` value alone does not prove the item is currently sold by a reachable vendor.

### AH output route

AH listings are asks, not confirmed sales. Keep these distinct:

- `bestAsk`: current minimum; useful but easy to manipulate.
- `p10Ask`: quantity-weighted tenth-percentile price; the initial robust current-market anchor.
- `normalAsk`: rolling median of historical `p10Ask` values.
- `expectedSalePrice`: conservative value constrained by current robust depth, historical range,
  freshness, and eventual fill-rate evidence.

AH value subtracts the correct faction or neutral cut, listing deposit, expected lost deposits, and
cooldown opportunity cost. Until sale evidence exists, call this a quoted margin and use a
conservative fill-rate assumption rather than presenting guaranteed profit.

### Vendor route

Vendor value is deterministic when the output has a positive catalog sell price:

```text
vendor profit = expected output quantity * vendor sell price - acquisition and fixed costs
```

It has no AH cut, deposit, or market-demand requirement. It can immediately become the first fully
supported alternative route.

### Disenchant route

The implemented `tbc-disenchant-table-v1` model is selected by build, item class (armor/weapon),
quality, and actual item level. The client-extracted `ItemDisenchantLoot` table supplies eligibility
and required Enchanting skill. The static TBC reference distribution supplies exact material item
IDs, quantities, and probabilities; weapon and armor probabilities remain distinct. All expected
quantities are stored as rational numbers.

```text
crafted output × static expected material yield × robust live material ask
  - faction/neutral AH cut - reagent acquisition cost
```

Every possible material must exist in the matching build and have at least three current listings.
Otherwise the whole route is suppressed; a missing low-probability crystal cannot silently become a
zero-value outcome. The UI shows actual item level, required Enchanting skill, model version, and the
ask-price boundary. Character skill is not collected yet, so the requirement is informative rather
than a personalized eligibility check. Observed outcomes may later audit the reference table, but
they are not needed to invent or learn a distribution that is already static.

### Choosing the route and quantity

Evaluate AH, vendor, and disenchant independently for craft counts from one up to a safe bound. The
bound includes reagent depth, capital, cooldown capacity, output-market capacity, and character
eligibility. Select the route/count with the highest positive risk-adjusted total profit.

Until demand history exists, rank one-craft current quotes and do not invent a recommended bulk
quantity. Vendor routes can use reagent/capital capacity immediately because their output has no
market fill constraint.

## Normal-price and buy/sell signals

### Stored observations

Derive one summary per scan and exact market key:

- Best ask and quantity at best ask.
- Quantity-weighted p10, median, and p90 asks.
- Total quantity/listings and quantities within 5%/10% of best ask.
- VWAP for configured actionable quantities.
- Scan completeness, collector, and build.

Retain full 30-minute levels for at least 180 days, hourly aggregates after that, and daily aggregates
indefinitely. A daily aggregate records ask OHLC, robust percentiles, supply, scan count, and coverage.

### Baseline

Start with transparent statistics:

- Rolling 24-hour, 7-day, and 28-day median of `p10Ask`.
- Median absolute deviation (MAD) for robust volatility.
- Rolling supply median/MAD.
- EWMA for recent price and supply level.
- Hour-of-week seasonality only after at least four weeks of adequately covered observations.

An expansion or phase launch is a regime change. Reset or sharply down-weight the old regime instead
of treating pre-launch history as directly comparable.

### Signal semantics

Calculate deviation and robust z-score from the appropriate baseline:

```text
deviation = (current p10 ask - baseline median) / baseline median
robust z  = 0.6745 * (current p10 ask - baseline median) / MAD
```

Use minimum percentage thresholds when MAD is zero or unrealistically small. Require enough samples,
coverage, freshness, and meaningful quantity before labeling an item.

- `discounted`: materially below its normal ask range with purchasable depth.
- `normal`: within the normal range.
- `elevated asks`: materially above normal.
- `insufficient data`: no defensible label.

Do not translate `elevated asks` directly into `sell now`: high asks may be caused by missing supply
and no buyers. A buy recommendation additionally requires post-fee upside, adequate liquidity, and a
safe exit quantity. A sell recommendation requires owned inventory or a profitable production path.

Auction disappearance is inferred churn, not a confirmed sale. Track it separately. Confirmed
personal sales can later be collected from player-owned auction/mail events and used to calibrate
fill rates without exposing character identity.

### Confidence

Expose a reasoned confidence score built from:

- Observation count and time coverage.
- Scan freshness/completeness.
- Market depth and number of independent listings.
- Price stability and outlier sensitivity.
- Inferred liquidity or confirmed sale evidence.
- Catalog, availability, static-table applicability, and market-evidence confidence.

The UI must show the limiting factor, such as `only 3 scans`, `one listing at this price`, or
`static TBC table · Enchanting 275`.

## Storage and computation additions

Add narrowly scoped tables rather than recalculating all history on every page request:

### `market_observation_summary`

Primary key `(scan_id, market_key)`. Stores the per-scan metrics above and keeps `item_id` for joins.

### `market_interval_aggregate`

Primary key `(market, market_key, resolution, interval_start)`. Stores hourly/daily ask and supply
statistics, observation count, and coverage.

### `market_baseline`

Primary key `(market, market_key, horizon, as_of)`. Stores median, MAD, EWMA, expected supply, sample
count, and confidence inputs.

### `market_signal`

Stores the current label, deviation, robust z-score, quantity supporting the signal, confidence,
model version, generation time, and expiry.

### `disenchant_observation` and `disenchant_distribution`

The TBC reference distribution currently lives as reviewed, tested, build-locked code. If personal
outcome collection is added, preserve raw outcomes separately so it can audit a model version without
silently rewriting that version's probabilities.

### `opportunity_snapshot`

Stores reproducible ranked results by scan/build/profession/recipe/route/model version. Include all
cost/value components and limitation codes. Initially compute only affected recipes after each scan;
a changed reagent invalidates recipes consuming it and downstream transformations.

## API/query surface

Provide a single typed workspace query rather than making the page assemble thousands of recipes:

```text
GET /v1/markets/{region}/{realm}/{house}/workspace
  ?profession=alchemy
  &route=best
  &q=transmute
  &sort=total-profit
  &cursor=...
```

The response contains market/build provenance, freshness, profession tabs with counts, filter
metadata, paginated opportunity rows, and limitation codes. Item history and calculation-breakdown
endpoints remain separately addressable for expanded rows.

## Implementation order

### Phase 1: usable current-market workspace

- Redesign `/` around market selection, search, profession tabs, and the ranked table.
- Add profession/route/search/sort query parameters.
- Extract opportunity querying from the Next.js page into a tested domain/query service.
- Add vendor realization and compare it with the existing AH route.
- Use full reagent depth and show one-craft quotes, fees, freshness, and limitations.
- Add the static TBC disenchant route and suppress incomplete material valuations.

Acceptance: the live Spineshatter scan produces stable profession-filtered AH/vendor rankings; every
number expands to its scan, price levels, build, and formula.

### Phase 2: collection without manual filesystem commands

- Add companion SavedVariables auto-discovery and watch/upload mode.
- Promote watch mode into an installable login-started background service/tray application with
  per-character provenance, durable status, automatic API processing confirmation, and website
  refresh signaling.
- Add scan-source/quality metadata and diagnostics.
- Test multiple accounts, truncated writes, unchanged files, retries, and server duplicates.

Acceptance: after `/reload` on any character, a new scan updates PostgreSQL and appears on the
website without a path, upload command, or browser refresh and cannot be duplicated.

### Phase 3: history and anomaly labels

- Populate per-scan summaries on ingestion.
- Add hourly/daily compaction and retention jobs.
- Implement 24-hour/7-day/28-day robust baselines and discounted/elevated labels.
- Add item price/supply history charts and data-coverage display.

Acceptance: synthetic manipulation, missing scans, stale scans, and isolated one-copper listings do
not produce confident buy/sell labels.

### Phase 4: quantities, liquidity, and backtesting

- Add inferred listing churn and optional confirmed personal sales.
- Search bounded craft quantities using capital, reagent depth, cooldowns, and conservative demand.
- Walk-forward backtest every promoted signal against naive last-price and rolling-median baselines.

Acceptance: recommendations name an exact quantity, and promoted signals improve out-of-sample
decision profit after fees rather than only fitting historical prices.

### Phase 5: personalization and calibration

- Normalize item level and disenchant eligibility. (Complete for TBC.)
- Apply the versioned static TBC distribution and enable craft-to-disenchant. (Complete.)
- Optionally collect outcomes to audit the static model.
- Collect known recipes, skills, cooldown state, inventory, and optional capital.
- Enable personalized `what can I do now?` filtering.

Acceptance: the same realm produces different valid plans for different characters, and no
disenchant result is shown outside a supported build/bracket or without complete material prices.

## Immediate next slice

Phase 1, build-native item media, TBC static disenchanting, TBC Alchemy specialization modeling, and
the local collection-automation portion of Phase 2 are complete. Continue collecting real scans, add
mastery craft-outcome collection plus the remaining source/quality metadata before community
ingestion, and then implement Phase 3 against observed history. The history-dependent UI remains
explicitly unavailable until its sample requirements are met.
