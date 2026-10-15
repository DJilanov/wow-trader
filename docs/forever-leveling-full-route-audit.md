# Forever leveling: whole-route XP and feasibility audit

## October 15 combat implementation follow-up

The local [required combat XP implementation](forever-leveling-combat-xp.md) now joins corrected
NPC levels and reconciled required kills to the route ledger. The frozen audits below retain their
historical quest-only inputs; they are not current combat-inclusive results. There are still no
reviewed dungeon populations or calibrated kill contexts in the new import, so this delivery does
not certify a funded 1–60 route or supersede unresolved source/eligibility evidence.

## October 15 r7 follow-up: flexible entries do not fund the route

The owner's seventh correction identifies another real problem, not merely a misunderstanding of
the labels. Production r7 remains a preset itinerary with XP diagnostics. It has not been generated
from enough payable quests/combat to meet its departure gates. The replacement implementation
contract is now the [binding XP-funded plan](forever-leveling-product-plan.md#binding-correction-plan-xp-funded-dungeon-appointments-october-15-2026).
This follow-up supersedes historical local-only status and fixed-entry policies in older sections.

### Frozen evidence and scope

- Production source baseline: `kfc-helper-library-20261015-r7`, committed leveling code `6429682`
  plus `418f25f`; public browser audit confirmed the Hall/next-departure example on r7.
- Authorized archive SHA: `af3fec7909e0b5a1dd8659f87e67171f8984af40a22b997e630a0052a11c871e`.
- Published XP index frozen at `2026-10-15T08:01:28.006Z`; index SHA
  `d6a2e74a6fa335f091544a47607210a334b518d21c698f6640a834daf2b132da`.
  All 626 referenced records passed schema, freshness, identity and checksum reads. 328 have
  available numeric XP; 298 are unknown; none are marked conflicting in this artifact.
- Human/warrior schedules 334 distinct hand-in IDs; 294 have typed available XP facts, 40 do not.
  Availability of a numeric fact is not proof of a legal pickup/hand-in at the planned level.
- Current group-profile full-source compiler: 1,074 quest candidates; 922 have complete non-held
  source stages. Categories: 87 shared kills, 22 named trophies, 330 collections, 473 deliveries,
  28 interactions, 134 unclassified. Alternatives, already-scheduled work and unreviewed real
  eligibility are included; these are not independent additional usable XP rewards.
- All 59 level-up costs use the previously extracted build-70205 curve. Total 1 + 0 → 60:
  4,084,700. Total 45 + 0 → 60: 2,424,700. The extraction has not established compatibility with
  every newer build/server rule; revalidation is a required input gate, not a hidden assumption.

Local frozen evidence is under `artifacts/leveling/audits/2026-10-15/entry-plan/` (ignored by Git):
`quest-xp/index.json`, its checksum-addressed records, `entry-schedule-audit.json`, and
`audit/campaign-xp-audit-97739d108a29c405.json`. The last file's semantic SHA is
`97739d108a29c4050bfbd66dccd437999d572affbc2da5198eb48edc073ec98d`.

Reproduced existing audit: 33 editions, 132 policy/raid scenarios, 6,000 independent checks;
912 blocked, 3,172 incomplete, 1,832 shortfall, 84 reference-covered. The content gate exits **2**.
Its default cumulative case supplies only Player 1's start, not five complete personal branches.
Neither independent chapters nor that default scenario certify a whole-party route.

```sh
node scripts/audit-leveling-quest-xp.mjs --destination=artifacts/leveling/audits/2026-10-15/entry-plan/recheck --rewards=artifacts/leveling/audits/2026-10-15/entry-plan --require-covered
```

### The level-16 example, calculated explicitly

| Transition | Required XP |
| ---------- | ----------: |
| 16 → 17    |      16,000 |
| 17 → 18    |      17,700 |
| 18 → 19    |      19,400 |
| 16 → 19    |      53,100 |

Hall's five published quest references at 16 are 2,950 + 2,300 + 3,200 + 2,300 + 2,550 = **13,300**.
Starting at 16 + 0, their hand-ins alone leave 16 + 13,300, not level 19. Farsen's Watch, Nip 'Em
in the Bud and Underground Map add 680 + 910 + 1,050 = 2,640 if still unpaid and eligible.
Even all eight then give 15,940, below a complete 16→17 bar. Actual clear/travel combat is additional
and must be counted from an explicit compatible model or observed bar, not guessed as three levels.

The live panel's 19 is the next dungeon's difficulty-policy departure target. It is not a derived
Hall exit. Displaying that target within Hall, followed by a thin incomplete Darkshore batch,
does not satisfy the required 39,800 remaining XP after Hall's hand-ins from the empty level-16 bar.

Another arithmetic check: Ruins' three core references (16,300) plus Deadmines' four (13,500),
starting hypothetically at 19 + 0 with legal completed prerequisites, end at 20 + 8,500 before combat.
Reaching 25 from there still needs 128,300. This is a reward illustration, not a continuous itinerary
or permission to ignore the travel/order/preparation. Moving dungeon entries earlier alone does
not fill the outdoor route.

### Every requested stop was inspected

The totals below are **current scheduled dungeon-leg hand-ins at one reference entry level**, with
raid goals enabled and no combat. They are not the full available quest pool, not a continuous
level-adjusted replay, not a one-clear claim, and not evidence of live-server reward accuracy.
Exterior/preparation XP belongs to its own events. Missing modules do not have zero actual XP.

| Requested package                          |                   At-level reference | Current conservative entry | Scheduled hand-ins |                 Known reference subtotal at that entry |
| ------------------------------------------ | -----------------------------------: | -------------------------: | -----------------: | -----------------------------------------------------: |
| Hall of Thanes                             |                                   14 |                         16 |                  5 |                                                 13,300 |
| Ruins of Lordaeron                         |                                   19 |                         19 |                  3 |                                                 16,300 |
| Deadmines                                  |                                   19 |                         20 |                  4 |                                                 13,500 |
| Stockade                                   |                                   26 |                         26 |                  5 |                                                 24,900 |
| Excavation: Wetlands                       |                                   29 |                         29 |                  6 |                                                 30,750 |
| Blackfathom                                |                                   25 |                         28 |                  3 |                                                 20,100 |
| City of Dalaran                            | 31 in current guide; null in catalog |                         31 |                  3 |                                                 28,200 |
| Gnomeregan                                 |                                   33 |                         33 |                  3 |                                                 14,350 |
| Razorfen Kraul                             |                                   31 |                         35 |                  2 |                                                 15,200 |
| Drowned City                               |                              Unknown |                  37 preset |       None modeled |                                                Unknown |
| Scarlet Monastery, selected 3-wing package |                                   37 |                         38 |                  3 |                                                 20,350 |
| Krol'dok                                   |                              Unknown |                  42 preset |       None modeled |                                                Unknown |
| Razorfen Downs                             |                                   39 |                         45 |                  3 |                                                  6,270 |
| Uldaman                                    |                                   42 |                         47 |                  5 |                                                 16,190 |
| Maraudon                                   |                                   46 |                         48 |                  4 |                                                 20,450 |
| Zul'Farrak                                 |                                   44 |                         49 |                  4 |                                                 22,850 |
| Alcaz Prison                               |                              Unknown |                  50 preset |       None modeled |                                                Unknown |
| Sunken Temple                              |                                   51 |                         53 |                  6 |                                                 35,350 |
| BRD plus scheduled raid-related stages     |                                   55 |                         55 |                 19 | 98,960 plus 2 unresolved rewards; includes an estimate |
| LBRS plus selected seal stage              |                                   60 |                         60 |                  6 |                    No leveling XP at this entry policy |
| Stratholme, core scope                     |                                   60 |                         60 |                  4 |                    No leveling XP at this entry policy |

Specific consequences:

- `max(oldRequestedLevel, AtLevel, minima)` is not flexible scheduling; it preserves excessive
  delay and makes an earlier suitable alternative impossible to select.
- BFD/Excavation, RFK/Gnomeregan and ZF/Maraudon require order comparisons, not only new numbers.
  Full-clear boss floors can also differ from the headline difficulty reference.
- Numeric references already reduce Techbot at 33 from full 4,750 to 2,850. Waiting for an entire
  dungeon appointment can waste an exterior quest's XP; moving its payout earlier costs an actual
  journey and cannot be done for free.
- RFD's current three core references total 9,230 at 39, versus 6,270 at the old 45 appointment.
  That improvement still does not fund a level: 39→40 requires 85,700 before considering combat.
- Stratholme's four selected core references total 31,500 at 59, only about 15.0% of the 209,800
  final bar. Without other rewards/combat, a one-run finish needs entry at 59 + 178,300 or above.
  At 58 + 0 the remaining two bars total 412,100. A fuller real bundle may improve this; the word
  “Stratholme” cannot replace the calculation.
- Higher-level general quests, available full bundles and clear combat must be modeled before
  concluding that 45–60 can be almost dungeon-only. Current selected rewards do not establish it.

### Evidence pipeline and client-cache findings

All 298 unknown typed XP records contain renderer-verification, missing-primary and missing-numeric
issues. The parser's combined condition also adds missing-primary when renderer verification fails,
so these reasons must be separated before diagnosing the true source change. Compared with the
previous frozen snapshot, records increased from 534 to 626 while usable facts remained 328.
More IDs processed is not demonstrated numeric-data progress. No crawler change was made here.

The local Journal 1.6.3 has old reward strings, base/cache fallbacks and runtime overrides. The
currently installed RXP is v4.11.23, newer than the archived guide receipt; its quest helpers and
guide metadata are not a reviewed comprehensive static XP table. Do not silently replace the
authorized frozen route or infer server payouts from strings that its own UI removes.

The cache previously recorded as empty is now 65,220 bytes at
`/Applications/World of Warcraft/_classic_beta_/Cache/WDB/enUS/questcache.wdb`. Read-only envelope
validation found a 24-byte header, `TSQW`, build 70374, enUS, 61 bounded records and an eight-byte
terminator. IDs include all Hall quests, Deadmines, Gnomeregan and Dalaran examples. A private copy
is frozen as `questcache-70374-enUS.wdb` in the audit directory. Only record boundaries/IDs/build
were inspected: no XP/restriction field layout has been established or promoted.

Next evidence work must reconcile build 70374 cache data with the 70205 archive/curve and newer
market catalog, not pretend they are the same snapshot. Small passive compatible game observations
can validate disagreements; the owner's disabled broad quest/NPC scanners remain disabled.

### Rules that must be separate in the replacement

The [current dungeon reference](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location)
offers difficulty recommendations, not one universal XP-loss boundary. Each quest's effective
reward must be resolved at its actual modeled hand-in level, and combat has separate enemy/member
level rules. Guide-column levels versus `requires`/numeric minimum claims need semantic review.

[Blizzard's October 1 changes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/4)
reduced the extra dungeon quest bonus, not every total reward by half. The available data already
has different effective multipliers and unboosted quests; the Crest coefficient is not universal.
[October 8 changes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/5)
increased dungeon creature XP by about 20%, reverted normal mixed-level lower-enemy adjustments
to individual-member evaluation, and retained the extreme-level-gap suppression. The conservative
solo-XP/5 case remains the owner's budget assumption, separate from a calibrated server formula.

### Operational boundary

This follow-up changed research artifacts and documentation only. It did not implement the new
generator, alter production, touch player progress, change the crawler/queue, enable an addon
scanner, publish a catalog, commit or push. Full-route coverage remains failed. The detailed
binding plan specifies the inputs, packages, flexible windows, continuous generator, independent
oracle, matrix, browser/export parity and non-overridable complete-route publication gate.

Baseline audit date: October 14, 2026. Progression corrections implemented locally October 15;
full XP/content coverage remains unresolved. The October 14 findings below describe production r6.
This report supersedes any implication that the existing 1–60 campaign is XP-validated.

## October 15 source-library expansion receipt

The subsequent implementation inserts additional complete quest chains from the full applicable
archive, not only XP-resolved fallback suggestions. Human/general adds 28 quests; Human/warrior
adds 36 (19 shared-kill roots, seven named trophies, one nearby interaction and nine prerequisite
quests). Low-drop collection candidates are held unless part of a required dungeon unlock.
Nearby short work uses source-map/step-distance heuristics, not verified travel times. New-zone
travel, unknown stages and server-side eligibility still require review.

All 33 projections preserve their old save identities and 26,878 original action IDs. The source
flow audit additionally verifies each inserted quest's pickup/objective/hand-in order and source
prerequisites. Accepted chains are not abandoned merely because a kill gained the target level.
Full eligible hand-in XP and the conservative solo-combat-XP/5 rule remain separate.

The final audit against the same frozen 534-record / 328-available-fact snapshot is:
`artifacts/leveling/audits/2026-10-15/library/campaign-xp-audit-0e5a3e1a934c7246.json`.
Semantic SHA-256: `0e5a3e1a934c7246ea4b87f5d73ac90202142a7f8e66668ab4903b681035f44c`.
33 variants, 132 scenarios, 6,000 independent checks: 908 blocked; 3,176 incomplete;
1,832 shortfall; 84 reference-covered. More selected quests with unknown rewards can move a
shortfall to incomplete; this is not evidence of a worse real game route or zero quest rewards.
Continuous full-party XP coverage remains uncertified; `--require-covered` exits 2.

186 leveling and 215 web tests, strict types, scoped lint/format, production webpack build, full
source-flow checks, compatibility and local browser/mobile/WCAG checks passed. XP ledger revision
is `checkpoint-ledger-20261015-v3`; workflow is `workflow-20261015-v4`.

The existing crawler now runs a separate 1,419-ID full-library priority snapshot, retaining all
614 original IDs/cache/checkpoints and the same single-worker pacing/safety rules. Its active
hash and rollback are in `context.md` and `wowhead-reference-enrichment.md`. No website deployment,
commit, push, database migration or real-player progress mutation accompanied this delivery.

## October 15 implementation receipt (local only)

Implemented:

- Fixed A01's leaked level-16 override and A03's missing forecast departure check. All modeled
  objectives/pickup stages, known prerequisites and conservative conflicting minimum levels are
  now checked per player before subsequent rewards. No future hand-in or dungeon-clear XP can
  fund that dungeon's earlier entry. Unknown/unverified lifecycle evidence cannot certify coverage.
- Fixed A04's competing card subtotal: dashboard and reader use the same sequential paid-once
  ledger and target resolver. Independent authoring scenarios are explicitly distinct from actual
  continuous player forecasts. Blocked exits and gaps remain unresolved. Header labels say target
  or entry, not an unfunded earned range; dungeon XP is compared with the next departure separately.
- Added the owner's conservative five-player rule: `floor(solo kill XP / 5) × unique kills`
  per member, with full eligible quest hand-in XP. Overlapping objectives do not multiply the kill
  quota. Faster camp clears improve time, not rewards. Explicit combat scenarios remain scenarios;
  no unmeasured combat is credited or labeled server-calibrated.
- Harvested complete source-backed pickup/objective/hand-in batches outside the base route.
  Recommendations require matching source regions, fresh bars for all five, resolved eligible
  rewards and shared-kill-only objectives. Class/runtime conditions, collection farms, item-use
  and ambiguous mixed objectives are held. Source-order prerequisite returns remain conservative
  requirements, not a claim of a complete server-side prerequisite graph. Add/remove changes the
  ordered route and bookmarks without granting XP or erasing paid history.
- Selected dungeon extras without executable route stages now hold the forecast rather than
  silently pretending their rewards are included. They are not fully compiled into the primary
  route yet. Existing save identities/bookmarks and 26,878 original action IDs are preserved.
- Added a coverage gate that requires all independent budgets plus supported cumulative progress
  for every relevant member and all five at level 60. A default Player-1 scenario cannot certify
  the unprovided starting branches of the other four players.

Frozen evidence and result:

- Archive/build/curve provenance is unchanged from the baseline audit.
- Published reward index: `2026-10-15T04:47:40.237Z`, 534 records; 328 available typed XP facts.
  Each published record was read through identity/checksum validation, not counted merely because
  a crawler request succeeded. Snapshot: `artifacts/leveling/audits/2026-10-15/published-snapshot/`.
- All 33 race/class variants × both policies × raid on/off: 132 cumulative scenarios and 6,000
  independent chapter checks. Statuses: 1,126 blocked; 2,300 incomplete; 2,310 shortfall;
  264 reference-covered. These independent scenarios assume earlier quest history and cannot be
  concatenated into a playable route. No full projection is certified.
- Final artifact: `artifacts/leveling/audits/2026-10-15/campaign-xp-audit-34f80f850da3cbc9.json`.
  Semantic SHA-256: `34f80f850da3cbc95e96070e2a5f44d87ce5ad27d5069e974ef9e578cdeb290e`.
- In the Human/general Stockade bridge, all 14 hand-ins now have numeric reward evidence, but
  from level 20 + 0 the executable quest-only path reaches only 2,830 before quest 386's level-22
  pickup blocks further progression. The 20→26 target still needs 170,800 from that empty bar.
  Better extraction did not make a sparse itinerary fund six levels.
- Human/general 53→55's selected outdoor hand-ins supply 36,320 against a 341,000 empty-bar target.
  Incoming dungeon overflow and evidenced combat must be included in the cumulative plan;
  these independent numbers are not a new claim that all outdoor work alone must fund the journey.
- Default priority queue remains 614 IDs with unchanged SHA
  `32bec0be2d118c31288f66c39884355ce6f04d8045724cc7829b98c2a3121447`.
  Prepared `--catch-up` queue: 638 IDs (24 additional), SHA
  `2cb94970b54f31c642fd41f9d5da5a8483b37b019fac4b31dc8ae263ee596eb8`.
  Both inventories are in the dated artifact's `queues/` directory. The running crawler was not
  reprioritized, restarted or given extra unpaced requests.

Reproduce after building `@wow-trader/leveling` and `@wow-trader/reference-data`:

```sh
pnpm leveling:xp:verify --destination=artifacts/leveling/audits/2026-10-15 --rewards=artifacts/leveling/audits/2026-10-15/published-snapshot
```

Expected current exit: **2**, meaning coverage is not certified. Use `--progress=<party-state.json>`
for actual party bars/history; this does not mutate the input or pretend it is playtest evidence.

Verification: 172 leveling and 215 web tests; strict typechecks; scoped ESLint/Prettier;
33 source-flow projections; r6 save compatibility; local Chrome regressions for underlevel entry,
unchanged actual progress on refresh, exact-step reload, compact diagnostics, explicit target/entry
labels, 390/320 px layout and automated WCAG A/AA. Default Turbopack development hit an installed
internal `next/font` resolution error, so browser verification used webpack without font/config
changes. `pnpm --filter @wow-trader/web exec next build --webpack` passed compilation,
TypeScript, all 59 static pages and build tracing locally, using a process-local 3072 MiB heap.
The temporary local preview was stopped; no production process or runtime heap limit was changed.

Remaining: complete evidence and prerequisites, fund every checkpoint with eligible efficient
content and explicit combat counts, calibrate the live curve/group rules, resolve Drowned City,
Krol'dok and Alcaz, playtest, approve the browser route and then compile RestedXP. No green 1–60
claim, invented faction quests, live-player changes, database mutation, deployment, commit or push.

## Verdict

The XP curve was implemented, but the selected route was not validated to supply the advertised
level milestones. The owner's 20–26 example is a real problem. Changing chapter names or
grouping preparation did not repair the XP budget. The existing successful software tests
do not certify a feasible or efficient leveling route.

Every implemented section was inspected, rather than assuming later sections would work:

- 33 Alliance race/class projections across Human, Dwarf, Gnome, Night Elf and Skyborne.
- 1,500 chapter instances; 46 chapters in the generic Human projection.
- 132 cumulative Player-1 scenarios: both difficulty policies, with raid goals enabled/disabled.
- Every section also replayed for five equal-level members at its authored entry level.
- 1,386 dungeon-to-next-stop diagnostic intervals: all 21 stops, both policies, all 33 projections.
- Quest lifecycle ordering, reward ownership, pickup minima, default-policy differences and
  below-target skip decisions checked. These are not all possible mixed-party permutations.
- No Horde premade campaign is implemented; this does not certify the separate legacy solo guides.

No complete 1–60 projection is certified. All 132 cumulative scenarios have unresolved final XP.
That means missing evidence/eligibility and omitted combat prevent proof, not that the game awards
zero combat XP or that every listed quest is wrong.

## Evidence and method

The six local source files governing the curve, route, section grouping, forecast and chapter
cards were SHA-256 compared with the active production release. All six match.
The audit is therefore applicable to deployed `kfc-helper-zones-20261014-r6`, not just a local draft.

- Authorized archive: build 70205, source SHA-256 `af3fec7909e0b5a1dd8659f87e67171f8984af40a22b997e630a0052a11c871e`.
- 61 authorized Alliance source chapters schema/checksum/version/build validated.
- Frozen published reward index: `2026-10-14T19:24:40.309Z`; 256 fresh typed XP records,
  all individually identity/checksum validated.
- 248 of 584 distinct scheduled hand-in IDs have a published numeric XP fact
  in that snapshot. Human/general has 235 of 282. Missing amounts and unavailable level contexts
  remain unresolved; historical estimates are kept separate.
- All 59 leveling requirements in code match the extracted `gametables/xp.txt` Total column.
  Source SHA-256: `935253a23756f0ab7a760e8e4ab22184e1aca49285944ea68efc0a8820e459e6`.
  This verifies extraction-to-code parity, not the live server's `UnitXPMax` behavior.
- The audit does not issue extra Wowhead quest requests or change crawler priority/pacing.
  The existing crawler continues independently. A frozen snapshot avoids moving numbers mid-audit.

Generated local evidence, intentionally ignored by Git:

- `artifacts/leveling/audits/2026-10-14/whole-route-audit-2071569f75fe6529.json` — full per-section/per-member outputs, both policy interval sets,
  all 33 lifecycle traces and the below-target control-flow audit.
  Semantic payload SHA-256: `2071569f75fe6529eda98fece9956d52efb473ea4c4c08ad9d36e702f626d05e`.
- `artifacts/leveling/audits/2026-10-14/campaign-xp-audit-4ecbb41d45441e07.json`
  — existing cumulative audit output; payload SHA-256
  `4ecbb41d45441e07ebfc30e7e9a95ae4c63c99ff0312cc56859eab4a69dd6de6`.
- `artifacts/leveling/audits/2026-10-14/reward-snapshot/` — frozen source index and immutable records.

Independent section/interval diagnostics deliberately restart at a declared empty entry bar and
assume preceding quest states. They expose local problems without letting an early missing fact
hide all later content. They are not stitched together as an end-to-end proof. The separate
cumulative scenarios never reset XP or invent the other four players' personal starting branches.

## 1. The reported 20–26 anomaly

| Level transition | Required XP from an empty bar |
| ---------------- | ----------------------------: |
| 20→21            |                        23,200 |
| 21→22            |                        25,200 |
| 22→23            |                        27,300 |
| 23→24            |                        29,400 |
| 24→25            |                        31,700 |
| 25→26            |                        34,000 |
| Total 20→26      |                       170,800 |

The displayed 18,660 is 10.93% of that requirement and does not fill even level 20→21 from zero.
The remaining 152,140 is **unfunded by that displayed subtotal**, not a final gameplay shortfall:
preceding dungeon rewards, the unknown context and actual combat must be accounted for separately.

There are 17 distinct quest IDs in the card, but only 14 hand-in IDs. Accepting a Stockade quest
for later is not an XP payout in Redridge/Duskwood/Wetlands.

The unresolved Dark Iron War (303) is not missing from the current reward snapshot: it has
2,450 full reference XP and minimum level 25. The card resolves all rewards at level 20, so it
labels this context unknown. The plan must first get players to 25 before using that quest;
its later reward cannot pay for reaching its own pickup gate.

Deadmines' selected rewards add 13,500 at reference level 20. Including that dungeon and the
following chapter produces a 32,160 reference subtotal plus the unresolved 303 context, still
far below 170,800. Counting the eventual 2,450 too would not repair the missing budget.
This is not an exact executable forecast: premature skipping and pickup gates make it worse.

## 2. Confirmed systemic findings

### A01 — Critical: level-16 target leaks into later catch-up steps

`sourceActions` assigns `xpTargetLevel: 16` to all source-backed actions, including non-starters.
`campaignOptionalXpReady` prefers that value over the XP-bridge leg's real target. When another
preparation phase sits before the next dungeon, there is no immediate stop gate to correct it.

All five fresh members at level 20 can therefore skip Redridge's target-23 work; level-23 members
can skip Duskwood's target-26 work. The same issue affects:

- `redridge-kill-batch`
- `duskwood-watch`
- `searing-group-kills`
- `burning-group-kills`
- `final-xp-fallback`

Reproduced across all 33 projections: 1,780 wrongly-skippable quest-action instances, representing
one shared target bug, not 1,780 independent defects. Human/general has 54 affected action instances.
At level 50 the Searing card includes 31,300 XP, while the executable isolated forecast includes
only 8,550 because the kill batch is skipped. Burning Steppes similarly displays 36,320 but
executes 20,720. At level 59 the final catch-up can be skipped despite a full level still missing.

### A02 — Critical: authored milestone ranges are not earned exit levels

`campaign-route.ts` supplies handwritten from/to ranges. `campaignSections` uses the next
dungeon's requested level, not a calculated reward-supported endpoint. No budget-solving pass
selects enough work to close each transition.

A chapter is therefore a target itinerary, not proof that its selected quests supply its levels.
The pinned curve needs 4,084,700 XP for 1→60; the model cannot currently account for that journey.

### A03 — Critical: dungeon-entry difficulty is not checked at the forecast entry action

The live Done controller checks actual entry levels, but the XP simulator does not check the
entry action's `targetStopId`/`targetLevel` at that point. It can credit later dungeon rewards
and then report a zero section gap to the level that was required before entry.

Read-only reproduction: five level-25 members with 20,000 current XP and assumed earlier Stockade
prerequisites. The actual controller blocks entry until 26. The quest-only simulator nevertheless
credits 24,900 from Stockade hand-ins, exits at 26 + 10,900 and reports `covered` without an
eligibility issue. A future reward cannot validate an earlier departure.

### A04 — High: card totals and execution use different reward semantics

Cards sum unique hand-in IDs at the chapter's fixed starting level. The simulator uses each
player's actual sequential level, paid history and execution predicates. Card counts include
accept/objective-only IDs, and an amount unavailable below a pickup minimum is labeled like an
unknown reward. Public card totals are not a per-player remaining route budget.

Human's earlier personal branch also pays trogg quests 432/433, which appear again in later party
catch-up. The cumulative ledger correctly deduplicates Player 1, but a naive sum of the cards does
not. Other party members may legitimately still need those rewards.

### A05 — High: default policy and displayed levels disagree

The requested early levels live alongside a default conservative policy:

- Ruins: displayed 18, conservative gate 19.
- Excavation: displayed 27, conservative gate 29.
- Dalaran: displayed 30, conservative gate 31.
- LBRS: displayed 57, conservative gate 60.
- Stratholme: displayed 59, conservative gate 60.

Thus strict mode can require 60 before the runs that are presented as helping the party reach 60.
After strict Excavation at 29, the authored BFD label returns to 28. Characters must carry their
actual earned level forward; a lower subsequent minimum does not delevel them.

These are policy/reference conflicts to resolve explicitly, not permission to silently enter
below the selected At-level policy. Dalaran's gate is an explicit fallback, not a reviewed visit band.

### A06 — High: no calibrated per-player combat or time budget

Production calls `forecastCampaignXp` without a combat scenario. Required outdoor kills,
dungeon trash/boss XP, overlapping kill objectives and route-clear scope are not quantified.
Generic instructions to fight nearby mobs until ready are open-ended gaps, not an efficient plan.

Do not treat quest-only shortfalls as proof that combat cannot close them. Conversely, do not
claim combat closes them without counts and compatible per-player XP. The October 8 official notes
changed dungeon kill XP and party-level penalty behavior, so a generic old Classic estimate is
not sufficient. [Official October 8 beta notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/5).

Observed XP/hour currently converts an XP requirement into a scenario time. It does not measure
this itinerary's travel, pickups, turn-ins, five-player collection waits or dungeon clears.

### A07 — High: three stops have no usable quest bundle

The Drowned City, Krol'dok Stronghold and Alcaz Prison have explicit unverified actions and no
selected quest IDs. They remain review stops, not modeled XP-producing dungeon alternatives.
Do not interpret the card's zero as an actual zero reward, invent parity quests, or count the
missing dungeon as covering several levels.

### A08 — High: numeric XP does not establish quest-chain or visit feasibility

43 selected default dungeon quest records across nine stops have unknown modeled pickup/objective
lifecycle metadata. BRD source actions provide additional guidance, so the metadata count is not
a claim that all 43 have no instructions. It still prevents uniform machine validation.

Generic Human has modeled missing-pickup candidates 18, 83, 71, 1338 and 3444; 3444 also affects
party members. The generic Westfall source accepts Murloc Gills (92744) before the modeled
reward of its known parent Testing the Wells (92742). Class projections remove some generic-only
gaps; all per-profile traces are retained in the evidence.

These are graph review candidates, not proof that every game quest requires a separate explicit
accept/complete action. Item-start, instant/autocomplete, already-held quests, alternative chains
and objective-only directives must be modeled explicitly before calling a candidate invalid.

### A09 — High: pickup minima differ between consumers

There are 11 numeric disagreements between fresh reward evidence and the dungeon catalog:

| Quest ID | Published reference minimum | Catalog minimum |
| -------- | --------------------------: | --------------: |
| 153      |                          10 |               9 |
| 98423    |                           9 |              16 |
| 96403    |                          10 |              14 |
| 96395    |                          10 |              14 |
| 96394    |                          10 |              15 |
| 96393    |                           9 |              15 |
| 378      |                          22 |              25 |
| 92458    |                          24 |              30 |
| 1100     |                          29 |              23 |
| 1144     |                          22 |              23 |
| 1139     |                          35 |              30 |

The reward resolver may use one value while the live action controller or dungeon gate uses
another. Resolve build/source conflicts through one shared eligibility contract, preserving
provenance; neither blindly trusting the lowest nor permanently taking stale maxima is correct.

### A10 — High: the efficient-five-player constraints are not enforced

The generic starting source still retains optional personal collections such as Murloc Gills,
although the later Deadmines brief excludes that explosives chain. Keeping essential class unlocks
is different from retaining every solo collection stage. Group kill credit does not make five
personal drop quotas a single shared quota.

The route needs explicit objective type/count, per-player item ownership and required-chain closure,
then a marginal time/XP choice. No measured travel/clear timings or complete collection-cost model
currently proves the route is ultra-efficient or dungeon-only after 45.

### A11 — Medium: user-selected extras and route generation are not one scope

Campaign construction chooses default core/raid quests once. Later active-action selection mainly
filters raid actions; optional extras are not generally regenerated into the executable campaign
when the separate premade panel changes. Costs, XP, prerequisites and display must use the same
selected scope. Adding an extra's price/XP alone is insufficient.

### A12 — Verification gap: structural success was mistaken for product validity

All 33 real-source flow checks and all 143 leveling unit tests pass. Those checks verify identities,
ordering assumptions and calculator behavior, not that selected activities fund every level.
The current compatibility check intentionally preserves old XP execution; it cannot certify a
better budget and can preserve A01. No full 1–60 playthrough was performed.

## 3. Every dungeon handoff, not only outdoor cards

Each row includes the named dungeon plus the outdoor/preparation section before the following
dungeon. It starts at an empty entry bar for an independent diagnostic. The real repaired route
must instead carry the actual prior exit bar forward.

The reference subtotal is the fixed-entry-level card-style sum, not a guaranteed executable payout.
It can include wrong-skipped work, below-minimum contexts, unreconciled lifecycle stages and
historical estimates. H marks historical XP. Missing bundles are not included as free XP.
The final column shows the different default-policy requirement; it is not an extra reward.

| Interval                                                                               | Requested/expert levels | XP required |     Reference subtotal | Strict At-level levels / XP required |
| -------------------------------------------------------------------------------------- | ----------------------: | ----------: | ---------------------: | -----------------------------------: |
| Hall of Thanes → Ruins of Lordaeron                                                    |                   16→18 |      33,700 |                 19,650 |                     16→19; 53,100 XP |
| Ruins of Lordaeron → The Deadmines                                                     |                   18→20 |      40,700 |                 22,400 |                     19→20; 21,300 XP |
| The Deadmines → The Stockade                                                           |                   20→26 |     170,800 |    32,160 + unresolved |                    20→26; 170,800 XP |
| The Stockade → Excavation Site: Wetlands                                               |                   26→27 |      36,400 |                 26,100 |                    26→29; 116,700 XP |
| Excavation Site: Wetlands → Blackfathom Deeps                                          |                   27→28 |      38,900 |                 33,650 |                          29→28; 0 XP |
| Blackfathom Deeps → City of Dalaran                                                    |                   28→30 |      85,700 |    23,900 + unresolved |                    28→31; 133,100 XP |
| City of Dalaran → Gnomeregan                                                           |                   30→33 |     152,700 |                 33,400 |                    31→33; 105,300 XP |
| Gnomeregan → Razorfen Kraul                                                            |                   33→35 |     121,400 |    15,700 + unresolved |                    33→35; 121,400 XP |
| Razorfen Kraul → The Drowned City                                                      |                   35→37 |     138,700 |                 32,950 |                    35→37; 138,700 XP |
| The Drowned City → Scarlet Monastery · 3 wings                                         |                   37→38 |      76,100 |                  1,550 |                     37→38; 76,100 XP |
| Scarlet Monastery · 3 wings → Krol'dok Stronghold                                      |                   38→42 |     353,000 |                 44,000 |                    38→42; 353,000 XP |
| Krol'dok Stronghold → Razorfen Downs                                                   |                   42→45 |     319,100 |                 18,150 |                    42→45; 319,100 XP |
| Razorfen Downs → Uldaman                                                               |                   45→47 |     240,700 |                 17,440 |                    45→47; 240,700 XP |
| Uldaman → Maraudon                                                                     |                   47→48 |     129,100 |                 17,720 |                    47→48; 129,100 XP |
| Maraudon → Zul'Farrak                                                                  |                   48→49 |     135,100 |                 28,100 |                    48→49; 135,100 XP |
| Zul'Farrak → Alcaz Prison                                                              |                   49→50 |     141,200 |                 41,050 |                    49→50; 141,200 XP |
| Alcaz Prison → Sunken Temple                                                           |                   50→53 |     461,800 |                 31,300 |                    50→53; 461,800 XP |
| Sunken Temple → Blackrock Depths + raid preparation                                    |                   53→55 |     341,000 |                 71,670 |                    53→55; 341,000 XP |
| Blackrock Depths + raid preparation → Lower Blackrock Spire · conditional second visit |                   55→57 |     368,700 | 162,050 H + unresolved |                    55→60; 975,800 XP |
| Lower Blackrock Spire · conditional second visit → Stratholme · adaptive finish to 60  |                   57→59 |     397,300 | 108,400 H + unresolved |                          60→60; 0 XP |
| Stratholme · adaptive finish to 60 → Level 60                                          |                   59→60 |     209,800 |  76,700 H + unresolved |                          60→60; 0 XP |

Particularly clear quest-only shortages, without unresolved reward values in these diagnostics:
SM→Krol'dok 44,000 versus 353,000; RFD→Uldaman 17,440 versus 240,700;
Uldaman→Maraudon 17,720 versus 129,100. They require named extra work and/or quantified combat.
Ruins→Deadmines is one local exception under strict entry 19: its 22,400 reward scenario can
reach 20 + 1,100. That local result does not validate the preceding or following journey.

At strict 60-entry LBRS/Stratholme, leveling XP correctly becomes zero. This is a policy outcome,
not a workaround for missing pre-60 coverage.

## 4. Every current Human/general chapter card

This records the deployed generic projection at the frozen evidence revision, including every
dungeon, zone chapter and the final catch-up. Concrete classes differ in their starter actions.
All 33 variants' full section/member records are in the machine audit.

“Shown / gate” distinguishes the displayed authored range from the default policy target.
“IDs / hand-ins” distinguishes all selected quest IDs from actual payout IDs.
A resolved card subtotal is not a promise to earn it at that stage. “Unresolved” includes below-
pickup-level contexts and missing amounts; it is not simply the number of uncrawled quests.

| Chapter ID and title                                                       | Shown / gate | IDs / hand-ins | Card XP subtotal | Unresolved | Finding                                                                        |
| -------------------------------------------------------------------------- | -----------: | -------------: | ---------------: | ---------: | ------------------------------------------------------------------------------ |
| start-115 — Northshire                                                     |      1–6 / 6 |          19/11 |            1,460 |          1 | Combat excluded; generic branch has missing lifecycle stages.                  |
| start-116 — Elwynn Forest                                                  |    6–11 / 11 |          63/45 |           13,490 |         17 | Combat excluded; several pickups exceed the initial level.                     |
| start-117 — Loch Modan                                                     |   11–13 / 13 |           12/8 |            6,240 |          0 | 6,240 quest XP versus 18,900 bracket XP; generic pickup gap.                   |
| prepare-thanes — Westfall → Dun Morogh                                     |   13–16 / 16 |          18/17 |           14,880 |          0 | Player 1 already has some trogg rewards; prerequisite and collection review.   |
| dungeon-thanes — Hall of Thanes                                            |      16 / 16 |            5/5 |           13,300 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-lordaeron — Darkshore                                              |   16–18 / 19 |            6/6 |            6,350 |          0 | Displayed 18 conflicts with default entry 19.                                  |
| dungeon-lordaeron — Ruins of Lordaeron                                     |      18 / 19 |            3/3 |           16,300 |          0 | Displayed 18 conflicts with default entry 19.                                  |
| prepare-deadmines — Westfall                                               |   18–20 / 20 |            6/6 |            6,100 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-deadmines — The Deadmines                                          |      20 / 20 |            4/4 |           13,500 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-stockade — Redridge Mountains → Duskwood → Wetlands                |   20–26 / 26 |          17/14 |           18,660 |          1 | Wrong level-16 skip target; Dark Iron War requires 25.                         |
| dungeon-stockade — The Stockade                                            |      26 / 26 |            5/5 |           24,900 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-excavation — Wetlands                                              |   26–27 / 29 |            1/1 |            1,200 |          0 | Displayed 27 conflicts with default entry 29.                                  |
| dungeon-excavation — Excavation Site: Wetlands                             |      27 / 29 |            6/6 |           30,750 |          0 | Displayed 27 conflicts with default entry 29.                                  |
| prepare-blackfathom — Ashenvale                                            |   27–28 / 28 |            2/2 |            2,900 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-blackfathom — Blackfathom Deeps                                    |      28 / 28 |            3/3 |           20,100 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-dalaran — Hillsbrad Foothills                                      |   28–30 / 31 |            3/3 |            3,800 |          1 | Default entry 31; prerequisite 92432 requires 30.                              |
| dungeon-dalaran — City of Dalaran                                          |      30 / 31 |            3/3 |           28,200 |          0 | Displayed 30 conflicts with default entry 31.                                  |
| prepare-gnomeregan — Hillsbrad & Arathi Highlands                          |   30–33 / 33 |            2/2 |            5,200 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-gnomeregan — Gnomeregan                                            |      33 / 33 |            3/3 |           14,350 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-razorfen-kraul — Desolace → Thousand Needles                       |   33–35 / 35 |            3/2 |            1,350 |          1 | Quest 261 requires 34 before the 33-start bridge can use it.                   |
| dungeon-razorfen-kraul — Razorfen Kraul                                    |      35 / 35 |            2/2 |           15,200 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-drowned-city — Stranglethorn Vale                                  |   35–37 / 37 |          13/10 |           17,750 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-drowned-city — The Drowned City                                    |      37 / 37 |            0/0 |                0 |          0 | No usable quest bundle; zero is not a verified zero reward.                    |
| prepare-scarlet-monastery — Hillsbrad Foothills                            |   37–38 / 38 |            1/1 |            1,550 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-scarlet-monastery — Scarlet Monastery · 3 wings                    |      38 / 38 |            3/3 |           20,350 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-kroldok — Arathi, Alterac & eastern returns                        |   38–42 / 42 |            7/7 |           23,650 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-kroldok — Krol'dok Stronghold                                      |      42 / 42 |            0/0 |                0 |          0 | No usable quest bundle; zero is not a verified zero reward.                    |
| prepare-razorfen-downs — Tanaris & Feralas                                 |   42–45 / 45 |            5/5 |           18,150 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-razorfen-downs — Razorfen Downs                                    |      45 / 45 |            3/3 |            6,270 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-uldaman — Badlands                                                 |   45–47 / 47 |            6/6 |           11,170 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-uldaman — Uldaman                                                  |      47 / 47 |            5/5 |           16,190 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-maraudon — Desolace                                                |   47–48 / 48 |            6/6 |            1,530 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-maraudon — Maraudon                                                |      48 / 48 |            4/4 |           20,450 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-zul-farrak — Tanaris & The Hinterlands                             |   48–49 / 49 |            3/2 |            7,650 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-zul-farrak — Zul'Farrak                                            |      49 / 49 |            4/4 |           22,850 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-alcaz — Tanaris                                                    |   49–50 / 50 |            4/4 |           18,200 |          0 | Quest-only budget does not close the bracket; combat/top-up not established.   |
| dungeon-alcaz — Alcaz Prison                                               |      50 / 50 |            0/0 |                0 |          0 | No usable quest bundle; zero is not a verified zero reward.                    |
| prepare-sunken-temple — Searing Gorge → Tanaris & Temple quest returns     |   50–53 / 53 |            8/7 |           31,300 |          0 | Wrong level-16 skip target; missing modeled Stone Circle pickup.               |
| dungeon-sunken-temple — Sunken Temple                                      |      53 / 53 |            6/6 |           35,350 |          0 | Entry-level target only; not an exit/next-stop coverage certificate.           |
| prepare-blackrock-depths — Burning Steppes                                 |   53–55 / 55 |          10/10 |           36,320 |          0 | Wrong level-16 skip target; raid/non-raid scopes differ.                       |
| dungeon-blackrock-depths — Blackrock Depths + raid preparation             |      55 / 55 |          16/16 |        143,700 H |          6 | Six unresolved contexts; historical estimates and multiple visits.             |
| prepare-lower-blackrock — Searing Gorge & Burning Steppes                  |   55–57 / 60 |            4/4 |           18,350 |          1 | Default entry 60, not the displayed 57; unresolved 4296.                       |
| dungeon-lower-blackrock — Lower Blackrock Spire · conditional second visit |      57 / 60 |            6/6 |        108,400 H |          0 | Default entry 60; historical rewards cannot fund reaching 60 afterward.        |
| prepare-stratholme — Western & Eastern Plaguelands                         |   57–59 / 60 |          16/15 |                0 |         15 | Default entry 60; 15 unresolved reward contexts.                               |
| dungeon-stratholme — Stratholme · adaptive finish to 60                    |      59 / 60 |            4/4 |         76,700 H |          0 | Default entry 60; historical four-quest subtotal, not a certified 59→60 clear. |
| finish-leveling — Plaguelands                                              |   59–60 / 60 |            5/5 |                0 |          5 | Wrong level-16 skip target; five unresolved reward contexts.                   |

## 5. All race/class projections

Each row below was inspected in the 1,500-section audit and replayed under four policy/raid
settings. “Pickup” and “parent” columns are lifecycle review-candidate occurrences in Player 1
and one representative non-leader trace, not automatically distinct broken game quests.
“Unresolved chapters” describes card-level contexts; cumulative uncertainty can affect more.

| Race / class                | Chapters | Missing earlier pickup candidates | Parent-order candidates | Unresolved chapters | Final cumulative XP |
| --------------------------- | -------: | --------------------------------: | ----------------------: | ------------------: | ------------------- |
| human / general preview     |       46 |                                 6 |                       1 |                   9 | Unresolved          |
| human / warrior             |       46 |                                 1 |                       1 |                   9 | Unresolved          |
| human / paladin             |       46 |                                 1 |                       1 |                  10 | Unresolved          |
| human / hunter              |       46 |                                 1 |                       0 |                  10 | Unresolved          |
| human / rogue               |       46 |                                 1 |                       1 |                   9 | Unresolved          |
| human / priest              |       46 |                                 2 |                       1 |                   9 | Unresolved          |
| human / mage                |       46 |                                 1 |                       1 |                   9 | Unresolved          |
| human / warlock             |       46 |                                 1 |                       1 |                   9 | Unresolved          |
| dwarf / general preview     |       46 |                                 8 |                       1 |                  10 | Unresolved          |
| dwarf / warrior             |       46 |                                 2 |                       1 |                  10 | Unresolved          |
| dwarf / paladin             |       46 |                                 2 |                       1 |                  10 | Unresolved          |
| dwarf / hunter              |       46 |                                 1 |                       0 |                  11 | Unresolved          |
| dwarf / rogue               |       46 |                                 2 |                       1 |                  10 | Unresolved          |
| dwarf / priest              |       46 |                                 3 |                       1 |                  10 | Unresolved          |
| dwarf / shaman              |       46 |                                 2 |                       1 |                  10 | Unresolved          |
| gnome / general preview     |       46 |                                 7 |                       1 |                  10 | Unresolved          |
| gnome / warrior             |       46 |                                 2 |                       1 |                  10 | Unresolved          |
| gnome / rogue               |       46 |                                 2 |                       1 |                  10 | Unresolved          |
| gnome / priest              |       46 |                                 3 |                       1 |                  10 | Unresolved          |
| gnome / mage                |       46 |                                 2 |                       1 |                  10 | Unresolved          |
| gnome / warlock             |       46 |                                 2 |                       1 |                  10 | Unresolved          |
| night-elf / general preview |       45 |                                14 |                       0 |                  10 | Unresolved          |
| night-elf / warrior         |       45 |                                 3 |                       0 |                  10 | Unresolved          |
| night-elf / hunter          |       45 |                                 3 |                       0 |                  10 | Unresolved          |
| night-elf / rogue           |       45 |                                 3 |                       0 |                  10 | Unresolved          |
| night-elf / priest          |       45 |                                 3 |                       0 |                  10 | Unresolved          |
| night-elf / druid           |       45 |                                 3 |                       0 |                  10 | Unresolved          |
| skyborne / general preview  |       44 |                                 9 |                       1 |                   8 | Unresolved          |
| skyborne / warrior          |       44 |                                 6 |                       1 |                   8 | Unresolved          |
| skyborne / hunter           |       44 |                                 6 |                       1 |                   8 | Unresolved          |
| skyborne / mage             |       44 |                                 6 |                       1 |                   8 | Unresolved          |
| skyborne / rogue            |       44 |                                 6 |                       1 |                   8 | Unresolved          |
| skyborne / druid            |       44 |                                 6 |                       1 |                   8 | Unresolved          |

Starter-specific additional findings:

- Dwarf/Gnome general branches jump from an authored 6–11 chapter to 12–14. No validated budget
  supplies the missing handoff level; a monotonic-title check does not catch it. Dwarf Hunter
  uses its separate 6–11 and 11–13 branches and was audited separately.
- Human's 11–13 Loch Modan selection has 6,240 fixed-level quest XP against 18,900 required;
  necessary combat was not budgeted.
- Night Elf starter rewards and Skyborne's 1–13 starter have no usable published reward amounts
  in this frozen snapshot. Zero displayed known XP is missing evidence, not actual zero quest XP.
- Personal starter steps credit Player 1 only. Other members need their own race/class branches
  and actual meeting bars; copying the leader's XP to all five would be false.
- “General” is a generic preview, not a substitute for validating class-conditioned playable routes.

## 6. Correction plan and order

### Phase 1 — Repair progression semantics before adding more content

1. Restrict the level-16 override to the intended early personal catch-up. Later optional actions
   must resolve their own phase's checkpoint. Regress every affected action below, exactly at,
   above and with unknown/stale XP, including one lagging member and mandatory unlocks.
2. Enforce entry levels and prerequisite/item/selection gates **at the departure action**.
   Block the forecast branch at an impossible entry; never borrow future quest or combat XP.
3. Give the card and details the same per-player ledger. Show reference evidence, remaining
   payable rewards and already-paid rewards separately; do not sum accepting quests as rewards.
4. Unify gate/reward minimum-level resolution and preserve conflict provenance. Distinguish missing
   data, impossible current pickup, estimated rules and unknown actual XP in the UI.
5. Resolve selected extras, raid toggle and requested/At-level policy into the same executable plan.
   Preserve IDs/bookmarks and reported progress; do not mark skipped work complete.

### Phase 2 — Complete evidence and prerequisites across the entire itinerary

1. Finish scheduled reward extraction, with late-world and all starter deficits explicitly tracked.
   Do not assume the existing 614-ID queue contains enough extra work to fill all gaps.
2. Build complete, stage-aware prerequisite closure for every selected quest, using all/any gates,
   item-start quests, alternatives, faction/class/race, level minima, keys and repeatability.
3. Resolve the three missing dungeon bundles. Until then show them as unmodeled alternatives,
   not covered progression, and provide an evidenced outdoor route that does not rely on them.
4. Review the 43 unknown lifecycle records and all source-stage candidates. Separate pickup,
   travel, entry, inside objectives, departure and remote hand-ins. Model BRD/probe returns,
   the conditional LBRS return and Stratholme wing scope as real visits.
5. Verify the pinned XP requirements with bounded current-client `UnitXPMax` observations.
   Do not enable the previously disabled broad NPC/quest scanners to collect this small check.

### Phase 3 — Fund every transition with efficient real content

1. Maintain cumulative per-member XP: `sum(curve below level) + currentXp`. Carry overflow,
   known paid history and each reward's before-hand-in level across every chapter.
2. Quantify required quest kills and dungeon-clear kills separately, with unique activity ownership.
   Concurrent overlapping objectives can share a kill; sequential stages cannot. Never count the
   same trash pack once as a quest activity and again as dungeon-clear combat.
3. Use versioned, compatible per-player kill XP with party levels, credit rules, enemy level/type
   and modifiers. The October 15 owner clarification supplies a conservative solo-XP/5 planning
   scenario; do not label it a calibrated server formula. Keep low/base/high cases where evidence
   is uncertain. Never multiply quest payouts by five or apply combat buffs to quest rewards.
4. For each remaining gap, select a complete nearby eligible quest batch with shared-kill/named
   objectives and necessary future unlocks. Include all travel, returns and five personal quotas.
   Avoid low-drop farms unless unavoidable for an approved mandatory chain.
5. Start with deterministic scoring of authored candidate batches, re-simulating after each choice.
   Optimize the lagging player's safe arrival, not average group XP or a claimed global optimum.
   Do not repair a deficit by inventing faction-parity quests, repeated one-time payouts or resets.
6. Recompute actual expected zone ranges from the resulting entry/exit bars. Keep dungeon target
   levels distinct. Do not change a number to make a short itinerary look sufficient.
7. If evidence cannot fund a transition, leave an explicit unresolved gap. Do not publish it as a
   complete path or replace it with an unlimited “kill until ready” claim.

### Phase 4 — Make coverage an explicit release gate

Every chapter, every dungeon departure and every playable projection must have:

- Known/scenario incoming level and XP; no reset to the author's nominal chapter start.
- Individually eligible, correctly ordered pickup/objective/hand-in stages.
- One-time rewards paid once, and exact expected hand-in levels with supported reward rules.
- Separated current-build reference XP, historical estimates, combat range and unresolved evidence.
- A safe predicted exit and a quantified deficit to the next actual checkpoint for every member.
- Named feasible catch-up if needed, with scope, travel/clear assumptions and confidence.
- No unsupported At-level conflict or missing dungeon package hidden by a green status.

Run the entire matrix automatically whenever route, reward, curve or rules revisions change.
Treat existing 143-unit-test/33-flow-check success as necessary software checks, not the budget
gate. Add actual-route regressions for A01/A03 and all known chain/level/card discrepancies;
simulate unequal party bars, mixed starts, overlevel reductions, optional work already paid,
raid toggle, level cap, extra quests and unsupported evidence.

Separate labels: `verified arithmetic`, `feasible modeled scenario`, `calibrated combat`,
`playtested`. Offline validation cannot honestly become playtested late-beta content.
Freeze approved source/reward/rule hashes for the later RestedXP export so web and addon do not
develop different instructions or silently rewrite a player's in-progress route.

## October 14 baseline verification and operational boundary

Executed: all 59 extraction/code curve comparisons; all 33 source-backed flow checks;
132 cumulative policy/raid forecasts; 1,500 isolated section diagnostics; 1,386 handoff diagnostics;
the all-profile premature-skip check; the Stockade forecast/actual-entry counterexample;
143 leveling unit tests. Software checks pass; XP feasibility is not certified.

The October 14 audit changed artifacts and project documentation only. No runtime fix, crawler
reprioritization, database write, service restart, commit, push or deployment was performed.
