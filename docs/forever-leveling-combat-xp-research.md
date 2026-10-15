# Forever leveling: required kills and dungeon combat XP

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
