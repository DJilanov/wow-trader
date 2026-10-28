# Warlock dungeon-upgrade recovery

## October 27 — current all-slot banks and exact stat evidence prepared

All four recorded styles now have independently audited banks against the
expanded 2,743-item statistics model: Demonology, Affliction, DS/Ruin and
Destruction. Each has 25 groups covering all 17 slots, ordered jewelry and
weapon pairs, every eligible set assignment and compatible enchants. All 247
multi-piece Deathmist subsets are present; maximum-piece set witnesses are
mandatory. Raid-dependent sources remain excluded and PvP remains eligible.
The actual request wire has improved totems, Windfury, raid auras and Kings.
Recorded talents, pets, consumes, faction and professions otherwise remain.

| Style       | Generated proposals | Retained group entries | Unique gear vectors |
| ----------- | ------------------: | ---------------------: | ------------------: |
| Demonology  |              10,930 |                 10,921 |              10,763 |
| Affliction  |              10,930 |                 10,921 |              10,763 |
| DS/Ruin     |              10,930 |                 10,921 |              10,763 |
| Destruction |              10,929 |                 10,920 |              10,762 |

Nine omitted singleton groups per style explain generated/retained differences;
these are not unique simulations. Legal dagger/sword/staff layouts and held
off-hands are checked; Priest-only mace layouts are rejected. Class/faction,
profession, source, ownership and enchant restrictions are unchanged. Current
Deathmist stats equal the captured source and compiled catalog. Its class-quest
acquisition and fear-immune raid-boss reference remain explicitly unverified
server assumptions; this does not qualify fearable encounters or live rewards.

Eight complete native/Chromium stat pairs pass for the exact prepared raid
contexts, with incumbent and full-set gear. The independent audit also replays
all saved requests/results. It caught and rejected the first partial-raid stat
requests, which omitted active-party count; those reports stay preserved.
Corrected successor input and audit receipts are in
[the expanded statistics record](simulator-current-statistics-model.md).

This is preparation, not new DPS ranking, fresh random-seed confirmation or
permission to reopen the expired Warlock window. Actual combat controls,
bounded optimization and matching preset/library/browser delivery remain.
No selected release, clock, Git commit, push or deployment changed. Earlier
sections below retain the older-model recovery history.

The catalog audit found all eight base **Deathmist Raiment, set 518** pieces
missing. Same-name alternate **1681** has different items and thresholds. The
inherited name-based engine handler grants the alternate's three-piece MP5 and
four-piece healing proc; it leaves fear empty. Adding base items to that handler
would compare the wrong effects.

| Work                                          | Evidence                                                                                                      | Status                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Recover base and alternate identities         | Authenticated build 1.60.1.70532 tables, separate memberships and complete eight-spell closure                | Implemented                                                                                                            |
| Prepare current item stats                    | Eight base pieces, armor, spell power and universal rating conversion; historical icons only                  | Implemented; catalog admission pending                                                                                 |
| Recover reward associations                   | Baked Forever QuestieDB 1.0.4, eight quests and sixteen item associations                                     | Implemented; live delivery unobserved                                                                                  |
| Corroborate primary reward references         | Six parsed sections, one indexed section and eight distinct followed base-item targets                        | Implemented for seven quests; quest 8943 pending                                                                       |
| Isolate sourced passive calculations          | Exact set-ID resistance, spell power/healing and bonus armor; fourteen matching native/Chromium-WASM outcomes | Implemented and verified as an unregistered component; complete set remains unqualified                                |
| Implement and qualify base-ID dispatch        | Stat thresholds, incoming fear proc, armor dependency, alternate/Classic separation and lifecycle tests       | Implemented within an explicit fear-immune raid-boss reference; fearable encounters remain unsupported                 |
| Compile a current native/WASM reference model | Preserve parent catalog and exact embedded/UI database equality                                               | Implemented; 22 native/Chromium outcomes and 13 actual-runtime stat/recovery checks pass; combat qualification pending |
| Execute full-raid controls and optimization   | All slots, hands/pairs/sets/enchants and geared talent/APL/pet/consume feedback                               | Pending                                                                                                                |
| Confirm and deliver matching builds           | Fresh 2% and separate original 1%, defaults, presets, library, guidance and desktop/mobile checks             | Pending                                                                                                                |

This preparation changes no selected catalog, engine, preset or ranking and
starts no class clock or numerical job. The full original campaign remains in
scope; these drafts do not complete Warlock optimization.

## October 26, 23:27 UTC: integrated raid-boss reference

The new `warlock-deathmist-model.mjs` renderer and Go implementation install base
518 through the central set dispatcher. The generic name handler skips that base
ID; alternate 1681 and the existing Classic dispatcher retain their prior
behavior. The sourced 2/4/6/8 thresholds apply once. The three-piece MP5 and
four-piece alternate healing proc cannot leak into the base set. The existing
Warlock bonus-armor dependency applies the eight-piece armor exactly once.

This model deliberately selects `raid-boss-fear-immune-reference`. It supports
enemy targets at player level plus three, rejecting other encounters when the
four-piece effect is equipped. **Level is a scope guard, not evidence of fear
immunity.** The captured client does not prove server immunity, targeting/range,
damage break or diminishing returns. Fearable targets remain unsupported; the
model neither substitutes a stun nor claims to simulate fleeing.

The four-piece effect is registered rather than omitted. Landed direct enemy
attacks can roll the sourced 2% chance and one-minute cooldown; the child cast
targets the incoming attacker under the disclosed reference. An immune cast adds
no damage, hit/miss, threat, movement or boss aura. Rejected self/friendly,
missed, periodic and unclassified events consume neither RNG nor cooldown.
Tests cover the actual dispatcher, all thresholds, mixed membership, localized
names, Classic behavior, seeded cadence, cooldown reopening, iteration cleanup
and armor with/without Demon Armor. The seeded result is 100 procs in 5,000
eligible attempts in both native and actual Chromium/WASM controls.

The frozen parent is the existing Druid model `546fce4ba3d23c2b6d7f3b43`; all 32
Warlock source files match the existing selected Warlock model's recorded
sources. This is source preservation, not a claim that old DPS results apply to
the derived model. Of the 485 parent compiler inputs, only `core/item_sets.go`
and the embedded database change. Three new compiler inputs implement and test
the model and encode its database. The actual protobuf catalog preserves all
2,703 parent items and non-item fields, appends exactly eight current-stat
Warlock rewards, and round-trips to 2,711 items.

New model identity:
`9be84801a2653042fbf34f2479bef351d0f6db32036a18dc71d21c07fec2d248`.
Evidence under `artifacts/forever-simulator/optimization/`:

- Native model and matching native/WASM assets:
  `warlock-deathmist-model-v1/build-w0imNA/report.json`, byte SHA-256
  `7acd3d3a4637d5c1b2b41a1164c29e8886e7f21a74cb3c35cb13b299fff77fc1`.
- Actual Chromium execution of the same 22 outcomes:
  `warlock-deathmist-model-v1/build-w0imNA/browser-review-V8ZUXQ/report.json`,
  byte SHA-256 `a1b660c017323a5544bb5260dc9e96c71c3789b808f05f3f254707eba56b5aaf`;
  1,012 source/evidence pins verified before and after execution.
- Actual complete-runtime API checks:
  `warlock-deathmist-model-v1/build-w0imNA/runtime-review-hyXpEt/report.json`,
  byte SHA-256 `fdba2ee67007e5b5369e56f392193862f9f0ae4be68f3453d3adcdd8887eebe1`.
  All 13 checks pass: two preserved build stat requests, zero through eight set
  pieces, rejection of the unsupported encounter and successful reuse after
  rejection. Native and browser stats agree; this is **not combat DPS parity**.
  The check authenticates 1,015 source/evidence pins.

The public Go database encoder, catalog/ownership adapters and model/renderer
regression suite accompany the implementation. Fifteen Node source/renderer/
catalog regressions, scoped ESLint/Prettier, Go formatting and diff checks pass.
The dispatch-parent fixture has SHA-256
`b583a46fd1baf8a6ec9c6b9fa7979ab32d76ce858235ba59a79a21835cdc032a`.
The private build/browser/runtime review producers are versioned under
`optimization/review-tools/`; none imports or executes the protected cache helper.

No new numerical search ran. The original Warlock deadline remains expired, and
the selected four-build library, presets and source pointers remain unchanged.
A separate up-to-two-hour update for Warrior, Mage and Warlock was requested;
authorization remains pending. Passing model controls do not approve publication
or establish a new BiS result.

The separate `warlock-deathmist-catalog.mjs` adapter prepares the actual search
acquisition and ownership metadata. Both faction routes are alternatives; shared
milestone rewards are not turned into exclusive choices. All eight individual
pieces and all 247 two-to-eight-piece subsets pass the existing prebis filters
for both factions, including the full set. The adapter-produced catalog equals
the model's actual UI catalog. This checks the eight changed slots, not a
completed all-slot search or a new DPS result. The immutable preparation is
`warlock-deathmist-catalog-v1/prepare-aIOfze/report.json`, byte SHA-256
`6978287fdc264613c97931050620cbbc4b7389c5accdec8f5c08e8c7e8c6b6c9`.

## Current source and stat preparation

Base IDs are **22070–22077**; alternate IDs are **226921–226928**. The capture
authenticates the client manifest, normalized data, selected raw tables, combat
ratings, historical icon identities, baked reward evidence and parent engine
sources. All eight base pieces have no individual item-effect links; set effects
remain separate from item stats.

| Pieces | Base spell    | Current client payload                                                                                       |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------ |
| 2      | 18679         | +8 nonphysical resistances                                                                                   |
| 4      | 27780 → 21330 | Incoming-hit fear: 2% chance, 60-second internal cooldown, two-second child and 25% movement-speed reduction |
| 6      | 14047         | +23 magical damage and healing                                                                               |
| 8      | 14803         | +200 bonus armor                                                                                             |

Alternate 1681 has +8 MP5 at three pieces and a five-percent spellcast healing
proc at four; fear moves to five pieces. The healing child's raw base points are
300 with variance 0.2. Those values remain source data, not base-set bonuses.
The indexed primary [Deathmist Belt tooltip](https://www.wowhead.com/forever/item=22070/deathmist-belt)
corroborates the base thresholds, two-second fear and one-minute cooldown.

The fear child retains mechanic 5, dispel type 2, diminish type 0, implicit target
6 and range index 1. That range record says Self Only; it does not establish an
attacker radius or live targeting behavior. Targeting/range, immunity, damage
break, diminishing returns and live proc cadence still need qualification. No
runtime behavior is inferred from the description. The separately deferred
global boss-debuff overflow rule remains pending too.

The pure review rejects partial or alternate membership, changed thresholds,
proc masks/chance/cooldown, child effects/duration/category and individual
effects. Draft preparation uses the existing strict current-item normalizer,
retains raw unrestricted wear masks separately from the Warlock quest allowlist,
and rejects unsupported stats or profession gates. Historical stats cannot
replace current values. Eight regressions also cover reward uncertainty and
caller-input preservation.

## Isolated passive component

`infra/simulator/warlock-deathmist-passives.go` exposes
`ForeverDeathmistPassiveStats(equipment, ruleset)`. It counts only set ID 518 and
returns the sourced flat stat vector. Other rulesets return zero. English display
names and alternate-set pieces cannot contribute to base thresholds. Spell power
already contributes to healing; adding a second healing-power bonus would count
the same reward twice. Armor uses `BonusArmor` and the existing Warlock dependency,
without adding or duplicating that dependency.

The component is deliberately **unregistered**. It is a reusable part of the
future complete handler, not a passives-only replacement for Deathmist. It does
not grant support to the four-piece bonus, any full-set candidate, a catalog item
or a published build. Fear remains unimplemented until its behavior is verified.

Fourteen native outcomes cover every zero-through-eight-piece boundary, input
preservation, alternate and Classic isolation, mixed membership, localized names,
and actual constructed Warlock stats with and without Demon Armor over three
resets. Native construction supplies the isolated vector as explicit bonus
stats, with no set equipped; it therefore verifies the stat pipeline rather than
pretending to test a complete set dispatch or fight. All eight source regressions
also pass. The first failed native attempt is retained: its test setup omitted
an empty equipment object; the corrected setup changes no production behavior.

The same fourteen named outcomes pass in actual Chromium/WASM with no page
errors. This is component parity, not full-fight metric parity. The current
version-two runners pass explicit Prettier and ESLint checks; both Go files pass
`gofmt`. Earlier runner sources and reports remain available unchanged.

Current evidence under `artifacts/forever-simulator/optimization/`:

- Native: `warlock-dungeon-upgrade-v1/passive-controls/verify-dLdKif/report.json`,
  semantic SHA-256 `9599d43d6274bacb03447bb2606029e54c63fee0a054e06f4686c7814d8c5e21`.
- Chromium/WASM: `warlock-dungeon-upgrade-v1/passive-browser-controls/verify-fuaLKy/report.json`,
  semantic SHA-256 `2d051caec1258428049743a3d828b6665c3d3776d6cbf1c68ac7f0a6be4b3da8`.
  Its **40,104** verified source/evidence pins retain all **39,154** preceding
  campaign pins and the unchanged earlier attempts.
- Passing source regressions: `warlock-dungeon-upgrade-v1/passive-source-regressions-v1.log`.
- Current execution logs: `warlock-dungeon-upgrade-v1/passive-component-controls-v3.log`
  and `warlock-dungeon-upgrade-v1/passive-browser-controls-v2.log`.

Reproduce the isolated controls without selecting a model:

```sh
node --test infra/simulator/warlock-deathmist-source.test.mjs
node artifacts/forever-simulator/optimization/review-tools/verify-warlock-deathmist-passives-v2.mjs --verify
node artifacts/forever-simulator/optimization/review-tools/verify-warlock-deathmist-passive-wasm-v2.mjs --verify
```

The browser runner authenticates its recorded native parent; it does not silently
substitute a later native attempt. No existing parent engine file is modified.

The existing Warlock full-raid window ended **October 23, 2026, at
17:56:57.713 UTC**. These component checks neither reset that window nor authorize
new optimization. The selected model, library pointers, existing parent engine
files and clock bytes stay unchanged.

## Reward reference review

| Phase | Alliance                                                                                     | Horde                                                                             | Expected base rewards     |
| ----- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------- |
| 1     | [8911](https://www.wowhead.com/forever/quest=8911/an-earnest-proposition)                    | [8919](https://www.wowhead.com/forever/quest=8919/an-earnest-proposition)         | Bracers                   |
| 2     | [8936](https://www.wowhead.com/forever/quest=8936/just-compensation)                         | [8943](https://www.wowhead.com/forever/quest=8943/just-compensation), unavailable | Belt, Wraps               |
| 3     | [8958](https://www.wowhead.com/forever/quest=8958/anthions-parting-words)                    | [9021](https://www.wowhead.com/forever/quest=9021/anthions-parting-words)         | Sandals, Leggings, Mantle |
| 4     | [9005](https://www.wowhead.com/forever/quest=9005/saving-the-best-for-last), indexed section | [9012](https://www.wowhead.com/forever/quest=9012/saving-the-best-for-last)       | Mask, Robe                |

Six primary pages expose parsed reward sections. Quest 9005's indexed primary
section corroborates reward names; its direct page requests JavaScript
verification. Quest 8943 remains unavailable, so its association still rests on
the authenticated baked source. Other-flavor search results are excluded.
Unavailable pages do not establish unavailable quests or rewards.

Reward links from 8911, 8936, 8958 and 9012 resolve to all eight distinct base
targets. The belt body requests JavaScript verification; its indexed tooltip is
available. The mask body times out, but the failure identifies the followed base
URL. Other sections corroborate names; their exact IDs still use same-TOC baked
associations. No live delivery, quantities or simultaneous reward delivery was
observed.

## Evidence and reproduction

Artifacts below live under `artifacts/forever-simulator/optimization/`:

- Source: `warlock-dungeon-upgrade-v1/source-4df2a1a4f1efd19d.report.json`, byte
  SHA-256 `4df2a1a4f1efd19d43f66280416b0bdc53b644f84a7b8dc997484798f5f556d6`.
- Drafts: `warlock-dungeon-upgrade-v1/prepared-ed6e52db3427f4c7.json`, semantic
  SHA-256 `ed6e52db3427f4c7caa23f0906b86fa467421967b04f9a787db0d51be9a785c0`.
- Reference review: `warlock-dungeon-upgrade-v1/reference-supplement-cea59f85f34142c3.json`,
  semantic SHA-256 `cea59f85f34142c3822cbb6ce37b28a836d3003f83a39ee8d630ced76ca2577d`.
- Validation: `warlock-dungeon-upgrade-v1/validation-719511049ce22b4c.json`,
  semantic SHA-256 `719511049ce22b4c0633d4cffae8a74c6123c2b13c1a2f27548a3f23e4ed7591`.

The fixture `infra/simulator/fixtures/warlock-deathmist-source.v1.json.gz` has byte
SHA-256 `eee39db4f07d629edb5715f239fd1eb29a628a324ce58dd860b62d1ff79c9faa`.
Validation freezes five new files and **756** hashes, preserving all **724** prior
Mage confirmation pins. Eight tests, actual lint/format checks on all five files
and three bundled entry graphs pass. The initial failed test log is preserved:
one mutation assigned the existing threshold; the corrected fixture explicitly
changes the four-piece fear threshold. Production behavior was unchanged. The
passing log is `source-contract-tests-corrected-v1.log`. These sources are frozen;
corrections require a new version.

Run from the repository root with the recorded client and source artifacts:

```sh
node artifacts/forever-simulator/optimization/review-tools/capture-warlock-deathmist-source-v1.mjs --capture
node --test infra/simulator/warlock-deathmist-source.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-warlock-deathmist-drafts-v1.mjs --prepare
```

Preparation requires the saved passing log and exact source bytes. It writes
immutable local evidence with runtime, catalog, numerical and publication
admission false. New evidence needs its own reviewed version; overwriting the
fixture cannot update an existing qualification.

## October 27 current-model update in progress

The separate remaining-class allowance is now approved; original expired clocks
and source evidence above remain historical and unchanged. The new Warlock
clock runs from October 27 17:07:38.680 UTC through October 28 17:07:38.680 UTC.

All eight actual current UI/native/full-WASM/stat pairs passed:
`remaining-class-updates-20261027-v1/warlock-controls-d0h9f2/report.json`, SHA
042b3a97637893ac79a4a567019698d030efda69c3c88e15f56d7a15d0aab71d.
Current model identity is
bfb98b8c556b4a10d4cce45eca5db4a9872e25f57c0df545651b222ad039ecb9.

The current four-style input is
`remaining-class-updates-20261027-v1/warlock-search-v1/prepare-xgpDuB/input.json`,
SHA 6c540ae4a75d9cb98d4aad99d5944cc65a5b9873b316cd7571610e4e7e995aae.
Each style has 25 complete gear/set/enchant groups and approximately 10,930
structural candidates. Full Deathmist and maximum eligible set witnesses stay
mandatory. Both stones and legal demon/sacrifice combinations are explicit; the
primary DS/Ruin build remains pure sacrifice. Raid dependencies, class/weapon
restrictions and ignored weapon-skill bonuses retain their existing guards.

One six-worker feedback loop is running, one style at a time, with the accepted
2% practical margin and no deep timing search. It compares all slots, ordered
jewelry/hand layouts, sets, nonraid enchants/consumes, geared talent/APL/pet states
and joint leaders. Selected settings are frozen before two independent 20k
confirmations. These are ongoing calculations, not newly published BiS winners.

Preparation V1 stopped before any numerical dispatch because the DS/Ruin
extension helper accepts a base bank object instead of talent references. Its
original files and failure receipt remain. The V2 state bank calls the actual
reference-based talent-bank contract, and its eight authentic focused tests
pass. All four full-bank preparations completed with V2 before dispatch.

Current live process, immutable deadline and follow-up delivery commands are
recorded in `context.md`. No new Warlock preset has been deployed.

## October 27, 18:44 UTC — current update complete locally

All four numerical styles and the complete native/website delivery now pass.
Each selected setup was frozen before two independent 20k confirmations, then
captured through the actual UI and compared with native/full-WASM statistics
and combat results. The practical 2% target is met with no unresolved contexts;
this remains a bounded comparison rather than a global-optimality claim.

| Style                   | Independent DPS | Confirmation fights |
| ----------------------- | --------------: | ------------------: |
| Demonology, default     |        860.7315 |              40,000 |
| Affliction              |        760.1893 |              40,000 |
| Destruction             |        741.4499 |              40,000 |
| DS/Ruin, pure sacrifice |        712.5943 |              40,000 |

Local release: `d2d98c8539081334ba3fdbaf`. Handoff under the remaining-update
artifact directory: `warlock-handoff-v1/finished-piy1hc/report.json`, SHA
e79f577fd593d9496b9ab679e720c17163138899d69a615d3babdc9a0632beb0.
Twenty-six native-menu and ten complete Next desktop/mobile checks pass,
including both preset menus, saved custom characters, full imports, all four
real simulations, native parity, Stop followed by a fresh simulation and one
page scroller. The source checks pass 128 website and 58 infrastructure tests,
strict TypeScript and lint. Both actual screenshots were visually inspected.

The V4 native adapter fixes recorded field loss when a preset transition clears
the sacrificed demon. Its regression fixture contains the actual failed native
observation and selected payloads; the earlier V3 source/candidate remain frozen.
The website reader also accepts a legitimate empty first talent tree, while
retaining malformed-allocation, source/hash, model and browser-evidence checks.
Cold-build and initial React-selection timing failures remain recorded; the
final harness waits for actual selected state and preserves all parity checks.

The mathematical V1 duplicate-write failure and 59,398 valid measurements are
preserved. V2 coalesces identical concurrent numerical inputs and reused those
records without resetting the original clock. No extra timing search ran and
the live-mechanic/acquisition uncertainty above remains explicit. The owned
Next review server was stopped and user port 3017 was untouched. No new Git or
production release occurred; three other classes remain before the owner's
complete commit, push and deployment.
