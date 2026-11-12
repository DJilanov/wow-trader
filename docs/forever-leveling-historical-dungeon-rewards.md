# Source-bound historical dungeon reward corrections

> Current private validation: **V1643–V1650** resolves twelve historical base-component curves, with scripted lifecycles still unqualified. The expected primary lower checkpoint is **46 + 48,073**; all cases still stop at the normal Scion payout. See [current evidence and limits](forever-leveling-script-base-reward-references.md). Public V1394 is unchanged; nothing is deployed. Earlier revision results below are historical.

The later **V1627 candidate** retains this dungeon component. [Latest historical curves, replay and remaining coverage](forever-leveling-orientation-reward-references.md). Results below describe the preceding component.

The private **V1592 engine / XP revision 219**, with the **V1593 candidate**, qualifies all eleven cases from the historical dungeon reward review under the existing **2.375 planning coefficient once**. Exactly two historical base facts are corrected; their original entries remain in provenance. The physical action sequence, hand-ins, inventory requirements and captured probabilities are unchanged. Current Forever quest types and payouts remain unobserved. This candidate is not published.

## Reference qualification and precedence

Each admitted case has historical **Type 81**, matching current title, objective text and quest level, ordinary class access, and a matching raw XP base. The [pinned historical XP rule](https://raw.githubusercontent.com/cmangos/mangos-classic/5731249195520323cb5fb9aa29761d4f033272ce/src/game/Quests/QuestDef.cpp) is fetched and its full checksum verified against the existing rule reference. The checked inputs use its level-1–60 branch. No other expansion's level range or reward is substituted.

| Quest | Historical raw base | Full-band planning reward |
| --- | ---: | ---: |
| 2864 · Tran'rek | 390 | 930 |
| 721 · A Sign of Hope | 2,750 | 6,550 |
| 722 · Amulet of Secrets | 3,150 | 7,500 |
| 3801 · Dark Iron Legacy | 500 | 1,200 |
| 4242 · Abandoned Hope | 5,450 | 12,950 |
| 4264 · A Crumpled Up Note | 6,200 | 14,750 |
| 4282 · A Shred of Hope | 6,200 | 14,750 |
| 4342 · Kharan's Tale | 1,600 | 3,800 |
| 4361 · The Bearer of Bad News | 6,400 | 15,200 |
| 4363 · The Princess's Surprise | 9,650 | 22,900 |
| 5281 · The Restless Souls | 6,850 | 16,250 |

The new helper admits only the exact reviewed source facts, matching the base, levels, provenance, status and complete per-level table by value. Changed or unmatched evidence does not acquire this fallback. Final and observed amounts take precedence; conflicts and pickup gates remain guarded, and level 60 contributes zero leveling XP. The normal dungeon coefficient and rounding functions are reused. No public API or schema is broadened, and no general rule turns an inside pickup into a dungeon bonus.

The two previously held bases are now resolved for this historical planning policy:

| Quest | Original inherited support entry | Selected Classic base |
| --- | ---: | ---: |
| 3801 · Dark Iron Legacy | 510 | 500 |
| 5281 · The Restless Souls | 6,600 | 6,850 |

The exact [pinned support input](https://github.com/Questie/QuestieDB/blob/365537a340473291f5af3b7a53a5eca94e2a5f1a/support/Forever/QuestXP/xpDB-classic.lua) contains explicit Classic alternatives matching the database's 500 and 6,850. Its bytes are identical to the Era support file and unchanged at the current provider revision. The provider's [Forever provenance](https://github.com/Questie/QuestieDB/blob/e9a67d1a2753a0e64c4c96bf7864788fac7b765f/docs/forever-data.md) identifies the inherited support seed. Neither entry is promoted to an observed Forever payout. This selection uses the historical Classic base policy consistently in both directions; the original 510/6,600 facts and source lines are preserved in the review artifact.

Only those two facts change in the candidate. Existing published, client-final and observed facts remain untouched. The original 510/6,600 variants stay outside the exact source-bound fallback, as the retained regression tests verify. Type-0 disc and voucher continuations, 2279 and 2439, also remain unchanged. The Restless Souls full-band example uses level 59; the level-60 cap always awards zero leveling XP.

## Full replay to the current checkpoint

All six primary five-Human scenarios are replayed from 1+0. Three affected quests are reached before the Scion checkpoint: Tran'rek, A Sign of Hope and Amulet of Secrets. The eight later references contribute no early reward. The latest two fact corrections preserve all reached ledgers, rewards, combat rows, XP totals and bounds across thirty primary player forecasts, matching V1570/V1571 exactly. The earlier nine-case correction preserved the prefix before its first affected hand-in.

In the expected workload without manual mallet confirmation, Tran'rek pays 930 at the level-42 return. A Sign of Hope pays 2,600 in its actual level-43 context, rather than its full-band 6,550; Amulet of Secrets pays 7,500. The independent audit checks every level in each hand-in interval, including cases where the minimum reward belongs to a higher possible level than the lower bar.

| Optional mallet confirmed | Fast lower bar | Expected lower bar | Slow lower bar |
| --- | --- | --- | --- |
| No | 46 + 7,696 | 46 + 48,024 | 46 + 90,605 |
| Yes | 46 + 24,399 | 46 + 64,844 | 46 + 107,803 |

These are modeled workload bounds, not guarantees for every loot outcome or observed XP bars. The earlier nine-case correction recalculated the entire reached continuation: reward gains can change later kill XP, overlevel reductions and interval bounds. It increased the expected unconfirmed-mallet lower endpoint by **3,402 XP**; no flat bonus was added to a saved endpoint. The latest two corrections leave that endpoint unchanged.

## Accounting and verification

All **4,352 tests / 259 files**, strict typecheck, source lint and six entrypoint builds pass. All 258 older test files remain unchanged in the latest revision. The 31 earlier reference cases and eight new correction cases cover source-bound coefficients, actual overlevel context, unchanged facts, eligibility/cap rules, final/observed precedence, conflicting bases and changed evidence. Production source changes are confined to the reward resolver, its new narrow helper and the XP revision; reference fixtures and the regression test are separate.

Independent checks cover **18,045 reached ordinary reward records / 602 distinct quest identities**, **240 owner-confirmed dungeon quest slots**, **24 saved handoffs / 120 player continuations**, twenty native roles and ten Lua syntax checks. Old hypothetical engine/route models are rejected. The physical action sequence is unchanged. The normalized route fingerprint changes with the two source facts, and the model remains 9,855 characters within the existing 10,000-character limit.

The existing independent conservation audit checks **141,600 ledger steps across thirty old and thirty new player forecasts**. The latest revision compares **70,800 reached steps** and the full corresponding rewards/combat/bounds against that validated engine; the conservation audit is reused through this exact equality and is not rerun. Each known step connects to the preceding bar and respects both lower and upper XP contribution bounds. Each endpoint reconciles with scalar contribution minima plus the tightening implied by correlated level bands. Incidental XP is already part of combat XP and is never added again. The first V1574 diagnostic incorrectly added that subtotal twice; it is superseded by the checked V1576/V1577 reports. No runtime change was needed for that diagnostic correction.

For the expected workload, quest contributions rise by 6,390, combat contributions fall by 1,414, and the change in lower-bound tightening is −1,574. Together they explain the 3,402 change in the endpoint. Lower/upper boxes remain conservative enclosures, not proof that their extreme party states are jointly attainable.

An additional component matrix checks all eleven historical rewards at every player level 1–60 using exact integer arithmetic for the 19/8 coefficient, reductions and rounding: **660 historical reward cells**. Another **1,980 synthetic final/observed/conflict controls** verify precedence and guards. These controls are test inputs, not game observations. Dark Iron Legacy's full-band planning reward is 1,200, reducing to 950 at level 58 and 710 at 59. The Restless Souls is 16,250 below the level-60 cap.

## Remaining qualification

The eleven-case historical reference review is complete. Current-server quest types and payouts remain unobserved for this correction. Normal Scion XP, Twisted Evils' full **25 carvings per player / 125 for the party**, later route through 60, travel/gameplay and the original **528 edition/settings, 32 mixed settings and 784 native starter cases** remain unfinished. All six fresh primary forecasts still stop at `dungeon-maraudon-objectives-complete-7041`; no future Twisted, Pariah or Seed reward is credited.

The public V1394 download and canonical locks are unchanged. No commit, push or deployment is made. Earlier failed checks are retained; final checks above pass.

Evidence under `.cache/leveling-no-grind-20261031/`: `held-dungeon-base-review-v1587.json`, `dungeon-base-validation-v1590.terminal.json`, `dungeon-base-engine-v1592/scope.json`, `dungeon-bases-route-construction-v1593.json`, `dungeon-reward-level-matrix-v1594.json`, `dungeon-bases-route-validation-v1595.json`, `dungeon-bases-native-validation-v1596.json`, `dungeon-bases-route-qualification-v1599.json` and `source-flow-progress-v1600.json`. The earlier V1570/V1571 correction and V1577 conservation evidence remain pinned.
