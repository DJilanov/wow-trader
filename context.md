# WoW Trader project context

Last updated: 2026-09-17

## Goal and current target

Build a player-facing WoW economy product with a build-versioned item/profession/recipe archive,
approximately 30-minute Auction House history, realistic crafting opportunities, and evidence-backed
market guidance. TBC Anniversary is the live validation target; the same pipeline will migrate to
Forever after its public client is available.

Client presence, announced content, phase availability, observed sources, and estimated drop rates
are separate facts. Extraction can reveal a shipped rare recipe before it drops, but it cannot prove
its server-side source or probability.

## Repository and stack

- Remote: `git@github.com:DJilanov/wow-trader.git`
- Local: `/Users/dimitarjilanov/work/test/wow-trader`
- Branch: `main`; the repository is prepared for its initial production-tracked release.
- Primary stack: strict TypeScript, pnpm/Turborepo, Next.js, Fastify, Zod, Drizzle, PostgreSQL.
- Boundary tools: .NET 10 for CASC/DB2 extraction and Lua for the in-game collector.
- Full architecture: `blueprint.md`.
- Market workspace, AH source, valuation, signal, and staged UI plan:
  `docs/market-workspace-plan.md`.
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
- An open Trader page polls a lightweight market-specific status endpoint every 30 seconds while
  visible/online and calls a server-component refresh when a newer processed scan arrives. The addon
  still cannot force WoW to flush: after Auctionator finishes, `/reload` or logout remains required.
- Remaining product phases are imported character professions/skills/specializations/known recipes/
  inventory, execution queues and addon export, retained observation summaries and sale/expiry
  evidence, risk-adjusted demand ranking, alerts/backtests, and portfolio allocation.
- The Electron implementation in `docs/desktop-companion-plan.md` is now working as an unsigned
  maintainer-alpha macOS x64 package. `packages/companion-core` is shared by the CLI and Electron
  utility process and covers serialized multi-product polling, stable-write detection, processing
  receipts, cancellation, bounded retry, v1-to-v2 state migration, and restart-safe scan IDs.
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

## Next actions

1. Add structural snapshot-to-snapshot diff presentation and reviewed source corrections before
   consuming a later Talents Forever export; never auto-publish changed upstream evidence.
2. Implement and verify the market summary/compaction/retention jobs, recurring backup schedule, and
   disk/API/process/data-freshness alerts in `docs/production-deployment.md`; run a controlled PM2
   startup drill, then enable unattended 30-minute production uploads.
3. Import the installed AtlasLoot TBC modules into the versioned acquisition graph, publish a
   player-facing coverage report, and obtain the authorized Blizzard source/loot feed needed to close
   server-only gaps.
4. Add the first build-locked spec evaluator to the catalog-backed BiS workspace, then validate its
   whole-loadout mechanics before promoting its candidates to a ranked list. Do not publish
   phase-specific BiS until source/availability filtering exists.
5. Collect repeated Spineshatter snapshots through the automatic watcher and validate historical
   baselines and anomaly signals on
   observed data.
6. Extend scan-quality diagnostics with the Auctionator version, skipped-row counts, and separate
   in-game completion/file-flush times before accepting community collectors.
7. Extend addon snapshots with character profession skill, specialization spell IDs, and known
   recipe IDs so the account network can replace its visible simulation with actual eligibility;
   then add inventory/capital constraints and mastery-proc observations. Disenchant observations can
   audit the static table but are not required to calculate its expected value.
8. Complete the catalog half of `docs/forever-beta-extraction-plan.md`: decode exact-build item
   properties and recipe/profession relationships, preserve unavailable/encrypted states, and pass
   in-game golden recipes/tooltips. Build 69893 remains `review_required`; do not publish the current
   diagnostic catalog or world snapshot.
9. Run the no-instance `SetCreature` controls and the explicit 100-quest capability sample. If the
   new control resolves, run the 30-ID model batch, review repeat consistency, and then add the
   diagnostics ingestion/promotion schema plus model rendering. Promote the existing review-only
   boss/spell/location/source pages only after the review workflow is in place.
   Dungeon/loot collection, creature-location aggregation, alternate-form reconciliation, and public
   observed-loot evidence still wait until that content becomes accessible.
10. Verify the apex guild site and Helper subdomain in Google Search Console, submit both public
    sitemap URLs, and monitor index coverage, structured-data reports, Core Web Vitals, and search
    queries. Verification ownership is the only remaining external step for the technical SEO launch.

## Working rules

- Update this file whenever state, decisions, verified evidence, or blockers materially change.
- Never commit extracted game data, raw uploads, companion state, credentials, or authorization files.
- Preserve raw evidence and build provenance; never overwrite snapshots in place.
- Do not equate client presence with a live drop source, drop probability, or phase availability.
- Do not create commits, branches, or pull requests unless explicitly requested.
