# Forever Encyclopedia maximum-coverage plan

Last verified: 2026-09-18 against `wow_classic_beta` `1.60.1.69913`.

## Outcome

The Encyclopedia now uses every safe evidence class currently available to this project:

1. immutable exact-build client extraction;
2. explicit, paced client API queries;
3. passive in-game observations;
4. append-only authenticated uploads;
5. reviewed supplemental evidence.

These sources must stay separate. A client-present record is not proof that content is live. A
successful API query is not proof that a quest is obtainable. One observed drop is not a complete
loot table or a drop-rate estimate.

## Current exact-build coverage

The audited `extractor-0.3.0` snapshot contains:

| Surface                                               | Verified coverage |
| ----------------------------------------------------- | ----------------: |
| Maps / UI maps / decoded tiles                        |   73 / 60 / 1,672 |
| Areas / normalized POIs                               |     1,372 / 1,986 |
| Encounter rows / canonical encounter names            |         341 / 313 |
| Criteria creature objectives / boss identities        |          169 / 60 |
| Candidate boss locations / spell links                |          76 / 175 |
| Static creature-model joins                           |               184 |
| Review-required item-source candidates                |               802 |
| Structural quest IDs / static objectives / quest POIs |    6,600 / 0 / 54 |
| Appearance source hints                               |             1,288 |

The extractor additionally archives display condition/event/extra/geoset/option tables, quest task,
objective, package/reward-curve, sort and feedback tables, and the Adventure Guide encounter family.
For this build `QuestV2CliTask`, `QuestObjective`, `QuestPackageItem`, and all selected Adventure Guide
tables contain zero rows. Their absence is recorded in the immutable manifest instead of being
filled with guessed data.

## Implemented collection ladder

### Static extraction

- Raw DB2 rows, encrypted-record counts, exact definitions revision, client build/CDN keys, locale,
  hotfix status, artifact checksums, and normalized records are immutable and build-scoped.
- Maps, art tiles, assignments, areas, POIs, encounters, structural quests, quest lines/POIs,
  criteria-backed creature identities, model joins, spell candidates, and source candidates have
  typed contracts and PostgreSQL import tables.
- Quest client-task fields and typed objectives are supported even though build 69913 supplies none.
- `pnpm dev` requires normalizer `0.3.0`; an older artifact cannot silently satisfy the current
  build contract.

### No-instance active queries

- `questscan` uses the generated list of all 6,600 structural quest IDs. It is explicit, paced at
  one request per 1.5 seconds, pauses in combat, persists a product/build/locale cursor, times out
  individual requests, and stops after 25 consecutive failures.
- Successful quest queries capture the title, normalized objective progress, and tag information.
  Failure and timeout are retained as results rather than discarded.
- `bossmodels` submits all 60 criteria-backed identities to the model widget three times. It records
  display ID, model FileDataID, attempt, status, error, build, and timestamp. Known and invalid
  controls must pass before the batch result is trusted.

### Passive observations

When diagnostics are enabled, the collector records bounded and deduplicated evidence for:

- creature/vehicle GUID identity, level, classification, type/family, reaction, quest-boss flag,
  health, group/difficulty context, subject position when exposed, and otherwise observer position;
- display IDs exposed for target, mouseover, and nameplate units;
- encounter start/end identity, actors, success, health context, and encounter loot;
- opened-loot item and source GUID/type/ID;
- creature/vehicle combat-log spell casts aggregated by attempt or daily map context;
- quest acceptance, turn-in, item/currency rewards, visible dialog text/rewards, and gossip lists;
- merchant items, price, stack, availability, purchase/usability flags, extended-cost components,
  vendor identity, and location.

The desktop companion reads only after WoW flushes SavedVariables, produces a deterministic
checksummed payload, uploads it exactly once, and never mutates the game file. The API preserves the
raw envelope and normalizes each evidence family into build-scoped append-only tables.

## Product read model

Public pages should consume a derived evidence graph, never raw-table assumptions:

```text
build
  -> map -> instance -> encounter
  -> criteria boss identity
       -> candidate location / observed location
       -> candidate spell / observed cast
       -> static model / client-resolved model / observed display
       -> source hint / observed loot
  -> structural quest
       -> client-query title/objectives/tag
       -> observed giver/dialog/rewards/location
  -> vendor -> observed stock and costs
```

Every edge carries its evidence kind, exact build, locale where relevant, capture time, review state,
and precision. The UI may merge evidence for presentation but must keep the provenance visible.

## Remaining collection work

### Can be done now without instances

1. Install collector `0.6.0`, enable diagnostics, and run the model controls.
2. If controls pass, run the 180-request boss model batch and review repeat consistency.
3. Run `questsample` after API changes, then run the full `questscan` while monitoring failures.
4. Visit capitals, profession hubs, quest hubs, and accessible new zones to collect vendors, gossip,
   quest dialogs, NPC display IDs, health, spells, and coordinate goldens.
5. Reload or log out and let the watcher upload each stable SavedVariables revision.
6. Build maintainer coverage dashboards for unresolved boss models, untitled quests, unseen vendors,
   and evidence conflicts.

### Requires future content access

- exact encounter actors, combat forms, mechanics, health by difficulty/group size, and encounter
  coordinates;
- observed encounter loot and any statistically defensible frequency estimate;
- dungeon/raid NPC density and floor validation;
- WDT/ADT/WMO instance-map orientation and floor goldens.

### Separate catalog track

The world pipeline does not make the provisional Forever item/profession catalog publishable. That
track still needs a product-specific DB2 profile, budget-derived item fields, exact recipe/output and
profession joins, encrypted/unavailable-state handling, and golden in-game tooltip/recipe checks.
Item, recipe, profession, and transformation IDs must be imported into the same build graph before
Trader or BiS features can claim complete Forever coverage.

## Hard limits

The following cannot be truthfully recovered from these client files alone:

- complete authoritative creature spawn tables and live phase availability;
- complete boss loot tables or official drop rates;
- server-side health/scaling formulas and loot eligibility rules;
- quest prerequisite logic omitted from the client and server-only quest templates;
- encrypted records without keys supplied to the running client;
- models for creature IDs the client model API cannot resolve;
- content removed from both the installed build and all observed caches.

Closing those gaps requires live observations, an authorized Blizzard feed, or clearly labeled and
reviewed supplemental evidence such as AtlasLoot. Name similarity and nearby numeric IDs are never
acceptable substitutes.

## Release gates

A build can move beyond `review_required` only when:

- exact client and definitions revisions match the catalog and world snapshot;
- the hotfix cache requirement is satisfied;
- audits and snapshot-to-snapshot diffs pass;
- model controls and coordinate goldens pass for the exact build;
- public pages preserve evidence labels and honest empty states;
- runtime aggregation has coverage thresholds and cannot imply completeness from a single sample;
- database migrations, rollback, backup, strict typecheck, tests, lint, and production build pass.

Until those gates pass, build 69913 remains a review snapshot even though it is useful for the local
Encyclopedia and maintainer evidence collection.
