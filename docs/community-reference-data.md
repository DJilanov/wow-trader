# Community reference data

Last updated: 2026-10-18.

## Goal and evidence policy

The product needs to answer where an NPC is, which trainer teaches a recipe, where an item can drop,
and which quest rewards it. No single source proves all four facts. The pipeline therefore keeps
three evidence classes separate:

1. Exact client-build extraction is authoritative for shipped items, spells, recipes, reagents,
   outputs, requirements, and client-side world records.
2. A published, revision-pinned QuestieDB Forever snapshot supplies the broad relationship and
   coordinate baseline.
3. Opt-in live observations validate trainer, vendor, quest, NPC, and loot behavior on the running
   realm. The external crawler is the last fallback for unresolved records, not the default source.

Community data never overwrites extracted client facts. Every imported row is tied to one
`game_build`, source revision, checksum, locale, license reference, and publication state. Review
snapshots are queryable by maintainers, but public pages join only `published` snapshots.

## Current implementation

| Capability                                                          | Status      |
| ------------------------------------------------------------------- | ----------- |
| Safe parser for QuestieDB's four generated Forever exports          | Implemented |
| Literal-only parser; no execution of upstream Lua                   | Implemented |
| Quest, NPC, item, and object entities with raw named fields         | Implemented |
| Drop, vendor, quest, teaching-item, and quest-giver relations       | Implemented |
| Build/revision/checksum/license provenance and review state         | Implemented |
| Opt-in NPC, loot-session, quest, vendor, and trainer collection     | Implemented |
| Companion validation and ingestion for loot sessions/trainers       | Implemented |
| Recipe teaching-item and observed-trainer web joins                 | Implemented |
| Item community-source, observed-loot, and observed-vendor web joins | Implemented |
| NPC and object detail pages with validated coordinates and maps     | Implemented |
| Evidence agreement/conflict labels on public entity and item pages  | Implemented |
| Build-pinned coverage report and unresolved-recipe queue            | Implemented |
| Isolated StillSixty sitemap plan and review-only recipe staging     | Implemented |
| ForeverDB profession-page corroboration adapter                     | Planned     |

The importer was exercised against QuestieDB revision
`e9a67d1a2753a0e64c4c96bf7864788fac7b765f` (version `1.0.6`) with authored corrections excluded.
The audit accepted 46,884 entities and derived 240,376 unique relations from 5,224 quests, 13,392
NPCs, 21,281 items, and 6,987 objects. The combined import identity was
`a47d806664e0ae4e8383c66e640858e6666ed78850e8b287c518fbbd9a281944`. This is a compatibility
result, not publication approval; license and content review are still mandatory.

The build `70450` coverage report currently records 24,007 catalog items, 21,281 community items,
19,291 matching item names, 164 item-name conflicts, 11,238 catalog items with acquisition
relations, 120,643 valid NPC coordinates, 52,544 valid object coordinates, and 2,897 rejected
malformed or out-of-bounds coordinates. QuestieDB's generated Forever exports contain no
`teachesSpell` rows, so all 2,228 recipe learning methods remain unresolved until trainer
observations or reviewed external evidence fill them.

## Generate the QuestieDB export

Pin the upstream repository to a reviewed commit. From that checkout, run its maintained exporter:

```bash
./tools/lua-binary/linux-x64/lua tools/export-forever.lua
```

On another platform, use a Lua 5.1-compatible interpreter. Add `--include-authored` only when the
license and redistribution review explicitly covers those authored corrections. The command writes:

```text
src/corrections/Forever/combined/foreverQuestDB.lua
src/corrections/Forever/combined/foreverNpcDB.lua
src/corrections/Forever/combined/foreverItemDB.lua
src/corrections/Forever/combined/foreverObjectDB.lua
```

Do not import the installed addon's compressed runtime store or execute arbitrary upstream files in
the application. The importer accepts only the exporter's empty local table, literal indexed row
assignments, and final return statement. Calls, loops, functions, duplicate IDs, invalid IDs, and
unknown row fields fail closed.

## Audit and import

First audit without touching the database:

```bash
pnpm --filter @wow-trader/world-data dev community-audit \
  /absolute/path/to/QuestieDB/src/corrections/Forever/combined \
  --source-version VERSION \
  --source-revision FULL_GIT_COMMIT \
  --license-ref REVIEWED_LICENSE_URL
```

The report prints each artifact's byte size, SHA-256 checksum and row count, plus aggregate entity
and relation counts. Import into the exact catalog build as review-required data:

```bash
pnpm --filter @wow-trader/world-data dev community-import \
  /absolute/path/to/QuestieDB/src/corrections/Forever/combined \
  --product wow_classic_beta \
  --build 70450 \
  --locale enUS \
  --source-version VERSION \
  --source-revision FULL_GIT_COMMIT \
  --license-ref REVIEWED_LICENSE_URL
```

Repeat with `--publish` only after these checks pass:

- the matching catalog build is already published;
- the source commit and version are immutable and reviewed;
- the license reference authorizes the imported scope and redistribution model;
- counts and representative item, quest, NPC, object, vendor, and teaching-item rows are correct;
- authored corrections were either deliberately excluded or explicitly approved and marked with
  `--include-authored` during both audit and import.

A publish operation must also provide the reviewed identifier with `--license-name`. Review-only
imports deliberately store `Review required` instead of guessing a license from repository
metadata.

Re-importing the same revision and checksum is idempotent. The importer rejects a different checksum
for the same build and revision, or an ambiguous catalog build.

## Live validation

Collector `0.12.0` keeps world evidence disabled by default. During a controlled play session:

```text
/wowtrader evidence on
/wowtrader evidence status
/wowtrader evidence off
/reload
```

The arrays are bounded to prevent SavedVariables growth. A loot item references a distinct loot
session; the backend can therefore display “item seen in X of Y captured sessions” for that source.
This is an observed frequency, not the realm's configured probability. Trainer rows include cost,
requirements, service state, spell ID when exposed by the tooltip API, and a completeness flag for
the trainer filters. Merchant and trainer actions remain fully manual.

After upload, compare live evidence with the published community relation. Agreement raises
confidence; disagreement creates a review task. It must not silently mutate the community snapshot
or exact client catalog.

## Coverage report and unresolved queue

Generate the exact-build report and crawler queue without making network requests:

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

`--include-observations` removes exact spell-ID trainer matches and uniquely named trainer matches
for the same product, build, and locale. It requires `DATABASE_URL`. Absence is never converted into
a conflict, and ambiguous names remain unresolved. The previous catalog-only generator remains
available as `pnpm recipes:acquisition-queue:catalog-only`, but it cannot subtract community or live
evidence and must not overwrite the canonical queue above.

## Profession acquisition crawl

The operator launcher at `$HOME/wow-trader-reference/run-profession-crawl.sh` keeps profession
acquisition work separate from the quest queue while sharing its staging directory and rolling
request budget. It consumes the exact-build queue and report above. The planner verifies their
checksum before every run and initially schedules recipe spell pages. As staged spell records expose
`taught-by-item` relations, later invocations automatically add those teaching-item pages to resolve
vendor, drop, quest-reward, and container sources.

The source page is not allowed to redefine recipe math. Exact client extraction remains authoritative
for profession, required skill, reagents, outputs, cast time, and cooldown. A spell reference is
complete only when it contains a supported trainer, teaching-item, or direct acquisition relation.
Missing evidence remains `missing_acquisition_context`; it is never interpreted as trainer-taught.

Run a non-networked plan check first:

```bash
DRY_RUN=1 $HOME/wow-trader-reference/run-profession-crawl.sh
```

After the quest crawl has stopped, start a bounded profession batch:

```bash
LIMIT=20 $HOME/wow-trader-reference/run-profession-crawl.sh
```

### Bulk listing phase

Crawl the profession listings before the individual recipe pages. The launcher generates one
spell-listing and one recipe-item-listing task per profession (24 requests for the current build):

```bash
$HOME/wow-trader-reference/run-profession-listings.sh
```

The listings are stored separately under `<staging>/listings/`. The parser reads the real
`var listviewspells = [...]` / `var listviewitems = [...]` arrays and is deliberately conservative:

- recipe/item IDs, names, reagents and skill come from the listing rows;
- broad source codes are mapped to hints only (`trainer`, `vendor`, `drop`, `quest`, `crafted`);
- an item listing's `sourcemore` entry becomes an exact relation only when the source code makes
  the mapping unambiguous (`t:1` NPC + a single vendor/drop source, `t:5` quest + quest source,
  `t:3` container + drop/vendor source); mixed vendor/drop rows stay unresolved;
- an item listing's `teaches` field would become `taught-by-item`, but the current Forever pages do
  not include one;
- anything ambiguous is marked `source_relation_requires_detail_page` and stays on the detail queue.

The current pages do **not** expose exact spell-level trainer or teaching-item links. The Alchemy
verification found 193 spell rows with only broad labels, 0 exact spell relations, 140 recipe items,
and 28 item rows with exact acquisition relations. The exact `taught-by-npc`/`taught-by-item` link is
still only on the spell detail page, so the strict mode does not reduce the 2,228 spell detail queue.
The item listing does identify the 140 recipe items up front, and those item pages are queued so their
tooltip/classification and exact acquisition data are collected.

The profession planner enables the **recipe-name join** by default. It strips the known recipe-item
prefixes (`Recipe:`, `Plans:`, `Pattern:`, `Schematic:`, `Formula:`, `Design:`, `Technique:`,
`Manual:`, `Blueprint:`) and matches the remaining normalized name to the client recipe name within
the same profession. Only a unique one-to-one match is materialized, with
`sourceKind: "listing-name-join"` and a `taught-by-item` relation to the recipe item. Duplicate names,
unmatched items, and professions without an item listing keep the spell detail page. Every join is
written to `listingNameJoins` in the plan report. Set `NAME_JOIN=0` to return to strict
exact-links-only mode.

This join is an identity inference, not a spell-page relation. It is enabled because the operator
explicitly chose the optimized approach; review `listingNameJoins` before publication and keep the
strict mode available for conflict work.

The `status-profession.sh` view prints listing record/entry/relation counts, source-label counts, and
parser warnings. If a listing record has `no_listing_entries` or unexpected warnings, keep the detail
fallback in place and inspect the listing page before trusting a bulk result. A saved listing page can
be imported without network access for parser calibration:

```bash
pnpm --filter @wow-trader/reference-data dev import-saved-html \
  --input /absolute/path/to/alchemy-listing.html \
  --staging "$HOME/wow-trader-reference/staging" \
  --permission-ref owner-confirmed-2026-10-07
```

This writes the same `staging/listings/<key>.json` record as the live listing crawl, so the parser can
be checked before spending a request.

Only one quest or profession crawl may run at a time. Both launchers use the same Browsertrix profile,
staging store, robots cache, challenge evidence, and rolling pacing state.

The saved profile carries Wowhead's `aws-waf-token`, which is valid for about **24 hours**. The crawler
mounts the profile read-only and starts a fresh Browsertrix container for every page, so it cannot
renew that token itself. A batch that starts inside the window but runs past it stops with
`Source challenge encountered; stopped` on an HTTP 202 challenge page. On 2026-10-18 the token was
written at 14:34:16 UTC and the first challenge arrived at 14:34:54 UTC the next day, after the
previous page had succeeded at 14:33:28 UTC.

Both launchers therefore run `waf-token-guard.sh` before starting. The guard reads the token write
time from the profile, refuses a batch that cannot finish inside the token lifetime (including a
10-minute safety margin), and the status scripts print the token's age, expiry, and remaining page
budget. With `ALLOW_SHORT_WAF_BATCH=1` the launcher caps the batch to the pages that fit instead of
refusing. The estimate is 85 seconds per spell/quest page (measured 75-90s gate intervals); a
teaching-item task fetches both the HTML page and its XML document, so use
`WAF_TOKEN_TASK_SECONDS=170` for an item-heavy batch.
Refresh the profile with `refresh-wow-profile.sh` (load a real Wowhead page, click
"Create Profile") before each long batch and at least once every 24 hours. Do not run the profile
editor while a crawl is running; both use the same profile and WAF session.

## Remaining work before crawler enrichment

1. Review and approve the source license and representative content before publishing the imported
   snapshot. Public NPC/object routes deliberately return not found until then.
2. Use the competitor-reference plan for broad acquisition coverage; keep it staged until source
   reuse rights and representative records are reviewed. See
   [`competitor-reference-collection.md`](./competitor-reference-collection.md).
3. Collect a small exact-build live sample and targeted conflict evidence, then regenerate the queue
   with `--include-observations`. Exhaustive beta collection is not required.
4. Add the bounded ForeverDB profession-page adapter for StillSixty misses without calling its
   disallowed API paths.
5. Promote confidence only from explicit corroboration; conflicts remain visible review work.

The permissioned Wowhead crawler remains unchanged. Competitor collection uses a separate source,
status file, staging directory, and request budget.
