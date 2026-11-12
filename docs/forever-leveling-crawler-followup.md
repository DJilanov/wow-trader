# The crawler follow-up: source, camp and XP

## Current checked revision — November 5

The separate **V1320 plan / frozen V1321 engine** restores the complete “… and Bugs” quest (1258) for the five-player Human route:

1. Accept from Morgan Stern after the existing Mudrock and Stinky hand-ins in Theramore.
2. Collect **12 Pristine Crawler Legs per player**, during the existing Swamp of Sorrows coastal visit, after Driftwood collection and before its return.
3. Turn in to Morgan during the existing Theramore visit that delivers Akiris by the Bundle.

Every older action, personal quota and reward fact remains unchanged. The new item requirement is twelve per character, **60 for the party**. No free starting items or completed parent quest are assumed in the full route; 1204 is actually rewarded before pickup.

The existing client-final reward remains **3,150 XP per player**, paid once. The already selected `exclude-unpriced-extra` policy excludes unknown acquisition kill XP. Captured multi-item sample ratios remain unchanged and are not promoted to per-kill probabilities. The reference bars describe accounted XP; actual gathering could add XP outside that model. No kill count, gathering duration, spawn density or respawn rate is promised.

The fast-case gap before Krol’dok 42 falls from **5,926 to 2,776 XP**. Without manual mallet confirmation, expected/slow cases still need **133,604 / 97,017 XP** before Maraudon 46. Full 1–60 and the original wider-group matrix remain unfinished. Its exact **1–41 prefix is now published**, at **17:34:44 UTC**, with **1,520 tasks / 60 documents** per mode. Both public downloads pass actual Chrome checks. [Publication and rollback](forever-leveling-download-deployment-2026-11-04.md).

## Northern camp and access

The old source describes both Silt and Monstrous Crawlers and a long coastal loop. The reviewed method keeps only its **first original waypoint**, about **79.81, 6.90** in Swamp of Sorrows, and tells players to remain at that northern camp. It does not retain the southern loop or mixed-crawler kill instruction.

The matching-build map assignment binds the original world coordinate to that map location. The pinned provider has a Silt Crawler spawn about 14.6 world units away; the nearest Monstrous Crawler reference is about 140.2 away. Within the source marker’s 70-unit radius, the provider also has Shadow Panther (39–40) and Sawtooth Snapper (41–42) references. All three identities are checked before combat. The level-42 neighbor therefore requires **party level 38 under the unchanged +4 rule**. Every tested full-route workload reaches this visit at level 38 or higher.

The reviewed-target configuration binds the archive/source version, original waypoints, provider revision/hash, item/quota and exact target/neighbor metadata. The shortened camp applies only while the existing policy actually omits the unpriced acquisition. A priced replacement, incompatible source/provider, changed waypoint, or missing/conflicting neighbor metadata does not reuse this review. Older reviewed camps and strict acquisition defaults retain their behavior.

The target attachment uses the validated full NPC reference set to qualify camp neighbors before adding those required identities to the smaller combat plan. Reattachment is idempotent. Native export retains the selected source occurrence and one `.goto`, one Silt Crawler target, the real quest counter and the level-38 readiness check.

## Verification

- **4,092 tests / 241 files** pass. All **240 earlier test files** remain byte-identical. Twelve new camp regressions include strict defaults, metadata/source changes, reattachment and native marker/target consistency.
- Strict typecheck, lint and build pass; 65 focused target/native/acquisition tests pass.
- Six fresh and six restored actual-five-class cases, 30 class/workload cases and all **17,927 pins** pass.
- **422 saved handoffs / 2,110 player continuations** preserve every later event, endpoint and XP bound, including each player’s twelve legs and once-only consumption.
- **320 native exports / 640 roles** pass independent review and Lua syntax. Thirty source-flow cases have no warnings or violations.
- Existing canonical files are unchanged. Qualification itself performed no deployment. The later V1331 publication deploys the exact checked prefix; no Git commit, push or actual-game import occurred.

The initial focused draft could not see the two neighbor records because combat metadata was narrowed before target qualification. The corrected composition qualifies against the validated provider records, then includes only the required neighbors. The failed draft and a preparation assertion that initially rejected the intentional new twelve-leg requirement remain preserved. Neither failure was resolved by weakening enemy limits, changing old quotas or fabricating drop probabilities.

Evidence under `.cache/leveling-no-grind-20261031/`: `crawler-spatial-v1312.json`, `crawler-camp-v1313.json`, `crawler-data-v1314.json`, `crawler-route-v1320.json`, `crawler-delivery-audit-v1322/summary.json`, and `source-flow-progress-v1326.json`. The isolated implementation is `crawler-camp-preview-v1314/`, with compiler 105 / XP revision 206; `crawler-camp-engine-v1321/` preserves its source and runtime.

## Subsequent Jarl and courier qualification

The later **V1340 / frozen V1341** revision qualifies Jarl Needs Eyes with all forty eyes per player, a real completed 1218 parent, the later level-35 Jarl visit, a bound northern camp and actual return. Both Hyal courier stages also qualify: complete 1301 before 1282, keep 1302 accepted through 1282’s real hand-in, then deliver 1302 to Clerk Lendry. The actual RestedXP 4.11.27 guard checks completed status, so an accepted 1302 does not invalidate the 1282 pickup. The earlier component and courier-conflict discovery remain preserved; no component starting state is granted to the route.

That separate candidate clears Krol’dok in every primary workload and next stops before Maraudon 46. It passes 4,114 tests, 525 saved handoffs, 320 native exports and all 19,182 pins, but is not published. [Implementation, evidence and remaining scope](forever-leveling-quest-availability.md).
