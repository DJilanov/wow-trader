# Forever native Auction House scanner plan

## Decision

Build a clean-room Forever scanner directly on Blizzard's addon API and keep the existing
SavedVariables, companion, ingestion, PostgreSQL, and Trader pipeline. Do not copy, adapt, or vendor
Auctionator source. Its distributed code is All Rights Reserved, and the installed package contains
an explicit instruction forbidding its use as an implementation reference.

This is not blocked on an external auction addon. The Forever `1.60.1` API exposes the replication
surface intended for a complete Auction House snapshot:

- `C_AuctionHouse.ReplicateItems()` requests the complete listing set.
- `REPLICATE_ITEM_LIST_UPDATE` signals the initial response and later item-cache updates.
- `C_AuctionHouse.GetNumReplicateItems()` returns the result count.
- `C_AuctionHouse.GetReplicateItemInfo(index)` returns listing fields for zero-based indices.
- `C_AuctionHouse.GetReplicateItemLink(index)` returns the item hyperlink when cached.

The replication call is account-throttled to approximately 15 minutes. A 30-minute collection
target is therefore technically compatible while the player is online at an open Auction House.
It is not an unattended external scan: an addon cannot scan while the client is offline or away from
the Auction House, and the companion cannot read new SavedVariables until logout or `/reload`.

Auctionator `339` is also currently published with an official Forever flavor. That is a useful
short-term integration test, but the native provider remains the recommended product architecture
because it removes an internal-event dependency and gives WoW Trader ownership of quality metrics.

## Target flow

```text
Player opens Auction House
        |
        v
WoW Trader button or /wowtrader scan
        |
        v
Blizzard ReplicateItems request -> throttled response event
        |
        v
Chunked listing reader -> deferred cache retry -> price-level aggregation
        |
        v
Atomic validated scan in WOW_TRADER_SAVED
        |
        v
Explicit /reload or logout -> companion watcher -> ingestion -> PostgreSQL -> Trader
```

The collector must never save or upload a half-built scan as a completed snapshot.

## Phase 0 — runtime capability probe

Add a read-only `/wowtrader probe` command before issuing any market request. It records and prints
only capability names, build metadata, and safe scalar types—never function bodies or secret values.

Probe the exact Forever build for:

- `C_AuctionHouse` and every replication function listed above;
- `AUCTION_HOUSE_SHOW`, `AUCTION_HOUSE_CLOSED`, `AUCTION_HOUSE_DISABLED`,
  `REPLICATE_ITEM_LIST_UPDATE`, and throttled-message events;
- `C_AuctionHouse.IsThrottledMessageSystemReady()` availability;
- auction-house faction/scope APIs and the realm identity exposed in this game mode;
- secret/inaccessible values returned by the Beta client.

The first live scan is itself the final capability proof. Persist its provider and API flavor so a
later client update cannot silently switch behavior.

If replication is absent, stop and add a separately tested legacy adapter only if the client exposes
`QueryAuctionItems`, `CanSendAuctionQuery`, `GetNumAuctionItems`, `GetAuctionItemInfo`, and
`GetAuctionItemLink`. Do not guess signatures based only on the interface number.

## Phase 1 — native Forever scan state machine

Implement a provider owned by the collector with explicit states:

```text
idle -> awaiting_response -> reading -> resolving_cache -> complete
                             |             |
                             +-----------> failed/aborted
```

Rules:

1. Start only from the user's command/button while the Auction House is open, outside combat, with
   every required API callable and the throttled-message system ready.
2. Call `ReplicateItems` once. Never retry it on a timer; an early retry spends or collides with the
   account-wide throttle.
3. Treat the first replication update as the result boundary. Capture the reported listing count and
   process indices from `0` through `count - 1`.
4. Read a bounded chunk per frame, initially 250 listings, and adapt downward if processing exceeds
   an 8 ms frame budget. Do not request tens of thousands of item rows in one frame.
5. Aggregate resolved rows immediately. Put `hasAllInfo = false` rows into a deferred index set.
   A missing link is allowed when the item ID and pricing fields are validated; secret or malformed
   scalar values are classified separately and never persisted as listings.
6. Revisit only deferred indices on subsequent replication/item-cache updates. Finish after all are
   resolved or after a bounded 60-second resolution window.
7. Abort cleanly on Auction House close, disable event, logout, a contradictory result count, or
   timeout. An aborted scan must not enter the completed queue.
8. Save exactly once after validation, then display the accepted, unresolved, invalid, and no-buyout
   row counts plus the `/reload` instruction.

All Blizzard values cross a defensive boundary: `pcall`, secret-value/accessibility checks, explicit
type/range validation, and no arithmetic or comparison before validation.

## Phase 2 — listing normalization

For every resolved listing retain only the fields needed for price depth:

- item ID;
- hyperlink when available;
- stack quantity;
- stack buyout price;
- derived unit buyout price;
- a versioned market key.

Seller, bidder, and character names are unnecessary and must not be retained.

The initial Forever market key should be the base item ID for ordinary items because the current
Trader deliberately resolves catalog prices by `String(itemId)`. Preserve the item link as evidence.
Before supporting randomized equipment as separate markets, define and test a v2 key built from the
Blizzard item key fields (`itemID`, `itemLevel`, `itemSuffix`, and battle-pet species) and teach every
website query to select it intentionally. Do not silently introduce variant keys that the current
profit calculator ignores.

A public build-69913 Beta report says Auction House listings stripped random-roll bonus IDs and made
those variants indistinguishable. Treat that as an unresolved client defect, not a field we can
reconstruct. The build-70009 golden must establish what the API actually returns; otherwise variant
equipment remains base-item pricing with an explicit limitation.

Group accepted listings by market key and unit price:

```text
unitPriceCopper = ceil(stackBuyoutCopper / stackQuantity)
quantity        = sum(stackQuantity)
listingCount    = count(listings)
```

Rows with no buyout are valid observations but do not contribute to immediate-purchase valuation.
Track them separately; do not count them as unresolved. A live golden test must compare at least 20
listings, including stacked reagents and single equipment, against the Blizzard UI to prove whether
the replication buyout is a stack total on this build.

## Phase 3 — quality and contract evolution

Keep `auction-scan.v1` backward compatible by adding optional evidence fields to the collector,
companion, and upload contract:

- `provider`: `blizzard_replicate`, `blizzard_legacy_getall`, or `auctionator`;
- `apiFlavor` and exact client build;
- reported, visited, priced, no-buyout, unresolved, invalid, and secret row counts;
- total scan duration;
- market-key version;
- whether the Auction House remained open for the entire scan.

Allow `itemLink` to be null at the collector boundary when a validated item ID and price are present;
the website already owns catalog names and the public upload contract supports nullable links.

Calculate completeness from structurally unreadable/unresolved rows, not from bid-only rows:

```text
completeness = (reportedRows - unresolvedRows - invalidRows - secretRows) / reportedRows
```

An empty result is rejected because it cannot distinguish an actually empty market from a throttled
or transient response. The ingestion service must archive every valid payload but must not promote
a scan to the current market view when it is incomplete, suspiciously smaller than the
recent baseline, or missing mandatory quality counters. Add provider/count/duration columns to
`raw_upload`/`market_scan` or a JSON evidence column plus indexed promotion fields.

## Phase 4 — addon and companion UX

The command surface is `/wowtrader probe`, `/wowtrader scan`, `/wowtrader status`, and
`/wowtrader cancel`. The independent WoW Trader panel is shown beside—not hooked into—the Blizzard
Auction House and must expose:

- Ready / cooldown / scanning / resolving / saved / failed state;
- progress as visited rows over reported rows;
- last successful scan age and provider;
- a Scan button that is disabled when prerequisites are false;
- an explicit `Save & Reload` button after completion, with confirmation.

Do not hook or replace protected Blizzard functions. The panel owns its frame and responds to public
events. The desktop companion must show “Native scanner ready” for Forever and require Auctionator
only for the still-dependent TBC provider. Replace the current global `auctionatorInstalled` health
assumption with a product-specific `scanProvider`/`scannerHealth` status.

## Phase 5 — test and release gates

Automated checks:

- Lua 5.1 syntax parse and TOC/manifest checksum verification;
- no Auctionator global or optional dependency in the Forever-native path;
- pure aggregation fixtures for invalid rows, stacks, duplicate price levels, bid-only rows,
  inaccessible values, and item-cache retries;
- SavedVariables parser compatibility with old scans and the new optional quality fields;
- upload/checksum/idempotency tests;
- ingestion tests proving incomplete scans are archived but not promoted;
- desktop tests proving Forever no longer reports Auctionator as a missing dependency.

Live build-70009 gates with Auctionator absent:

1. `/wowtrader probe` reports the replication API without a Lua or blocked-action error.
2. Opening the Auction House and starting one scan produces exactly one completed snapshot.
3. The UI remains responsive during a large scan; no processing frame exceeds the chosen budget in
   sampled diagnostics.
4. The row count is stable, deferred rows converge, and 20 golden listings match Blizzard's UI.
5. Calling scan again during the throttle fails visibly and does not create an empty snapshot.
6. Closing the Auction House mid-scan aborts without replacing the latest good scan.
7. `/reload` writes a parseable file; the watcher uploads it once; production stores the provider and
   quality evidence; Trader prices use the new scan.
8. Two successive scans roughly 30 minutes apart establish that throttle recovery and price history
   work on the real realm.

Only after these gates pass should native scanning become the default Forever collector. Keep TBC on
its currently validated provider until a separate legacy clean-room adapter passes the same tests.

## Implementation status — collector 0.9.1

The clean-room provider, capability probe, command UX, chunked zero-based reader, cache retry,
defensive secret-value boundary, atomic save, quality evidence contract, PostgreSQL migration,
promotion gate, accepted-scan website filters, and product-aware desktop health are implemented.
The desktop installer packages only the two-file market collector and verifies both files by SHA-256.
TBC continues to use Auctionator; Forever selects the native provider on the 1.60 client.

The Dungeon Journal-inspired in-game console exposes live provider/Auction House/throttle health,
cooldown, scan progress, quality counters, six recent scans, and buttons for Scan, Cancel, Probe, and
Save & Reload. It opens through `/wowtrader`, `/wowtrader ui`, or the Auction House launcher.

The remaining release gate is live validation against build 70009 with Auctionator absent. The
native scan must not be treated as production-proven until the panel, one full scan, its
SavedVariables upload, and UI price comparison pass the live checklist above.

## Expected effort and limits

The native Forever provider is a moderate change: the core scanner and in-game validation are the
main work; the existing upload and pricing pipeline is reusable. The likely implementation is one to
two focused development days plus live throttle windows for verification, followed by contract,
quality-gate, and desktop polish.

It will provide complete visible listing snapshots and price depth. It cannot provide actual sale
prices, offline scans, guaranteed exact 30-minute timing, or immediate disk visibility without a
player-approved reload/logout. Those are Blizzard/client boundaries, not missing implementation.
