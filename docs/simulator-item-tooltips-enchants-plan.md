# Simulator item tooltips and enchants

Planned and implemented locally on 2026-10-16. Scope is the shared Forever simulator workspace,
including all 15 individual profiles and the raid builder, not a new combat engine. No commit,
push or production deployment was requested for the original delivery. A subsequent explicit live
deployment shipped this work through r12/r13; see `../context.md` for the current production receipt.

## Local implementation receipt

- Follow-up default-enchant release: `fba685b35451678279ffa37e`, 3,485 files. All 28 supplied
  gear lists now include reviewed role-specific enchants; saved builds are unchanged. See
  `simulator-default-enchants.md` for its selection policy, manifest and verification.
- Original tooltip/enchant release: `4a30cdef5ca4a6f1da3935ca`, 22 pages, 1,927 real-source items and 3,484
  integrity-indexed files. Production was still on r11 at that original local receipt.
- Local hover/focus previews use actual simulation stat vectors, selected random suffixes,
  separately listed enchants, current set counts and sorted thresholds. Client effect/set names
  are explicitly references, not a promise that every utility or proc is modeled. There is no
  per-hover third-party request or external tooltip-script dependency.
- Visible Add/Change enchant controls reuse the existing selector and gear event/save machinery.
  Its Enchant tab has effect search, summaries, support labels, No enchant, and explicit provisional
  proc opt-in. Enchant phase labels no longer imply Classic phases prove Forever availability.
- Audited all 182 application/slot choices: 134 static, 23 scripted, 9 utility, 5 provisional and
  11 unsupported. Corrected 39 choice records from resolved current-client payloads, including
  formerly health/mana-named enchants that now grant stamina/intellect. This is not 182 distinct
  enchants or proof that every recipe is obtainable. Provisional consent is session-only; imported
  or reloaded gear retains its enchant, but the user must explicitly allow unverified proc models
  before simulating them again.
- TypeScript and Go enforce item compatibility and source level bounds; simulation, stat weights,
  item swaps and imports have validation. Invalid saved enchant IDs are not silently stripped:
  the original JSON gets a local `_enchant_recovery` backup and download, with an actionable alert.
  The inherited event batch swallows callback exceptions, so saved/raid imports are checked before
  entering that batch. Valid gear, talents and rotations retain their existing persistence.
- Tippy/Popper is reused with one lazy preview service, safe DOM text and lifecycle cleanup.
  Viewport flips/clamping also account for the visible portion of a same-origin iframe and parent
  scrolling. Touch users have an explicit native details dialog. Candidate details and tooltip
  Escape handling do not dismiss the underlying picker accidentally.
- Source overlays: `infra/simulator/inspection-data.mjs`, `inspection-adapter.mjs`, `inspection.ts`,
  `inspection.css`, `enchant-validation.go` and its Go test; every input participates in release
  hashing. Cached immutable releases remain self-contained and are never edited in place.
- New preparation needs the SHA-pinned raw build-70425 mechanics capture in
  `artifacts/forever-mechanics/70425/<hotfix>/mechanics-*/manifest.json`. Alternatively set
  `FOREVER_SIMULATOR_MECHANICS_ROOT` to the directory containing that `mechanics-*` directory.
  The manifest and all used table hashes are verified; missing evidence fails the build without
  substituting old Classic records. A prepared release does not need raw extraction files to run.
- Additional tank and DPS stat-priority research and an honest candidate-comparison design:
  `docs/simulator-enchant-priorities.md`. Existing EP sorting is an estimate, not measured DPS or
  a best-enchant guarantee. That delivery did not add default enchants; the subsequent explicit
  request did, without changing starter items/priorities or existing saved characters.

Verification: 29 focused Node tests, focused Go stat-parity/compatibility/set tests, strict upstream
TypeScript and the full Vite/Go/WASM build passed. Dedicated Playwright checks passed apply/remove,
save/reload, talents/rotation preservation, unsupported/provisional activation, exact saved-build
recovery/download, native details, five widths and embedded-parent bounds/scroll. All 15 profiles
completed real combats, including positive shield and two-hand enchants. The existing workspace
suite additionally checks unchanged-profile golden requests/results, faction starters, Raid,
focus mode, imports/exports, parent dismissal and stalled-worker recovery. No new Next application
code was changed; this delivery does not claim a new Next production build or production deploy.

## Decision

Render local, in-game-style item tooltips and expose the existing enchant system through clear
per-slot actions. Reconcile enchant data before advertising it as Forever-supported. Tooltip
values, character stats, saved builds and actual simulation requests must agree.

Keep the user's Forever-verified-only policy. Do not re-enable external Wowhead tooltip scripts,
restore the old Classic fallback database, invent proc rates, or silently enchant saved characters.
Wowhead can remain an explicitly clicked reference link outside the hover preview.

## Baseline audit before implementation

Inspected pinned upstream revision `9a27c3d6af91d1ca0dbcf94a124b8869ad522108` and active local
release `41f89cd6f53e404dfe132ee3`. The generated database in the checkout and the released asset
both match manifest SHA-256 `bf239db740769a66e8a44ce0b968f9bf98590fcd1c8806348f095e9f027c9371`.

- The local release has 1,927 real-source equipment records and 182 enchant choices representing
  159 distinct enchant effect IDs. Different application spells/slots can share an effect ID.
- Equipped real items only receive Wowhead data attributes. `player.setWowheadData` still writes
  `domain=classic`. `host-adapter.mjs` deliberately removes the external tooltip script. The
  candidate list likewise has no local real-item stat renderer; modeled references have their
  own tooltip branch but are excluded from our normal equipment pool.
- A fresh Playwright context on the local Warrior page confirmed HTTP 200, no JavaScript errors,
  and no visible tooltip after hovering Premier Mortarplate Headguard. The element had no Tippy
  instance and retained its old Classic dataset.
- The existing selector contains functional Item and Enchant tabs. The head Enchant tab lists
  arcanums and other enhancements. All 17 `.item-picker-enchant` shortcuts were hidden because
  the fresh starter has no applied enchants. Adding the first enchant is therefore undiscoverable
  unless the user opens the item picker and notices its other tab.
- Enchants already have apply/remove handlers, gear events, stat vectors, Go effect hooks and
  `ItemSpec.enchant` serialization. `EquippedItem.withItem` attempts to retain compatible enchants.
  Reuse these paths rather than create a parallel equipment state.
- Slot, shield, two-hand, staff, armor-type and some level rules already exist. UI wearer checks
  are incomplete; general Go validation covers only a narrow new-enchant subset. Unknown imported
  enchant IDs can become `null` silently in `Database.lookupItemSpec`.
- The current description file has no entry for nine choices, including the Forceful kits,
  Recovery, Revelation and the new scope. Falling back to the name is not a full effect preview.
- The selector still exposes Classic phase names. Those are not proof of Forever availability.

### Confirmed current-client discrepancies

Client evidence is our immutable `1.60.1.70425` mechanics capture with hotfix SHA
`8464d7adbd3e6aba33b8c8ccefe6085c7b5c2ac0672685cbfb7e8671b01fffb8`.

| Choice                            | Effect ID | Current simulation | Extracted client effect                        |
| --------------------------------- | --------: | ------------------ | ---------------------------------------------- |
| Minor Agility, cloak/bracer/boots |       247 | +1 Agility         | +3 Agility; aura spell 7778, effect row 686590 |
| Minor Stamina, bracer/boots       |        66 | +1 Stamina         | +3 Stamina; aura spell 7455, effect row 686001 |

These are resolved static auras, not guesses based solely on displayed names. A narrow audit of
direct single-primary-stat auras also flagged other candidates, including health/mana-named
enchants whose client payload is now a primary stat. Do a full mapping review before claiming an
exact discrepancy total or automatically translating all legacy stats.

All 159 existing effect IDs occur in the current client's 2,217 decoded enchantment rows. This
proves presence, not correct simulator values, player availability or support for all 2,217 rows.
That table also includes internal, temporary and non-player enhancements.

The upstream already includes source-audited Forever work: four Forceful kits, Recovery, a ranged
scope, and Revelation's explicitly provisional event model. Revelation has no sourced
Warrior/Rogue payload and requires explicit model configuration for supported classes. Do not
present it as a universally supported permanent enchant or turn its guessed proc law on by default.

## Intended experience

### Item inspection

- Hover or keyboard-focus either the equipped icon or name to see the same preview. Cover item
  candidates, current-slot icons, saved gear previews and item-swap gear through shared hooks.
- Match the site's existing in-game tooltip language: quality-coloured name, item level, slot and
  armor type, weapon damage/speed/DPS, armor, attributes, resistances, requirements and green
  equip/use effects. Show the applied enchant separately in green; do not add its stats into the
  item's base lines and then count it twice.
- Resolve random suffixes from the selected instance. Set membership/thresholds use the current
  equipment, not the Encyclopedia component's static `0/N`. Candidate previews use an explicitly
  labelled hypothetical replacement when showing set changes.
- Use client rating labels and level-correct conversions. The engine sometimes stores percentage
  points rather than client ratings: never print an internal `1` as `1 rating` indiscriminately.
  Show source stats and derived percentages with their units; character-derived armor and health
  remain distinct from item stats.
- Show concise per-effect model status when an item has a real effect that the engine omits.
  Displaying an effect description must not imply that the effect contributes to the result.
- Keep hover inspection read-only. Clicking the existing item control still opens its selector;
  hovering a candidate never equips it or changes saved data. Optional comparisons show raw stat
  deltas first, never label EP as measured DPS/TPS.

### Enchant editing

- An equipped, enchantable slot always has a visible `+ Add enchant` action. Once applied, show
  its short effect text and a `Change` action. Separate this from the item-selection control.
- Open the existing selector directly on its Enchant tab. Improve that tab's KFC styling instead
  of creating another modal. Include search by name/effect, a clear current selection, effect
  summary, requirements, support status, and an explicit `No enchant` option.
- Preview candidates without mutation; selecting/applying a valid choice uses the current gear
  event pipeline and immediately updates the equipment row, character stats and stale-result
  indicator. Removing an enchant must not remove its item.
- Filter using the actual equipped item and wearer. Empty slots say `Equip an item first`;
  genuinely non-enchantable slots have no misleading action. A slot with no supported choices
  explains that coverage is missing rather than implying the game forbids enchanting it.
- Preserve the old enchant on an item change only if it remains valid. Otherwise remove it with
  a visible explanation; never transfer a weapon enchant onto a shield or held off-hand.
- Keep permanent enchants, armor kits, arcanums and scopes in the appropriate enhancement slot.
  Replacing an enhancement is explicit. Oils, stones, poisons and class weapon imbues remain
  separate temporary/consume controls; implement only source-verified stacking/conflict rules.
- No automatic paid or permanent additions to existing starters/saved builds. A later explicit
  `Apply recommended enchants` action can offer a preview and preserve occupied slots by default.
  Its Warrior/Bear choices should prioritize threat, Paladin choices defense, with scenario-aware
  comparisons rather than a universal BiS claim. It is not required for the first release.

### Placement and accessibility

Use the already-installed Tippy/Popper stack for positioning; no new runtime dependency. Follow
[Tippy's accessibility guidance](https://atomiks.github.io/tippyjs/v6/accessibility/) and
[W3C's hover/focus requirements](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).

- Short hover delay, keyboard focus support, readable contrast and `aria-describedby`.
- Hover previews remain readable while the pointer moves onto them; Escape dismisses them.
  When a preview is open over a picker, the first Escape dismisses the preview and a subsequent
  Escape closes the picker. Do not break existing parent-gutter dismissal.
- Flip above/below/sideways at edges, clamp horizontally, cap height and allow reading long set
  previews. Reposition on scroll/resize and hide stale previews on row recycling/modal close.
- Mount outside clipping list containers at the correct modal stacking layer. An iframe cannot
  draw beyond its own viewport: placement stays within it rather than adding cross-frame DOM
  injection or a new parent message protocol.
- Keep hover content non-actionable. Reference links and other actions belong in an explicit
  details view. On touch screens, provide a labelled details control/panel, not a hover trap that
  blocks normal item selection. Details dialogs need their own focus return and dismissal rules.

## Data and model implementation

### 1. Build-pinned inspection and enchant manifests

Generate compact, schema-validated inspection metadata next to each immutable simulator release.
Use the same selected item/enchant identities and normalized numbers that generate the UIDatabase
and engine payload; enrich with compatible, evidence-backed descriptions/requirements/set facts.
Do not request current Encyclopedia data on every hover or join different builds by ID alone.

Record source build, hotfix, source checksum and upstream revision. Distinguish:

- client presence and resolved facts;
- acquisition/phase/recipe evidence;
- modeled static stats and implemented effects;
- provisional models and unsupported effects.

Carry those as separate fields, not a single `verified: true` flag. Validate all 182 current
choices, not only the six new enchant implementations. An unreviewed choice can remain visible
as a disabled reference with a reason; only compatible, supported choices are enabled by default.
Do not turn an unknown availability state into an invented Classic phase restriction.

If newer client evidence disagrees with engine data, reconcile the item/enchant and its model in
one release or display the mismatch explicitly and exclude it from recommendations. Never show
new client stats over old simulated values. Existing safe choices can stay usable when one new
record lacks evidence; do not block the whole simulator on an unrelated missing enhancement.

### 2. Extend and normalize extraction

Reuse `packages/forever-data/src/mechanics.ts` and the .NET DB2/CASC boundary. Current mechanics
capture already includes `SpellItemEnchantment`, `Spell`, `SpellName`, `SpellEffect`,
`SpellEquippedItems`, aura options, duration, levels and cooldown tables. It currently omits
`SpellItemEnchantmentCondition`, `SpellReagents` and skill-line relations which the broader catalog
extractor knows about. Add them to the frozen mechanics capture where needed; do not mix an older
catalog's recipe requirements into the new snapshot without source/version provenance.

Follow application spell → enchant effect ID → stat/passive/proc driver → triggered spell, with
cycle/depth limits and explicit unresolved edges. Read duration and proc fields when available;
capture additional referenced proc tables only if definitions/data exist. Raw client records may
not reveal server scripts. Encrypted records remain unresolved: this capture has one encrypted
enchantment record and gaps in spell/aura tables.

Separate recipe/formula item IDs, consumable enhancement item IDs, application spell IDs and
enchant effect IDs. Do not use a formula item's requirements as the wearer's requirements.
Use a composite catalog identity including application/slot; keep backward-compatible engine
serialization by effect ID plus equipment slot. Explicitly parse legacy import formats rather
than matching an ambiguous number against item, spell and effect ID namespaces indiscriminately.

### 3. Legality, persistence and engine parity

Normalize a small compatibility contract shared as generated data between TS checks and Go tests:
slot/inventory type, weapon/shield/two-hand/ranged restrictions, armor type, wearer level,
item-level minimum/maximum, real wearer profession/class restrictions and replacement groups.
Crafter profession/reputation and obtaining a service are different from wearer restrictions.

Validate at picker activation, item replacement, import, saved-build restore, batch/item swap and
simulation submission, not just by hiding rows. Unknown saved enchant IDs must produce an
actionable warning and retain the original import for recovery; do not silently strip them and
simulate an apparently complete build. Preserve all talents/rotation/encounter settings.

For static effects, update UI and Go data together and assert exact stat deltas. For procs, review
actual trigger types, hand ownership, form eligibility, ICD/PPM/chance, scaling, stacking and swap
lifecycle; test them before calling the effect supported. In particular, avoid assuming Classic
weapon procs work identically in Forever Bear Form. Unsupported/provisional models need preflight
messages and explicit opt-in, never hidden chances or a surprise engine panic after clicking Run.

### 4. Owned UI integration

Add narrow tooltip/enchant overlay modules through `workspace-adapter.mjs` and immutable builder
input hashing. Patch `ItemRenderer`, candidate `ItemList`, selector current-slot icons and shared
equipment preview paths, not individual class pages. Preserve existing actions and listeners.

Reuse the Encyclopedia's typography/quality/effect formatting conventions, not its React component
inside the vanilla iframe. Its current renderer has TBC-specific member URLs and static set
counts, so direct copying/importing would be incorrect. Only extract pure shared formatting if
it actually serves both runtimes without dragging Next/server dependencies into the iframe.

Build safe DOM nodes/text, not unsanitized external tooltip HTML. Use one owned preview service
per workspace, lazy bindings for virtual rows, teardown on replacement/disposal and guards against
late asynchronous updates. Cache immutable metadata per release; show useful base stats with an
honest partial-metadata notice if enrichment fails. No per-hover third-party network dependency.

## Delivery order and acceptance

1. **Audit and data contract:** produce an inventory/status report for every current enchant;
   reconcile resolved static mismatches and establish version/model parity gates.
2. **Local item previews:** equipped and candidate items, suffixes, applied enhancements, real
   set thresholds, supported-effect labels and desktop/keyboard/touch placement.
3. **Visible enchant workflow:** per-slot actions and improved existing picker, apply/remove,
   legality, imports, saves, item swaps and honest unsupported-model handling across profiles.
4. **Regression and release:** rebuild immutable assets, run the checks below and inspect settled
   desktop/mobile screenshots before a separately authorized commit/deployment.

Expected effort: a few focused implementation days for the shared UI and resolved static effects;
full proc verification is a separate variable-length task if server-only behavior lacks evidence.
Do not hold working stat enchants hostage to unknowable proc details.

Required verification:

- Regression fixtures for effect 247 (+3 Agility), effect 66 (+3 Stamina), all-stats, armor,
  AP/RAP mapping, healing versus damage, client ratings, random suffixes and active set thresholds.
- Client facts, rendered values, UIDatabase stats and actual Go results agree. Passive static
  effects are not added twice through both metadata and effect handlers.
- Same effect/different application slots, unknown IDs, class/profession requirements, min/max
  item levels, shield versus off-hand, ranged scopes versus relics, dual wield, kits replacing
  enchants and source-backed temporary conflicts.
- Save/reload and URL/JSON round trips retain the exact enhancement; changing gear removes only
  incompatible enhancements, with notice. Old saved builds and unenchanted starters survive.
- Deterministic Go stat/proc tests, focused adapter tests, strict TypeScript, lint and production
  build. All 15 profiles plus Raid exercise shared UI; real combat smoke comparisons use unchanged
  baselines where applicable and explicitly reviewed changes for corrected enchant payloads.
- Playwright at 390/768/1024/1440/1600px, all viewport edges, nested scrolling, fullscreen,
  modal layering, virtual row recycling, keyboard/touch, first/second Escape, parent-gutter click,
  rapid item changes and metadata failure. Hover never mutates gear and selection remains usable.
- New release hash contains every overlay/manifest/model input; verify all asset checksums and
  rollback compatibility. No edits in published release directories.

## Original research verification

Read-only source/data inspection and a fresh-context local Playwright diagnostic were run.
Confirmed missing equipped-item hover, hidden enchant shortcuts and a populated Enchant tab with
no browser exceptions. Database checksums were compared to the active local manifest. The two
static discrepancy examples above were checked against actual linked client SpellEffect rows.
That original research did not modify application code. The implementation and subsequent checks
are recorded in the local receipt at the top of this document.
