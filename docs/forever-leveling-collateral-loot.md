# Required fights and incidental quest loot

The current private route is V1549, which preserves this correction and moves a misplaced Uldaman follow-up pickup. The results below describe the V1539/V1540 collateral-loot change. [Latest route, independent reward checks and remaining classification questions](forever-leveling-platinum-discs.md).

The private **V1539 engine / XP revision 217** fixes an XP omission caused by overlapping loot objectives. The **V1540 primary candidate** accepts Twisted Evils on the first southbound Desolace pass, before the outer Maraudon caves. It retains **25 carvings per player, 125 for five players**. No captured probability or reward is changed. This candidate is not published.

## Route and accounting correction

The preparation sequence is **Nijel's Point → Willow at Kormek's Hut → Centaur Pariah → outside Prophet and three Khans → Shadowshard Fragments → Theramore**. The return visits Keeper Marandis at Nijel's Point before the full Maraudon run. Willow's acceptance no longer requires a separate visit on that return. Players keep any carvings actually looted during preparation.

The first trial exposed a bug: with Twisted Evils active, its alternative carving sources include the Prophet. The engine treated the unresolved carving drop as a reason to omit XP for the independently required Prophet fight, while still accounting for the activation amulet. In the expected unconfirmed-mallet case, that incorrectly removed **83 XP per player**. The failed comparison is retained in V1532; V1533 identifies the missing fight.

The correction separates the known work from unknown incidental loot. It prices the required material fight once and marks a separate active personal-loot counter as **unknown**, without granting any collateral item or completion. The later collection cannot infer an empty inventory, count the paid fight again, or receive a reward from this unknown counter. The original input state is unchanged.

The exception does not apply to loot required by the current action, conflicting quotas, another item occupying the same counter, or unresolved shared-kill objectives. Whole-quest completion still requires all objectives. Ten regression cases cover these boundaries and the three supported loot-sharing modes. Synthetic test rates are explicitly test contracts, not game evidence.

## Saved progress

The candidate builder binds its combat-model revision to the **frozen engine, raw combat artifact and complete normalized route definition**, using their full SHA-256 values. The existing attachment API's revision argument carries this identity; the provider revision remains separate. The builder checks attachment idempotence and the unchanged route fingerprint. This is artifact construction behavior, not an automatic hash added to every attachment call.

All 24 tested serialized handoffs preserve 120 player continuations. The carving counter remains unknown after the Prophet and survives restoration. Older hypothetical projections are rejected. The model is **9,855 characters**, within the existing **10,000-character** limit. Actual reported progress is not rewritten as an old hypothetical projection.

## Verification

The isolated engine passes **4,313 tests in 257 files**, strict TypeScript checks, source lint and all six entrypoint builds. All 256 older test files are unchanged. Relative to V1521, production source changes are confined to `campaign-material-combat.ts` and the XP revision in `campaign-xp.ts`; one regression test file is added.

Six primary scenarios cover the five fresh Human classes: Warrior, Priest, Mage, Rogue and Warlock. Both the original route under the corrected engine and the relocated-pickup candidate retain the previous XP totals and bounds. The Prophet is counted once for every player, with no carving inventory inferred.

| Optional mallet confirmed | Fast lower bar | Expected lower bar | Slow lower bar |
| --- | --- | --- | --- |
| No | 46 + 1,310 | 46 + 44,622 | 46 + 84,444 |
| Yes | 46 + 18,118 | 46 + 61,505 | 46 + 101,697 |

These are modeled workloads, not guarantees of every possible random drop outcome. All six stop at `dungeon-maraudon-objectives-complete-7041`, the unresolved normal Scion payout. No later Twisted Evils, Pariah or Seed reward is credited. Explicit grinding is zero; outdoor incidental XP remains 30%, dungeon incidental XP 10%, and the reached quest-log peak is 11 of 40.

Twenty native class/difficulty/role exports pass independent manifest and source-coverage review. Ten generated addon artifacts pass Lua 5.1 syntax. The early Willow pickup, personal quota instructions and complete Pariah/Seed lifecycles survive export. These checks do not simulate in-game availability or establish numerical admission for the at-level policy.

## Remaining evidence

Normal Scion XP and current quest-eligible carving rates remain unverified. The older elite payout reference is not a normal-creature calibration. Captured carving ratios have no recorded quest-eligible denominator; the historical 80% hypothesis cannot replace them. No single-clear yield guarantee is asserted.

A read-only census covers all 796 selected quest identities: 189 supply an item and 124 match the narrow historical parcel criteria. Of these, 121 lack an explicit supplied-item constraint. They are **review candidates**, not 121 confirmed defects: existing courier methods and item-start quests require separate classification. The census grants no items or XP.

The later route through 60, travel/gameplay and the original 528 edition/settings, 32 mixed settings and 784 native starter cases remain unfinished. The public V1394 download and canonical locks are unchanged. No commit, push or deployment is made.

Evidence under `.cache/leveling-no-grind-20261031/`: `willow-xp-inspection-v1533.json`, `v1535-collateral-red.log`, `collateral-loot-validation-v1538.terminal.json`, `collateral-loot-engine-v1539/scope.json`, `willow-route-construction-v1540.json`, `willow-route-validation-v1542.json`, `willow-native-validation-v1543.json`, `willow-route-qualification-v1545.json` and `source-flow-progress-v1546.json`.
