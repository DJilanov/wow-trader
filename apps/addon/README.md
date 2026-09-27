# WoW Trader Collector

Collector `0.10.0` is a market-only addon with two product-specific providers:

- WoW Forever uses Blizzard's native `C_AuctionHouse.ReplicateItems` API. It does not require
  Auctionator.
- TBC Anniversary keeps the previously validated Auctionator full-scan integration.

The addon writes compact, depth-preserving price levels to the account-wide
`WOW_TRADER_SAVED` SavedVariable. It registers no quest, NPC, encounter, combat, loot, health,
vendor, or model events. Existing diagnostic evidence is preserved but remains disabled.

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

The `Market intel` view combines the latest in-game scan with the build-, region-, realm-, and
Auction-House-specific history pack installed by the desktop companion. Search by item name or ID,
star items for the local watchlist, or use `/wowtrader market [item]` and
`/wowtrader watch <itemId>`. Item tooltips show the synchronized signal when the running client
supports the safe tooltip-data hook. Signals remain in `Collecting` until six independent
half-hour observations exist; asking prices are never presented as confirmed sales.

Forever requests one native full snapshot, reads it in bounded per-frame chunks, retries uncached
rows for up to 60 seconds, and saves only after the complete result has been classified. Closing the
Auction House or timing out aborts the attempt without replacing the latest good scan. Blizzard
throttles native replication; the collector enforces a 15-minute local cooldown. TBC's
`/wowtrader scan` delegates to Auctionator and refuses to start unless Auctionator can initiate its
normal full scan.

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
