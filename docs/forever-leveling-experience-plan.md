# Forever Leveling: dedicated product and chapter-first experience

Status: UX phases 1–4 and the authorized full-source reader deployed October 4, 2026.
Release receipt: `forever-leveling-release-2026-10-04.md`. Quest-order optimization, runtime validation
and payment activation remain separate follow-up work. Extraction/operations: `forever-leveling-archive.md`.

The persistent map/list chapter workspace is live. See section 10 for its layout,
selection, follow-from-current-position and verification contract.

The owner has changed the product direction: **Forever Leveling is a primary product**, alongside
Trader and Encyclopedia. This document supersedes the Encyclopedia-first navigation and
calculator-first browser flow in `forever-leveling-product-plan.md`. That document remains the
reference for the existing implementation, XP arithmetic, evidence, addon and supporter workflow.

## Implementation and handoff

- Helper entry: `/forever/leveling`; primary desktop/mobile navigation and a third Forever home card.
  The community website's primary **Leveling** link and Addons & tools entry use the same destination.
- Three-step setup: Alliance/Horde → faction-compatible race, optional class/current level →
  Speed/Chill/Group. Forever race/class combinations include both Skyborne factions. Draft choices
  survive Back and refresh; party size/readiness, tanking/healing and pace remain separate fields.
- Race-specific chapter dashboards use 157 reviewed header records and a separately provisioned
  authorized full-source archive with 22,604 steps and 2,394 distinct quest IDs.
  Ordinary questing, Mage AoE and advanced Mage AoE are separate families; Speed never selects AoE
  automatically. Unsupported or unknown conditions and ambiguous/broken transitions stop automatic
  continuation. Other references remain explicitly separate from the connected prefix.
- With an authorized manifest, all imported chapter lists are readable, including starters/endgame
  for all ten faction/race choices. Original order, game-state checks and conditional alternatives
  remain explicit. Dungeon branches are off by default. Full-source availability does not mean
  connected/playtested coverage, especially above the reviewed beta cap of 30.
- The original KFC Westfall preview remains 31 steps, version `0.1.0`, build `70205`, at
  `/forever/leveling/routes/alliance-human/chapters/chapter-125-13-15-westfall?edition=kfc`.
  Its progress/calculator is separate from imported source versions. Without an authorized archive,
  other brackets fall back to metadata-only coverage screens; no instructions are invented.
- Local characters are isolated under `kfc-leveling:characters:v1` (maximum ten). Step progress is keyed
  by chapter, route version and client build. Pace/party changes preserve facts; faction/race or an
  established class requires another character. Shared setup URLs contain only a validated profile,
  not identity or progress, and are removed only after the imported character is persisted.
- Old directory/Westfall URLs permanently redirect to the new equivalents. Query parameters and
  route-step anchors remain useful; `#planner`/shared `plan` opens the folded advanced comparison.
  The legacy calculator save stays untouched. A saved character explicitly imports that comparison
  into a separate character/version/build key; reader checkmarks do not silently change calculator XP.
- Indexable landing/Human dashboard/canonical original reader have metadata, breadcrumbs and sitemap
  entries. Unpublished references and duplicate race variants are noindex. The canonical reader retains
  Article structured data. No payment, entitlement, database migration, addon or ingest change is required.

### Catalog provenance and audit

The read-only adapter is `packages/leveling/src/chapter-catalog.ts`; checked-in public header metadata
is `chapter-data.ts`. The private source bundle hash is
`af3fec7909e0b5a1dd8659f87e67171f8984af40a22b997e630a0052a11c871e`; inventory CSV hash is
`2c6d9f41faf2fd64ae7bb40a81476a655c53f7a1f4a4edee7cbb1ea3bb1a8637`. Prose/raw steps are not checked
into the repository; the authorized archive is provisioned separately and served by the reader.

```bash
pnpm --filter @wow-trader/leveling catalog /path/to/private/guide_inventory.csv
```

This reports sanitized chapter count, inventory hash, equality with checked-in data, missing target
names and graph cycles. `--json` prints sanitized metadata for an explicit reviewed refresh; it does
not edit source or publish content. The reviewed audit matches all 157 records and finds no cycles.
Two dangling targets remain: Wetlands Mage AoE refers to a Duskwood title without its actual “Part 2”
suffix, and Mulgore 1–6 refers to an absent Mulgore 6–13 chapter. Horde Skyborne additionally has no
reviewed continuation in its conditional header. None is silently repaired or treated as a validated
route. XP rates and unknown class-dependent choices remain explicit.

### Verification and next phase

Leveling arithmetic/catalog/profile tests, web tests, Helper production build/typecheck/lint,
community typecheck/tests and focused browser checks cover this revision. Browser regressions cover
onboarding, multi-character progress, party readiness, draft refresh, sharing, legacy imports,
denied/corrupt storage, old-link redirects, canonical metadata, icon decoding, accessibility and
360–1440px layouts. See `context.md` for the final command results.

The source-import part of phase 5 is complete locally. Next, refactor the authorized lists and validate Speed/Chill/Group decisions,
including real premade timing, prerequisites and per-player XP. Current setup changes planning context,
not the published quest order or dungeon calculator assumptions. Local development uses the existing
`pnpm dev`; no additional runtime service or new production dependency is needed.

## 1. What exists, and why the current experience misses the goal

Before this revision, the inspected implementation had no Leveling entry in `site-header.tsx`. `/forever` offered only
Trader and Encyclopedia. Leveling is nested at `/forever/encyclopedia/leveling`, where a Westfall
preview and dungeon difficulty table lead into a large manual calculator. This works as a
specialist comparison tool, not as a player's starting point for leveling.

Reusable foundations already exist:

- `packages/leveling`: validated original route/quest/step records, incremental XP/time arithmetic,
  prerequisite checks and the RestedXP compiler.
- `forever-world.ts`: build-specific quest identities, objectives, POIs and observations, with
  unknown data kept separate from confirmed facts.
- Existing KFC navigation, dark surfaces, gold accents, game/class artwork and Forever racial icons.
- Browser-local/shared planner state, although its current v1 shape is specific to Westfall and
  lacks race, pace, party readiness and a multi-chapter route.

The private inventory contains **157 guide variants: 98 Alliance and 59 Horde**, with 22,604 raw
steps. Its summary explicitly says runtime conditions have not been evaluated. These are not 157
consecutive chapters for one character, and extracted coverage is not public, playtested coverage.
Only the original Westfall 13–15 preview is currently implemented for public reading.

Concrete issues found in the inventory:

- Human headers link Northshire 1–6 → Elwynn 6–11 → Loch Modan 11–13, then offer conditional choices.
- Westfall's underlying 13–15 guide displays 14–15 for Dwarves/Gnomes. Darkshore also changes its
  displayed bracket by race/class. A single numeric sort cannot build the right route.
- Hunter, Warlock and Mage AoE paths overlap ordinary routes. “Speed” must not automatically mean
  an advanced Mage AoE route.
- Some headers/steps retain SoD and other ruleset conditions. These need explicit evaluation against
  Forever, not direct rendering of everything in the file.
- Zephras has faction-dependent Skyborne labels and only an Alliance `#next` in the reviewed header.
  Its Horde continuation needs review; do not invent a connecting route.

Blizzard confirms Skyborne has both faction variants, a Zephras starting experience and different
available classes. Include it rather than hardcoding only the eight original Classic races.
[Blizzard: Meet the New Skyborne](https://news.blizzard.com/en-us/article/24302071/wow-forever-meet-the-new-skyborne).
The imported 1–13/1–12 labels are guide coverage, not a replacement for Blizzard's 1–12 zone
description or a guaranteed level at departure.

## 2. Product entry and onboarding

Primary entry: `/forever/leveling`, visibly labeled **Forever Leveling** in desktop/mobile primary
navigation. Add a third Leveling card on `/forever`; retain an Encyclopedia cross-link as discovery,
not as the parent of the experience. The leveling screens do not carry the Encyclopedia section tabs.

On the community website, also propose a visible **Leveling** navigation link to this Helper
destination through its shared tool-link constant. `discord-website/components/site-nav.tsx`
previously exposed Guides and Addons & tools, but no direct Leveling entry. Keep one implementation
on Helper rather than a second wizard on the community domain. Verify header space on both sites;
the new link must not make desktop navigation overflow at intermediate widths.

```text
Primary navigation: Forever Leveling
                ↓
       Alliance / Horde
                ↓
          Choose race
                ↓
      Speed / Chill / Group
                ↓
    Your leveling chapter dashboard
                ↓
       Click a level bracket
                ↓
      Current ordered quest list
```

1. **Faction:** two large illustrated choices, minimal copy and a clear selected state.
2. **Race:** faction-filtered portrait/icon cards, starting-zone subtitle and Back. Use stable race
   identities, not labels as IDs. Validate build-specific eligibility; the racial export provides
   artwork/reference data, not the sole authority for legal race/class combinations.
3. **How do you want to level?** Three presets with plain-language descriptions:
   - **Speed:** “Keep moving. Prioritize efficient solo progress.”
   - **Chill:** “A comfortable route, with less pressure and optional detours.”
   - **Group:** “Level together and consider group quests and dungeons.”
4. **Dashboard:** show the selected profile and its compatible chapter sequence, with Continue and
   an easy way to change choices. Returning players can resume without repeating the wizard.

Class selection belongs inline on the race screen or in a compact character-details expansion,
not in another mandatory wizard page. It is needed before choosing a class-dependent path. An
unknown class permits browsing class-neutral chapters, but must not render every class's quests
or silently select Warrior. Current level is optional for browsing and selecting a starting chapter;
require it when assessing eligibility. Selecting level 20 does not mark all earlier quests complete.

Each screen should have one obvious action, keyboard access, focus on its new heading and working
Back/refresh behavior. Do not put XP rewards, dungeon minutes or a login requirement in onboarding.

### Presets are not the underlying data model

Store pace and party separately: `pace: fast | relaxed`, party size 1–5, readiness and optional
role/level details. On a new profile, Speed and Chill start solo; Group opens compact party settings
and a pace toggle.
A relaxed five-player party is valid. Selecting Speed must not erase an existing party accidentally.

Group details:

- Party size: 2, 3, 4 or 5. Do not treat a duo as a full dungeon party.
- Together now / meeting after starting zones / still recruiting.
- Can the party tank and heal this dungeon? Confirmed / not yet / unknown. Role capability is
  more useful than assuming a class's current role from its name.
- Optional member levels; without them, display “everyone must meet these requirements” instead
  of claiming the whole party is eligible. Clear-time estimates are advanced, optional inputs.

Different races can start far apart. A mixed-race premade needs separate starter chapters plus a
reviewed rendezvous; it is not automatically a five-player group from level 1. Recruitment being
finished and everyone already being at the dungeon are separate facts.

An incomplete party can still use the outdoor guide. Offer the existing community `/lfg` page as
an optional way to find players; do not require signup or suspend leveling while they recruit.

## 3. The chapter dashboard

Make the route itself the main visual: compact, ordered chapter cards with restrained zone imagery,
large level brackets, a zone name and an unmistakable current/next state. Use the existing KFC
design tokens and faction/race artwork; avoid another generic landing page or a screen of forms.

Suggested desktop hierarchy:

```text
Forever Leveling
[Alliance] [Human] [Speed · Solo]                 Change setup

Continue your route                            Coverage / build
[Current chapter · zone · bracket]                         →

Your chapters
[1–6 Northshire] → [6–11 Elwynn] → [11–13 Loch Modan] → …

Optional group opportunities appear beside relevant chapters.
The calculator lives inside an opportunity, not above the route.
```

The example uses real header metadata, not a claim that those complete public guides are already
authored. Render the selected chain, not every matching or overlapping guide. Group longer routes
into collapsible ranges such as 1–20 / 20–30 for scanning, while retaining the actual small brackets.
Overlapping brackets can be legitimate transitions; do not force uniform five- or ten-level chunks.

Each card carries:

- Evaluated bracket label and zone(s), optional race/class variant subtitle.
- Current / next / completed state, and visible coverage such as Preview or Playtested.
- Eligible quest/step count only when conditions can actually be evaluated.
- Optional dungeon/group opportunity, with “optional”, “prepare first” or “party ready” wording.
- A real destination when published. Reference-only metadata opens coverage details, not a fake or
  empty quest list. Content beyond the verified current beta range stays clearly labeled.

On mobile, use stacked compact cards and a vertical route line. Do not shrink a desktop horizontal
timeline until its labels are unreadable. Progress, coverage and selection must not rely on color alone.

Allow browsing later chapters; brackets are guidance, not universal locks on reading. Show actual
minimum pickup/entry requirements separately. Before joining midway, expose required earlier quests,
travel unlocks and preparation. “Completed chapter” must mean its required work is complete, not
that one optional task was checked.

## 4. Clicking a bracket: keep the current list first

Use a proper reader page with a stable URL:
`/forever/leveling/routes/<route-id>/chapters/<chapter-id>`.
Faction/race/profile compatibility is resolved from the catalog and validated preferences, not
trusted query-string claims. Link directly to a chapter without forcing visitors through the wizard.

Desktop: compact chapter navigation on the left, readable ordered list in the center, and an
optional map/details panel where real coordinates exist. Mobile: full-width list, chapter menu and
Back to route. Prefer a page over a large modal; it must survive refresh, bookmarks and browser Back.

Reader essentials:

- Sticky chapter title, bracket and profile summary; Previous / Next chapter.
- Preserve the existing accept → complete → turn-in order, travel steps and dependency grouping.
- Quest title/ID, action icon, NPC/zone/coordinates when known, and Encyclopedia reference link.
- Manual progress controls, separate Next step / Done buttons and optional Hide completed. Distinguish done,
  skipped and unknown; skipping must warn if later required work depends on the step.
- Group/dungeon suggestions as separate optional callouts. Show why they apply and prerequisites.
- Advanced XP/time comparison only when a player opens an eligible dungeon opportunity.

**Do not optimize, rewrite, reorder or auto-skip the quest lists in the first UX release.** Existing
original KFC lists remain intact; additional original/authorized lists are adapted without altering
their sequence. Essential faction/race/class/ruleset filtering is correctness, not route optimization.
If a class or condition is necessary but unknown, ask for it or label the variant unresolved.

Initially the presets change context and optional suggestion visibility, not claim three fully
optimized routes. Explain that the underlying chapter is the current reviewed route. Actual Speed,
Chill and Group quest-list variants are the next content phase the owner requested.

## 5. Party-aware recommendations without misleading math

| Setup                      | Default recommendation policy                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Solo · Speed               | Outdoor route first; dungeon is an optional detour only when the full cost is favorable.                     |
| Solo · Chill               | Comfortable outdoor route; optional dungeons around At-level/Easy bands without pressure to find a group.    |
| Duo–four                   | Consider reviewed group/elite objectives; a dungeon still needs a capable full party or explicit recruiting. |
| Five, still assembling     | Include recruitment and rendezvous; do not use the ready-premade assumptions.                                |
| Five, together and capable | Recruitment wait can be zero; assess earlier demanding content when requirements and evidence support it.    |

Keep **At level** as the conservative baseline, following the prior owner instruction. The linked
[Wowhead dungeon guide](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location)
separately supplies Hard/Medium/At-level/Easy reference bands. These are not entry locks, proof of
XP/hour or guaranteed premade clear levels. An earlier group candidate must satisfy actual entry
and selected quest requirements; offer it as reviewed advice, not automatically as the optimal route.

For example, Deadmines remains an At-level 19 baseline for solo planning. Its Medium 17 reference
can inform a premade candidate only after reviewing readiness, quest gates and performance. That
is a future extension beyond the current Westfall slice, not a newly implemented level-17 route.

Hard rules for the next recommendation phase:

- Count total clear + both-way travel + pickups/prerequisites + turn-ins + waiting/regrouping +
  recovery/catch-up. A premade removes recruitment delay, not every other time component.
- Compare XP/time **per player**, not total party XP divided by one player's time. Do not multiply
  quest rewards or speed by five. Forever kill-XP sharing, bonuses and eligibility need confirmation.
- Shared kill credit and personal item collection are different. Count the time for everyone to
  finish collection/escort objectives; do not assume every quest shares credit equally.
- Red difficulty is a warning, not a speed bonus. Earlier content must account for hit/resist risk,
  deaths, gear/role capability and availability. No fixed “five levels earlier” rule.
- Check all known member levels/prerequisites. One-time quest rewards are counted once per eligible
  character; previously completed quests cannot improve that character's proposed route again.
- Unknown XP, clear time or readiness means an unranked candidate or incomplete comparison. Do not
  manufacture a “30 minutes faster” label. Preserve the current engine's checkpoint protections.
- When the party changes/disbands, re-evaluate optional opportunities without deleting progress,
  rewriting completed history or silently applying a new route branch.

The first release can explain these policies and expose existing valid comparisons. It does not need
a group simulator, invented reward multipliers or automatic recommendations unsupported by data.

## 6. Catalog and state design

Extend the existing TypeScript leveling package; no new service, .NET UI or production dependency is
needed for this experience. Keep pure catalog/profile/condition logic separate from extraction and UI.

Required additions:

- **Character profile:** local opaque profile ID, faction, stable race ID, class or unknown, optional
  level, pace, party size/readiness/capabilities and schema version. No name/realm is required.
- **Chapter metadata:** stable ID, source/version/build, zone(s), conditional labels, intended ranges,
  eligibility, ordered steps/references, continuation edges, preparation and publication coverage.
- **Route manifest:** ordered compatible chapter graph, variants, original/reviewed content references
  and explicit coverage gaps. A chapter's ID must not change with its displayed numeric bracket.
- **Condition representation:** parsed faction/race/class/ruleset/XP/dungeon predicates, including
  unresolved status. Never execute extracted Lua or use `eval` to interpret the private bundle.
- **Progress:** per-profile completed quest/action facts plus route-release checkpoints. Pace/party
  changes preserve character facts; another character must not inherit them. Release migration must
  be explicit when IDs or routes change. Shared URLs exclude private progress and character identity.

Metadata extraction uses the existing private `guide_inventory.csv`, reviewed headers and step
references read-only. Resolve `#defaultfor`, conditional `#displayname`, `#next`, labels and prerequisite
grouping rather than sorting filenames. Preserve original guide boundaries. Source text remains private.
Unknown/ambiguous conditions or dangling continuation edges go into an audit report; block affected
advice rather than silently selecting a branch. Explicitly reject non-Forever ruleset branches.

Publication is a separate gate: the account-derived guide bundle is not permission to republish its
prose or full routes. Use original KFC instructions or material with confirmed distribution rights;
join quest facts to our existing catalog. Reference metadata, authored previews and playtested guides
must remain distinct. Missing quest details display as unknown, not fabricated instructions.

Retain the current Westfall v1 planner state through a deliberate migration/import path. Do not assume
it contains race or party information, and do not erase it on the new wizard's first visit. Handle
unavailable/corrupt local storage gracefully with usable in-memory state.

## 7. URLs, discovery and existing links

- `/forever/leveling`: indexable introduction, coverage summary and onboarding; useful content must
  exist before browser-local preferences load.
- `/forever/leveling/routes/<route-id>`: route dashboard with stable defaults and compatible variants.
- `/forever/leveling/routes/<route-id>/chapters/<chapter-id>`: published chapter reader.
- Preserve old Encyclopedia directory and Westfall links using explicit permanent redirects to their
  new equivalents, including anchors and compatible saved planner choices. Never redirect every
  legacy deep link to the onboarding landing screen.
- Update primary navigation, Forever home card, Encyclopedia cross-links, community navigation/tool
  links, breadcrumbs, canonical/OG metadata and sitemap together when implementing the move.
- Index only meaningful published route/chapter pages; do not flood the sitemap with profile, wizard
  step or pace/party query combinations. Canonicals point to the stable content page.

## 8. Implementation sequence and scope

1. **Catalog adapter and coverage audit:** extract/evaluate real brackets and continuation edges,
   reconcile race/class eligibility, identify publishable current lists and gaps. Produce reviewed
   chapter manifests and tests before promising every faction/race a complete route.
2. **Dedicated product shell:** primary navigation, Forever home card, three-step wizard, profile
   persistence and compatibility states. Keep existing planner behavior available during migration.
3. **Dashboard and current-list reader:** render real compatible brackets, open available lists,
   preserve current order, add local progress and responsive/keyboard behavior. Move valid existing
   comparisons behind optional callouts. Unavailable content remains honestly labeled.
4. **Link/metadata migration and verification:** old deep links, current saved plans, community
   destinations, canonical/sitemap checks and desktop/mobile Playwright. Deployment is a later,
   separately requested operation; do not restart ingestion for this web UX change.
5. **Next content phase:** refactor original/authorized lists into real Speed/Chill/Group variants,
   review premade rendezvous and earlier group content, gather per-player XP/time evidence and
   validate every modified dependency/rejoin. Only then claim optimized mode-specific routes.

Payment, supporter fulfillment, in-game addon changes and a new automatic group optimizer are not
dependencies of steps 1–4. The existing runtime XP/playthrough gates still apply before validated
speed or full coverage claims. The existing supporter plan is not canceled or activated here.

## 9. Acceptance and regression checks

- Leveling is one click from primary desktop/mobile navigation, including the community entry,
  and has its own Forever home card.
- First visit follows faction → race → style → brackets; returning visits offer Resume and Change setup.
- Illegal race/class combinations, changed faction and unresolved class-dependent paths are handled
  without displaying another character's incompatible content. Skyborne is faction-aware.
- Real conditional labels and continuations are tested: Human starters, Dwarf/Gnome Westfall label,
  Hunter alternatives, non-Forever branch exclusion and Zephras's unresolved Horde continuation.
- Chapter graph validation catches ambiguity, broken targets, duplicates and cycles without rejecting
  legitimate overlapping level labels. No private source bundle is shipped in public assets.
- Every published bracket opens a nonempty correct current list. Reference-only coverage cannot
  masquerade as a playable guide. Quest order and retained prerequisite chains match the current release.
- Solo/group presets do not silently alter quest order; duo is not five; five unready is not ready;
  zero recruitment time does not zero travel or turn-ins. Unknown rewards cannot produce a ranked win.
- Progress survives Back, refresh and pace/party changes, stays isolated between profiles, and preserves
  valid old Westfall plans. Shared links contain no private character history.
- Keyboard/focus and screen-reader states work; cards and reader have no horizontal overflow at
  360px, 390px, tablet and desktop widths. Loading, empty, unavailable and persistence-error states work.
- Old deep links retain destination intent; published pages have correct canonical/OG/breadcrumbs;
  onboarding/profile query variants do not create duplicate sitemap entries.

For subsequent changes, rerun focused catalog/profile tests, the existing leveling arithmetic
regressions, web typecheck/lint/build and desktop/mobile Playwright. Runtime playtesting and full
mode-specific content coverage are not implied by passing browser tests.

## 10. Persistent map and independently scrolling quest workspace

Requested October 4, 2026 after reviewing the integrated zone maps. This is a UI refactor, not a
new extraction, database schema, quest optimizer or progress-storage migration.

Status: committed, pushed and deployed in both reader editions as
`kfc-helper-leveling-workspace-20261004-r3`.

### Original problem, verified before this revision

Both readers rendered `LevelingZoneMap` before the quest list and their `showOnMap` handlers
scrolled the whole page to it. Only the chapter sidebar was sticky. Large hero/settings sections,
the 1280px page frame and the 420px SVG cap displaced or constrained the actual working map.

### Implemented desktop screen

```text
KFC primary navigation
────────────────────────────────────────────────────────────────────────
← Chapters   Northshire · 1–6   Character   12/60 done   Settings
Step 13                                        Next step    Done
──────────────────────────────────────┬─────────────────────────────────
Zone: Elwynn                          │ Quest list     Hide completed
                                      ├─────────────────────────────────
                                      │ 12. Accept quest                │
          PERSISTENT ZONE MAP          │     Instructions · Wowhead      │
                                      │     □ Finished                  │
           numbered circles           │                                 │
                                      │ 13. Complete objective          │
                                      │     ← selected highlight        │
                                      │     □ Finished                  │
                                      │                                 │
Selected step · coordinates           │ Remaining ordered steps         │
Legend / evidence / map status        │      independent vertical scroll│
──────────────────────────────────────┴─────────────────────────────────
```

- Use all available screen width and viewport height below the existing 72px primary header;
  this is a normal browser workspace, not a required Fullscreen API session.
- At desktop widths, start around 60% map / 40% quests; keep the quest pane at least 420px wide.
  Fit the image to available space without distorting its aspect ratio. Remove the reader's 420px
  art cap and the 200px chapter sidebar. No resizable splitter is necessary for the first revision.
- The map pane never scrolls with the quest list. Use a bounded CSS grid/flex workspace with
  `min-height: 0`, and `overflow-y: auto` only on the quest-list region. A sticky map inside the
  existing document flow would not fully address the current scrolling problem.
- The compact chapter bar owns Back, title/level bracket, character summary, completion count and
  Settings. Chapter navigation remains accessible in the quest pane when reaching the end.
- Move class/XP-rate/dungeon configuration and expanded source evidence into a settings/details
  panel, without changing existing eligibility or dungeon opt-in rules. Unsaved-character actions,
  persistence failures and unresolved conditions must remain discoverable and actionable; do not
  hide important warnings solely in a tooltip.
- Scope full-width/frame/footer changes to actual chapter workspaces. Preserve the normal landing,
  dashboard, Trader, Encyclopedia and metadata-only reference-page layouts. Do not apply an
  unscoped body overflow lock or replace the site's primary navigation.

### Selection and completion behavior

1. On opening, show the next pending applicable step, with its card highlighted and its zone/points
   on the map. A valid existing step deep link takes precedence for initial selection.
2. Clicking a quest card's selection area/title changes the selected step and map immediately,
   without scrolling the page or jumping the quest list back to its beginning. Keep the selection
   accessible through a real button, with a clear pressed/selected state and keyboard activation.
   Keep an ordered list; do not use a listbox role around cards containing links and checkboxes.
3. Completion, Skip, Wowhead links and details controls remain separate actions. Their clicks must
   not bubble into card selection or accidentally finish a quest. No nested interactive elements.
4. Selecting a step pins the map to that step. **Next step** moves to the next visible applicable
   instruction strictly after that position, without marking anything complete. **Done** first marks
   the current instruction complete, then moves forward. Earlier unchecked instructions never pull
   either action back to the chapter beginning. Checkbox-only changes do not move selection unless
   Hide completed removes the current card; undo never rewinds the cursor. Selecting an earlier
   card explicitly returns there. At the final step, Next is disabled and Done can complete that
   step without wrapping. Done requires a saved matching character, a resolved applicable step and
   an incomplete current card. Unsaved visitors can still use Next. Current-step anchors and validated
   browser-history state preserve the reading position on refresh, including legacy Follow history;
   scope includes character/chapter/version/build. No automatic-follow mode remains in the UI.
5. Next/Done navigation scrolls only the quest pane to the relevant card. Both buttons remain visible
   in Split, Map and Quest list focus; if the pane is hidden, scroll to the new selection when it is
   reopened. Preserve existing
   guide anchors, original-preview anchors and `#planner` behavior within the new scroll region.
6. Automatically use a selected step's relevant zone. For steps spanning multiple maps, keep an
   explicit zone selector. Do not retain the previous quest's unrelated zone after selection changes.
7. Selected instructions remain visible even without coordinates; show an explicit map-side
   “No extracted location for this step” state instead of leaving another quest's circles displayed.
   Unknown branches stay separate, and their completion controls remain disabled as today.

Retain gold guide waypoints versus blue exact-build client POI evidence, numbered coordinates,
native reveal layers, loading/error states and build-mismatch warnings. Do not convert travel or
pickup waypoints into claimed objective radii. Map zoom/fit controls can follow the initial layout
refactor; they must not hijack quest-pane scrolling.

### Tablet, phone and accessibility

- Below approximately 1024px, switch to a compact pinned map above an independently scrolling
  quest pane; do not squeeze two unreadable columns onto a phone. Allocate roughly a third of the
  usable height to the map, adjusting for viewport height and readable controls.
- Short landscape/tablet windows at 700–1023px retain readable side-by-side map/list panes instead
  of leaving only a few pixels for quests. Scope overflow containment to the reader workspace.
- Offer Map/List focus modes for very short screens and phone landscape, retaining selection and
  each pane's scroll position. Do not mount duplicate readers or reset progress when switching.
- Use dynamic viewport units, safe-area padding, minimum touch targets, visible keyboard focus and
  labeled scroll regions. Browser zoom must not make controls or warnings unreachable.
- Maintain the site's KFC dark/gold styling. Use one strong selected-card treatment, distinct from
  completed/skipped styling; avoid adding another navigation sidebar or long banners.

### Implementation and verification

1. Add a shared chapter-workspace layout used by the imported and original readers. Keep their
   guide-specific instruction rendering and existing progress contracts intact.
2. Integrate route-scoped full-width/height chrome, compact chapter controls, persistent map and
   scrollable ordered list. Keep the original calculator inside reachable quest-pane details.
3. Replace map-scroll handlers with explicit step-selection state; implement pane-local Resume,
   deep-link handling, highlighting and separate selection/completion/link events.
4. Add responsive map/list focus behavior, empty/error/settings states and accessibility polish.
5. Extend existing Playwright tests: scroll the list far down and assert map position is unchanged;
   click a lower quest and verify its markers without window/list jumps; verify checkboxes/links
   do not trigger unintended selection; test follow/pin/undo/hide-completed, zone changes, hash
   links, refresh, 360/390/768/1024/1440px widths and short/zoomed viewports. Retain storage-denied,
   corrupt-save, source-condition, media-failure and WCAG regressions. Run web tests/typecheck/lint/
   build and visually inspect both reader editions.

No production dependency is needed for this layout. Existing 49-zone art/coordinate coverage and
per-character/source/build progress remain the baseline; deployment is a separately requested step.

Shared components are `leveling-reader-workspace.tsx`, `leveling-quest-card.tsx` and
`leveling-reader-selection.ts`; pane-local navigation/history validation is in
`leveling-reader-navigation.ts`. Imported conditional instructions and the original calculator remain
owned by their existing readers. Native Settings dialog supports Escape/focus restoration. Important
storage warnings stay visible above the workspace; save-character and unresolved-step actions stay
in the quest pane. Follow/pin does not re-mount the map canvas or re-fetch the guide.

Final local verification: 136 web tests, Helper typecheck/lint/production build, community typecheck
and focused test lint/formatting, and all 20 Chrome/Playwright leveling regressions pass. Browser
coverage includes the reported Elwynn step-51 Follow bug, final-step hide/no-wrap, refresh, keyboard
card selection, independent map/list scroll, Settings Escape/WCAG, original calculator and existing
storage/media/source-condition checks. Responsive bounds include 360/390/768/1024/1051/1440px
and a 900×450 landscape window. The primary navigation folds at 1050px to keep every link reachable.
