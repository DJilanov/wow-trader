# Forever leveling: required kills and dungeon combat XP

## Personal reference ownership

The local v76 / campaign v51 model builds a per-character reference view in `campaign-member-references.ts`. Original personal actions belong to player 1 unless the validated forecast ownership map assigns them to another player. Another character's personal activities and source-only objective indices are excluded from that view. Shared activities and unbound reference activities stay available. Provider objective indices and item requirements remain required; filtering a peer's source action cannot erase a real provider objective. Initial combat counters, saved-XP resets, item readiness, hand-in checks and combat use the same owning view. Already-held unobserved counts remain unknown.

`indexSharedPartyCombat(combat, activities)` can build a filtered index only from activities belonging to that exact plan. Each participant may supply its own `references` to `forecastSharedPartyCombat`; omitted views use the common plan, independently of the first participant's override. Indexes from another plan are rejected. Relevant active conflicts and personal-loot overlap still hold the shared calculation without partial state changes. Known physical kills pay every participating member, including helpers whose quest is already finished; only each character's applicable counters advance. These indexes are created lazily and reused within a forecast.

The reproduced Human Warrior case previously paid four Streamrunner kills twice when a Priest source variant overwrote the Warrior's counter metadata. After scoping, all three reproduced parties count four Streamrunners once and the same seven Murlocs. The Warrior's personal endpoint is consistently level 12 + 1,508 reference XP. The eight affected mixed settings lose the duplicated 300 reference XP. Removing it also changes a later row's conditional upper estimate; that row matches an unaffected same-character reference party. Other actors' source citations now correctly point to their own applicable guide. This is a reference calculation, not a measured server payout.

Eleven new tests cover owner/mapped-player isolation, full provider requirements, already-held counters, scoped/shared conflicts, helper XP, foreign indexes and mixed explicit/default views. The full suite passes 1,374 leveling, 192 web and 40 script tests. The source archive, reward facts, loot probabilities and XP modifiers are unchanged. Complete-route funding and the main joint-XP model remain open. The [current audit](forever-leveling-no-grind-audit-2026-10-31.md#current-status) records full matrix scope and the preserved earlier failures.

## Compositional party XP reference model

The additive `combat-party-frontier.ts` and `combat-party-envelope.ts` APIs now carry uncertainty through multiple NPC targets and level-dependent hand-ins. They do not yet replace the main campaign forecast. That reference review passed **1,337 tests**, including 32 new differential and boundary cases; 192 web and 31 script tests, strict checks and package/web builds also passed. Compiled main forecasts match all 528 retained default settings and 32 explicit mixed settings exactly. This is compatibility evidence, not newly funded routes or calibrated server payouts.

`createPartyXpFrontier` starts from one known set of one to five XP bars. `advancePartyXpKills` enumerates every integer creature level in the source range, evaluates all players at the same pre-kill party levels, and merges equal joint bars. Each state retains marginal earned-XP bounds, including paths that merge at the level-60 cap. `awardPartyXp` applies the caller's reward-by-level maps without combining unrelated minimum bars. The caller must prove eligibility and submit each one-time reward once. No spawn probabilities or expected mean are invented. Exact enumeration matches all 1,024 level-15/16 sequences in the reproduced q263 case: 248–258 Warrior XP and 232–242 per peer over its first ten kills.

Exact enumeration defaults to 4,096 states and 250,000 transitions per call. An unsupported payout, unknown rank/context or exhausted budget returns `unknown` without a partial result or input mutation. A marginal 24–30 observed payout does not prove a joint five-player payout pattern; the exact domain holds that uncertainty.

`enclosePartyXpFrontier` explicitly switches to a `conservative-box`. Its corners need not be attainable. `advancePartyXpEnvelopeKills` enumerates all joint player-level combinations admitted by that box, splits each XP interval at level boundaries, and encloses the resulting bars. It supports marginal observation bounds without asserting their correlation or dividing already-per-player XP again. `awardPartyXpEnvelope` checks every enclosed hand-in level, including intermediate levels. Missing context or the default 250,000-transition budget still holds the entire call. Earned-XP bounds and bar bounds are distinct conservative projections; their separate minima must not be presented as one exact trajectory or an expected mean.

The canonical conditional replay retries the entire uncredited phase from its last complete exact state when enumeration exceeds its budget. It then remains in the enclosure domain. The selected 150-kill sequence and one-time hand-ins reach the Thanes check in all eight Human five-class settings. The Mage's conditional exit remains **13 + 8,453–8,679 XP**, leaving **2,721–2,947 XP** to level 14. Three other mixed parties account for 24 settings with missing reached q263 bars: their earlier personal-starter holds remain explicit. These conditional bounds exclude unmodeled acquisition XP and do not newly qualify the starting bars, travel, server calibration or full 1–60 funding. The continuing route still needs eligible, connected quest work.

The earlier local checkpoints below remain historical. See the [reference review](forever-leveling-no-grind-audit-2026-10-31.md#joint-party-xp-reference-review) for party ranges and the distinction between new computation and unchanged main forecasts.

Local v66 verification is complete: 1,493 tests, strict checks, package/web builds, all 528 arithmetic witnesses and 28 native checks pass. All 2,640 default-character and 160 mixed-character capacity bounds pass at 20/40. The continuous ledgers, independent budgets and mixed player rows match v65; complete funding remains 0/528 default and 0/32 mixed settings. A separate replay of the complete existing capture archive fills 271 null item quantities and corroborates 391 stored quantities. Six identity holds and one conflicting provided-item classification remain excluded. Source controls for quests 86, 4161 and 95213 pass on this candidate, including rejection with 40 completed-unhanded quests. A read-only comparison also identifies historical XP fallback caused by the live reader’s 14-day freshness rule; no timestamps, rewards or validation are changed. Canonical inputs remain frozen; the separate data candidate, acquisition, complete-route XP and current-server payouts are unqualified. See the [current audit](forever-leveling-no-grind-audit-2026-10-31.md).

The later quantity-only review passes all 528 arithmetic cases, 28 native checks and 2,800 default/mixed character capacity bounds at 20/40 on the same frozen source. It changes 72 continuous ledgers, 128 chapter budgets and 80 mixed player rows. Complete funding remains 0/528 default and 0/32 mixed settings; the recovery is checked locally without live activation. The current audit also records the eight-quest historical quantity comparison and why moving the Warrior training chain alone does not resolve the shared starter’s XP gap.

The completed v65 snapshot represents source-backed collection before acceptance, tracks each member’s minimum holdings, consumes items once and preserves inventory/partial-objective state through funding resumes. Collection uses no quest-log slot until acceptance; completed quests retain their slots until hand-in. All 1,463 tests, strict checks, package/web builds, 528 arithmetic cases and 28 native checks pass. All 2,640 default-character and 160 mixed-character capacity bounds pass at 20/40. Complete funding remains 0/528 default and 0/32 mixed settings. New acquisition/kill XP and further item flows remain unqualified; conditional quest budgets are not guaranteed lower bounds or actual-server payouts. The current audit records a caught ready-visit integration regression, its failing test and the corrected full rerun. Earlier sections below describe preserved checkpoints. See the [current audit](forever-leveling-no-grind-audit-2026-10-31.md).

## Earlier v61 and v59 checkpoints

The preserved v61 review completed: 1,301 tests, all 528 default-setting arithmetic/capacity cases and 28 native exports pass. All quest/combat ledgers match v60; eight misplaced-check failures are removed, while the real 518-XP shared Night Elf gap remains. Four explicit mixed parties add 32 checked settings, with a peak of 15/40 active quests and additional source/prerequisite gaps. Complete funding remains 0/528 in the default matrix and 0/32 in the mixed review. An isolated source-guard trial advances three peer paths without inventing items or XP; it is not production behavior. See the [current review](forever-leveling-no-grind-audit-2026-10-31.md) for exact scopes and next implementation. The following v59 section is the previous accepted checkpoint.

The target remains the fastest practical five-player 1–60 route below 48 hours `/played` per player, with zero assumed grinding and efficient connected quest travel.

Previous accepted ledger: `quest-funded-visit-windows-20261101-v59`; campaign v35, funding policy v22 and native compiler v28. The preparer batches supported quest work within reached XP boundaries after funding. Level-crossing actions, source instructions and unsupported contexts stay fixed. Each proposal recalculates all sixteen supported settings, checks rescheduled combat at the lowest participant's level, preserves passed requirements, and enforces the [40-quest limit](forever-leveling-quest-log.md). The [funded-visit contract](forever-leveling-funded-visits.md) records the rules.

The fresh complete matrix passes **528 arithmetic witnesses / 21,488 chapter checks** and **2,640 complete-itinerary character quest-log bounds**, with a peak of **14/40**. **0/528 complete routes are funded.** All 528 continuous ledgers and independent chapter budgets are identical to v58. No reached requirement is lost, no first unsupported source action moves earlier, and no first deficit increases. The visit pass permits a shorter journey with less XP at the same already-unfunded requirement, but this revision needs no such trade.

Canonical ordering changes in 2 of 33 editions. Planned regional visits: human/warrior 114 → 113; human/warlock 113 → 111. Regional counts are planning scores, not measured journey minutes. Projected-quest visit lists in the conservation report additionally exclude skipped work and non-XP instructions; they are not a complete walking itinerary. Human Paladin and Priest retain their previous action order; the final source-context guards reject the weaker private prototypes. Cross-leg southern Darkshore scheduling remains open.

Separate Human reference frontiers are Warrior **15 + 11,560 XP**, **55,940 short of 19**; Paladin **16 + 4,855 XP**, **48,245 short of 19**; Priest **15 + 11,334 XP**, **56,166 short of 19**. No extra kills, compensation XP, inferred creature ranks or transport links were added. All 33 editions retain every action object's content/identity, source instruction order, saved-bookmark aliases and reward fact. The arithmetic kernel and source inputs are unchanged.

Checks pass **1,024 leveling + 192 web-leveling + 56 script tests (1,272)**, strict package typecheck/lint, package/web builds and **28/28 native compile/inventory/Lua checks**. The frozen core tree contains 219 files. The full audit exits 2 because complete routes remain unfunded; arithmetic, capacity and native checks pass. No in-game/browser check, ZIP, installation, crawl, commit or deployment was performed. Current-server payouts and the under-48-hour target remain unverified.

## Historical v39: ready hand-ins and pickup-provided deliveries

The current ready-visit compiler collects verified completed source hand-ins before a blocked pickup. The authorized catalog retains 464 pickup-provided item identities with item-export provenance; no NPC, quest objective, loot row, reward, recording or dungeon-clear input was changed.

It first preserves the established quest allocation, then proposes ready visits and rejects the proposal if any supported configuration reaches an earlier blocker or a larger deficit at the same task. It moves a whole active NPC visit within its existing leg/audience, checks every reachable supported configuration, preserves source IDs and class utilities, and admits a provided parcel only when its exact objective names the provided item and friendly recipient. Key-use objectives, collection work, item use, quest-state guards, training and unmodeled utility steps cannot be promoted. Information links are retained.

The separate Human/Warrior reference now reaches **9 + 5,337 XP**, still **1,163 XP short of the level-10 class pickup**, compared with the previous 3,523-XP gap. The shared starter now passes its old level-7 pickup and reaches **8 + 4,506 XP**, still **894 XP short of quest 109's level-9 pickup**.

These are known-input reference budgets, not measured Forever payouts or guaranteed drop outcomes. All 528 scenarios pass their arithmetic witness; **0/528 complete routes are funded**.

Local checks pass **777 leveling + 188 web-leveling + 50 script tests (1,015)**, strict typecheck/lint, package/web builds and 28 native compile/inventory/Lua checks. The live references and website remain unchanged; no ZIP, installation or crawl was started.

## November 1 v37 follow-up: source and preparation flow

Pre-departure funding now simulates at the earlier sourced hearth/flight, keeping later courier XP out of the local preparation budget. Human Paladin reaches level 12 + 4,321 XP before the shared route, with class training preserved. Exact one-item world-object tasks 3524/4681 contribute 1,660 quest XP per player and zero mob-drop kill XP; personal item collection and respawn/acquisition time are not treated as shared or measured.

The refreshed dungeon listing corrects five stale Thanes pickup levels and retains every old association. The existing level-14 recommendation replaces the stale 16 floor, with prior bookmarks preserved and higher eligibility claims still conservative. The Paladin reference reaches 14 + 68 XP before entry and 15 + 400 XP after quest rewards; the following At-level preparation still lacks 60,132 XP. Policy-specific selection, implicit pickup frontiers and required-source retention are implemented. Geographic rebatching, ready-hand-in sequencing, unknown combat and route deficits remain open. The 528-scenario arithmetic witness passes; complete funding remains 0/528. No deployment or crawl ran. The [current audit](forever-leveling-no-grind-audit-2026-10-31.md) contains exact source identities and receipts.

## November 1 follow-up: direct pickup eligibility

The catalog no longer treats a hand-in before an acceptance as a missing prerequisite
when an unguarded, unconditional standalone pickup corroborates the provider's empty
prerequisite list. Explicit gates, conditional-only pickups and actual provider chains
remain held or enforced. The first People's Militia pickup in chapter 125, step 0010,
provides the concrete regression. Its 12 → 13 → 14 follow-up chain is unchanged.

The new catalog has 108 eligible shared-kill candidates, up from 103. Twenty-five
records lose only an inferred visit-order hold; five become additional kill candidates.
Every NPC, combat objective, captured drop row and reward fact is unchanged. Funding
also avoids reduced low-level filler roots while permitting old prerequisites for a
current-level root. Human Paladin now funds Elwynn through level 11 + 4,246 XP, and the later pre-departure correction above resolves its Loch Modan class pickup. The complete 528-variant funding gate
still fails. Exact inputs and receipts are in the
[current audit](forever-leveling-no-grind-audit-2026-10-31.md).

## November 1 follow-up: supported joint collections

The local v28 ledger calculates the completion distribution for supported fixed-stack,
same-creature objectives together, rather than taking the maximum of their separate
means. The reviewed Fargodeep candle/dust task uses Kobold Tunnelers consistently in
the forecast, player instruction and native addon. Its supported required kills count
once. Book Return's overlapping remaining inventory stays unknown and cannot later
restart at a fresh full quota. Only this reviewed action loses the unrelated source
condition that otherwise hides the canonical candle/dust task.

The v28–v37 separate Human/Warrior reference reached level 9 + 2,977 XP before its level-10
class pickup, leaving 3,523 XP unsupported. These are rounded reference kill budgets,
not guaranteed drops or the exact statistical expectation of XP. Cross-phase inventory,
variable stacks and unqualified correlation remain held. See the
[calculation, eligibility and verification contract](forever-leveling-joint-collections.md)
and the [current full-audit status](forever-leveling-no-grind-audit-2026-10-31.md).

## November 1 follow-up: quest-eligible drop rates

Aggregate item/death samples do not establish a quest-eligible player's probability.
The corrected model keeps all captured fields unchanged and supplies 1,007 separately
scoped historical probability contexts: 901 quest-only and 106 ordinary-drop references.
Compatible quest-only contexts use the stated historical base roll at multiplier one;
ordinary-drop contexts retain the captured ratio, and reported overrides retain priority.
The other 157 sample rows remain unqualified. Fixed stacks alone are insufficient.
Identity changes on a provider upgrade invalidate historical probability context.

This correction reduces the separate Human/Warrior partial estimate from level 9 +
2,537 XP to level 9 + 1,513 XP before the same level-10 class pickup. The 528-scenario
arithmetic witness still passes and whole-route funding still fails. Source selection,
current-server limitations and reproduction are recorded in the
[probability contract](forever-leveling-quest-drop-probability.md). No crawl or deployment ran.

## November 1 follow-up: rewards at the actual hand-in level

The historical reward preparation now adds 870 level-specific tables after exact title,
quest-level and full-reward matching against the pinned database and XP rule. Full
rewards and pickup eligibility are unchanged; 445 differing/scripted candidates are
held. The JavaScript helper matches the actual pinned C++ method in 94,530 cases,
including all 51,330 prepared level rows.
The current chapter checks no longer stop on unresolved hand-in XP, which makes four
later Human chapter budgets calculable. They still contain real deficits or unknown
combat. The whole 528-variant route funding gate remains failed. See the
[hand-in preparation and its limits](forever-leveling-historical-hand-in-rewards.md).

## November 1 follow-up: explicit historical loot fields

The prepared combat extension now supplies 1,007 historical fixed-one stack references
and 604 pooled-sharing references, preserving every existing captured probability and
its source/build metadata. The source is a pinned Classic 1.12 database snapshot, not
current Forever observations. Exact NPC/item names, actual loot-template joins,
unconditional ungrouped rows and reference-loot expansion are checked. The normalized
artifact retains field-level provenance and the source license/copyright files.
See the [selection rules and reproducible command](forever-leveling-classic-loot-reference.md).

This exposed a separate overlap defect: individual mean collection times cannot be
reused as deterministic shared progress to establish a joint mean. The ledger now
holds unsupported joint inventory, while keeping deterministic drops and provably
dominated shared-kill requirements calculable. The full joint model remains incomplete.
The Human/Warrior separate-starter estimate now reaches level 9 + 1,513 XP before its
next unresolved level-10 class pickup. The early quest-244 courier is deferred to its
complete later party lifecycle, without granting XP or removing class training.
The full 528-variant route funding gate still fails; no deployment
or new crawl was started.

## November 1 follow-up: captured death counters and missing rewards

The authorized guide subset now includes 261 reviewed kill quotas, up from 54, using
220 existing quest captures. The importer requires matching quest/NPC identities and
explicit slain/killed/destroyed counters. It publishes normalized quantities and public
source provenance, excludes raw captures, and preserves conflicts instead of choosing a
convenient value. Six numeric disagreements and three objectives with a title mismatch
remain held. Selected conflicts block funding validation even if other XP meets the target.
The evidence-queue builder now includes those conflicts and deduplicates the page tasks.

The expanded candidate review also found 16 missing rewards. Eight were recovered from
the existing historical Questie table, with provenance, without changing any previous
reward fact. Four further historical zero rewards are now explicit: 657, 1641, 1645
and 1779. Seven custom candidate rewards remain unresolved. A prepared 23-quest review
queue separates seven missing facts, twelve optional historical refreshes
of historical values and conflicting counters. The crawler remains stopped.

The zero values come from explicit database fields and the pinned historical
`Quest::XPValue` rule, with scripts/spell rewards excluded. They are not inferred from
missing pages or asserted as measured Forever payouts. The combined import preserves
all earlier records; the isolated deployed reward reader retains all 1,617 previous
facts and adds four. See the [source and reproduction details](forever-leveling-historical-zero-rewards.md).

These normalized references and the supplemented historical import are prepared locally
under `artifacts/leveling/authorized-guide-references`; the current reader functions accept them locally.
They are not active live. The current full-audit receipt and exact input hashes are in
[the no-grinding review](forever-leveling-no-grind-audit-2026-10-31.md).

## October 31 follow-up: source corrections and shared loot

The current audit is in [the no-grinding review](forever-leveling-no-grind-audit-2026-10-31.md).
Its provider export now uses the documented `--include-authored` switch. The upstream
round-trip tests pass; previously captured loot quantities and acquisition evidence survive
the upgrade through a same-build, checksummed merge. No player recordings or dungeon-clear
profiles are inherited by that merge.

The provider item table also retains flag `2048`. CMaNGOS documents this as party loot
available to every eligible member, and its loot implementation retains each other player's
eligibility after one player takes their copy.
Sources: [item flag documentation](https://github.com/cmangos/issues/wiki/Item_template#flags),
[loot implementation](https://github.com/cmangos/mangos-classic/blob/master/src/game/Loot/LootMgr.cpp).
This is historical reference behavior; Forever's implementation remains unverified.

The full corrected static dataset has 496 quest-item objective rows carrying that flag.
The local inventory is `.cache/leveling-no-grind-20261031/multidrop-coverage.json`; that count
includes quests outside the selected guide. Goldtooth's item and Princess's collar carry
the flag; Gold Dust and the early wolf-meat/bandana rows have no such flag evidence here.

The new `shared-roll` model distinguishes a common corpse drop, copied to every eligible
member, from independent per-player rolls and a single pool divided among the party.
Its fixed/variable-stack distributions match one collector's completion time; neither
the quota nor the number of independent rolls is multiplied by five. Tests cover parties
of 2–5. The importer reads only the explicit bit from the documented item field, retains
the provider hashes and labels the interpretation as a historical reference. Missing
flags leave sharing unknown; the import supplies no probability or stack quantity.

The authorized guide subset now contains 203 shared-roll objectives, 148 with captured
quantities. Of those, 120 have a unique creature reference. A complete quota still needs
a compatible per-kill drop probability and, when relevant, its stack distribution.
An item-count/sample ratio with unknown stack sizes does not establish that probability.
The arithmetic and funding audit must be rerun when this reference revision changes.

Normalized item objectives also retain the provider's item name. This lets the existing
exact-name/counter parser reuse quest captures without an item-page fetch just to identify
the label. A captured item's own name takes precedence. Missing or ambiguous name matches
stay unresolved; this fallback supplies neither a drop rate nor a sharing rule.

The catalog inventory now also includes code-authored dungeon lead-ins, finish quests,
and optional route choices. The source archive alone omitted 164 normalized quest records.
Re-reading the existing published reward store recovered 107 additional reward facts,
including the Hall of Thanes quests, without restarting the crawler. The authorized
subset contains 1,726 quests and 2,804 NPCs, with no player recordings or clear profiles.

The synchronized-party regression covers five equal bars at level 1 + 390 XP: five
level-1 kills pay 42 reference XP per member under the existing no-bonus formula. The old
per-member loop paid 66 because peers remained at their previous levels.

The next revision also advances unequal bars together. With only the first player at
390 XP and the other four at zero, the first kill pays 10 each; the next four pay 14 to
the newly level-2 player and 8 to each level-1 teammate. Totals are **66, 42, 42, 42, 42**.
The result is independent of member iteration order. Tests cover 2–5 players, mixed
race/class identities, and multiple NPC/objective phases in one or separate actions.

The joint model requires known starting bars and matching relevant quest progress.
An earlier hand-in within an unequal-party combat action needs separate phase staging;
the current implementation holds that combat XP. A creature-level interval can use fixed
peer levels only while its maximum payout cannot level any member. Otherwise an exact
creature level is needed; no uniform distribution is invented. Uncertain peer exits are
not reused as exact bars for another objective in the same action. Controlled equal-level
kill observations stop applying once levels diverge. Missing dungeon tuning remains
unknown, and these mathematical tests do not establish current server rates.

Researched October 15, 2026. Historical feasibility audit and implementation plan, written before
the local implementation below. The research itself made no crawler, production, database, addon,
saved-variable or route-order changes.

Subsequent implementation: see [the combat-XP runbook](forever-leveling-combat-xp.md).
The findings below retain the original raw-layer research receipt; the implementation uses the
larger corrected Static export and does not claim measured dungeon coverage.

## Decision

Count required outdoor kills and the chosen dungeon clear as explicit sources of XP, rather than
leaving all combat as an unspecified buffer. This can make the premade route substantially more
focused, but mob levels alone do not establish the payout or the number of kills in a clear.
Use the owner's conservative solo-XP / party-size policy for the initial group estimate. Keep it
distinct from a claim that the live server always awards exactly that fraction. This approximation
is not a guaranteed lower bound when credit eligibility or boosting suppression is unresolved.

Preserve the existing simple policy for unconfirmed dungeon **quest rewards**: unscaled base XP
× 2.375 once, with collected final rewards taking precedence. That coefficient is not a combat
multiplier. Do not create another compensation/scenario control panel or a fixed XP buffer bonus.

## What the local audit found

The existing `packages/leveling/src/group-combat.ts` already calculates
`floor(soloXpPerKill / partySize) * kills`, including party sizes one and five. It validates inputs
and preserves unknown values. It does not discover objectives, levels, counts or Forever tuning.
The campaign ledger accepts combat activities, but the default quest-only audit supplies none;
it does not currently calculate the combat contribution requested here.

The build-70205 world snapshot has zero extracted `QuestObjective.effective` records and only
179 `CreatureDifficulty.effective` records. The difficulty fields contain minimum/maximum levels,
but these sparse records are not a complete hostile-creature catalog. Its 842 normalized
`creature-objectives` are achievement/criteria references, not 842 usable quest kill objectives.
Client extraction alone therefore cannot supply this model from our current snapshot.

### A useful additional source: QuestieDB Forever

Read-only research used revision `49e7dbca1f18eb3b8e57ee5d9562ac3e5c9adcc4` of
[QuestieDB](https://github.com/Questie/QuestieDB). Its NPC schema supplies IDs, names, level ranges,
rank and locations; its quest schema supplies typed objective references and prerequisite links.
It does not supply an authoritative Forever XP payout or a dungeon-clear population.

The feasibility pass parsed raw literal data without executing third-party Lua. Counts below
describe the **raw inherited baseline only**, before correction layers, not verified live content:

| Check                                                               | Raw discovery result |
| ------------------------------------------------------------------- | -------------------: |
| NPC records                                                         |               10,119 |
| Quest records                                                       |                4,244 |
| Our 2,535 queued quest IDs found in raw data                        |                2,230 |
| Queued quests with raw creature-objective references                |                  269 |
| Those 269 with level ranges for all referenced NPCs                 |                  269 |
| Distinct RestedXP `.mob` names                                      |                1,519 |
| Those names found in raw NPC data                                   |                1,373 |
| Candidate objective/count links from guide text plus NPC references | 70, across 37 quests |

One candidate count key has conflicting values; one matched name is ambiguous. Name matches
are discovery candidates, not an identity guarantee. The 305 quest IDs absent from the raw layer
may exist in corrections; they are not evidence that the effective provider lacks those quests.
The 157 guide variants contain 5,649 `.complete` rows, including repeated and conditional work;
neither that count nor the table above is a count of XP-ready unique activities.

Examples from the raw reference layer include Harvest Watchers, NPC 114, levels 14–15 for quest 9;
Defias Trappers, NPC 504, levels 12–13 and Defias Smugglers, NPC 95, levels 11–12 for quest 12.
These illustrate the join, not a certification of current Forever levels or quotas.

Before implementation, resolve the provider's effective layering: raw → inherited corrections →
generated delta-base → player traces → authored Forever corrections, with applicable dynamic
corrections applied last. Its documentation explicitly warns that the generated base is incomplete
and source/baked parity is not gameplay verification.
[Provider maintenance contract](https://github.com/Questie/QuestieDB/blob/49e7dbca1f18eb3b8e57ee5d9562ac3e5c9adcc4/docs/forever.md).
Review license/provenance compatibility before shipping provider content; public repository access
alone does not establish redistribution permission. No provider data has been integrated or published.

Private research receipt: `artifacts/leveling/audits/2026-10-15/combat-research/raw-provider-feasibility.json`.
It records the revision, raw-file SHA-256 values, counts and example references. The temporary
literal parser is a discovery aid, not a supported importer or a production dependency.

## Current dungeon XP: what is actually established

Blizzard's October 8 notes say dungeon creature kill XP increased by approximately 20%. The same
update restored individual-player-level treatment for ordinary lower-level-enemy penalties in
mixed-level parties. An extremely overleveled member can still suppress XP for the whole party.
This establishes a rule revision, not an absolute per-mob formula. The 20% is relative to the prior
Forever dungeon payout, not a statement that dungeons award 20% of Classic XP. The notes also
identify specific creature XP exceptions, including Stanley no longer awarding kill XP.
[Official October 8 notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/5).

Firsthand post-patch reports provide useful sanity checks, not a universal calibration:

- An October 9 RFC tester, level 14, reported approximately 9.5 XP bubbles while rested and
  estimated half that without rested: about 23.75% of a level. They later gave the five-player
  party as levels 15, 15, 14, 14, 14 and a 35–40 minute run. There is no counted mob manifest,
  exact XP total or rested-exhaustion log, so the un-rested number remains the author's estimate.
  [RFC test and party details](https://us.forums.blizzard.com/en/wow/t/so-i-tested-the-exp-in-rfc-post-change/2377311).
- An October 9 Hall of Thanes tester reported about 40 XP from a level-16 elite with rested XP.
  Their own level, dungeon party composition and exact kill context are not sufficiently specified
  to infer a server multiplier. Do not transplant that payout to every dungeon or divide it again.
  [Hall of Thanes report](https://us.forums.blizzard.com/en/wow/t/so-i-tested-dungon-xp/2377837).

We have not established a current, authoritative all-dungeon per-NPC XP table. A Classic-like
formula can seed labeled estimates, but server tuning, rank exceptions and actual party rules
must not be represented as confirmed merely because a historical emulator implements them.

## Calculation contract

For each ordered physical kill activity, retain creature IDs, required count or count range,
mob level range, location, active objective links, XP eligibility and evidence provenance.
Keep outdoor objectives, dungeon trash/bosses and optional extra pulls separate.

1. Evaluate the XP for each player's level **at that kill**, not at the chapter's advertised level.
   Apply the selected outdoor/dungeon tuning and relevant rank/creature exceptions. Unknown
   tuning stays estimated; unknown eligibility is not silently normal XP. Unknown level
   distributions produce ranges, not a fabricated uniform average.
2. In conservative solo mode use the full modeled solo payout. In conservative five-player mode
   use `floor(modeledSoloPayout / 5)` per physical kill. This intentionally omits any unverified
   party bonus. Real mixed-level behavior still needs per-member evaluation, not one shared number.
3. Keep quest turn-in XP whole for each eligible player. Do not divide it by party size. Never
   apply the dungeon-quest coefficient to kill XP or the October 8 combat buff to quest rewards.
4. A measured **per-player party payout** already includes server sharing. Do not divide it again.
   Likewise do not add the October 8 increase to measurements made after that patch. Default
   forecasts exclude rested; record and normalize it only when its contribution is known.
5. Credit a physical kill once. Ten shared kills completing two simultaneously active quests
   remain ten kills, not twenty or fifty. Distinct later stages/respawns remain distinct activities.
   Dungeon objective kills already in the clear manifest do not earn a second combat allocation.
6. Collection objectives need personal-versus-shared loot semantics and drop evidence. A required
   head is not automatically a one-kill objective for five people. Do not assume 100% drops or
   multiply every kill quota by five. Leave expected kills unknown when that evidence is missing;
   continue preferring shared kill/named-target quests over low-drop collection farms.
7. Apply combat before the subsequent hand-in, carry the actual XP bar through level-ups and
   recalculate later rewards at the resulting level. Rebase on saved actual bars without adding
   kills already included in those bars. Inside-dungeon kills cannot fund entry to that dungeon.

Arithmetic illustration only: 20 kills worth 100 solo XP each produce 2,000 solo XP or 400 XP
per player under the conservative five-player rule. This is not a measured Forever mob payout.

## Dungeon clear profiles

A clear profile must describe the chosen path: mandatory trash packs, required bosses and any
quest detours, with level/rank ranges and kill-count evidence. NPC coordinates are not a count
of spawns; a list of bosses is not a trash-clear profile. Preserve variant paths and repeated
runs, particularly LBRS gems, BRD attunements and living/undead Stratholme.

Start with Hall of Thanes, Ruins of Lordaeron, Deadmines, Stockade and Gnomeregan. Reuse reliable
legacy path data as estimates, then reconcile Forever changes. Unknown later dungeons can retain
explicit planning estimates without blocking the rest of the route; never label them measured
or infer their absolute combat XP from the quest-reward scaling coefficient.

Use available current first-person evidence to bound estimates now. To calibrate more precisely,
the smallest useful addition is an **opt-in passive kill-XP observer**, not the previously disabled
bulk NPC/quest scanners. Implementation needs a separate task and must first verify which XP and
kill events are actually available in the Forever client.

Capture build/time, map/instance, creature ID/level/rank when available, player level, party
size/levels, awarded XP and known rested/bonus context. Guard secret values before inspecting or
comparing them, skip unavailable fields and bound saved observations. Do not access protected UI.
An XP-bar change alone can mix kills, quests and exploration; normalized level-up deltas and
reliable event attribution are required, otherwise quarantine the sample. Localized XP chat may
not identify an NPC reliably; do not assume modern combat-log access or fabricate that association.

A practical initial validation set is controlled un-rested outdoor kills at several levels and
counted early-dungeon runs with ordinary five-player parties. Use separate holdout observations
and compare forecast versus actual end bars. This can calibrate accessible content without
requiring immediate access to every future dungeon. Do not extrapolate one successful fit into
verified level-60 coverage.

## Implementation order and player experience

1. Add a pinned, provenance-aware effective-data adapter and audit objective identity/count coverage.
   Reconcile conflicting quotas and retain unresolved cases explicitly. Run independently of the
   paced quest-reward crawler; do not restart it or turn 2,535 XP requests into new mob requests.
2. Compile shared physical combat activities from the selected race/class/faction route, not
   every conditional source variant. Join objective type/ID and quota before trusting name matches.
3. Extend pure TypeScript calculation with sequential per-player mob XP, source confidence and
   outdoor/dungeon profiles. Reuse the existing ledger and solo/group policy, rather than create
   an independent chapter calculator. Keep assumed payout and measured payout inputs distinct.
4. Integrate early-dungeon clear manifests and available calibration. Replay the entire 1–60 plan,
   find actual remaining XP shortfalls and remove filler only where the resulting forecast funds
   the next departure close to At-level. Preserve assumptions for unreleased packages.
5. Show a compact breakdown: quest hand-ins + required outdoor combat + dungeon combat → expected
   exit level/bar and remaining XP. Quest details can expose target mob levels and expected kills;
   retain a simple estimated/measured label. Feed the same compiled plan to the browser and later
   RestedXP export. No new mandatory player configuration is needed beyond the existing style.

Focused regressions must cover solo/five-player sharing, quest rewards remaining whole, overlapping
objectives, personal loot, sequential stages, dungeon overlap, no-XP/proxy creatures, gray mobs,
mixed levels, level-ups, rested normalization, post-patch values not rebuffed, measured party XP
not divided again, actual-bar rebasing and hard access checks before dungeon XP is available.

Success is a continuous, auditable XP forecast that lets us prune unnecessary questing, not a
promise that one clear awards a fixed fraction of a level. Until the data join and tuning are
implemented, production's quest-only deficit display remains incomplete as a total-play XP forecast.

Verification for this research handoff: all 21 existing tests in `group-combat.test.ts` and
`campaign-budget.test.ts` passed; focused Markdown formatting and `git diff --check` passed.
These verify existing software behavior/document formatting, not the proposed data import or
live-game XP rules. No implementation tests or in-game calibration were added by this task.
