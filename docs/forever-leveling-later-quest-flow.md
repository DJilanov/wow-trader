# Later shared quest flow: source binding and validation

> Current private validation: **V1643–V1650** resolves twelve historical base-component curves, with scripted lifecycles still unqualified. The expected primary lower checkpoint is **46 + 48,073**; all cases still stop at the normal Scion payout. See [current evidence and limits](forever-leveling-script-base-reward-references.md). Public V1394 is unchanged; nothing is deployed. Earlier revision results below are historical.

The later **V1627 candidate** retains this source-flow component. [Latest historical curves, replay and remaining coverage](forever-leveling-orientation-reward-references.md). Results below describe the preceding component.

The private **V1602 candidate** corrects the source chosen for **The First and the Last (6182)**. It reuses the unchanged **V1592 engine / XP revision 219**. This is a source-flow correction; it does not qualify XP beyond the unresolved normal Scion checkpoint in Maraudon, and it is not published.

## Pickup correction

The selected action used `chapter-44-56-57-burning-steppes`, step `source-step-0064`. That step requires Dragonkin Menace (4182) to have been turned in. Quest 6182 is shared and remains selected when raid preparation is disabled, while 4182 is excluded in that setting. The source predicate consequently skips the pickup.

The same pinned chapter also contains `source-step-0085`: an unconditional alternative at **Highlord Bolvar Fordragon**, using the exact same Stormwind position and instructions. The candidate binds the existing action to that alternative and preserves its action identity, position, order and quest phases. Only the source identity and corresponding position line number change. The raw archive and guard evaluator remain untouched, and the original step still retains its guard.

Both source steps contain the same level-56 directive; the catalog's **minimum level 56** is unchanged. Actual arrival eligibility remains unqualified until the preceding XP forecast can continue. The source regression uses controlled level-56 inputs: the old action selects nobody without 4182; the replacement selects all five players. With 4182 rewarded, the old action also selects all five.

Reward facts, item requirements, source captures and all other actions remain identical. The route fingerprint and saved-model identity change with the source binding. No reward is granted early.

## Checks completed

- All six primary fresh 1+0 replays preserve every reached ledger, reward, combat row and XP bound: **30 players and 70,800 compared steps**. Each still stops at the normal Scion payout checkpoint. The new pickup is later and contributes no XP before it.
- Independent checks cover **18,045 ordinary reward records / 602 quest identities**, **240 owner-confirmed dungeon quest slots**, and **24 saved handoffs / 120 player continuations**. Saved states from the older hypothetical route model are rejected.
- **80 native role exports** cover the five primary classes, both difficulty policies, raid preparation on/off, and the supported `dungeons`/`mixed` finish settings. Source coverage, the new pickup's NPC/position, selected quest phases and **40 Lua 5.1 syntax checks** pass.
- A static audit checks selected phase order, full catalog coverage, absence of class detours and catalog all/any prerequisites in eight settings. It covers **3,382 phases after the checkpoint**. **2,076 controlled pickup/turn-in source-predicate checks** have no later skips. Controlled states isolate predicates; they do not establish objective completion, quest-log occupancy, combat eligibility or actual travel.
- The one hand-in without a separate pickup, **The Missing Diplomat (1267)**, matches the existing exact Method-0 instant-handoff proof and its real 1324 predecessor. It is not silently treated as a missing pickup or given a fabricated acceptance.

The dungeon finish deliberately selects only the standalone 6182 delivery from this chain. The mixed finish retains 6183 and 6184 in order. Native checks follow that actual selection. Initial harness checks incorrectly assumed the full chain in both modes and used the unsupported name `questing`; these failed checks are recorded, and the corrected harness validates the existing `mixed` schema. Neither correction changes the runtime or candidate.

The unchanged runtime's **4,352 tests / 259 files**, strict typecheck, lint and six builds are reused from their recorded successful run. They are not claimed as newly run here. The historical reward matrix is reusable because every reward fact remains unchanged. The earlier conservation proof is reusable through exact reached-ledger equality; no fresh conservation run is claimed.

## Remaining work

The primary lower bars remain:

| Optional mallet confirmed | Fast | Expected | Slow |
| --- | --- | --- | --- |
| No | 46 + 7,696 | 46 + 48,024 | 46 + 90,605 |
| Yes | 46 + 24,399 | 46 + 64,844 | 46 + 107,803 |

These are modeled workload bounds, not observed bars or guarantees for every loot outcome. Normal Noxxious Scion payout remains unresolved. The existing elite XP anchor is not applied to those normal enemies, and they are not assigned zero XP. The existing user sample request remains pending.

Twisted Evils remains **25 carvings per player / 125 for the party**. Quest-eligible drop evidence and completion on the selected clear remain unqualified. The source-flow checks do not prove the later route's arrival levels, funding, single-clear loot yield or current-server payouts. Full 1–60, actual gameplay/travel and the original **528 edition/settings, 32 mixed settings and 784 native starter cases** remain unfinished.

Public V1394 and both canonical/download indexes are unchanged. No commit, push or deployment is made.

Evidence is under `.cache/leveling-no-grind-20261031/`: `first-last-binding-review-v1601.json`, `first-last-route-construction-v1602.json`, `first-last-route-validation-v1603.json`, `first-last-native-validation-v1604.json`, `first-last-native-harness-review-v1604.json`, `later-quest-flow-v1605.json`, `first-last-qualification-v1606.json` and `source-flow-progress-v1607.json`.
