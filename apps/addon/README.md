# WoW Trader Collector

Collector `0.13.0` captures market snapshots plus private character crafting state. Its market
scanner has two product-specific providers:

- WoW Forever uses Blizzard's native `C_AuctionHouse.ReplicateItems` API. It does not require
  Auctionator.
- TBC Anniversary keeps the previously validated Auctionator full-scan integration.

The addon writes compact, depth-preserving price levels and the latest profession snapshot per
character to the account-wide `WOW_TRADER_SAVED` SavedVariable. Bounded world-evidence collection
is installed but disabled by default. It does not register combat automation, issue actions, or send
network requests.

Profession snapshots are captured automatically on login, skill changes, profession-window updates,
inventory changes, bank access, and money changes. Open each profession window at least once so the
snapshot can distinguish a complete known-recipe list from a character-sheet-only profession. Use
`/wowtrader professions` to capture and print the current totals. Bag inventory is always included;
bank inventory is included only while the bank is open and is labeled with an explicit scope.

The addon never performs HTTP requests and does not bypass Blizzard's auction-query permission or
throttle checks. Copy `WowTraderCollector` into the supported client's `Interface/AddOns`
directory. Open the Auction House and run:

```text
/wowtrader probe
/wowtrader scan
/wowtrader status
```

`/wowtrader` or `/wowtrader ui` opens the in-game scanner console. The console presents provider,
Auction House, throttle, cooldown, progress, row-quality, and recent-scan information and exposes
buttons for Scan, Cancel, Probe, and Save & Reload. A movable coin icon on the minimap toggles the
console from anywhere. Left-click opens or closes it, dragging repositions it, and right-click hides
it. Run `/wowtrader minimap` to restore a hidden icon. A small `WoW Trader` launcher is also shown
beside the Auction House while it is open.

The `Market intel` view combines current price depth with the build-, region-, realm-, and
Auction-House-specific history pack installed by the desktop companion. Search by item name or ID,
filter buying opportunities or watched items, set a per-item gold budget and quantity limit, and
page through all results. Use `/wowtrader market [item]` or `/wowtrader watch <itemId>`.
Item tooltips show the same guidance when the client supports the safe tooltip-data hook.

Local scans immediately recalculate the price, supply, signal and buying plan. Queued scans also
work without a downloaded history pack. A newer shared scan takes precedence over an older local
book; a newer local scan takes precedence over the shared book. Missing items in the selected latest
scan, other realms/builds and stale scans cannot produce a buying recommendation.

The website and addon use one seven-day, 336-observation policy. Six independent half-hour buckets
are required. Buying plans use the lower normal-price band as the target, subtract the 5% faction
or 15% neutral AH cut, require a 15% discount and 20% return, and cap quantity at 10% of normal listed
supply and 100 units. Plans show buy ceilings, quantities, cost, fees and conditional profit before
deposits. Falling, inflated, oversupplied and thin markets are excluded. These are asking-price
observations; they do not prove demand, completed sales or a future price recovery.

See [`docs/trader-buy-opportunities.md`](../../docs/trader-buy-opportunities.md) for the full policy,
patch-history review command and JavaScript/Lua checks.

Forever requests one native full snapshot, reads it in bounded per-frame chunks, retries uncached
rows for up to 60 seconds, and saves only after the complete result has been classified. Closing the
Auction House or timing out aborts the attempt without replacing the latest good scan. Blizzard
throttles native replication; the collector enforces a 15-minute local cooldown. TBC's
`/wowtrader scan` delegates to Auctionator and refuses to start unless Auctionator can initiate its
normal full scan.

## Opt-in world evidence

Use world evidence only while intentionally validating acquisition data:

```text
/wowtrader evidence on
/wowtrader evidence status
/wowtrader evidence off
```

While enabled, the addon records bounded NPC sightings, loot windows, quest dialogs and rewards,
merchant inventories, and trainer services. Every loot item points to a loot-session record, so the
backend can count eligible captured windows instead of treating item sightings as a fabricated drop
rate. Trainer rows record whether all available, unavailable, and already-known filters were visible;
partial trainer lists remain labeled as partial. `/wowtrader evidence clear` removes stored world
evidence without deleting market or profession snapshots.

The evidence collector is observational: it never targets, buys, accepts, turns in, loots, moves, or
casts for the player. Disable it after the validation session, then run `/reload` or log out before
the companion reads the SavedVariables file.

After a completed scan, log out or run `/reload` so WoW flushes SavedVariables. The companion reads:

```text
WTF/Account/<account>/SavedVariables/WowTraderCollector.lua
```

After an upload, the companion writes the matching generated history pack to
`Interface/AddOns/WowTraderCollector/MarketData.lua`. Run `/reload` once more to activate the new
in-game signals. The pack is rejected in game if its product, build, region, realm, or Auction House
does not match the current character.

The queue retains the latest eight scans. Each scan records provider, build, market scope, row
accounting, completeness, duration, and originating character. The companion validates this data,
uploads it idempotently, and keeps character identity inside the protected raw upload. The public
market responses do not expose that identity.

## KFC Forever Guides evidence addon

`apps/addon/KFCForeverGuides` is a separate RestedXP-compatible review addon. Its observers are
passive and opt-in: reward turn-ins, kill-XP context, adaptive-grind measurements and structured
quest-validation sessions. `QuestObserver.lua` records only public quest-log, party, target, gossip
and location state after `/kfcguide validate <quest-id> <kind>`; it never performs the quest action.
Raw account SavedVariables remain private and every offline export requires explicit approval.

Maintainer workflows are documented in
[`docs/forever-leveling-addon-review.md`](../../docs/forever-leveling-addon-review.md),
[`docs/forever-leveling-reward-evidence.md`](../../docs/forever-leveling-reward-evidence.md),
[`docs/forever-leveling-grind-evidence.md`](../../docs/forever-leveling-grind-evidence.md), and
[`docs/forever-leveling-quest-validation.md`](../../docs/forever-leveling-quest-validation.md).
