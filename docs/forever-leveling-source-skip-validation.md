# Source applicability before optional XP uncertainty

## Validated computational revision — November 5, V1396–V1404

The isolated **V1402 engine / XP revision 209** corrects a false forecast stop. An optional quest pickup could halt when its lower and upper projected XP bars crossed the chapter target, even though every participating player's known quest state made the source condition false. Skipping that unavailable source action changes no XP, item holdings or quest completion.

The correction checks whether the source action can apply to any participating player before declaring its optional XP decision ambiguous. An executable or unknown source condition retains the existing stop. Personal actions consider their assigned player. Failed timed quests still take their existing failure path. Native quest conditions, probabilities, reward facts, personal quotas and enemy limits are unchanged.

The concrete case is `post-scarlet-east-21-source-step-0084`, accepting Rhapsody's Kalimdor Kocktail (1452). Its retained source guard requires 1451 to be active, while the preceding source phase hands in 1451. The correction lets the forecast skip that guarded pickup; it **does not accept 1452, complete its three collections or award its reward**. Properly integrating that chain remains separate work.

## Verification

- The new regression initially fails on the old engine: a known false source condition incorrectly stops the forecast. Nine final regression cases cover false, executable, unknown-resource, mixed-party and personal-player conditions.
- **4,141 tests / 245 files**, strict TypeScript, full source lint and all six package entrypoint builds pass. All 244 older test files are byte-identical.
- **18 route/settings cases × five actual classes = 90 player cases** replay the published tablet plan, the private courier/Searing bridge and the experimental Stranglethorn collections. All 60 published/bridge player cases and 20 fast/expected collection cases preserve every compared numerical event, reward, endpoint and XP bound.
- The ten slow collection cases pass the false stop and reach the still-unverified Maraudon Scion payout. No Vyletongue reward or synthetic calibration is admitted.
- **54 actual saved handoffs / 270 player continuations** preserve all subsequent events, endpoint bars, XP bounds and personal collection inventories. The complete quotas remain fifteen ears and eighteen tusks per player.
- **20 native class/difficulty/role exports** pass independent review and Lua syntax. Their documents are byte-identical to the previous method engine.
- All **21,780 frozen input pins** are checked again when aggregating the evidence.

The first replay verifier attempted to iterate an optional absent `sourceSkips` array. Its failure is preserved; the corrected verifier uses an empty array only for that absent report field. No calculation or route input changed. A personal-action test initially forgot that four other players already held the parent quest; its corrected expectation preserves those occupied log slots.

## Unpublished collection frontier

The table describes the experimental six-action ear/tusk addition and private courier/Searing bridge. Its camp binding, practical timing, route admission and broader delivery qualification remain unfinished.

| Workload | No manual mallet: lower bar | Current stop |
| --- | --- | --- |
| Fast | 45 + 59,012 | 58,488 XP short of Maraudon 46 |
| Expected | 45 + 100,061 | 17,439 XP short of Maraudon 46 |
| Slow | 46 + 20,474 | Unresolved Scion combat XP |

With manual mallet confirmation, fast remains 41,586 XP short, expected remains 489 short, and slow reaches 46 + 37,778 before the same unresolved fight. Confirmation does not create a mallet item or prove ownership.

The historical creature row for Noxxious Scion has an experience multiplier of one and no supplied zero-XP flag. It does not support assuming that its eight required fights award zero XP. It also does not establish the current Forever normal-creature dungeon payout. That calibration remains unresolved.

## Additional Maraudon integration inputs

The review identifies three omitted quests whose full acquisition methods are still needed:

| Quest | Existing data and historical comparison | Remaining work |
| --- | --- | --- |
| 7028 Twisted Evils | Matching title, levels and all historical item slots support a reference quantity of fifteen carvings per player; normalized quantity is still null. | Model full-party acquisition, overlap with required kills, pickup and actual Willow return. |
| 7067 The Pariah's Instructions | The existing one-Amulet requirement matches the historical row. Captured source separately requires all five Khan gems and distinguishes three outside and two inside encounters. | Model the supplied book, Amulet of Spirits, five gem acquisitions, conversion and actual Pariah return. |
| 7070 Shadowshard Fragments | Historical item slots specify ten fragments; current normalized quantity is null. Current minimum level is 39, historical minimum is 38, so the strict quantity identity gate remains failed. | Qualify the mismatch, outside-cavern encounter, full party sharing, access guards and actual Theramore return. |

The existing fixed-one historical drop references for the two Shadowshard targets are **80%**, with shared-roll item flags. Comments describing guaranteed drops do not replace those records. The captured source places those targets outside the instance. These findings add no runtime quota, reward or XP credit. [Current quest description](https://www.wowhead.com/forever/quest=7070/shadowshard-fragments).

## Publication and remaining scope

The public download remains the separately qualified **V1394 tablet edition**, with 1,694 tasks / 73 documents through the pre-Maraudon hand-in. Neither this computational prototype nor the private collection/bridge experiments are published. Canonical segment locks are unchanged.

Full 1–60, the original 528 edition/settings cases, 32 mixed settings, 784 native starter cases, final travel optimization and actual-game validation remain incomplete. This revision proves the specified calculation and restore behavior; it does not prove the full guide ready.

Evidence: `.cache/leveling-no-grind-20261031/source-skip-engine-v1402/scope.json`, `source-skip-replay-v1400.json`, `source-skip-handoffs-v1403-*.json`, `source-skip-native-v1404.json`, `mara-creature-history-v1401.json`, `mara-extra-proof-v1406.json` and the V1398/V1399 build/test terminal records. The first Mara quantity probe's failed historical minimum-level assertion remains preserved and unresolved for 7070.
