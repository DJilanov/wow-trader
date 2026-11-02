# Historical loot fields in the leveling XP forecast

This reference supplies missing stack, sharing and probability-context assumptions for required collection
quests. It does not establish current Forever behavior or change captured drop rates.
The no-grinding guide remains unreleased; see the
[full XP audit](forever-leveling-no-grind-audit-2026-10-31.md).

## Reference-only drops when a capture is missing

The preparer accepts `--include-reference-only-drops` as an explicit opt-in. It adds corrected quest creature/item pairs to the SQL selection even when there is no captured drop row. The existing exact-name checks, actual loot-template joins, direct ungrouped fixed-one requirements and reference-template ambiguity holds still apply. Provided and ground-pickup items do not become creature-drop candidates.

These records live in a separate `historicalLoot` reference. They do not become `lootDrops`, acquire fake capture timestamps or claim the target build as their historical source build. The dataset validator checks their target build, corrected item names, creature names and non-provided quest relations. The quota resolver consults them only when the exact captured pair is absent. An existing captured rate, unresolved captured sample, duplicate capture or foreign-build hold keeps its original precedence. The joint collection model retains the historical template identity when checking its independence assumptions.

The local private candidate adds **3,762 historical-only pairs** while preserving all **1,164 captured drop records, 1,726 quest records and 2,804 NPC records**, including **185 unknown ranks**, exactly. The historical source build remains **5875**; the reference target is **70205**. No current Forever rate, new-server multiplier, observed kill count or full-route completion is established by this normalization. The original input and production artifact locations remain unchanged.

Source-backed standalone `.collect` steps still add no acquisition XP. Their stock targets are distinct from the accepted-quest loot objectives handled by this fallback. Their eventual combat model must use the captured on-route creature, honor initial holdings and earlier loot, and count combined kill/material work as one physical stream. For example, the source gathering Crag Boar Ribs also requires eight Elder Crag Boar kills for quest 319; paying both full independent workloads would double-count the same fights.

## Source and selection

The source is the [CMaNGOS Classic database](https://github.com/cmangos/classic-db),
revision `603ece109099ce44a5447a1b1cffd65c7272d71c`, file
`Full_DB/ClassicDB_1_12_1_z2815.sql.gz`, SHA-256
`4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0`.
This is a historical client-1.12 snapshot, not the database after applying every later
update and not a Forever server export. The input file must match its pinned Git blob.

The parser reads SQL literals without executing SQL. It joins a creature's actual `LootId`
to its loot template; it does not assume the NPC and loot-template IDs are equal. Exact
NPC and item names must also match the existing normalized guide references. Reference-loot
expansion is checked for additional copies of the same item. Cyclic or missing references
stay unresolved. Grouped, conditional, variable-stack and zero-chance rows do not supply
a fixed-one stack assumption.

The [loot implementation](https://github.com/cmangos/mangos-classic/blob/master/src/game/Loot/LootMgr.cpp)
uses item flag 2048 for copies available to each eligible member. That historical flag
distinguishes `shared-roll` from a single pooled supply. This is a source-specific reference;
Group Loot alone still does not prove an item's sharing rule on Forever.

## Prepared output

`artifacts/leveling/authorized-quest-roll-references` contains the current preparation:

- A checksummed, guide-scoped historical reference, with 725 compatible items and
  1,007 fixed-one NPC/item pairs.
- An enriched combat artifact, adding 1,007 stack references and 604 sharing references.
- Separate base probability/quest-visibility contexts for 1,007 fixed-one drop pairs.
- The source license and copyright files, retained with the derived reference.
- A preparation report identifying the original combat artifact, source revision,
  checksums, selection counts and output combat checksum.

The original 1,164 captured drop probabilities, sample sizes, URLs, timestamps,
checksums and build fields remain unchanged. Existing quantities and sharing rules
take precedence. The historical source build is recorded separately as 5875 on each
new field reference; it does not replace a captured probability's build. The existing
foreign-build guard remains enforced. No player recordings or dungeon-clear profiles
are included.

The probability-context extension prevents an aggregate item/death ratio from being
silently treated as a quest-eligible rate. It uses a compatible historical quest-roll
reference at a stated baseline multiplier of one, keeps qualified ordinary-drop samples,
and holds unqualified samples. Explicit reported rates retain priority. See the
[selection rules, examples and limits](forever-leveling-quest-drop-probability.md).

The linked quest catalog stays at `artifacts/leveling/authorized-guide-references`.
The current worktree's reader functions accept the prepared combination locally.
The artifacts require the matching code release; compatibility with the old deployed
readers is not claimed. No live environment or release pointer was changed.

## Calculation limits

A fixed stack and a sharing rule can make a captured item-count/sample ratio usable
in the reference calculation. Its resulting kills remain probabilistic estimates,
not guaranteed drops or measured current-server payouts.

Multiple collections from the same NPC need a joint inventory model. The maximum
of their separate mean completion times is generally not their joint expected time.
For two independent one-item drops with probability 1/2, each individual mean is
2 kills, but the expected time to finish both is 8/3 kills.

The ledger therefore holds unresolved overlapping loot rather than substituting a
shared deterministic kill counter. It preserves calculable cases: guaranteed drops,
separate NPCs, quests accepted after earlier work, and deterministic requirements
that cannot outlast the collection's minimum kill count. Known shared kills still
count once. An unresolved collection is not restarted with a fresh full quota after
another task may already have changed its inventory.

This guard is a correctness boundary, not completion of the joint inventory model.
Resolving that model and the remaining route gaps is still required for the original
whole-guide objective.

## Reproduction

Use a clean, pinned checkout. A fresh source can be prepared with:

```sh
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/cmangos/classic-db.git \
  .cache/leveling-no-grind-20261031/classic-db-reference
git -C .cache/leveling-no-grind-20261031/classic-db-reference \
  fetch --depth 1 origin 603ece109099ce44a5447a1b1cffd65c7272d71c
git -C .cache/leveling-no-grind-20261031/classic-db-reference checkout --detach FETCH_HEAD
git -C .cache/leveling-no-grind-20261031/classic-db-reference sparse-checkout set Full_DB
```

The preparation command reads local files and does not crawl,
execute SQL, install an addon or activate production:

```sh
pnpm leveling:loot:classic:prepare \
  --combat=artifacts/leveling/authorized-guide-references/combat \
  --provider-root=.cache/leveling-no-grind-20261031/classic-db-reference \
  --revision=603ece109099ce44a5447a1b1cffd65c7272d71c \
  --destination=artifacts/leveling/authorized-quest-roll-references \
  --referenced-at=2026-10-31T22:41:50.344Z \
  --authorization-note='Owner approved publication of normalized guide-required NPC levels, quest kill counts and supporting guide records on 2026-10-31; player recordings and personal data are excluded.'
```

Omit `--authorization-note` for private research output. Changing a source, reference
timestamp or authorization text produces a new content hash. Destinations cannot
overlap inputs. The original artifact remains unchanged.

The current preparation has combat checksum
`80842c382ca5fe1af63ab39216f165c0b1d2ff153c174971934d809e31c795fd`;
the historical reference checksum is
`f672e3a972689410ce9390df9dbbfd0a0bc273a4a9d28249384b0388e9a3ca06`.
The input combat checksum is
`8a41786ecad9675b3907b59bcdd42eb61dd9f4b62e9728c5cbd27b36deda2047`.

The earlier stack/sharing-only artifacts remain unchanged under
`artifacts/leveling/authorized-classic-loot-references`. Their prior receipts describe
their own inputs; the current preparation additionally records probability context.
