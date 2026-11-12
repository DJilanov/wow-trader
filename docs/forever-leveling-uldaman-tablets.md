# Uldaman: the complete Lost Tablets preparation

## Qualified revision — November 5, V1363–V1370; published V1394

The separate **V1363 plan / frozen V1364 scope** adds The Lost Tablets of Will (1139) to the first Uldaman visit. Its entire prerequisite chain starts from the actual earlier quest state. Thirteen existing source phases move before entry; nine actions add the outside approaches, the Ambassador fight and city returns, and the tablet pickup and return. Canonical segment locks remain unchanged.

The public download now includes this tablet revision: **V1394, published at 20:10:21 UTC**, with **1,694 tasks / 73 documents per mode**. Its exact prefix is independently qualified in V1393 and still ends before Maraudon. Both actual public browser downloads pass. [Public release and rollback](forever-leveling-download-deployment-2026-11-04.md).

## Player flow

1. Finish A Sign of Hope (720), then accept the next A Sign of Hope (721) from Prospector Ryedol in the Badlands.
2. Enter the outer excavation through the captured Badlands entrance, **44.70, 12.09**. Reach Hammertoe Grez in the uninstanced tunnels; do not enter the portal yet.
3. Complete the 721–723 Hammertoe/Magregan sequence and return to Ryedol. Pick up Prospect of Faith (724).
4. Complete the Ironforge deliveries 724–726. Accept An Ambassador of Evil (762) from Historian Karnik.
5. Return through Loch Modan to Angor Fortress in the Badlands. Every player needs **one Ambassador Infernus' Bracer**. Return to Advisor Belgrum in Ironforge; accept The Lost Tablets of Will (1139).
6. Return for the full Uldaman run. Collect **one Tablet of Will per player** in Galgann Firehammer's room. Hand it in on the actual Ironforge return after Back to Uldaman (1360).

The two Ironforge returns are real travel. No Alliance Badlands flight point, free quest item, completed prerequisite or interior tablet coordinate is assumed. Correct existing Ryedol and Ironforge markers remain. The old continent-level markers for the outer tunnels are filtered from those source steps; three separate reviewed Badlands approaches replace them. Original quest conditions remain intact.

## Evidence and XP

The archive contains complete 721–726 programs when the real dungeon tags are supplied to its source selector. It does not contain complete 762 or 1139 programs. Those two programs are explicitly generated from reviewed provider/catalog identities; they do not claim an archived source identity.

The source review uses the matching Questie provider exports, build-70205 catalog, source archive, Badlands map geometry and pinned historical ClassicDB. The normalized 762 quantity was missing. Exact quest identity, parent, item, all four historical item slots and absence of a reward script establish the single-bracer reference quantity. The existing 1139 quantity stays one; every other personal quota remains unchanged.

| Reward | Reference used | Modeled reward |
| --- | --- | --- |
| 762 An Ambassador of Evil | Historical, unscaled ordinary quest reward | 4,650 XP once/player |
| 1139 The Lost Tablets of Will | Existing 5,850 dungeon-table base | 13,900 XP once/player after the existing 2.375 coefficient and rounding |

The tablet pickup adds **zero acquisition-kill XP**. The Ambassador fight uses the existing historical fixed-one quest-only drop reference. In the fast no-mallet replay at player level 43, its one modeled kill contributes **122 XP/player**, including 28 incidental outdoor XP. This is a reference estimate, not an observed current-server payout. The proof retains all five players' personal acquisition and consumption states.

The outer-tunnel and Angor review uses a conservative 70-world-unit buffer around the new markers. Its possible actor maximum is 42; no ordinary +4 rule is relaxed. Galgann's matching provider identity is level 45 elite, so the tablet step requires at least 41 before entry. The actual tested party reaches that step at 43 or above. Imported guard-only actors add no invented kill XP.

Useful public source context: [Lost Tablets quest](https://www.wowhead.com/forever/quest=1139/the-lost-tablets-of-will), [Uldaman overview](https://www.wowhead.com/forever/guide/uldaman-dungeon-overview-location-rewards), and the [licensed historical Uldaman map](https://ptgmedia.pearsoncmg.com/imprint_downloads/brady/wow/uldaman/uldaman_lr.pdf). Historical levels, maps and rewards are not proof of current Forever payouts.

## Qualification

The runtime is byte-identical to the earlier **4,114-test / 243-file** frozen engine. Eleven additional method tests reject wrong builds, provider identities, parents, class restrictions, quantities, objects and guardian metadata. No runtime code or earlier test was changed.

Independent checks pass:

- Six fresh and six restored five-class cases: **30 actual class/workload settings**.
- **717 numerical handoffs plus 18 explicit no-XP approach handoffs = 735**, covering **3,675 player continuations**. All 603 older handoffs remain.
- Every later event, endpoint and XP bound matches a fresh replay after each handoff. Individual bracer/tablet acquisition and hand-in consumption remain intact.
- **320 native exports / 640 roles**, independent source review and Lua syntax. The entire parent chain precedes the first Uldaman entry; the tablet follows entry and returns after the real city hand-in.
- Thirty source cases with **zero warnings or violations**; all **19,254 input pins** and canonical pins match.

The first producer assertion accidentally removed the already-existing 1139 quantity from only one side of a quota comparison. The actual data diff adds only the previously missing 762 quantity. The initial independent verifier also retained the previous Southsea-only mutation expectation and incorrectly assumed zero XP for the Ambassador fight. Those failed logs remain; corrected checks preserve the route data and its numerical inputs. An initial aggregation correctly rejected untested no-XP approaches; separate actual handoff replays then covered them.

## Current frontier

| Workload | No manual mallet: lower bar | XP missing before Maraudon 46 | With manual mallet: XP missing |
| --- | --- | --- | --- |
| Fast | 44 + 110,417 | 118,883 | 101,981 |
| Expected | 45 + 37,024 | 80,476 | 63,362 |
| Slow | 45 + 73,210 | 44,290 | 26,923 |

The no-mallet net gains are **19,565 / 19,485 / 17,791 XP** after recalculating actual hand-in levels and combat. The remaining Maraudon gap is still real. Full 1–60, the original wider-group matrix, final travel optimality and actual in-game validation remain unfinished.

Evidence: `.cache/leveling-no-grind-20261031/tablet-route-v1363.{plan.json,json,terminal.json}`, `tablet-engine-v1364/scope.json`, `tablet-program-v1364.test.mjs`, `tablet-delivery-audit-v1365/summary.json`, corrected V1366 primary/source reports, and `tablet-approach-handoffs-v1368.json`. The private diagnostic V1372 courier/Searing bridge is separate and not independently qualified.
