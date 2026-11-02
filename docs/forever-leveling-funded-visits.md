# Funded quest visits and XP boundaries

The canonical preparer can batch newly added outdoor preparation after quest funding. The pass rearranges existing actions within one preparation leg; it adds no quests, rewards, kills, grinding, transport links or abandon instructions. It preserves action objects, source references, reward facts and saved-progress identities.

## Scheduling boundaries

`campaign-funded-visits.ts` builds the constraints; `campaign-visit-windows.ts` applies the existing visit sorter inside each bounded window. The pass resolves locations for sorting even when generated funding actions do not yet have location metadata. The final preparer refreshes combat/funding reviews, locations, travel and source hints after a change.

Every reached action that changes any participant's level is a fixed boundary across all supported preparation configurations. Instructions, personal work, raid/finish work, checkpoints, unlocated work and tasks with no reached projection also remain fixed. Unknown combat and unqualified loot work cannot enter a movable window. Source tasks with unsupported conditions, item use, gossip, timers or other unmodeled context remain fixed.

The sorter retains real prerequisite and quest-phase order. Its preceding location seeds a window without adding an action to the result. Original action objects are restored after sorting; neither internal origin markers nor replacement quest IDs enter saved state or exports. Interleaved leg entries are left unchanged.

## Proposal checks

An accepted proposal must reduce the full planned party regional-transition count. Its affected leg, including the preceding and following known location, must have a supported public-transport journey whose hop count does not increase. An unrelated missing transport link elsewhere does not establish a local route's cost and does not veto a separately supported local improvement.

After each proposal, the compiler recalculates every supported configuration. No passed requirement may become an earlier blocker. Reordered combat is rechecked at the lowest reached player's level, including existing action IDs; unknown ranks, unsupported encounters and work outside the current enemy band are held. Every character's complete selected itinerary must still fit the [40-quest limit](forever-leveling-quest-log.md).

A shorter journey may retain less XP at the same already-unfunded requirement. The smaller subtotal remains visible; no compensation XP is added. A previously funded configuration or earlier reached requirement cannot be traded away. The compiler repeats only accepted reductions until stable. Strictly decreasing the integer transition count bounds that process.

## Why XP is recalculated

Moving a hand-in can change the party's level before later kills. Moving a pickup can also combine compatible kill objectives, reducing both required kills and their XP. Preserving level-up actions alone does not establish an unchanged payout.

The regression fixture starts a level-2 party with two ten-kill objectives. Separately, their kills and the final hand-in reach level 3. Taking the second quest earlier combines the kills and ends at level 2 + 790 XP, 110 XP short. The guarded pass rejects that otherwise shorter ordering. Separate regressions cover the forty-first pickup, source training, actual prerequisites, all-configuration level boundaries, unsupported source context, mismatched references and idempotence.

## Earlier and later opportunities for the same generated quest

During funding, before the visit sorter, the compiler can offer a previously allocated normal shared-kill quest at an earlier unmet requirement. It retains the existing later opportunity: separate starters that are already high enough can skip the earlier work, while a shared starter can use it. Every character still receives its quest reward once, and completed kill objectives cannot earn another kill budget at the fallback.

This applies only to an unrestricted shared-kill root that the compiler previously generated entirely later in the route, with explicit normal creature ranks and known levels. Source-owned, required, raid, dungeon and finish work cannot be copied through this path. Already reached or earlier generated work is excluded, which bounds retries when one quest does not fill the whole gap. The proposed complete route is checked across all sixteen supported configurations; an earlier blocker, larger deficit at the same requirement or a character exceeding 40 slots rejects the proposal.

The source-phase selector also retains a later unconditional source phase when an earlier quest-guarded reminder would otherwise consume its completion witness. It preserves the selected original source commands and respects intervening hand-ins, abandonments, dependent pickups and audience conditions. It does not turn a false guard into true or supply XP for skipped work.

The native compiler must preserve the same generated opportunities. Compiler v30 validates each generated funding checkpoint as its own lifecycle when the quest has multiple opportunities and at least one is optional. It guards pickups with `.isQuestAvailable` and objective/hand-in work with `.isOnQuest`, so skipped early work remains available later and rewarded work skips. Each opportunity still needs a complete authored lifecycle. Ordinary duplicates retain normalization; source-owned or mixed lifecycles are outside this correction. The independent export reviewer checks the retained phase inventory and guards, rather than accepting a removal receipt alone. The current audit records all 784 default-selection leader/member export checks; this does not establish every five-person composition or in-game execution.

The initial selector-only trial was rejected because it allocated The People's Militia later and worsened the shared starter's class-pickup gap. The generated fallback correction addresses that allocation interaction. The [current audit](forever-leveling-no-grind-audit-2026-10-31.md) separates its preliminary Human Warrior evidence, final full-matrix checks and remaining progression gaps.

## Level-ten starter visits

The preparer applies a separate bounded transform after the ordinary funded-visit pass. It recognizes three reviewed Human starter lifecycles: Warrior training (1638/1639/1640/1665), flight couriers (6181/6281/6261) and Deeprun Rat Roundup (6661). A minimum-level-10 pickup must actually block a supported forecast before its rule is considered. Build, source archive and combat/catalog provider identity must match.

Every lifecycle needs exactly one pickup and reward in order, a real later starter anchor, the correct arrival zone and the original personal audience. The proposal retargets only reviewed pickup directives. It validates a friendly catalog giver and, where required, one exact giver position. Source conditions, item collection and unknown utility directives prevent replacing a pickup. Contextual English pickup instructions are rewritten for the new NPC/entrance; the transform does not claim byte-identical prose.

The Warrior pickup moves to Ilsa Corbin at the existing Stormwind visit. Monty's pickup moves to the Ironforge tram platform with no guessed coordinates. An explicit visit-location override prevents inherited source geography from returning it to Stormwind. Its objective and hand-in source commands, including flute use, remain intact. Combat activities move with their action's leg; this adds no kill quota or XP.

The flight-courier rule consolidates the reviewed early Westfall hand-ins, generated optional militia lifecycle and return flight into the later Westfall visit. Unexpected extra early Westfall work or an unsupported collection/lifecycle rejects consolidation. A pure obsolete transfer is removed and its bookmark aliases to the later visit. Transfer display markers such as `.target Thor` are allowed; flight-path unlocks, training and other functional utilities are barriers. The moved militia opportunity uses the later visit's level-14 funding boundary; its independently guarded later fallback is retained.

These moves are evaluated as one compound proposal: moving only the Warrior chain can expose the still-unavailable courier or rat pickup. After all applicable rules, every one of the sixteen supported default settings must preserve its executable funding frontier and fit each character's complete itinerary within 40 slots. Every moved trigger pickup must be reached and eligible for all five players. A partial or regressing proposal leaves the original plan intact. Funding and ordinary visit batching run again before final source controls, combat references and movements are refreshed.

The completed v71 audit checks all 33 editions / 528 settings, separate-starter mixed parties and 784 default leader/member exports. It retains eight raw chapter-boundary subtotal flags and independently verifies zero executable-frontier losses; moving tasks between chapters changes what a subtotal contains. This is not proof of acquisition, live payout, mixed-class together-starter behavior or a funded 1–60 route.

## Ground-pickup opportunities during existing visits

The local v72 preparer can offer Humble Beginnings during the reviewed starter Stormwind → Westfall → Stormwind journey. The selected later lifecycle must be three complete, optional, generated phases with exact catalog-backed pickup, chest and return coordinates. Build/provider/item/object/archive identities and the combat reference's single non-provided, non-creature item objective must agree. The transform does not add a chest location, drop probability or quest reward. Unexpected source actions, extra phases, restricted quests, incorrect arrival anchors or a missing later lifecycle leave the original plan intact.

Each early phase follows its existing arrival/NPC anchor. Stable new IDs identify the earlier opportunity; the original later IDs and saved bookmarks remain. All phases retain the same explicit `fundingGroundPickup` object/item reference. The earlier work remains personal during separate starters and shared in the supported together mode. Different personal starters keep the shared fallback. Funding runs again after the proposal; all sixteen default settings must preserve their executable frontier, reach an eligible early pickup and fit every character's complete itinerary within 40 slots.

Compiler v31 extends independent optional lifecycles to these generated interactions only when every phase agrees on the exact ground reference, quest identity and objective index. Every independent ground opportunity needs its object objective as well as its pickup and hand-in. Native pickups receive `.isQuestAvailable`; objectives and rewards receive `.isOnQuest`. The independent export verifier checks retained phases and guards, including rejection of a removed later phase or guard. Unproven interactions and source-owned repeats are not reinterpreted by this extension.

Regression checks cover an earlier skipped opportunity, a different-class personal starter using the shared fallback, one payment per player, full-log rejection and incompatible source/destination data. The completed v72 numerical/export review passes its homogeneous arithmetic, capacity and native checks, but actual mixed-party progression fails qualification: moving the leader's reward exposes ranged-creature level-crossing uncertainty and independent entry beyond an unready party. The current audit retains those failures and their exact reproductions. These must be corrected before accepting the optimization. Object availability, five-player looting/respawn time and current-server execution remain unqualified; zero creature kills does not mean zero time.

## Previous verification and limits

The [current no-grinding audit](forever-leveling-no-grind-audit-2026-10-31.md) records accepted revisions and pending checks. The completed v68 source/funding correction passes all 528 default-setting arithmetic witnesses, 2,640 character capacity bounds at 20/40, 28 native checks, an independent payment replay and 32 explicit mixed settings with 160 bounds at 19/40. It preserves early generated work while retaining later fallbacks, without counting another reward or kill quota for the same quest. Complete route funding remains held; passing these checks does not establish current-server payouts or an efficient full journey.

Regional transitions and transport hops are planning scores, not measured walking, sailing or clear times. This pass does not optimize same-zone geometry or move work between legs. It does not resolve the Priest's southern Darkshore return after Dun Morogh, missing creature references, current-server tuning, the complete 1–60 funding gaps or the under-48-hour goal.
