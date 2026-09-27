# Forever world extraction and observation runbook

Last verified: 2026-09-18 against `wow_classic_beta` `1.60.1.69913`.

## One-command development

Run:

```bash
pnpm dev
```

The existing bootstrap still prepares the application and TBC catalog. When it finds
`wow_classic_beta`, it also resolves the active build, reuses or runs the Forever world extractor,
audits all normalized records and decoded map tiles, and gives Next.js absolute snapshot/media
paths. A machine without the beta client logs a skip instead of breaking TBC development.

The optional inputs are documented in `.env.example`:

```text
FOREVER_WORLD_PRODUCT=wow_classic_beta
FOREVER_WORLD_LOCALE=enUS
FOREVER_WORLD_WOW_ROOT=/Applications/World of Warcraft
FOREVER_WORLD_OUTPUT=./artifacts/local-world
```

## Manual extraction and audit

From the repository root:

```bash
WORLD_OUTPUT=./artifacts/local-world pnpm extract:forever:world
pnpm world:audit artifacts/local-world/world-snapshots/wow_classic_beta/69913/enUS/missing-hotfix/world-snapshot-manifest.v1/extractor-0.3.0/manifest.json
```

For build 69913 the audited counts are:

| Artifact                           |          Count |
| ---------------------------------- | -------------: |
| Maps / UI maps                     |        73 / 60 |
| Areas / normalized POIs            |  1,372 / 1,986 |
| Encounters                         |            341 |
| Creature objectives / bosses       |       169 / 60 |
| Boss locations                     |             76 |
| Static creature models             |            184 |
| Boss spell candidates              |            175 |
| Loot/source candidates             |            802 |
| Map difficulties / tunings         |       142 / 98 |
| Quest IDs / objectives / POI blobs | 6,600 / 0 / 54 |
| Item appearance source hints       |          1,288 |
| Referenced / decoded tiles         |  1,672 / 1,672 |
| Missing tiles                      |              0 |

Never edit or replace a snapshot in place. A new client build, hotfix hash, definitions revision, or
normalizer version creates a new immutable path and must be audited and diffed. `pnpm dev` requires
normalizer `0.3.0`, so it does not silently reuse an older snapshot for the same client
build.

## Import and publication gates

The exact catalog build must already exist in PostgreSQL with matching product, build/CDN keys,
locale, hotfix state/hash, and definitions revision:

```bash
pnpm world:import /absolute/path/to/manifest.json
pnpm world:import /absolute/path/to/manifest.json -- --publish
```

The first command imports as `review_required`. Publication is rejected when the matching catalog is
not published or the world snapshot has a missing hotfix cache. Build 69913 currently has no local
`DBCache.bin`, so it is suitable for extraction/UI verification but not publication.

Migration `0009_fresh_tombstone.sql` must be applied before importing the boss graph introduced by
normalizer `0.2.3`. Migration `0010_nebulous_tana_nile.sql` adds append-only runtime model, health,
encounter, NPC, and loot observations. Migration `0011_nebulous_marvel_boy.sql` adds combat-spell,
quest-query/event, and vendor observations. Migration `0012_serious_shriek.sql` adds the static
quest-objective table and `QuestV2CliTask` fields preserved by normalizer `0.3.0`. The schema stores
the creature objectives, bosses, candidate locations/spells/sources, static creature models, map
difficulties, and content tunings as typed build-owned rows; the importer writes them in the same
transaction as the existing world records.

Production map media is immutable filesystem data addressed by file data ID. Configure
`WOW_TRADER_WORLD_MEDIA_ROOT` with an absolute snapshot directory alongside the published database
snapshot; do not store PNG payloads in PostgreSQL.

## Archived in-game diagnostics

Collector `0.9.1` is market-only. It does not package the build-pinned quest/boss catalogs, register
world-observation events, or run the commands documented below. This section is retained only as a
record of the earlier `0.6.x` controlled extraction workflow. Existing diagnostic SavedVariables are
preserved but forced off.

The previous six-file collector `0.6.6` is archived outside the loadable AddOns directory at:

```text
/Applications/World of Warcraft/_classic_beta_/WowTraderCollector-pre-0.7.0
```

Enable only during a deliberate maintainer collection session:

```text
/wowtrader diagnostics on
/wowtrader diagnostics status
/wowtrader diagnostics off
```

With diagnostics enabled, the addon records bounded local evidence for encounters, encountered NPCs,
models, health, combat spells, quest dialogs/rewards, vendors, and opened loot. Collector `0.6.6`
rejects secret or otherwise inaccessible API values before arithmetic, comparison, parsing, or
SavedVariables persistence and records empty optional client strings as absent values. On clients
that protect hostile-unit health, the health observation is
therefore absent rather than fabricated; the NPC sighting and any independently readable fields are
still retained. NPC observations
exclude players and explicitly distinguish an API-exposed subject
position from the player's approximate observer position. Loot slots retain the item and source
GUID/type/ID the client actually returned; missing sources stay unknown.

`UnitPosition` values remain raw API-return-order evidence under `coordinateSystem =
unit_position_api`; map aggregation must pass them through a build-validated axis adapter. Most NPC
unit tokens are expected to expose no direct world position, in which case only the player observer
position is available and the sighting stays approximate.

If `ClosestUnitPosition` exists and returns readable values, its raw `xPos`, `yPos`, and distance are
recorded separately under `closest_unit_position_api_unverified`. Secret returns are discarded. Do
not render readable values as exact pins until a controlled in-game golden establishes their
coordinate system and scope for this build.

Run the build-pinned quest capability experiment explicitly:

```text
/wowtrader questsample start
/wowtrader questsample status
/wowtrader questsample pause
/wowtrader questsample resume
/wowtrader questsample reset
```

The full build-69913 catalog is a maintainer-only explicit scan. It contains all 6,600 audited
structural quest IDs, persists its cursor, pauses in combat, and stops after repeated failures:

```text
/wowtrader questscan start
/wowtrader questscan status
/wowtrader questscan pause
/wowtrader questscan resume
/wowtrader questscan reset
```

The sample and catalog queues have independent cursors, each representing the last completed query
rather than the currently requested query. `pause` and a client reload therefore preserve exact
checkpoints, and a stale active-mode marker cannot replace one queue's progress with the other's.
`resume` continues only when the requested queue's saved build, locale, and cursor are valid;
otherwise it reports the mismatch and leaves both checkpoints unchanged. Only `reset` deliberately
returns the selected cursor to zero and clears saved query results.

All collection events remain gated until the addon's own `ADDON_LOADED` event initializes the saved
state. This prevents login/reload unit events from creating a replacement table before WoW has
restored `WOW_TRADER_SAVED`.

Resolve the criteria-backed boss model sample without entering an instance:

```text
/wowtrader bossmodels controls
/wowtrader bossmodels status
/wowtrader bossmodels start
/wowtrader bossmodels pause
/wowtrader bossmodels resume
/wowtrader bossmodels reset
```

Run `controls` first. The four controls are Mechanical Squirrel, Onyxia, The Wild King, and an
invalid creature ID. Only continue with `start` when the known IDs resolve and the invalid ID does
not. The batch queries all 60 build-69913 criteria-backed creature identities three times each, retaining
display ID, model FileDataID, status, build, attempt, and timestamp. It does not prove that a boss is
live or that the default model is its only encounter form.

After the session, `/reload` or log out so WoW writes:

```text
WTF/Account/<account>/SavedVariables/WowTraderCollector.lua
```

The desktop companion parses `worldDiagnostics` schema 5, derives a deterministic payload ID, uploads
the evidence through `/v1/uploads/world-diagnostics`, and records the payload ID locally to prevent
replays. The API preserves the checksummed envelope in the append-only raw archive and normalizes
observations into build-scoped tables. Boss pages label these records as observed evidence. Never turn
one observation into a complete loot table, universal health value, or drop-rate claim.

## Next client build

1. Pin a WoWDBDefs revision that explicitly covers the new build.
2. Extract into a new immutable path and run `world:audit`.
3. Run `pnpm forever:addon-seeds <manifest>` and update the trusted desktop hashes.
4. Keep or deliberately regenerate the small capability sample; never silently relabel it.
5. Diff row counts, encrypted sections, boss identities/spells/locations, source hints, map
   dimensions, tile availability, and quest
   coverage against the last reviewed build.
6. Re-run model controls, coordinate goldens, and desktop/mobile map checks.
7. Import as `review_required`; publish only after the exact catalog/hotfix and runtime goldens pass.
