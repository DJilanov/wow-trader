# Quest availability and the Jarl/courier revision

## Qualified Jarl/courier revision — November 5

The separate V1340 plan / frozen V1341 engine adds Jarl Needs Eyes (1206) and the two James Hyal courier stages (1301/1302). It preserves every previous action, reward fact and personal item requirement. Canonical segment locks remain unchanged. These programs are now included in the V1361 levels 1–44 download, which uses the later Southsea revision. [Publication evidence](forever-leveling-download-deployment-2026-11-04.md). Independent qualification passes full source tests, fresh/restored forecasts, **525 saved handoffs / 2,625 player continuations**, 320 native exports and source checks. All **19,182 pins** match.

The later [Southsea consolidation](forever-leveling-southsea-order.md) retains all these quest programs and advances their qualified continuation. Its newer frontier supersedes the earlier bars below; this document preserves the Jarl/courier qualification.

## Jarl Needs Eyes

The first Jarl visit is too early for the chosen camp in the fastest workload. The complete program instead follows the existing Orc Report pickup near Jarl on the later Dustwallow visit. Soothing Spices (1218) is actually rewarded earlier in the full route; no completed parent is supplied for free.

Every character collects **40 Unpopped Darkmist Eyes**, **200 for five players**, then returns to Jarl. The original first waypoint is retained, at approximately **35.43, 21.98**, with its captured 70-unit marker. The instruction names Darkmist Spiders, keeps the poison warning, and tells players to remain at that camp rather than enter the mine.

The same-provider spawn census within that marker includes Darkmist Spider (35–36), Darkmist Recluse (36–37) and Darkmist Silkspinner (38–39). The unchanged +4 rule therefore requires **level 35 before combat**. All three identities and the source's floor-1 coordinate are bound to the review. Changed source coordinates, provider identity, neighboring levels or personal quota do not reuse the qualified camp.

The existing quest reward is **2,750 client-final XP per player**. The already selected `exclude-unpriced-extra` policy assigns zero unpriced acquisition XP. The captured item-count ratio is not converted into a per-kill multi-item probability. This does not establish actual kill count, camp duration, spawn frequency or current-server payouts.

## Courier order and availability

The pinned literal provider specifies:

| Quest | Unavailable after completing |
| --- | --- |
| 1301 · James Hyal, Stormwind → Menethil | 1282 · They Call Him Smiling Jim |
| 1282 · They Call Him Smiling Jim | 1302 · James Hyal, Menethil → Theramore |

The candidate follows this order:

1. Accept 1301 during the existing Stormwind 1248 pickup visit.
2. Deliver 1301 and accept 1302 during the existing Menethil 1248 hand-in visit.
3. Keep 1302 in the quest log through the later Dustwallow visit.
4. Accept and turn in 1282 through its existing program.
5. Deliver 1302 to Clerk Lendry upstairs in the Theramore keep, after the actual 1282 hand-in.

Both courier stages retain their existing **700 client-final XP** rewards. The two personal courier actions are distinct; no reward is paid before its actual return. This uses the existing journeys and the existing later keep visit.

In the pinned RestedXP **4.11.27** implementation, `.isQuestAvailable` is the inverse of the turned-in check. An accepted quest does not fail that guard. The existing captured `.isQuestAvailable 1302` on the 1282 pickup is preserved. Finishing 1302 before that pickup would fail the guard, so that earlier delivery is not used. This is source/reference qualification, not an observed current-server acceptance test.

## Implementation

The optional `availableUntilCompletedQuestId` field preserves literal provider field 33. `campaign-quest-availability.ts` attaches a matching provider hash and action identity, rejects missing/conflicting provenance or mixed quest actions, and supplies the same guard to the forecast and native compiler. Saved combat projections include that availability identity; changing it invalidates a continuation rather than reusing stale hypothetical state. Inputs without the new restriction retain their previous projection identity.

The camp uses the existing reviewed-target composition with an optional coordinate floor. All previous floor-0 camps retain their checks. New regressions cover the floor-1 camp, full personal quantities, strict defaults, changed evidence, all four blocker states, source import, native guard consistency and saved-model identity. No previous test file changes.

## Validation and remaining scope

The isolated source passes **4,114 tests / 243 files**, strict typecheck, lint and declaration build. All **241 older test files** remain byte-identical. Six fresh/six restored five-class forecasts, **525 saved handoffs / 2,625 player continuations**, **320 native exports / 640 roles**, and 30 source cases without warnings pass. Every previously qualified saved handoff and every new action boundary remains covered. All 19,182 pins and existing canonical files match. Summary: `.cache/leveling-no-grind-20261031/eyes-courier-delivery-audit-v1342/summary.json`; progress receipt: `source-flow-progress-v1345.json`.

The first two-quest trial leaves **12 XP** missing before Krol'dok because additional levels reduce later quest rewards. That diagnostic is retained. The final three-quest order clears Krol'dok in every primary workload; it does not round the deficit away or change XP assumptions. All primary cases now stop before Maraudon 46:

| Workload | No confirmed mallet: lower bar | XP still required | Manually confirmed mallet: lower bar | XP still required |
| --- | --- | --- | --- | --- |
| Fast | 44 + 62,202 | 167,098 | 44 + 79,105 | 150,195 |
| Expected | 44 + 98,395 | 130,905 | 45 + 3,709 | 113,791 |
| Slow | 45 + 23,709 | 93,791 | 45 + 41,087 | 76,413 |

The provider availability census checks 785 selected quest identities and finds three restrictions. The two reached courier restrictions pass all 15 primary player/workload cases. The 3451 → 3449 restriction belongs to an unreached later section and still needs binding and validation before that section can be qualified.

The next funding review has 55 archived, complete, unselected ordinary programs at quest levels 35–47. Their source methods, personal supplies, prerequisites, travel and enemy access remain to be qualified; discovery grants no XP. Full 1–60, final travel, original wider-group scope and actual-game verification remain unfinished.

Evidence under `.cache/leveling-no-grind-20261031/`: `eyes-camp-v1327.json`, `hyal-discovery-v1323.json`, `eyes-courier-route-v1339.json`, `eyes-courier-route-v1340.json`, `eyes-courier-engine-v1341/scope.json`, `eyes-courier-delivery-audit-v1342/`, `selected-availability-v1343.json`, and `pre-mara-candidates-v1343.json`.
