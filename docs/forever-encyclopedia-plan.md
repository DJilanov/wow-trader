# WoW Forever proper Encyclopedia plan

Last verified: 2026-09-17 against `wow_classic_beta` build `1.60.1.69893`.

## Decision

Build the Encyclopedia as an evidence-backed graph over four complementary sources:

```text
exact client DB2 + client art       static identities, maps, encounters, quest IDs, source hints
exact client Lua API documentation  supported runtime observation/query surface
in-game collector observations      encounter actors, loot, quest details, approximate locations
reviewed supplemental evidence      AtlasLoot, authorized Blizzard data, maintainer corrections
```

This is enough to make a useful browser map, instance and boss pages, observed loot connections, and
a growing quest library. It is not enough to claim that every shipped record is live or that the
static client contains complete spawn and loot tables.

The product must preserve that distinction. Every map pin, item source, quest, boss actor, and drop
estimate carries its build, evidence type, availability state, and confidence. No fuzzy name match
becomes a public fact without review.

## Delivery status

The static World Explorer portion of this plan is implemented for review snapshot 69893:

- two-level Encyclopedia navigation and grouped world search;
- searchable, filtered, image-backed map, instance, and boss directories;
- Leaflet `CRS.Simple` maps over the native client tiles with place, flight, quest-region, and exact
  boss-point layer support plus an accessible text result surface;
- 313 canonical encounter names across 41 dungeon/raid maps, with all raw difficulty variants kept
  as drill-down evidence;
- criteria-backed boss pages with identity, location, encounter, spell, model, tuning, and possible
  item-source sections;
- build-derived map/instance/boss sitemap entries and a 60-second published database read cache.

No current boss-location row has point precision, so the exact boss layer is empty by design. The
remaining phases still require runtime quest details, observed actors/loot/locations, model resolver
results, WDT/WMO instance maps, review promotion, and coverage reports.

## What build 69893 actually contains

### Maps and spatial data

| Table                 | Readable rows | Encrypted records | What it contributes                                       |
| --------------------- | ------------: | ----------------: | --------------------------------------------------------- |
| `Map`                 |            73 |                 8 | World/instance identity, names, type, parent, WDT file ID |
| `MapDifficulty`       |           142 |                 4 | Build-scoped map/difficulty variants                      |
| `AreaTable`           |         1,372 |                45 | Zones, subzones, parent hierarchy, map ownership          |
| `UiMap`               |            60 |                 0 | Player-facing world/zone map hierarchy                    |
| `UiMapAssignment`     |            61 |                 0 | World-coordinate bounds and UI-map assignments            |
| `UiMapArt`            |           144 |                 0 | UI-map art identities and styles                          |
| `UiMapArtTile`        |         1,672 |                 0 | Ordered art-tile FileDataIDs                              |
| `UiMapXMapArt`        |            60 |                 0 | UI map to art relationship                                |
| `WorldMapOverlay`     |         1,081 |                 0 | Explored-area overlays and offsets                        |
| `WorldMapOverlayTile` |         1,739 |                 0 | Overlay tile FileDataIDs                                  |
| `WMOMinimapTexture`   |       155,868 |                 0 | WMO minimap texture inventory                             |
| `AreaPOI`             |           372 |                 0 | Named client POIs with world coordinates                  |
| `TaxiNodes`           |           100 |                 0 | Named flight points with world coordinates                |
| `GameObjects`         |         1,514 |                 0 | Client-shipped static object placements                   |

The 60 UI maps include the ordinary Classic world and zone maps plus new Beta maps for Mount Hyjal,
Zephras Isle, Darkspear Islands, Riverglades, and Shen'dralas. Zephras Isle has both a normal zone
art set and a standalone UI-map variant.

The map-art path was proven, not merely inferred. All 12 Mount Hyjal `UiMapArtTile` FileDataIDs opened
from CASC and decoded as 256×256 BLP tiles. Its art style declares a 1,002×668 map layer, so the 4×3
tile grid is cropped to the declared layer dimensions. The same deterministic extraction can process
the other UI maps.

Some newer instances exist as `Map` rows but not as `UiMap` rows. For those, the client still exposes
the WDT root through `Map.WdtFileDataID`; outdoor terrain uses WDT/ADT data and interior/global-WMO
maps can use WMO minimap textures. That makes instance-map generation possible, but it is a separate,
more complex renderer—not a direct UI-map tile join.

### Instances and encounters

| Table                      | Readable rows | Encrypted records | Important result                                                             |
| -------------------------- | ------------: | ----------------: | ---------------------------------------------------------------------------- |
| `LFGDungeons`              |            71 |                 5 | Instance/zone names and content tuning; Classic rows do not populate `MapID` |
| `DungeonEncounter`         |           341 |                57 | Encounter names, exact map relationship, difficulty and order                |
| `JournalInstance`          |             0 |                 0 | No Adventure Guide instance descriptions                                     |
| `JournalInstanceEntrance`  |             0 |                 0 | No static entrance coordinates                                               |
| `JournalEncounter`         |             0 |                 0 | No Adventure Guide encounter records                                         |
| `JournalEncounterCreature` |             0 |                 0 | No static encounter-to-creature link                                         |
| `JournalEncounterItem`     |             0 |                 0 | No static encounter loot list                                                |
| `JournalEncounterSection`  |             0 |                 0 | No static boss ability guide                                                 |
| `JournalEncounterXMapLoc`  |             0 |                 0 | No static boss map pins                                                      |

`LFGDungeons` includes new readable entries for City of Dalaran, Ruins of Lordaeron, Hall of Thanes,
and Excavation Site: Wetlands. Its `MapID` is zero even for ordinary Classic dungeons, so LFG rows
must not be automatically joined to `Map` by ID. `DungeonEncounter.MapID` is the stronger instance
relationship; exact-name similarity can only propose a reviewed LFG-to-map link.

### Static boss identity bridge

The achievement graph supplies a second, previously unused encounter source:

| Table          | Readable rows | Contribution                                                  |
| -------------- | ------------: | ------------------------------------------------------------- |
| `Achievement`  |           233 | Client-authored completion groups and instance achievements   |
| `CriteriaTree` |         1,951 | Hierarchical boss/completion labels                           |
| `Criteria`     |         1,353 | Typed criteria; type `0` stores a creature ID in `Asset` here |

The type-`0` interpretation was verified against legacy data: the Onyxia kill criterion has asset
`10184`, Onyxia's established creature ID. The same structure exposes exact new name/ID pairs without
entering their instances. The current build yielded 69 relevant new/high-ID criterion rows, 39 unique
name/ID pairs, and 30 unique creature IDs. Examples include:

| Client-authored name  | Creature ID | Achievement/instance context |
| --------------------- | ----------: | ---------------------------- |
| The Wild King         |      250079 | Hyjal Summit                 |
| Sonya Darkhallow      |      259912 | Barrow Deeps                 |
| Shade of the Archmage |      246020 | City of Dalaran              |
| Rath'mael             |      250657 | Ruins of Lordaeron           |
| Relic Guardian        |      260326 | Excavation Site              |
| Min'loth              |      260274 | Drowned City                 |
| Overlord Mugg         |      258968 | Krol'dok Stronghold          |
| Nanaya                |      261809 | Shaper's Terrace             |

Import criteria as typed evidence, not as an untyped number. Type `0` is eligible for a
`criteria_creature_id` assertion. Other types remain separate; for example, Time-Lost Battalion uses
type `165` with asset `3339` and must not become creature `3339`. Preserve the full achievement and
criteria-tree ancestry so the UI can explain why a creature is associated with an instance.

This evidence proves a client-authored boss objective and exact creature ID. It does not prove phase
availability, spawn location, loot, every phase/add, or that a similarly named `DungeonEncounter` is
the same entity. Exact normalized names may auto-propose an encounter edge; aliases and group fights
require maintainer review.

The `0.2.3` world normalizer implements this graph. Build 69893 currently yields 169 typed creature
objectives and 60 boss identities, of which 30 use IDs at or above 200,000. The normalizer keeps
achievement/dungeon context separate from aliases because Blizzard reuses one creature criterion in
both boss-kill and dungeon-completion trees. This prevents labels such as `City of Dalaran` from
being mistaken for a creature name while still allowing a reviewed location proposal.

Exact encounter names and exact `Map`/`AreaTable` context currently produce 76 boss-location rows.
For the 30 new/high IDs, 16 rows cover seven bosses; none is a point coordinate. Shade of the
Archmage, Rath'mael, and Relic Guardian have direct exact encounter-to-map edges. Exact area context
also proposes potential zones for Varrox Bleakhoof, Overlord Mugg, and Nanaya, among others, but those
area matches remain review-required and must not be rendered as spawn pins.

### Item-source and loot evidence

The initial audit missed a useful source-hint family:

- `CollectableSourceInfo` has 1,288 readable rows.
- 1,282 rows join through `ItemModifiedAppearanceID` to 1,282 exact item IDs.
- 785 of those item IDs are at least 200,000 and therefore especially relevant to the newer client
  content.
- The descriptions contain client-authored strings such as named bosses, dungeon names, quest
  rewards, reputation rewards, professions, world monsters, and world rares.

Examples include source text for Onyxia, Azuregos, Jin'do the Hexxer, Heigan the Unclean, Grobbulus,
quest rewards, and profession sources. This is valuable item-to-source evidence, but it is an
unstructured appearance source hint—not a complete loot table. It covers wearable appearances, can
contain design/test labels, has no drop rate, and does not supply an encounter ID.

The corresponding static structured tables are empty in this build:

- `CollectableSourceEncounter` and `CollectableSourceEncounterSparse`;
- `CollectableSourceQuest` and `CollectableSourceQuestSparse`;
- `JournalEncounterItem` and `JournalItemXDifficulty`;
- generic `SourceInfo`.

`CreatureDifficultyTreasure` has 14,021 readable records and 482 encrypted records, but exposes no
item relationship in this layout. It cannot be used to manufacture a loot table.

The implemented source-candidate artifact contains 802 review-required edges: 23 boss, 68 encounter,
272 map, and 439 area candidates. They are exact normalized phrase matches against client-authored
appearance-source text, with generic area labels such as `Unused`, `Ruins`, and `Blacksmith`
suppressed. No exact source hint names one of the 30 new/high bosses in build 69893, so there is still
no honest static new-boss loot table. Zone-level labels such as Zephras Isle can be proposed, but
profession, quest, reputation, and art-development labels must not be presented as drops.

### Quests

| Table/cache        | Observed state                           | Meaning                                                    |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------- |
| `QuestV2`          | 6,600 readable IDs, 90 encrypted records | A large quest identity list, but no titles or descriptions |
| `QuestInfo`        | 7 rows                                   | Type labels such as Elite and PvP                          |
| `QuestLine`        | 3 named rows                             | To Have Loved and Lost, Toxic Soil, PvP Season Journey     |
| `QuestLineXQuest`  | 22 rows                                  | Ordered membership for those three lines                   |
| `QuestPOIBlob`     | 54 rows                                  | Quest/objective map geometry for 22 unique quest IDs       |
| `QuestPOIPoint`    | 99 rows                                  | Points belonging to those POI blobs                        |
| `QuestObjective`   | 0 rows                                   | No complete static objective catalog                       |
| `QuestPackageItem` | 0 rows                                   | No complete static reward item catalog                     |
| `questcache.wdb`   | 32-byte empty header                     | No server-supplied quest templates observed yet            |

Of the readable `QuestV2` IDs, 1,742 are at least 90,000. That is useful for discovery but not proof
that every high ID is a Forever quest or currently available. The client also contains old, internal,
test, and future-facing data.

## Exact runtime capabilities in the Beta client

The following are declared by Blizzard's generated Lua API documentation shipped inside this exact
product/build. Presence documents the API surface; each event still needs a Beta runtime test before
the collector relies on its delivery semantics.

### Encounter identity and actors

- `ENCOUNTER_START` supplies encounter ID, name, difficulty ID, and group size.
- `ENCOUNTER_END` supplies the same context, success, and `EncounterUnitStatus` entries.
- Each `EncounterUnitStatus` includes an exact creature ID, creature name, and remaining-health
  percentage.
- `BOSS_KILL` supplies the encounter ID and name.

This is the missing safe bridge from a `DungeonEncounter` to its actual creature actors. It removes
the need to infer boss NPC IDs from similar names. Creature display/model binding can then use the
observed creature ID plus a populated WDB creature record.

For bosses already identified through type-`0` achievement criteria, instance access is no longer
required to obtain the first creature ID. Encounter events remain the stronger later evidence for
multi-actor fights, forms, exact encounter membership, and live availability.

### No-instance model resolver

The same generated API documentation exposes a promising model bridge that can run while logged in
anywhere:

- `PlayerModel:SetCreature(creatureID, displayID = 0)` asks the model widget to load a creature;
- `FrameAPICharacterModelBase:GetDisplayInfo()` returns the resolved display ID;
- `SimpleModelAPI:GetModelFileID()` returns the loaded model's FileDataID.

API presence is not proof that an arbitrary uncached or server-owned creature ID resolves in this
Beta. Add a diagnostics-only resolver and test four controls: an ordinary known creature, Onyxia
`10184`, one new criteria-derived boss, and an invalid ID. Poll until the model reports loaded or a
short timeout expires; record the requested creature ID, resolved display ID, model file ID, build,
attempt count, and failure state. No raid or dungeon visit is needed for this test.

If the new boss resolves, batch only the reviewed criteria-derived IDs and repeat each request enough
times to detect a default/random display variant. The result is client-resolved evidence, not an
observed-live boss. If it fails, do not guess from nearby display IDs or anonymous model filenames;
use the achievement icon/name until encounter access or another authoritative mapping exists.

Collector `0.4.0` implements this as explicit `bossmodels controls|start|pause|resume|status|reset`
commands. The control run contains a common creature, Onyxia, The Wild King, and an invalid ID. The
batch contains the 30 reviewed build-69893 IDs three times each and stores status, display ID, model
FileDataID, build, attempt, and timestamp. It never starts automatically and refuses another build.

Static spell review is also implemented. Exact boss-name/text mentions, `SpellEffect` misc values
equal to a reviewed creature ID, and criterion modifier assets that resolve to spells produce 175
review-required candidates. Thirty-one candidates cover seven new/high bosses. These candidates are
useful spellbook leads, not proof of a live cast or an encounter phase.

### Encounter and quest loot

- `ENCOUNTER_LOOT_RECEIVED` supplies encounter ID, item ID, item link, quantity, item name, and icon
  filename.
- `QUEST_LOOT_RECEIVED` supplies quest ID, item link, and quantity.
- `QUEST_CURRENCY_LOOT_RECEIVED` supplies quest ID, currency ID, and quantity.
- Generic loot events such as `LOOT_READY`, `LOOT_OPENED`, and `LOOT_SLOT_CHANGED` are present for a
  capability-tested loot-slot/source-GUID collector.

`ENCOUNTER_LOOT_RECEIVED` provides an exact observed encounter-to-item edge. It does not by itself say
whether the client receives every group drop or only a subset in this ruleset, and it does not provide
the official drop probability. Validate its coverage against the visible loot window and group loot
messages during controlled Beta runs before using event counts as a denominator.

### Quest discovery and loading

- `C_QuestLog.RequestLoadQuestByID(questID)` requests quest data.
- `QUEST_DATA_LOAD_RESULT(questID, success)` reports the result.
- `C_QuestLog.GetTitleForQuestID`, `GetQuestObjectives`, and `GetQuestTagInfo` expose loaded facts.
- `C_QuestLog.GetQuestsOnMap(uiMapID)` exposes currently relevant map quest entries.
- `C_QuestLine.GetQuestLineQuests` and `GetQuestLineInfo` expose line relationships.
- `C_Map.GetMapArtLayers`, `GetMapArtLayerTextures`, `GetMapPosFromWorldPos`, and
  `GetWorldPosFromMapPos` provide exact-build map validation and coordinate conversion.

This makes a server-queryable quest index realistic. It does not guarantee that arbitrary hidden,
test, retired, encrypted, or phase-locked quest IDs will return data. The collector must pace requests,
persist progress, stop on throttling/failures, and never run a 6,600-ID query loop automatically for
ordinary players.

## UX audit and target experience

The first world slice proves the data and map-art pipeline, but it is still presented as separate
technical directories. The target product is a connected **World Explorer**: a player searches once,
opens a map or entity, and moves between zones, instances, bosses, quests, spells, items, and
professions without learning the storage model.

The rendered desktop and mobile audit found these specific gaps:

- sixty maps are presented as equal alphabetical cards with no hierarchy, preview, search, or
  emphasis on new Forever content;
- the map begins too far below repeated hero/build/navigation chrome, especially on mobile;
- the current viewer scrolls a scaled DOM image but does not provide drag/pinch interaction,
  selection details, shareable view state, clustering, or a synchronized result panel;
- only POI and taxi markers render; quest geometry is loaded but unused, and static game objects
  have no trustworthy map relationship yet;
- the flat Encyclopedia tab strip is too wide for mobile and mixes character, world, and future
  economy sections at one level;
- instance cards count raw difficulty-specific encounter records and use `Map.MapType` as a dungeon/
  raid label. Blackfathom Deeps therefore appears as a raid with 21 encounters even though the
  client marks `InstanceType = 1` and those rows span difficulty variants;
- some criteria-derived completion targets use a dungeon label rather than a creature name. These
  require canonical review instead of a confident boss card;
- map-only boss evidence, possible spells, and appearance-source matches must not look like exact
  locations, confirmed casts, or loot tables;
- the web data layer currently loads an entire published world snapshot for narrow pages. Public
  routes need targeted, build-scoped queries and cached read models before more entity families are
  added.

### Information architecture

Keep existing URLs stable, but replace the single long tab row with two levels:

```text
Overview | Character | World | Economy | Changes
                     World: Maps | Instances | Bosses | Quests
```

The Encyclopedia home starts with a grouped global typeahead. Results rank exact numeric ID, exact
name, prefix, alias, then token matches and group by entity type. A result shows its type, parent
context, availability/evidence state, and game build. Categories with no publishable Forever data do
not expose empty public pages.

`Maps` becomes the visual world directory and absorbs the ordinary `Zones` browsing use case. It
shows a hierarchy (`Azeroth -> continent -> zone`), a prominent “New in Forever” collection,
map thumbnails, and filters for continent, zone, battleground, native art, and available data
layers. Technical IDs remain available but secondary. Alternate/system maps are hidden behind an
advanced filter rather than appearing as duplicate continent cards.

### Map-page composition

Desktop uses a map-first split view: approximately 70% interactive map and 30% synchronized search/
result panel. Mobile uses a compact title and search, a map occupying roughly 55–65% of the viewport,
and a draggable bottom sheet. The large repeated build-status box becomes a compact build/evidence
chip with details in a drawer.

Use a lazily loaded Leaflet viewport with `CRS.Simple` and one optimized, immutable composite image
per UI map. Preserve source PNG/checksum artifacts offline, but serve content-hashed WebP/AVIF map
media directly through the web server rather than routing 1,672 PNG reads through Next.js. The
viewer must support drag, wheel and button zoom, pinch zoom, reset, fullscreen, keyboard pan/zoom,
selected-marker focus, and URL-backed layer/focus/zoom state.

The synchronized layer model is:

1. client places and flight points;
2. reviewed instance entrances;
3. quest starts/objectives/turn-ins and POI polygons;
4. exact or observed boss locations;
5. rare/NPC density aggregates;
6. reviewed static objects;
7. observed item/resource sources when their semantics are proven.

Marker shape as well as colour communicates evidence. Exact client/API points use solid pins,
observations use circles with sample counts, approximate locations use a radius or heatmap, and
review candidates use dashed styling and are disabled by default. A map-only or area-only boss
relationship appears in the side panel and never creates a point pin. Every selected feature shows
plain-language evidence, precision, build, sample count, last observation, and a link to its entity.
The same visible results are server-rendered as a textual list for accessibility and search engines.

### Canonical read models before visual polish

Build publication must derive targeted read models rather than joining everything during a request:

```text
encyclopedia_search_document
ui_map_summary
map_feature
instance_summary + encounter_variant
boss_profile
quest_profile
canonical_entity_override + relationship_review
```

`map_feature` stores normalized UI coordinates or geometry, assignment ID, adapter version,
precision/radius, evidence kind, review state, and entity link. It does not replace the typed source
tables. Candidate relationships remain hidden from ordinary public layers until reviewed.

Instance summaries use `Map.InstanceType`, group encounter rows by reviewed canonical encounter and
difficulty, and keep every raw ID available in an evidence panel. Boss canonicalization prioritizes
an exact encounter name, then explicit kill/statistic criteria, then reviewed aliases; ambiguous
completion targets use a neutral `Creature <id>` label until resolved. Editorial overrides are
append-only, build-scoped, attributable, and never rewrite extracted artifacts.

### Connected entity pages

- An instance page has difficulty tabs, an entrance/world map, canonical boss order, quests, and
  evidence-separated reviewed, observed, and possible loot.
- A boss page has a portrait/model fallback, instance and area context, abilities, loot, location,
  and an expandable evidence section. Possible spells and source hints are visibly candidates.
- A quest page is public/indexable only after a verified title exists. It uses an in-game-inspired
  detail panel, chain navigation, objectives, rewards, giver/turn-in evidence, and synchronized map
  geometry. Untitled structural IDs remain maintainer coverage, not a public ID wall.
- Spell, item, recipe, and profession pages backlink to the same typed relationships when the
  Forever catalog passes publication gates; TBC data is never used as an implicit fallback.

### Delivery order

1. Correct canonical instance/encounter/boss summaries and add review overrides.
2. Replace full-snapshot public reads with targeted queries, publication caches, a search document,
   and a map-feature read model.
3. Simplify responsive navigation/hero chrome and ship global grouped search.
4. Replace the map viewport, add hierarchy/thumbnails/layers/detail panel/shareable state, and render
   current quest geometry.
5. Publish connected boss and instance pages with strict evidence separation.
6. Publish quests only after the controlled query experiment provides titles and runtime semantics.
7. Add WDT/ADT/WMO instance floors, model media, NPC density, and observed loot as their individual
   verification gates pass.

Acceptance includes no horizontal document overflow at 320 px, full keyboard and touch operation,
no candidate rendered as an exact pin/drop/cast, correct instance labels and difficulty grouping,
targeted page queries, immutable media caching, and visual regression coverage at mobile, tablet,
and desktop sizes.

## Browser map design

### Map artifact pipeline

Generate immutable map media offline during reviewed build extraction:

```text
UiMap -> UiMapXMapArt -> UiMapArt -> UiMapArtStyleLayer
                                  -> UiMapArtTile.FileDataID
                                                     |
                                                     v
CASC BLP -> checked PNG -> declared-dimension composite -> web tile pyramid
                                                     |
                                                     v
map-media-manifest.v1 with build, dimensions, hashes, and missing assets
```

Store output under a build-scoped path such as:

```text
media/maps/wow_classic_beta/69893/<ui-map-id>/<zoom>/<column>/<row>.webp
```

Keep the decoded source-tile checksums and declared crop dimensions in the manifest. Do not recompress
in place when the client build changes; a new build receives a new immutable directory.

Use a dynamically loaded Leaflet viewport with `CRS.Simple` for the website. It already supports
non-geographic image maps, markers, overlays, zooming, touch interaction, and keyboard-oriented map
work. Server-render a textual list of the visible entities beside or below it so navigation, SEO, and
accessibility do not depend on the canvas/map interaction.

### Coordinate adapter

Do not scatter map formulas across React components. Implement one build-tested adapter:

```ts
interface MapCoordinateAdapter {
  worldToUiMap(input: WorldPoint, requestedUiMapId?: number): UiMapPoint | null;
  uiMapToWorld(input: UiMapPoint): WorldPoint | null;
}
```

It uses `UiMapAssignment.Region`, `UiMin`, `UiMax`, area/WMO constraints, and assignment ordering.
Because WoW axes and map orientation are easy to reverse, validate the offline result against the
client's `C_Map.GetMapPosFromWorldPos` and `GetWorldPosFromMapPos` for a golden set on every supported
map family. Store the assignment ID used for every transformed point.

### Map layers

Provide independently toggleable layers:

- zones/subzones and explored-area overlays;
- flight points;
- client POIs and entrances;
- static client game objects, filtered by useful type;
- quest starts, objectives, turn-ins, and reward quests;
- reviewed instance entrances;
- boss encounter observations;
- rare and ordinary mob observations;
- item-source observations;
- profession/resource layers later, if authorized observations support them.

Each pin or region displays its evidence badge, last-seen build/time, sample count, and precision.
Never render a player-at-kill coordinate as an exact spawn point.

### Spatial precision model

Use explicit precision instead of a single misleading coordinate:

| Precision           | Meaning                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `exact_client`      | Static client POI, taxi node, game object, or quest POI coordinate                       |
| `exact_api`         | Runtime API returned an entity position directly and capability testing proved semantics |
| `player_proximity`  | Player location when target, interaction, kill, loot, or encounter event occurred        |
| `cluster_centroid`  | Aggregate center of repeated proximity observations                                      |
| `area_polygon`      | Quest POI or derived mob activity region                                                 |
| `entrance_observed` | Player transition point outside an instance                                              |
| `manual_reviewed`   | Maintainer placed and reviewed                                                           |

Include a radius/error estimate for approximate points. For ordinary mobs, publish a heatmap or area
polygon after enough observations rather than dozens of false-exact pins.

### Dungeon and raid map fallback

Use this order:

1. Native `UiMap` art when present.
2. Client minimap/WMO minimap output when a stable map relationship can be resolved.
3. Offline top-down WDT/ADT/WMO render with a reviewed coordinate transform.
4. A textual encounter-order page with entrance/world-zone map until a floor map is trustworthy.

`wow.export` can serve as an audited reference for the WDT/ADT/WMO cases because it supports Classic,
overhead map viewing, zone map export, raw ADT/WDT handling, and global-WMO minimaps. Conversion stays
offline; the production website never opens CASC files.

## Boss and mob positioning

### Bosses

The encounter observer should record:

- product, build, realm, map/instance ID, difficulty, group size, and phase context;
- encounter start/end IDs, names, outcome, and timestamps;
- all `EncounterUnitStatus` creature IDs and names;
- player world/UI-map position at encounter start, boss kill, and encounter end;
- hostile unit position only if an explicit Beta capability test proves that the API returns it;
- combat spell IDs and display evidence where already authorized by the collector scope.

Repeated successful observations create a boss-fight location cluster. This is good enough for an
informative map pin without pretending that the boss's exact server spawn was shipped in DB2.

### Ordinary and rare mobs

The static client does not expose the realm's complete creature spawn table. Build mob coverage from
an opt-in survey mode using low-cost events:

- decode NPC IDs from observed GUIDs on target/mouseover/nameplate/kill/loot events;
- store name, classification, level, map, difficulty/phase, and player position;
- when supported, join loot-slot source GUIDs to item IDs;
- coarsen positions into build/map-scoped cells before upload;
- deduplicate rapid observations of the same GUID and cap SavedVariables growth;
- aggregate server-side into sample counts, bounds, centroids, and density cells.

The ordinary AH watcher should not continuously survey the world. Survey mode is separately enabled,
visible, and performance-budgeted.

### Static game objects

`GameObjects` provides 1,514 client-defined placements, including signs, meeting stones, journals,
and other static objects on old and new maps. Preserve them, but classify by type before displaying.
They are useful for landmarks and some quest-object evidence; they are not creature spawns.

## Loot and source graph

### Do not store one `item.source`

An item can be a boss drop, trash drop, quest reward, vendor item, crafted result, and legacy source
across different builds or phases. Store source assertions and observations:

```text
item
  <- source_assertion -> encounter | creature | quest | vendor | profession | area | instance
  <- loot_observation -> exact runtime event/session
  <- source_estimate  -> derived frequency with denominator, method, and confidence
```

Every assertion contains:

- build, phase/availability scope, difficulty, and locale;
- source entity and item ID;
- evidence kind and raw evidence pointer;
- confidence/review state;
- whether it claims possible source, observed drop, curated table membership, or probability.

### Evidence kinds

Use at least:

- `client_source_hint` — retained `CollectableSourceInfo.Description` joined to the exact item;
- `client_structured` — a future non-empty Journal/Collectable source relationship;
- `encounter_loot_observed` — exact encounter/item runtime event;
- `mob_loot_observed` — loot source GUID/item observation;
- `quest_reward_observed` — quest detail/complete/loot event;
- `atlasloot_curated` — versioned imported addon evidence;
- `blizzard_authorized` — authorized structured feed;
- `maintainer_reviewed` — explicit correction with audit history.

Parse source-hint descriptions into review candidates, retaining the original string. Exact normalized
boss-name matches can receive high candidate confidence but still require review because the strings
can describe appearance provenance or internal design notes rather than a live drop.

### Dungeon loot pages

An instance page aggregates, but never conflates:

- reviewed boss loot by encounter;
- observed boss loot awaiting sufficient coverage;
- observed trash/rare loot within the instance;
- dungeon quests and their guaranteed/choice rewards;
- curated AtlasLoot or authorized source data;
- unresolved client source hints mentioning the instance.

The item detail page links back to the same evidence records. There is one graph and two read models,
not manually duplicated source text.

### Drop-rate estimates

Record successful encounter attempts separately from loot events. Before calculating frequency,
verify whether `ENCOUNTER_LOOT_RECEIVED` reports every group drop, only the local player's loot, or a
ruleset-dependent subset. Store the verified observation model with the collector version.

When semantics and sample size are adequate, display:

- observed drops and eligible observations;
- raw observed frequency;
- a confidence interval;
- realm/build/phase/difficulty scope;
- last observed timestamp.

Label it “observed,” never “official.” Do not publish a percentage from source hints, AtlasLoot lists,
AH appearances, or item presence in the client.

## Quest Encyclopedia

### Identity and availability states

Start with all readable `QuestV2` IDs, then promote them through evidence states:

1. `client_id_present` — structural ID exists in the exact build;
2. `server_queryable` — `QUEST_DATA_LOAD_RESULT` succeeded;
3. `map_or_line_present` — client supplies a POI or quest-line relationship;
4. `offered_observed` — a real quest giver offered it;
5. `accepted_observed` — it entered a character quest log;
6. `completed_observed` — a completion event was observed;
7. `available_live` — reviewed as currently obtainable;
8. `hidden_test_or_retired` — reviewed out of normal browsing.

Do not expose 6,600 empty public pages. Index public quest pages only after a title and at least one
server-query or observation fact exists. Keep unresolved IDs in the maintainer coverage report.

### Controlled query collector

Add a maintainer-only quest scan mode:

```text
QuestV2 IDs -> paced RequestLoadQuestByID -> QUEST_DATA_LOAD_RESULT
                                          -> title/tag/objectives/line/map facts
                                          -> SavedVariables checkpoint
                                          -> desktop authenticated upload
```

Requirements:

- explicit start/pause/resume controls;
- small configurable batches and delay/backoff;
- no operation during combat;
- durable cursor keyed by product/build/locale;
- separate successful, failed, timed-out, and throttled results;
- no retry storm and no automatic scan for ordinary addon users;
- raw API payload versioning before normalization.

First run a stratified 100-ID capability sample: ordinary Classic quests, new high IDs, POI-linked
quests, line-linked quests, encrypted neighbors, and deliberately absent IDs. Expand only after the
result and server impact are understood.

### Offer/progress/completion observer

The richest quest fields can be captured when the player opens or completes a quest:

- title, quest text, objective text, progress/completion text;
- quest level, type/tag, suggested group size, timer, class/race/profession restrictions exposed by
  the API;
- ordered objective descriptions and completion requirements;
- guaranteed and choice item rewards, money, XP, reputation, currency, and spells;
- giver/ender NPC or object GUID/name plus player proximity position;
- quest map, POI geometry, and quest-line membership;
- observed previous/next quest transition without automatically claiming a hard prerequisite.

Archive the resulting `questcache.wdb` after stable writes, keyed by build and locale. The parser and
API observer should reconcile records; neither silently overwrites conflicting evidence.

### Quest-chain limits

The current static client only provides 22 explicit `QuestLineXQuest` memberships. Observing quest B
after quest A does not prove that A is a mandatory prerequisite. Store:

- explicit client line/order edges;
- observed transitions;
- API-reported relationships, if any;
- curated or authorized prerequisite edges.

Only the last two categories can become a “requires quest” edge after review. The UI can still show
an evidence-labeled storyline order separately.

### Quest pages and filters

Provide:

- typeahead by title or exact ID;
- zone/map, quest line, level, type, faction, class/race, profession, availability, and reward filters;
- an in-game styled quest detail panel;
- giver, objectives, turn-in, and reward sections;
- map overlay with precision/evidence labels;
- previous/next storyline navigation;
- linked reward item tooltips and source backlinks;
- explicit incomplete-data and unavailable states.

## Product information architecture

The Forever Encyclopedia becomes a unified search surface, not separate disconnected tools:

```text
/forever/encyclopedia
  /items
  /recipes
  /professions
  /spells
  /classes
  /maps
  /zones
  /instances
  /encounters
  /npcs
  /quests
```

Global typeahead groups results by entity type and supports exact numeric IDs. Every entity page links
to related entities:

- item → recipes, quests, encounters, mobs, vendors, sets, BiS later;
- encounter → instance, actors, map, abilities, observed/curated loot;
- NPC → model, maps/areas, encounters, quests, observed loot;
- quest → giver/ender, objectives, map, line, rewards;
- map/zone → POIs, instances, quests, mobs, encounters;
- profession → recipes, teaching items, source hints, Trader profitability.

Use one product/build resolver for every route. TBC and Forever facts never share an implicit current
build.

## Storage and snapshot boundaries

Do not put thousands of map assets or runtime observations inside the item catalog manifest. Use
separate immutable inputs joined by `game_build`:

| Manifest/data family           | Responsibility                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `catalog-snapshot-manifest.v5` | Forever item/profession/recipe extraction and completeness changes                            |
| `world-snapshot-manifest.v1`   | Maps, areas, instances, encounters, criteria bosses, spell/location/source candidates, quests |
| `map-media-manifest.v1`        | Decoded map/overlay tiles, dimensions, hashes, conversion version                             |
| `model-media-manifest.v1`      | Reviewed creature/model assets and converted artifacts                                        |
| Collector observations         | Mutable append-only runtime evidence keyed to an immutable build                              |

This revises the earlier idea of placing every encounter/model artifact into catalog schema v5. The
catalog and world snapshots advance independently but cannot be published against different game
build identities.

### Typed source tables

Add typed owning tables rather than a generic unvalidated EAV store:

```text
ui_map_version, ui_map_assignment_version, map_art_layer, map_art_tile, map_overlay
area_version, client_poi_version, static_game_object_version
instance_version, encounter_version, encounter_actor_version
creature_version, creature_location_observation, creature_location_aggregate
quest_version, quest_objective_version, quest_reward_version, quest_relation, quest_poi
encounter_attempt, encounter_loot_observation, mob_loot_observation
source_assertion, source_assertion_review, drop_estimate
```

A derived `map_feature` read model may flatten typed spatial entities for fast bounding-box queries.
The authoritative relationships remain in typed tables with foreign keys. Normalized UI-map X/Y
coordinates plus build/map indexes are sufficient initially; do not require PostGIS for this scale.

## Delivery plan

### Implementation status — 2026-09-17

- Phases 1–3 have a working review-only slice for build 69893: typed extraction/import contracts,
  complete native UI-map media, coordinate conversion, map/zone directories, and instance/encounter
  pages with honest empty states.
- Phase 4 has a local opt-in recorder for encounter attempts, actors, encounter loot, ordinary loot
  source GUIDs, and NPC sightings. Its companion/API/database ingestion and runtime semantic review
  are intentionally pending.
- Phase 5 has the 6,600-ID structural index, three lines, 22 memberships, 54 POI blobs, and a pinned
  100-ID query experiment. A general scanner and public titled quest archive are intentionally
  pending the experiment.
- Phase 6 has the bounded raw NPC/loot observation recorder, static criteria boss graph, reviewed
  model-resolution experiment, spell/location/source candidate artifacts, and typed PostgreSQL
  import tables. Running the model controls, diagnostics ingestion, density aggregation, reviewed
  public promotion/pages, and WDT/ADT/WMO rendering remain pending.
- The extracted snapshot cannot be published because this beta installation has no `DBCache.bin`
  and the exact Forever catalog has not passed its publication gates.

### Phase 1 — Static world snapshot

- Add the audited map/area/LFG/encounter/quest/source-hint tables to a Forever world profile.
- Emit table availability, encrypted counts, raw/effective evidence, and normalized world artifacts.
- Import transactionally as `review_required` and produce a build diff.
- Join 1,282 source hints to exact items while retaining six unresolved relationships.

### Phase 2 — Native browser maps

- Generalize the BLP decoder into a map-art extractor.
- Build `map-media-manifest.v1`, composites, and an immutable web tile pyramid.
- Implement the coordinate adapter and validate it against exact-client `C_Map` results.
- Ship the map directory and viewer with POI, taxi, area, and filtered game-object layers.
- Add textual/list fallbacks, mobile gestures, keyboard controls, and reduced-motion handling.

### Phase 3 — Instance and encounter directory

- Group `DungeonEncounter` rows by map/difficulty and reviewed canonical identity.
- Reconcile LFG display entries to maps without trusting zero `MapID` values.
- Publish instance/encounter pages with honest empty states for map, loot, abilities, and models.
- Add reviewed entrance observations.

### Phase 4 — Encounter and loot observer

- Capability-test the exact Beta encounter and loot events.
- Extend the addon/SavedVariables/desktop/API contracts with encounter attempts, unit status, and loot.
- Bind encounter actors by the exact creature IDs from `ENCOUNTER_END`.
- Compare event coverage with visible group loot before enabling observed frequencies.
- Reconcile creature cache/display IDs for models.

### Phase 5 — Quest index

- Import 6,600 readable quest identities and the static line/POI facts into maintainer coverage.
- Run the 100-ID controlled query experiment.
- Implement resumable maintainer scanning only after the experiment passes.
- Add offer/progress/completion/reward observation and WDB cache parsing.
- Publish only server-queryable or observed titled quests.

### Phase 6 — Mob survey and dungeon maps

- Add opt-in, bounded mob/loot observation and density aggregation.
- Generate WDT/ADT/WMO instance maps offline, starting with one simple terrain instance and one
  global-WMO instance.
- Validate orientation, scale, floors, and pins before generalizing.

### Phase 7 — Review and estimation

- Add source-hint parsing and reviewed encounter/quest/profession/source linking.
- Import versioned AtlasLoot evidence and any authorized Blizzard source feed.
- Enable observed drop-frequency presentation only for validated event semantics and adequate sample
  coverage.
- Add public coverage reports by items, quests, instances, encounters, models, and maps.

## Acceptance gates

### Maps

- All 60 native UI maps have complete, checksummed tile manifests or an explicit missing-asset state.
- Composite dimensions and tile ordering match the in-game map.
- World/UI coordinate conversion matches client API goldens across both continents and every new zone.
- Approximate observations are never styled as exact pins.
- The map is usable by mouse, touch, keyboard, and a textual alternative.

### Encounters and loot

- Encounter actor IDs come from runtime unit status or another explicit relationship, never names
  alone.
- Encounter loot events are compared with real group loot and their coverage semantics are stored.
- Source hints retain raw text and stay visibly distinct from observed or curated loot.
- Difficulty, build, phase, attempt denominator, and sample size scope every estimate.
- No client table presence is displayed as a drop rate.

### Quests

- Static IDs, successful server queries, offers, acceptances, and completions remain separate states.
- The controlled query experiment records success/failure/throttle behavior before scanning expands.
- Quest text and rewards match in-game golden samples.
- Quest POIs align with client maps after coordinate conversion.
- Test/hidden IDs do not produce indexable empty pages.
- Observed sequence is not mislabeled as a required prerequisite.

## Recommended immediate slice

Implement the static world snapshot and native browser maps first. They are already proven by exact
client data and do not depend on Beta play sessions. In parallel, add a small diagnostics-only addon
recorder for one dungeon run and a 100-ID quest query sample. Those two experiments determine the
real runtime semantics before we commit to public drop estimates or a full quest scan.

The resulting first proper Encyclopedia milestone is:

- searchable items, recipes, professions, maps, zones, instances, encounters, and titled quests;
- authentic in-game map art with evidence-aware layers;
- exact client source hints linked to items;
- observed encounter actors and loot, clearly separated from complete/official loot claims;
- visible coverage reports showing exactly what is still unknown.

## Research references and reproducibility

- DB2 layouts are pinned to WoWDBDefs revision `403d095cc9eda997c61571cfe18a418cad9ae08f`:
  <https://github.com/wowdev/WoWDBDefs>.
- WDT/ADT/WMO and minimap export behavior can be cross-checked against the MIT-licensed wow.export
  implementation: <https://github.com/Kruithne/wow.export>.
- The browser-map recommendation uses Leaflet's documented non-geographical `CRS.Simple` mode:
  <https://leafletjs.com/examples/crs-simple/crs-simple.html>.
- Row counts, encryption counts, source joins, map-tile decoding, and Lua API/event signatures in
  this document were verified locally against `wow_classic_beta` build `1.60.1.69893`; they must be
  rerun and diffed for every shipped Beta or Forever build.
