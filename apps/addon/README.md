# WoW Trader Collector

The collector has two independent roles:

- When Auctionator is installed, it listens for full-scan completion and writes compact,
  depth-preserving price levels to the account-wide `WOW_TRADER_SAVED` SavedVariable.
- On the Forever Beta build, it can record opt-in encounter, NPC-location, and loot-source
  diagnostics, run a bounded 100-ID quest API capability sample, and resolve a reviewed boss-ID
  sample through the client model widget without entering an instance.

It never performs HTTP requests and does not bypass Blizzard's auction-query permission checks.

Copy `WowTraderCollector` into the TBC client's `Interface/AddOns` directory. At the Auction House,
run a normal Auctionator full scan or use `/wowtrader scan`. The slash command delegates to
Auctionator's scanner and refuses to start unless its normal permission check succeeds.

After a completed scan, log out or run `/reload` so WoW flushes SavedVariables. The companion reads:

```text
WTF/Account/<account>/SavedVariables/WowTraderCollector.lua
```

The queue retains the latest eight scans. New scans include the originating character name, realm,
faction, and GUID so a future private account profile can attribute professions correctly. That
identity is stored only with the protected raw upload and is not exposed in public market responses.
The companion tracks uploaded scan IDs without mutating the game file. Forever diagnostics remain
local until their upload contract and privacy boundary have been reviewed.

## Forever diagnostics

The diagnostics are local SavedVariables evidence. The current companion deliberately ignores the
diagnostic section until its production upload contract is reviewed.

```text
/wowtrader diagnostics on
/wowtrader diagnostics off
/wowtrader diagnostics status
/wowtrader questsample start
/wowtrader questsample pause
/wowtrader questsample resume
/wowtrader questsample status
/wowtrader questsample reset
/wowtrader bossmodels controls
/wowtrader bossmodels start
/wowtrader bossmodels pause
/wowtrader bossmodels resume
/wowtrader bossmodels status
/wowtrader bossmodels reset
```

Encounter diagnostics record encounter identity, end-of-encounter creature IDs, player location at
start/end, and `ENCOUNTER_LOOT_RECEIVED` observations. This does not establish an official drop rate.

While diagnostics are enabled, targeting, mousing over, or seeing an NPC nameplate records the
client creature ID and the best position exposed by the API. `unit_position` is the subject's world
position; `observer_position` is only the player's location at the time of the sighting and must be
treated as approximate. Player units are never recorded. Repeated sightings are deduplicated into
small coordinate cells across reloads and the log retains at most 5,000 records.

Raw `UnitPosition` returns are stored as `positionX`, `positionY`, and `positionZ` with
`coordinateSystem = unit_position_api`. Consumers must apply the build-validated WoW/UI-map axis
adapter; they must not assume those raw values are already browser-map X/Y.

When the client exposes Blizzard's `ClosestUnitPosition`, the collector also retains its raw
`xPos`, `yPos`, and distance result as `closest_unit_position_api_unverified`. That evidence must pass
an in-game coordinate golden before it is promoted to an exact map pin; unsupported clients simply
omit it.

Opening loot records item IDs and the source GUID/type/ID returned for each loot slot. This supports
reviewable item-to-NPC or item-to-object source evidence even when the static tables do not identify
the drop. Unknown sources stay marked `unknown`; observations are evidence of a drop, not a drop-rate
claim. The loot log also retains at most 5,000 records.

The quest sample is pinned to client build `69893`, requests one ID every 1.5 seconds, pauses in
combat, times out individual requests after eight seconds, and never starts automatically. Its 100
IDs include every statically mapped/line-linked Beta quest, stratified old and high-ID records, and
five deliberately absent controls. Regenerate the sample before using it on a different build.

Run `bossmodels controls` first. It queries a common creature, Onyxia, one new criteria-backed boss,
and one deliberately invalid ID. If the valid controls resolve and the invalid control does not,
`bossmodels start` queries the 30 reviewed build-69893 boss creature IDs three times each. Every
result stores the requested creature ID, resolved display ID and model FileDataID, client build,
attempt number, status, and timestamp. The resolver never starts automatically, refuses a different
client build, and must be started outside combat. `controls` and `reset` clear earlier model results;
`start` keeps the control evidence, while `pause`/`resume` preserve the cursor. A successful model
result proves that this client can resolve an asset for the requested ID; it does not prove that the
boss is live, spawned, or uses that form in every encounter phase.
