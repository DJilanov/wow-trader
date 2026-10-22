# Premade leveling: party handoff and kill-first Wetlands merge

Status: implementation verified locally; commit, push and deployment authorized on October 22.
Release preparation is in progress; the local receipts below are not deployment receipts.
This follows the October 21 player-experience release. It does not replace that release's
historical deployment receipt or claim the earlier checks covered the missed rendezvous case.

## What the player should see

- Personal starters end as personal chapters. Westfall no longer shares a chapter-level XP
  entry with the five-player Dun Morogh rendezvous.
- Chapter summaries say **Expected entry**, not an unexplained “Starting level” range.
- Every member's starter projection reaches the shared route. A blank saved bar does not
  become a level-1 teammate halfway through the itinerary, or a fictitious 90,160-XP grind.
- Other characters use their own selected Alliance race/class starter route. Missing identities
  use a clearly disclosed provisional starter estimate; missing source branches remain
  unresolved until identity/source data or an actual XP update is available.
- An actual XP update replaces that player's forecast at its fixed step. It is never copied
  from the leader to teammates, and estimates never mark actual quests complete.
- Exact-step bookmarks from the old merged Westfall/party chapter redirect to the new personal
  chapter. This narrow migration does not permit arbitrary cross-chapter step ownership.

In the production-equivalent quest-only local review, fresh Human Warrior Westfall finishes
at **level 14 · 31%** and the shared Dun Morogh chapter starts at **level 14 · 31%**.
The next dungeon requirement remains level 16. This is a projection with missing kill XP,
not a claim that everyone must grind the displayed difference.

## Why the old result was wrong

The guide initialized every member at level 1, then only executed Player 1's personal
starter actions. The final personal starter leg was merged into a party preparation chapter.
The resulting group range combined the leader's progressed bar with four untouched defaults.
Changing only the label or copying the leader's recorded bar would not fix that ledger.

`campaign-starters.ts` builds the supported starter variants using the same source compiler,
including the distinct Human/Dwarf Hunter branches. Shared source actions are deduplicated
before serialization. Only available authorized archive branches are included: an absent
alternate-race source cannot break an otherwise usable primary route.

`campaign-guide-party.ts` composes forecast-only personal branches. One XP ledger replays
each branch, carries paid quests, prerequisite state, uncertainty and combat overlap, and
then executes shared activities together. The XP engine accepts explicitly owned personal
forecast actions; its default reporting/forecast behavior remains leader-only. Actual
completion, pickup restrictions, saved XP and dungeon entry checks are not bypassed.

Starter branches assume personal progression until the rendezvous. Players who actually
group earlier should correct their bars; a solo-path projection is not a measured payout
for five characters farming together. Different-race members' updates made while browsing
the leader's personal route are applied at the shared rendezvous, not aligned to an invented
equivalent quest on their own branch.

The web loader requests reward evidence for alternate starter quests as well as the selected
shared route. Enriched catalogs are cached by evidence revision; guide scenarios/results
have bounded per-plan caches. The production combat-data publication check is unchanged.

## Quest-selection decision

Do **not** replace all Redridge work: its curated gnoll quests are genuine shared kills.
The bug was that the subsequent solo-source backbone could add personal collections back
into the premade itinerary despite the curated batch's kill-first instructions.

| Activity                                                                   | Decision                               | Reason                                                                                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Assessing the Threat, 246                                                  | Keep                                   | 10 Mongrels + 6 Poachers; shared kill objectives.                                                                                         |
| A Baying of Gnolls, 124                                                    | Keep                                   | 10 Brutes + 8 Mystics; shared kill objectives.                                                                                            |
| Ormer's Revenge, 294                                                       | Add to the Wetlands visit              | 10 Mottled Raptors + 10 Mottled Screechers; minimum pickup 22.                                                                            |
| Ormer's Revenge, 295                                                       | Add after returning 294                | 10 Mottled Scytheclaws + 10 Mottled Razormaws; minimum pickup 22.                                                                         |
| Greenwarden → Tramping Paws, 463 → 276                                     | Retain                                 | Existing chain; 15 Gnolls + 10 Mongrels in the kill stage.                                                                                |
| Dark Iron War, 303                                                         | Retain at minimum 25                   | Shared kills and an actual Stockade unlock; not available just because nearby quests are lower-level.                                     |
| Fire Taboo, 277                                                            | Retain as an explicit unlock exception | Nine personal Crude Flints; required on the selected Greenwarden → Excavation path. Do not invent shared loot or a guaranteed kill count. |
| Scales, goulash, fish, necklaces, War Banners, crocolisk skins, Sida's Bag | Exclude from filler selection          | Personal collection work is not a shared “kill X” objective. Exact rates are not assumed.                                                 |
| Gobbler/Sarltooth trophies                                                 | Not forced by this merge               | Named kills with personal-item ownership are not automatically one kill for all five.                                                     |

The new `wetlands-early-kills` phase runs **after Duskwood on the existing Wetlands journey**,
before the Greenwarden/Dun Modr preparation. Adjacent Wetlands phases share one area group.
It does not add a separate Wetlands trip between every southern quest batch or promise
that extra travel is free. Each raptor stage must be accepted before its kills count.

The kill-first closure now also applies to source-backbone additions from Redridge,
Duskwood/Redridge and the relevant Wetlands chapters (source IDs 7, 9, 10, 11, 128).
Optional collections, ambiguous objectives and children requiring those farms are held.
This also applies when a later region's quest tries to reintroduce an early collection
through its prerequisite chain.
The separate required-dungeon-unlock pass can retain a necessary collection. Other regions'
selection policy is not broadly rewritten by this targeted change.

### Evidence already available

No new crawl is required for the two Ormer stages. Both have published numeric XP and
pickup minima in the local quest snapshot. The reviewed records are:

- [Ormer's Revenge 294](https://www.wowhead.com/forever/quest=294/ormers-revenge)
- [Ormer's Revenge 295](https://www.wowhead.com/forever/quest=295/ormers-revenge)
- [Tramping Paws](https://www.wowhead.com/forever/quest=276/tramping-paws)
- [A Baying of Gnolls](https://www.wowhead.com/forever/quest=124/a-baying-of-gnolls)
- [Assessing the Threat](https://www.wowhead.com/forever/quest=246/assessing-the-threat)

Objective classification/counts were cross-checked against the local corrected quest
references and authorized source steps, not inferred from the quest names. Those private
combat references were not published or relabeled by this work.

## Verification and remaining work

- Regression tests cover the first shared entry, independent defaults, different-race
  prerequisites, leader-only actual reports, per-player corrections and absent starter data.
- Starter catalog tests cover supported variants, Hunter branch selection, deduplication,
  missing alternate archives and real pickup gates without forcing source level brackets.
- Route tests cover both Ormer stages for Hunter and non-Hunter sources, one-time lifecycle
  ordering, collection-backbone exclusion and retention of required unlock collections.
- The real-data audit checks all 33 race/class contexts. It now checks all selected sourced
  and planning dungeon stops, not an obsolete hard-coded count of 18. Source level ranges
  are references, not XP observations; personal/shared scope isolation is checked separately
  from the browser's continuous XP-bar assertion.
- Browser checks cover the original handoff regression in addition to the existing desktop,
  mobile, correction, save migration, optional-dungeon and real-entry-guard journeys.

Publication of the currently private combat dataset remains separate. Travel time, server
quest-item sharing, respawn competition and measured five-player completion times still
need playtesting before claiming the globally fastest route. No completion time or drop
probability is fabricated. Commit/push/deployment require the separate release workflow.

### Local verification receipt

- Leveling: **499 tests passed** across 41 files; typecheck, lint and package build passed.
- Full current-worktree web suite: **994 tests passed** across 122 files with one worker and
  unchanged test timeouts. Unrelated simulator edits were preserved, not authored by this pass.
- Web typecheck, focused lint, optimized webpack build and all 57 static pages passed.
- The checksummed archive audit passed all **33** supported race/class contexts against
  **61** authorized source chapters. This checks data/flow, not a full in-game playthrough.
- Full local-reference browser flow passed at 1440 and 390 px, including mixed-race starters,
  the formerly merged starter bookmark, stable updates, actual-progress isolation and entry
  guards. Receipt: `wow-trader-player-flow-full-VrYFc9` in the temporary review directory.
- Optimized, production-equivalent quest-only flow passed both widths with private combat
  references withheld. Receipt: `wow-trader-player-flow-quest-only-GEey65`.
- The generated **standalone server**, with its generated static assets staged locally,
  separately passed HTTP/browser checks at both widths for the level-14 · 31% rendezvous
  entry and old-bookmark redirect, with no browser page errors.
- Party-card screenshots were visually reviewed; local ignored artifacts are
  `artifacts/leveling/player-experience-review-20261021/party-handoff-{1440,390}.png`.

An intermediate repeated development sweep (`wow-trader-player-flow-full-9Ik0B8`) failed
when Next's development server logged its used-memory-threshold restart and reset the
connection. The fresh full-reference rerun passed; the failure is retained, not relabeled.
The `next start` preview also emitted its standalone-launch warning and destination-stream
closure messages during navigation. Logs were not suppressed, and their exact request-level
origin was not established. The actual generated standalone entrypoint was therefore checked
separately, rather than treating the unsupported preview launcher as packaging verification.

No crawler was started, private reference data published, addon installed, or production
service changed. Temporary local preview servers are stopped after verification.
