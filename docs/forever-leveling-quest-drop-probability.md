# Quest-drop probability in the leveling forecast

The model distinguishes an aggregate item-count/death ratio from a quest-eligible
player's chance to receive the item. Using the former as the latter can overstate
required kills and the XP earned while collecting. This correction precedes further
work on overlapping collection inventory.

## Evidence and calculation

The [CMaNGOS loot-table documentation](https://github.com/cmangos/issues/wiki/Loot_template#chanceorquestchance)
defines negative `ChanceOrQuestChance` as a quest-only drop. Visibility depends on
having an appropriate quest and still needing its items. An aggregate sample does
not establish how many recorded kills met those conditions.

The pinned historical database has these examples:

| Item / creature             | Captured aggregate ratio | Historical base quest-roll probability |
| --------------------------- | -----------------------: | -------------------------------------: |
| Gold Dust / Kobold Miner    |                   22.10% |                                    50% |
| Large Candle / Kobold Miner |                   17.02% |                                    66% |
| Brass Collar / Princess     |                   91.51% |                                   100% |

These historical percentages are reference inputs, not observed Forever rates. The
[pinned LootStoreItem::Roll implementation](https://github.com/cmangos/mangos-classic/blob/5731249195520323cb5fb9aa29761d4f033272ce/src/game/Loot/LootMgr.cpp)
also applies a configurable quest-drop multiplier. The reference calculation explicitly
uses a baseline multiplier of one; it does not establish the current server's setting
or other loot-visibility behavior. The checked source file has SHA-256
`9cedf4eeeb622a27909e500f3fd6a82e7ffb1cb9c717b266e131245bc4bd17c9`.

The original captured probability, basis, sample size, build, URL, timestamp and
checksum remain unchanged. A separate `probabilityReference` records the historical
probability, quest-only flag, baseline multiplier, actual loot-template ID and pinned
database provenance.

Probability selection is explicit:

1. Reported/override rates retain priority over historical rates.
2. For an aggregate sample with compatible historical quest-only context, use the
   historical base quest-roll probability as a labeled estimate.
3. For a compatible historical ordinary-drop context, retain the captured sample ratio.
4. A sample lacking compatible eligibility context remains unresolved. Fixed-one stack
   evidence alone does not establish a quest-eligible sample probability.

Current-build validation remains independent of the historical source build. Foreign
capture builds are still held. Provider upgrades discard historical probability context
if the creature or item identity changes, while preserving captured fields for review.
New captures are requalified through the preparation workflow.

## Prepared references

`artifacts/leveling/authorized-quest-roll-references` extends the authorized guide subset.
It includes 1,007 probability-context records: 901 quest-only and 106 ordinary-drop
references. These counts include any already-explicit reported rates, whose priority
is unchanged. Of 1,153 aggregate sample rows, 157 still lack a compatible context.
All 1,164 original capture rows and their probability/source/build fields are preserved.
There are no player recordings or dungeon-clear profiles.

Selection requires exact NPC/item names, the creature's actual `LootId`, an ungrouped
unconditional fixed-one row and no additional copies through reference-loot expansion.
The [historical loot runbook](forever-leveling-classic-loot-reference.md) describes the
SQL-literal parser, source pin, source license and rejected ambiguous cases.
Older stack-only references remain readable but do not qualify aggregate sample rates.

The current readers accept the prepared combination locally. The artifacts require
the matching code release and remain inactive live. This correction does not complete
joint collection inventory, on-route creature selection or overall no-grinding funding.
See the [current full audit](forever-leveling-no-grind-audit-2026-10-31.md).

## Reproduction

From the clean pinned database checkout, read the unchanged normalized native capture
subset and write a separate destination:

```sh
pnpm leveling:loot:classic:prepare \
  --combat=artifacts/leveling/authorized-guide-references/combat \
  --provider-root=.cache/leveling-no-grind-20261031/classic-db-reference \
  --revision=603ece109099ce44a5447a1b1cffd65c7272d71c \
  --destination=artifacts/leveling/authorized-quest-roll-references \
  --referenced-at=2026-10-31T22:41:50.344Z \
  --authorization-note='Owner approved publication of normalized guide-required NPC levels, quest kill counts and supporting guide records on 2026-10-31; player recordings and personal data are excluded.'
```

This reads local files without SQL execution, crawling or production activation.
Each generated reference is content-addressed, and the preparation report records
the input, output and source hashes. Tests cover preserved captures, separate rate
selection, explicit-rate priority, missing eligibility, legacy references, provider
identity changes, invalid metadata and the unchanged foreign-build guard.
