# Recipe data collection

Last validated: 2026-10-18 against installed Forever client `wow_classic_beta` build
`1.60.1.70450`.

## Source-of-truth policy

Recipe data is intentionally split by responsibility:

| Data                                                                                          | Primary source                                       | External reference role       |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| Profession, recipe spell, required skill, reagents, outputs, quantities, craft time, cooldown | Exact client build and hotfix extraction             | Never overwrite client values |
| Character skills, known recipes, specializations, remaining cooldowns, inventory, money       | `WowTraderCollector` live character snapshot         | None                          |
| Trainer, vendor, quest, reputation, drop source, and location                                 | Published community snapshot plus live-game evidence | Fill only acquisition fields  |

Every artifact remains build-pinned. Do not reuse a queue, character snapshot, or enrichment result
for another client build without an explicit compatibility review.

## Current exact-build result

The local `70450` extraction passed the catalog integrity audit and relationship validator with:

- 24,007 normalized items;
- 12 professions;
- 2,228 recipes;
- 7,419 recipe inputs;
- 2,228 recipe outputs;
- zero resolved recipe-teaching-item links;
- zero validation issues.

The extractor output is intentionally ignored local evidence under
`artifacts/local-catalog/3e46d21a41a0/catalog-snapshots/wow_classic_beta/70450/`.

## Character snapshot workflow

Collector `0.12.0` stores the latest snapshot for each character. In game:

1. Log into each crafting character.
2. Open every profession window at least once. A profession seen only through the character sheet is
   stored as `profession_list_only` with `recipeListComplete=false`.
3. Open the bank if bank quantities should be included. The snapshot records either `bags` or
   `bags_and_bank`; it never silently treats inaccessible bank data as zero.
4. Run `/wowtrader professions` and verify the printed profession, known-recipe, and inventory-type
   counts.
5. Run `/reload` or log out so WoW writes `WOW_TRADER_SAVED`.
6. Let the companion upload `profession-snapshot.v1`, or use its one-off `upload` command.

The ingestion API validates the checksum and stores snapshots, professions, specialization spell
IDs, known recipes, cooldown state, inventory, and money in normalized tables. Companion state v4
makes retries idempotent.

## Acquisition evidence workflow

QuestieDB Forever exports provide a broad, revision-pinned baseline for item drops, vendors, quest
relationships, teaching items, NPC names, and spawn coordinates. They are stored separately from
exact client extraction and are not visible publicly until their snapshot is published. See
[`community-reference-data.md`](./community-reference-data.md) for generation, audit, import, and
license requirements.

Public competitor pages now provide a separate review-only fallback for acquisition facts. The
current StillSixty sitemap covers 1,768 of the 2,228 unresolved build-70450 recipes, so beta play is
not expected to rediscover the full catalog. See
[`competitor-reference-collection.md`](./competitor-reference-collection.md) for measured coverage,
collector commands, the rights gate, and merge rules.

Collector `0.12.0` adds disabled-by-default live validation. Run `/wowtrader evidence on` before a
deliberate trainer, merchant, quest, or loot collection session, verify counts with
`/wowtrader evidence status`, then turn it off and `/reload`. Loot sessions provide denominators;
trainer observations preserve whether the visible service filters were complete. The site labels
these rows as observed evidence and never promotes an observed ratio to a configured server drop
chance.

## Acquisition queue

Generate a build-pinned queue without making network requests. The command combines the exact
catalog, pinned QuestieDB export, and exact-build trainer observations:

```bash
pnpm recipes:acquisition-queue -- \
  /absolute/path/to/catalog-snapshot-manifest.v4/manifest.json \
  --community /absolute/path/to/QuestieDB/src/corrections/Forever/combined \
  --source-version VERSION \
  --source-revision FULL_GIT_COMMIT \
  --license-ref REVIEWED_LICENSE_URL \
  --queue artifacts/reference/recipes/forever-70450-acquisition.json \
  --report artifacts/reference/recipes/forever-70450-acquisition.report.json \
  --include-observations
```

The queue contains only recipes whose learning method is missing from client teaching-item links,
community teaching-item relations, and same-build trainer observations. Its report includes source
identity, coverage counts, name conflicts, the raw numeric `AcquireMethod`, and the exact field that
remains unresolved. `AcquireMethod` is preserved as evidence but is not translated into trainer,
drop, quest, or vendor labels until that mapping is independently proven.

Do not start this queue while the quest queue is using the shared crawler profile and rate budget.
Before in-game collection the current `70450` queue contains 2,228 tasks because neither the client
snapshot nor the generated community export contains recipe-teaching links. Regenerate it after
every trainer evidence upload; its count should decrease. Run the remaining tasks only after the
quest queue finishes.
Use the generic resumable crawl command for recipe spells; `crawl-priority` is intentionally reserved
for Forever quest queues:

```bash
pnpm --filter @wow-trader/reference-data dev crawl-all \
  --queue artifacts/reference/recipes/forever-70450-acquisition.json \
  --staging artifacts/reference/wowhead-recipe-staging \
  --status artifacts/reference/wowhead-recipe-status.json \
  --permission-ref owner-confirmed-2026-10-07
```

Do not pass `--quest-xp` for this queue. A spell capture without an acquisition relation remains
staged with `missing_acquisition_context`; it is not treated as complete evidence.

Before the detail crawl, run the bounded profession listing phase:

```bash
$HOME/wow-trader-reference/run-profession-listings.sh
```

Item detail tasks default to **HTML-only** crawling: tooltip, class/subclass, acquisition relations and
`dropStatistics` are parsed from the item page, so the extra `&xml` navigation is skipped. Use
`ITEM_XML=1` to restore the old two-navigation path for troubleshooting.

It fetches about 24 listing pages (one spell and one recipe-item listing per profession) and stores
conservative evidence under `<staging>/listings/`. The listing parser reads the real
`var listviewspells`/`var listviewitems` arrays. Only exact links become relations; broad source
labels remain hints. The current Forever pages do **not** expose exact spell-level trainer or
teaching-item links, so the strict mode does not reduce the 2,228 spell detail queue. The recipe-item
listings do identify the recipe items up front; those item pages are queued so their
tooltip/classification and exact acquisition data are collected. An item-page relation tab such as
`reward-from-q` is normalized to `reward-from`. The planner enables the recipe-name join by
default: unique `Recipe:`/`Plans:`/`Pattern:`/`Schematic:`/`Formula:`/`Design:`/`Technique:`/
`Manual:`/`Blueprint:` item names are matched to client recipe names within the same profession and
materialized as `sourceKind: "listing-name-join"` spells. Duplicates and misses keep the spell detail
page, and `listingNameJoins` in the plan report records every join. Set `NAME_JOIN=0` for strict
exact-links-only mode.

## Live validation still required

### First in-game validation sample

Use the `wow_classic_beta` Forever client for build `70450` only for representative validation and
conflict resolution. Install collector `0.12.0`, enable out-of-date AddOns if the client requests it,
then:

1. Log into a character with trained professions and run `/wowtrader evidence on`.
2. At each trainer, enable the available, unavailable, and already-known service filters before
   opening or refreshing the trainer list. Leave the window open until it finishes populating.
3. Open every profession window once. Visit the bank once when a bank-inclusive inventory snapshot
   is wanted.
4. Run `/wowtrader evidence status`. The trainer-service count must be greater than zero.
5. Run `/wowtrader professions` and record the printed counts for the test notes.
6. Run `/wowtrader evidence off`, then `/reload` or log out to flush SavedVariables.
7. Start the desktop companion and upload. Regenerate the acquisition queue with
   `--include-observations` before starting any crawler work.

The AddOn observes only windows and interactions the player opens manually. It neither buys nor
learns trainer services.

Before personalized recommendations are enabled for users, collect a small golden set from the live
UI. It does not need to cover every profession or recipe:

- one complete trainer window containing several known and unknown recipes;
- one merchant recipe when available;
- one quest- or drop-taught recipe when naturally encountered;
- one unknown recipe to prove it is excluded;
- one specialization-locked recipe;
- one active cooldown recipe;
- one multi-output craft;
- one enchant with no physical output;
- one bag-only and one bank-inclusive inventory snapshot.

Compare recipe IDs and cooldown state with the AddOn SavedVariables and compare profession, skill,
reagents, and outputs with the exact-build catalog. Any mismatch remains review-required; external
pages do not win automatically.
