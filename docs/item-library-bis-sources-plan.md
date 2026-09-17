# Item library, in-game tooltips, BiS, and acquisition sources

## Decision

The product can reproduce the useful part of the supplied Warglaive tooltip very closely. The
current TBC snapshot already contains most base item facts; the main work is to normalize those
facts, add the missing item-set and spell-supporting tables, and render a build-aware tooltip.

The screenshot is not one indivisible Blizzard record. It combines four layers:

1. client item facts and client-derived values;
2. item-set and spell-effect facts;
3. AtlasLoot source/phase annotations;
4. GearScore, GearQuipper, and AtlasBIStooltips annotations.

Those layers must remain separate in storage and provenance even when they are composed into one
in-game-looking card. BiS is a later calculation over the item library, not a field on an item. An
acquisition source is also a many-to-many, versioned claim, not a field such as `droppedBy`.

The existing JavaScript/TypeScript product stack remains suitable. .NET is needed only at the CASC
and DB2 extraction boundary that already exists. A future high-volume combat simulator may justify
a separate service or WebAssembly module, but the item library does not require that decision.

## Implemented item-library slice

The client-backed portion of this plan is implemented and verified against TBC Anniversary build 69795. Snapshot schema v3 now normalizes base item fields, ordered stats, weapon damage, armor and
resistances, sockets, item effects, sets and set effects, class/race restrictions, item
class/subclass labels, unique-equipped categories, gems, enchantments, random properties/suffixes,
and the bonus-tree definitions shipped by the selected build. PostgreSQL stores those facts in
build-versioned relational tables while retaining the source rows and checksums.

The Encyclopedia item page composes those records into a semantic in-game-style tooltip. It derives
weapon DPS from damage and delay, resolves the supported client spell variables, visibly falls back
when a formula cannot be proven, supports viewer class/level restriction coloring, and keeps market
and crafting information outside the game-fact frame. Search results expose the same facts in a
hover and keyboard-focus tooltip without issuing one detail request per result; all result facts are
loaded through bounded batch queries. Desktop previews choose above/below placement from measured
viewport space and cap their height to the available side; the narrow-screen preview is fixed inside
the viewport. Item details reserve a `Loot info` card whose source and probability remain visibly
pending/unknown until the separately versioned acquisition graph is populated.

The latest verified extraction contains 30,133 items, 25,544 stat rows, 4,518 damage rows, 12,907
armor/resistance rows, 3,132 socket rows, 17,481 item effects, 388 item sets, 1,629 set members, and
883 set effects. Warglaive 32837 passes the .NET and TypeScript golden gates and the rendered page
matches its 214-398 damage, 2.80 speed, 109.3 DPS, three stats, restrictions, +44 attack-power effect,
and Twin Blades set facts.

The two deliberately deferred layers are unchanged: BiS/loadout calculation and acquisition/drop
sources. No client-presence fact is presented as a drop source, drop rate, phase, or BiS claim.

## What the current TBC data already proves

The published `wow_anniversary` build 69795 snapshot has 30,133 normalized catalog items. Each
item's `rawRecord` retains its `ItemSparse`, `Item`, and `ItemSearchName` rows, while all 36 selected
DB2 tables retain separate base/effective raw artifacts. The item-library facts are also normalized
into queryable schema-v3 artifacts and database relations.

A direct audit of the effective raw rows found:

| Capability                        |       Current raw coverage |
| --------------------------------- | -------------------------: |
| Items with at least one base stat |                     10,291 |
| Items with weapon damage          |                      4,458 |
| Items with armor                  |                     11,970 |
| Items with sockets                |                      1,509 |
| Items belonging to an item set    |                      2,049 |
| Items with durability             |                     15,410 |
| `ItemEffect` records              | 17,849 across 13,054 items |

Warglaive of Azzinoth, item 32837, is a useful golden fixture. Its current raw records contain:

- quality 5, item level 156, required level 70, main-hand inventory type, class mask 9;
- 214-398 damage and a 2,800 ms weapon delay;
- +22 Agility, +29 Stamina, and +21 hit rating in the aligned stat arrays;
- max count 1, 125 durability, bind-on-pickup, and item-set ID 699;
- item effect spell 15810, whose spell name is `Attack Power 44`.

The displayed 109.3 DPS is reproducibly derived as `(214 + 398) / 2 / 2.8`. This is exactly the
kind of derived value that should be calculated from structured facts and tested, rather than stored
as presentation text.

## Screenshot line-to-source map

| Visible content                 | Source of truth                                       | Work needed                                         |
| ------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Name and orange legendary color | `ItemSparse.Display_lang`, `OverallQualityID`         | Normalize quality style token                       |
| Binds when picked up            | `ItemSparse.Bonding`                                  | Decode the build-specific enum                      |
| Unique                          | `ItemSparse.MaxCount` and limit-category data         | Normalize both unique and unique-equipped rules     |
| Main Hand / Sword               | `InventoryType`, `Item.ClassID`, `SubclassID`         | Decode localized class/subclass labels              |
| Damage, speed, DPS              | `MinDamage`, `MaxDamage`, `ItemDelay`                 | Normalize damage rows and derive DPS                |
| Agility, Stamina, hit rating    | aligned stat type/value arrays                        | Normalize ordered stat rows and rating names        |
| Classes and required level      | `AllowableClass`, `RequiredLevel`                     | Decode masks; apply viewer context for red text     |
| Equip: +44 attack power         | `ItemEffect` -> spell 15810                           | Resolve triggers and render supported spell effects |
| Set name, members, and bonuses  | `ItemSet` plus build-dependent set-spell relationship | Add tables and spell rendering                      |
| Black Temple - Illidan          | AtlasLoot source claim                                | Import as versioned supplemental evidence           |
| Phase 3 BiS ranks               | AtlasBIStooltips or our future BiS model              | Keep provider/model version and assumptions         |
| GearScore 262                   | GearScore addon formula                               | Optional derived annotation with formula version    |
| GearQuipper keyboard hint       | Addon runtime UI                                      | Do not reproduce on the website; use a web action   |
| Disenchant result               | Existing build-locked disenchant model                | Show only when the item has supported evidence      |
| Item level 156                  | `ItemSparse.ItemLevel`                                | Already normalized                                  |

Some tooltip colors are viewer-dependent. A class that cannot equip swords sees restrictions in red;
set counts depend on the viewed character; level and profession requirements can also change color.
The renderer therefore needs an optional viewer context containing class, race, level, profession
skills, and equipped set items. With no viewer selected it should render a neutral canonical tooltip,
not pretend a failure state applies to everyone.

## Item-library data design

### Build facts

Keep common scalar values on the build-versioned item row:

- inventory type, quality, required level, item level, stack/max count, durability, and delay;
- allowable class/race masks, bonding, item-set ID, socket-bonus enchantment ID, and limit category;
- class/subclass, icon, vendor values, and the existing build/hotfix provenance.

Use ordered child rows for repeating data instead of adding numbered columns:

- `item_stat`: item/build, display order, stat type, and signed value;
- `item_damage`: item/build, order, damage school, minimum, and maximum;
- `item_resistance`: item/build, school and value, with armor represented explicitly;
- `item_socket`: item/build, position and socket type;
- `item_effect`: item/build, order, spell, trigger, charges, cooldown, and category cooldown;
- `item_set_version`, `item_set_member`, and `item_set_effect`;
- gem/enchantment and random-property relationships required to render actual variants.

Do not persist full tooltip sentences when structured facts exist. Produce a server-side
`ItemTooltipModel` from the normalized rows, build rules, locale, and optional viewer context. This
keeps search, BiS calculations, API consumers, and the visual renderer on the same facts.

### Additional client tables

The installed WoWDBDefs revision contains definitions for the primary missing tables, including
TBC-family layouts for the core set relationships. The extractor must still probe whether each file
is shipped and decodable in the exact client build. Extraction should be expanded incrementally and
each accepted table must pass the same raw, effective, checksum, hotfix, and source-coverage gates as
the existing catalog:

- `ItemSet` and, where the build uses it, `ItemSetSpell`;
- `GemProperties`, `SpellItemEnchantment`, and enchantment conditions;
- `ItemBonus`, `ItemBonusTreeNode`, item-to-bonus-tree relationships, limit categories, random
  properties, and random suffixes;
- the spell description/tooltip, duration, proc, aura, equipped-item, and description-variable tables
  needed by effects actually referenced from items;
- class, race, item class/subclass, skill/proficiency, combat-rating, and level-scaling tables needed
  to interpret restrictions and ratings.

The extractor must support whichever relationship shape the exact build uses. For example, older
layouts can embed set spell arrays in `ItemSet`, while other layouts use `ItemSetSpell`. It must not
assume one shape across TBC and Forever.

### Spell-effect boundary

An item effect's spell ID does not automatically provide the exact English tooltip sentence. Some
effects are direct stat auras; others use description variables, proc conditions, hidden trigger
spells, scripted behavior, or server logic. Implement effect support as a versioned interpreter:

1. render deterministic, understood effect families from structured values;
2. retain the localized client tooltip/description when shipped and resolve supported variables;
3. mark unresolved or partially resolved effects honestly;
4. never invent proc chances or uptimes that the client does not prove.

This same boundary is essential for later BiS work. A proc that is visually described but not
mechanically modeled may be shown in the library, but it must not silently contribute to a BiS score.

## In-game visual and interaction plan

Build the tooltip with semantic HTML and CSS, not a canvas or screenshot. That preserves search,
copying, localization, accessibility, responsive layout, and automated testing.

The visual target should use:

- a near-black translucent background, silver nine-slice-style border, restrained shadow, and the
  same narrow content width as an in-game tooltip;
- official quality colors, green equip text, red unmet requirements, gold set heading, muted inactive
  set members/bonuses, and cyan supplemental source lines;
- compact line height, right-aligned secondary weapon values, and deliberate section gaps;
- the existing extracted item icon next to search results and as the tooltip anchor;
- desktop hover/focus previews, a click-pinned tooltip on detail pages, and a full-width mobile card;
- visible keyboard focus, screen-reader labels, and a no-color-only representation of restrictions.

Offer three composable presentation layers:

1. **Game tooltip**: only client and client-derived item facts.
2. **Acquisition**: source, phase, difficulty, requirements, and evidence provider.
3. **Analysis**: BiS result, score delta, market value, and our model assumptions.

The default item page can compose all three, while its evidence drawer explains where every
non-client line came from. Website-specific actions such as compare, add to loadout, copy item link,
or view price history belong outside the tooltip frame.

If Blizzard's authorization covers redistribution of client UI textures, the tooltip border and
background can be extracted from CASC through the existing media pipeline. Font and UI-asset rights
must be confirmed independently for web distribution. Otherwise reproduce the layout with CSS and a
licensed, visually close webfont rather than publishing an extracted game font.

## BiS architecture

The concrete optimizer contract, class-family rule inventory, result confidence gate, and Forever
activation sequence are maintained in `docs/bis-algorithm.md`.

### Wowhead guide validation corpus

`docs/list.txt` currently records 27 readable TBC Wowhead BiS guides: 22 Phase 3 guides and five
earlier Warrior guides. Their public article markup exposes item IDs, ranked alternatives, source
references, authored rationale, and usually one or more complete gear-planner payloads. This makes
the corpus useful for regression fixtures and model comparison, but not a uniform calculation
specification.

The guides repeatedly demonstrate that a defensible result depends on more than an item's displayed
stats:

- Protection Warrior and Protection Paladin require legal whole sets that retain critical-strike
  immunity; Paladin also optimizes toward the 102.4% combined avoidance threshold. Tank results need
  separate threat, mitigation, effective-health, and balanced objectives.
- Retribution, Feral, Warlock, and other damage profiles change items around hit or expertise caps.
  Race, talents, target level, raid buffs, and target armor can change the applicable cap and the
  winning item.
- Tier bonuses, the Warglaive pair, proc uptime, meta-gem activation, professions, and weapon pairing
  create non-additive loadout effects. Breaking or gaining a set threshold can reverse a per-slot
  ranking.
- Healer lists deliberately vary between throughput, haste breakpoints, and mana sustainability.
  Their answer depends on spell mix, encounter length, downtime, and external mana support.
- Several guides recommend different sets for single-target/AoE, hard/soft hit caps, race, raid
  composition, target armor, or loot contention. The product must expose these assumptions instead
  of collapsing them into one unexplained `BiS` label.

The corpus is incomplete as a mechanics source. Most pages defer core formulas to separate stats,
talent, rotation, gem, and enchant guides that are not in `docs/list.txt`; some contain stale template
notes or weak editorial sections. Missing Phase/spec combinations also prevent it from defining a
complete matrix. We should therefore use the guide recommendations as versioned comparison evidence,
not copy their prose or silently import their conclusions as our own truth. Any commercial reuse of
Wowhead-authored content or compiled recommendations requires an appropriate permission/license.

The first model should store the following inputs explicitly:

- character: class, specialization, role, level, race, talents, faction, professions, and permitted
  armor/weapon families;
- raid/encounter: target level, target armor and creature type, fight duration, target count,
  movement, incoming attack profile, buffs, debuffs, party composition, and mana support;
- objective: damage, threat, mitigation, effective health, healing throughput, or sustain, including
  any required caps and user-selected trade-off;
- content: client build, phase, allowed acquisition sources, already-owned items, and optional
  contention or accessibility preferences.

Each generated result should cite its model version and guide-validation status, show cap and set
breakpoint decisions, list unresolved item effects, and offer alternatives near the optimum. A guide
disagreement should become a visible comparison failure to investigate, never a hidden override.

### Why stats alone are not enough

A linear sum of Agility, Strength, hit, and critical strike can produce a useful candidate ranking,
but it cannot produce a defensible BiS list. Examples of non-linear or loadout-dependent behavior
include:

- hit/expertise caps and changing marginal values;
- weapon speed, damage range, dual-wield/two-hand rules, normalization, and racial weapon bonuses;
- set-bonus breakpoints, unique-equipped constraints, sockets, gems, enchants, and meta requirements;
- proc trigger conditions, internal cooldowns, uptime, encounter length, target type, and movement;
- talents, rotation, buffs, debuffs, consumables, faction, profession, and encounter mechanics.

Warglaive illustrates this directly: its anti-demon set bonus has encounter-dependent value, its
haste proc needs a supported uptime model, and the two-piece set means ranking each hand independently
can be misleading.

### Calculation pipeline

1. **Candidate filter**: class, race, level, proficiency, armor/weapon rules, slot, uniqueness, phase,
   faction, profession, and acquisition availability.
2. **Effective item model**: base stats, weapon properties, chosen gems/enchants, sockets, passive
   effects, supported proc expectations, and set interactions.
3. **Spec model**: a build-versioned plug-in defines talents, rotation assumptions, caps, rating
   conversions, encounter profiles, and how each supported effect contributes.
4. **Whole-loadout optimization**: optimize legal item combinations rather than independently taking
   the top item in each slot. Report both absolute score and marginal upgrade from the selected
   baseline set.
5. **Evidence output**: persist the model version, build, phase, encounter, buffs, professions,
   constraints, score breakdown, unresolved effects, and confidence with every result.

The first release can offer transparent stat-weight rankings labeled `candidate ranking`. Promotion
to `BiS` requires a validated spec model and whole-loadout optimization. Phase-specific BiS cannot be
final until the acquisition/availability graph exists, even if unrestricted candidate scores are
calculated earlier.

Validate each spec against hand-calculated fixtures, cap-boundary cases, set/unique constraints, and
independent known loadouts. Imported community BiS lists are useful comparison evidence, not the
ground truth used to conceal model errors.

## Acquisition-source graph

### Local proof of approach

The installed AtlasLoot data already provides a practical seed adapter:

- AtlasLoot core identifies itself as BCC 2.5.6 and its source-data package as BCC 2.5.4;
- `source-tbc.lua` has 3,952 direct item keys and source types for loot, quest, vendor, and
  professions;
- the raw client catalog has 19,244 rows with a non-zero inventory type, but only 2,514 of those IDs
  intersect the AtlasLoot source keys before player-facing/obsolete filtering;
- item 32837 maps to AtlasLoot entry 25, boss block 9, source type 1;
- entry 25 is Black Temple; boss block 9 is Illidan Stormrage, NPC 22917; the instance is phase 3;
- its separate drop-rate table does not supply a Warglaive probability, so that probability must
  remain unknown rather than be guessed.

AtlasLoot also ships separate TBC dungeon/raid, crafting, faction, PvP, and collection modules. This
is enough to prove a versioned import path for many useful items, but neither the 3,952 source keys
nor the unfiltered 2,514 equippable-row intersection proves complete coverage over 30,133 catalog
items. Many catalog rows are internal, obsolete, test, or not player-acquirable; conversely, classic
server loot relationships are not guaranteed to be present in client DB2 files.

### Storage model

Represent acquisition as a graph:

- `source_entity`: typed entity such as NPC, boss, instance, zone, quest, vendor, faction, profession,
  PvP bracket, container, event, or world pool;
- `item_acquisition`: item/build, method, source entity, difficulty, faction, phase, conditions,
  provider, provider version, evidence hash, effective dates, and confidence;
- `item_acquisition_cost`: currency, token, item, reputation, rating, or honor components;
- `item_acquisition_chain`: token/container/intermediate links leading to the final item;
- `drop_observation`: optional realm/build/source samples kept separately from claimed probabilities.

Store drop chance as a nullable claim with a method such as `authoritative`, `observed`, `estimated`,
or `unknown`, plus sample size where relevant. Source identity and drop probability are separate:
knowing that Illidan drops an item does not prove its chance.

### Provider strategy

1. Use client DB2 relationships when the exact shipped build actually contains them.
2. Import installed AtlasLoot modules with a non-executing, allow-listed Lua parser and pin the addon
   package versions and source-file hashes.
3. Request a structured item-source/loot feed under the stated Blizzard authorization; this is the
   only route to authoritative server-only relationships before community observation.
4. Add maintainer-reviewed claims and community observations without overwriting higher-quality
   evidence. Conflicts remain visible and reviewable.

Coverage must be measured over player-facing categories, not blindly over every catalog row. Produce
a report for equippable items, consumables, recipes, profession materials, quest rewards, and other
selected categories with states such as `source_known`, `multiple_sources`, `source_unknown`,
`client_only`, and `explicitly_unobtainable`. Every published BiS item must have either a supported
acquisition path or a conspicuous unknown-source state.

## Delivery order and estimates

These are focused engineering estimates for one developer already familiar with this repository,
not promises about calendar time:

1. **Base item facts and golden tooltip: 3-5 days.** Add normalized stats, damage, armor, restrictions,
   sockets, durability, and the renderer. Make Warglaive, a shield, a socketed item, and a plain
   consumable golden fixtures.
2. **Complete core tooltip families: another 5-10 days.** Add item sets, gems/enchants, random
   variants, supported use/equip/proc effects, localization, and unresolved-effect reporting.
3. **AtlasLoot acquisition seed: 3-7 days.** Parse all installed TBC source modules, import provenance,
   support token/cost chains, and publish category-by-category coverage and conflicts. Closing every
   unknown source remains data work whose duration depends on the authorized feed.
4. **First candidate ranking for one spec: 3-5 days.** Transparent weights, eligibility, caps, and
   assumption output; label it as a candidate ranking.
5. **Validated whole-loadout BiS: 1-2 weeks per initial mechanics family, then iterative expansion.**
   Shared melee/caster/healer/tank foundations will reduce later cost, but all TBC specs are a
   multi-week product area rather than an item-page feature.

The source graph may be implemented after the first unrestricted candidate scorer, but it must be in
place before publishing phase/faction/obtainability-specific lists as definitive BiS.

## Verification gates

The item-library snapshot should move to schema v3 and pass the existing deterministic extraction,
checksum, hotfix, raw-preservation, import, review, and publication gates. Add these specific checks:

- aligned stat arrays have matching types/values and ignore only documented sentinels;
- weapon DPS, armor, masks, sockets, set membership, and item effects rederive exactly from raw rows;
- every item/set/effect foreign key is valid or retained as an explicit extraction warning;
- provider data cannot be imported without provider name, version, file hash, and build applicability;
- unknown drop chances and unresolved effects survive as unknown, never zero;
- golden tooltip snapshots cover Warglaives 32837/32838, shield 32375, a socketed item, a gem, a
  random-suffix item, a set item, a use/proc trinket, and a non-equippable item;
- desktop hover, keyboard focus, pinned detail, and mobile layout have Playwright coverage;
- BiS tests cover rating caps, set breakpoints, unique constraints, weapon pairing, phase filtering,
  and unsupported-effect confidence downgrades.

## Definition of done for the Warglaive target

The client-backed target is met: item 32837 renders the client-backed name, quality, binding, uniqueness,
weapon type, exact damage/speed/DPS, base stats, class/level requirements, +44 attack-power equip
effect, item level, and complete set facts from the selected build. The deferred acquisition layer
must show Black Temple -> Illidan Stormrage -> phase 3 with AtlasLoot's pinned provenance and no
fabricated drop rate. Any future BiS/GearScore annotation must identify its addon or calculation
model and version.

At that point the result will look like the game while remaining more trustworthy than a flattened
tooltip screenshot: users can see which lines are client facts, calculations, curated sources, or
model conclusions.
