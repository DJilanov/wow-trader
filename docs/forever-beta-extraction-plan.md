# WoW Forever Beta extraction plan

Last verified: 2026-09-17

## Outcome

The installed WoW Forever Beta client is usable as a build-versioned source for the product, but the
three requested areas have different completeness limits:

| Area                    | What the installed client can provide now                                                                              | Important limit                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Professions and recipes | Profession lines, recipe spells, reagents, outputs, cooldown metadata, item requirements, and many new high-ID records | Some referenced rows are encrypted or absent; profession hierarchy and modern item-effect relationships need new normalization |
| Item Encyclopedia       | 19,171 named item rows plus class/subclass, requirements, binding, sets, sockets/bonuses, spells, and build provenance | The current TBC stat parser is incompatible with this build's budget-based item layout and must be replaced for Forever        |
| Bosses and encounters   | 341 encounter rows plus achievement criteria that expose at least 30 exact new/high creature IDs                       | Criteria do not prove live availability, every actor/form, location, or loot                                                   |
| Model assets            | A large model inventory plus exact-client `SetCreature`, display-ID, and model-file-ID APIs                            | The no-instance resolver must be capability-tested; unresolved IDs still require later observation or authoritative evidence   |

The right implementation is not to import the first successful parse directly into production. Add a
Forever product profile, preserve every raw record and gap, validate exact-build golden examples,
import as `review_required`, and publish only after review.

The expanded map, instance, loot, mob, and quest research—including exact runtime encounter/loot and
quest API capabilities—is in `docs/forever-encyclopedia-plan.md`.

## Installed client evidence

The inspected application is:

```text
/Applications/World of Warcraft/_classic_beta_/World of Warcraft Beta.app
```

The CASC installation root supplied to the extractor must remain:

```text
/Applications/World of Warcraft
```

Blizzard stores the shared `.build.info` at that root, not inside the `.app` bundle. The product is
selected by the matching `_classic_beta_/.flavor.info` row.

| Field             | Verified value                        |
| ----------------- | ------------------------------------- |
| Product           | `wow_classic_beta`                    |
| Client version    | `1.60.1.69893`                        |
| Build number      | `69893`                               |
| Build key         | `70dc75547c16ac2a381fde65945a0e85`    |
| CDN key           | `ae86d19f4ff37f2239363425d9289417`    |
| Locale / region   | `enUS` / `eu`                         |
| Local hotfix file | No `Cache/ADB/enUS/DBCache.bin` found |

The client currently contains several `Cache/WDB/enUS` files, but each inspected file is only a
32-byte empty header. They cannot currently supply an NPC-to-display mapping. This can change after
the client is played and queried, so the observer pipeline should watch these files by build and
never overwrite an earlier copy.

The inspected upstream WoWDBDefs revision
`403d095cc9eda997c61571cfe18a418cad9ae08f` includes layouts explicitly tagged for
`1.60.1.69893`. Definitions remain a pinned snapshot input: advancing them can change decoded fields
and must trigger a full extraction, diff, and review.

## Probe results

### Existing catalog tables

The current extractor opened and decoded 34 of its 36 TBC catalog tables. These two tables are not
present for this product/build:

- `ItemRandomProperties`
- `ItemRandomSuffix`

Their absence should be recorded as `not_available_for_build`, not treated as a corrupt extraction.
All other tables currently expected by the TBC catalog opened. Selected effective counts were:

| Table                | Readable rows | Encrypted records/sections reported by the reader |
| -------------------- | ------------: | ------------------------------------------------: |
| `Item`               |        31,675 |                                                70 |
| `ItemSparse`         |        19,171 |                                                66 |
| `ItemSearchName`     |         6,621 |                                                 5 |
| `ItemSet`            |           532 |                                                 0 |
| `ItemSetSpell`       |         1,462 |                                                 0 |
| `ItemXBonusTree`     |         2,050 |                                                 0 |
| `ItemBonusTreeNode`  |         1,466 |                                                 0 |
| `ItemBonus`          |         1,124 |                                                 0 |
| `Spell`              |        31,767 |                                               872 |
| `SpellName`          |        31,767 |                                               872 |
| `SkillLine`          |           154 |                                                 0 |
| `SkillLineAbility`   |         7,824 |                                                 0 |
| `SpellEffect`        |        42,449 |                                             1,219 |
| `SpellReagents`      |         3,338 |                                                38 |
| `ItemEffect`         |        12,571 |                                                41 |
| `ItemDisenchantLoot` |            54 |                                                 0 |

Across the 34 current catalog tables, the probe reported 4,525 encrypted records or encrypted-section
records. An encrypted record is an explicit coverage gap. It must survive into the manifest and
coverage report; it must never become a fabricated name, reagent, output, stat, or source.

### Provisional normalization

A diagnostic-only run that skipped the two unavailable tables produced:

- 19,171 named items;
- 31,754 spells;
- 2,520 provisional recipes;
- 8,494 recipe inputs and 2,520 recipe outputs;
- 532 item sets, 824 set members, and 1,453 set effects.

It also exposed the exact incompatibilities that must be fixed before importing:

- zero normalized item stats, damage rows, resistances, sockets, item effects, teaching-item links,
  and item transformations;
- 198 reagent references and 352 output references without a normalized named item;
- a hidden/test line named `Test Profession [DNT]` among the detected profession lines;
- no local hotfix overlay;
- encrypted records that can explain part, but not necessarily all, of the missing references.

The diagnostic recipe count proves that the graph is present. It is not a completeness claim. The
existing normalizer currently calls some recipes complete even when a referenced item is unavailable;
Forever must use explicit `complete`, `partial_encrypted`, `partial_missing_reference`, and
`ambiguous_relationship` states.

### Why the current item-property result is empty

The `1.60.1.69893` `ItemSparse` layout contains stat type and budget-related columns such as:

```text
StatModifier_bonusStat[10]
StatPercentEditor[10]
StatPercentageOfSocket[10]
```

It does not contain the fixed `StatModifier_bonusAmount`, `MinDamage`, `MaxDamage`, or `Resistances`
columns expected by the current TBC normalizer. The actual values must be derived from the exact
build's item-level, quality, inventory type, stat allocation, curves, and armor/damage budget tables.

Similarly, this build's decoded `ItemEffect` layout does not expose the `ParentItemID` field used by
the current normalizer. The relationship must be obtained from correctly decoded DB2 relationship
metadata or a corrected exact-build definition. Joining by similar numeric IDs or names is not an
acceptable fallback.

## Extraction architecture

### 1. Introduce product profiles

Replace the single hard-coded table array with an explicit, tested product profile:

```ts
interface ExtractionProductProfile {
  readonly product: string;
  readonly supportedVersionRange: string;
  readonly requiredTables: readonly string[];
  readonly optionalTables: readonly string[];
  readonly itemPropertyStrategy: "fixed-fields" | "budget-derived";
  readonly relationshipStrategy: "inline-parent" | "db2-relationship";
  readonly goldenFixture: string;
}
```

`wow_anniversary` keeps its existing behavior. `wow_classic_beta` uses a Forever profile where the
two random-property tables are optional and the modern scaling/relationship tables are required.
Before extraction, an inventory command should report every requested table as:

- `available`;
- `available_empty`;
- `not_available_for_build`;
- `definition_missing`;
- `decode_failed`;
- `encrypted_partial`.

Only tables explicitly optional for that product/build may be absent without failing validation.
Do not catch a general table-open exception and continue.

### 2. Add a deterministic Forever command

The target developer surface is one command:

```text
pnpm extract:forever
```

It should set these defaults while retaining the existing environment overrides:

```text
WOW_ROOT=/Applications/World of Warcraft
WOW_PRODUCT=wow_classic_beta
WOW_LOCALE=enUS
WOW_REGION=eu
WOWDBDEFS_REVISION=<reviewed exact revision>
CATALOG_OUTPUT=<existing ignored snapshot root>
```

The command must print the resolved product, version, build, locale, definitions revision, hotfix
state, profile, output directory, table availability, encrypted counts, normalized counts, and
validation outcome before returning a status code.

### 3. Make hotfix state precise

The current extractor treats every missing `DBCache.bin` as non-publishable. For Beta, distinguish:

- `applied` — a local hotfix cache was found, hashed, and decoded;
- `expected_but_missing` — the product/build is known to use a cache but it was unavailable;
- `not_observed` — no cache exists and there is not yet enough evidence to call that normal;
- `not_applicable` — validated product behavior shows that this build legitimately has no local
  overlay.

The current build starts as `not_observed` and remains non-publishable until verified. Absence alone
is not proof that the overlay is irrelevant.

### 4. Preserve raw and unavailable identities

Continue writing base and effective raw NDJSON with checksums. Extend the manifest with:

- product profile/version;
- requested table inventory and status;
- readable, encrypted, and skipped counts per table;
- relationship-section decode status;
- hotfix discovery paths checked;
- unresolved entity/reference counts grouped by reason;
- model-asset extraction tool and conversion versions when model artifacts are added.

An item catalog must include every accessible name-bearing item. Structural-only or encrypted item
IDs belong in a separate gap index so the website can say, for example, “352 recipe outputs are not
name-resolvable in this build,” rather than either hiding the gap or exposing blank item pages.

## Professions and recipes

### Source graph

Use the same evidence-first graph as TBC, with the Forever relationship fixes:

```text
SkillLine
  -> SkillLineAbility
      -> Spell / SpellName
          -> SpellReagents                       recipe inputs
          -> SpellEffect                         crafted item/enchant outputs
          -> SpellLearnSpell                     taught recipe/spell chains
          -> SpellCooldowns + SpellCategories    cooldown evidence
          -> SpellCastTimes                       craft time
      -> ItemEffect relationship                 recipe-teaching item
      -> Item / ItemSparse                       item requirement and result facts
```

### Profession hierarchy

Forever contains root professions, child skill lines, possible specializations/tiers, and test data.
Do not assume every skill line with recipe-like abilities is a player profession. Normalize:

- root profession identity;
- child/tier/specialization identity;
- parent evidence and rank domain;
- learn/unlearn or mutually exclusive specialization rules where present;
- recipe ownership at the actual skill line plus a resolved root profession;
- hidden/test/deprecated flags.

`[DNT]`, test, unused, internal, or otherwise hidden records remain in raw evidence and are excluded
from the player-facing directory by default. They can be exposed in a maintainer diagnostics view.

Several new `SkillLineAbility` records use rank values and `SkillupSkillLineID` relationships that do
not map cleanly to the TBC root-line assumption. Validate the resulting profession, rank, and recipe
assignment against the in-game profession UI before publication.

### Recipe completeness

For every recipe store:

- exact build and recipe spell ID;
- owning skill line and resolved root profession;
- required rank and any required specialization/ability/item;
- ordered reagent IDs, counts, and resolution state;
- deterministic outputs, ranges, probabilities only where encoded, and resolution state;
- cooldown category/duration and whether it is excluded from ordinary profit ranking;
- teaching item relationship with evidence source;
- extraction status and unresolved reasons;
- raw-record pointers.

The circular-economy planner may consume only deterministic, non-cooldown transformations by
default. Daily or shared cooldown crafts remain visible but do not enter the ordinary repeatable
profit graph, matching the existing product rule.

### Golden validation set

Before publication, a maintainer should provide a small cross-section from the live Beta UI:

- at least two recipes for each production profession;
- a trainer recipe, a world-drop recipe, and a recipe-teaching item where available;
- one multi-output craft;
- one enchant with no physical item output;
- one specialization-locked craft;
- one cooldown craft;
- one recipe referencing an unavailable/encrypted item.

The validator compares profession, spell/item IDs, rank, reagents, outputs, and cooldown semantics.
No golden is inferred from a third-party website.

## Item Encyclopedia

### Required normalized surface

The Forever item record should expose the same stable interface as TBC:

- ID, localized name/description, quality, item level, required level;
- class/subclass, inventory slot, binding, uniqueness and durability;
- class/race, profession, reputation, and ability restrictions;
- armor, block, weapon damage/speed/DPS, resistances, and ordered stats;
- sockets, socket bonus, gems, enchantments, random/bonus-tree facts;
- item use/equip/proc effects and resolved spell tooltips;
- set membership and set bonuses;
- sell price and other static economic properties when present;
- icon and raw/build provenance;
- completeness flags for every derived family.

### Forever stat derivation

Add and audit the exact-build tables used by the Beta's item-budget system. The implementation should
start by inventorying and decoding the applicable families rather than assuming every historical
table is still active:

- item armor quality/total/shield families;
- item damage families by weapon type and hand;
- random property point budgets;
- item-level selectors, curves, scaling, and quality multipliers referenced by the decoded layout;
- socket allocation and stat-percent fields;
- bonus-tree modifiers that can alter item level or stats.

Keep the derivation pure and build-specific: raw decoded row plus lookup tables in, normalized values
and a derivation trace out. Each stat, armor, and damage result must be validated against an in-game
tooltip sample across low/high item levels, qualities, armor slots, one-hand/two-hand/ranged weapons,
socketed items, and at least one bonus-tree variant.

If a field cannot yet be derived, publish it as unavailable with its reason. A zero value is a real
value and must not be used as a synonym for “not decoded.”

### Search and filtering

Parameterize the current Encyclopedia loader by route product instead of its hard-coded TBC product.
The Forever route should use the same typeahead interaction and item tooltip design, then add indexed
server-side filters for:

- item ID/name;
- quality;
- class/subclass and inventory slot;
- item-level and required-level ranges;
- binding;
- allowed class/race;
- required profession and rank;
- stat type and minimum amount;
- sockets, item sets, and item-spell/effect presence;
- data status: complete, partial, encrypted dependency, or unavailable property family.

Build/product must be mandatory query scope in every database access. A newly imported Beta build
must never replace or contaminate the published TBC catalog.

## Encounters, bosses, and models

### Static encounter evidence

The Beta contains 341 readable `DungeonEncounter` rows and reports 57 encrypted records. `Map`
contains 73 readable rows and reports 8 encrypted records. The decoded encounter rows provide:

- encounter ID and localized name;
- map relationship;
- difficulty ID;
- encounter order;
- flags, faction, world-state/bit fields;
- spell-icon file ID and item-sequence level where present.

They include recognizable new map groups such as Demon Fall Canyon, Tainted Scar, Storm Cliffs,
Nightmare Grove, Karazhan Crypts, Scarlet Enclave, the City of Dalaran, Ruins of Lordaeron, and the
Hall of Thanes. They also include legacy, Season of Discovery, test, and duplicate difficulty rows.
Therefore the static extractor should call them encounters, not automatically bosses or live content.

Use these availability states:

1. `client_present` — found in the exact client build;
2. `officially_announced` — backed by a retained Blizzard source;
3. `observed_in_game` — seen by the collector on a real realm/build;
4. `available_live` — confirmed accessible in the current phase;
5. `retired_or_test` — reviewed as not player-facing.

Client presence alone never proves phase availability.

### Empty Adventure Guide tables

The following tables opened successfully but contained zero rows in this build:

- `JournalTier`, `JournalTierXInstance`, and `JournalInstance`;
- `JournalEncounter`, `JournalEncounterCreature`, and `JournalEncounterSection`;
- `JournalEncounterItem`, `JournalEncounterXDifficulty`, and `JournalEncounterXMapLoc`;
- `CollectableSourceEncounter` and `CollectableSourceEncounterSparse`;
- `WorldBossLockout` and `EncounterEvent`.

Consequently, this client does not currently supply Adventure Guide descriptions, boss ability
sections, Journal loot links, map pins, or a Journal encounter-to-creature/display association. Keep
these tables in the optional profile so a later build activating them produces a visible structural
diff and can enrich the same schema.

### Achievement criteria recover boss creature IDs

The empty Journal path does not mean every boss identity is inaccessible. Build 69893 also contains
233 `Achievement`, 1,353 `Criteria`, and 1,951 `CriteriaTree` rows. In this data, a type-`0`
criterion uses `Asset` as a creature ID. The legacy Onyxia criterion resolves to creature `10184`,
which validates the field semantics against a known control.

The same join found 69 relevant new/high-ID criterion rows, representing 39 unique name/ID pairs and
30 unique creature IDs. It recovers complete named groups for Hyjal Summit and Barrow Deeps and
individual identities such as Shade of the Archmage `246020`, Rath'mael `250657`, Relic Guardian
`260326`, Min'loth `260274`, Overlord Mugg `258968`, and Nanaya `261809`.

The importer must retain criterion type and ancestry. Only type `0` creates a creature assertion;
other criterion types can use the same numeric range with different semantics. Store the result as
`criteria_creature_id`, distinct from `observed_actor`, and separately review its relationship to a
`DungeonEncounter` when the labels are aliases or describe a group fight.

### Semantic encounter grouping

Do not diff TBC and Forever solely by encounter ID. Many old encounters have different IDs or
difficulty variants. Build a reviewed canonical grouping over normalized:

```text
(map identity, normalized encounter name, difficulty family, encounter order)
```

Retain each original ID as a build-scoped variant. Similarity can generate review candidates, but it
must not automatically merge renamed encounters or two actors with similar names.

### Model binding without entering an instance

`DungeonEncounter` in this build has no creature or display identifier. Static model tables are
large—14,092 `CreatureDisplayInfo` rows, 8,914 `CreatureDisplayInfoExtra` rows, 1,169
`CreatureModelData` rows, and 121,095 `ModelFileData` rows—but they are an asset inventory, not a
boss-name mapping. The 178 readable `Creature` rows are mostly pets and player-related dummies and do
not close the gap. Anonymous `unk_exp00_*` model paths also cannot safely establish identity.

Achievement criteria now close the name-to-creature-ID part for at least 30 IDs. The exact Beta API
documentation supplies a candidate creature-ID-to-model bridge:

- `PlayerModel:SetCreature(creatureID, displayID = 0)`;
- `FrameAPICharacterModelBase:GetDisplayInfo()`;
- `SimpleModelAPI:GetModelFileID()`.

Build a small diagnostics-only addon panel that runs while the player is anywhere, renders one ID at
a time, waits for the model to load, and exports the requested ID, resolved display ID, model file ID,
build, attempts, and status to SavedVariables. First test a known ordinary creature, Onyxia `10184`,
a new criteria-derived ID, and an invalid ID. The exact API surface is proven; arbitrary Beta ID
resolution is not, so this capability gate must pass before a batch run.

The safe binding pipeline is:

```text
Achievement -> CriteriaTree -> type-0 Criteria.Asset
        |
        v
client-authored boss name + exact creature ID
        |
        v
PlayerModel:SetCreature outside the instance
        |
        v
resolved display ID + model FileDataID
        |
        v
CreatureDisplayInfo / CreatureModelData when joinable
        |
        v
CreatureModelData.FileDataID -> M2/SKIN/BLP dependencies
        |
        v
reviewed criteria boss -> default model association
```

Run each ID repeatedly and retain all distinct results because a creature can have multiple or random
displays. Never substitute nearest IDs or visually similar assets. The evidence label must distinguish
`client_model_resolved` from `observed_actor_model`: the first is sufficient for a reviewed
Encyclopedia preview but does not claim the boss was encountered or that every combat form is shown.

If the new-ID control does not resolve, the proper fallback is the client-authored boss name and icon,
not a guessed model. A generated gallery of models added since a prior build can help maintainers
investigate, but manual visual similarity alone stays an unpublished candidate.

### Later encounter validation

Extend the addon with a separate, opt-in encounter observer that records only API-visible game facts:

- product, version, build, realm, map, difficulty, and timestamp;
- encounter-start/end IDs and names;
- current target/focus/boss-unit `UnitGUID`, NPC ID, name, level, and classification;
- actor coordinates when the API permits them;
- observed combat spell IDs;
- observed loot item IDs, without inventing a drop probability.

SavedVariables flow through the existing desktop watcher and authenticated ingestion path. Repeated
observations strengthen identity confidence; they do not by themselves establish an exhaustive loot
table.

After an observed NPC causes the client to populate WDB data, archive the build-scoped cache and parse
the NPC-to-display relationship. A boss may legitimately have several actors, displays, forms, or
phases, so model association is one-to-many and evidence-backed. This later pass validates encounter
membership, additional actors/forms, live availability, position, and loot; it is no longer a blocker
for criteria-backed names or a successfully resolved default model.

### Model extraction and web delivery

Once a display is linked, resolve and extract its exact M2, SKIN, texture, attachment, and animation
dependencies from CASC. Convert the selected model offline to GLB/glTF, generate a poster image, and
serve immutable build-scoped assets. `wow.export` is a useful implementation reference because it is
MIT-licensed, supports Classic data, previews M2/WMO assets, and exports glTF; production should
either call a controlled offline conversion pipeline or adapt only the required audited components.

The browser viewer should:

- lazy-load only on the encounter detail page;
- fall back to the poster and expose a clear load error;
- support rotate, zoom, reset, reduced motion, and keyboard operation;
- cap texture/model sizes and validate converted artifacts before publishing;
- show every reviewed form/model with its evidence state;
- display “Model pending observation” when no trustworthy binding exists.

Never choose a model by fuzzy name, visual similarity, or nearby numeric ID.

### Loot boundary

`CreatureDifficultyTreasure` contains many rows, but its presence does not prove an encounter-to-item
drop or a probability. With the Journal loot tables empty, the client cannot currently supply the
requested exhaustive boss loot data. Store separately:

- static client encounter facts;
- individually observed loot events;
- authorized Blizzard loot/source data if supplied later;
- reviewed AtlasLoot/community evidence;
- estimates derived from repeated observations.

Every displayed source and drop chance needs its evidence type and build/phase scope. No observation
count is presented as an official probability.

Build 69893 also contains 1,288 `CollectableSourceInfo` strings, 1,282 of which join through
`ItemModifiedAppearance` to exact item IDs. These are useful client-authored source hints for bosses,
dungeons, quests, professions, vendors, and world sources, but remain unstructured appearance
provenance rather than complete loot tables. The exact client API documentation additionally exposes
`ENCOUNTER_LOOT_RECEIVED`, which can create exact observed encounter-to-item edges after its delivery
semantics are verified in a controlled Beta run. See `docs/forever-encyclopedia-plan.md`.

## Database contract

Keep the existing build-scoped catalog and add narrowly owned encounter/model tables:

```text
map_version
  build_id, map_id, name, map_type, parent_map_id, raw_record

encounter_version
  build_id, encounter_id, map_id, difficulty_id, name, order_index,
  flags, spell_icon_file_id, availability, raw_record

encounter_canonical
  id, canonical_name, review_status

encounter_variant
  canonical_id, build_id, encounter_id, match_method, reviewed_by, reviewed_at

encounter_actor_observation
  build_id, encounter_id, creature_id, guid, observed_name, map_id,
  difficulty_id, observed_at, scan_id, evidence_status

creature_display_version
  build_id, creature_id, display_id, model_file_data_id, raw_record

model_asset
  build_id, file_data_id, source_sha256, artifact_sha256, format,
  byte_size, conversion_version, publication_status

encounter_actor_model
  observation_id, display_id, model_asset_id, association_status,
  reviewed_by, reviewed_at
```

Use database foreign keys for build-local relationships and uniqueness keys that include `build_id`.
Add optional Journal section/creature/item tables now only if it simplifies later activation; zero-row
tables must not produce fake child records.

Forever item/profession changes should become catalog snapshot schema v5. Maps, areas, encounters,
quest structure, and item-source hints belong in a separate `world-snapshot-manifest.v1`; map and
model binaries use separate media manifests. The snapshots share the exact `game_build` identity but
can evolve independently. V4 TBC catalog snapshots remain readable by their existing code path; they
must not be silently upgraded.

## Delivery sequence

### Phase 0 — Preserve the audit

- Record this build metadata and exact definitions revision.
- Keep diagnostic output outside Git and do not import it.
- Add fixture-sized sanitized table metadata where tests need it; do not commit extracted game data.

### Phase 1 — Forever extraction profile

- Replace the hard-coded TBC table list with product profiles.
- Add table inventory/status reporting and the `pnpm extract:forever` wrapper.
- Add correct hotfix states and per-table encryption/gap counts.
- Prove a deterministic raw rerun on build 69893.

### Phase 2 — Items and recipes

- Decode DB2 relationship metadata for `ItemEffect`.
- Inventory and add the build's item budget/scaling tables.
- Implement pure Forever stat/armor/damage derivation with traces.
- Normalize profession hierarchy and filter hidden/test lines.
- Propagate unresolved/encrypted references into extraction status.
- Add Forever golden recipes and tooltip fixtures.

### Phase 3 — Contract, validation, and import

- Introduce schema v5 contracts and normalized artifacts.
- Add audit coverage for every derived Forever property and relationship.
- Add semantic diff reports for items, recipes, professions, table availability, and encrypted gaps.
- Import the snapshot as `review_required`; review before promotion.

### Phase 4 — Product UI

- Parameterize catalog queries by TBC or Forever route product.
- Ship Forever typeahead item/recipe/profession search and property filters.
- Add coverage and incomplete-data diagnostics for maintainers.
- Keep Talents Forever preview observations separate and reconcile only reviewed entity matches.

### Phase 5 — Static encounter directory

- Extract `Map`, `DungeonEncounter`, difficulty, and icon facts.
- Add semantic grouping/review tooling and availability labels.
- Publish encounter pages with static client facts and explicit missing sections.

### Phase 6 — Static boss identities and no-instance model resolution

- Import the achievement/criteria graph and typed creature-ID assertions.
- Add the diagnostics-only `SetCreature` capability test and SavedVariables contract.
- Resolve reviewed criteria IDs, retain all distinct results, and review default model associations.
- Add offline model dependency extraction/conversion, immutable media manifests, and the accessible web
  viewer.

### Phase 7 — Observed actor, form, location, and loot enrichment

- Add the in-game encounter/loot observer when the content becomes accessible.
- Archive and parse newly populated WDB cache data by build.
- Reconcile observed actors and displays with the criteria-backed default models.
- Add positions, alternate combat forms, adds, availability, and observed loot without overwriting the
  original evidence.

### Phase 8 — Beta update watcher

- Detect a new `wow_classic_beta` build without auto-publishing it.
- Run extraction, validation, and semantic diff into a new immutable snapshot.
- Alert on definition failures, table activation/removal, encryption changes, golden mismatches, and
  large topology changes.
- Require review and explicit publication for every Beta update.

## Publication gates

A Forever catalog build is publishable only when all applicable gates pass:

- exact product/build/locale/definitions/hotfix state is recorded;
- every required table is available and every optional absence is explicit;
- repeated extraction produces identical artifact checksums;
- encrypted and unresolvable identities are counted and visible;
- no dangling recipe reference is labeled complete;
- hidden/test profession lines are excluded from normal browsing;
- golden recipes match profession, ranks, inputs, outputs, and cooldown rules;
- golden item tooltips match stats, armor, damage, restrictions, sockets, and effects;
- TBC snapshot behavior remains unchanged;
- the import is transactionally `review_required` before explicit promotion;
- encounter rows are labeled as client presence, not automatically live bosses;
- criterion assets become creature IDs only for the validated criterion type;
- model associations have client-resolved or observed evidence and maintainer review;
- a client-resolved default model is not labeled as an observed combat form;
- no loot source or probability is inferred from a model, encounter, or treasure-table presence.

## Immediate implementation target

Implement Phases 1 and 2 first. They unlock the requested Forever profession, recipe, and item
library and give the Trader a safe build-scoped catalog. Static encounter extraction can proceed in
parallel at the schema level. Criteria-backed boss names/IDs can be imported now; 3D publication must
wait only for the no-instance resolver capability test and review, not for raid or dungeon access.

Do not publish the current diagnostic snapshot. It is valuable proof that the data is present, but
its zero normalized item properties, unresolved recipe references, missing hotfix determination, and
relationship-decoding gaps make it unsuitable for player-facing calculations.
