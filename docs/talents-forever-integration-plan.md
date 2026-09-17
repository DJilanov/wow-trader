# Talents Forever integration plan

## Implemented foundation — 2026-09-16

The first production-capable slice is implemented. The repository now has:

- a strict `@wow-trader/forever-data` parser, semantic validator, immutable PostgreSQL snapshot, and
  explicit review/publication pointer;
- fixed allowlisted source retrieval and JSON-only parsing of the supplemental spellbook icon map;
- exact source/composite checksums, duplicate-safe imports, and publication by snapshot UUID or
  checksum;
- a 574-file local icon/background release with byte/SHA-256 verification and a guarded production
  synchronization script;
- all nine talent calculators with allocation legality, local save/share, evidence states, Classic
  comparison, SVG prerequisites, keyboard tooltips, and touch action sheets;
- all nine spellbooks with tabs, pages, observed ranks/training levels, tooltip evidence, responsive
  parchment/leather presentation, and reduced-motion behavior;
- Racials, class abilities, Legacy, changelog, provenance, versioned public export, metadata, and
  sitemap surfaces inside the existing KFC shell.

The current implementation deliberately stores the fully validated 0.6 MB parsed payload as an
immutable JSONB document rather than materializing every proposed observation table. This is enough
for the pre-release read model and preserves the exact source. Durable per-entity identity,
cross-snapshot structural diff UI, reviewed correction intake, and client-entity reconciliation stay
as the next evidence-model iteration; they are required before preview observations can be promoted
to canonical Forever facts.

## Decision

Talents Forever is a valuable pre-release evidence source and its public export can accelerate the
WoW Forever Encyclopedia substantially. It must not become the canonical game database and the
website itself must not become a runtime dependency.

KFC Helper should import immutable copies of the full public export, validate and diff them, attach
provenance to every normalized fact, and publish a reviewed snapshot as a clearly labeled
`BlizzCon demo preview`. When the public client is available, the existing build-aware extraction
pipeline becomes authoritative and the imported observations are reconciled rather than overwritten.

The product should independently implement all player-useful capabilities:

- class talent trees, prerequisites, point allocation, reset, save, share, and keyboard/touch use;
- rank tooltips with explicit evidence and uncertainty;
- side-by-side Classic comparisons and removed Classic talents;
- level-38 demo spellbooks and detailed spell tooltips;
- race/class filters, racials, Priest race abilities, and new baseline class abilities;
- Legacy perks, a source changelog, correction reporting, public exports, and search-friendly pages.

Do not copy Talents Forever's JavaScript, CSS, branding, analytics, advertisements, donation links,
or page markup. Public availability is not a code license. Reproduce useful behavior in the existing
strict TypeScript/Next.js/KFC design system and use the public data only under its stated license.

## Inspection snapshot

This analysis inspected `https://talentsforever.com/` and its public export on 2026-09-15. The full
export was 589,258 uncompressed bytes, declared `generated: 2026-09-15`, and had SHA-256
`ca6252f8171e519437c42118d03446585b2430cbdadaca2b84c3ceefe11f84c5` at inspection time. The hash
is evidence for this inspection only; the live source can change.

The public export currently contains:

| Area                                    |                       Observed coverage |
| --------------------------------------- | --------------------------------------: |
| Classes and talent trees                |                     9 classes, 27 trees |
| Current talents                         |                                     470 |
| Talents marked complete/incomplete      |                               187 / 283 |
| Classic comparison states               | 263 changed, 119 new, 19 moved, 69 same |
| Removed Classic talents                 |                                      81 |
| Talent prerequisite relationships       |                                      71 |
| Explicitly confirmed rank markers       |              38 ranks across 33 talents |
| Explicit estimate records               |          3 rank values across 2 talents |
| Demo spellbook entries                  |                                     401 |
| Detailed spell tooltip records          |     366: 229 demo, 137 Classic fallback |
| Tooltip records with a numeric spell ID |                                     137 |
| Races and ordinary racial abilities     |                  10 races, 40 abilities |
| Priest race-specific abilities          |                       12 across 6 races |
| New/baseline class abilities            |                                      37 |
| Legacy perks                            |                       20 across 3 trees |
| Changelog entries                       |                                      40 |

The export's `_readme` says that the content was transcribed from BlizzCon 2026 demo footage and
Blizzard slides, that numbers can lag the live game, and that unconfirmed talent ranks can be
estimates. This is a preview corpus, not release truth.

### Public surface and implementation observations

The site exposes these indexable areas:

- home and nine class-specific talent calculator pages;
- Racials, Abilities, Legacy, Privacy, and class build URLs;
- a 14-URL sitemap at the time of inspection;
- the aggregate `/data.json` export and one `/data/{class}.json` export per class.

The site is a compact server-rendered HTML shell enhanced by global vanilla JavaScript datasets. It
has useful static caching and few framework costs, but every class page loads broad global data and
the data model, presentation, calculation, and persistence logic are tightly coupled. That
architecture should not be copied into the existing Next.js application.

The calculator behavior observed in its public client includes:

- one talent point per level from level 10, expressed as `max(0, level - 9)`;
- five points in lower rows per newly unlocked talent tier;
- prerequisites that must be maximized before a dependent talent can receive points;
- removal checks that prevent an allocated dependent or tier from becoming invalid;
- left click/tap to add, right click or modified action to remove, and keyboard allocation;
- desktop hover tooltips and touch hold behavior;
- class switching, per-tree reset, full reset, points remaining, and required-level feedback;
- Classic text comparison with word-level highlighting and a removed-talents section;
- local saves, restoration of the last class build, native share/copy, and an AI-friendly text copy;
- a parchment-style spellbook, class-compatible race filtering, and changelog drawer.

The site stores up to 30 builds in local storage and encodes shared builds as ordered rank strings in
the URL. Positional encoding is unsafe for a fast-changing beta: inserting or reordering a talent can
silently apply old points to a different talent. KFC Helper must use snapshot-bound stable identities.

The desktop presentation is polished and game-familiar: dark panels, gold accents, class colors,
tree background art, dependency arrows, rank badges, and game icons. The 390-pixel layout stacks the
trees successfully, but some secondary controls and status content can be clipped. Our design should
retain the game feel inside the established KFC shell while treating narrow layouts as a first-class
target.

## License and asset boundary

The export declares `CC-BY-4.0` and explicitly permits copying, adaptation, republication, and
commercial use with linked credit to Talents Forever. CC BY 4.0 requires attribution, a license link,
and an indication of modifications. It does not imply endorsement.

The export also states that game names, icons, and tooltip text belong to Blizzard. The CC license
does not turn those assets into Talents Forever-owned content. Use the maintainers' Blizzard
authorization and the existing CASC/media provenance pipeline for game assets. Do not scrape or
hotlink Talents Forever's rendered images when an authorized client-backed asset can be used.

The license boundary is:

| Material                                          | Treatment                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Structured public export                          | Import and adapt under CC BY 4.0 with attribution                  |
| Game names, icons, backgrounds, tooltip text      | Separate Blizzard rights and provenance                            |
| Talents Forever code, layout, branding, analytics | Do not copy; implement independently                               |
| Source notes and changelog HTML                   | Treat as untrusted external content; normalize to plain text/links |
| Links to third-party videos, streams, or guides   | Preserve as evidence references, not as ownership proof            |

This is a product-engineering interpretation of the published license, not legal advice. The
maintainers should retain the written Blizzard authorization with the project records.

## Data-quality findings that affect the architecture

### The aggregate feed is the only safe import source

Use `https://talentsforever.com/data.json`, not the per-class endpoints. At inspection time all nine
per-class payloads declared `generated: 2026-09-14`, while the aggregate declared 2026-09-15. The
class payloads were also served with a one-year `immutable` cache policy at stable URLs. That makes
them unsuitable for polling during a changing beta without versioned URLs.

The aggregate payload permits cross-origin access and has a five-minute cache policy, but it has no
ETag, last-modified data version, schema version, build number, or precise generation timestamp.
The importer must calculate its own content hash and assign an internal schema and snapshot version.

### The source has observations, not stable game identities

Talent records contain class/tree placement, name, rank cap, descriptions, icons, comparison data,
and optional evidence hints, but no spell or talent IDs. Most demo spell tooltip records also lack
numeric spell IDs. Names, locations, and icons can all change between the demo and beta.

Consequences:

- never insert this data into `game_build` or `spell_version` as though it came from a client build;
- never use display names or grid positions as permanent identities;
- create internal identities and maintain reviewed mappings between source observations and later
  client entities;
- retain the exact source snapshot behind every displayed value and saved build.

### Completion and derivation are not the same as confirmation

Only 187 of 470 talents are marked complete. Some incomplete talents provide one or two known ranks,
and the source UI synthesizes missing rank descriptions with scaling heuristics. A plausible linear
interpolation is still not a game fact.

KFC Helper should store and display rank evidence as one of:

1. `client_verified` — extracted from the exact public client/build;
2. `official_published` — present in a Blizzard publication;
3. `demo_transcribed` — explicitly observed from demo footage or a screenshot;
4. `source_complete_unverified` — supplied as complete but without per-rank confirmation metadata;
5. `classic_fallback` — sourced from Classic rather than Forever;
6. `derived_estimate` — generated or explicitly marked as an estimate;
7. `unknown` — deliberately not filled.

The UI may offer a clearly labeled “show estimates” option. Estimates must never silently replace
unknown ranks and must not feed BiS, damage, healing, or economic calculations.

### Embedded strings are an external-data boundary

Descriptions and changelog text can contain formatting and HTML. Parse known safe link structures
or render them as plain text. Do not pass imported strings to `dangerouslySetInnerHTML`. Validate
URLs against `https:` and an allowlist where external evidence links are made clickable.

## Target architecture

The flow should be:

```text
Talents Forever aggregate export
              |
              v
allowlisted fetch -> raw hash + immutable snapshot -> schema/semantic validation
                                                       |
                                                       v
                                             structural diff + review
                                                       |
                                                       v
                                             normalized preview tables
                                                       |
                                      reviewed publication pointer
                                                       |
                                                       v
                            Next.js server data -> calculator/content/API

Public Forever client -> CASC/DB2 extraction -> canonical game build
                                              -> reviewed entity reconciliation
                                              -> client facts supersede preview facts
```

Do not fetch Talents Forever from user requests or browser components. Runtime pages must read the
last reviewed local snapshot from PostgreSQL so that an upstream outage, schema change, or malicious
payload cannot alter the public application.

### Package and command boundary

Add a focused `packages/forever-data` package containing:

- strict TypeScript source types and Zod boundary schemas;
- source fetch, hash, normalization, semantic audit, and snapshot diff logic;
- stable-identity matching proposals and reconciliation contracts;
- pure talent allocation and build migration rules;
- a CLI used locally against the shared production database through the existing SSH tunnel.

Recommended root commands:

```text
pnpm forever:inspect
pnpm forever:import --file <path>
pnpm forever:diff --from <snapshot> --to <snapshot>
pnpm forever:publish --snapshot <id>
```

`inspect` may download the exact allowlisted aggregate URL. `import`, `diff`, and `publish` should be
separate operations so a new download cannot automatically become public. CI tests use checked-in,
small synthetic fixtures; full third-party or extracted game payloads remain out of Git.

### Snapshot and normalized schema

Do not extend the item-specific `source_claim` table or create a fake numeric client build. Add an
external-evidence boundary:

| Table family                        | Purpose                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `external_data_source`              | Source identity, URLs, license, required attribution, owner                                                   |
| `external_data_snapshot`            | Retrieval time, upstream date, SHA-256, size, raw JSON, parser version, status, audit report, parent snapshot |
| `external_entity_identity`          | Our durable UUID for a talent, tree, spell observation, racial, ability, or perk                              |
| `external_entity_observation`       | Source-local key and immutable snapshot relationship                                                          |
| `forever_talent_tree_snapshot`      | Ordered class/tree layout, art keys, display metadata                                                         |
| `forever_talent_snapshot`           | Position, name, icon, cap, passive flag, completion state, notes                                              |
| `forever_talent_rank_snapshot`      | Rank, text, evidence level, direct/derived flag, source note                                                  |
| `forever_talent_prerequisite`       | Directed prerequisite edge within the snapshot                                                                |
| `forever_classic_comparison`        | Same/changed/new/moved facts and Classic text/location                                                        |
| `forever_removed_talent_snapshot`   | Removed Classic talent observations                                                                           |
| `forever_spellbook_*`               | Class, tab/page, ordered spell entry, level/rank, missing/source notes                                        |
| `forever_spell_tooltip_observation` | Demo or Classic tooltip text and optional external spell ID                                                   |
| `forever_race_*`                    | Race/class eligibility, racials, and Priest race abilities                                                    |
| `forever_class_ability_snapshot`    | Newly baseline or materially changed class abilities                                                          |
| `forever_legacy_*`                  | Tree, perk, rank cap, and rank descriptions                                                                   |
| `external_entity_link`              | Reviewed link from an external identity to an exact canonical build entity                                    |
| `forever_publication`               | One reviewed snapshot selected for the public preview                                                         |

The 0.6 MB source is small enough to keep exact raw JSON in PostgreSQL alongside its hash, avoiding
a backup gap between the shared database and server filesystem. Insert a snapshot only when the
content hash changes. Normalized rows remain immutable and are deleted only by an explicit retention
policy; publication changes a pointer, not the historical facts.

All external rows need the source snapshot ID. A source-level note is not enough because two values
with the same name can have different evidence. For records assembled from more than one source,
store field-level observations or select a published value with an explicit winning observation.

### Identity and build links

The source has no durable talent IDs. On the first snapshot, allocate internal UUIDs. On later
snapshots, propose identity matches in this order:

1. a future exact upstream ID, if one is introduced;
2. an existing manually approved mapping;
3. exact class/tree/name with compatible rank cap;
4. a review suggestion using class, Classic counterpart, icon, description similarity, and grid
   neighborhood.

Only the first three safe cases can auto-link. A rename or move that is not exact enters review.
Never merge solely because two talents share an icon or position.

When the public client arrives, link to canonical client entities by exact ID first. Name, class,
tree, icon, and text similarity may generate a candidate but must not publish an automatic match.
The mapping records method, confidence, reviewer, timestamps, and exact game build.

## Import and publication gates

The fetcher must use a fixed HTTPS host/path, a short timeout, a response-size ceiling, restricted
redirects, and no user-supplied URL. The import then performs:

1. byte-level SHA-256 and exact raw preservation;
2. known-shape parsing while retaining unknown fields for schema-drift reporting;
3. unique class/tree/position checks within a snapshot;
4. valid row, column, rank, level, and rank-cap ranges;
5. prerequisite target existence, same-tree validation, and cycle detection;
6. complete talent rank-coverage checks without inventing missing descriptions;
7. recognized Classic status and evidence vocabulary;
8. valid icon/source-key syntax and safe outbound URLs;
9. count, deletion, placement, cap, text, and evidence changes against the published snapshot;
10. a human-readable review report before publication.

Large deletions, class loss, dependency cycles, new unknown fields, generated-date regression, or a
change from known to estimated must force `review_required`. Count changes are a warning rather than
a fixed failure because beta data should legitimately grow.

During the active beta, poll at most hourly but store only changed hashes. After data stabilizes,
daily inspection is sufficient. Alert when retrieval fails repeatedly, the published snapshot is
more than 24 hours behind a changed source during beta, or validation blocks a new snapshot.

## Calculator domain rules

Implement allocation as a pure tested domain module, separate from React and database queries. Its
inputs are an immutable snapshot, class, character level, and `{talentIdentity: rank}` allocation.
Its output includes valid allocation, points used/available, next required level, locked reasons,
and any migration warnings.

Initial source-compatible rules are:

- available points are `max(0, level - 9)`;
- a talent cannot exceed its rank cap;
- row `n` requires at least `(n - 1) * 5` points in earlier rows of that tree;
- a prerequisite must be at maximum rank before its dependent receives a point;
- removal is rejected when it would invalidate a dependent or tier allocation;
- unknown or estimated text does not change mechanical allocation legality.

These are versioned preview rules, not eternal constants. The ruleset ID belongs on every saved
build. Once client records prove different tier, point, level, or prerequisite behavior, publish a
new ruleset and migrate only when the result is unambiguous.

### Durable share and save format

Do not encode an ordered array of ranks. A public saved build should contain:

- immutable source snapshot ID and ruleset ID;
- class and level;
- stable internal talent UUID/rank pairs;
- creation time and an optional user label;
- a short random public code with no account or personal data.

`/forever/encyclopedia/talents/warrior/build/{code}` loads the original build exactly. If a newer
snapshot exists, offer an explicit migration preview listing removed, renamed, moved, and uncertain
matches. Keep local storage for drafts and use the same versioned payload. Public build URLs should
be `noindex, follow`; canonical class pages remain indexable.

## Product and route plan

Keep the agreed top-level hierarchy. `/forever` continues to show Trader and Encyclopedia rather
than adding Talents as a third product. Enable the Encyclopedia as a preview while Trader remains
gated on a real client catalog and valid Auction House scan.

Recommended routes:

```text
/forever/encyclopedia
/forever/encyclopedia/talents
/forever/encyclopedia/talents/[classSlug]
/forever/encyclopedia/talents/[classSlug]/build/[shareCode]
/forever/encyclopedia/spellbooks/[classSlug]
/forever/encyclopedia/racials
/forever/encyclopedia/abilities
/forever/encyclopedia/legacy
/forever/encyclopedia/changes
/forever/encyclopedia/sources/talents-forever
/api/v1/forever/preview.json
```

## Visual reconstruction blueprint

The spellbook and talent trees are signature product surfaces, not ordinary database tables. They
should be rebuilt deliberately as reusable React components with CSS/SVG presentation, using the
exported data and authorized game assets but none of the source site's implementation.

The component boundary should be:

```text
ForeverEncyclopediaShell
├── ClassPicker
├── TalentWorkspace
│   ├── TalentToolbar
│   ├── BuildStatus
│   ├── TalentTree × 3
│   │   ├── TalentTreeHeader
│   │   ├── TalentGrid
│   │   │   └── TalentNode
│   │   ├── PrerequisiteLayer (SVG)
│   │   └── RemovedTalentList
│   ├── TalentTooltip / TalentMobileSheet
│   └── BuildActions
└── SpellbookViewer
    ├── BookCover
    ├── BookPage
    │   └── SpellEntry
    ├── BookTabs
    ├── PageControls
    └── SpellTooltip / SpellMobileSheet
```

The route should server-render the class, tree, and spell text for search engines and resilient first
paint. Only allocation, tabs, page turning, tooltips, and save/share state need client hydration.

### Talent-tree visual construction

Each tree is a four-column CSS grid whose rows come directly from the snapshot. On wide screens the
three trees form one visual unit; below the workspace breakpoint they stack as complete trees rather
than squeezing icons and text. The exact breakpoint must follow measured available width inside the
KFC shell, not a copied device width.

The layers from back to front are:

1. build-specific tree background art using `cover` and a fixed focal point;
2. a dark contrast gradient that keeps every icon and connector readable;
3. subtle tier separators and optional point requirements;
4. an SVG prerequisite layer;
5. semantic talent buttons with icon, rank, state, and comparison/evidence badges;
6. a tooltip portal or narrow-screen action sheet outside the clipped tree container.

`TalentNode` remains a real button with a minimum 44-pixel pointer target even if the painted icon is
smaller. Its visual states need both color and shape/treatment:

| State             | Visual treatment                                          | Accessible meaning                             |
| ----------------- | --------------------------------------------------------- | ---------------------------------------------- |
| Locked            | Desaturated/dark icon, neutral border, optional lock mark | Exact unmet tier/prerequisite/point reason     |
| Available         | Green or class-tinted border with restrained glow         | Can learn one rank                             |
| Partially learned | Active border and `current / maximum` rank plate          | Can add or remove a rank                       |
| Maximum rank      | Gold border, full-color icon, solid rank plate            | Fully learned                                  |
| Unknown evidence  | Small dashed evidence marker                              | Rank text is missing or uncertain              |
| Changed/new/moved | Separate comparison badge                                 | Classic comparison state, not allocation state |

Prerequisite connectors must be derived from relationship data, not stored as pixels. After the grid
lays out, `ResizeObserver` supplies each relevant node's center point to a pure geometry helper. That
helper returns straight or orthogonal SVG paths and arrow markers. The inactive connector is muted;
it becomes gold/class-colored only when the prerequisite is satisfied. Recalculate on tree resize,
font loading, and responsive stacking. Geometry receives unit tests and screenshot coverage so lines
do not cross the wrong talent after a layout change.

The header shows the tree icon/name, points spent, share of the current build, and a small reset
control. A class banner above all three trees summarizes the selected level, total points, remaining
points, required level, and distribution. On mobile that summary becomes sticky while the three
trees remain normal document flow.

The desktop tooltip should visually match an in-game spell/talent tooltip: near-black translucent
panel, icon and gold title, rank pips, current text, next-rank delta, requirement failure, evidence,
and optional Classic diff. It reuses the existing viewport-aware placement strategy so it opens
above, below, or beside the node without leaving the screen. Touch opens a bottom sheet with explicit
Learn/Unlearn controls; tapping a small rank badge must never be the only removal mechanism.

### Spellbook visual construction

The spellbook should feel like an in-game object while remaining semantic HTML. Build the leather
cover, brass corners, parchment, center spine, paper shading, and decorative rules from original CSS
gradients plus a locally generated neutral noise texture. This avoids copying the source stylesheet
or depending on an image of a book. Game spell icons remain separately sourced authorized assets.

Desktop uses an open-book composition with a central gutter and a two-column list of up to 12 spells
per page. Each entry includes a framed icon, spell name, rank, relevant training levels, and a small
talent/source marker. School/tree tabs attach to the outside edge of the cover and use tree/class
icons. The selected tab extends and glows slightly, but the label remains visible through focus or
accessible tab naming instead of hover alone.

Page changes use a short 3D leaf turn on capable desktop browsers. The outgoing and incoming faces
are temporary presentation clones; the actual semantic page changes once per action so focus and
screen-reader order do not duplicate. Mobile and `prefers-reduced-motion` use a simple cross-fade or
instant page replacement. A corner-curl button can reinforce the book metaphor but must duplicate
ordinary Previous/Next controls with disabled and page-count states.

Desktop spell tooltips anchor inside the book and remain scrollable when their descriptions are
long. The pointer gets a short grace corridor to move from a spell to its tooltip. On mobile, the
tooltip is a bottom sheet capped below half of the viewport. Both forms show cost/cast/range rows,
description, rank/source status, and optional Classic comparison from the normalized tooltip model.

At narrow widths the book becomes a single parchment page, the tabs move into a horizontally
scrollable tablist below or above it, and spell entries become one column. The leather cover remains
visible as a frame, but no decorative layer may create horizontal page overflow. Content determines
height; the page itself must not become a nested scrolling trap.

### Visual asset manifest

Create one build-aware manifest consumed by both experiences:

```text
source key -> normalized game path -> FileDataID when known -> content hash -> public asset URL
```

An icon key such as `ability_rogue_ambush` can be normalized to its canonical
`Interface/Icons/...` path and resolved through the authorized CASC/listfile pipeline. Numeric tree
background values from the third-party export are source-local identifiers until proven otherwise;
they require an explicit reviewed mapping rather than being treated as Blizzard FileDataIDs.

The manifest audit reports resolved, exact reusable, placeholder, and missing assets for every
published snapshot. A missing image shows a deliberate class-colored fallback with initials and
preserves dimensions. It must never produce a broken-image glyph or silently substitute a vaguely
similar icon.

### Visual implementation order

1. Build static Warrior fixtures for Arms, Fury, Protection, and its spellbook from normalized test
   data.
2. Establish the tree grid, node states, connector geometry, book shell, tabs, entries, and tooltips
   without animation.
3. Verify 320, 390, 768, 1024, and 1440-pixel layouts plus keyboard and touch behavior.
4. Add restrained allocation, book-open, icon-highlight, and page-turn motion with reduced-motion
   fallbacks.
5. Connect the pure calculator and real published snapshot.
6. Capture visual regression baselines for all three Warrior trees, one long tooltip, one missing
   asset, both book page forms, and each allocation state before expanding to other classes.

This ordering makes the beauty testable. The visual shell is accepted before data volume masks layout
problems, and animation cannot conceal incorrect state or inaccessible interaction.

### Encyclopedia home

The Forever Encyclopedia home should make the evidence state unmistakable:

- `BlizzCon demo preview · source generated 15 Sep 2026 · imported <time>`;
- nine class cards with icons and completion counts;
- entry cards for Talents, Spellbooks, Racials, Class abilities, Legacy, and Changes;
- a data-health panel showing current snapshot hash, source link, license, and client-verification
  status;
- a prominent explanation that preview values can change before release.

### Talent calculator

Use the existing KFC shell and typography, then create a contained game-style workspace:

- responsive class selector with names, icons, class colors, and selected state;
- level input, total/remaining points, reset, compare, save, share, and build-summary actions;
- three trees side-by-side when space permits and independently stacked on small screens;
- tree art with a contrast overlay, SVG prerequisite lines, talent buttons, rank badges, and
  accessible locked-state explanations;
- a shared tooltip component with viewport-aware placement like the item-library tooltip;
- evidence badge and source drawer on every uncertain rank;
- optional Classic comparison and removed-talent views;
- undo/redo and confirmation before destructive full reset;
- pointer, touch, and keyboard parity without relying on right click or color alone.

Do not reproduce visual clutter merely because the source has it. On narrow screens, make the level
and point summary sticky, place secondary actions in an accessible overflow menu, and test that no
status or control clips at 320 and 390 pixels.

### Spellbooks, racials, abilities, and Legacy

Keep each dataset useful outside the calculator:

- Spellbooks get class tabs, spell-name typeahead, ordered spell tabs/pages, rank/level/source
  details, and evidence-aware tooltips. Preserve the parchment feeling without sacrificing text
  contrast or mobile navigation.
- Racials get faction and compatible-class filters, race cards, ordinary racial abilities, and a
  distinct Priest race-ability section.
- Class abilities get class navigation and a clear distinction among new, changed, and baseline
  abilities when the evidence supports it.
- Legacy gets its three perk trees, rank caps, rank descriptions, profession relevance, and the same
  evidence treatment as talents.
- Changes show normalized text diffs between our published snapshots. The upstream changelog can be
  displayed as attributed source history, but our import/publication log is the authoritative record
  of what KFC Helper changed.

### Public export

Publish a KFC-owned JSON contract from the reviewed snapshot, not a transparent proxy. Include:

- contract version, source snapshot ID/hash, upstream generation date, retrieval/publication times;
- license and attribution objects;
- normalized stable IDs and per-value evidence levels;
- a clear `preview`/`client_verified` state;
- canonical links and no unsafe HTML.

Set an ETag from the published snapshot hash and cache it immutably through a versioned URL, while a
small unversioned endpoint redirects or identifies the current version. This avoids the stale stable
URL problem observed in the source's per-class feeds.

## Asset plan

The export supplies symbolic icon keys and numeric tree-background identifiers, not an authoritative
web asset manifest. Add an asset resolver with this priority:

1. exact asset extracted from the authorized Forever client and tied to its build;
2. approved existing client asset with a recorded product/build origin;
3. a neutral KFC placeholder that preserves layout;
4. never silently substitute a similarly named icon.

Before the client launches, reuse a TBC/classic asset only when its key resolves exactly and label the
page dataset as a preview. Re-run the asset map after every client extraction. Avoid base64 blobs in
the data payload; serve immutable files through the current icon route/media root with dimensions,
content hash, fallback, and missing-asset telemetry.

## SEO, performance, accessibility, and privacy

Create stable server-rendered landing pages for every class and content area. Each gets unique title,
description, canonical URL, Open Graph image, breadcrumbs, and appropriate `VideoGame`/`WebPage`
structured data. Put only canonical content pages in the sitemap. Saved builds, arbitrary filters,
and snapshot-diff URLs remain out of the index.

Do not ship all classes and spell data to every route. Server-render the selected class summary,
hydrate only its calculator payload, and lazy-load comparison/spellbook panels. Cache by published
snapshot ID so publication invalidates cleanly. A rough target is less than 200 KB compressed initial
route data beyond shared application code and images.

Required interaction quality:

- all talent allocation actions operable with visible keyboard focus;
- semantic buttons and labels with textual lock reasons;
- `aria-live` feedback for point changes without announcing every decorative element;
- reduced-motion behavior for arrows, drawers, and page transitions;
- high-contrast fallback when tree art reduces readability;
- stable tooltip/panel behavior at 320, 390, 768, and 1440 pixels.

Use the existing KFC analytics and consent/privacy approach. Do not add Talents Forever's Google
Analytics/PostHog identifiers, advertising scripts, or tracking choices.

## Integration with later BiS and Trader work

Talent selections will eventually become build-locked inputs to the class/spec evaluator, but the
text export is not a combat model. Do not parse English descriptions into hidden stat weights or
proc behavior. Each supported talent effect needs an explicit mechanics rule with tests and a link
to a client-verified or approved evidence record. Unsupported mechanics lower BiS confidence.

Legacy profession perks can inform the account crafting network only after their yield, eligibility,
cooldown, and activation rules are structured and verified. A descriptive profession perk must not
silently alter profit. The existing rule excluding time-gated crafts from ordinary repeatable-profit
ranking remains in force.

Once linked, the combined product can answer questions the source site cannot:

- which items and professions are legal or optimal for a saved talent/spec profile;
- how a build changes stat caps and whole-loadout BiS results;
- which Legacy perks change gathering or crafting economics;
- which displayed claims come from demo footage versus an exact shipped client build.

## Delivery sequence

### Phase 1 — Evidence pipeline

- Add source/snapshot schemas, Zod contracts, allowlisted fetch, immutable raw storage, audits, and
  structural diff reports.
- Import the current aggregate export locally and publish only after a reviewed count/evidence report.
- Add source attribution and data-health endpoints before any calculator page is public.

Exit gate: a second import is idempotent; a modified fixture produces a complete, readable diff; a
malformed or structurally dangerous payload cannot be published.

### Phase 2 — Read-only Forever Encyclopedia

- Enable `/forever/encyclopedia` with class, talent, spellbook, racial, ability, Legacy, and source
  pages.
- Build the asset resolver and game-style tooltips with evidence badges.
- Add SEO metadata, sitemap entries, responsive states, and the public normalized export.

Exit gate: every normalized source record is reachable or accounted for in a coverage report, all
preview content is attributed, and mobile/keyboard checks pass.

### Phase 3 — Talent calculator

- Implement the pure allocation engine and property/regression tests.
- Add prerequisite arrows, add/remove/reset, Classic compare, save, stable share, copy summary,
  migration preview, and touch/keyboard behavior.
- Add server-side build validation so manipulated URLs cannot persist illegal allocations.

Exit gate: allocation invariants hold under randomized action sequences; save/share round trips are
exact; an old build never silently maps points to a different talent.

### Phase 4 — Operational updates

- Add hourly beta inspection, changed-hash-only storage, review alerts, snapshot publication, and
  source freshness/status UI.
- Add maintainers' correction workflow and a structured audit trail.

Exit gate: upstream outage or schema drift leaves the last reviewed snapshot available and visibly
dated; no external update can auto-publish.

### Phase 5 — Public-client reconciliation

- Run the existing Forever client extraction checklist.
- Map external identities to exact client talents, spells, races, and assets with reviewed links.
- Promote client-verified values field by field while retaining the demo snapshots and comparisons.
- Change the product badge from `Demo preview` only when the published client build passes all gates.

Exit gate: every promoted client fact has exact build provenance, mismatches are visible, and preview
fallbacks remain explicitly labeled.

### Phase 6 — BiS and economy integration

- Feed saved build/ruleset identity into the later class mechanics evaluator.
- Structure verified Legacy profession effects for the crafting-network model.
- Keep unknown mechanics out of numeric recommendations and expose confidence/coverage.

This phase deliberately follows client reconciliation; it must not turn descriptive pre-release
text into authoritative rankings or gold predictions.

## Verification matrix

The implementation is not complete until it has:

- parser fixtures for optional/missing ranks, all description shapes, unknown keys, bad URLs, and
  upstream schema drift;
- snapshot/hash/idempotency, diff, publication-state, and rollback-pointer tests;
- talent graph tests for missing prerequisites, cycles, tier constraints, caps, removal, and levels;
- randomized add/remove allocation tests and stable save/share/migration round trips;
- database constraint and transactional import tests;
- server rendering and API contract tests that prove provenance/attribution are present;
- Playwright tests for mouse, keyboard, and touch-size flows at common viewport widths;
- tooltip viewport placement tests and visual snapshots for each class/tree state;
- missing/broken asset coverage checks with no layout collapse;
- metadata, canonical, robots, sitemap, JSON-LD, and `noindex` share-page tests;
- production smoke checks through PM2/Nginx without changing the TBC routes.

The baseline counts in this document are audit expectations for the 2026-09-15 source snapshot, not
hard-coded eternal limits.

## Principal risks and mitigations

| Risk                                 | Mitigation                                                             |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Demo values change rapidly           | Immutable snapshots, hourly diff, human publication gate               |
| Missing source IDs                   | Internal UUIDs, reviewed identity matching, snapshot-bound builds      |
| Estimates look authoritative         | Field/rank evidence badges and estimates disabled by default           |
| Upstream feed lags or breaks         | Aggregate feed only, local reviewed database, last-good publication    |
| Old share links corrupt              | Stable identity/ruleset/snapshot encoding and explicit migration       |
| Game assets mistaken for CC content  | Separate Blizzard provenance and authorized extraction                 |
| Untrusted source HTML reaches the UI | Boundary validation, plain-text normalization, safe URL policy         |
| Preview text is treated as mechanics | Explicit rule implementations only; no free-text numeric inference     |
| All-class payload harms performance  | Server-selected class data and lazy secondary panels                   |
| Product drifts from KFC design       | Reuse shell/tokens/components; game styling only inside content frames |

## Recommended immediate slice

Implement Phase 1 first and stop at a reviewed, queryable snapshot plus coverage report. It creates
the durable source boundary needed by every visible feature and lets the team inspect source changes
as the beta begins. The next vertical slice should be Warrior: one class page, its three trees,
source-aware tooltips, allocation engine, and stable share format. Once that passes the full
verification matrix, the other eight classes are data expansion rather than nine separate UI builds.
