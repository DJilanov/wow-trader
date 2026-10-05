# WoW Trader project context

Last updated: 2026-10-05

## Goal and current target

Build a player-facing WoW economy product with a build-versioned item/profession/recipe archive,
approximately 30-minute Auction House history, realistic crafting opportunities, and evidence-backed
market guidance. TBC Anniversary remains the original validation baseline; Forever Classic Beta build
70205 is now the active public catalog and leveling-preview target.

Client presence, announced content, phase availability, observed sources, and estimated drop rates
are separate facts. Extraction can reveal a shipped rare recipe before it drops, but it cannot prove
its server-side source or probability.

## Repository and stack

- Remote: `git@github.com:DJilanov/wow-trader.git`
- Local: `/Users/dimitarjilanov/work/test/wow-trader`
- Branch: `main`, tracking `origin/main`. Production web release
  `kfc-helper-leveling-quality-20261004-r5` is active; `kfc-helper-leveling-workspace-20261004-r4`
  is the immediate web rollback. The full pre-feature rollback remains
  `kfc-helper-leveling-preview-20261004-r1`. Ingestion remains independently pinned to
  `kfc-helper-ingest-auction-20261001-r1`.
- Primary stack: strict TypeScript, pnpm/Turborepo, Next.js, Fastify, Zod, Drizzle, PostgreSQL.
- Boundary tools: .NET 10 for CASC/DB2 extraction and Lua for the in-game collector.
- Full architecture: `blueprint.md`.
- Market workspace, AH source, valuation, signal, and staged UI plan:
  `docs/market-workspace-plan.md`.
- Original Forever leveling route, At-level dungeon timing, shared XP/time calculator, RestedXP
  compiler and pending supporter/payment gates: `docs/forever-leveling-product-plan.md`.
- Revised primary-navigation Leveling product, faction/race/style setup, chapter dashboard,
  current-list reader and party-aware policies: `docs/forever-leveling-experience-plan.md`.
- Account-wide make-or-buy rules, profession profiles, and Forever migration:
  `docs/account-crafting-network.md`.
- KFC Helper subdomain, route contract, Encyclopedia scope, and activation plan:
  `docs/helper-encyclopedia.md`.
- Item-stat normalization, in-game tooltip composition, BiS calculation, and acquisition-source
  graph: `docs/item-library-bis-sources-plan.md`.
- Build-versioned BiS inputs, shared legality rules, class-family mechanics, search, confidence gates,
  and Forever activation: `docs/bis-algorithm.md`.
- Talents Forever public-export audit, evidence schema, preview Encyclopedia, calculator, stable
  build sharing, licensing, and client-reconciliation plan:
  `docs/talents-forever-integration-plan.md`.
- Forever Beta build 69893 client audit, product-specific extraction, item/recipe migration,
  encounter evidence, observed actor binding, and model pipeline:
  `docs/forever-beta-extraction-plan.md`.
- Forever proper Encyclopedia maps, spatial evidence, instances, runtime encounter/loot collection,
  item source graph, mob observations, and quest archive:
  `docs/forever-encyclopedia-plan.md`.
- Tested operation and Forever migration: `docs/runbooks/tbc-validation.md`.

## Implemented

### Dungeon release preparation (2026-10-05)

- User approved the dungeon experience and requested commit, push and deployment. Only the leveling
  implementation, regression checks and its documentation are in scope; unrelated local catalog,
  market, ingestion and SEO edits remain untouched.
- Read-only production audit confirmed the r5 web baseline, independently pinned ingestion, guild
  process 30 and about 8 GiB free disk. Prepare an immutable web-only candidate over that live
  baseline, then validate before switching `current`. No migration or data publication is needed.
- Keep the authorized 157-chapter archive, reviewed world maps, production environment and current
  market/catalog baseline unchanged. Record activation, public checks and rollback in the release
  receipt after successful deployment; preparation alone is not deployment.

### Scoped dungeon alternatives and reviewed continuations (2026-10-05; local only)

- User asked to plan the other dungeons and implement the Thanes-style alternative experience.
  All 32 visit variants now have geographic/faction fit, preparation, scoped run and hand-in plans.
  The prominent plan shows selected quest XP, checkpoint/gap and full-curve level endpoint; other
  journeys stay collapsed. Ordered quest itineraries use the existing ID/evidence catalog and links.
- Deadmines defaults to six core quests (≈21,867 XP), not an unprepared explosives chain. Alliance
  Ruins estimates ≈22,535 XP. Fresh 19 reaches 20 + 2% / 5% from those quest rewards alone, not 1.5
  levels. Optional chains, prerequisite rewards, kills and measured time remain separate.
- Alliance WC is moved from Redridge to the authored 21–23 Stonetalon/Ashenvale bracket; its itinerary
  requires actual 21+. The unprepared Smart Drinks chain is optional. Horde WC keeps its Barrens
  placement and strict At-level 19 floor. No premade entry-floor exception exists.
- DM and Alliance Ruins have new source/hash-pinned **19→20** adapters for the audited Human Warrior
  at 1× outdoor XP. Both preserve The Price of Shoes→Return to Verner→A Baying of Gnolls for later
  Redridge, The Corruption Abroad for Darkshore, Cooking 50 and class/utility preparation. Actual
  reported level 20+, fresh XP and explicit bridge checks gate the exact next source step.
- New `--alternative` keys and optional strict continuation snapshots preserve old generic trips,
  competing choices, instruction progress, backups and outdoor bookmarks. Rejoin never marks
  source rows done/skipped. Changed evidence/variant blocks reuse with a visible reason and recovery
  link. Unsupported variants remain safe optional trips, not fake chapter replacements.
- Optional trips persist their itinerary mode. Continue/reload and even removal of the URL flag
  preserve Alliance WC's 21+ floor and selected core bundle; the constructor enforces that gate too.
- Hall of Thanes is unchanged. Higher-level/unknown-schedule/unknown-access visits remain labeled
  references under build 70205's reviewed cap 30. More actual source replacement adapters require
  race/class/chain/wing review; having a scoped itinerary is not proof of a legal automatic skip.
- Timing still pending: user offered Alliance travel measurements; requested Stormwind→DM,
  Stormwind→Ruins and Astranaar→WC each-way ranges and transport assumptions. The existing complete
  trip comparison accepts entered bounds; no walking durations or fastest-route claims are invented.
- Full 32-row authoring matrix and implemented contract:
  `docs/forever-leveling-dungeon-route-choice-plan.md`. Maintenance behavior:
  `docs/forever-leveling-dungeon-expansion.md`. Verification receipts are in `fixes.md`.
- No commit, push, deployment, database/addon write, dependency installation or dev-server restart.
- Verified: 104 leveling + 195 web tests, lint/typechecks, leveling and isolated production builds.
  Chrome regressions cover new continuations, WC mode persistence, previous Thanes/optional trips,
  the chapter tree and reference library; desktop/390/320 px overflow and WCAG A/AA checks passed.

### Dungeon option discovery and collapsed cards (2026-10-05; local only)

- Matched new chapter alternatives to the warm gold Hall of Thanes styling: visible dungeon names,
  required levels, quest counts and labeled XP, with each quest plan collapsed by default. Native
  keyboard-accessible accordions open one option at a time within each chapter; selected/saved trips
  link to their existing instructions. No new speed or zone-replacement claims were introduced.
- Added a chapter-path shortcut and a fixed reader-toolbar shortcut so alternatives are reachable
  without scrolling back manually. Opening cards and following discovery links leave the current
  source bookmark, completion and dungeon selections unchanged.
- Collapsed the generic review's XP/time comparison and quest library separately, preserving their
  inputs. Removed the irrelevant future-visits checkbox from single-visit reviews only. The full
  reference library and existing Hall of Thanes route remain available.
- Feature behavior/maintenance: `docs/forever-leveling-dungeon-expansion.md`. Final verification
  receipts are in `fixes.md`. No commit, push or deployment requested for this presentation update.

### Full-path dungeon options and generic trips (2026-10-05; local only)

- Implemented the catalog expansion foundation: all 32 visit variants are discoverable in the
  full chapter path or unknown-schedule references. At level is enforced as a strict floor even
  for premades; selected pickup requirements can raise it. Above-cap/unknown content stays reference.
- Repaired suffixed UBRS parsing and reviewed source section/wing/row coverage. The refreshed guide
  has 228 associations/224 unique IDs, UBRS 12 rows and At level 60; the union has 271 records.
  The 157-chapter audit now contains 242 visit/quest rows. No current runtime reward XP is invented.
- Added a shared six-stage source-pinned trip reader, compatible quest bundles and same-checkpoint
  calibrated XP/catch-up/time comparisons with explicit per-player estimates. Real prerequisites,
  starting items, preparation and reported XP gate actions; Next/Done do not earn rewards.
- v2 clone-once migration preserves legacy Thanes state and the v1 backup. Competing chapter/visit
  trip snapshots, checkpoint assumptions and bookmarks remain separate and reversible.
- Browser regression found and fixed trip activation silently enabling a source `.dungeon` branch
  and hiding the saved outdoor `!DM` row. Generic trips now leave source branch choices untouched;
  return checks use the actual branch and reject hidden/unresolved bookmarks.
- Only Thanes is still an authored XP-segment/zone replacement. Generic trips retain all source
  instructions; additional omitted-step/bridge adapters and later lifecycle/reward data remain
  evidence-gated work, not completed automatic route substitutions.
- Contracts, maintenance and remaining work: `docs/forever-leveling-dungeon-expansion.md`.
- Verified 94 leveling + 194 web unit tests, five importer tests, 21 Chrome regression groups,
  both lint/typechecks, script lint/formatting, the 157-chapter audit and package/isolated production
  builds. Mobile 390/320 px reference/trip layouts have no horizontal overflow or automated A/AA
  violations. Receipts follow in `fixes.md`. No commit/push/deployment, migration, dependency,
  production write, addon change or dev restart was requested or performed.

### Full chapter path and complete dungeon replacement planning (2026-10-05; local only)

- Replaced the three-card nearby preview and collapsed 1–20/21–40/41–60 archive with the complete
  eligible 1–60 path. Source branch links and rejoin links jump within a level-ordered route tree;
  graph gaps/conditions remain explicit and navigation does not select or complete a chapter.
- Every chapter shows unique applicable source quest counts, hand-ins, optional/conditional counts,
  bracket-required XP and modeled time at the player's saved effective per-player XP/hour. Known
  reference reward subtotals/coverage remain separate; unknown rewards and same-level duration are
  not zero. No forecast is credited as earned XP, no party/global bonus is multiplied again.
- Validated/cache-bound activity projections use authorized, checksum-verified chapter files and
  retain existing class/rate/season/dungeon filters without sending full guide prose/maps. Expanded
  the client curve through 60; all 60 entries match the pinned extraction checksum and Total column.
- New `docs/forever-leveling-dungeon-replacement-plan.md` covers all 32 catalog visit variants,
  259 quest/prerequisite records, candidate source segments, generic replacement definitions,
  lifecycle/XP/time rules, persistence migration and staged rollout. Only Thanes is implemented.
  Found UBRS omitted by an importer heading-suffix bug: six primary source row IDs need importing.
- Scheduling policy clarified by the user: **At level is a strict floor, even for premade groups**.
  Selected quest/access requirements may raise it; preparation can happen earlier. Unknown or
  above-beta-cap schedules remain reference-only. Related planning documents now use this rule.
- Chapter-tree unit/browser regression scripts and archive projection checks added. Verification
  and final local status are recorded in `fixes.md`. No commit/push/deployment, new dependency,
  database migration, addon change, production write or dev-server restart in this turn.

### Leveling player-quality improvements (2026-10-04; deployed r5)

- Implemented exact per-character/chapter/version/build reading bookmarks and Continue playing;
  Previous and session-local Undo Done; bounded map zoom/drag/keyboard pan/fit with marker-to-instruction
  navigation; current+next focus mode and larger text; explicit source-only chapter handoffs;
  private validated progress backup/merge; and durable anonymous step reports with a maintainer review CLI.
- Backups preserve existing saved releases in full, including undone steps. Feedback retries are
  idempotent even when PostgreSQL reorders JSONB keys; reports never automatically edit route evidence.
- Code `f81bc5c` committed/pushed; deployed `kfc-helper-leveling-quality-20261004-r5` over the existing
  live baseline, preserving independent catalog work. Migration `0016_white_runaways.sql` applied
  with a verified 83,087,657-byte backup; runtime feedback grants are SELECT/INSERT only.
  Real PostgreSQL and public HTTPS insertion/retry/validation checks passed; staged rate limits passed.
  Local PostgreSQL remains stopped. Discord account sync remains a separate auth/privacy phase.
- Contracts, known source gaps, backup/rollback caveats and operator commands:
  `docs/forever-leveling-player-quality.md`. Unrelated working-tree changes remain preserved.
- Verified strict web/database typechecking and linting, 165 web unit tests, full isolated-feature
  `pnpm check` including production build, formatting, and all 30 Chrome regressions against the
  production-mode build. Additional final mobile/map-size, landscape and keyboard/accessibility
  regressions passed after screenshot review found and corrected wrapped controls shrinking the map.
  Real local feedback requests return an honest 503 while PostgreSQL is unavailable.
- Linux lint/typecheck/build and 165 web tests passed; all 30 staged Chrome cases passed across the
  initial run and corrected bookmark-assertion rerun, plus seven live HTTPS cases. Only Helper web
  reloaded; ingestion stayed PID 1169337/restarts 0, guild and community stayed unchanged. Six exact
  synthetic feedback records were cleaned up; player reports were untouched. r4 is retained for
  web rollback, with the documented private-progress backup caveat. Browser test commits:
  `7f8a1d1`, `68ae79f` in sibling `discord-website`; no community runtime rebuild was needed.

### Next phase: dungeon integration (2026-10-04; research/plan only)

- Plan: `docs/forever-leveling-dungeon-integration-plan.md`. Optional sidecar route preparation,
  typed stateful quest-chain graph, inside/drop starts, correct turn-ins/rejoin, marginal bundle
  versus full-trip XP/time, legal reward choices and conservative role/gear utility.
- Re-indexed authorized archive against existing supplemental audit: 94 dungeon associations,
  92 unique quest IDs, 13 sections. Ruins and Excavation lack accept/turn-in directives; Thanes
  lifecycle is incomplete. Counts include all variants, not proof of individual character coverage.
- Found self/future quest IDs in addon prerequisite lists, accepted-state/item gates, competing
  pickup minima and conflicting offline XP. No reference values were promoted to runtime truth.
  October 1 cap/XP/shareability changes and catalog-only availability are explicit release gates.
- First implementation should normalize/audit evidence, then add Thanes/Deadmines and RFC/WC
  preparation overlays; add missing Ruins/Excavation and measured reward comparisons afterward.
  No dungeon feature, broad quest scanning, payment/auth or addon changes were implemented this turn.

### Explicit chapter Next step / Done (2026-10-04; deployed)

- Owner requested manual advancement, replacing Follow and Resume. Both imported and original readers
  now expose **Next step** (advance without changing progress) and **Done** (complete the selected step,
  then advance). Buttons stay visible in Split, Map and Quest list focus. Advancing scrolls only the
  quest pane; map-only mode queues the scroll until the pane becomes visible again.
- A checkbox-only completion does not advance unless Hide completed removes the selected card. Next
  advances strictly after the current applicable instruction, including when earlier steps remain
  pending. The final step never wraps; Next is disabled there, while Done can still complete it.
  Already completed/unresolved cards and unsaved/mismatched characters cannot use Done. Saved progress
  and character/chapter/version/build-scoped anchors survive refresh; old Follow history stays readable.
- Implementation/plans committed and pushed as `640091a`; sibling browser tests as `4f05376`.
  Passed 138 web unit tests, eight navigation tests included, lint/typecheck and the full clean-index
  `pnpm check`/formatting. Linux candidate passed dependency/web checks, build, formatting and all
  23 staged browser tests, including exact Elwynn step 51, final-step no-wrap, both editions,
  mobile map-focus advancement, unsaved guards, independent checkboxes, storage errors and WCAG.
- Activated `kfc-helper-leveling-workspace-20261004-r4`, overlaying only the eight changed reader
  source/test files onto the verified r3 baseline. Static/public contents were copied into the actual
  standalone root before startup; the staged icon-packaging omission was caught and corrected before
  activation. Archive, world evidence, protected environment and all worker/database state are unchanged.
  All 23 public HTTPS browser regressions and Leveling/Forever Trader/TBC Trader/maps/status/sitemap
  health checks passed. Helper retained PID `1542399`, planned restart count 70, post-check RSS 231 MiB;
  ingestion retained PID `1169337`, zero restarts, and guild/community PIDs were unchanged.

### Leveling publication and feedback release (2026-10-04)

- Committed and pushed Helper implementation `1811348`, bounded-validation fix `b89e0a3`, community
  navigation/tests `b2e8bab` and responsive navigation `7247a02`. Unrelated changes remain unstaged.
- Activated `kfc-helper-leveling-workspace-20261004-r3` after Linux lint/typecheck/tests/build/
  formatting and all 20 Chrome regressions against its private staged listener. The clean committed
  snapshot independently passed `pnpm check` and formatting. Deployment overlays the existing live
  research/catalog baseline; it does not remove those independently deployed features.
- Uploaded only authorized manifest members: 157 chapters, 22,604 steps, target 70205, parser
  `forever-guide-v2`, manifest SHA-256
  `43b8ce0a5286dadbaa89ea9b2d53e6ed328fca613ed5e33429151cf24c226fc5`. Repeated checksum/schema/
  identity/build/count validation on the server before activation. No raw source/account bundle
  was uploaded or committed.
- Provisioned world release `wow-classic-beta-70205-extractor-0.4.0-fb8e9cb7`, including normalized
  records, raw checksummed overlay tables and 3,386 verified PNGs. World snapshot/media now point
  to that exact-build immutable release and prefer artifact evidence; it remains review-only.
  No world database import or confirmed loot/source publication was performed.
- Initial public crawls passed browser assertions but crossed the 600 MiB PM2 guard. Heap limiting
  alone was insufficient: world validation opened all 3,386 tile checksum streams simultaneously.
  Bounded validation to batches of 16, preserving every checksum; its regression fails without the
  fix. Web-only `NODE_OPTIONS=--max-old-space-size=320` complements it; the process guard is unchanged.
  Final r3 passed all 20 public HTTPS tests and two complete sitemap/API crawls at PID `1535399`,
  restart count 69, with warmed RSS 392–413 MiB. Ingestion/guild PIDs and restart counts were unchanged.
- Community build `.next-release-leveling-20261004-r4` is live, with only the navigation/destination
  and 1280px responsive rule changed over its existing source baseline. Linux build and staged/live
  navigation checks at 360/768/1100/1281/1440px passed, plus local typecheck/lint and 312 tests.
- The subsequent Next step / Done follow-up is deployed as r4, recorded in the entry above.
- No database migration, addon/payment change, ingestion restart or guild-process restart.
  Rollback files, release provenance and verification are in
  `docs/forever-leveling-release-2026-10-04.md`.

### Persistent Leveling map/list workspace (2026-10-04; now deployed)

- Implemented section 10 in `docs/forever-leveling-experience-plan.md` for both imported and original
  readers: full-width viewport below the 72px primary header, desktop 60/40 persistent map/quest
  split, fixed quest toolbar and independently scrolling ordered cards. Removed page-to-map jumps.
  Chapter-only frame/footer overrides leave dashboards, reference-only pages and other tools intact.
- Shared workspace/card/selection components preserve instruction rendering, prerequisites, progress
  storage and calculator independence. Titles are real keyboard-operable selection buttons; row
  backgrounds also select, while checkboxes/Skip/details/Wowhead links do not. The native map canvas
  stays mounted when selecting another step in its zone. Missing media/location states remain explicit.
- Compact chapter/progress header and native Settings dialog contain class/XP/dungeon configuration
  and expanded evidence. Persistence errors stay visible; save-character and unresolved instructions
  remain reachable. Phones use a pinned top map with Split/Map/Quest list focus; switching modes
  preserves list scroll. Short wide windows retain side-by-side panes; reader-only overflow containment
  prevents outer-page scroll. Original `#planner` and source dependency anchors scroll the pane.
  Primary navigation now folds at 1050px and compact desktop link styles win the CSS cascade, so
  navigation/branding no longer clips at tablet widths. Accessible selection names include quest text.
- Fixed owner's reported Elwynn `#guide-source-step-0051` Follow bug: the initial implementation
  discarded the selected position and resumed at the first unchecked step. r3 repaired Follow/Resume
  using the current cursor, never completing earlier steps or wrapping back at the end. r4 replaces
  those controls with the explicit Next/Done actions recorded above. Current-step hash plus validated,
  character/chapter/version/build-scoped browser history restores the reading position across refresh.
  This changes no progress schema and adds no persistent account synchronization.
- Added navigation unit tests and sibling `tests/e2e/leveling-workspace.spec.ts`; adjusted existing
  archive regressions for Settings. Passed 136 web tests, Helper lint/strict typecheck/production build,
  community typecheck/targeted test lint, focused Prettier and both repository diff whitespace checks.
  All 20 Chrome/Playwright leveling regressions passed against a stable port-3001 production preview:
  exact Elwynn step 51, follow/finish/undo/hide/refresh, end-of-chapter no-wrap, fixed map bounds,
  row/button/checkbox/link/keyboard separation, focus scroll retention, Settings Escape/WCAG,
  calculator anchors, missing media, storage failures, all races and 360–1440px/short landscape layouts.
  Visually inspected desktop/mobile/landscape; actual 900px/1051px header bounds do not overflow.
  Restarted the local port-3000 development preview with the existing authorized archive and validated
  70205 map snapshot; all seven workspace browser regressions also passed there. The temporary
  port-3001 production preview was stopped. Next.js regenerated its normal dev-only next-env imports.
  Those were local verification results; publication is recorded in the release entry above.

### Leveling Wowhead links, completion checkboxes and zone maps (2026-10-04; now deployed)

- Integrated exact Forever Wowhead quest/item/described-spell links into both chapter readers,
  retaining internal quest/item library links. No external tooltip script, iframe or page scraping.
- Replaced the progress dropdown with a Finish step checkbox and separate Skip instead / Undo skip.
  Existing done/skipped saves, per-character/source/build isolation, hide-completed and calculator
  independence remain intact. Unresolved source-step completion stays disabled.
- Added `leveling-map-data.ts`, `leveling-maps.ts`, `leveling-zone-map.tsx`, shared step/link controls
  and route wiring. Native extracted map art, zone selection and location circles are integrated;
  map follows next pending step, or an explicit Show on map selection. Marker filtering respects
  the selected step's active directive conditions, not all hidden chapter variants.
- Re-extracted the installed build 70205 with world extractor 0.4.0, including WorldMapOverlayTile
  reveal art: 3,386 decoded PNGs, zero unavailable. Immutable 70124/0.3.0 artifacts remain untouched.
  All 157 imports resolve across 49 referenced zones: 37,902 guide positions, zero unprojectable,
  588 base / 871 reveal PNGs, no missing image or zone art; 41 zones have reveal overlays (cities can
  use complete base art). There are 31 step-associated exact-build client POI markers, not 31 quests.
- Verified installed RXP/HBD coordinate semantics: zone/instance is not a floor; swap source world
  axes before DB2 projection and require matching assignment world-map ID. Gold guide waypoints
  are not exact NPC/objective circles; blue client POI shapes/centres require exact-build evidence.
  Missing map configuration/media/data has an explicit state; the quest reader remains available.
- Local port-3000 preview now uses the validated 70205/0.4.0 world snapshot. Normal `pnpm dev` now
  selects extractor 0.4.0, so older unrevealed art is not silently reused. Zone overlays are loaded
  from checksummed raw/art/media records and match product/build; conditional or zero-size records
  are excluded. Native PNG dimensions and clip regions preserve edge padding without stretching.
  Numbered circles have dark contrast outlines; selecting a new step resets the manual zone choice.
  Server-rendered/cached image loading is checked after hydration, including browser refresh.
  Development provisions world/maps; production uses the existing world-snapshot/media environment variables.
  Full behavior and source/projection boundaries: `docs/forever-leveling-archive.md`.
  Verified: 130 web tests, Helper typecheck/lint/production build, .NET Release build and extraction/
  world checksum audit, 2 world-data / 39 leveling package tests, community typecheck/targeted lint,
  and 13 passing Chrome/Playwright regressions
  including real native/reveal PNG loading, coordinate circles,
  completion/undo/skip persistence, disabled unresolved checks, WCAG and 360–1440px layouts.
  Browser error checks caught and verified the fix for React SVG-title hydration (single-string
  title children). All artwork/coordinate coverage counts above are based on a separate full-import audit.
  Subsequently committed, pushed and deployed in the feedback release above; no database migration,
  addon or ingest change.

### Authorized full-source Leveling archive (2026-10-04; now deployed)

- Owner explicitly confirmed redistribution authorization for the decoded RestedXP collection.
  Imported all 157 variants (98 Alliance, 59 Horde): 22,604 source steps and 2,394 distinct quest IDs.
  Each guide and aggregate step count matches the reviewed inventory/verified decode summary.
- New `packages/leveling/src/guide-archive.ts` and `archive-cli.ts` preserve original order, quest
  actions/IDs, class/race/XP conditions, dependencies, controls, source lines and location space
  without executing Lua. Schema 1 / parser `forever-guide-v2`; target build 70205.
- Authorized artifacts are under `artifacts/leveling/archive`, ignored and provisioned separately:
  immutable source/parser-versioned chapter JSON, checksum manifest and detailed coverage audit.
  Import command: `pnpm --filter @wow-trader/leveling archive /Users/dimitarjilanov/Desktop/restedxp-analysis artifacts/leveling/archive --authorized`.
  The existing `pnpm dev` reads this archive automatically; no new runtime service or dependency.
- New server loader verifies authorization, manifest membership, size, checksums, schema, build,
  identity, version and counts. `LEVELING_ARCHIVE_ROOT` overrides the default artifact directory.
  Turbopack tracing is disabled for archive paths to avoid copying private maintainer files into builds.
- Integrated full readers into the existing wizard/dashboard, with bracket/class/rate/family filters,
  local character/version/build progress, quest/item links, inspectable source controls and manual
  game-state checks. Unknown conditions are separated from actionable steps; dungeons default off,
  and selecting one is a source alternative, not an optimized dungeon recommendation.
- All ten faction/race choices, including both Skyborne factions, have readable starters and
  available level-60 chapters. All 56 legal race/class profiles reach label endpoints 1/60; this
  is not continuous playtested coverage. Some Alliance Hunter labels have gaps at 13/14/40 and
  Undead at 11. The two existing dangling targets and Horde Skyborne continuation remain unresolved.
  Content above beta cap 30 carries a future-content warning.
- Original Westfall preview/calculator remains separately accessible with `?edition=kfc`.
  Its 31-step progress and legacy calculator saves are unchanged; old Westfall redirects select
  this edition while preserving the rest of the query/anchor intent. Imported prose does not
  inherit the original preview's Article authorship. Unreviewed variants remain noindex.
- Verification and reproduction/deployment boundaries: `docs/forever-leveling-archive.md`.
  Verified 39 leveling tests, 113 web tests, Helper/package typecheck and lint, clean production
  build, community typecheck/targeted lint/formatting and 11 Chrome/Playwright regressions. All
  157 active chapter checksums match. Browser checks include all ten race starters/endgame access,
  import progress, optional dungeons, WCAG, mobile overflow and old-edition/save isolation.
  Oversized multi-character history is refused before persistence so the prior readable save survives.
  No database migration, payment, addon, ingest restart, commit, push or external deployment.
  Live release references above remain unchanged. The previous UX-only snapshot below is historical.

### Dedicated Leveling experience (implemented locally 2026-10-04; not deployed)

- Owner rejected the Encyclopedia/calculator-first entry: **Forever Leveling** should be a major
  primary-navigation screen at `/forever/leveling`, with faction → race → Speed / Chill / Group →
  small compatible extracted level brackets → current ordered quest list.
- Added a direct community navigation link to the same Helper experience, not a duplicate
  wizard or a destination discoverable only under Addons & tools.
- Inspected navigation, Forever/leveling pages, route/math/state models, racial artwork export,
  world quest contracts and the private 157-guide inventory. Race/class/XP/ruleset conditions and
  overlapping alternatives require a catalog adapter; the extraction is not one complete public
  route. Dwarf/Gnome Westfall labels differ, and the reviewed Skyborne Horde continuation is missing.
- Setup stores pace separately from party size/readiness, explains mixed-starting-zone rendezvous,
  keeps At-level conservative for solo, and only considers earlier premade content with real gates
  and evidence. Zero recruitment delay does not mean zero travel, fivefold XP or automatic red quests.
- Added a read-only sanitized catalog adapter and 157 header records under `packages/leveling`.
  Evaluates faction/race/class/Forever/XP predicates without executing Lua. Unknown/ambiguous/missing
  continuations stop automatic selection; ordinary and Mage AoE families stay separate. The audit
  matches the private inventory, finds two dangling target names and no cycles. Horde Skyborne's
  conditional continuation also remains unknown. Provenance and audit command are in the experience plan.
- Added `apps/web/src/app/forever/leveling` and setup/provider/dashboard/reader components. The wizard
  restores drafts on Back/refresh. Desktop/mobile navigation, Forever's third product card and community
  `discord-website` navigation/tool links point to the new destination. Original Westfall has 31 readable
  steps; other brackets are metadata-only coverage screens, not republished private instructions.
- Step progress is character/chapter/version/build isolated in `kfc-leveling:characters:v1`; pace/party
  edits preserve it, another character does not inherit it. Validated shared profiles exclude progress
  and identity. Denied storage works in memory; corrupt saves are not silently replaced by browsing.
- Legacy directory and Westfall links redirect permanently, retaining query/anchor intent. Existing
  calculator saves remain intact and can be explicitly imported into a per-character comparison.
  Reader checkmarks do not change calculator XP. Canonicals, breadcrumbs, Article data and sitemap
  use the new destinations; unpublished or duplicate variants are noindex.
- First UX phase preserves current quest order. Mode-specific list optimization, ready-premade timing
  evidence, original/authorized full chapter content and runtime playthroughs remain the next phase.
- Local verification: 35 leveling tests and 110 web tests passed, along with Helper typecheck/lint/
  production build, community typecheck/targeted lint and 312 tests. Eight focused Playwright regressions
  passed for the browser flow, draft refresh, profile/save isolation, denied/corrupt storage, sharing,
  WCAG checks, icon decoding, 360–1440px layouts and metadata. No deployment, payment,
  database migration, addon change or ingest restart occurred. Live release references above are unchanged.

### Original leveling preview (2026-10-04)

- Added `packages/leveling` with original Alliance Westfall 13–15 route v0.1.0, selected Hall of
  Thanes branches, reviewed prerequisite graphs, a strict incremental XP/time calculator and a
  RestedXP compiler. No private account-derived guide content is distributed.
- Free Encyclopedia directory and Westfall planner include ordered instructions, coverage/evidence
  labels, local/shared plans, actionable branch steps, metadata and sitemap discovery. Community
  `/addons` links to the free preview without promising a released supporter addon.
- Per owner request, default visits use Wowhead's **At level**, raised by selected unfinished quest
  pickup requirements: Hall 14 → 15/16 for later bundles; Deadmines stays a later visit at 19. The
  calculator checks XP before entry, lost outdoor XP, catch-up, shared/completed work, preparation
  and the full return trip. Out-of-slice and unsupported-faction plans cannot be applied.
- Extracted current build-70205 `gametables/xp.txt`, `QuestV2` and `QuestXP` using the new .NET
  `leveling-evidence` command. Definitions/hash provenance is in the product plan. The XP curve is
  client evidence pending runtime confirmation; individual quest XP remains unknown rather than
  inferred from the difficulty table. Installed Journal pickup conflicts are disclosed.
- `pnpm leveling:addon` produces an ignored maintainer ZIP/manifest. A separate bounded manual
  observer records current curve and turn-in XP without scans or protected UI actions. Preview
  registration is build-locked to 70205 and requires installed RestedXP v4.11.14. It has not been
  installed or playtested in WoW. No payment, entitlement or migration is activated.
- First focused verification: 27 leveling regression tests, 105 web tests, Helper typecheck/lint/
  production build, community typecheck/targeted lint and 312 tests, .NET Release build, Lua
  observer mocks, generated Lua registration/build guards and reproducible ZIP hashes passed.
  Nineteen Playwright browser checks passed on desktop/mobile, covering level-14/15/16 bundles,
  Deadmines at 19, unknown rewards, faction/entry gates, the 50-minute scenario, exact selected steps,
  sharing/restoration and no horizontal overflow.
- Deployed free preview as Helper `kfc-helper-leveling-preview-20261004-r1` after the complete
  clean Linux workspace check, formatting and staged standalone checks. The community link is live
  in `.next-release-leveling-20261004-r1`; only its two listing source files changed and the previous
  copies are backed up under `.data/private/leveling-source-20261004-r1`. Both named web processes
  were reloaded; the ingest PID/restart count remained unchanged. No migration was needed.
- Live directory, guide, Trader, sitemap, community addons and health checks returned 200. Live
  Playwright confirmed level-15/16 bundle gates, canonical/OG metadata, no browser errors and no
  mobile overflow. Mac and Linux maintainer ZIPs have identical SHA-256
  `e819d885263e2d9c361ce1af7186f71033b70e92b3a05ff29cb0bc07c6bd9df7` (4,999 bytes).
- Next product work follows the dedicated Leveling experience plan above; build-70205 playthrough
  and runtime XP observations remain gates for speed claims and reviewed route expansion.
  RestedXP installation/playthrough and protected Revolut configuration/fulfillment are still pending;
  neither a paid guide nor complete beta/1–60 coverage is advertised.

### Developer bootstrap

- `pnpm desktop:dev` deliberately targets the production ingestion API at
  `https://helper.kfcguild.online`, overriding any previously saved localhost endpoint. Maintainer
  development uploads therefore require the separately revocable production collector token; the
  repository `.env` token remains local-only.

- `pnpm dev` is the single local entrypoint. It safely creates `.env`, installs locked dependencies,
  resolves/starts Docker, starts required infrastructure, migrates and builds, identifies the exact
  installed client plus hotfix, bootstraps a missing catalog through every audit gate, and finally
  runs the web server, ingestion API, and SavedVariables companion watcher.
- The same bootstrap queries distinct icon IDs from the exact published catalog, decodes BLP assets
  from CASC into immutable PNGs, records a build-specific manifest, and gives Next.js the media root.
  It is idempotent and does not require a separate image command.
- Bootstrap is idempotent: an exact published product/build/locale/hotfix/definitions tuple skips
  extraction and import. `pnpm dev:setup` performs the same preparation without long-running servers.
- The watcher receives the detected product directory and local ingestion configuration from the
  bootstrap. It discovers every account-wide `WowTraderCollector.lua`, waits for stable file size and
  modification time, uploads unseen scans sequentially, retries transient parse/upload failures, and
  relies on stable scan IDs plus API conflict checks for crash-safe idempotency.

### Catalog extraction and import

- A real `TACTSharp`/`DBCD` extractor opens the installed product, reads 36 recipe and item-library
  DB2 tables, applies `DBCache.bin`, and emits raw base/effective plus normalized gzip NDJSON
  artifacts atomically.
- Manifests pin product/build keys, locale, hotfix hash, definitions revision, extractor version,
  per-artifact counts, and SHA-256 checksums.
- Catalog snapshot schema v4 makes actual item level, item-library relationships, and deterministic
  consumable item transformations mandatory; v1-v3 snapshots must be re-extracted rather than
  silently importing incomplete rows. Snapshot keys,
  output directories, and developer-bootstrap reuse checks include the schema version.
- Normalization covers item scalar facts, ordered stats/damage/resistances/sockets/effects, item sets,
  class/race restrictions, class/subclass labels, unique-equipped categories, gems, enchantments,
  random properties/suffixes, and build-shipped bonus-tree definitions in addition to the recipe and
  profession graph. Raw `ItemDisenchantLoot` rows retain build-specific disenchant eligibility and
  required Enchanting skill brackets.
- Item-use transformations are normalized separately from profession recipes. A consumed single-use
  trigger item is included in the input quantity, so spell 28100 correctly records ten Motes of Air
  to one Primal Air rather than the nine additional spell reagents alone. Reusable/stateful item
  effects are not guessed into the material graph.
- The TypeScript catalog layer rechecks checksums/counts, path safety, duplicates, foreign keys, the
  TBC golden chain, and build-to-build topology changes.
- `catalog:audit` verifies every manifest-tracked raw and normalized artifact, proves source ID
  coverage, re-derives each normalized item field, and checks that the full source records survive in
  `rawRecord`.
- PostgreSQL import is transactional, chunked, idempotent, build-versioned, and gated behind explicit
  review/publish promotion. Initial availability is `client_only`.

### Auction House and market path

- The TBC addon listens to Auctionator `335` full-scan events and groups listing stacks into exact
  market-key price levels. Its slash command delegates scanning to Auctionator's normal permission
  check; no throttle bypass or HTTP exists in Lua.
- `WowTraderCollector` is installed in the local Anniversary client's `Interface/AddOns` directory.
  Its installed `Collector.lua` and TOC hashes match the repository sources. Auctionator is installed,
  declares interface `20506`, and loads the legacy AH full-scan implementation used by this client.
- The TypeScript companion parses SavedVariables without executing Lua, validates the collector
  schema, creates a canonical SHA-256 payload, uses stable retry IDs, requires TLS outside loopback,
  and tracks successful scans locally.
- The authenticated Fastify API stores immutable raw payloads and normalized scans/price levels with
  checksum verification, idempotency, conflict detection, rate limits, upload status, and public data
  status. Database constraints guard positive prices/quantities, valid time ranges, completeness, and
  catalog topology.
- The installed collector has now completed a real EU/Spineshatter Alliance scan on TBC build 69795.
  Companion parsing and upload succeeded for 12,225 market keys. PostgreSQL stored 58,581 aggregated
  price levels covering 7,050 base item IDs, 170,028 listings, and 1,022,041 listed units; the upload
  reached `processed` status and a repeat companion run correctly reported no pending scans.
- The canonical calculation source is the collector's depth-preserving copy of Auctionator's raw
  completed scan. Auctionator's own CBOR-serialized database keeps only last/daily low/high and peak
  availability for 21 days, so it may seed lower-confidence history but must not drive depth-sensitive
  opportunity calculations.
- Market analysis provides actionable depth summaries, rolling median/MAD, EWMA price/supply, an
  explicitly experimental range, and a walk-forward backtest against last-price error.
- Crafting economics consumes complete price levels and uses integer copper/fractions, AH cut,
  deposits, fill rate, cooldown opportunity cost, capital, ROI, and insufficient-depth states.

### Website

- `/` is the KFC Helper game chooser, followed by `/tbc` and `/forever` product choosers. The live
  workbench moved to `/tbc/trader`; the legacy `/opportunities` route follows it. Forever shows
  honest unavailable states until its public client catalog and compatible AH scan exist.
- The Helper shell now reuses the parent KFC site design system: the exact KFC mark, Cinzel/Inter/
  JetBrains Mono fonts, near-black and amber tokens, fixed 72px navigation, square controls,
  restrained guild-card ornaments, responsive mobile menu, and reciprocal guild link. The in-game
  item tooltip intentionally retains WoW styling inside that shell.
- The TBC workbench provides market selection, crafted-product-name search, profession tabs,
  AH/vendor/best-route tabs, profit/ROI sorting, and expandable calculation evidence. The old
  `/opportunities` surface redirects to this single source.
- Each collapsed opportunity summary is one keyboard-accessible link to its recipe detail, so any
  visible price/yield/profile cell can be clicked instead of only the recipe name. Its separate
  calculation disclosure still expands in place without navigating.
- `/tbc/encyclopedia` is a catalog-backed archive with unified item/recipe/profession name and exact
  ID search, type tabs, build/count provenance, item icons, bounded results, a complete profession
  directory, and namespaced item/recipe/profession details. TBC catalog and market queries are pinned
  to client product `wow_anniversary` so a later Forever publication cannot contaminate TBC routes.
- Encyclopedia item results expose an in-game-style stat tooltip on pointer hover and keyboard focus.
  One bounded batch hydration supplies all visible results rather than issuing a detail query per
  hovered item. Desktop placement measures the row, natural tooltip height, and available viewport
  space on hover/focus/scroll/resize, selects above or below, and caps height to the selected side;
  mobile remains a viewport-bounded bottom panel without horizontal overflow.
- Item detail pages render the same semantic tooltip from normalized client facts: quality, binding,
  unique rules, slot/type, damage/speed/derived DPS, armor/resistances, stats, sockets and bonuses,
  gems, durability, class/race/level/skill/ability/reputation requirements, use/equip effects, item
  sets, and flavor text. Unsupported runtime spell formulas remain explicit fallbacks. The former
  profession-role summary is now a `Loot info` phase boundary: source is `Pending verification` and
  drop chance is `Unknown` until the acquisition graph is implemented. A build-specific external
  link opens the matching TBC Wowhead item in a new tab so maintainers can inspect community source
  information without presenting it as locally verified evidence.
- The workbench supports Transmutation, Potion, and Elixir Master profiles for the verified TBC
  build, including specialization-uplift sorting, expected/possible yields, and separate base versus
  mastery profit. The current `1.20×` expected-output assumption is build-locked, versioned, and
  labeled provisional because proc probability is server-side and not present in client tables.
- Crafting profiles now change with the selected profession and cover the TBC Alchemy,
  Blacksmithing, Engineering, Leatherworking, and Tailoring branches. Build-locked recipe access
  rules hide specialist-only crafts unless the matching branch is selected; Tailoring specialty
  cloth uses its guaranteed doubled output, while Alchemy expected procs remain provisional.
- `Use alt-crafted materials` recursively compares AH purchase with deterministic cross-profession
  production and item-use conversion, aggregates shared raw demand before consuming order-book
  depth, always excludes time-gated crafts, and displays the raw purchases, ordered alt steps, batch
  leftovers, transfer count, direct-AH comparison, and savings. It warns when a cash-profitable final
  craft is
  unprofitable at direct intermediate AH values so the player can consider selling the intermediate.
- The account crafting profile is presented as one responsive settings workflow with accessible
  switches, clearly grouped specialization selectors, and a single recalculation action. The former
  mobile rule that hid every profile label/control has been removed.
- The Enchanted Leather golden path now uses Rugged Leather plus Lesser Eternal Essence and can feed
  Leatherworking/Tailoring chains. Its displayed skill requirement is corrected through an audited,
  build-specific override to Enchanting 250; the client `MinSkillLineRank=1` value is not treated as
  authoritative for this trainer recipe.
- Opportunity, item, and recipe views render build-native product icons with quality borders. Of
  3,165 distinct icon IDs referenced by the current catalog, 3,163 decode to PNG; two source assets
  are non-BLP and are explicitly recorded as unavailable placeholders.
- AH output quotes use a quantity-weighted p10 ask backed by at least three listings, while reagent
  cost consumes exact current order-book depth. Vendor exit is valued independently. Disenchant exit
  uses a build-locked static TBC distribution for green/blue/epic weapons and armor, exposes the
  required Enchanting skill, and is withheld unless every possible material has a supported live AH
  quote. Normal-price signals remain gated on history.
- Next.js routes also exist for items, recipes, professions, realm markets, a manual crafting
  calculator, and data status.
- Pages read published catalog builds and accepted scans; no demo/fake market data is used.
- Item pages show current depth, recent price history, and the conservative baseline only when enough
  scans exist. Recipe pages separate the exact direct game formula from a recursive,
  quantity-scaled material-provenance chain. Deterministic alternatives use explicit `OR` branches;
  acquisition leaves, cycles, depth limits, variable output, and time-gated methods have distinct
  states. Cooldown methods remain collapsed informational evidence and never affect profit totals.
- Empty, unavailable, and responsive mobile/desktop states are present.

### Item library and transformations

- Snapshot schema v4 plus migrations 0004-0005 normalize item-library facts and item transformations
  into build-versioned rows.
  The verified build contains 25,544 item stats, 4,518 damage rows, 12,907 armor/resistance rows,
  3,132 sockets, 17,481 item effects, 388 sets, 1,629 set members, 883 set effects, 2,044
  enchantments, 259 gem properties, and 3,162 random-enchantment rows.
- Item 32837 is the golden proof: extraction and rendering recover its 214-398 damage, 2.80 speed,
  +22 Agility, +29 Stamina, +21 Hit, Warrior/Rogue and level restrictions, set ID 699, item level 156,
  and equip-effect spell 15810. Its 109.3 DPS is derived exactly from the normalized damage and delay.
- The supplied in-game screenshot combines client facts with AtlasLoot, GearScore, GearQuipper, and
  AtlasBIStooltips output. The planned renderer keeps game facts, acquisition claims, and analysis
  annotations as separately versioned layers instead of flattening them into item data.
- The installed AtlasLoot source package has 3,952 TBC item keys and proves that Warglaive 32837 maps
  to Black Temple, Illidan Stormrage (NPC 22917), phase 3. Its separate drop-rate data has no
  Warglaive probability, so source and drop chance must remain separate claims. Only 2,514 of the
  catalog's unfiltered 19,244 non-zero-inventory-type rows intersect those AtlasLoot keys, confirming
  that AtlasLoot is a seed rather than a complete acquisition database.
- A direct CASC/DB2 probe of build 69795, including the current `DBCache.bin`, found zero base and
  effective rows in `JournalEncounterItem`, `JournalEncounter`, `JournalEncounterCreature`,
  `JournalInstance`, `JournalTier`, `JournalTierXInstance`, and `AdventureJournalItem`;
  `CollectableSourceEncounter` is not shipped. The client does retain map 564 as Black Temple and
  dungeon encounter 609 as Illidan Stormrage on map 564, but it contains no item-to-encounter edge.
  Therefore the client can validate the encounter/map backbone, not the Warglaive drop claim.
- The installed AtlasLoot source overlay explicitly maps items 32837 and 32838 to tuple `{25,9,1}`:
  Black Temple, the Illidan boss block, and source type `Loot`. The corresponding raid definition
  names Illidan Stormrage, records NPC 22917, and lists both items. Neither Warglaive nor NPC 22917
  has an entry in AtlasLoot's separate `droprate.lua`, so their source can be imported while their
  probability remains unknown.
- Stats alone can produce a labeled candidate ranking, not defensible BiS. Final BiS requires
  build-specific class/spec mechanics, rating caps, talents/rotations, procs, sets, legal whole-loadout
  optimization, encounter assumptions, and phase/acquisition filtering.
- `docs/list.txt` now supplies a reviewed validation corpus of 27 readable Wowhead TBC BiS guides:
  22 Phase 3 guides plus five earlier Warrior guides. Their pages expose item IDs, alternatives,
  source references, rationale, and usually complete gear-planner payloads, but they are not a
  complete or uniform formula source. Some defer mechanics to unlisted stats/gem/rotation guides,
  contain editorial template residue, or omit phase/spec combinations. Treat them as versioned
  comparison fixtures rather than production truth or republished authored content.
- The guide corpus confirms that the BiS input contract must include character race/talents/faction/
  professions, raid buffs and group support, target level/armor/type, encounter duration and attack
  profile, phase/source constraints, and an explicit objective. Results must support multiple goals
  such as threat versus mitigation or healer throughput versus sustain and explain cap/set/proc
  decisions rather than publishing one opaque per-slot score.
- `packages/bis` implements the game-agnostic optimizer foundation: exact build/spec applicability,
  eligibility and phase filtering, interchangeable slots, per-item and shared unique limits,
  two-handed slot blocking, set activation, conditional item effects, piecewise stat curves, hard
  minimums, deterministic exhaustive/beam search, diagnostics, and explanation/confidence output.
  An answer is `definitive` only when the model is validated, candidate/variant coverage is declared
  complete, the search is exhaustive, selected availability is verified, and no effect anywhere in
  the legal candidate frontier is unresolved. This prevents an unknown proc on an unselected item
  from producing a false BiS claim. The package contains no invented TBC or Forever weights;
  class/spec evaluators remain separately versioned inputs.
- The maintained MIT-licensed simulator reference is `wowsims/tbc-new` (HEAD observed during this
  research: `9fa04e0675354c1fa2167b83171bbfce5df492ef`). Its project requests a visible backlink when
  reused. The old `wowsims/tbc` repository explicitly says it is unmaintained. Neither is a runtime
  item-data authority for this product; a pinned simulator may be used as independent TBC model
  validation evidence.

## TBC proof result

Validated against `wow_anniversary` client `2.5.6.69795`, build `69795`, with hotfix SHA-256
`4d0fe6f994b4b2c6a84f9aa12a1bb1bcb1de4a6159d9f262842f8248beb96bb6` and WoWDBDefs revision
`e6828ce1a61ad05e9693e762fcfd39666454cc62`.

The snapshot contains 30,133 items, 28,695 spells, 10 professions, 2,166 recipes, 6,276 inputs,
2,166 outputs, 1,578 teaching links, 200 item transformations, 335 transformation inputs, and 200
transformation outputs. There were no encrypted records/sections. Eight ambiguous
client relationships are retained as warnings. Applying the hotfix changed ItemSparse from 30,132 to
30,133 effective rows.

The item coverage audit verified all 102 schema-v4 artifacts: 36 base/effective DB2 pairs and 30
normalized files, including 74 base/effective `ItemDisenchantLoot` rows. The client contains 30,145 unique structural
`Item` rows; 12 have no name or economic metadata in either `ItemSparse` or `ItemSearchName`. Every
one of the remaining 30,133 source IDs is normalized, with zero unexpected IDs, zero derived-field
mismatches, and zero raw-record preservation mismatches.

The rare chain `13486 -> 17563 -> (12808 x1) -> (7080 x1)` was recovered with Alchemy rank 275,
25-second craft time, and cooldown category 310 / 20-hour shared cooldown. Independent extraction
runs produced identical normalized artifact descriptors, and every gzip artifact passed integrity
testing.

## Verification completed

- Extractor Release build: zero warnings and zero errors.
- .NET snapshot validation: valid.
- TypeScript snapshot validation with `--tbc-golden`: valid.
- TypeScript full artifact and item-source audit: valid.
- Repeat extraction normalized descriptors: identical.
- Contracts, catalog, companion, economics, ingest API, and market unit tests: passing.
- Website strict typecheck, ESLint, and production build: passing.
- Full root `pnpm check` and `pnpm format:check`: passing after final integration.
- All PostgreSQL migrations applied to a disposable PostgreSQL 17 instance. The real TBC snapshot
  imported as `review_required`, promoted idempotently to `published`, and returned the exact expected
  counts and golden recipe row through SQL.
- A disposable AH fixture was accepted by the running Fastify service, an identical retry returned
  `duplicate: true`, and SQL retained one upload, one scan, and three price levels.
- The one-command developer bootstrap completed a clean local setup through real extraction, audit,
  validation, import, and publication. A repeat run skipped extraction/import for the exact matching
  build, and `pnpm dev` served API health, the home page, and recipe 17563 successfully.
- After the local hotfix cache changed, bootstrap detected the new SHA-256 instead of reusing the
  stale catalog, re-extracted and passed all 37 artifact/item audit plus golden validation gates, and
  published the new exact tuple. An immediate repeat reused it and finished without extraction.
- Bootstrap extracted 3,163 valid browser PNGs from 3,165 distinct client icon references, recorded
  both unavailable non-BLP references, and an immediate repeat reused the complete manifest without
  running extraction.
- The deployed addon completed its first live Auctionator scan. Its 6.9 MB SavedVariables file parsed
  successfully, the companion uploaded it, and the real Spineshatter market and opportunity routes
  both returned HTTP 200 against the normalized scan.
- The market workbench was rendered against that live scan and visually checked at desktop and mobile
  breakpoints. Best-route, Alchemy, vendor, disenchant, search, and ROI-filter requests returned HTTP
  200; the legacy opportunity route redirects to `/`. After the static disenchant integration, the
  current live data yields 626 best-route quotes, 617 AH quotes, 11 vendor quotes, and 23 profitable
  craft-to-disenchant quotes before search/profession filtering. The top 50 are rendered after
  filtering to bound response size.
- A fresh TBC extraction parsed all 74 `ItemDisenchantLoot` rows, normalized actual item level for
  30,133 items, and passed the 37-artifact source audit with zero derived-field or raw-record
  mismatches. The static probability model has exact rational expected yields and tests for armor,
  weapon, uncommon, rare, epic, skill, build, and unsupported-gap behavior.
- `pnpm dev:setup` recognized the snapshot-schema upgrade, extracted/audited/validated/imported and
  published v2 alongside the older row, reused the existing icon set, and then skipped extraction and
  import on an immediate repeat.
- The full root lint, strict typecheck, test suite, production build, and formatting check pass after
  the workbench implementation. Market tests cover robust p10 pricing, and workspace tests cover
  AH/vendor comparison, insufficient reagent depth, absent AH output, and thin-listing rejection.
- The full root `pnpm check` and `pnpm format:check` pass after account-network integration. The new
  tests cover recursive cross-profession acquisition, exact shared-leaf depth, buy-versus-craft,
  integer leftovers, missing intermediate listings, cooldown and known-recipe exclusion, reversible
  conversions/self-loops, specialist recipe locks, Tailoring guaranteed yield, prepriced final
  economics, and the audited Enchanted Leather skill requirement.
- The running workbench returned HTTP 200 with all five specialization families and account-network
  mode enabled against the live Spineshatter scan. It rendered Enchanted Leather as Enchanting 250,
  replaced it inside Leatherworking and Tailoring results, showed raw-leaf purchases and one
  cross-profession transfer, and completed the unfiltered live account-network request in about
  three seconds in the development server.
- The running production web build returned HTTP 200 without fallback errors for the home, recipe
  17563, item 7080, Alchemy, market, opportunities, data-status page, and data-status API routes.
- Companion auto-discovery found the real account-wide collector file under `_anniversary_`; inspect
  parsed its 12,225 markets, watch mode detected the single file, and an API replay was accepted as
  the existing stable payload rather than creating another market scan. A second watch start with the
  recorded local state made no upload. Companion lint, strict typecheck, seven tests, and production
  build pass.
- Playwright Chromium verified the account-profile workflow at 1440×1000 and 390×844: both switches
  are discoverable by accessible name, toggle by label and keyboard, all five specialization selects
  are visible, submitted values survive navigation, and neither viewport has horizontal overflow or
  clipped/collapsed profile controls.
- Playwright Chromium verified the KFC Helper root → TBC → Encyclopedia navigation, exact recipe ID
  17563 resolution, all ten profession entries, two explicit Forever readiness states, and zero
  horizontal overflow across the root, both product choosers, TBC Trader, and TBC Encyclopedia at
  390×844. All new routes and namespaced TBC detail pages returned HTTP 200 against the live catalog.
- A new schema-v3 extraction passed the 99-artifact audit and Warglaive golden validation, then
  imported and published 30,133 items plus every item child relation to PostgreSQL. The live
  Encyclopedia returns item 32837 with the exact client facts above. Playwright with Chromium
  verified its search-result tooltip on hover at 1440×1100 and keyboard focus at 390×844; both were
  fully inside the viewport with no horizontal overflow.
- Playwright Chromium verified the KFC-aligned desktop and mobile shell, responsive navigation, item
  16863 loot placeholder, and collision-aware Warglaive placement. At 1440×1100 the preview moved
  below a row at y=79 and above the same row at y=728, remaining fully within the viewport; at
  390×844 the focus preview stayed inside a 12px horizontal and bottom gutter. No browser console,
  hydration, or horizontal-overflow errors remained.
- Playwright Chromium verified that an opportunity ROI cell navigates through the full-row recipe
  link, the row exposes an accessible name and normal keyboard focus, and the adjacent calculation
  disclosure opens without navigation or browser console errors.
- The schema-v3 implementation passes the complete root lint, strict typecheck, 73-test suite,
  production build, and formatting gates. The .NET Release extractor build passes with zero warnings
  and errors, database migration 0004 applies idempotently, and the real snapshot recheck reports 99
  valid artifacts with no missing IDs, field mismatches, raw-record mismatches, or relationship
  issues.
- The schema-v4 extraction and migration add 200 deterministic item-use transformations with 335
  inputs and 200 outputs. The 102-artifact audit and TBC golden validation pass with zero missing
  normalized IDs, unexpected IDs, derived-field mismatches, raw-record mismatches, or relationship
  issues. The .NET extractor build passes with zero warnings and errors.
- The current root lint, strict typecheck, 79-test suite, and production build pass. Formatting also
  passes after the production-chain integration. Regression coverage includes direct/shared cooldown
  rejection, transformation eligibility without learned recipe IDs, integer quantity scaling,
  alternative producers, reversible-conversion cycle termination, and direct-versus-network cost.
- Headless Chromium verified recipe 41163 at desktop and 390px mobile widths. The page distinguishes
  the direct craft formula from recursive material provenance, renders deterministic Mote-to-Primal
  conversions and Heavy Knothide quantities, collapses cooldown and circular alternatives as
  informational evidence, and has no horizontal overflow at 390px.
- The new `@wow-trader/bis` catalog adapter converts published item rows into build-bound base gear
  variants with legal slots, exact static stats/resistances, weapon damage and speed, sockets, class
  and race masks, profession/proficiency/required-ability gates, unique limits, effects, sets, and
  evidence-backed availability. Unknown numeric stat families are preserved under stable keys rather
  than discarded. The current TBC loader declares candidate coverage partial because gems, enchants,
  acquisition phase, and mechanics effects are not yet a complete validated frontier.
- The TBC Encyclopedia home now places a 28-entry class/spec/role BiS directory directly below the
  ten professions. Every entry opens a real catalog-audit workspace showing class/level-filtered base
  candidates by slot and the publication gate; it does not mislabel item-level previews as calculated
  BiS. Client-only rows remain provisional.
- The product chooser now uses local TBC and official Forever logo art, the TBC/Forever tool choosers
  use in-game coin/book icons, and every Encyclopedia profession and BiS class card uses a local
  in-game icon. Asset provenance is recorded in `apps/web/public/wow-assets/README.md`; the UI has no
  runtime dependency on the source image hosts.
- Playwright Chrome screenshots verified the logo/tool chooser at 390px, the complete profession and
  BiS class directories at 390px and 1440px, and the catalog-backed Protection Warrior workspace at
  1440px. Every sampled local visual asset and the root, TBC chooser, Encyclopedia, and BiS workspace
  routes returned HTTP 200. The full root lint, strict typecheck, 95-test suite, production build,
  and formatting checks pass.

### Search discovery and live search

- `kfcguild.online` now presents WoW Forever as the guild's primary next chapter without erasing its
  earlier TBC progression history. The dedicated `/wow-forever` recruitment page uses only
  Blizzard-confirmed launch facts and leaves the final realm/faction undecided until they are
  verified.
- The guild site now has unique Forever-focused page titles and descriptions, apex canonicals,
  Open Graph and Twitter cards, a generated 1200x630 KFC share image, Organization/WebSite/WebPage/
  FAQ/breadcrumb structured data, a manifest, updated `robots.txt`, updated `llms.txt`, and a
  sitemap entry for the Forever landing page. The home H1 also identifies KFC semantically as a WoW
  Forever EU raiding community while retaining its established visual design.
- Nginx now redirects both HTTP hosts and the HTTPS `www.kfcguild.online` duplicate to the canonical
  `https://kfcguild.online` host in one hop. The previous Nginx configuration remains recoverable at
  `/etc/nginx/sites-available/kfcguild.online.before-seo-20260915`.
- Helper now has unique canonical metadata for its product pages and catalog-backed item, recipe,
  profession, BiS-candidate, and market pages. Legacy detail routes canonicalize to their namespaced
  TBC URLs. Filter/search result URLs and operational pages use `noindex, follow` so they do not
  compete with their stable landing pages.
- Helper publishes robots/manifest routes, WebSite/WebApplication and breadcrumb structured data,
  and a generated 1200x630 share image. Its database-backed sitemap currently contains 32,343
  canonical URLs: all 30,133 published TBC items, 2,166 recipes, ten professions, 28 BiS workspaces,
  static product pages, and the observed market route. At 6,044,655 bytes it remains within the
  single-sitemap search-engine limits; split sitemap indexes are required before it reaches 50,000
  URLs.
- Encyclopedia and Trader search are now debounced live searches. They update results and the
  shareable URL without a submit action, expose progress through an accessible live status, support
  Enter and Clear, and avoid the initial-hydration input reset race. Trader uses a 400ms debounce
  because each request evaluates market profitability; it also updates the market selector
  immediately and preserves profession, exit route, sort, specializations, and account
  crafting-network parameters. Trader search matches only crafted output names; recipe names,
  profession names, reagents, and numeric IDs cannot make an opportunity match.
- Automatic Next.js prefetch is disabled for Trader's computational profession/exit filters and its
  global navigation link. A browser request audit reduced an initial Trader view plus one live query
  from roughly 15 speculative profitability requests to one initial request and one requested query.
- Production Chrome verified both live-search flows at 390px with no console errors, missing item
  images, or horizontal overflow. It also parsed the guild Forever structured data at 390px and
  1440px, and public smoke checks confirmed the canonical metadata, 1200x630 PNGs, sitemap counts,
  and all three PM2 processes online. A separate throttled-JavaScript test delayed every Next.js
  bundle by three seconds and proved that text entered before hydration survives and triggers the
  correct live result URL in both tools.

### Trader product audit and target experience

- The `2026-09-16` production review found that Trader is a sound quote calculator but is not yet a
  safe action-ranking product. Production currently has only two complete Spineshatter scans, 38.8
  minutes apart, and the newest scan is roughly one day old. The UI still presents a green live dot,
  assumes a 100% output fill rate, charges no expected deposit loss, and ranks current asks as if
  they were realized sales.
- The first-ranked Dawnsteel Bracers example is supported by four listings at essentially the same
  2,486g ask in both scans, with no observed movement. It must therefore be labeled as a thin,
  speculative quote rather than a high-confidence 1,611g action. Three-listing support protects
  against a single listing but does not establish demand or sell-through.
- One observed public request returned about 501 KB with roughly 1.28 seconds to first byte; the
  alt-network variant returned about 648 KB with roughly 3.77 seconds to first byte. Collapsed rows
  currently ship their complete reagent/output/evidence payload, and every filter request reloads
  and evaluates the whole catalog. These are diagnostic samples, not percentile benchmarks, but
  they identify precomputation, caching, pagination, and lazy detail loading as immediate needs.
- The target flow is: validated fresh scan -> summarized market facts -> trust/eligibility gates ->
  personalized quantity and route -> addon shopping/crafting queue -> observed listing/sale outcome.
  Default results should be `Best for me`, based on known recipes, skills, specializations,
  inventory, capital, current stock, and explicit risk preference. The full speculative catalog
  remains available as a separate exploration mode.
- The ranking must separate freshness, price stability, market depth, sell evidence, and character
  eligibility instead of compressing unknown evidence into a profit number. Auction-House routes
  should rank by expected realized profit and capital time, with configurable conservative/balanced/
  speculative modes; vendor and disenchant exits remain deterministic fallbacks. Daily/shared
  cooldown crafts remain excluded.
- The near-term implementation order is: (1) truthful staleness and opportunity-confidence gates,
  contextual filter counts, product-first rows, lazy details, and scan/profile opportunity caches;
  (2) addon character profession/skill/specialization/known-recipe/inventory snapshots plus a paired
  account profile and an installable background watcher that detects a stable SavedVariables flush
  from any character, uploads unseen scan IDs, waits for processing, refreshes PostgreSQL summaries/
  opportunity caches, and signals the website automatically; (3) craft quantity, restock cap,
  capital budget, shopping list, per-alt steps, and addon queue export; (4) repeated 30-minute scans,
  retention aggregates, own auction sale/expiry observations, conservative sell-through estimates,
  alerts, and only backtest-qualified forecasts; (5) a portfolio optimizer for shared materials,
  leftovers, stock limits, and capital allocation. WoW still requires `/reload` or logout before the
  watcher can observe a completed in-memory scan.

### WoW Forever preview Encyclopedia

- The Talents Forever public evidence is now implemented as its own strict TypeScript package and
  PostgreSQL snapshot boundary. `external_data_source`, `external_data_snapshot`, and
  `external_data_publication` keep exact raw JSON, parsed data, supplemental spellbook-icon data,
  parser version, validation report, checksums, review state, and a single public pointer separate
  from canonical `game_build` facts.
- The reviewed local snapshot is source date `2026-09-15`, source payload SHA-256
  `ca6252f8171e519437c42118d03446585b2430cbdadaca2b84c3ceefe11f84c5`, and composite snapshot
  SHA-256 `f9922e4e878491421d418565ec368032749dafa4d70ca0b4823f50dd7dbcc213`. Validation reports 9
  classes, 27 trees, 470 talents, 71 prerequisites, 401 spellbook entries, 366 tooltip records, 40
  ordinary racials, 37 class abilities, 20 Legacy perks, and 40 changelog entries with no errors.
- `pnpm forever:inspect`, `forever:import`, `forever:publish`, and `forever:sync` provide allowlisted
  fetch, schema/semantic audit, review-first import, exact snapshot publication, and local asset
  synchronization. Browser and server render paths read only the published PostgreSQL snapshot; they
  never fetch or execute third-party source code.
- All 574 referenced icons and tree backgrounds are locally cached with SHA-256/byte manifests and
  zero missing assets. The asset route accepts only constrained icon/background keys, while the
  standalone verifier and production synchronization script reject missing, modified, duplicate, or
  unexpected image files before a shared media pointer changes.
- `/forever/encyclopedia` is live locally with all nine talent calculators, prerequisite connectors,
  level/tier/rank validation, legal removal, local saves, snapshot-bound sharing, uncertainty and
  Classic-comparison modes, responsive in-game-style tooltips, and touch action sheets. Spellbooks
  provide class/tab selection, pagination, training ranks, demo-versus-Classic evidence, page motion,
  and mobile sheets. Separate pages cover racials, class abilities, Legacy perks, source changelog,
  provenance/coverage, and the public `/api/v1/forever/preview.json` export.
- The visual implementation is original KFC React/CSS/SVG work. It uses a three-tree game-inspired
  workspace and responsive leather/parchment spellbook without copying Talents Forever application
  code, markup, analytics, branding, or runtime behavior. The repeated third-party attribution
  paragraph was removed from all feature pages on `2026-09-16`; a compact snapshot/version notice
  remains so users can still distinguish the pre-release evidence from client-verified data.
- Strict package and web lint/typecheck pass, 57 focused tests and the full 110-test root suite pass,
  and the full production build succeeds. Headless Chrome verified a 1440-pixel calculator,
  in-viewport keyboard tooltip, talent
  allocation from 0 to 1 point, a 398-pixel layout with no horizontal overflow, and a touch-emulated
  spell tooltip bottom sheet with its accessible close control.
- Root `pnpm dev` now reuses a matching published preview snapshot/complete manifest or initializes
  them once, then injects the absolute asset root before starting Next.js. Production requires a
  separately verified shared Forever asset release and `FOREVER_ASSET_ROOT`; it never runs this
  development bootstrap.
- Asset reuse now trusts a local file only when its bytes and SHA-256 still match the same-snapshot
  manifest. A regression test corrupts a cached icon and proves the next sync redownloads it instead
  of blessing the altered bytes.

### Production deployment

- The no-Docker Helper is live at `https://helper.kfcguild.online`. The KFC site remains in its
  existing named PM2 process (`kfc-website`, runtime ID 30 when verified). `kfc-helper-web` and
  `kfc-helper-ingest` are isolated named sibling processes in the `kfc` namespace; numeric PM2 IDs
  are not deployment contracts. Release `kfc-helper-product-search-20260916-r9` is active. It keeps
  the compact Forever snapshot notice from `r8` and limits Trader search to crafted output names.
- Nginx redirects HTTP to HTTPS, proxies UI traffic to loopback port 19210 and authenticated
  ingestion to loopback port 19211, keeps `/health` and `/docs` private, and rejects dotfile probes
  before they reach either application. ACME challenges remain explicitly available for certificate
  renewal. Both public KFC hosts reject recognizable non-Google crawlers at the edge; Googlebot
  remains allowed, with a six-request-per-minute per-address limit on the database-backed Helper,
  and normal browser traffic is not throttled. GPTBot had
  saturated the web process at about 91% CPU immediately after discovering the 32k-page sitemap;
  after edge rejection and a clean web restart, both Helper processes measured 0% CPU while public
  browser requests remained healthy. The active release also publishes a
  matching `robots.txt` disallow policy for cooperative non-search crawlers, and the guild site
  publishes the same policy. User-agent matching cannot identify a bot that deliberately impersonates
  a normal browser or Googlebot; server-side limits and dotfile blocking remain the fallback, while
  verified Google IP ranges or an edge bot-management service are later options if disguised or
  volumetric abuse appears. The Let's Encrypt certificate expires on 2026-12-14 and automatic
  renewal is configured.
- PostgreSQL 15 now contains the migrated `wow_trader` database and separate server-generated owner,
  read-only web, and limited ingestion roles. Secrets remain only in mode-0600 server environment
  files. The database has one published build with 30,133 items, two market scans, and 117,310 price
  levels. Game extraction, audits, catalog publication, and icon extraction remain local and use an
  SSH tunnel where direct database access is required.
- The current TBC catalog build and all 3,163 icon PNGs passed checksum validation before publication.
  Two real SavedVariables scans were accepted, and both local and public-HTTPS replays were detected
  as duplicates without adding rows. A custom-format PostgreSQL backup passed a complete disposable
  restore drill with matching counts.
- Migration `0006` and the exact reviewed Forever snapshot are live in production. A 7.8 MiB
  custom-format backup passed `pg_restore --list` before migration. The snapshot was first imported
  as `review_required`, then exact checksum `f9922e4e8784…cc213` was promoted; all 574 visual assets
  passed checksums both locally and on the server. The read-only web role has explicit access and the
  runtime uses only PostgreSQL plus the shared immutable asset release.
- The KFC desktop/mobile navigation now links to the Helper and treats the subdomain as first-party
  analytics traffic. KFC's own production build passed using tunneled server dependencies, only the
  named KFC process was restarted, and its root remained healthy with the Helper link present.
- Public root, chooser, Trader, TBC Encyclopedia search, Warglaive item, BiS workspace, Forever
  overview, every Forever reference surface sampled, all nine class routes, public preview export,
  and both icon families return HTTP 200; an unknown Forever class correctly returns 404 and public
  ingestion health/docs return 404. Headless Chrome verified the live desktop talent allocation and
  in-viewport tooltip plus the mobile spellbook touch sheet, with every sampled image decoded and no
  horizontal overflow. PM2 process 30 kept the same PID and remained online throughout activation.
- Production storage remains a hard scheduling gate. At roughly 16 MiB per full scan and 48 scans per
  day, current raw/full-depth retention would grow by about 0.75 GiB per day. Unattended 30-minute
  uploads are intentionally disabled until summary aggregation, tested coordinated retention,
  recurring backups, and disk/data-freshness alerts are implemented, or storage is expanded beyond
  200 GiB for the original 180-day full-depth goal.

### Trader trust/performance and watcher release (2026-09-16)

- The first trust release is implemented locally. Trader scan health now classifies scans as fresh
  (at most one hour), aging (one to three hours), or stale (over three hours); stale data is visibly
  reference-only instead of showing a green live indicator. AH exits are labeled speculative asks,
  disenchant routes modeled EV, and vendor exits deterministic, with stale-input qualifiers.
- Results are product-first, and profession/route counters now respect the active product query and
  profession. Collapsed result rows no longer embed their complete calculation payload. Opening
  `Show calculation and evidence` fetches the exact recipe/route/profile detail from a dedicated
  endpoint, retaining loading/error/retry states and cutting the initial RSC/HTML payload.
- Collector `0.2.0` adds optional source character name, realm, faction, and GUID without changing
  SavedVariables schema version 1, so queued `0.1.0` scans remain uploadable. Migration
  `0007_cloudy_magus.sql` adds nullable private provenance columns to `raw_upload`; public market
  status and recommendations never expose them.
- The companion now waits for a final `processed` upload status before writing its mode-0600 local
  completed-ID state. Failed parsing, transport, processing, and rejected receipts remain retryable
  under a bounded 5-second-to-5-minute exponential schedule. Status logs name the private source
  character when available.
- `pnpm companion:install:macos` builds and installs a per-user LaunchAgent using a protected API-key
  file, automatic start/restart, durable state, and logs outside the repository;
  `pnpm companion:uninstall:macos` removes the service while preserving identity/state against replay.
  The production installer is intentionally not activated until the documented 30-minute retention
  storage gate is implemented.
- An open Trader page polls a lightweight market-specific status endpoint every five seconds while
  visible/online and calls a server-component refresh when a newer processed scan arrives. If the
  rendered workspace does not catch up within four seconds, the page performs one hard reload; focus,
  page-show, and visibility changes also trigger an immediate check. The addon still cannot force WoW
  to flush: after Auctionator finishes, `/reload` or logout remains required.
- Remaining product phases are imported character professions/skills/specializations/known recipes/
  inventory, execution queues and addon export, retained observation summaries and sale/expiry
  evidence, risk-adjusted demand ranking, alerts/backtests, and portfolio allocation.
- The Electron implementation in `docs/desktop-companion-plan.md` is now working as unsigned
  maintainer-alpha macOS, Windows, and Linux x64 packages. `packages/companion-core` is shared by the
  CLI and Electron utility process and covers serialized multi-product polling, stable-write
  detection, processing receipts, cancellation, bounded retry, v1-to-v2 state migration, and
  restart-safe scan IDs.
- `apps/desktop` provides the local KFC-styled React dashboard, sandboxed custom-protocol renderer,
  validated narrow IPC, async `safeStorage`, automatic/manual upload controls, product/account/file
  health, verified collector `0.4.0` install/update, recent private activity, tray/close-to-tray,
  start-at-login, notifications, power-resume reconciliation, rotating redacted logs, single-instance
  focus, worker crash restart, and legacy LaunchAgent removal. The packaged runtime loaded its full
  renderer and narrow preload API, found the local Anniversary/Auctionator/collector installation,
  completed a manual IPC reconciliation, had zero horizontal overflow at the default viewport,
  remained alive after window close, and enforced one application instance.
- Public/guild distribution remains blocked on per-installation one-time pairing/revocation instead
  of a shared key, branded application/tray assets, macOS signing/notarization, Windows signed-package
  validation, clean-machine install/upgrade drills, and the existing production storage/retention
  gate. `pnpm desktop:dev`, `desktop:package`, and `desktop:make` are the maintained entrypoints.

### Forever world Encyclopedia implementation (2026-09-17)

- `world-snapshot-manifest.v1` and `map-media-manifest.v1` are implemented as separate,
  build-scoped contracts. The .NET extractor now reads maps, areas, UI-map assignments/art,
  overlays, POIs, taxi nodes, static game objects, encounters, LFG rows, structural quest data,
  quest POIs, and appearance source hints; it preserves raw/effective rows and emits deterministic,
  checksummed normalized artifacts.
- The real `wow_classic_beta` build `1.60.1.69893` extraction passed a full artifact and media audit:
  73 maps, 60 UI maps, 1,372 areas, 1,986 POIs, 341 encounters, 169 creature objectives, 60 bosses,
  76 boss locations, 175 boss spell candidates, 802 source candidates, 6,600 quest identities, 54
  quest POI blobs, 1,288 item source hints, and all 1,672 referenced map tiles decoded with zero
  missing tiles. The current immutable local manifest is under
  `artifacts/world-snapshots/wow_classic_beta/69893/enUS/missing-hotfix/world-snapshot-manifest.v1/extractor-0.2.3/`.
- Migration `0008_early_forge.sql` adds typed world snapshot, map/art/tile/assignment, area, POI,
  encounter, LFG, quest/line/POI, and item-source-hint tables. `packages/world-data` validates every
  checksum, imports transactionally against an exact matching catalog build, and refuses publication
  when the hotfix cache or published catalog prerequisite is missing.
- Migration `0009_fresh_tombstone.sql` adds typed creature-objective, boss, boss-location,
  creature-model, boss-spell-candidate, loot-source-candidate, map-difficulty, and content-tuning
  tables. The world importer now writes every enriched artifact transactionally instead of silently
  dropping evidence that was present in the manifest.
- Forever now has Maps, Zones, Instances, Encounters, and Quests navigation and routes. The map
  viewer composes native client tiles, transforms exact client POI/taxi coordinates through the map
  assignment, separates evidence labels, supplies keyboard/scroll/zoom/layer controls, and keeps a
  textual fallback. Instance/encounter/quest pages expose client identity and source hints without
  pretending that appearance provenance is a verified loot table.
- `pnpm dev` now discovers the installed Forever Beta product, reuses or extracts the exact current
  world snapshot, audits every record/tile, and supplies absolute manifest/media paths to Next.js.
  If the beta product is not installed it logs the skip and preserves the TBC development flow.
- Local HTTP and headless-Chrome checks passed for the overview, map directory, Durotar map, instance
  directory, quest index, and a native map-media response. Desktop and emulated-mobile rendering had
  no document-level horizontal overflow. The optimized Next.js build passed with the artifact source.
- Collector `0.4.0` is installed in the Forever Beta client. Diagnostics remain explicitly opt-in
  and local: encounter attempts/actors/loot, a build-pinned 100-ID quest capability sample, NPC
  sightings from target/mouseover/nameplates, loot-slot item/source GUID relationships, and an
  explicit build-pinned boss model resolver. NPC
  records distinguish a subject `unit_position` from an approximate `observer_position`, exclude
  players, deduplicate coordinate cells, and retain at most 5,000 sightings; loot observations are
  independently capped at 5,000 and unknown source types remain unknown. Feature-detected
  `ClosestUnitPosition` results are retained as raw, unverified coordinate evidence and cannot become
  exact pins before an in-game coordinate golden.
- The current companion intentionally ignores `worldDiagnostics`; ingestion, review, aggregation,
  and public promotion contracts are not implemented yet. A runtime observation is evidence that an
  event occurred, not a complete loot table or official drop rate.
- The exact operating procedure and next-build migration steps are in
  `docs/runbooks/forever-world-extraction.md`.

## Known limits and honest boundaries

- The live collector/Auctionator event contract is validated for the installed TBC client and
  Auctionator `335`. Only two real production snapshots exist so far, which is enough for current
  depth and one-craft quotes but not enough for baselines, anomaly signals, liquidity estimates, or
  forecasts.
- Current opportunities evaluate one final craft and deliberately label demand, deposit loss,
  cooldown shadow price, and actual fill probability as unmodeled when they are not observed. The
  account network is a catalog/profile simulation until actual character professions, known recipes,
  skills, inventory, and cooldown state are imported.
- Random-output crafts, Prospecting, and expected disenchant materials are not used as intermediate
  production sources. Time-gated recipes are unconditionally excluded from both ranked final crafts
  and intermediate routes. The current planner optimizes one
  final recipe at a time and does not yet optimize a portfolio that shares leftovers across several
  final crafts.
- The forecast is a baseline, not a promoted predictive model. It needs real scan history and must
  beat naive walk-forward results before stronger claims or alerts are enabled.
- Personalized known recipes/inventory, optional disenchant calibration observations, source/drop
  observations, mastery-proc observations, phase administration, alerts, and production
  auth/credential issuance remain later milestones.
- A WoW addon cannot upload over HTTP, and SavedVariables are current only after logout or `/reload`.
- Client spell text can contain runtime/server formula families the current deterministic resolver
  does not understand. The tooltip shows the client spell name for those cases instead of inventing
  numbers. Random-property, suffix, and bonus definitions are preserved and queryable, but a future
  character/item-instance payload is required to know which variant is actually attached to a
  player's item.
- Classic client files are not assumed to contain complete server loot tables. AtlasLoot is useful
  versioned supplemental evidence, but complete authoritative source/drop data requires an authorized
  feed or separately labeled maintainer/community evidence.
- Talents Forever is now imported through a separate immutable external-evidence pipeline and remains
  visibly labeled. Its own metadata says it was transcribed from BlizzCon demo footage and Blizzard
  slides and can lag the live game; only 187 of 470 talents are marked complete, and most demo spell
  observations have no numeric client ID. It must still be reconciled with the public Forever client
  before any observation becomes canonical. The aggregate `data.json` is the import source; the
  per-class feeds were a day behind and cached as immutable for one year.

### Forever Beta client audit

- The installed `/Applications/World of Warcraft/_classic_beta_/World of Warcraft Beta.app` resolves
  through the shared `/Applications/World of Warcraft/.build.info` to product `wow_classic_beta`,
  version `1.60.1.69893`, build 69893, locale `enUS`, and region `eu`.
- Current WoWDBDefs contains explicit layouts for this exact build. The existing extractor opened 34
  of its 36 TBC catalog tables; only `ItemRandomProperties` and `ItemRandomSuffix` were unavailable.
  Selected readable counts include 19,171 `ItemSparse` rows, 31,767 spells, 7,824 skill-line
  abilities, 3,338 reagent rows, and 42,449 spell-effect rows. The probe reported 4,525 encrypted
  records or encrypted-section records across those tables.
- A diagnostic normalization found 19,171 named items and 2,520 provisional recipes, proving the
  basic catalog graph is present. It is not publishable: the TBC fixed-field parser produced no
  item stats/damage/resistances/effects, 550 reagent/output references were unresolved, one DNT test
  profession surfaced, `ItemEffect` relationships need exact-build decoding, and no local
  `DBCache.bin` hotfix overlay was found.
- The Beta exposes 341 readable `DungeonEncounter` records and 73 maps, including recognizable new
  Forever map groups. Adventure Guide encounter, creature, section, item, and map-location tables
  currently contain zero rows. Static client data therefore supports an evidence-labeled encounter
  directory but not complete boss descriptions, loot tables, or phase availability.
- Creature/model asset tables are populated, including 14,092 creature displays and 1,169 creature
  model rows, but `DungeonEncounter` has no creature/display identifier and the 178 readable
  `Creature` rows are mostly pets/dummies. A deeper static audit found a better identity bridge:
  233 `Achievement`, 1,353 `Criteria`, and 1,951 `CriteriaTree` rows. Criteria type `0` stores an exact
  creature ID in `Asset`, verified by Onyxia -> `10184`. The relevant new/high criteria provide 69
  rows, 39 unique name/ID pairs, and 30 unique creature IDs, including complete Hyjal Summit and
  Barrow Deeps boss groups. Non-zero criterion types must never be interpreted as creature IDs.
- The exact Beta-generated model API exposes `PlayerModel:SetCreature(creatureID, displayID)`,
  `GetDisplayInfo()`, and `GetModelFileID()`. Collector `0.4.0` now contains the diagnostics-only
  capability test using a known creature, Onyxia, one new criteria-derived boss, and an invalid ID
  while standing anywhere in game. The remaining step is to run those controls. If the new boss
  resolves, its reviewed default model can be
  extracted without entering the instance; later encounter observations remain necessary for live
  availability, adds, alternate combat forms, coordinates, and loot. Models must never be guessed
  from names, nearby IDs, or anonymous asset filenames.
- World normalizer `0.2.3` now turns that research into build-scoped artifacts. Build 69893 audits
  cleanly with 169 type-0 creature objectives, 60 criteria-backed bosses (30 IDs at or above
  200,000), 76 evidence-labeled boss locations, 184 statically joined creature/display/model rows,
  175 review-required boss spell candidates, 802 review-required item source candidates, 142 map
  difficulties, and 98 content tunings. The final immutable local snapshot is under
  `artifacts/world-snapshots/wow_classic_beta/69893/enUS/missing-hotfix/world-snapshot-manifest.v1/extractor-0.2.3/`.
- The alias audit caught Blizzard criterion reuse: rows such as `City of Dalaran` and `Blackmaw
Hold` identify the dungeon/area context for the same creature criterion and are not boss aliases.
  They remain available for potential map/area associations but cannot generate boss spell or loot
  matches. Exact `AreaTable` context adds review-required potential zones for seven new/high bosses;
  only Shade of the Archmage, Rath'mael, and Relic Guardian currently have exact encounter-to-map
  edges. None of the 30 new/high bosses has a static creature-model join or an exact client source
  hint for loot in this build.
- The spell candidate graph finds 31 client spell candidates across seven of the 30 new/high bosses,
  including named mechanics for Anara Chillwind, Old Gloomlurker, The Wild King, Elder Minderel,
  Sylvestris Dusksong, and Umbrinoth. Every candidate remains review-required because name/text,
  effect-value, and modifier-tree relationships do not prove that a boss casts the spell live.
- Collector `0.4.0` is installed in the Beta client and packaged by the desktop installer. Its
  explicit `/wowtrader bossmodels controls` experiment tests Mechanical Squirrel, Onyxia, The Wild
  King, and an invalid ID; the build-pinned batch then queries the 30 reviewed IDs three times each.
  Results remain local SavedVariables evidence until the controls are run and the diagnostics upload
  contract exists.
- The migration requires a product-specific table profile, schema v5 availability/encryption
  evidence, budget-derived Forever item stats, decoded DB2 relationships, golden in-game tooltip and
  recipe checks, semantic encounter grouping, and explicit review/publish promotion. The complete
  ordered plan and publication gates are in `docs/forever-beta-extraction-plan.md`.
- The expanded world audit found 60 player-facing UI maps, 1,672 map-art tiles, 61 coordinate
  assignments, 1,081 exploration overlays, 372 client POIs, 100 taxi nodes, 1,514 static game-object
  placements, and 155,868 WMO minimap texture records. All 12 Mount Hyjal art tiles were opened from
  CASC and decoded as 256×256 images, proving the native browser-map pipeline.
- `LFGDungeons` has 71 readable and five encrypted entries, including City of Dalaran, Ruins of
  Lordaeron, Hall of Thanes, and Excavation Site: Wetlands. Classic LFG rows have zero `MapID`, so
  map/instance reconciliation must be reviewed; `DungeonEncounter.MapID` remains the stronger
  relationship.
- `CollectableSourceInfo` supplies 1,288 client-authored appearance source strings. Exactly 1,282
  join to item IDs through `ItemModifiedAppearance`, including 785 item IDs at or above 200,000.
  These become evidence-labeled source hints, not complete loot tables or drop rates.
- The exact Beta Lua API documentation exposes encounter start/end events, end-of-encounter creature
  IDs, exact encounter-to-item `ENCOUNTER_LOOT_RECEIVED` events, quest-to-item loot events, paced quest
  data requests, quest title/objective lookup, and exact map coordinate APIs. Runtime delivery
  semantics still require a controlled Beta dungeon and quest-scan test.

### Forever world UX audit and plan (2026-09-17)

- Desktop and 390 px rendered audits confirmed that the authentic client art and KFC visual language
  are strong, but the world experience remains a set of technical directories. The map and primary
  content sit too far below repeated hero/build/navigation chrome, the flat section navigation is
  crowded on mobile, and maps lack search, hierarchy, thumbnails, synchronized results, shareable
  state, touch-quality panning, and useful selected-feature details.
- Current data is sufficient for an excellent map-first shell: 60 UI maps with complete native art,
  61 assignments, 372 client POIs, 100 taxi nodes, 54 quest POI blobs for 22 quests, and 1,672 decoded
  tiles. The 1,514 static game objects currently have no trustworthy map ID and must not be placed
  until a reviewed coordinate-assignment relationship exists. All 76 boss locations are map-level;
  none is an exact point or UI-map pin.
- Raw world records are not yet user-facing canonical records. The current 341 encounter rows include
  difficulty variants, and the directory incorrectly derives dungeon/raid labels from `MapType`
  instead of `InstanceType` (for example, Blackfathom Deeps appears as a raid). Some criteria creature
  assets also carry dungeon-completion labels rather than a creature name. Correct canonical
  summaries and review overrides are now the first gate before visual aggregation.
- The proposed target plan is a connected World Explorer: grouped global search; two-level Character/
  World/Economy navigation; hierarchical map discovery with a “New in Forever” collection; a
  Leaflet `CRS.Simple` map-first split view; evidence-aware layers and mobile bottom sheet; connected
  instance, boss, quest, spell, item, and profession pages; and targeted cached read models instead
  of loading the complete world snapshot on every route.
- Map-only relationships never become pins. Candidate spells and appearance-source matches never
  become confirmed abilities or loot. Untitled quest IDs remain maintainer coverage until a server
  query or observation provides a verified public record. The detailed delivery order and acceptance
  gates are recorded in `docs/forever-encyclopedia-plan.md`.
- The client exposes 6,600 readable quest IDs plus 90 encrypted records, but static DB2 supplies only
  three named quest lines, 22 line memberships, and 54 POI blobs/99 points covering 22 unique quest
  IDs. Complete quest titles/text/rewards must come from paced server queries, quest observations,
  and build-scoped WDB cache parsing. Full architecture and acceptance gates are in
  `docs/forever-encyclopedia-plan.md`.

### Forever World Explorer implementation (2026-09-17)

- The plan is now implemented as a connected World Explorer. The encyclopedia has two-level
  Overview/Character/World/Changes navigation, a grouped map/instance/boss typeahead on its home
  page, searchable and filtered map/instance/boss directories, native map preview cards, and stable
  routes for boss identities.
- Map pages now use Leaflet `CRS.Simple` over the exact decoded client tiles. They provide zoom,
  reset, full-screen, keyboard/touch panning, place/flight/quest/boss layer controls, quest-region
  polygons, synchronized text results, selected-feature details, and shareable `focus` state. Exact
  coordinate evidence can become a pin; map/area-only boss relationships remain visibly separate
  and unpinned.
- Instance directories now use `Map.InstanceType`, exclude non-instance/deprecated world encounter
  records, and group repeated difficulty rows into 313 canonical encounters across 41 dungeon/raid
  maps. Instance pages expose difficulty/tuning facts, canonical order, all underlying variants,
  criteria-backed creature identities, and a strict separation between review-required appearance
  source matches and observed loot.
- Boss pages expose all 60 criteria-backed creature identities, including 30 Forever-range IDs,
  with identity provenance, encounter and location edges, possible spell evidence, model-resolution
  state, difficulty context, and 802 source-candidate edges across the world archive. Ambiguous
  dungeon-completion criteria render as `Creature <id>` plus context instead of becoming fake boss
  names.
- The sitemap includes the new collection and build-derived map, instance, and boss detail URLs.
  Published database world reads now share a 60-second promise cache; immutable artifact reads still
  use a process-lifetime promise. The current snapshot remains review-only and every page preserves
  that state.
- Browser checks against build 69893 confirmed native Mount Hyjal art, map previews, POIs, flight
  points, quest regions, and The Wild King evidence presentation. Web lint, strict typecheck, 57
  tests, and the Next.js production build pass.

### Forever World Explorer production release (2026-09-17)

- Commits through `3cf6be0` are pushed to `origin/main`. The immutable application release is
  `/home/wow-trader-system/releases/kfc-helper-world-explorer-3cf6be0`, and the server `current`
  symlink resolves to it.
- The audited build `1.60.1.69893` runtime bundle is stored independently at
  `/home/wow-trader-system/shared/world-snapshots/releases/wow-classic-beta-69893-extractor-0.2.3`.
  The snapshot remains visibly `review_required`; it is served through the artifact preference and
  was not inserted or promoted in `world_snapshot` because the exact hotfix is missing.
- Production migrations `0007` through `0009` were applied after a verified mode-0600 PostgreSQL
  custom backup at
  `/home/wow-trader-system/shared/backups/pre-world-explorer-bd1543a.dump` (SHA-256
  `8743e7aa14f57f62be258171e951bd58bf9c2ae3a49695b9800b203d01fa8561`). The migration journal now
  contains all ten entries, and the read-only web role can query the world tables.
- PM2 reloads only `kfc-helper-web` and `kfc-helper-ingest`; both passed loopback health checks and
  the process list was saved. Existing `kfc-website` process 30 was not restarted. The web process
  now runs the generated Next.js standalone server with explicitly packaged public/static assets.
- Public smoke tests passed for the TBC Trader and Encyclopedia, Forever Encyclopedia, Mount Hyjal
  map, The Wild King boss, instance detail, sitemap, a hashed JavaScript chunk, and a real immutable
  256×256 map PNG. `www.kfcguild.online` also remained healthy.

### Forever runtime boss evidence pipeline (2026-09-17)

- Collector `0.5.0` extends the opt-in diagnostics schema to version 4. It records bounded,
  deduplicated `UnitHealth`/`UnitHealthMax` measurements for target, mouseover, nameplate, and boss
  units. Each measurement retains creature ID, build metadata, level/classification, difficulty,
  group size, map context, trigger, current/max health, and timestamp; player units are excluded.
- The existing client model resolver, encounter attempts, encounter loot, loot-window source GUIDs,
  and NPC sightings now travel through a separate authenticated `world-diagnostics.v1` envelope.
  The companion derives a deterministic payload ID, uploads each evidence snapshot once after WoW
  flushes SavedVariables, and migrates local state to schema 3 without replaying prior AH scans.
- The ingestion API now exposes `POST /v1/uploads/world-diagnostics`, verifies the canonical payload
  checksum, archives the immutable raw envelope, and normalizes evidence into model, health,
  encounter/actor, loot, and NPC observation tables. Migration
  `0010_nebulous_tana_nile.sql` creates those additive tables and indexes.
- Forever boss pages query runtime evidence for the exact product/build and creature or connected
  encounter. They show client-resolved display/model file IDs, contextual health measurements,
  observed encounter attempts, exact loot-source/encounter item observations, and NPC location
  evidence. The interface explicitly states that one observed item is neither a complete loot table
  nor a drop-rate claim and that one health sample is not a universal value.
- Unit/parser/service/API regression tests cover deterministic diagnostics payloads and exactly-once
  companion upload behavior. Collector `0.5.0` is installed in the local Forever Beta client with
  matching verified hashes. This implementation is otherwise local only at this point: migration
  `0010` and the API/web release have not been deployed to production in this turn.

### Forever maximum-coverage expansion (2026-09-18)

- The installed Beta advanced to `wow_classic_beta` `1.60.1.69913`. Extractor `0.3.0` produced and
  audited a new immutable review snapshot with 73 maps, 60 UI maps, 1,672 decoded tiles, 341
  encounter rows, 60 criteria-backed boss identities, 6,600 structural quest IDs, 0 static quest
  objectives, and 1,288 appearance source hints. No `DBCache.bin` is available, so the snapshot
  remains `review_required`.
- Raw extraction now also preserves creature-display condition/event/extra/geoset/option tables,
  quest client tasks/objectives/package and reward-curve tables, and the Adventure Guide encounter
  family. Build 69913 confirms that `QuestV2CliTask`, `QuestObjective`, `QuestPackageItem`, and the
  selected Adventure Guide tables contain zero rows; the pipeline records that absence rather than
  manufacturing titles, objectives, models, abilities, or loot.
- Generated addon seeds now cover every audited quest ID and all 60 criteria-backed boss identities.
  Collector `0.6.0` diagnostics schema 5 adds an explicit resumable full quest scanner, a three-pass
  model resolver, observed unit display IDs, aggregated creature combat spells, quest lifecycle and
  dialog/reward evidence, and vendor stock/cost evidence. All collection is bounded, opt-in,
  build-pinned, combat-aware where active queries are involved, and stored in SavedVariables only.
  The checksum-verified six-file bundle is installed in the local `_classic_beta_` client.
- Collector `0.6.6` includes the Beta secret-value and empty-value compatibility hotfix. All unit,
  position, combat-log,
  loot-link, quest-structure, and model scalar values touched by the runtime diagnostics path now
  cross an `issecretvalue`/`canaccessvalue` guard before use. Protected hostile health and protected
  closest-position evidence are omitted instead of compared, transformed, or persisted; readable
  NPC identity, classification, model, and observer-location evidence remains independently usable.
- The first live build-69913 capability run validated the boundary behavior. Ten NPC sightings saved
  without an error while hostile health remained protected. All four `PlayerModel:SetCreature`
  controls timed out, so the no-instance model batch is disabled operationally for this build; models
  must come from observed unit display IDs or reviewed static evidence. The 100-ID quest sample
  produced 31 successful and 69 explicit failed responses with no quest timeout: all 31 successes
  had titles, 21 had objectives (33 rows, 31 non-empty texts), and none exposed quest-tag data. The
  flushed `0.6.1` file also revealed empty optional API strings; the `0.6.2` companion parser now
  normalizes legacy blanks to null and successfully builds a `world-diagnostics.v1` upload from the
  real file, while the addon omits new blanks at capture time.
- Live pause/reload testing exposed ambiguous quest-cursor behavior: a run reported near 660 before
  reload but the next flushed file held a restarted catalog checkpoint at 552. Collector `0.6.3`
  defines the cursor as the last completed request, never advances it for an in-flight request, and
  migrates the one possible legacy in-flight offset. `questscan resume` and `questsample resume` now
  require the exact saved mode/build/locale and preserve the cursor or refuse with an explicit
  reason; only `reset` can clear results and return to zero.
- A second live reload exposed that the legacy active mode could still be saved as `sample`; using
  `start` after the strict refusal then replaced the recovered catalog cursor, leaving a new live
  checkpoint at 202. Collector `0.6.5` now persists independent `catalogCursor` and `sampleCursor`
  values. Catalog resume selects its own checkpoint even if the legacy active-mode marker says
  sample, while build/locale/range validation remains strict. Its one-time legacy migration also
  recognizes any cursor beyond the 100-entry sample as catalog progress, protecting the checkpoint
  even if the previously loaded code writes the stale mode marker during the upgrade reload.
- Repeated reloads then changed the root `installationId` and produced a tiny backup file, proving
  that the failure was earlier than cursor restoration: registered unit/world events could invoke
  `InitializeSavedVariables` while `WOW_TRADER_SAVED` was still unavailable during addon loading,
  replacing the entire root table. Collector `0.6.6` gates every collection event until its own
  `ADDON_LOADED` handler initializes the restored SavedVariables table; `PLAYER_LOGIN` remains the
  later runtime-index and Auctionator registration phase.
- Contracts, companion parsing/deterministic upload, ingestion, and PostgreSQL tables now cover spell,
  quest-query/event, and vendor observations. Boss pages show observed spells; quest directory/detail
  pages combine structural IDs with client-query or observed titles and facts. Migrations `0011` and
  `0012` add the runtime evidence tables and static quest task/objective schema.
- The complete source hierarchy, current coverage, no-instance collection run, separate item/recipe
  catalog track, release gates, and irreducible server-only limits are in
  `docs/forever-max-coverage-plan.md`. Focused contracts, world-data, companion-core, desktop,
  ingestion API, and web tests pass; extractor `0.3.0` builds without warnings and the build-69913
  artifact audit passes. Local migration execution is pending only because PostgreSQL was not
  running on `localhost:5432` during verification.

### Forever Beta addon load audit (2026-09-26)

- The installed Beta is now `wow_classic_beta` `1.60.1.70009`. Collector `0.6.6` loaded and wrote a
  valid build-70009 SavedVariables snapshot on September 25, proving that the current `16001` TOC and
  Lua bundle are accepted by the client. The source and installed six-file bundles remain
  byte-identical to the trusted manifest and parse as Lua 5.1.
- The current load failure is configuration, not code: every Beta character's `AddOns.txt` records
  `WowTraderCollector: disabled`. No matching Lua load error appears in the current client logs.
  Re-enable it through the character-select AddOns panel or Blizzard's built-in `/enableaddons`
  command, which reloads the UI. Do not resume the build-69913 quest/model seeds on build 70009;
  extract/audit the new build and regenerate build-pinned seeds first.

### Market-only collector decision (2026-09-26)

- Collector `0.7.0` disables the unstable world-diagnostics path and keeps only Auctionator market
  scan capture. It registers no encounter, quest, NPC/nameplate, combat, loot, health, vendor, or
  model events. The inactive diagnostics implementation was removed from the runtime `Collector.lua`
  rather than only hidden behind a feature flag; retired diagnostic slash commands explicitly report
  that they are unavailable.
- The packaged addon and desktop install manifest now contain only `Collector.lua` and
  `WowTraderCollector.toc`. The quest/boss seed source files remain in the repository for historical
  extraction work but are not loaded or installed. Existing `worldDiagnostics` SavedVariables are
  preserved and forced off so this change does not destroy previously collected evidence.
- The Beta AddOns folder currently has no Auctionator installation. The market-only collector can
  load there, but capturing a market scan still requires a Beta-compatible, enabled Auctionator; the
  collector deliberately continues to use Auctionator's protected full-scan permission flow.
- The verified two-file `0.7.0` build is installed in the live `_classic_beta_` AddOns directory.
  The previous six-file `0.6.6` install was moved intact to
  `_classic_beta_/WowTraderCollector-pre-0.7.0`, outside `Interface/AddOns`, so it cannot load but can
  be recovered if needed. WoW was running during installation, so `/reload` or a client restart is
  required before the new runtime code takes effect. The active `70` realm character profiles have
  the collector enabled; the older `Classic Beta PvP` profiles still record it as disabled.

### Forever native Auction House scanner research (2026-09-26)

- Auctionator is not the only technical route. Forever `1.60.1` exposes Blizzard's modern
  `C_AuctionHouse.ReplicateItems` surface, a complete-market response event, zero-based result count,
  item-info, and item-link calls. The documented successful-call throttle is approximately 15
  minutes, so the intended 30-minute cadence is compatible while a player is online at an open AH.
- Auctionator `339` is now officially published for the Forever flavor, contrary to the earlier
  assumption that no Forever build exists. It can be used for a short integration check, but the
  recommended product direction is an original Blizzard-API provider so the collector owns its
  quality evidence and does not rely on another addon's internal event contract.
- Do not extract or adapt Auctionator source: the local package is All Rights Reserved and expressly
  forbids use as an implementation reference. The native scanner must be clean-room code based on
  Blizzard's public runtime API, validated against the exact client build.
- The architecture, defensive state machine, chunked cache resolution, quality schema, desktop UX,
  live gates, and remaining Blizzard boundaries are specified in
  `docs/forever-native-ah-scanner-plan.md`. The first implementation step is a read-only runtime
  capability probe; no query signature or market scope is assumed solely from the interface number.
- The companion/ingestion/price-depth pipeline can remain intact. Required extensions are optional
  scan provider and quality counters, incomplete-scan promotion gates, nullable collector item links,
  and product-specific desktop scanner health. Offline AH scanning and automatic SavedVariables
  flushing remain impossible; `/reload` or logout is still required for upload visibility.

### Forever native Auction House scanner implementation (2026-09-26)

- Collector `0.8.0` now has an original native Forever provider built only against Blizzard's
  `C_AuctionHouse` replication surface. It requires no Auctionator on the 1.60 client. TBC retains
  its existing Auctionator integration. The addon's runtime remains a two-file, market-only bundle
  with no quest, NPC, health, combat, loot, vendor, or model event registration.
- `/wowtrader probe`, `scan`, `status`, and `cancel` expose the controlled workflow. Native scans
  require an open Auction House and ready throttle queue, read zero-based rows in bounded per-frame
  chunks, retry uncached rows for up to 60 seconds, reject secret/inaccessible values before using
  them, abort without saving if the Auction House closes, and enforce a 15-minute local cooldown only
  after a successful non-empty snapshot.
- New SavedVariables/upload evidence records provider/API flavor, market-key version, reported,
  visited, priced, bid-only, unresolved, invalid, and secret row counts, total duration, and whether
  the Auction House remained open. Old `auction-scan.v1` payloads remain parseable; their row counts
  are derived from stored price-level listing counts.
- Migration `0013_superb_magneto.sql` adds typed quality evidence and promotion state to
  `market_scan`. Ingestion archives every valid upload but marks scans below 98% complete,
  inconsistent, empty, closed mid-scan, unsupported, missing mandatory native evidence, or below 25%
  of the latest accepted row-count baseline as not promotable. Trader, history, freshness, and public
  status queries now read only accepted scans.
- The desktop companion reports `Native Forever scanner included` independently of Auctionator and
  keeps Auctionator health only for TBC. Its trusted installer manifest is updated to collector
  `0.8.0`; both add-on files are still verified by SHA-256 before the atomic install.
- Automated contract, parser/upload, promotion-policy, installer, lint, typecheck, and build checks
  cover the new path. The remaining proof is one live build-70009 scan with Auctionator absent,
  followed by `/reload`, watcher upload, and comparison of sampled prices with the Blizzard UI.
- The verified `0.8.0` two-file bundle is installed in
  `_classic_beta_/Interface/AddOns/WowTraderCollector`; its source, installer manifest, and installed
  SHA-256 hashes match. The game was not running during replacement. The previous `0.7.0` directory
  is recoverable at `_classic_beta_/WowTraderCollector-pre-0.8.0`.

### In-game market console (2026-09-26)

- Collector `0.9.0` adds a separate `UI.lua` presentation layer over the scanner's existing guarded
  control functions. `/wowtrader` and `/wowtrader ui` toggle the console; an independent `WoW Trader`
  launcher appears beside the Auction House while it is open. Existing `probe`, `scan`, `status`, and
  `cancel` commands remain available.
- The Dungeon Journal-inspired console uses a dark framed layout with provider/build identity,
  provider/Auction House/throttle/queue health, current state, progress, cooldown, market/row/priced/
  bid-only/issue counters, six recent saved scans, and Scan, Cancel, Probe, and Save & Reload actions.
  Disabled states are derived from the same native/Auctionator state machine, so the UI cannot bypass
  combat, cooldown, Auction House, provider, or active-scan guards.
- The interface creates only addon-owned frames and calls public scanner functions; it does not hook
  or replace Blizzard Auction House controls. `UISpecialFrames` provides Escape-to-close, the title
  bar is draggable and clamped to screen, and the Auction House launcher only opens the panel.
- The desktop install manifest now verifies the three runtime files and recognizes collector
  `0.9.0`. Lua 5.1 parsing, installer coverage, and a live build-70009 visual/interaction pass remain
  the release gates before the UI is considered in-game verified.
- The verified three-file `0.9.0` bundle is installed in the live `_classic_beta_` AddOns directory;
  source, manifest, and installed SHA-256 hashes match. The Beta client was running during the
  replacement, so `/reload` is required before the new code appears. The previous `0.8.0` bundle is
  recoverable at `_classic_beta_/WowTraderCollector-pre-0.9.0`.

### Minimap launcher (2026-09-26)

- Collector `0.9.1` adds a conventional `LibDBIcon10_WowTraderCollector` minimap launcher using the
  addon's coin artwork. Left-click toggles the scanner console, drag stores the launcher's angle in
  the existing account-wide SavedVariables, and right-click hides it.
- `/wowtrader minimap` restores a hidden launcher. The button is an addon-owned frame attached to the
  minimap and does not hook or replace Blizzard UI functions.
- The verified `0.9.1` three-file bundle is installed in the live `_classic_beta_` AddOns directory,
  with matching source/install SHA-256 hashes. The running Beta client requires `/reload` before the
  launcher appears. The replaced `0.9.0` bundle is preserved at
  `_classic_beta_/WowTraderCollector-pre-0.9.1`.

### First Forever market upload (2026-09-26)

- The first native Forever scan (`010fb4c8-8bd1-4ca8-ae01-606fd5a05371`) was flushed from build
  `70009`, validated locally, uploaded through the paired desktop companion, and reported as
  processed by production. It contains 68,640 reported/visited rows, 68,635 priced rows, five
  bid-only rows, zero unresolved/invalid/secret rows, and 2,239 compacted markets at 100%
  completeness.
- The live SavedVariables file exposed a parser compatibility edge: WoW serialized the retired empty
  `worldDiagnostics.questQueries` map as `{}`, which the generic Lua decoder represents as an empty
  array. The diagnostics boundary now normalizes only an empty array at that record field to an empty
  object; non-empty or malformed values still pass through strict validation. A regression test
  covers the exact shape.
- Production ingestion is working, but the public product surface is not yet wired to the new data:
  `/forever/trader` returns 404 and the market-status endpoint still filters to the TBC product. The
  next Forever Trader release must add product-aware status/market routes and decide how to present
  prices before a matching published build-70009 item/recipe catalog is available.

### Installed macOS companion (2026-09-26)

- A current x64 maintainer build is installed and running at
  `/Applications/WoW Trader Companion.app`. Its application icon is a centered square crop of the
  same `forever-logo.jpg` used by the Helper game selector; Forge packages the generated native ICNS
  instead of Electron's default artwork.
- The persistent app profile targets `https://helper.kfcguild.online`, has automatic uploads and
  login startup enabled, and watches both `/Applications/World of Warcraft/_anniversary_` and
  `/Applications/World of Warcraft/_classic_beta_`. The private token remains OS-encrypted in the
  existing mode-0600 credential file; prior upload state and activity history were preserved.
- Collector `0.9.1` is installed in both configured clients. The TBC installation retains its
  required Auctionator dependency, and its replaced `0.2.0` collector is recoverable at
  `_anniversary_/WowTraderCollector-pre-0.9.1`.
- This is still an unsigned, non-notarized maintainer-alpha application. Two superseded local app
  bundles were moved to Trash during the icon replacement and remain recoverable there.

### Forever Trader and Collector distribution (2026-09-27)

- Production release `kfc-helper-forever-wowhead-links-20260927-r3` is active at
  `helper.kfcguild.online`. PM2 reports `kfc-helper-web`, `kfc-helper-ingest`, and the independent
  `kfc-website` process online; the guild website process and working directory were not changed.
- `/forever/trader` now uses the same search-first market workspace as TBC while remaining isolated
  to client product `wow_classic_beta`. `/forever/markets/UNKNOWN/ClassicBetaPvP` exposes the raw
  market, and the market-status endpoint accepts an allowlisted product instead of silently using
  TBC. TBC routes remain pinned to `wow_anniversary`.
- Exact Forever build `1.60.1.70009` with hotfix hash `3415e1da5ce1…a4f6` is published as build ID
  `e126ffe7-f1d3-413a-9e16-6da2c698c55e`. The audited snapshot contains 23,578 player-facing items,
  12 professions, 31,703 spells, 2,239 recipes, 7,448 reagent edges, and 2,239 outputs. The hidden
  `Test Profession [DNT]` and its recipe are excluded before normalization.
- Extraction intentionally omits 418 recipes whose encrypted/unavailable reagent or item-output
  records cannot form valid relationships. The rejected diagnostic bundle and the pre-profession-
  filter bundle remain preserved locally beside the published artifact. Audit and relationship
  validation pass; 8,240 source item IDs have no usable localized name and therefore cannot become
  player-facing rows.
- The first Forever scan was backfilled from retained SavedVariables evidence after migration
  `0013`: provider `blizzard_replicate`, API flavor `c_auction_house_replicate`, 68,640 reported and
  visited rows, 68,635 priced rows, five bid-only rows, zero unresolved/invalid/secret rows, 25,330
  ms duration, and accepted quality. Before publication, 405 non-cooldown recipes had both complete
  live reagent pricing and a priced output; the live default workspace currently ranks 164
  profitable quotes and shows 50 at once.
- Forever item icons are a separate immutable release with 2,945 verified PNGs. File-data ID
  `132274` proved that a numeric ID can have different bytes in TBC and Forever, so the icon route is
  explicitly product-aware and the two products do not share a flat media directory.
- `/forever/addon` promotes Companion `0.2.0` and exposes a stable release manifest plus resumable
  byte-range download. The current macOS Intel DMG is 134,722,664 bytes with SHA-256
  `44c6264d5149126dda09e632ed41453a446d9f056aa5db5db83807231f036b16`; server-side size/hash and a
  public 100-byte range response were verified. It opens either Forever or TBC Trader and packages
  collector `0.9.1`.
- At the `0.2.0` release point, distribution was visibly labeled `Maintainer alpha`: the DMG was
  unsigned, macOS Intel-only, and required a private collector token. Public per-installation
  pairing/revocation, signing, notarization, Apple Silicon, and Windows packages were still release
  gates.
- The production backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-forever-trader-20260927.dump` passed
  `pg_restore --list` before migrations `0010`–`0013`. Local and clean server runs of lint,
  typecheck, all tests, build, and formatting passed; the download page also passed a 390px browser
  emulation with no horizontal overflow.
- The published Forever catalog is sufficient for item names, icons, vendor values, and profession
  recipe economics. It still has zero normalized item-stat, damage, resistance, socket, item-effect,
  teaching-item, and transformation rows. Forever specialization behavior is therefore not inferred
  from TBC. Forever Trader product rows, purchased reagents, crafted intermediates, and valued
  outputs link by item ID to Wowhead's dedicated Forever database in a new tab; they do not link to
  unfinished local item/recipe detail pages, and Wowhead remains an external community reference.

### Actionable Trader workspace (2026-09-27)

- Production release `kfc-helper-actionable-trader-20260927-r5` is active. PM2 web and ingestion
  processes are online from the new immutable release; the independent `kfc-website` process was
  not changed.
- Rankings now default to total executable profit rather than one-craft profit. Each quote consumes
  the actual reagent order-book depth, tests up to 100 crafts, stops before deeper reagent prices
  destroy total profit, and shows recommended crafts, priced depth, capital, total profit,
  profit-per-craft, ROI, and the AH break-even unit price. Vendor scaling explicitly applies no AH
  cut; a regression test covers that boundary.
- Results are paginated at 50 rows. Forever rows expand in place and expose explicit item and recipe
  Wowhead links; TBC preserves its internal recipe navigation. Product-name search also provides a
  catalog-backed browser suggestion list. The Forever market selector consistently renders the
  otherwise unknown beta region as `Forever Beta`.
- Historical output-price signals are build-, product-, realm-, faction-, and item-scoped. They use
  accepted scans only, a six-observation activation gate, a maximum 48-scan robust window, and show
  current/reference/range/direction/confidence only after the gate. Production currently reports
  `Collecting 2/6`; no buy/hold/sell claim is invented before four more independent scans arrive.
- Expanded quotes can be saved into a versioned, per-product/per-market browser-local crafting plan.
  The dock combines raw shopping quantities and deterministic alt-crafting steps, preserves the
  exact source scan timestamp, supports removal/clear/copy, and labels capital/profit as combined
  standalone quotes. It does not claim shared-depth portfolio optimization.
- The advanced alt/specialization profile is now collapsed unless custom rules are active, bringing
  ranked results above the fold. It remains visibly simulated because the current collector does
  not upload character profession ranks, known recipes, specialization spells, inventories, or
  capital constraints.
- A bounded 30-second in-process workspace cache deduplicates concurrent and repeated identical
  calculations. Immutable catalog/order-book source rows are also cached by exact build and scan ID
  with a four-snapshot LRU bound; a newly accepted scan necessarily uses a new key. Live verification
  measured repeated TBC searches at about 0.7 seconds to first byte and Forever searches below one
  second, while a brand-new TBC query still spends about 3.7 seconds evaluating the large recipe
  graph and remains the next performance target.
- Clean local and server runs of lint, strict typecheck, every test suite, production build, and
  formatting passed. Live CDP emulation at 390 px verified `clientWidth === scrollWidth === 390`, 50
  expandable rows, detail loading, the `Collecting 2/6` evidence state, and local plan persistence.
- Remaining market-model boundaries are deliberate: output demand, sell-through, deposits, expired
  listing loss, and shared portfolio depth are not modeled; executable sizing is capped at 100; and
  saved plans are browser-local snapshots rather than synced account state.

### Durable market intelligence and in-game signals (2026-09-27)

- Migration `0014_productive_praxagora.sql` adds compact per-scan item observations and the latest
  exact-market signal table. Existing retained price levels are backfilled; accepted uploads refresh
  signals by client product, build, region, realm, Auction House, and item. Half-hour buckets prevent
  repeated scans in one interval from inflating evidence.
- Model `robust-market-signal-v1` waits for six independent observations, uses a median and median
  absolute-deviation price band plus current supply breadth, and distinguishes bargain, normal,
  rising, spike risk, oversupplied, falling, and too-thin conditions. It stores no inferred sales:
  all evidence is explicitly labeled as asking-price history.
- Trader details now chart recent price observations and their normal band, explain output and input
  risk, and label margin quality. Profit subtracts the successful-sale cut from gross output value:
  5% on faction Auction Houses, 15% on neutral Auction Houses, and 0% for vendor exits. Listing
  deposits and expiry loss remain deliberately unmodeled until listing duration and sell-through
  evidence exist.
- Price-history charts now provide unit-ask, net-output, and indicative-profit modes; 30-minute,
  24-hour, 7-day, and 30-day windows; true timestamp spacing; explicit missing-scan gaps; a robust
  normal band; and a separate listed-supply panel. The period summary reports low, median, high,
  movement, current deviation from median, raw direction, supply change, and valued evidence.
- Each observation card shows compact gold values (for example, `0.606g`), gross output, the exact AH
  fee, net output, matching-scan reagent cost, profit, normal-price deviation when unlocked, listed
  quantity, listing count, and UTC timestamp. Points are keyboard-focusable and can be pinned by
  click or mobile tap. `formatCompactGold` uses integer rounding so copper values do not lose
  precision while being converted for display.
- Historical craft economics use same-scan p10 asks and exact recipe quantities. A reagent must have
  enough listed supply for one craft and every output must retain the existing three-listing support
  threshold; otherwise economics are withheld and the chart shows a gap. Profit-positive crossings
  and below-normal asks receive separate markers. The UI explicitly distinguishes listed supply from
  sales and retains the six-observation guidance gate.
- Expanded opportunity details read up to 1,440 accepted scans for the selected client product,
  build, region, realm, and Auction House. Scoping the query before applying that 30-day limit keeps
  activity from other realms from crowding the selected market out of its own history.
- The Trader checks scan status immediately on page load and every five seconds while visible. It
  refreshes the server component after detecting a newer scan and performs one hard reload if the
  rendered timestamp has not caught up within four seconds. Focus, page-show, and visibility changes
  also trigger an immediate check, so an ingestion finishing just after a desktop reconciliation no
  longer leaves the open tab showing the previous scan.
- Companion `0.3.1` downloads the authenticated market pack after reconciliation and atomically
  installs generated `MarketData.lua`. Collector `0.10.0` provides a searchable Market Intel panel,
  exact-market compatibility checks, item-tooltip signals, and an account-wide local watchlist with
  post-scan alerts. Manual reconciliation now exposes a durable `checking` phase before detection,
  upload, processing, or the final up-to-date state, so the desktop button and tray no longer appear
  inert. `/reload` is required after the companion updates the pack.
- Production migration `0014_productive_praxagora.sql` completed from a verified 14,879,415-byte
  pre-migration backup. At migration time it backfilled 40,645 compact observations from five scans
  covering 8,122 items and published 5,521 TBC plus 2,324 Forever signal rows at `Collecting 3/6`
  and `Collecting 2/6` respectively; later accepted scans supersede those initial counts.
- Companion `0.3.4` is synchronized with macOS Intel and Apple Silicon DMGs, Windows x64 portable
  ZIP, and Linux x64 portable ZIP artifacts. All four server-side sizes and SHA-256 values match the
  public manifest, and public download responses report the exact manifest lengths. The locally
  installed macOS app is `0.3.4`, and Collector `0.10.0` is installed in both the Anniversary and
  Classic Beta clients with recoverable backups of their prior versions.
- Production release `kfc-helper-companion-arm64-20260928-r16` is active; compact r15 remains its
  immediate application rollback. Public and loopback health checks passed. Live Chrome validated
  the crafting charts plus arbitrary Auction House item name/ID search, expandable current-price
  evidence, Wowhead references, and responsive item history with no horizontal overflow at both
  1,440 px and 390 px.
- The release workflow now prunes generated desktop packages and build caches after staging checks;
  r13 occupies 964 MiB instead of roughly 3 GiB. Superseded r7 through r11 application releases were
  removed after their successors passed live checks and are not recoverable on the server. Filesystem
  use fell from 90% to 84%, but unattended 30-minute scanning remains prohibited until retention and
  disk alerts are operational.

### Auction House item discovery and scan feedback (2026-09-27)

- Trader now separates `Crafting profits` from `Auction House items`. The latter searches canonical
  item rows from the latest exact product/build/realm/Auction House scan by partial product name or
  exact item ID, then exposes the cheapest ask, quantity-weighted p10 ask, median/p90 ask, listed
  quantity/listings, near-market supply, vendor floor, and the retained scan history.
- Buy/sell language remains evidence-gated. A deterministic vendor-floor arbitrage may be shown from
  the current cheapest listing, while historical `good deal`, normal, rising/falling, spike-risk, and
  thin-market verdicts remain locked until six independent half-hour observations. The UI explicitly
  says asks are listings rather than confirmed sales.
- The fourth accepted Forever scan, `abba18b5-2da7-4300-8ea9-ead6d78e7f46`, completed at
  `2026-09-27T12:22:36Z` with 2,267 canonical markets and 8,277 price levels. The desktop state,
  ingestion row, public scan-status API, and live Trader all agree on that scan; the earlier apparent
  failure was missing immediate desktop feedback rather than a lost upload.
- The fifth accepted Forever scan, `26a8b95b-d96a-41f6-9c97-853ff101f4f0`, completed at
  `2026-09-27T12:58:14Z` with 2,271 canonical markets and 8,347 price levels. The database now holds
  eight scans and 47,490 compact observations, and Forever guidance is at `Collecting 5/6`. The
  companion had uploaded and processed this scan correctly; the stale 36-minute display came from a
  browser check landing before ingestion completed and then waiting too long to poll again. Release
  r14 closes that timing gap with five-second polling and the bounded hard-refresh fallback.
- Companion `0.3.1` remains installed locally. Its manual check shows
  `Checking saved scans and server status…` immediately and stays visibly busy through the real
  reconciliation phases. The prior temporary local application backup was removed after the
  installed version and preserved mode-0600 settings/state were verified.

### Cross-platform Companion downloads (2026-09-28)

- `/forever/addon` now offers Companion `0.3.4` for macOS Intel, macOS Apple Silicon, Windows x64,
  and Linux x64. The hero routes players to four explicit platform cards instead of assuming macOS,
  and the page explains that Windows/Linux are extract-and-run portable ZIPs. Desktop and 390 px
  mobile browser checks show all cards without horizontal overflow.
- The release pipeline builds all four Electron targets, copies immutable artifacts into one
  manifest, records byte size and SHA-256 for each, and publishes `latest.json` only after the server
  verifies every uploaded byte. Public HEAD and 32-byte range requests match the manifest for all
  four downloads.
- The Intel DMG is 136,264,061 bytes (`e90b3e4e59d1…506b`), the Apple Silicon DMG is 132,546,176
  bytes (`4a8dd78ea17b…d2d5`), the Windows ZIP is 160,575,125 bytes (`7f16dc014960…69c2`), and the
  Linux ZIP is 125,034,193 bytes (`33e7e830b721…4c47`). The Apple Silicon app is a native Mach-O
  arm64 executable and its DMG passes `hdiutil verify`; it still needs a runtime smoke on physical
  Apple Silicon. The Windows archive contains an x64 PE executable and the Linux archive an
  executable x64 ELF binary; all packages include the branded resources, utility process, and
  Collector payload.
- Linux discovery checks an explicit `WINEPREFIX` plus common Wine/Lutris-style prefixes and retains
  manual folder selection. Credential saving refuses Electron's insecure `basic_text` fallback and
  requires Secret Service/KWallet-class storage. Windows/Linux packages remain unsigned
  maintainer-alpha builds until native clean-machine runtime and signing/distribution gates pass.

### Windows Companion packaging audit (2026-09-28)

- The published `0.3.3` Windows archive passes a complete ZIP integrity test and contains a PE32+
  x86-64 GUI executable, `app.asar`, the utility-process bundle, artwork, and the Collector at the
  exact `process.resourcesPath` locations consumed by the packaged application. The executable's
  imported DLLs are Windows system libraries or Electron files shipped beside it, and its hardened
  Electron fuses are present.
- The four Collector files embedded in the Windows package match the installer's pinned SHA-256
  checksums byte-for-byte. Native Windows path expansion produces the intended product, addon, and
  SavedVariables paths under `C:\Program Files (x86)\World of Warcraft\_classic_beta_`; the archive
  checksum and length match the public release manifest.
- Settings/state/logs use Electron's per-user `userData` location and the token uses Windows DPAPI
  through asynchronous `safeStorage`, so neither depends on write access beside the portable
  executable. The packaged resource and utility paths are also independent of the current working
  directory.
- The current automatic game discovery checks only `%ProgramFiles(x86)%\World of Warcraft`. A game
  under `%ProgramFiles%` or a custom drive requires manual selection. The folder picker currently
  expects the exact `_anniversary_`, `_forever_`, or `_classic_beta_` product directory and does not
  validate or normalize a selected parent `World of Warcraft` directory before addon installation.
  Its existing Windows discovery unit test also uses the host path implementation when run on macOS,
  so it is not sufficient evidence of real Windows semantics.
- The portable build's `Start at login` entry targets the executable's extracted location; moving or
  deleting that folder afterward leaves the startup entry stale. Before promoting Windows beyond
  maintainer alpha, add multi-root discovery and validated parent-folder normalization, replace the
  host-dependent path test, and run launch, token persistence, addon install, scan upload, tray,
  restart, and login-start smoke tests on a clean Windows 10/11 machine. The unsigned build may also
  trigger SmartScreen until the signed installer phase is complete.

### Extreme-price ingestion incident (2026-09-29)

- Forever scan `a39e53b9-33b3-48c5-81fb-e6b5f4d0dc9f` was detected and uploaded by the local
  Companion, but its ingestion transaction initially rolled back. Item 43, Squire's Boots, moved
  from a roughly 100-copper historical ask to two listings at 99,999,990,000 copper. The valid
  `9,999,998,990,000` basis-point difference exceeded PostgreSQL's 32-bit `integer` range while the
  derived market signals were rebuilt.
- Migration `0015_market_signal_bigint.sql` changes `difference_basis_points` and
  `supply_ratio_basis_points` to `bigint`. It was tested against a disposable restore of the live
  database, then applied from the owner role after verifying the 15,826,451-byte custom-format
  backup at `shared/backups/wow-trader-pre-market-bigint-20260929.dump`.
- Production release `kfc-helper-market-bigint-20260929-r17` is active. The original saved scan was
  retried without editing or recreating it and processed successfully: 2,378 item markets and 8,458
  price levels, completed at `2026-09-29T02:19:14Z`. The database and public scan-status API both
  return that exact scan as the latest Forever `UNKNOWN / ClassicBetaPvP / alliance` observation.
- The signal regression suite now covers the exact extreme-price delta. Automatic Companion checks
  retain the current upload error during a retry cooldown instead of replacing it with a false
  `All saved scans are up to date` state. Ingestion logs also summarize database errors without
  serializing full SQL parameter arrays. Companion `0.3.4` now ships this status correction and is
  installed locally; its OS-encrypted credential and existing settings were preserved.

### Local Forever build-70058 bootstrap (2026-09-29)

- The local PostgreSQL container had exited, causing catalog-backed localhost routes to display the
  generic database-unavailable fallback. `pnpm dev` now runs against the active Forever target via
  the ignored local `WOW_PRODUCT=wow_classic_beta` setting; it starts PostgreSQL, applies all 16
  migrations, validates/publishes the exact catalog, and watches the Beta SavedVariables folder.
- Forever client `1.60.1.70058` requires WoWDBDefs revision
  `c79f208203f8d6ce2a5e2e7dcb34ab6606ae5ab1`. Both catalog and world extractor defaults are pinned
  to that exact upstream build merge. Catalog parsing errors now identify the failing table/build/
  revision, and the revision CLI boundary rejects anything other than a full Git SHA.
- The audited build-70058 catalog contains 23,605 named items, 12 professions, 2,239 recipes, and
  2,948 decoded icons. The new audited world snapshot contains 72 maps, 342 encounter rows, 73
  criteria-backed bosses, 6,605 quest IDs, and 1,288 item-source hints.
- World snapshot storage now includes the definitions revision in its immutable path. This lets a
  corrected definition set coexist with an older snapshot for the same build/hotfix rather than
  deleting, overwriting, or silently reusing evidence.
- The local watcher processed eight saved Forever scans. Latest scan
  `d833de11-c1d2-457b-ad5d-a30f3a79d810` is build 70058 with 2,362 markets and 8,477 price levels;
  localhost Forever Trader renders it without the database fallback. Production was healthy and
  unchanged during the initial local recovery.

### Production Forever build-70058 publication (2026-09-29)

- Production had accepted the build-70058 scan but still published only catalog build 70009, so the
  Trader correctly gated calculations rather than joining prices to stale recipes. The live UI
  reported `Build 70058 · review pending` and no matching published catalog.
- The 70009→70058 review diff adds 27 item IDs, removes or changes no items, and changes no spells,
  professions, recipes, or transformations. Server-side re-audit verified all 102 artifacts and
  relationship validation reported no issues.
- After verifying the 16,063,818-byte custom-format backup at
  `shared/backups/wow_trader-pre-forever-70058-catalog-20260929.dump`, production imported the new
  build as review-required, activated the immutable checksum-verified 2,948-icon media release, and
  then published catalog build ID `457e6227-85f5-4053-ab39-5f6898c0cf17`.
- Live Forever Trader now joins scan `d833de11-c1d2-457b-ad5d-a30f3a79d810` to exact catalog
  `1.60.1.70058`: 2,362 markets, 8,477 price levels, 50 rendered crafting opportunities, working
  Auction House item search/history, and valid build-native icons. The catalog gate and generic
  database fallback are absent.
- Production now retains 13 scans and 59,266 compact item observations. Signals remain build-scoped:
  5,521 TBC rows, 2,295 Forever build-70009 rows, and 2,362 Forever build-70058 rows; new-build
  guidance honestly restarts at `Collecting 1/6`.

### Production Forever build-70124 publication (2026-09-30)

- Scan `41c16940-f286-43e0-ba25-705aca0ccfe8` uploaded correctly, but its new client build had no
  exact published catalog. The Trader's `Build 70124 · review pending` state was the deliberate
  build-integrity gate, not a Companion or ingestion failure.
- The installed client is `1.60.1.70124`. Catalog and world extraction now use exact WoWDBDefs
  revision `005c13a9a101e64014eeb02af3a42ccbeaf8513d` (`Merge 1.60.1.70124`), which has build-70124
  definitions for all 36 required catalog tables.
- Local extraction, the 102-artifact audit, and relationship validation passed with 23,605 named
  items, 12 professions, 2,239 recipes, and 2,948 verified item icons. The 70058→70124 structural
  diff contains no added, removed, or changed player-facing items, spells, professions, recipes, or
  transformations.
- The exact world snapshot also passed audit with 72 maps, 1,672 decoded map tiles, 342 encounter
  rows, 73 criteria-backed bosses, 6,605 quest IDs, and 1,288 item-source hints. It remains local
  evidence; this incident required only the Trader catalog and item media on production.
- Production backup
  `shared/backups/wow_trader-pre-forever-70124-catalog-20260930.dump` was verified at 22,101,567
  bytes. The server repeated catalog audit and validation against immutable release
  `shared/catalog-releases/wow_classic_beta-70124-enUS-3055d2ff-005c13a` before import.
- Media release `wow_classic_beta-70124-enUS-3055d2ff-005c13a` passed local and server verification
  with 2,948 icons before catalog build ID `196c3b07-ca1e-49d3-b919-208401b4887e` was published.
- Live Forever Trader now resolves exact catalog `1.60.1.70124`, renders 50 crafting opportunities,
  returns 30 Auction House item rows for `scroll`, and serves valid Forever PNG media. Neither
  review-gate message is present. PM2 reports both Helper processes online; only the web process was
  reloaded to clear cached catalog selection.
- Production retains 14 scans and 61,632 item observations. Current build-scoped signal counts are
  5,521 for TBC build 69795, 2,295 for Forever build 70009, 2,362 for build 70058, and 2,366 for
  build 70124. Cross-build market history remains intentionally isolated.

### Nginx upload-buffer incident and Companion 0.3.4 (2026-09-30)

- Saved Forever scan `78751705-721a-4873-9339-1532d7e385b7` repeatedly received HTTP 500 before
  reaching Fastify. Nginx error evidence identified `Permission denied` opening
  `/var/lib/nginx/body/*`; proxy temporary-file failures were also occurring across unrelated server
  virtual hosts. Directory modes were correct at inspection time, and a graceful reload replaced
  the affected workers and recovered the pending upload automatically.
- The production Helper config now streams `/v1/` request bodies and disables response proxy
  buffering for both Helper locations. This removes the Helper's dependency on the affected Nginx
  temporary directories. `scripts/deploy-production-nginx.sh` provides validated activation,
  timestamped rollback, and a 1 MiB public edge smoke; the deployed smoke returned HTTP 422 from the
  application rather than an edge 500.
- The recovered build-70124 scan contains 2,357 item markets and 8,112 price levels, completed at
  `2026-09-30T12:21:15Z`. PostgreSQL and the public scan-status endpoint return its exact UUID, and
  the live Forever Trader reports a fresh exact-catalog scan.
- Companion retry state is now tied to each retry key and restored during cooldown. Reconciliation
  stops at the deferred failure so another enabled product cannot mask it with a success message.
  The focused suite contains both single- and multi-product regression coverage.
- Companion `0.3.4` is published as checksum-verified macOS Intel/Apple Silicon DMGs and Windows/
  Linux x64 ZIPs. This Intel Mac now runs `0.3.4`; the old `0.3.1` app is retained as a recoverable
  backup, while Application Support settings, state, logs, and the encrypted credential remain in
  place.
- Production now retains 15 scans and 63,989 compact item observations. Current exact-build signal
  counts are 5,521 TBC, 2,295 Forever build 70009, 2,362 build 70058, and 2,357 build 70124.
- Commit `87f9101` is pushed to `origin/main`. Production release
  `kfc-helper-nginx-streaming-20260930-r18` passed the complete server-side check and formatting
  gates before activation. Both Helper processes and the untouched `kfc-website` process are online;
  PM2 saved the process list. Release r17 is the immediate application rollback.

### Retired Jilanov applications cleanup (2026-09-30)

- The applications previously served under `jilanov.com` were confirmed migrated away from
  `89.167.46.193`. Eleven old Nginx site entries were disabled after a successful configuration test
  and preserved in `/etc/nginx/retired-jilanov-20260930T1424Z`; Nginx remained active after reload.
- Eighteen matching PM2 entries were deleted and the reduced process list was saved. The unrelated
  KFC website, Helper web/ingest, Gigsy API, and `green` processes remained online and passed their
  local/origin HTTP checks.
- Fourteen exact legacy trees were permanently deleted: the Jilanov client/admin/server trees,
  Dimitar website and backup, interview assistant, landing, demo, staging and staging repository,
  BeautyMall, chatbot, and public scanner. `/home/gigsy`, KFC, SEO, and
  `/home/jilanov/green-github` were explicitly retained.
- PostgreSQL databases `public_scanner_dev`, `jilanov_clone`, `dj-jilanov`, `demo_eu`, and
  `beautymall_eu` were permanently dropped. `wow_trader`, `gigsy`, and `dj-kfc-guild` were verified
  present afterward.
- Root filesystem usage fell from 91% (about 6.6 GiB free) to 69% (about 22.3 GiB free), reclaiming
  approximately 15.8 GiB. Public checks for the migrated Jilanov website hosts and origin checks for
  KFC, Helper, Gigsy, and SEO returned HTTP 200 after cleanup; the `apidemo.jilanov.com` root returned
  HTTP 404, which is consistent with an API host having no root route.

### Forever build 70205 catalog publication (2026-10-04)

- Scan `1309b399-ca4b-4c57-a13c-fa34eee3a2c7` had uploaded and processed successfully. It was gated
  only because production did not yet have an exact published catalog for client build 70205.
- Exact WoWDBDefs revision `3e46d21a41a07ce7e63835fd79c561e0d5dce92b` and hotfix hash
  `eba98a15545c5390353d1c3f3b7e55c1a466f098adc390873a3ebaa2ab81f295` produced a snapshot with
  23,740 items, 31,731 spells, 12 professions, and 2,239 recipes. Both local and production audit and
  relationship validation passed.
- Build 70124→70205 adds 138 item records, removes three, and changes 183 normalized item records;
  it also adds 44 spell records, removes 16, and changes 768 normalized spell records. The recipe
  graph is unchanged. Three enchanting recipes gained a three-second cast time; the other changed
  recipe records were raw-evidence-only differences.
- Verified backup `shared/backups/wow_trader-pre-forever-70205-catalog-20261004.dump` is 29,049,471
  bytes. Immutable catalog/media release `wow_classic_beta-70205-enUS-eba98a15-3e46d21` contains
  2,949 verified icons.
- Published database build `ccb5edd9-8494-4352-ac91-7deab04904b1` matches the accepted scan's exact
  build. The live Trader shows 2,940 markets and crafting results with no review gate. Web and ingest
  remain online; only the web process was reloaded to clear cached catalog selection.

### Automatic catalog guardian (2026-10-04)

- Added and installed macOS LaunchAgent `online.kfcguild.wow-trader-catalog-guardian`. File-change
  triggers cover both the WoW build manifest and Forever hotfix cache, with a five-minute retry as a
  fallback. Status and logs live outside the repository under the user's Library directories.
- The guardian resolves exact official WoWDBDefs commits, extracts locally, runs the full audit and
  relationship validation, applies semantic promotion policy, verifies item media, creates a unique
  production backup, stages immutable releases, repeats verification on the server, publishes, and
  reloads only the web process. Production owner credentials never leave the server.
- Automatic policy allows exact item/spell metadata and craft-time updates but stops for missing
  evidence, extractor changes, count drift above 10%, or changes to profession, recipe, or
  transformation economics. Material changes therefore remain review-gated rather than silently
  using stale recipes.
- Its first production run detected a same-build hotfix change to
  `f1e43a579cb88f48a483c01906970335065599cfda6942e3c31dc8d38595c53f`. The compatible snapshot has
  23,819 items, 31,731 spells, 12 professions, 2,239 recipes, and 2,951 verified icons. It was
  published as build ID `3df286a3-8940-4f42-93c0-6ede4ff28076` after verified backup
  `wow_trader-pre-wow_classic_beta-70205-f1e43a57-catalog-20261004.dump` (35,029,084 bytes).
- A subsequent run exited cleanly as already current. Production still renders the accepted
  2,940-market scan and crafting opportunities without the catalog gate; both Helper processes are
  online and ingestion was not restarted.

### Public Forever research contract and catalog routes (2026-10-04)

- The published Forever catalog now has first-class searchable item, recipe, and profession pages
  under `/forever/encyclopedia/catalog`, with product-aware tooltip/detail/crafting links rather than
  TBC hard-coding. Trader results link directly to the corresponding Forever entities. A separate
  nested sitemap publishes the large entity URL set without risking the root sitemap limit.
- Item pages can show extracted loot relationship candidates while preserving their review state.
  They continue to label drop chance unknown and never convert a client hint into a confirmed source.
- The catalog package now provides `semantic-diff`: a tested, field-level comparison of normalized
  items, recipes, and professions. Raw evidence is ignored; item changes are classified by player
  impact and recipe reagent/output/cooldown changes remain economic changes.
- `/forever/data` and versioned public JSON endpoints expose the current build, normalized build
  changes, profession recipe/cooldown/unresolved counts, strict market-trend readiness, discovery
  coverage, world coverage, canonical entity URLs, and the publication rules. Public market reports
  require 24 accepted exact-market/build observations and 50% confidence even though the interactive
  Trader may show earlier collecting states. A scan from another build is never joined to the current
  catalog for a public trend claim.
- `wowforeverdiscord.online/research` consumes that contract for stable player-facing reports and
  owns the anonymous correction/review loop. BiS, class scaling, content availability, confirmed
  sources, and drop rates remain explicit evidence gaps until their independent gates pass.
- Focused catalog tests, Helper typecheck/lint, community-site typecheck/lint, and the recruitment
  census regression test pass. The community migration was applied to the local development
  database and a real feedback submission returned HTTP 201; its verification row was then removed.
- Production Helper release `kfc-helper-forever-research-20261004-r4` is active. Its clean Linux
  release passed lint, strict typecheck, 110 web tests plus the complete workspace suites, production
  build, and formatting checks. Only `kfc-helper-web` was reloaded; `kfc-helper-ingest` remains
  pinned to `kfc-helper-ingest-auction-20261001-r1` and was not restarted.
- Live checks returned HTTP 200 for the observatory, `/forever/data`, catalog, profession page, and
  all four nested sitemap shards against catalog build 70205. The root sitemap has 32,535 URLs and
  the four non-overlapping catalog shards have 8,000, 8,000, 8,000, and 2,075 URLs. A live crawl of
  all five files and the public pages/APIs left `kfc-helper-web` online at the same PID and restart
  count; the warmed process stabilized at about 361 MiB, below its 600 MiB restart guard. The
  community deployment then applied migration
  `034_research_feedback` after a verified isolated backup restore and activated build directory
  `.next-release-research-20261004-r3`. All seven reports, the research index, sitemap, and robots
  returned HTTP 200. A production feedback POST returned HTTP 201 and its exact verification row was
  removed. Article/Dataset JSON-LD and evidence-derived sitemap modification dates are live.

## Next actions

### 2026-10-05: Dungeon companion implemented locally

- Current request: implement `docs/forever-leveling-dungeon-integration-plan.md`. This turn does not
  authorize commit, push or deployment. The previously deployed reader-quality r5 release is
  unchanged. The large unrelated catalog guardian/public API worktree is preserved.
- Added reproducible declaration-only Lua extraction and a factual Wowhead inventory importer.
  Checked-in reference data reconciles 94 supplemental associations / 92 dungeon quest identities
  with 216 guide associations / 212 table identities into 259 quest records and 32 visit variants.
  Raw authorized leveling archives, account data, credentials and game extraction artifacts were
  not copied into tracked source. All current quest reward XP remains unknown.
- `packages/leveling/src/dungeon-{model,catalog,planner}.ts` owns typed gates, prerequisites,
  character eligibility, source attachments, coverage and whole-trip/marginal reference scenarios.
  Fake punch-card IDs, explosives self/future gates, Paladin final rewards, accepted-only transport
  prerequisites, inside starts, outside hand-ins and previous-dungeon work have explicit handling.
  Unknown lifecycle/scope/XP, unresolved alternatives and unavailable visits cannot yield a ranking.
- Dashboard **Optional dungeons** and reader **Dungeon preparation** provide selected bundles,
  independent accepted/objective-complete/rewarded states, starting-item confirmations, mutually
  exclusive reward choices, Undo, reference pickup markers and unchanged-route rejoin. Source tags
  stay enabled for finished visits; declining a visit preserves source progress and bookmarks.
  Nearby map-percent pickup cards are candidates, not a claimed travel optimizer.
- Each saved character stores release-scoped plans under `dungeons-v1-build-70205-oct-01` in the
  existing browser workspace and backup. Scenario inputs persist; backup merge preserves intentional
  removed confirmations. No new account sync, market scan, broad NPC/quest scanner or addon install.
- Lazy `/api/v1/leveling-rewards/:itemId` accepts known reward identities only and validates the
  published Forever build-70205 catalog. It has explicit missing/build-mismatch/unavailable states
  and reuses item stat formatting. Kept items are not also treated as vendor/AH income.
- Audit: 157 checksum-validated chapters, all 216 guide associations accounted for, 230 visit/quest
  rows (39 source-present, 25 overlay-needed, 23 inside-start, 10 later-stage, 25 lifecycle-review,
  108 unavailable/reference). See `docs/forever-leveling-dungeon-coverage.json` and
  `docs/forever-leveling-dungeon-implementation.md` for operation and limits.
- Restored current-release plans validate quest IDs, visit membership and reward choices before
  rendering, so malformed imports cannot crash the reader. Dungeon source tags use the archive's
  exact uppercase names, including STOCKADES, GNOMER and ULDA, verified by the audit.
- Verified: 60 leveling unit tests, 174 web unit tests, leveling/web typechecks and lint, script lint,
  archive audit, isolated production build, 30 existing leveling Playwright regressions and four
  dedicated desktop/mobile dungeon browser groups. Positive item-preview responses use mocks;
  real same-build DB preview smoke testing remains for deployment. Screenshots stay in unique temp
  folders. The user's existing dev server remains running and production is untouched.
- Next dungeon work: obtain current-build turn-in/modifier/XP observations, review the 25 unknown
  playable lifecycle rows, time feasible travel/hearth/exit/rejoin segments and playtest group runs.
  Add the opt-in guide observer/import validation separately before publishing live recommendations;
  do not label reference-only content as optimized or playtested.

### 2026-10-05: Bracket-replacement UX revision (implemented locally)

- User dislikes the detached dungeon checklist/calculator design. Requested direction: estimate
  dungeon quest XP using the Crest of Lordaeron example and offer concrete alternatives such as
  Hall of Thanes replacing the applicable **15–16 Darkshore** bracket. The subsequent explicit
  "do it" requests authorized implementation. It is now implemented locally; no commit, push or
  deployment was requested for this revision.
- Verified current source: Crest 95189 is 2,600 offline XP; the supplied Wowhead page has a player
  comment reporting 6,200 XP at level 20. Raw comment timestamp is `2026-10-01T21:04:13-05:00`;
  the posting date alone cannot prove the observed hotfix/modifiers. Calibrated factor is 31/13,
  approximately 2.384615. The implementation uses this labeled estimate, not a verified universal
  server coefficient. Exact observed hotfix/modifier context remains unconfirmed.
- Applying that factor only to dungeon quest rewards gives Thanes four quests (excluding Treaty)
  4,900 baseline / about 11,685 estimated XP; all five give 6,050 baseline / about 14,427 estimated XP.
  Separate outdoor prerequisite Underground Map 96391 is not dungeon-multiplied. Kills, outdoor
  quests and the level curve also do not receive the dungeon coefficient.
- Current guide pickup minima: two quests 14+, two 15+, Treaty 98423 16+. For a level-15 replacement,
  do not assume Treaty is eligible or use its reward to unlock itself. Town hand-ins after the run
  cannot unlock an earlier in-instance pickup. Check levels chronologically before each pickup.
- Build-70205 extracted `gametables/xp.txt` has 14,400 XP for 15→16; its SHA-256 still matches
  `935253a23756f0ab7a760e8e4ab22184e1aca49285944ea68efc0a8820e459e6`. It is client reference
  evidence, not runtime-confirmed. With that curve and calibration, starting at 15 with zero XP,
  four quest hand-ins leave about 2,715 XP for kills/current progress/other genuinely added work.
- Source chapter 126 (`chapter-126-14-16-darkshore`) has race-dependent labels 11–16, 13–16 and
  15–16. A replacement must target the actual profile/remaining segment, not universally delete
  this chapter. Chapter 127's applicable source still references quests introduced earlier; the
  static human-warrior/1× audit found carryover IDs 4762, 948, 963, 1138, 2138, 1002, 965, 986. These
  are conditional source expectations, not automatically proven mandatory server gates.
- Proposed UX: chapter-local alternative card with estimated quest XP, separate kill XP, XP gap to
  the next level/checkpoint, readiness, all-in time when available, kept preparations and exact
  rejoin. Primary choices **Use dungeon route** / **Keep questing**; detailed quest state/calibration
  sits behind **View plan**. Keep the fixed map + scrollable instructions and Next/Done/Undo.
- The level-coverage decision needs current level/XP plus the extracted curve and next checkpoint,
  not exact reward XP for every outdoor quest. Analyze outdoor dependencies separately. If a full
  skip is unsafe, retain a small preparation/continuation bridge or offer partial replacement.
  XP coverage is not a speed claim: speed still accounts for travel, recruiting, clear, hand-ins and
  rejoin and compares the player's actual party alternative.
- Preserve baseline data and expose explicit observed/calibrated/reference evidence. Prefer current
  matched observations over estimates; show estimates as estimates without requiring the player to
  fill a disconnected calculator. Date/build-scope calibration: Blizzard's October 1 notes halve
  the EXTRA bonus, not total XP. If an observation predates the change, conditional adjustment is
  base + (oldReward − base)/2 (Crest 4,400, not 3,100); do not apply that reduction a second time to
  a post-change observation. Some individual quests were also recalibrated.
- Implementation order proposed: calibration + curve adapter, reviewed Thanes/chapter-126 replacement
  with dependency bridge and chronological gates, chapter-first cards, reversible branch selection,
  then expand to other route/dungeon pairs. Branch choices must never mark omitted source steps done
  or destroy existing bookmarks/backups. Missing XP/time facts may label an estimated/conditional
  alternative, but unfulfilled hard quest/entry/rejoin gates cannot be passed by an estimate.

- Implemented `dungeon-alternatives.ts` and the chapter-local alternative card. Crest applies only
  to dungeon rewards, with per-quest rounding; already rewarded/retained rewards are excluded.
  Current XP and per-player kill XP reduce the checkpoint gap without multiplying the curve or
  outdoor prerequisite. Full-trip time differences require both inputs and estimated XP coverage.
- The approved Thanes choice opens a seven-stage fixed-map reader on the original chapter URL.
  Next/Done/Undo, bookmarks and progress are separate from source progress. Keep questing restores
  the outdoor bookmark; `?outdoor=1` preserves the choice while inspecting an original preparation.
  Dashboard Continue follows the selected branch. Missing/different-build source pairs cannot activate it.
- The chapter-126/127 dependency bridge filters class/race/rate directives, keeps unknown conditions,
  respects accept/turn-in order and required-versus-conditional uses. Continuation requires actual
  return level 16+, a resolved class/outdoor rate and explicitly reviewed applicable carried quests.
  Forecast XP and instruction ticks cannot satisfy these checks. Ironforge/Darkshore map backgrounds
  switch by stage; unverified dungeon coordinates remain unpinned. Mobile Review chapter has a real
  checkpoint anchor. Other dungeon/chapter pairs remain reference plans pending reviewed adapters.
- No dependency, migration, addon change, scan, production mutation or dev-server restart. Docs and
  `fixes.md` are updated; isolated build and dedicated browser checks are part of the verification.
- Verified: 79 leveling and 176 web unit tests; both packages' lint/typechecks; leveling build;
  isolated Next.js production build; all 30 existing leveling Chrome regressions; four reference-
  dungeon and four replacement browser groups. Replacement checks cover invalid XP, independent
  Next/Done/Undo, dashboard Continue, reload, original bookmark restoration, actual-level/quest-chain
  gates and mobile Review chapter. Screenshot review also replaced stretched neighboring chapter
  cards with a full-width outdoor/dungeon comparison row. XP remains estimated, not live observed.

### 2026-10-05: Leveling UX review (research/plan only)

- Reviewed the local chapter dashboard, outdoor reader and selected Thanes replacement in isolated
  Chrome sessions at desktop and 390×844 mobile widths. No application implementation, deployment,
  commit, production mutation or change to the user's browser profile was performed.
- The mobile instruction pane begins about 371 px down the 844 px viewport, and the repeated route
  comparison delays the first instruction further. The dungeon reader contains 22 quest-state
  selects across its stages. Current + next focus exists but is hidden in Settings; the selected
  route repeats both its large comparison card and Keep questing action.
- Prioritize a planning/play split: full comparison before selection, compact route summary while
  playing, visible current + next focus, compact mobile chrome with separate Next/Done actions,
  and a persistent desktop map with an adjustable map/instruction split.
- Surface source-derived outdoor carryover preparation before dungeon entry, distinguishing
  required, conditional and unresolved evidence. At return, show only outstanding checks and
  direct links to resolve them. Keep actual-level and explicitly reviewed quest-state gates.
- Replace repeated six-state dropdowns with stage-appropriate explicit quest actions and a status
  correction menu. Generic instruction Done must never infer quest acceptance or a reward.
- Separate original estimated trip XP, remaining estimated rewards and reported current XP.
  Prompt for an actual level/XP update after reported hand-ins; never credit calibrated rewards as
  observed XP or imply that XP coverage proves the dungeon is faster.
- Make the dashboard Continue-first with nearby chapters and a collapsed full archive. Preserve
  source bookmarks, separate dungeon progress, backups, Next/Done/Undo and evidence labels.
- Suggested order: reader density/mobile/focus; preflight and explicit quest actions; XP feedback
  and dashboard hierarchy. Verification this turn was browser inspection only, not a new unit or
  build run. Implementation needs regression checks for resume, gate enforcement and mobile focus.

### 2026-10-05: Leveling UX revision implemented locally

- Implemented the reviewed plan: default current + next, visible All steps, persistent mobile
  map/list preference, accessible 35–60% desktop map width, compact mobile header and bottom
  independent Previous/Next/Done/Undo/Review controls. Existing explicit preferences are preserved.
- Removed the repeated comparison from active dungeon instructions. Route & XP holds stage links
  and Keep questing; full inputs are in Settings. Outdoor alternatives are expandable, and the
  dashboard Review preparation link reveals the source carryovers before route selection.
- Explicit acceptance/objective/hand-in actions share quest state, with correction/undo. Generic
  Done still marks only an instruction. Preparation is shown before entry; the bridge/rejoin show
  outstanding checks and corrective links without weakening actual-level/build/carryover gates.
- Original estimated XP is saved separately from remaining rewards. Any reported reward-state
  transition marks XP stale; an explicit actual-level/XP update clears that flag and the earlier
  kill estimate. Neither forecasts nor instruction ticks credit earned XP or unlock continuation.
  Older replacements default the new forecast/staleness fields and retain bookmarks and checks.
- Continue-first dashboard shows nearby connected chapters/reference alternatives and a collapsed
  archive. Class/rate settings remain discoverable. Save feedback follows successful persistence;
  failed writes remain visibly memory-only and storage recovery clears its outdated warning.
- Screenshot review also fixed map-toggle/resize scrolling away from the selected instruction and
  long return-action labels clipping at 320 px. The 390×844 dungeon pane is now 596.5 px (~71%).
- Verified: 80 leveling + 180 web unit tests, lint/typechecks, leveling/isolated production builds,
  22 compatible existing Chrome regressions with explicit All steps, four reference-dungeon and
  six updated replacement browser groups, preparation deep-link and mobile Continue checks, and
  desktop/mobile reader/dashboard accessibility with no A/AA violations. Superseded old mobile
  toolbar selectors were not counted as unchanged passes. Docs and fixes are updated.
- No commit/push/deployment, dependency, migration, production write, addon change or dev restart.

1. Add structural snapshot-to-snapshot diff presentation and reviewed source corrections before
   consuming a later Talents Forever export; never auto-publish changed upstream evidence.
2. Implement and verify the market summary/compaction/retention jobs, recurring backup schedule, and
   disk/API/process/data-freshness alerts in `docs/production-deployment.md`; then enable unattended
   30-minute production uploads. The controlled PM2 startup drill is complete.
3. Import the installed AtlasLoot TBC modules into the versioned acquisition graph, publish a
   player-facing coverage report, and obtain the authorized Blizzard source/loot feed needed to close
   server-only gaps.
4. Add the first build-locked spec evaluator to the catalog-backed BiS workspace, then validate its
   whole-loadout mechanics before promoting its candidates to a ranked list. Do not publish
   phase-specific BiS until source/availability filtering exists.
5. Collect at least four more accepted scans for the same Forever market/build through the automatic
   watcher, then validate the newly unlocked normal-price bands and direction signals against the
   Blizzard UI before treating them as player guidance.
6. Extend scan-quality diagnostics with the Auctionator version, skipped-row counts, and separate
   in-game completion/file-flush times before accepting community collectors.
7. Extend addon snapshots with character profession skill, specialization spell IDs, and known
   recipe IDs so the account network can replace its visible simulation with actual eligibility;
   then add inventory/capital constraints and mastery-proc observations. Disenchant observations can
   audit the static table but are not required to calculate its expected value.
8. Extend the published build-70205 catalog with item stats, damage, resistances, sockets, item
   effects, teaching items, transformations, and in-game golden tooltip/recipe checks. Keep the old
   build-69893 world snapshot review-only; it is separate from the published build-70205 Trader
   catalog and must never be presented as exact current-client evidence.
9. Replace the Companion maintainer token with per-installation pairing/revocation, then sign and
   notarize macOS Intel/Apple Silicon packages, produce a signed Windows installer, and validate the
   Linux desktop/keyring matrix before promoting the download from maintainer alpha to public.
10. Keep the old world-diagnostics workflow paused while collector `0.9.1` remains market-only. If it
    is revisited, first extract the current build and regenerate all build-pinned seeds; do not restore
    or run the archived build-69913 quest/model catalogs on build 70124. The review-only
    boss/spell/location/source pages must remain provenance-labeled until a replacement evidence path
    passes review.
11. Submit the updated community and Helper sitemap URLs in the verified Google Search Console
    properties, request one inspection of the newly published research index/data report, and monitor
    index coverage, structured-data reports, Core Web Vitals, and queries. Account-side submission is
    the remaining external step; the crawlable pages and evidence-backed metadata are live.

## Working rules

- Update this file whenever state, decisions, verified evidence, or blockers materially change.
- Never commit extracted game data, raw uploads, companion state, credentials, or authorization files.
- Preserve raw evidence and build provenance; never overwrite snapshots in place.
- Do not equate client presence with a live drop source, drop probability, or phase availability.
- Do not create commits, branches, or pull requests unless explicitly requested.
