# Full-path dungeon options and source-safe trips

Implemented on 2026-10-05, build 70205; deployed as web-only r6 from `e2beab6` after separate user
approval. No database migration, addon change or automatic data publication was included.
[Verification and rollback](forever-leveling-release-2026-10-05.md). This records the implemented portion of
[the expansion plan](forever-leveling-dungeon-replacement-plan.md); it does not declare every planned
zone-replacement adapter complete.

## Player experience

Every applicable chapter in the full 1–60 path has a visible gold-accented **Dungeon alternatives**
section. A prominent Thanes-style plan shows dungeon name, selected quest XP, checkpoint/gap and
the full-curve level endpoint. Its ordered quest itinerary starts collapsed; other journeys live in
**Other dungeon alternatives**, also collapsed. Native summary controls support keyboard and mouse.
All 32 variants have authored faction/geographic preparation, scoped clear and hand-in notes.
Selected/saved alternatives and earlier optional trips retain separate resume links.

**Find dungeon alternatives** in the full chapter path jumps to the current or next applicable
chapter. The reader's fixed toolbar also links directly to its dungeon alternatives without changing
the selected source step, completion or saved trip. Desktop and narrow mobile layouts keep names and
actions visible. The existing Hall of Thanes replacement remains intact.

Known recommended levels place candidates in the relevant bracket, never an earlier one. Dalaran
remains separately discoverable with an unknown schedule. Level-60 visits are endgame references,
not a recommendation to level to 61.

**Review trip** opens the selected visit's review screen. Its equal-checkpoint XP/time comparison
and quest library start in separate collapsed panels; expanding them preserves the entered values.
The single-visit review omits the full library's unrelated future-visits filter.
The default bundle excludes class-only quests, later pickups and multi-visit objectives; users can
explicitly select additional compatible quests. Selecting one can raise the run's required level.
Unknown rewards are not zero and a known subtotal is never presented as the full bundle.

For reviewed one-run life cycles, a saved matching character, known class/source XP rate and actual
level at or above the entry floor, **Use dungeon trip · keep outdoor route** creates an independent
six-stage reader: preparation, travel, clear, hand-ins, retained outdoor work and return. The left
map stays fixed, the right instructions scroll, and Previous/Next/Done/Undo retain their existing
semantics. Explicit quest actions record acceptance, objectives or actual hand-ins separately.
Known pickup coordinates use the existing reference-evidence map labels; no entrance or boss pin
is guessed.

Prerequisites, starting items, quest-log/party preparation and source checks gate objective actions.
Reported rewards or corrections make XP stale. **Save actual XP** records the player's reported
level/XP and clears the old kill estimate. Return requires this actual update and confirmation that
the full outdoor route is retained; a forecast or instruction tick cannot authorize a skip.

The trip returns to the exact saved source bookmark. It does **not** enable an optional source
`.dungeon` branch automatically. That branch would hide some original outdoor rows, including a
real Deadmines `!DM` bookmark caught by browser regression. The separate reference library's
explicit **Plan trip** continues to control source branches. If those choices or source evidence
make a return row inapplicable, the trip shows a blocker instead of silently remapping the bookmark.
**Keep questing** preserves the stored trip; the dashboard can resume it later.

## Strict scheduling

`scheduleDungeonVisit` is shared by candidate discovery, the reference calculator and trip creation.
The scheduled floor is the maximum of the source **At level** and selected pickup requirements.
Known access and prerequisite gates are additionally checked before an actionable clear/comparison.
Hard/Medium/Easy bands are informational, never permission to enter before At level. A ready group
of five cannot lower the floor. Above-cap recommendations, unknown levels/group size/access and
unreleased visits remain references; beta access alone cannot lower the visit level or raise the
pinned playable cap of 30.

## XP and time

The checkpoint is a later level on the pinned client curve, calculated from actual current
level/within-level XP. Eligible remaining rewards are deduplicated by quest ID and legal prerequisite
closure; rewarded, retained-route and accepted-only prerequisites do not pay again. Dungeon reward
references use the existing explicitly labeled Crest calibration only in its supported band;
outdoor prerequisite XP is not multiplied. Unknown/scope-blocked rewards prevent a complete total.

Per-player kill XP requires an explicit estimate, including zero. Five players do not multiply it.
Total trip and outdoor-to-same-goal optimistic/conservative minutes are user-entered assumptions.
Trip time must include preparation, recruitment, both journeys, clear, detours, hand-ins and retained
work. Catch-up uses the player's attainable outdoor XP/hour; no walking/clear times are invented.
Missing or invalid XP/time inputs prevent a time-saving result.

Review inputs are snapshotted into the selected trip. Subsequent changes to another chapter's trip
or the reference-library scenario do not rewrite that trip's checkpoint time assumptions.

## Inventory and ingestion

- 32 visit variants, including wings, composite objectives and subruns; not 32 distinct locations.
- Main guide: **228 associations / 224 unique table quest IDs**, up from 216/212.
- Supplemental addon snapshot: unchanged **94 associations / 92 IDs**. These sources overlap.
- Normalized union: **271 quest/prerequisite records**. Runtime-confirmed current-build reward XP
  remains unavailable for all 271; calibrated estimates and historical reference values stay labeled.
- UBRS now has its reviewed **12 table identities** and At-level floor 60. Forever group size/access
  and later lifecycle/XP remain unknown, so it is not promoted to an executable leveling route.
- Archive audit validates **157** authorized source chapters and **242** visit/quest rows:
  39 source-present, 25 overlay-needed, 23 inside starts, 10 later-stage, 25 lifecycle-review and
  120 unavailable/reference rows. This is identity/source coverage, not a per-character itinerary.

`scripts/leveling-dungeon-reference-parser.mjs` parses JSON literals and structural markup, never
executes source JavaScript, normalizes reviewed aliases and handles the real UBRS heading suffix.
Expected sections/wings and all previously reviewed associations must remain present. Missing IDs,
duplicate associations, changed columns or unknown headings fail review. Conflicting faction or
profession restrictions remain unresolved, not unrestricted.

The source manifest includes a SHA-256 over both markup and identity metadata, reviewed date and
source URL. Importing emits JSON for manual review, not an automatic published catalog update.
The artifact records metadata, not copied guide prose. See
[the current source](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location) and
[the checked coverage audit](forever-leveling-dungeon-coverage.json).

## Persistence and ownership

`dungeons-v2-build-70205-at-level` adds source-pinned trips keyed by chapter plus visit. Each trip
keeps its quest snapshot, source version/hash, exact bookmark, checkpoint assumptions, independent
instruction progress, actual return XP and staleness checks. Switching competing trips does not
overwrite the inactive plan. Shared quest state remains character/release-scoped.

On load, v1 is cloned into v2 only when v2 is absent. Existing Thanes forecasts, bridge confirmations
and bookmarks remain readable, and the original v1 release is retained in backups. An existing v2
plan wins over an older import; undone state is not resurrected. Semantic validation rejects
unknown active trips, mismatched IDs and quests outside the saved visit bundle.

## Remaining reviewed-route work

Hall of Thanes retains its original reviewed **outdoor XP-segment replacement**. Deadmines and
Alliance Ruins additionally implement a source-pinned **Redridge 19→20** replacement for Human
Warrior at 1× outdoor XP. Their bridge preserves the later Redridge quest chain, Cooking 50,
Corruption Abroad and class/utility work. Actual level 20+, valid fresh XP and explicit bridge
checks gate the exact 20–21 source continuation. The original bookmark and source completion stay
unchanged. Changed source hashes/versions or character variants block the saved continuation rather
than silently reinterpret it.

New `--alternative` keys and optional validated continuation snapshots preserve old generic trips
and backups. All other character variants/visits still preserve every outdoor instruction and return
to their saved step. Level overlap and a quest-XP estimate do not authorize discarding later chains.
See the complete authoring matrix and scope in
[the route-choice plan](forever-leveling-dungeon-route-choice-plan.md).

Deadmines' new plan excludes the optional explosives chain by default unless prepared or selected.
Alliance WC is offered from Stonetalon/Ashenvale 21–23, at actual 21+, rather than from Stormwind's
Redridge chapter; its unprepared Smart Drinks chain is optional. Legacy optional trips keep their
quest snapshots. A new alternative never rewrites an earlier trip's assumptions or bookmark.

New optional trips store their itinerary mode too. Following Continue, reloading or removing the
URL mode parameter cannot revert the Alliance WC 21+ floor or reintroduce an unprepared optional
chain. The constructor enforces the same itinerary gate as the UI; older generic trips remain readable.

`plan=alternative` selects the itinerary/core-bundle experience. The persisted `itinerary` flag
keeps those policies on resume; only the separate, source-validated `alternative` snapshot permits
a reviewed next-chapter rejoin. An itinerary flag alone never authorizes a chapter skip.

The following plan items still need evidence and review before promotion: exact omitted-step/bridge
adapters for more zones; complete later-dungeon life cycles/reward XP; scoped SM/BRD/Maraudon runs and
cross-instance class/attunement chains; repeatable/profession/access gates; current-patch reward
observations and measured travel/clear intervals. No automatic fastest-route ranking is published
from unknown inputs. Increasing playable caps requires a new reviewed evidence release.

## Maintenance and verification

From the repository root:

```sh
node scripts/import-leveling-dungeon-reference.mjs
node --test scripts/leveling-dungeon-reference-parser.test.mjs
pnpm --filter @wow-trader/leveling exec tsx src/dungeon-audit-cli.ts /absolute/path/to/artifacts/leveling/archive
pnpm --filter @wow-trader/leveling test
pnpm --filter @wow-trader/web test
```

Chrome regression scripts accept `--playwright-package=/absolute/path/to/@playwright/test/package.json`
and are restricted to localhost: `check-leveling-dungeon-options.mjs`, `check-leveling-dungeons.mjs`,
`check-leveling-replacements.mjs` and `check-leveling-chapter-path.mjs`. They use isolated browser
storage, not the player's real profile. `check-leveling-dungeon-itineraries.mjs` covers core selection,
the real level-20 bridge, source changes and legacy-record isolation. Run the leveling package build
first so its public exports
match the source. Validate typechecks/lint, the isolated production web build and mobile accessibility
before a separately authorized commit/deployment. Current receipts are in `fixes.md` and `context.md`.
