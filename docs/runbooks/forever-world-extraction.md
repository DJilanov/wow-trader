# Forever world extraction and observation runbook

Last verified: 2026-09-17 against `wow_classic_beta` `1.60.1.69893`.

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
pnpm world:audit artifacts/local-world/world-snapshots/wow_classic_beta/69893/enUS/missing-hotfix/world-snapshot-manifest.v1/extractor-0.2.3/manifest.json
```

For build 69893 the audited counts are:

| Artifact                     |         Count |
| ---------------------------- | ------------: |
| Maps / UI maps               |       73 / 60 |
| Areas / normalized POIs      | 1,372 / 1,986 |
| Encounters                   |           341 |
| Creature objectives / bosses |      169 / 60 |
| Boss locations               |            76 |
| Static creature models       |           184 |
| Boss spell candidates        |           175 |
| Loot/source candidates       |           802 |
| Map difficulties / tunings   |      142 / 98 |
| Quest IDs / quest POI blobs  |    6,600 / 54 |
| Item appearance source hints |         1,288 |
| Referenced / decoded tiles   | 1,672 / 1,672 |
| Missing tiles                |             0 |

Never edit or replace a snapshot in place. A new client build, hotfix hash, definitions revision, or
normalizer version creates a new immutable path and must be audited and diffed. `pnpm dev` requires
normalizer `0.2.3`, so it does not silently reuse the older map-only snapshot for the same client
build.

## Import and publication gates

The exact catalog build must already exist in PostgreSQL with matching product, build/CDN keys,
locale, hotfix state/hash, and definitions revision:

```bash
pnpm world:import /absolute/path/to/manifest.json
pnpm world:import /absolute/path/to/manifest.json -- --publish
```

The first command imports as `review_required`. Publication is rejected when the matching catalog is
not published or the world snapshot has a missing hotfix cache. Build 69893 currently has no local
`DBCache.bin`, so it is suitable for extraction/UI verification but not publication.

Migration `0009_fresh_tombstone.sql` must be applied before importing normalizer `0.2.3`. It stores
the creature objectives, bosses, candidate locations/spells/sources, static creature models, map
difficulties, and content tunings as typed build-owned rows; the importer writes them in the same
transaction as the existing world records.

Production map media is immutable filesystem data addressed by file data ID. Configure
`WOW_TRADER_WORLD_MEDIA_ROOT` with an absolute snapshot directory alongside the published database
snapshot; do not store PNG payloads in PostgreSQL.

## In-game diagnostics

Collector `0.4.0` is installed at:

```text
/Applications/World of Warcraft/_classic_beta_/Interface/AddOns/WowTraderCollector
```

Enable only during a deliberate maintainer collection session:

```text
/wowtrader diagnostics on
/wowtrader diagnostics status
/wowtrader diagnostics off
```

With diagnostics enabled, the addon records bounded local evidence for encounters, encountered NPCs,
and opened loot. NPC observations exclude players and explicitly distinguish an API-exposed subject
position from the player's approximate observer position. Loot slots retain the item and source
GUID/type/ID the client actually returned; missing sources stay unknown.

`UnitPosition` values remain raw API-return-order evidence under `coordinateSystem =
unit_position_api`; map aggregation must pass them through a build-validated axis adapter. Most NPC
unit tokens are expected to expose no direct world position, in which case only the player observer
position is available and the sighting stays approximate.

If `ClosestUnitPosition` exists, its raw `xPos`, `yPos`, and distance are recorded separately under
`closest_unit_position_api_unverified`. Do not render those values as exact pins until a controlled
in-game golden establishes their coordinate system and scope for this build.

Run the build-pinned quest capability experiment explicitly:

```text
/wowtrader questsample start
/wowtrader questsample status
/wowtrader questsample pause
/wowtrader questsample resume
/wowtrader questsample reset
```

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
not. The batch queries 30 reviewed build-69893 criteria creature IDs three times each, retaining
display ID, model FileDataID, status, build, attempt, and timestamp. It does not prove that a boss is
live or that the default model is its only encounter form.

After the session, `/reload` or log out so WoW writes:

```text
WTF/Account/<account>/SavedVariables/WowTraderCollector.lua
```

The desktop companion currently strips/ignores `worldDiagnostics`; it does not upload these records.
Review the raw event semantics first, then add a versioned authenticated contract, append-only raw
archive, normalization, and maintainer promotion workflow. Never turn one observation into a complete
loot table or drop-rate claim.

## Next client build

1. Pin a WoWDBDefs revision that explicitly covers the new build.
2. Regenerate the 100-ID quest sample and update its build guard.
3. Regenerate the reviewed boss sample and update its build guard.
4. Extract into a new immutable path and run `world:audit`.
5. Diff row counts, encrypted sections, boss identities/spells/locations, source hints, map
   dimensions, tile availability, and quest
   coverage against the last reviewed build.
6. Re-run model controls, coordinate goldens, and desktop/mobile map checks.
7. Import as `review_required`; publish only after the exact catalog/hotfix and runtime goldens pass.
