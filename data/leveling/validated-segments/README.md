# Validated route segments

The owner selected ten-level blocks, ending at a completed quest or dungeon handoff. These are local development artifacts. They are not published guides or observations of a player's progress.

Current local qualification: **campaign 234 / XP 199 / funding 81**, compiler **98**, context `context-v1003.json`. All 832 task IDs, order, text, positions and quest changes remain fixed. The existing explicit counter-scope revision is retained. Each block passes 48 forecast/save cases and 40 native/Lua exports. Old payloads and certificates remain preserved. The complete Stormwind finish, Uldaman dialogue and supplied-bramble scene are adopted; the canonical V1002 continuation matches all 15 independently audited candidate event streams. This qualifies the prefixes, not the full 1–60 route. V939 was deliberately superseded after the V989 audits, preserving its inputs/checkpoint; it terminated with -15 and V940 did not start.

## Primary Human party

Warrior tank, Priest healer, Mage, Rogue and Warlock start together at level 1 with zero XP. The sealed1–30 prefixes contain no class detours or explicit grinding. The owner later authorized one temporary adaptive farm-to37 task, outside these prefixes, pending five Riverglades quests.

| Prefix | Completed handoff | Expected projected XP per player | State |
| --- | --- | --- | --- |
| Through 10 | Filthy Paws (307), Loch Modan | 10 + 3,046 through 10 + 4,394 | Sealed: 114 actions |
| Through 20 | Lordaeron dungeon rewards and onward preparation | 20 + 22,365 through 21 + 5,095 | Sealed: 431 actions |
| Through 30 | Completed Gnomeregan rewards, including the ring upgrades | 30 + 41,407 through 31 + 3,046 | Sealed: 832 actions |
| Through 40–60 | Not yet qualified | Unresolved | No lock issued |

Each certificate has 48 checks: two difficulty policies × two finish strategies × optional-stop inclusion/exclusion × three loot workloads × fresh/restored state. All five actual classes are checked. The level-20 continuation is replayed from the saved level-10 handoff; level 30 is replayed from the saved level-20 handoff. Both preserve XP intervals, carried quests, objective confirmations and item holdings. Forty native class/selection/difficulty exports per block pass the independent review and Lua 5.1 syntax check. Quest-log peaks are six, nine and nine slots respectively; the enforced capacity is forty. Ordinary enemies stay within +4, with +5 reserved for independently identified dungeon bosses.

The slower loot workload yields more kill XP; these forecasts are ranges, not promised server payouts. The current qualification retains the lowest-level eligible creature and complete collection method, then compares expected kills at equal levels. This policy explicitly changed three earlier target/focus hints while preserving all 832 task IDs, source positions, quest phases, quantities and order. V534 issued new cumulative 20/30 payloads and a content-addressed `campaign-loot-target-revision.v1` record; the level-10 payload is identical. The original payloads and certificates remain preserved. That record is retained in the newer counter-scope revision's history; the unchanged lock verifier continues to reject implicit edits, and the index test verifies that every other task and plan field remains unchanged.

V1003 qualifies the same explicitly revised cumulative payloads on engine 234 / XP 199 and compiler 98. The counter scope correction associates kill XP and enemy access with each actual objective instead of attaching later creatures to the first counter. Only `combatObjectiveScope` is added to 1/35/61 actions through 10/20/30. The original lowest-eligible-loot-target revision remains in the content-addressed history. Full quantities, rates, actual prerequisites, +4/+5 limits, 40 quest slots and 30% outdoor/10% shared-dungeon allowances remain enforced. The local index selects `context-v1003.json`.

Completed 232/V881 and all four V882 independent audits pass: fast reaches 39 + 70,497..40 + 5,435 before Akiris at 40, expected reaches 41 + 59,907..87,278 and slow reaches 41 + 95,195..42 + 32,577 before the current Krol'dok planning stop at 42. All clear RFD without an explicit farm task. The 2,259-action plan preserves the 832 corrected prefix tasks. Its separately qualified public export ends at RFD and covers levels 1–39. The later V1002 continuation reaches at least 41 in all three workloads but still needs travel review and further funding; full 1–60 readiness remains false.

Run `pnpm leveling:download` from the repository root to generate and open the local BattleTag download page. Its separately pinned campaign 232 export ends at the RFD hand-ins, covers levels 1–39, contains 54 RestedXP documents and has no explicit farm task. The same edition is hosted at <https://kfcguild.online/tools/forever/leveling/download>. It is not a new level-40 lock or a full 1–60 release. Browser transport checks pass for both Forever and the labeled TBC flow test; actual in-game import remains untested. See `data/leveling/local-download/current.json` and `artifacts/leveling/local-download/verification.json`.

These tabulated bars use outdoor 30%; older ten-percent certificates remain historical evidence. V414's full default-30 funding replay completed with the same 1,670 actions and seventy funding quests. It does not qualify a complete itinerary or optimal travel. V415/V422 retain failed default-versus-explicit configuration comparisons. The corrected V423 checker passes 48 fresh/48 restored forecasts, 24 default-equivalence cases, twelve reached bundle handoffs/sixty player continuations and forty native/Lua exports on the unchanged current engine, without changing numerical inputs or hiding the failed reports. Full 1–60, the original 33 editions/four mixed rosters/sixteen legacy combinations/784 native starter combinations, later partial-counter saves and unreached bundle handoffs remain unfinished.

V383 requalifies the same three payloads with a source-checked reward-basis correction for Highland Hides (98815), preserving its 1,150 published/client amount without a second dungeon coefficient. Each block again passes 48 forecast/save cases and forty native/Lua control exports. The primary expected level-30 interval becomes 30 + 31,952 through 30 + 39,508; the tasks remain unchanged. V390 selects `context-v383.json` locally after V387/V388's corrected-data verification. The route still stops before Scarlet Monastery; these bars are reference projections, not observations or full-guide readiness.

## Files and checks

`primary-human-five/through-10.lock.json`, `through-20.lock.json` and `through-30.lock.json` identify cumulative prefixes. Each references a content-addressed `route-<sha256>.json` and a separate `validation-<sha256>.json`. Each later prefix contains the earlier one unchanged. Payloads preserve approved tasks; validation certificates bind the model, references and projected handoff states.

From the repository root, after building the leveling package:

```sh
node scripts/leveling-route-lock.mjs check \
  data/leveling/validated-segments/primary-human-five/through-30.validation-1f8db1d85a4c449a498cc14c0d20af7fc94e2d5929cae172a6912da877bbdeb0.lock.json \
  data/leveling/validated-segments/primary-human-five/context-v1003.json \
  .cache/leveling-no-grind-20261031/canonical-interaction-baseline-v1002.plan.json
```

The last argument is optional: supply the newly generated plan to check that its approved prefix remains unchanged. Context verification reads the actual compiled engine and the pinned local reference files. Those private reference files must be present; missing evidence is an error. `verify` also accepts independently computed current model/reference fingerprints; it must not be used to substitute stored fingerprints for a current-engine check.

```sh
node --test scripts/leveling-route-lock.test.mjs
```

The tests check byte integrity, cumulative prefixes, party binding, corruption, missing coverage, changed models/data and refusal to overwrite an existing seal. `prepareCampaignPlan` accepts `options.routeLock` for callers with verified current fingerprints. `options.routePrefix` explicitly reuses approved tasks, requires that current context and matching combat references, then reattaches combat before funding the later route. Stage guards and protected visit batching preserve the tasks. V277 production composition and V280's independent 48-case fresh/restored audit pass. The website does not automatically load this local index. See [multicore builds](../../../docs/forever-leveling-route-performance.md).

## Revising a block

Never overwrite a route payload or hide a failing check. A changed model or reference input requires a fresh validation of the same tasks. Preserve the old certificate and record the new certificate as an explicit reviewed revision. If the tasks themselves must change, issue a new payload and qualify the affected block and all downstream handoffs. The current sealer rejects implicit replacement; there is no force flag.

Full local evidence: `.cache/leveling-no-grind-20261031/primary-blocks-v231-validation.json` and `primary-block-v233-validation.json`. The latter uses the V232 preserved itinerary with the current ring/finish methods. Both original cold audits failed the unchanged Courier965 assertion and remain preserved. No commit, push, deployment, installation or game execution was performed.

Current requalification evidence: `.cache/leveling-no-grind-20261031/prefix-revalidation-v1003.json`. It revalidates the payloads containing the 61 explicit counter-scope additions. Their original V828 revision and older route payloads remain preserved. Older requalification evidence includes `prefix-revalidation-v937.json`, `prefix-revalidation-v546.json` and `arathi-handoffs-prefix-adoption-v547.json`. V534 intentionally revised the 20/30 target hints and preserves the original payloads; later certificates keep the revised payload hashes unchanged. Each current certificate has 48 forecast/save cases and 40 complete native/Lua reviews. V401 separately checks the completed object-handoff production task list on the corrected data. V408 additionally checks the corrected immediate bundle continuations. The complete native control exports also check Library partial counters and the outdoor Razorfen entrance after the approved prefix. Passing through 30 does not qualify all later partial combat-counter saves. V548 separately qualifies the reached bundle and adaptive-37 checkpoint on the completed fresh V547 task list; unreached handoffs remain unqualified. The separate V408 test qualifies only the twelve reached immediate bundle handoffs. Original contexts and certificates remain preserved; their projected bars are historical.

The V244 and V260 preparations terminated with exit 1 when funding relocated approved task 152. The locks correctly rejected them. V273 captured the candidate and exposed stale combat activities after prefix restoration. The corrected V277 production preparation completed with exit 0 at 10:52:34 UTC, preserving all approved actions. Neither that success nor the separate V280 consistency audit closes the remaining XP gaps or qualifies the complete guide.

V288 additionally fixes the real entrance-placement counterexample when other couriers intervene between Theramore and Desolace; full production and the independent V293 audit pass. The separate V292 counter-data trial failed when it attempted to relocate an approved optional program. Funding v41 instead preserves that program and guards a later fallback with its original visit selector. V300 completed its replay but selected no new quest; the remaining XP gap is unchanged, and the actual proposal rejection is under investigation. See the [current plan and evidence](../../../docs/forever-leveling-product-plan.md#current-local-state--multicore-builder-and-library--entrance-integration-v258v260).
