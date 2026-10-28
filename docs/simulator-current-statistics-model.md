# Expanded catalog with stable simulation statistics

Status on October 27, 2026: component and stat API checks pass; new rankings,
selected presets and production publication remain unapproved and unchanged.
This preparation starts no class clock and reuses no historical DPS scores.

## October 27 — exact caster stat contexts supersede partial-raid checks

An independent request replay found that earlier stat checks reconstructed only
part of the raid: `numActiveParties` was omitted, while the prepared simulation
requests explicitly use one active party. The older Mage checks also retained
their recorded support rather than the current full-v2 context. Agreement of
those native/browser results remains valid for those requests; it does not
qualify the current simulation context. Original reports and failures remain.

The replacement materializes `ComputeStatsRequest` directly from the actual
prepared `RaidSimRequest`, replacing only the selected equipment. All **18
complete native/Chromium pairs** pass: three Mage styles, Shadow and Smite, and
four Warlock styles, each with incumbent and full upgrade-set gear. Independent
audits replay the saved wires, complete results and exact raid/encounter/gear
context, then check every retained legal gear vector and candidate pool. No
ranking jobs, new numerical window, selection or deployment ran.

`infra/simulator/simulation-stats-context.mjs` exposes
`createSimulationStatsRequest` and `assertSimulationStatsContext` for normalized
protobuf requests. The guard preserves all raid/player/encounter fields and
requires an explicit Forever ruleset and one active player party. Acquisition,
gear legality, model identity and numerical admission remain separate gates.
Ten regressions use 18 actual source-bound captures across all nine specs,
including rejection of all 18 old context-mismatched requests, lost raid buffs,
changed gear/enchants and changed encounters. The compressed fixture is
`fixtures/simulation-stats-context.v1.json.gz`, SHA-256
`b10690a25bf94879488159fa3fb2717ea50b255ac618e7e37e7ba371ca0ab285`.

Use the following successor inputs for future numerical preparation. Their bank
files and gameplay model remain unchanged; the stat evidence is replaced.
Paths are relative to `artifacts/forever-simulator/optimization/`:

- Mage: `current-mage-candidates-v1/prepare-aAkLGH/exact-stats-IIvGT5/input.json`,
  SHA-256 `281e7ea4b9f1635b4f5f221f2c60cba8461c74f79e98d59f8c53d9052a63b274`.
  Six stat pairs; independent audit `preparation-review-kGYEYH/report.json`,
  SHA-256 `266d7fece28fcce8690b7a21b9764ad6e0af1949ff8831fa30802add3c4c491d`.
- Priest: `current-priest-candidates-v1/prepare-r6B6oU/exact-stats-UG5XIW/input.json`,
  SHA-256 `234995ce7800c69e1029838762c8116546a1e6af2e006c4a2f50539e5e274863`.
  Four stat pairs; independent audit `preparation-review-IuQpmV/report.json`,
  SHA-256 `b92ec35224915515a3ca3af12099fae68f36c71a049b12c1b8174df75dc1e783`.
- Warlock: `current-warlock-candidates-v1/prepare-Euyj9t/exact-stats-rj41Wy/input.json`,
  SHA-256 `4e3812e57e9465d32391f1df823fb41ba517733974ce8103dab63e1a38af40ff`.
  Eight stat pairs; independent audit `preparation-review-sddnfG/report.json`,
  SHA-256 `cf4ffc632273b1c31ab7541e325613f4c642c19e2cf7a15d623b9fd94a266424`.

Private producers are `qualify-exact-caster-stats-v1.mjs` and
`review-exact-caster-preparation-v1.mjs`; Mage's older bank lacks explicit
profile/variant fields, so V2 checks its schema plus the same exact profile
hash instead. V1's failed Mage assertion remains preserved. None changes bank
rules or relaxes source/context comparison. The successful pre-existing stat
API binary is reused only with its exact compiled-model identity and checksum.
All raw new requests and native/browser results are independently pinned.

Shaman follow-up: Elemental, Stormcaller and Enhancement add six more complete
exact-context native/Chromium stat pairs and an independent all-vector replay,
for 24 pairs across 12 DPS styles. Their preserved melee-weaving consumes and
conditional class/faction/milestone access require the existing Shaman-specific
feedback adapters. See [Five Thunders recovery](simulator-shaman-five-thunders-recovery.md)
for the authoritative successor input and audit. The shared guard is used by
`qualify-exact-caster-stats-v2.mjs`; existing nine-spec reports are not rerun.

Warrior adds 23 separately prepared control/stat pairs on this same frozen
model: fifteen corrected-mode controls and eight representative Heroism
comparisons. These pass native/Chromium API and independent replay, but are
not new actual UI combat captures or rankings. The mode guard rejects the old
Classic captures rather than relabelling their results. Exact receipts and
remaining capture requirements are in
[the Warrior update record](simulator-warrior-full-raid-update.md).

For future producers, normalize both sides through the same codec before
checking the context:

```js
const simulation = RaidSimRequest.toJson(request);
const equipment = EquipmentSpec.toJson(selectedGear);
const statsInput = ComputeStatsRequest.fromJson(
  createSimulationStatsRequest(simulation, equipment),
);
assertSimulationStatsContext(simulation, ComputeStatsRequest.toJson(statsInput), equipment);
```

The prior Mage correction repaired cancellation in variance calculations, but
its isolated model contained 2,695 items. The expanded Priest/Heroism lineage
contained all 2,743 items and 72 base dungeon-set pieces, but retained the older
statistics calculation. This derivative combines those two preparations.

Only `sim/core/utils.go` and `sim/core/sim_concurrent.go` change among inherited
compiler files. The existing stable central-moments implementation and its two
test fixtures are added. The test-only `FakeAgent` supplies an omitted upstream
fixture and registers no production factory. The compiled database, catalog
bytes and gameplay sources stay identical to the qualified expanded parent.
The strict finite-metric validator and every historical measurement remain
unchanged. Empty or invalid summaries do not become measured zeros.

The completed model identity is
`bfb98b8c556b4a10d4cce45eca5db4a9872e25f57c0df545651b222ad039ecb9`.
The initial **303 outcomes** pass natively and in actual Chromium/WASM:

| Control group                                  | Outcomes |
| ---------------------------------------------- | -------: |
| Stable moments and inherited Elemental fixture |        8 |
| Mage catalog and Sorcerer behavior             |       37 |
| Native Shadow/Smite Virtuous                   |       74 |
| Heroism                                        |       41 |
| Bear Feralheart                                |       31 |
| Five Thunders                                  |       44 |
| Soulforge                                      |       46 |
| Deathmist                                      |       22 |

A separate review of the same frozen model adds **116 passing native and
Chromium/WASM outcomes**: Hunter/Beastmaster23, Rogue and inherited Valor30,
and Feral DPS/current Feralheart catalog63. This brings verified coverage to
**419 outcomes** without modifying the model or replacing its original receipts.

The statistics controls reproduce the retained constant-Scorch cancellation,
check its correct zero population deviation, and cover scaling, unequal worker
means and sample sizes, large offsets, empty data and merger-state cleanup.
All inherited emitted seeded proc outcomes match between backends.

Six additional complete native/browser `ComputeStats` comparisons pass for the
recorded Frost, Fire and Arcane setups, each with incumbent and full Sorcerer
gear. They preserve recorded talents, consumes and encounters, remove embedded
old item databases, and use the new compiled catalog. They are stat API checks,
not new full-fight DPS or UI qualifications.

Four additional complete stat API pairs pass for Shadow and Smite, with their
incumbent and full Virtuous sets, after applying the full-v2 raid buff policy.
Their independently audited all-slot banks are documented in
[Priest Virtuous recovery](simulator-priest-virtuous-recovery.md). Those checks
also start no ranking jobs or class clock.

## Prepared Mage searches

The new search preparation uses the existing Mage bank and full-v2 buff policy
as immutable successors whose sole computational import change is the existing
pure fingerprint module. The original sources and protected mutable cache
helper remain untouched. Guarded bundles reject any protected-helper dependency
before loading it, and retain both original and successor source checksums.

The full-v2 policy is decoded and checked in the actual request wire: improved
Strength of Earth and Grace of Air, Windfury, Trueshot, Feral and Moonkin auras,
Kings and the remaining recorded full-v2 buffs. No unrelated saved context is
changed. The earlier 2,695 item records remain identical as structured records
inside the new catalog. Source, class, profession, faction, non-raid acquisition,
equipment ownership, hand layout and enchant rules are retained.

Each style has 25 retained groups covering all 17 slots, ordered ring/trinket
pairs, one-hand/held-offhand and two-hand/empty-offhand layouts, wands, sets and
compatible enchants. All 247 multi-piece Sorcerer subsets are present and the
full eight-piece witness is mandatory. Wrong-class use is rejected.

| Style  | Generated proposals | Retained group entries | Unique gear vectors |
| ------ | ------------------: | ---------------------: | ------------------: |
| Frost  |              10,661 |                 10,652 |              10,487 |
| Fire   |              10,566 |                 10,557 |              10,394 |
| Arcane |              10,782 |                 10,773 |              10,615 |

Generated counts include nine singleton groups omitted from each returned bank;
the same incumbent also appears in several retained groups. They are not unique
simulation counts. The independent audit reconciles those counts, checks every
retained vector's legality and group scope, required slot/pair domains, all-slot
coverage, full-set retention, wire buffs, source checksums and negative class,
variant and database cases. No ranking jobs or random-seed confirmation claims
are produced. Fresh actual combat captures and an approved numerical window
are required before optimization.

## Immutable receipts

Paths below are relative to `artifacts/forever-simulator/optimization/`:

- `current-statistics-combat-model-v1/build-293yU7/report.json`, SHA-256
  `9d36afc75983ec9c1a305fc15448656bbc8be8f75e242979191fc03cf5a61bda`.
- `.../build-293yU7/browser-review-fTknp0/report.json`, SHA-256
  `4db0929b987c050192fa741348e4afaf86fcdef345b2971569c9461fc39243a8`.
- `.../build-293yU7/mage-stats-review-qcyle3/report.json`, SHA-256
  `d9d7d366ef3110e34a5a790a9f3d77bab79676f7fa48767f6fc16f91fc4bb042`.
- `.../build-293yU7/inherited-controls-od4xgN/report.json`, SHA-256
  `29885cb638f70462af61fcbbb82768d12a7bafd1acd54b2a170f7265ea525f4b`.
- `.../inherited-controls-od4xgN/browser-review-c2nEvK/report.json`, SHA-256
  `5caef3cdc83c5794c3b4597d7556e15e57daad40f5ae5971571f69468c768d28`.
- `current-mage-candidates-v1/prepare-aAkLGH/input.json`, SHA-256
  `da6331f6507c1f1c683480a8c8e783ef0daeab12bd535d70b077982a23ee102c`.
- `.../prepare-aAkLGH/preparation-review-uDI6Gc/report.json`, SHA-256
  `8adbe0f1efbb84e7ca0c849db6b2dda0eaa4715b3ff5081457dffceb555af919`.

Private producers under `review-tools/` are
`build-current-statistics-combat-model-v1.mjs`,
`review-current-statistics-combat-browser-v1.mjs`,
`review-current-mage-stats-api-v1.mjs`,
`prepare-current-mage-candidates-v2.mjs` and
`review-current-mage-preparation-v2.mjs`. Initial preparation/audit versions
remain preserved: the first expected string tristates instead of the actual
numeric full-v2 values; the first count assertion omitted discarded singleton
groups. The corrected versions do not alter inputs or legal candidate rules.
The broader existing-class controls use
`review-current-statistics-inherited-native-v1.mjs` and
`review-current-statistics-inherited-browser-v1.mjs`.

The approved Bear package remains on its measured original model. This
statistics derivative does not silently inherit its numerical qualification or
replace the common-model tank tier board. Mage's original class window and the
pending additional-window request remain unchanged. Other class and healer
updates and the owner's complete commit/push/deployment scope remain open.
