# Warlock dungeon-upgrade recovery

The catalog audit found all eight base **Deathmist Raiment, set 518** pieces
missing. Same-name alternate **1681** has different items and thresholds. The
inherited name-based engine handler grants the alternate's three-piece MP5 and
four-piece healing proc; it leaves fear empty. Adding base items to that handler
would compare the wrong effects.

| Work | Evidence | Status |
| --- | --- | --- |
| Recover base and alternate identities | Authenticated build 1.60.1.70532 tables, separate memberships and complete eight-spell closure | Implemented |
| Prepare current item stats | Eight base pieces, armor, spell power and universal rating conversion; historical icons only | Implemented; catalog admission pending |
| Recover reward associations | Baked Forever QuestieDB 1.0.4, eight quests and sixteen item associations | Implemented; live delivery unobserved |
| Corroborate primary reward references | Six parsed sections, one indexed section and eight distinct followed base-item targets | Implemented for seven quests; quest 8943 pending |
| Isolate sourced passive calculations | Exact set-ID resistance, spell power/healing and bonus armor; fourteen matching native/Chromium-WASM outcomes | Implemented and verified as an unregistered component; complete set remains unqualified |
| Implement and qualify base-ID dispatch | Stat thresholds, fear, armor dependency, alternate/Classic separation and lifecycle tests | Pending |
| Compile a complete current native/WASM model | Preserve qualified parent effects and exact embedded/UI database equality | Pending |
| Execute full-raid controls and optimization | All slots, hands/pairs/sets/enchants and geared talent/APL/pet/consume feedback | Pending |
| Confirm and deliver matching builds | Fresh 2% and separate original 1%, defaults, presets, library, guidance and desktop/mobile checks | Pending |

This preparation changes no selected catalog, engine, preset or ranking and
starts no class clock or numerical job. The full original campaign remains in
scope; these drafts do not complete Warlock optimization.

## Current source and stat preparation

Base IDs are **22070–22077**; alternate IDs are **226921–226928**. The capture
authenticates the client manifest, normalized data, selected raw tables, combat
ratings, historical icon identities, baked reward evidence and parent engine
sources. All eight base pieces have no individual item-effect links; set effects
remain separate from item stats.

| Pieces | Base spell | Current client payload |
| --- | --- | --- |
| 2 | 18679 | +8 nonphysical resistances |
| 4 | 27780 → 21330 | Incoming-hit fear: 2% chance, 60-second internal cooldown, two-second child and 25% movement-speed reduction |
| 6 | 14047 | +23 magical damage and healing |
| 8 | 14803 | +200 bonus armor |

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

| Phase | Alliance | Horde | Expected base rewards |
| --- | --- | --- | --- |
| 1 | [8911](https://www.wowhead.com/forever/quest=8911/an-earnest-proposition) | [8919](https://www.wowhead.com/forever/quest=8919/an-earnest-proposition) | Bracers |
| 2 | [8936](https://www.wowhead.com/forever/quest=8936/just-compensation) | [8943](https://www.wowhead.com/forever/quest=8943/just-compensation), unavailable | Belt, Wraps |
| 3 | [8958](https://www.wowhead.com/forever/quest=8958/anthions-parting-words) | [9021](https://www.wowhead.com/forever/quest=9021/anthions-parting-words) | Sandals, Leggings, Mantle |
| 4 | [9005](https://www.wowhead.com/forever/quest=9005/saving-the-best-for-last), indexed section | [9012](https://www.wowhead.com/forever/quest=9012/saving-the-best-for-last) | Mask, Robe |

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
