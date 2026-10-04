# Forever Leveling: authorized full-source archive

Implemented locally on October 4, 2026. The owner confirmed redistribution authorization on that
date. This revision has not been committed, pushed or deployed.

## What was extracted

The reviewed decoded RestedXP collection contains 157 guide variants (98 Alliance, 59 Horde),
22,604 original source steps and 2,394 distinct quest IDs across quest actions. All files passed
per-chapter and aggregate step-count checks. The ordinary-guide metadata audit covers 56 legal
faction/race/class combinations; every combination has available chapters starting at level 1 and
ending at level 60. This is **not** proof of a continuous, playable, optimized 1–60 route.

Source inputs are `/Users/dimitarjilanov/Desktop/restedxp-analysis/guide_inventory.csv`,
`summary.json` and `guides/*.txt`. Their reviewed provenance is pinned by the catalog:

- Bundle SHA-256: `af3fec7909e0b5a1dd8659f87e67171f8984af40a22b997e630a0052a11c871e`.
- Inventory SHA-256: `2c6d9f41faf2fd64ae7bb40a81476a655c53f7a1f4a4edee7cbb1ea3bb1a8637`.
- Target client build: `70205`; reviewed beta level cap: `30`.
- Archive schema: `1`; parser: `forever-guide-v2`.

The importer consumes the existing verified decode; it does not run Lua or infer server-side facts.
It preserves step order, class/race/rate conditions, quest IDs, locations, source controls,
dependencies and original line numbers. Game color/texture markup is removed from display text.
Raw descriptions are rendered as escaped React text, not HTML.

## Reproduce locally

From the repository root:

```bash
pnpm --filter @wow-trader/leveling archive \
  /Users/dimitarjilanov/Desktop/restedxp-analysis \
  artifacts/leveling/archive --authorized
pnpm dev
```

`--authorized` explicitly records the owner's confirmed authorization in the manifest. Without
that flag, output is private-reference only and the website refuses to serve it. Changed inventory,
bundle provenance, chapter metadata or counts fail import instead of silently replacing the catalog.
This is a maintainer import, not an additional command needed on every development start.

Open `http://localhost:3000/forever/leveling`, select faction/race/style, then open a chapter. The
dashboard's full library has level-bracket, class, XP-rate and guide-family filters. All ten
faction/race choices, including both Skyborne factions, have readable imported starters and
available endgame chapters. The first connected prefix is kept separate from the remaining library.

Output is ignored under `artifacts/leveling/archive`:

- `manifest.json`: publication permission, build, versions, filenames, checksums, counts and quest IDs.
- `audit.json`: race/class label coverage, missing continuation targets, cycles and directive counts.
- Versioned chapter JSON files: immutable normalized ordered instructions.

Repeated imports verify existing immutable files and replace the manifest/audit atomically. Old
parser editions may remain in this directory; only manifest-listed files belong to the active release.

## Reader behavior and limits

- Class/race and supported XP-rate predicates filter applicable instructions. Unknown predicates
  remain explicitly conditional, with completion disabled; they are not silently treated as true.
- Forever's normal non-Hardcore/non-SSF ruleset uses the installed loader's season-zero fallback.
  SoD/SoM-only branches are excluded. Phase conditions remain unknown.
- Dungeon branches are off by default, even for Group. Explicitly choosing a source dungeon branch
  changes its outdoor alternative; it is not a measured XP/hour recommendation or zero-wait promise.
- Quest, item, money, skill, spell-training, XP and location state checks stay manual. Browser
  checkmarks cannot satisfy an in-game prerequisite. Dependencies and raw controls are inspectable.
- Negative/world coordinates keep their original coordinate space, never mislabeled as map percent.
- Speed/Chill/Group establishes planning context; original quest order is preserved. Route optimization
  and complete game-state simulation are separate work.
- Progress is isolated by character, chapter, imported source/parser version and client build.
  Hidden variants do not become completed steps. Imported progress never changes the original
  Westfall preview/calculator state. Save-size and browser-quota failures retain the prior persisted
  history and explicitly warn that new changes are in-memory only.
- The original KFC Westfall 31-step reader and advanced comparison remain at the same chapter URL
  with `?edition=kfc`. Legacy Westfall links redirect to that edition and preserve other query values.
- Both readers now use a **Finish step** checkbox; unchecking makes the step pending again.
  **Skip instead / Undo skip** is separate and does not count as completion. Existing done/skipped
  saves are compatible; no progress migration or game-state inference is involved.
- Both editions use the same full-width, viewport-height chapter workspace: persistent map left,
  independently scrollable ordered quests right, compact progress bar and Settings dialog.
  A phone keeps the map above the list and offers Split / Map / Quest list focus without resetting
  selection or list scroll. Short wide screens use side-by-side panes. Other site pages keep their
  existing frame/footer. Selection never scrolls the whole document to the map.
- Clicking a card/title pins its map independently of checkboxes, Skip, details and Wowhead links.
  **Follow next step** follows pending instructions from that selected position, not the first
  unchecked instruction in the entire chapter. **Resume next step** uses that same cursor and
  scrolls only the quest pane. Neither silently completes earlier work; the cursor never wraps at
  the end. Valid step anchors plus character/chapter/version/build-scoped browser-history mode
  restore the current reading position on refresh. This is browser-local, not account synchronization.
- Class, known XP rate, optional dungeon branches and expanded source evidence are in Settings.
  Storage errors remain visible, and unresolved-step completion remains disabled. The original
  `#planner`/optional comparison deep links open their details and scroll only the quest pane.
- Quest and item actions link to the exact Forever Wowhead ID in a new tab, alongside the internal
  library link. Described numeric spell actions link to the corresponding Wowhead spell. The guide
  stays usable without a Wowhead request, script or iframe; link availability is external.
- Without an authorized manifest the existing metadata/preview fallback remains available. Invalid
  authorized files fail checksum/schema checks rather than presenting partial or fake instructions.

## Gaps requiring review

The continuation graph has two unresolved source titles: Wetlands Mage AoE points to a Duskwood
title missing its “Part 2” suffix; Mulgore 1–6 points to an absent “6–13 Mulgore” title. Horde
Skyborne has no reviewed header continuation. No guessed connection has been promoted as validated.

At an explicitly selected 1× outdoor XP rate, label coverage has gaps for some Alliance Hunters at
13/14/40 and Undead at 11. These are numeric **chapter-label** gaps, not demonstrated missing quests:
overlapping guides, class variants and runtime branches still require review. All 56 combinations
reach the 1/60 endpoints, but that must not be described as seamless 1–60 coverage.

Content above level 30 is preserved and browseable, with a future-content warning. It has not been
playtested on this beta, and source presence does not establish server availability or current rewards.

## Zone maps and location circles

The chapter reader includes a persistent native-art map panel, a zone selector and clickable
step titles/cards. Mapped title buttons retain their **Show on map** accessible labels. Selecting
pins a step; **Follow next step** resumes automatic advancement from that position.
Completed/skipped steps and hidden class/rate/dungeon variants
do not silently contribute locations to another step.

The map adapter reuses the existing extracted world snapshot, UiMap/UiMapAssignment, native map-art
layers/tiles, WorldMapOverlay/WorldMapOverlayTile reveal layers and QuestPOI records. It resolves numeric IDs or exact zone names; the installed Classic
loader's `StormwindClassic` alias maps to Stormwind City. Unknown/ambiguous names and out-of-bounds
coordinates are not guessed or clamped. Missing artwork/media/configuration has an explicit state
and cannot take the quest reader offline.

Verified against all 157 active imported chapters and the freshly extracted build-70205 world snapshot:
**49 referenced zones, 37,902 normalized guide positions, zero unprojectable positions, 588 required
base tiles, 871 required reveal tiles, zero missing images and no referenced zone without art**.
Forty-one zones use reveal layers; cities can have complete art without overlays. The full extraction
decoded 3,386 distinct map PNGs with zero unavailable files. These counts cover
normalized position directives, not every unparsed path-control argument or every quest in the game.

Important coordinate interpretation, checked against the installed RXPGuides `functions.lua` and
HereBeDragons implementation:

- Map percentages divide by 100, retaining their zone/map layout.
- `zone/0` or `zone/1` uses world coordinates and a **world/instance map ID**, not a dungeon floor.
  The v1 archive retains its historical field name `floor`; the UI now calls it “world map”.
- RXP/HBD world axes must be swapped before applying DB2 UiMapAssignment Region projection.
  The slash-suffix map ID must match the selected assignment; otherwise the point is unmapped.
- Gold circles indicate source guide waypoints, including travel/pickup/turn-in locations. They are
  not evidence of an exact NPC spawn or a measured objective/search radius.
- Blue outlines/circles indicate extracted client QuestPOIs and representative area centres. They
  are used only when the world snapshot build equals the guide target build and the entire region
  can be projected. Quest IDs alone never establish a location.

The local map snapshot and guide target now both use **70205**. The full archive produces 31
step-associated client POI markers (not 31 distinct quests); most circles use extracted guide
waypoints because the client ships only 54 quest POI records. No location is inferred from an ID alone.
If deploying an older snapshot, the panel still labels the background/projection build and suppresses
different-build POIs. Matching builds do not prove server availability or current quest rewards.

World extractor **0.4.0** decodes both base and reveal texture IDs into the existing map-media
manifest. Its versioned output keeps older snapshots immutable, and the development bootstrap
selects this version automatically. Reveal metadata is checksummed, schema-validated and joined
only to same-product/build media. Conditional and zero-size placeholder overlays are excluded.
Native PNG dimensions are retained and each overlay is clipped to its client-defined bounds, so
padded edge textures do not stretch or cover neighboring areas. Numbered circles with dark outlines
match the numbered coordinate list and remain visible against the map terrain.

The normal `pnpm dev` bootstrap already selects a world snapshot and exports its map-media settings.
If starting only the web package manually, configure the existing absolute-path
`WOW_TRADER_WORLD_SNAPSHOT` and optionally `WOW_TRADER_WORLD_MEDIA_ROOT`, plus
`WOW_TRADER_WORLD_PREFER_ARTIFACT=true` when testing the reviewed artifact. Do not copy paths from
another machine or add a guessed latest-build fallback. These are the existing Encyclopedia map
settings, not new services. The local port-3000 preview has been restarted with the validated snapshot.

## Production handoff (not executed)

Provision the archive separately from the application build. Set `LEVELING_ARCHIVE_ROOT` to an
absolute directory readable by the web PM2 user. Copy only the active manifest's chapter files and
optionally its audit, verify them, then publish `manifest.json` last. Keep the prior archive for rollback.
Do not copy the private decoded directory, the original account bundle or every historical artifact.

Provision the new 70205/0.4.0 world snapshot separately too, with its validated manifest, normalized
artifacts, checksummed raw overlay tables, map-media manifest and `media/map-art` PNGs. Set the
existing world snapshot/media paths to this release and restart the web process after validation.
Source artifacts are not automatically bundled or uploaded by `next build`; older snapshot roots
remain available for rollback. No production upload or deployment was performed for this revision.

Next/Turbopack tracing is explicitly disabled for archive filesystem paths. The standalone build
must not include the maintainer workspace or private source files. The deployment must supply the
archive directory; it is deliberately not bundled or committed. No PostgreSQL migration, payment
activation, addon modification or ingestion-service restart is needed for these readers.

The server serves only authorized manifest members and checks each chapter's size, SHA-256, schema,
identity, version, source hash, build and step count. Publication authorization is a manifest gate,
not an authentication mechanism; approved chapter instructions are intentionally public.

## Verification

Relevant commands:

```bash
pnpm --filter @wow-trader/leveling test
pnpm --filter @wow-trader/leveling typecheck
pnpm --filter @wow-trader/leveling lint
pnpm --filter @wow-trader/web test
pnpm --filter @wow-trader/web typecheck
pnpm --filter @wow-trader/web lint
pnpm --filter @wow-trader/web build
```

Browser tests live in the sibling community repository's `tests/e2e/leveling-*.spec.ts` and use its
existing Chrome/Playwright setup. `LEVELING_TEST_HELPER` overrides the default local Helper origin
when checking a stable production preview. They cover all ten starters/endgame access, imported
progress, conditions, optional dungeon branches, original-edition isolation, legacy URLs, storage
failures, multi-character behavior, sharing, WCAG checks and 360–1440px layouts. Workspace tests
also cover fixed map bounds, lower-card selection, click separation, follow-from-step-51, refresh,
hide-completed/undo, focus-mode scroll retention, keyboard Settings and short landscape windows.
Final results are
recorded in `context.md`; browser checks are not live WoW playthrough evidence.
