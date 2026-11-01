# Trash roles, navigation and main-tank references — November 1, 2026

Live: <https://kfcguild.online/tools/forever/raid-composition>.

- Pushed source: `8a6d6ffc29f76b4d61fb9bb67200c0496e031232` (`8a6d6ff`), including trash/navigation
  commit `cbf27c3` and the selected-main-tank correction.
- Source release: `/home/wow-trader-system/releases/kfc-helper-raid-composition-20261101-8a6d6ff`.
- Next build: `U6Umudal7CEZq84qPCfTq`; activated `2026-11-01T08:45:38.711Z`.
- Matching static delivery: `kfc-helper-raid-composition-20261101-8a6d6ff`.

## Behavior

Every 10/20/40 default assigns one Retribution Paladin to Protection with tank
gear on trash, returning to Retribution for bosses. It remains one roster slot.
Role totals show both phases; the class card, duty sheet and per-seat checkbox
identify the switch. Suggestions retain the assigned flex seat, manual moves
carry its annotation and locks prevent changes. Replacing its boss build clears
an incompatible annotation. No extra tank DPS, threat, healing or survivability
is added to boss calculations just because a trash assignment is checked.

Older anonymous drafts/shared links initialize one eligible unlocked Ret once.
The stored `trashPlanVersion: 1` preserves subsequent opt-outs. No eligible Ret
means no invented player; the UI explains how to choose or unlock one.

The Main tank headline previously used the highest TPS across every roster tank.
It now shares the selected-main-tank resolver with survival: active DPS, TPS,
health, armor and incoming damage use the same calculated pre-raid mitigation
build. The independently linked threat alternative follows the same class and
labels its different loadout. Selected tanks stay selected when their seats move;
trash-only Protection cannot become a boss main tank. Raid totals still include
all actual roster tanks, so choosing their assignment does not remove a player.

| Selected tank | Active DPS | Active TPS | Separate threat-build TPS |
| ------------- | ---------: | ---------: | ------------------------: |
| Warrior       |      337.1 |      831.0 |                   1,260.8 |
| Bear          |      370.4 |    1,241.2 |                   1,786.3 |

These are the retained calculated all-slot pre-raid references, not generic PvP
starters or new-hotfix measurements. Existing source/proof checks remain. No new
native search or numerical benchmark was run, and no threat figure is replaced
with an invented multiplier.

Desktop/mobile navigation now says Trader, Leveling, Encyclopedia and Simulator.
Those destinations retain their Forever URLs; TBC remains under TBC Tools.
Encounter defaults and the bounded theoretical-survival assumptions are unchanged.

## Verification

- 88 relevant tests passed, including migration/opt-out, invalid/locked assignment,
  role counts, boss metric isolation, suggestion/movement retention, navigation,
  selected pre-raid references and main-tank movement regressions.
- Strict TypeScript, scoped lint and formatting passed. The complete Linux Next
  production build passed, including its TypeScript step.
- Both the private candidate and public build passed 42 Chrome checks each: 18
  focused new checks plus the existing 24-case planner regression. This includes
  actual Warrior/Bear switching compared with the real catalog, trash/boss phase
  counts, stable boss metrics, sharing/old-plan migration, locks/moves/suggestions,
  both navigation layouts and 1440/390/320px containment. No browser exceptions or
  failed script/style/image/font responses were recorded.
- All six selected/alternate tank build links returned 200. The validated real
  catalog retains 32 references, 28 player TPS counters, three incoming tank
  models and four single-target healer references.
- Static-delivery integrity, compression, Nginx and privacy checks passed. All 13
  release-overlay files matched committed source hashes after activation.
- Only Helper web restarted. Guild, ingestion, community web and the native raid
  worker retained their process IDs and remained online. No migration, roster
  write, signup or Discord DM was created. The private candidate/tunnel stopped;
  about 10.03 GiB remained free. Unrelated leveling work was excluded.

## Operations and rollback

Receipts: `/home/wow-trader-system/shared/operations/raid-trash-roles-20261101/`.
Local checks: `artifacts/raid-trash-plan-20261101/`.

Immediate rollback source: `/home/wow-trader-system/releases/kfc-helper-raid-composition-20261101-bc5b735`.
Prior static delivery: `/home/wow-trader-system/shared/static-delivery/releases/kfc-helper-raid-composition-20261101-bc5b735`.
Restore only the previous `SEO_RUM_BUILD` and `TOOL_USAGE_BUILD` lines recorded
in `helper-activation.json`, atomically restore the source pointer, restart only
`kfc-helper-web`, and restore public delivery through the existing static-delivery
activation controller. Recheck health/assets before saving PM2. Preserve all other
environment values, shared data and unrelated application definitions.
