# Quest-drop probability in the leveling forecast

**Current local component (V207):** Baron level 17 is owner-confirmed; Data Rescue uses its captured punch-card puzzle. All 3,078 relevant tests, 48 workload forecasts and 20 native/Lua exports pass. The expected minimum still needs **2,821 XP/player for level 29**. Fresh production preparation, full 1–60 and every original other-group edition remain unfinished and undeployed. [Current results and remaining work](forever-leveling-product-plan.md#current-local-component--punch-card-and-baron-v207).

**Previous component work (V161):** complete object handoffs now qualify without fake NPCs or completion counters. The actual 279→281→284→285→286 component preserves the supplied statuette, full head quota, source guards and prerequisites; all five class exports pass. The archive audit preserves 28 prior handoffs and 76 collection methods. No actual route XP was recalculated. [Implementation, checks and remaining work](forever-leveling-product-plan.md#current-local-component--object-handoffs-without-xp-replay-v161).

**Previous component work (V160):** the complete mixed Claws from the Deep method now qualifies with twelve shared Bluegill kills and one head per player. All 75 previous collection methods remain unchanged; +4/+5 boundaries, journal limits and five native exports pass. No actual route XP was recalculated. [Implementation, checks and remaining work](forever-leveling-product-plan.md#current-local-component--complete-mixed-method-without-xp-replay-v160).

**Previous binding work (V159):** the complete captured Claws from the Deep method now proves the missing head counter at 2 separately from twelve Bluegill kills at 1. Five class/component exports pass, with no actual route XP replay. [Current proof and remaining integration](forever-leveling-product-plan.md#current-local-data--mixed-item-counter-without-xp-replay-v159).

**Previous data work (V158):** object recipients are now preserved separately for 73 quests / 74 locations, with reciprocal provider relations and provenance checks. Funding eligibility and saved XP calculations are unchanged. [Implementation and remaining qualification](forever-leveling-product-plan.md#current-local-data--object-recipients-without-xp-replay-v158).

**Historical policy change (V157, November 3):** +4 above the lowest participating player; +5 excluded for ordinary enemies, with dungeon bosses retaining separate rules. The owner requested **no XP recalculation** for this change. The last full replay is V156; earlier +3-policy reviews below are historical. See the [current implementation, checks and remaining work](forever-leveling-product-plan.md#current-local-policy--four-level-cap-without-xp-replay-v157).

As of local ledger v107, the planner uses an available compatible captured drop-table
percentage ahead of historical probabilities. It labels a sampled ratio with its URL
and capture date as a planning estimate. No owner-supplied percentage replaces a crawl
record. Historical fixed-one stack and sharing assumptions remain separately identified.

A sampled item-count/death ratio does not prove the current server's quest-eligible
drop chance. It can overstate the kills required if some sampled players did not need
the item. The forecast remains conditional on the stored estimate; it does not claim
measured Forever tuning or guaranteed completion time.

## Current route sensitivity — v154

The new source-qualified NPC handoff preserves all earlier rewards, combat, drop and suppression rules. All 24 default cases first stop at Blackfathom: fast **23 + 9,489**, expected **23 + 14,769**, slow **23 + 19,699** at their conditional minima. These are reference scenarios, not confidence bounds, mean real-world outcomes or observed payouts. The enemy ceiling remains +3 and WC pays its one-time rewards once. [Current verification](forever-leveling-product-plan.md#current-local-review--bounded-npc-wording-and-captured-wait-v154); receipt `.cache/leveling-no-grind-20261031/verification-npc-waits-v154.json`. Local only; nothing deployed.

<a id="current-route-sensitivity--v153"></a>

## Previous route sensitivity — v153

Fire Taboo now reaches the actual earlier route with its full **45-flint** party demand and unchanged captured probability. All 24 default loot cases first stop at Blackfathom: fast **23 + 9,259**, expected **23 + 14,539**, slow **23 + 19,469** at their conditional minima. These scenarios are not confidence bounds, mean real-world outcomes or observed payouts. WC still pays its one-time rewards once. [Current verification](forever-leveling-product-plan.md#current-local-review--outdoor-wetlands-chain-and-bookmarks-v153); continuous 1–60 and measured speed remain open.

<a id="current-route-sensitivity--v149"></a>

## Previous route sensitivity — v149

All 24 default fast/expected/slow cases now reach Blackfathom after the entire late coastal quest is excluded with WC selected. No drop probability or suppression rule changes. The skipped path retains the full outdoor work and its real earlier gates. [Current verification](forever-leveling-product-plan.md#current-local-review--optional-wc-and-outdoor-alternatives-v149); these are conditional reference scenarios, not confidence bounds or observed payouts.

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

1. Use the compatible captured row's probability, including an existing explicit
   reported/override row. Historical probability context never replaces that value.
2. A sampled ratio is usable as a labeled estimate only with fixed-one drop evidence.
   Unknown or multi-item stacks still cannot turn an item-count ratio into an event rate.
3. Quantities, sharing, duplicate captures and source/target build checks still apply.
   A captured row that fails those checks cannot fall through to historical probability.
4. Only an absent captured creature/item pair may use the separate, explicitly labeled
   historical fallback. Missing data is not filled with an owner estimate.

This supersedes the earlier historical-quest-roll-first selection. Its frozen receipts
remain historical records and are not evidence of the current numerical policy.

Current-build validation remains independent of the historical source build. Foreign
capture builds are still held. Provider upgrades reuse captures only when both item and
creature names establish the same identities. Missing, conflicting or changed item names
require requalification. Changed item identities also cannot inherit old collection quantities,
sharing or acquisition evidence. Missing NPC names never match each other. These additional
identity guards were verified in v108. The previous immutable dataset retains the original capture;
an explicitly supplied current capture takes precedence after requalification.

## Bandana example and coverage — November 2, 2026

The normalized Red Burlap Bandana / Defias Thug record has probability **9/19 = 47.37%**,
sample size 19, capture date **2026-10-20T07:02:34.980Z** and source
`https://www.wowhead.com/forever/item=752/red-burlap-bandana`.
Its source hash is `2a0745780c07c99a401fa4d64aec5804e1eab8fac20beb348e6666519f4d35e2`.
The separate historical 80% context no longer overrides it. Twelve pooled items each
for five players means 60 items and 126.67 expected kills, rounded up to **127** for
planning. This conditional single-creature calculation does not resolve the uncaptured
same-name alternative NPC or establish that the route has selected this quest.

A read-only audit of the current private normalized combat snapshot finds:

| Scope                           | Distinct creature-linked items | With captured percentages | Without |
| ------------------------------- | -----------------------------: | ------------------------: | ------: |
| All normalized quest references |                            526 |                       336 |     190 |
| Current selected primary route  |                             94 |                        91 |       3 |

The three selected items lacking a capture are Krastinov's Bag of Horrors (13725,
quest 5515), Book of Incantations (18261, quest 7441), and Lethtendris's Web (18426,
quest 7488). Their actual acquisition methods and missing quantities still need review;
this audit does not automatically classify them as ordinary mob farms. It excludes
provided and world-object acquisitions and does not imply every possible creature source
for a covered item has a percentage. The saved audit is
`.cache/leveling-no-grind-20261031/loot-rounding-v110-review/independent-data-review.json`.
The earlier 70/73 selected-item census remains in `captured-drop-rate-coverage-20261102.json`;
22 newly retained quests expanded the selected creature-linked item set.

The older server-staged item-752 record, captured October 8, contains a dropped-by
relation but no percentage. No fresh live-page percentage was verified: the automated
page request returns a JavaScript/robot check. Neither that gap nor the owner's rough
50% example has been turned into a captured fact.

## Camp selection and numerical ceilings

The owner-selected policy in campaign211 chooses the **lowest maximum creature level**
among qualified source alternatives. It applies both within an outdoor collection step
and across complete eligible captured methods. Equal-level choices compare expected kill
cost. The chosen creature's own captured probability and full party quota determine the
kill workload and XP; a different higher-level source does not set the quest's combat
floor. Explicit source constraints, unique compatible drop evidence and existing safety
limits still apply. This does not infer where a creature spawns or how quickly it respawns.

The actual Dream Dust references demonstrate the change: level34–35 Adolescent Whelps,
approximately52.98% captured drops, ten pooled items per player, fifty total items for
five players,95 expected kills and106 slow-workload kills. The old level42–43
Scalebane choice had a better percentage but was not required for this item.


Local party-policy v5 applies the owner's strictly >25% rule to fully resolved shared-five
collections with compatible captured rates, known normal outdoor creatures and outdoor
activities bound to the same quest, objective, item and chosen creature (v111). A missing or historical-only capture, manual probability override, unknown
sharing/quantity or unknown/elite target does not receive this cap exception. Each item's
full party quota remains; one high-rate ingredient cannot hide a scarce ingredient.
Qualifying source collections also retain the exception through a prerequisite chain.
This does not measure camp respawn, completion time or optimality.

The actual wolf capture illustrates a separate arithmetic issue: its stored rate is
`0.6666666666666665`. Forty pooled items have a mean of `60.000000000000014`, which a raw
ceiling rounds to 61. Local v110 uses a shared integer-ceiling helper in individual and
joint budget paths, snapping only within eight relative machine epsilons of an integer.
The rate and raw mean remain unchanged, fast/slow quantiles remain unchanged, and a genuine
mean of `60 + 1e-10` still budgets 61. The actual route now uses 60 expected wolf kills,
with all eight items per player retained. This tolerance is not a probability confidence
interval or an excuse to accept a material joint-mean uncertainty.

## Prepared references

`artifacts/leveling/authorized-quest-roll-references` extends the authorized guide subset.
It includes 1,007 probability-context records: 901 quest-only and 106 ordinary-drop
references. These counts include any already-explicit reported rates, whose priority
is unchanged. Of 1,153 aggregate sample rows, 157 lack a compatible historical context;
that absence alone no longer disqualifies an otherwise usable fixed-one captured estimate.
All 1,164 original capture rows and their probability/source/build fields are preserved.
There are no player recordings or dungeon-clear profiles.

Selection requires exact NPC/item names, the creature's actual `LootId`, an ungrouped
unconditional fixed-one row and no additional copies through reference-loot expansion.
The [historical loot runbook](forever-leveling-classic-loot-reference.md) describes the
SQL-literal parser, source pin, source license and rejected ambiguous cases.
Older stack-only references remain readable and can supply the separately labeled
fixed-one assumption required to interpret a sampled count ratio.

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
selection, explicit-rate priority, missing stack/sharing evidence, legacy references, provider
identity changes, invalid metadata and the unchanged foreign-build guard.
