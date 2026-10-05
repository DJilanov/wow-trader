# Dungeon companion implementation

Implemented on 2026-10-05 and deployed after separate user approval in web-only r6 from `e2beab6`.
No database migration or addon change was included. The Thanes flow below and the later full-path
[dungeon expansion](forever-leveling-dungeon-expansion.md) are live; see the
[verification/rollback receipt](forever-leveling-release-2026-10-05.md).

## Player flow

Hall of Thanes is now a chapter-local alternative on **Darkshore 15–16** (chapter 126). The same
chapter has wider labels for some races; only its remaining level-15 XP work is replaced, never the
earlier 11–15 preparation. The chapter card shows estimated quest XP, XP needed to reach 16 and
the remaining gap. **Review preparation** opens the outdoor reader's expandable alternative with
the source-derived quest carryovers before **Use dungeon route**. Active cards resume the saved
dungeon stage. Other dungeon
pairs retain their full outdoor route unless their lifecycle and continuation adapters are reviewed.
The later expansion adds scoped itineraries for all 32 variants and audited Human Warrior / 1×
Redridge 19→20 continuations for Deadmines and Alliance Ruins; other variants still require review.

**Use dungeon route** switches the existing chapter URL into a seven-stage reader: preparation,
travel, objectives, conditional Treaty pickup, rewards, retained Darkshore preparation and the return
checkpoint. It reuses the fixed map / scrolling instructions and Next, Done and Undo. Dungeon
instructions have their own progress and bookmark; no outdoor instruction is automatically marked
done or skipped. **Keep questing** restores the saved outdoor bookmark. `?outdoor=1` opens the
original instructions without discarding the chosen dungeon route, including exact preparation links.

Town hand-ins cannot unlock an earlier inside pickup. Treaty is excluded from the default four
quest estimate and requires an actual level-16 inside pickup. Underground Map is a separate outdoor
prerequisite for Old Ironforge Incursion. Instruction ticks never update actual quest states.

The bridge compares applicable accepts in chapter 126 with turn-ins in chapter 127, in source order.
It retains class/race/rate conditions and distinguishes required source carryovers from optional or
runtime-conditional rows. An unresolved directive remains reviewable. A later acceptance cannot
cover an earlier turn-in, and an optional occurrence cannot hide a later required occurrence. This
is a source dependency aid, not a complete server prerequisite graph. Before continuing, explicitly
review every applicable carryover, choose class/known outdoor XP rate and confirm the actual return
level is at least 16. Forecast XP and Done clicks cannot unlock the continuation button.

Ironforge is the dungeon background; the bridge returns to Darkshore. Known reference prerequisite
coordinates remain labeled. No entrance, boss or inside objective pin is invented. Manual map
selection still works, and the return checkpoint remains reachable from **Review chapter** on mobile.

### Reader UX revision

New visitors start with **Current + next** instructions; **All steps** is a visible switch, not a
hidden setting. Existing explicit reading preferences remain intact. Desktop retains the fixed left
map, with a keyboard-accessible **Map width** slider (35–60%, default 50%). Mobile defaults to the
quest list, with a single **Show map / Show quests** toggle and bottom Previous/Next/Done actions.
Undo appears when available; the final-stage **Review** button is labeled **Review chapter** for
assistive technology. Split view and larger text remain available in Settings. Layout/text/focus
preferences survive reload independently of character progress. Map return and viewport resize
reveal the selected instruction instead of leaving the reader at an unrelated earlier step.

While playing a dungeon, the comparison becomes an expandable **Route & XP** summary with stage
links and **Keep questing**. Full comparison inputs are in Settings. The outdoor reader's alternative
also starts collapsed, so the current action stays prominent. Its preparation deep link expands both
containers. Source-derived carryovers are available before entry; the bridge shows only unresolved
checks, with reviewed rows available for correction. Return blockers have preparation links or a
character-settings action, while actual-level and same-build gates stay enforced.

Dungeon quest actions are explicit: **I accepted it**, **Objectives complete**, and **I handed it in**.
These update the shared quest state, never instruction completion. **Change status** exposes the
six-state correction control, and status changes have undo. Reported hand-ins can be undone even
after the rewarded card moves into a collapsed completed-rewards section. Instruction Next/Done/Undo
retain their original independent semantics.

The first route selection stores an original XP forecast. Remaining rewards are shown separately;
a reported hand-in or correction marks actual XP stale from any dungeon UI. The player must report
their real level and XP to refresh the comparison. No calibrated reward is silently credited. The
refresh clears the earlier kill-XP assumption to prevent combining already-earned kills with the
same future estimate. Actual return level remains a separate, explicit checkpoint confirmation.

The dashboard leads with Continue and now shows the full 1–60 chapter path, without 20-level filters
or a three-card limit. Source continuations and conditional alternatives link to their chapter
nodes; the level spine is chronological, not an invented quest dependency. Unknown class/rate settings
stay discoverable. Each chapter shows unique applicable quest IDs, hand-ins, optional/conditional
counts, bracket-required XP and a modeled duration at the player's saved effective XP/hour. Reference
quest reward coverage is separate; absent rewards or same-level chapter XP/time are not guessed.
**Saved on this device** appears only after successful persistence; denied writes show a
memory-only warning, and a subsequent successful write clears that storage warning. No account
sync or addon quest observer is implied.

The 32-visit rollout now includes complete chapter-level candidates, strict At-level scheduling,
the repaired UBRS import, generic source-preserving dungeon trips and the v2 migration. See
[the expansion implementation](forever-leveling-dungeon-expansion.md) for the flow, evidence gates
and remaining work from [the original rollout plan](forever-leveling-dungeon-replacement-plan.md).
Only Thanes is an authored source-chapter XP replacement; new trips never automatically skip zones.

For the full reference library, open a race's dashboard and expand **Dungeon reference library**,
or open a chapter and expand
**Dungeon preparation** in the quest pane. Save/select a character, set its actual class and current
level, and choose **Plan trip**. The visit's applicable source dungeon tag is enabled automatically;
the original source chapter is not edited or renumbered. Finished visits keep their source branch
readable; **Not now** explicitly defers the trip.

Select a quest bundle and follow its prerequisites, outdoor pickups, inside starts, objectives and
hand-ins. Applicable existing accept directives are reused. Supplemental nearby pickups appear as
**candidate** preparation cards, not proven shortest detours. Review their level/state/items and
quest-log requirements in game before acting. Unknown class/faction restrictions cannot be selected
as confirmed eligibility. Unreleased/unknown visits and unfinished wing coverage stay reference-only.

Use the quest-state selector independently of **Next step / Done**. Accepted, objectives complete,
rewarded and abandoned are separate states. **Undo last dungeon change** restores the previous plan.
An instruction tick, a finished visit, or an abandoned quest never rewards a prerequisite implicitly.
Shared quest IDs, including multi-dungeon class quests, have one character-wide state per release.

**Show pickup on map** uses the source's NPC pickup coordinates, with a reference-evidence label;
it never substitutes an objective POI or moves the source bookmark. Coordinates remain visible in
the quest card when map artwork is unavailable. **Rejoin current route step** returns to the same
source instruction. The left map stays fixed while the right pane scrolls.

Fixed rewards and mutually exclusive choices are separate. Select one choice per quest. Item links
open the Forever catalog or Wowhead; lazy **Item stats** previews join the same-build Forever catalog
and reuse the existing stat formatter. A missing catalog, missing item, or different build produces
an explicit unavailable state, not fabricated stats. No automatic gear-upgrade percentage or AH value
is inferred. A kept item does not also become vendor cash.

## Data and validation

- `dungeon-facts.json`: static factual extraction from installed ForeverDungeonJournal 1.4.4,
  respecting file load order and updates; 94 dungeon associations / 92 dungeon quest identities,
  plus prerequisite/detail records. Lua is parsed as declarations; no addon code executes.
- `dungeon-reference.json`: 228 current-guide associations / 224 distinct table quest IDs through
  60, including faction/class/minimum-level metadata. Guide prose and routes are not republished.
- The normalized union has **271 quest records** and **32 visit variants**. Wings, multi-wing
  objectives, previous-dungeon prerequisites and BRD subrun coverage are not conflated.
- Missing lifecycle fields remain unknown. Exact minimum-level claims retain their sources; source
  disagreements use the conservative gate with a visible warning. No Dalaran visit band or Forever
  UBRS group size is invented.
- Self/future dependencies in the explosives and Paladin chains are removed; fake punch-card IDs
  become item/objective instructions, not public quests. Gnomeregan's accepted-state transport gate
  is distinct from a reward prerequisite. Accepted-only prerequisite XP is not earned automatically.
- Inside starts, outside hand-ins requiring a return visit, multi-dungeon materials and eventual
  weapon rewards remain separate. A later reward cannot repair an earlier pickup gate.
- Current reward XP is **unknown for all 259 records**. Offline numbers retain reference-only status;
  no verified global 2×/3× multiplier or blanket half-reward patch correction is applied. The Thanes
  replacement separately uses the explicit estimated Crest calibration described below.

The all-variant audit is checked in as `forever-leveling-dungeon-coverage.json`. Source presence does
not prove that every race/class/rate variant follows it. The audit checks the authorized manifest,
chapter checksums/identities/build/version/step count and complete table identity coverage before
emitting results. Per-profile route cards use applicable directives only; objective/world coordinates
cannot become pickup anchors, and a different archive build gets no automatic attachment.

The latest audit covers 157 chapters and 242 visit/quest rows: 39 source-present, 25 overlay-needed,
23 inside-start, 10 later-stage, 25 requiring lifecycle review and 120 unavailable/reference rows.
These counts deliberately distinguish identity coverage from reviewed, runnable preparation.

Maintenance commands, from the repository root:

```sh
node scripts/import-leveling-dungeons.mjs '/Applications/World of Warcraft/_classic_beta_/Interface/AddOns/ForeverDungeonJournal'
node scripts/import-leveling-dungeon-reference.mjs
pnpm --filter @wow-trader/leveling exec tsx src/dungeon-audit-cli.ts /absolute/path/to/artifacts/leveling/archive
```

Importers emit JSON for review, not automatic publication. Check/review changes before replacing the
checked-in snapshots and rerun tests/audit. The supplemental importer fails closed if its expected
94/92 association inventory changes. The web source importer verifies expected sections/wings,
reviewed row coverage and identity/restriction metadata; missing or changed structure fails review.

## Comparison rules

The chapter alternative uses the supplied Crest of Lordaeron 95189 report: 6,200 XP at level 20,
divided by the extracted 2,600 reference reward, giving **31/13 ≈ 2.385**. Each dungeon quest is
rounded separately: the four Thanes quests estimate **11,685 XP**, or **14,427 XP** for the full
first-time five-quest bundle including Treaty. This is labeled **estimated**, not a verified universal
coefficient or an exact hotfix observation. The report's posting date alone cannot establish when
the reward was received or which modifiers were active. The October 1 extra-bonus reduction is not
applied a second time, and individual reward recalibration still needs observations.

The multiplier never affects outdoor prerequisite rewards, kills or the build-70205 XP curve. At a
fresh level 15, the extracted curve needs 14,400 XP: four quest rewards leave **2,715 XP** for actual
current progress, a separately entered per-player kill estimate or remaining outdoor work. Already
rewarded/retained quests add no new XP. Unknown or out-of-scope rewards remain unknown, and an XP
bar at or above its next-level requirement is rejected. Missing level/progress are visible preview
assumptions, not an inferred character state. This curve is not runtime-confirmed.

XP coverage is not a speed recommendation. **View plan** can accept both complete branch times,
including group wait, preparation, clear, hand-ins, retained chain work and return. A time difference
is shown only when both times exist and the estimated XP covers the checkpoint. Travel or kill
times are never invented; five players do not multiply personal XP. Other dungeon calculations
keep their conservative reference-scenario handling below.

The calculator distinguishes **whole trip versus outdoor work** from **additional quest bundle when
already going**. Time bounds and attainable outdoor XP/hour are character-entered assumptions, saved
with the plan. They are not distances converted into walking times. Include travel once, preparation,
clear/extra rooms, recovery, actual idle wait and reward hand-ins. Productive recruiting time is not
idle waiting; five players never multiply personal quest XP by five.

Prerequisite closure deduplicates shared quests. Explicitly rewarded or retained-route rewards add
no new XP. Accepted-only gates contribute no reward. OR branches cannot be costed as if all choices
were mandatory: a legal satisfied branch is selected, otherwise the scenario remains unresolved.
Separate travel/activity IDs reject double-counting; retained segments have no incremental cost.

Whole-trip equal-goal arithmetic reuses `compareBranches`:

```text
catch-up = 60 × max(0, omitted XP − genuinely added XP) / outdoor XP/hour
time saved = outdoor minutes − extra trip minutes − catch-up
```

Marginal decisions show the XP-only break-even extra time and the range of equivalent XP gain.
If optimistic and conservative estimates disagree, the result is conditional. Missing XP, level,
quest-log confirmation, scope, rate or full-trip inputs cannot yield a recommendation. Fractional
quest/kill XP is rejected as unknown input, not rounded into a reward. Outside prerequisite hand-ins
and previous-dungeon work cannot be counted as a single-run reward.

The reference library's reward-based comparison is explicitly opt-in **offline reference scenario**;
the Thanes chapter alternative has a separately labeled calibrated estimate. Neither is a live
ranking. Future current-build reward observations must be validated
with level/modifier/build/hotfix/turn-in context before introducing live recommendations.

## Storage, feedback and operation

`kfc-leveling:characters:v1` remains the workspace key. Each character defaults missing `dungeonPlans`
to `{}` and stores its plan under `dungeons-v1-build-70205-oct-01`. Visits, selected quests, explicit
states, item confirmations, reward choices, retained XP and scenario inputs are release-scoped.
The Thanes replacement is stored in `replacements["chapter-126-14-16-darkshore"]`, version
`thanes-darkshore-v1-70205-crest`, with its active choice, seven-step bookmark/progress, XP/time inputs,
preparation confirmation, actual return level and source-carryover review. `xpForecast` and
`xpNeedsUpdate` default to `null` / `false` when reading older replacements. Legacy plans default
missing `replacements` to `{}`. Unknown chapter/step identities are rejected on import. An unchanged
remembered step is a state no-op, avoiding provider/effect loops.
Source progress and reader positions are unchanged. Old saves are readable; older deployed readers
may reject a newer backup containing these fields, so keep a pre-change backup for rollback.
Restored current-release plans also validate real quest IDs, visit membership and reward choices
before rendering. A corrupt backup is rejected without replacing existing progress.

Backup merge preserves each existing dungeon release in full. A removed confirmation or unchecked
item is intentional; importing an older backup must not restore it. Character limits and the existing
2 MB storage/backup limit remain enforced. No character name, local plan or completion history is
uploaded automatically.

Preparation reports use the existing private feedback endpoint, anchored to a real published source
step, with dungeon/quest/action/overlay context in the message. Existing origin checks, validation,
rate limiting and maintainer review remain unchanged; reports never alter routes automatically.
No broad NPC/quest scanner has been re-enabled and no addon/game installation is changed.

`GET /api/v1/leveling-rewards/:itemId` allows only known reference reward IDs. It returns validated
public item facts for `wow_classic_beta` build 70205, or 404/409/503 for unknown/missing/different-build/
unavailable data. Success is cacheable for five minutes; errors expose no database details. Lazy
browser requests have a timeout, an explicit retry state and a Wowhead fallback.

## Verification and remaining limits

Focused package tests/typechecks/lint, web tests/typecheck/lint, the archive audit, an isolated
production build, existing leveling Playwright regressions and the dedicated browser check cover
this change. The UX revision passed 80 leveling unit tests, 180 web unit tests, package lint/typechecks,
22 compatible existing Chrome regressions (using an explicit All steps preference), four reference-
dungeon browser groups and six updated chapter-replacement browser groups. The updated checks cover
preflight, stable forecasts, explicit hand-in undo, actual-XP validation, denied-write recovery,
map/quest return, persisted map width and 320/390 px plus landscape layouts. Older tests expecting
the removed three-button mobile toolbar are superseded by the updated layout checks, not counted as
passing unchanged. Desktop/mobile dungeon-reader and mobile-dashboard accessibility audits reported
no WCAG A/AA violations. At 390×844, the selected dungeon's quest pane measures 596.5 px (about 71%
of the viewport), versus the earlier 472.7 px. The isolated production Turbopack build passed.
Formatting and `git diff --check` also passed.
The item-preview success path uses controlled database mocks; a live same-build catalog join still
needs an operational smoke test after deployment. Run the dedicated check using an existing
Playwright installation:

```sh
node scripts/check-leveling-dungeons.mjs --playwright-package=/absolute/path/to/node_modules/@playwright/test/package.json
node scripts/check-leveling-replacements.mjs --playwright-package=/absolute/path/to/node_modules/@playwright/test/package.json
```

It requires a local preview (default `http://127.0.0.1:3000`) and installed Chrome. Its fresh browser
context never shares your real profile or writes production feedback. No new production dependency
is required. Screenshots are generated in a unique temporary directory.

Still needed before claiming an optimized/playtested product: current-build reward and quest-state
observations, reviewed exact lifecycle/location data for reference-only quests, feasible timed hub/
flight/hearth/exit/rejoin segments, group playthroughs and multi-visit checkpoint/gear validation.
Nearby insertion is deliberately not advertised as a shortest-path optimizer. The opt-in addon
observer expansion remains the separately scoped follow-up from the plan; market scans are untouched.
