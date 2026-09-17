# Catalog extractor

This is the only .NET boundary in WoW Trader. It uses pinned `TACTSharp 0.2.0-alpha`, `DBCD 2.3.0`,
and `War3Net.Drawing.Blp 6.0.2` packages to open the installed CASC/TACT product, parse DB2 tables
against a pinned WoWDBDefs revision, apply the local `DBCache.bin` hotfix overlay, and decode
catalog-referenced BLP item icons. Website and economic logic remain in TypeScript.

## Output

Each run writes atomically to:

```text
catalog-snapshots/<product>/<build>/<locale>/<hotfix-hash-or-status>/<snapshot-schema>/
├── manifest.json
├── validation-report.json
├── raw/<table>.base.ndjson.gz
├── raw/<table>.effective.ndjson.gz
└── normalized/*.ndjson.gz
```

The raw base/effective pair makes hotfix effects auditable. Every artifact has a record count and
SHA-256 in the manifest. Normalized records are sorted by stable IDs before compression, so their
descriptors are deterministic for the same inputs. `extractedAt` intentionally makes the enclosing
manifest itself differ across runs.

Snapshot schema v3 normalizes the following build facts:

```text
SkillLine + SkillLineAbility -> profession and recipe candidates
SpellReagents                -> recipe inputs
SpellEffect                  -> item/enchantment outputs and triggered spell chains
ItemEffect                   -> teaching item relationships
SpellCastTimes               -> craft time
SpellCooldowns/Categories    -> direct and shared cooldowns
Item + ItemSparse            -> item facts and teaching skill requirements
Item stats/damage/resistance -> ordered combat facts and weapon inputs
ItemSet + ItemSetSpell       -> sets, members, thresholds, and bonus spells
ItemEffect + spell tables    -> item use/equip/proc relationships and display evidence
Gem/enchantment tables       -> sockets, bonuses, gem effects, and enchantment effects
Random/bonus-tree tables     -> build-shipped variant definitions and item relationships
Class/race/classification    -> localized labels and restriction-mask dimensions
ItemDisenchantLoot           -> disenchant eligibility and required Enchanting skill by item bracket
DBCache.bin                  -> effective records layered over base DB2 data
```

The exact build may legitimately ship zero rows for an optional relationship family. The manifest
still records that table and count so a later Forever build can activate the same contract without
silently changing the archive shape. Every supported table is written as a base/effective raw pair;
every normalized artifact is sorted and checksummed.

Run the pinned TBC validation with `pnpm extract:tbc`. The wrapper accepts these migration overrides:

```text
WOW_ROOT              installation root containing .build.info
WOW_PRODUCT           product row to open (default wow_anniversary)
WOW_LOCALE            locale (default enUS)
WOW_REGION            CDN region (default eu)
WOWDBDEFS_REVISION    exact definitions Git revision
CATALOG_OUTPUT        output root
DOTNET_BIN            optional dotnet executable
```

Never silently advance the definitions revision. Treat it as an input to the snapshot, validate the
result, inspect the diff, and then update the pinned default.

The normal `pnpm dev` bootstrap also invokes the icon mode with the distinct file data IDs from the
exact published catalog. It produces `icons/<file-data-id>.png` plus `manifest.json`; the manifest
records dimensions, SHA-256 values, and any referenced assets that are not decodable BLP files. A
complete manifest is reused on subsequent starts.

## Forever world snapshot

`pnpm extract:forever:world` creates a separate `world-snapshot-manifest.v1` rather than mixing
world, quest, and map media into the item catalog. Its defaults target the installed
`wow_classic_beta` product and the exact pinned WoWDBDefs revision used for build 69893.

```text
world-snapshots/<product>/<build>/<locale>/<hotfix-hash-or-status>/world-snapshot-manifest.v1/extractor-<version>/
├── manifest.json
├── map-media-manifest.json
├── checksums.sha256
├── raw/*.ndjson.gz
├── normalized/*.ndjson.gz
└── media/map-art/<file-data-id>.png
```

World normalizer `0.2.3` includes typed achievement/criteria creature objectives, criteria-backed
boss identities, evidence-labeled boss map/area candidates, static creature-display-model joins,
review-required boss spell candidates, review-required item-to-boss/encounter/map/area source
candidates, map difficulties, and content tuning. The extractor version is part of the immutable
path so adding normalized evidence never overwrites or silently reuses an older snapshot from the
same client build.

Overrides use `WORLD_OUTPUT`, `WOW_ROOT`, `WOW_PRODUCT`, `WOW_LOCALE`, `WOW_REGION`,
`WOWDBDEFS_REVISION`, and `DOTNET_BIN`. Audit a result with `pnpm world:audit <manifest>`. Import it
with `pnpm world:import <manifest>` only after the exact catalog build exists; promotion additionally
uses `-- --publish` and rejects a missing hotfix cache or unpublished catalog build.
