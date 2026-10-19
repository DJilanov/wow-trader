# Forever guaranteed dungeon quest bundles

Status: implemented, committed and deployed for
[browser testing](forever-leveling-test-deployment-2026-10-19.md) on October 19, 2026.
Quest availability is an owner-confirmed product input; unidentified quests are not presented
as collected source records or executable quest instructions.

The subsequent [quest-completion receipt](forever-leveling-quest-completion-2026-10-19.md) supersedes
this document's frozen-snapshot reward counts: all 83 requested route pages are captured and all
1,161 real hand-in IDs now have Forever XP, with no historical hand-in fallback. Bundle selection
and unidentified-slot behavior below remain unchanged.

## Defaults and player controls

| Dungeon             | Default selection                                            | Planning quest level       | Full planning quest XP per eligible character |
| ------------------- | ------------------------------------------------------------ | -------------------------- | --------------------------------------------- |
| Hall of Thanes      | All 5 known core quests, including the additional real quest | Existing real quest levels | Existing per-quest rewards                    |
| Ruins of Lordaeron  | All 4 known core quests                                      | Existing real quest levels | Existing per-quest rewards                    |
| Excavation Site     | 4 known core quests; real extras retained                    | Existing real quest levels | Existing per-quest rewards                    |
| City of Dalaran     | All 4 known core quests                                      | 33                         | 37,600 at full reward                         |
| Drowned City        | 4 selected slots per faction                                 | 37, editable               | 40,400 estimated                              |
| Krol'dok Stronghold | 4 selected slots per faction                                 | 42, editable               | 49,000 estimated                              |
| Alcaz Prison        | 4 selected slots per faction                                 | 50, editable               | 67,400 estimated                              |

Levels 37/42/50 are configurable defaults taken from the existing owner-targeted stops, not proof of
quest pickup minima or newly published quest levels. Alliance and Horde each receive their own four
slots; a character never receives eight faction rewards or five times the personal quest XP.

The campaign reader and chapter dashboard expose **Optional new dungeons · include, skip or adjust
quest slots**. This panel remains available after a dungeon is excluded, so it can be restored.
Players can change a planning level, uncheck an individual slot, or exclude an entire unidentified
dungeon. Exclusion removes that planning leg, its estimated rewards and its entry target. It does
not delete accepted quests, earned rewards, chapter history or stored slot choices.

The legacy premade circuit shows the same slot controls and forecasts. **Next without Done** can
leave a planning-only checkpoint without inventing a completed run. **Done** remains blocked while
real quest/access details are unavailable. Known pickup/access gates are not lowered by a forecast.

## Model and XP ownership

- `dungeon-bundle-model.ts` validates exactly four unique slot indexes, faction identity, selected
  state, inclusion and optional reviewed real IDs. Duplicate real IDs within a bundle are rejected.
- `dungeon-bundles.ts` creates defaults, updates a slot without changing its identity, and forecasts
  rewards sequentially at the evolving hand-in level. Stable keys are
  `<dungeon>:<faction>:quest-<1..4>`, never numeric game quest IDs.
- `dungeon-bundle-xp.json` contains the extracted build-70205 QuestXP difficulty-7 reference for
  levels 1–60. Its 100-row effective source SHA-256 is
  `eaa48b977422e1b6e5444793bc26e0dc2b1e1c61a0a47f2949023df7d5cfa209`.
  All 60 reference values were compared back to the local extracted table during verification.
- Dalaran anchors the chosen reward tier: level 33 base 3,950, coefficient 2.375, final reward 9,400.
  The estimator matches the reviewed renderer's integer scaling, overlevel reductions and 10/50-XP
  rounding. This remains an estimate for unidentified quests, not a universal observed server law.
- A mapped real quest uses its compatible resolved final reward, including authoritative zero,
  without applying the coefficient again. Known faction/class/race/pickup restrictions are checked.
  Missing identity, incompatible eligibility or unresolved real XP holds the forecast instead of
  silently restoring the replaced slot estimate.
- A slot reported already rewarded, or a mapped quest already paid to that member, adds no reward.
  The continuous campaign tracks both stable slot keys and real IDs, preventing a repeated visit or
  a later real-quest action from paying the same reward twice.
- Forecasts do not mutate actual levels, XP or quest states. Estimated slot rows remain separate
  from real quest rows, with reward and route evidence explicitly marked estimated/pending.

Saved premade progress gains `guaranteedBundles`, keyed by dungeon and faction. Member records gain
`bundleSlotStates`. Both default to empty records when reading legacy saves; the route/workspace
versions are retained because existing fields and action identities remain compatible. Workspace
and exported-backup tests cover level/selection/exclusion persistence without losing prior history.

## When real quest IDs arrive

1. Import and validate the real catalog identity, faction/restrictions and reward evidence first.
2. Review the slot-to-quest association; do not infer it from row order or matching reward amounts.
3. Use `updateDungeonBundleSlot(bundle, index, { questId })` and
   `updatePremadeDungeonBundle(progress, bundle)` to replace the slot. These are exported public
   APIs; replacement retains the stable slot key and all other selections.
4. Supply the published reward facts to the existing real-reward resolver. A real reward replaces
   an estimated slot; it is never an additional fifth quest. Preserve existing paid slot/quest
   state rather than resetting progress during evidence updates.
5. Add the actual pickup/objective/hand-in and access lifecycle only when sourced, then rebuild
   the route and addon. Planning notes must never become invented `.accept`, `.complete`, `.turnin`
   or `.goto` directives. The addon compiler rejects directives attached to a planning-only action.

No crawler source, queue, pacing, profile or publication state was modified for this implementation.

## Repeat the checks

From the repository root:

```sh
pnpm --filter @wow-trader/leveling test
pnpm --filter @wow-trader/leveling typecheck
pnpm --filter @wow-trader/leveling lint
pnpm --filter @wow-trader/leveling build
pnpm --filter @wow-trader/web test
```

Against a separately started local preview, use the reusable browser regression. It creates a fresh
browser context, blocks non-read HTTP requests, checks persisted controls and actual-state isolation,
and writes desktop/mobile screenshots to its own temporary directory. It refuses production hosts.

```sh
LEVELING_TEST_HELPER=http://127.0.0.1:3311 \
  node scripts/check-leveling-guaranteed-bundles.mjs \
  --playwright-package=/absolute/path/to/installed/@playwright/test/package.json
```

## Verification receipt

- 292 leveling tests and 577 web tests passed, including schema, replacement, deduplication,
  restrictions, rounding/cap, legacy saves, slot skips, complete-dungeon exclusion and backup.
- Leveling typecheck, lint and build passed. Targeted frontend lint and the isolated production web
  build passed, including Next's strict TypeScript check.
- All 28 exact Alliance addon editions compiled. Three planning stops emit labeled instructions
  without invented game IDs, locations or quest directives.
- Desktop 1440×1000 and mobile 390×844 browser checks passed: save a fresh party plan; four default
  slots; change Drowned City's level 37→33 (40,400→37,600); skip one slot (28,200); reload; exclude
  the dungeon (0); reload; restore it with the previous slot choice intact. No page errors or mobile
  horizontal overflow were observed. The reader toolbar is height-bounded and scrollable so its
  expanded evidence cannot cover the quest controls or bottom navigation. The browser regression
  exercises mobile level changes and a fresh mobile first-run save. The local preview had no database configured, so this browser
  check validates controls/persistence, not live published-reward ingestion.
- The offline audit used a read-only copy of the server's 1,652-record published XP index from
  October 18 plus the existing historical import. It covers 33 browser editions, 132 scenarios and
  6,000 chapter checks: 18 sourced dungeon legs plus 3 planning-only legs, zero audience-relevant
  blockers or shortfalls, and no unresolved numeric hand-in values. All 1,161 real hand-in IDs have
  planning values: 1,135 published Forever values and 26 labeled historical estimates. The 12
  unidentified Alliance slots are separate; no fabricated IDs enter that inventory.

The immutable audit is
`artifacts/leveling/audits/2026-10-19/guaranteed-bundles/campaign-xp-audit-3a0dac367d839afe.json`,
SHA-256 `3a0dac367d839afe44c496afd3fbeac777e39ef4cbcae125a1b77e8b3b0096cc`.
The evidence backlog is
`campaign-evidence-backlog-4fc015a3a28c1059.json`, SHA-256
`4fc015a3a28c1059ffc807f973ef63feaa2457ce8ff4375b6c4dc19eb40fea2a`.
Its gate correctly remains false: 147 validation and 106 measurement tasks remain. Planning XP
is not observed reward evidence, complete quest instructions, a timed optimum or a playtest pass.

The captured-quest ingestion and observation-to-audit consumer listed as remaining work in this
earlier receipt are now implemented locally; see the
[current consumer receipt](forever-leveling-quest-validation-consumer.md). Actual source approvals,
missing identities/access, in-game review and authorized release remain outstanding. The full
Horde campaign remains separate work: the four-slot schema and calculations support both factions,
but Alliance compilation does not certify a Horde leveling itinerary.
