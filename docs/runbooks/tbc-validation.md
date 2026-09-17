# TBC validation and Forever migration runbook

Last verified: 2026-09-15

## What the TBC proof establishes

The current pipeline was run twice from the installed client, not from AtlasLoot or seeded website
data. It demonstrates that client files plus the live hotfix cache can recover a rare world-drop
recipe before any Auction House observation, retain the raw evidence, normalize it into stable IDs,
and validate the result independently in .NET and TypeScript.

It does not establish server-side drop source, drop probability, phase enablement, or live realm
availability. Those remain separate evidence claims.

## Verified input

| Input              | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Product            | `wow_anniversary`                                                  |
| Client             | `2.5.6.69795`                                                      |
| Build              | `69795`                                                            |
| Build key          | `6761dba8cfd072ee16accae41941bd11`                                 |
| CDN key            | `3bf5d9d33331e68f0899bd0e32ebdf4a`                                 |
| Locale / region    | `enUS` / `eu`                                                      |
| Hotfix SHA-256     | `4d0fe6f994b4b2c6a84f9aa12a1bb1bcb1de4a6159d9f262842f8248beb96bb6` |
| WoWDBDefs revision | `e6828ce1a61ad05e9693e762fcfd39666454cc62`                         |
| TACTSharp / DBCD   | `0.2.0-alpha` / `2.3.0`                                            |

The hotfix mattered: `ItemSparse` contained 30,132 base records and 30,133 effective records after
the local `DBCache.bin` was applied. The bootstrap detected this cache hash after it changed from the
earlier `1494add0…` validation snapshot, rebuilt and published the exact new tuple, then skipped
extraction on an immediate repeat.

Current extractions emit `catalog-snapshot-manifest.v4`, which requires normalized item level,
item-library relationships, and deterministic consumable item transformations. Snapshot v1-v3
artifacts predate this contract and must be re-extracted before import; they are never silently
upgraded.

## Verified output

| Entity                       |         Count |
| ---------------------------- | ------------: |
| Items                        |        30,133 |
| Spells                       |        28,695 |
| Professions                  |            10 |
| Recipes                      |         2,166 |
| Recipe inputs                |         6,276 |
| Recipe outputs               |         2,166 |
| Teaching-item links          |         1,578 |
| Item transformations         |           200 |
| Transformation inputs        |           335 |
| Transformation outputs       |           200 |
| Item stat rows               |        25,544 |
| Item damage rows             |         4,518 |
| Item resistance/armor rows   |        12,907 |
| Item socket rows             |         3,132 |
| Item effects                 |        17,481 |
| Item sets / members          |   388 / 1,629 |
| Item set effects             |           883 |
| Enchantments / effects       | 2,044 / 2,289 |
| Gem properties               |           259 |
| Random enchantment rows      |         3,162 |
| Disenchant eligibility rows  |            74 |
| Distinct icon file IDs       |         3,165 |
| Browser-ready icon PNGs      |         3,163 |
| Encrypted sections / records |         0 / 0 |

Eight recipe records retain unresolved client relationships and are marked `ambiguous`; this is a
warning, not silently discarded evidence. Item effects now exist both as raw evidence and normalized
spell relationships. Optional item bonus-tree files are present but contain zero records in this
TBC build; that zero is retained rather than treated as an extraction failure.
Two referenced icon assets (`8029660` and `8030676`) are not BLP files. The icon manifest records
them as unavailable and the UI uses a placeholder; every other distinct icon reference decoded.

The golden world-drop chain was recovered as:

```text
item 13486 (teaching item)
  -> spell 17563 (Transmute: Undeath to Water)
  -> consumes item 12808 x1
  -> produces item 7080 x1
  -> Alchemy (skill line 171), required rank 275
  -> cast time 25,000 ms
  -> cooldown category 310, shared cooldown 72,000,000 ms (20 hours)
```

The database path was also verified against PostgreSQL 17: all migrations applied, the actual
snapshot moved from `review_required` to `published`, and SQL returned the same counts and golden
row. A test AH payload was accepted once and treated as a duplicate on replay; the database retained
one scan rather than doubling its three price levels. The production Next.js build then served the
catalog, golden recipe/item/profession, market, opportunities, and status routes successfully. The
disposable containers, volumes, and raw upload fixture were removed after validation.

## Reproduce the extraction

```bash
export CATALOG_OUTPUT=/tmp/wow-trader-tbc-a
pnpm extract:tbc

manifest_a=$(find "$CATALOG_OUTPUT/catalog-snapshots" -name manifest.json -print -quit)
pnpm catalog:audit "$manifest_a"
pnpm catalog:validate "$manifest_a" --tbc-golden
find "$CATALOG_OUTPUT/catalog-snapshots" -name '*.gz' -print0 | xargs -0 -n1 gzip -t
```

For the verified TBC build, the audit checks all 102 manifest-tracked artifacts (36 base/effective
DB2 pairs plus 30 normalized files) and reports 30,145
unique structural `Item` IDs, 30,133 name-bearing IDs, and 30,133 normalized items. The remaining 12
IDs (`17`, `192`, `905`, `12729`, `185964`, `187794`, `265829`, `265842`, `265844`, `265846`,
`265848`, and `265850`) have no `ItemSparse` or `ItemSearchName` record. They are retained in the raw
artifact but cannot form player-facing item rows. Missing normalized IDs, unexpected normalized IDs,
derived-field mismatches, and raw-record mismatches must all remain zero.

The v4 golden transformation proves the non-profession chain independently of the profession
recipe graph: item-use spell `28100` consumes ten Motes of Air (`22572`) including the triggering
item and creates one Primal Air (`22451`). The trigger is added only for a single-use `Charges = -1`
item effect; reusable and stateful item effects are not guessed into the graph.

Run again into a different empty output root:

```bash
CATALOG_OUTPUT=/tmp/wow-trader-tbc-b pnpm extract:tbc
manifest_b=$(find /tmp/wow-trader-tbc-b/catalog-snapshots -name manifest.json -print -quit)

diff -u \
  <(jq -S '.normalizedArtifacts' "$manifest_a") \
  <(jq -S '.normalizedArtifacts' "$manifest_b")
```

No diff is expected. Compare `normalizedArtifacts`, not the complete manifest, because extraction
timestamps intentionally differ.

## Review and import

Start PostgreSQL and apply all migrations:

```bash
docker compose -f infra/compose/docker-compose.yml up -d postgres
pnpm db:migrate
```

Validate and inspect first:

```bash
pnpm catalog:validate "$manifest_a" --tbc-golden
pnpm catalog:diff "$previous_manifest" "$manifest_a" --output /tmp/catalog-diff.json
jq . /tmp/catalog-diff.json
```

Normal operation imports without publication, then promotes the validated exact snapshot after
review:

```bash
pnpm catalog:import "$manifest_a"
pnpm catalog:import "$manifest_a" --publish
```

Confirm that PostgreSQL contains the imported snapshot rather than relying only on the CLI result:

```bash
docker compose -f infra/compose/docker-compose.yml exec -T postgres \
  psql -U wow_trader -d wow_trader -c "
WITH selected_build AS (
  SELECT id, build_number, status
  FROM game_build
  WHERE product = 'wow_anniversary' AND build_number = 69795
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  selected_build.build_number,
  selected_build.status,
  (SELECT count(*) FROM item_version WHERE build_id = selected_build.id) AS items,
  (SELECT count(*) FROM spell_version WHERE build_id = selected_build.id) AS spells,
  (SELECT count(*) FROM profession_version WHERE build_id = selected_build.id) AS professions,
  (SELECT count(*) FROM recipe_version WHERE build_id = selected_build.id) AS recipes,
  (SELECT count(*) FROM recipe_input WHERE build_id = selected_build.id) AS recipe_inputs,
  (SELECT count(*) FROM recipe_output WHERE build_id = selected_build.id) AS recipe_outputs,
  (SELECT count(*) FROM recipe_teaching_item WHERE build_id = selected_build.id) AS teaching_items,
  (SELECT count(*) FROM transformation_version WHERE build_id = selected_build.id) AS transformations,
  (SELECT count(*) FROM transformation_input WHERE build_id = selected_build.id) AS transformation_inputs,
  (SELECT count(*) FROM transformation_output WHERE build_id = selected_build.id) AS transformation_outputs,
  (SELECT count(*) FROM item_stat WHERE build_id = selected_build.id) AS item_stats,
  (SELECT count(*) FROM item_effect WHERE build_id = selected_build.id) AS item_effects,
  (SELECT count(*) FROM item_set_version WHERE build_id = selected_build.id) AS item_sets
FROM selected_build;"
```

The expected row ends with
`30133 | 28695 | 10 | 2166 | 6276 | 2166 | 1578 | 200 | 335 | 200 | 25544 | 17481 | 388`.
The imported `item_version.item_level` must match `raw_record.itemSparse.ItemLevel`. Migration 0003
backfills that field for old catalogs; migration 0004 adds the schema-v3 item relations; migration
0005 adds the schema-v4 transformation graph. Publication still requires a new v4 import rather
than treating migrated older rows as complete.

## Verify Auction House transport

1. Install `apps/addon/WowTraderCollector` in the TBC AddOns directory.
2. Keep Auctionator enabled; version `335` is the integration baseline.
3. Open the Auction House and run Auctionator's full scan, or `/wowtrader scan`.
4. The command delegates to Auctionator and runs only when its `CanSendAuctionQuery` check permits it.
5. Log out or `/reload` to flush SavedVariables.
6. Keep root `pnpm dev` running. Its companion watcher discovers every account-wide collector file,
   waits for the write to stabilize, and uploads unseen scans. No account path or upload command is
   required.
7. Use companion `discover`, `inspect`, or explicit `upload` only for diagnostics. The scan ID is also
   the payload ID, so retrying a lost response is idempotent.
8. Confirm `/v1/uploads/<payload-id>`, `/data-status`, the market workbench, and one item history page.

The addon stores at most eight compact scans. The companion never executes the Lua file, never
places its API key in game data, accepts non-TLS endpoints only on loopback, and records successful
scan IDs in a mode-0600 local state file. The live watcher test discovered one `_anniversary_`
account file containing 12,225 markets. Replaying its stable scan ID left exactly one raw upload, one
market scan, and 58,581 price levels in PostgreSQL; restarting with local state performed no upload.

## Forever migration checklist

Do these steps in order when the first public Forever client is available:

1. Archive the TBC manifest and normalized checksums as the comparison baseline.
2. Inspect the active `.build.info` row. Record product, semantic version, build number, build key,
   CDN key, locale, and region. Do not infer the product name from marketing terminology.
3. Confirm the Forever `DBCache.bin` path and hash. A missing hotfix cache blocks publication.
4. Find the first WoWDBDefs revision that explicitly covers the Forever build; record and pin its
   commit SHA. Never follow the definitions repository head implicitly.
5. Run with overrides rather than editing extraction code prematurely:

   ```bash
   WOW_PRODUCT=<actual-product> \
   WOWDBDEFS_REVISION=<pinned-sha> \
   CATALOG_OUTPUT=/tmp/wow-trader-forever \
   pnpm extract:tbc
   ```

6. If a required DB2 table or field changed, update the extractor mapping and add a regression fixture.
   Do not weaken validation merely to produce a snapshot.
7. Validate checksums, gzip integrity, referential integrity, encrypted counts, profession coverage,
   and at least two known Forever recipes supplied by the maintainers.
8. Repeat into a second output root and require identical normalized artifact descriptors.
9. Diff Forever against the archived TBC manifest. Manually review added/removed recipes, inputs,
   outputs, teaching links, cooldowns, required ranks, item levels, stats, damage, restrictions,
   sockets, effects, sets, gems/enchants, random/bonus definitions, `ItemDisenchantLoot` brackets,
   and extraction-status changes. Create a new disenchant model version from verified Forever rules;
   never make a new build inherit `tbc-disenchant-table-v1` implicitly.
10. Update the addon TOC interface and `X-WowTrader-Product`. Revalidate Auctionator's full-scan event
    name and its `auctionInfo` indices before distributing the collector.
11. Import without `--publish`, inspect website/API counts and golden pages, then publish explicitly.
12. Mark recipes only `client_only` until announcements or in-game observations establish phase and
    realm availability. Never turn client presence into a claimed drop rate.

## Release gates

Do not publish a Forever catalog if any of these are true:

- The hotfix cache is missing when one is expected.
- Encrypted record counts changed without review.
- Normalized descriptors are not deterministic for the same inputs.
- A normalized foreign key is dangling.
- Known recipe chains fail or required skill/cooldown data regresses.
- The build diff has not been reviewed.
- Auctionator's payload shape changed and the collector was not retested in game.
