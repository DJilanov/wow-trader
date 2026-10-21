# Full-raid fixed-build comparison — October 21, 2026

Status: measured and independently replayed; not newly optimized or approved for publication.

All fifteen standard measured DPS builds were rerun with the exact deployed
`infra/simulator/raid-buff-defaults.v2.json` contract. Kings/Might/Wisdom are individual
player buffs; raid auras and Windfury use their proper message owners. Gear, talents,
rotation, consumes, encounter and each class's actual original engine stayed fixed.

## Measured results

Each column uses two inspected 10,000-fight ranges, 20,000 fights per build/scenario.
The old column is a paired rerun, not a copy of the historical published 40,000-fight
reference. Tiny differences may reflect RNG ordering, not a meaningful improvement.
Original M81/A4 engines, race and class-specific encounter/debuff assumptions remain;
this is not a common-engine cross-class tier list.

| Existing build          | Previous buffs DPS | Full-raid DPS |  Change |
| ----------------------- | -----------------: | ------------: | ------: |
| Warrior · Fury          |             838.01 |        838.03 | +0.002% |
| Warrior · Arms          |             802.51 |        802.61 | +0.012% |
| Warrior · Two-hand Fury |             735.31 |        735.28 | -0.003% |
| Rogue · Combat          |             661.25 |        662.16 | +0.138% |
| Rogue · Mutilate        |             647.17 |        648.38 | +0.188% |
| Rogue · Subtlety        |             613.28 |        614.35 | +0.174% |
| Hunter · Beast Mastery  |             905.76 |        905.76 |  0.000% |
| Hunter · Marksmanship   |             910.50 |        910.50 |  0.000% |
| Hunter · Survival       |             868.38 |        868.38 |  0.000% |
| Druid · Feral DPS       |             752.09 |        752.09 |  0.000% |
| Druid · Balance         |             573.83 |        573.83 |  0.000% |
| Mage · Frost            |             572.16 |        576.47 | +0.753% |
| Mage · Fire             |             650.27 |        661.75 | +1.766% |
| Mage · Arcane           |             659.53 |        669.96 | +1.582% |
| Warlock · Demonology    |             830.09 |        836.09 | +0.723% |

The total was 60 genuine scalar origins / 600,000 fights. All 30 detailed native/raw-WASM
controls passed, including complete player, pet and resource parity (750 fights on each
backend). An independent reader reconstructed all comparisons from authenticated raw
origins, complete inputs, control records and source hashes, rather than trusting summary
flags. Four replay/negative tests reject missing or duplicated specs, forged DPS/classes/
requests and attempts to turn this inspected comparison into fresh public qualification.

## Evidence

- Summary: `artifacts/forever-simulator/optimization/raid-full-recheck-v2/comparison.json`.
- Summary semantic SHA-256: `f52e3c0d92e1f7129e8902fbdbe1626178371239417b0d7264507052ebc54c57`.
- Independent replay: `raid-full-recheck-v2/audit.json`.
- Detailed controls: `raid-full-recheck-v2/controls.json`.
- Physical study: `de421939628e03add7faff47664c15a29766d81b57461b32c2680713914f038b`.
- Other DPS study: `8cc360f6dd730c3ae5edd106317fea8313fe538bc5c79d2388e2a3e80a609f9b`.
- Exact input changes: `raid-full-recheck-v2/input-audit-e7ab8eeb43d740f7.json`.

Short paths above are relative to `artifacts/forever-simulator/optimization/`;
paths beginning with `artifacts/` are relative to the repository.
The input audit counts 1–6 selected external debuff flags per existing build. This is
not proof of a full raid's 16-slot enforcement: self-applied APL effects and other members'
debuffs require a separate accounting. Player buffs are not capped. No boss-debuff setting
was changed for these paired comparisons.

Do not count `ComputeStats` target metadata's registered auras as simultaneous boss
debuffs: it includes unused spells and multiple ranks. The retained native/browser
control payloads contain the selected player/pets and stats metadata, not complete
target combat metrics or timed aura logs. They therefore cannot establish peak boss
debuff occupancy. A separate16-slot check needs that evidence before making a broader
raid-wide claim; a passing player/pet/resource parity check is not that check.

## Next optimization boundary

The measurements explain the effect on the old selected gear; they do not prove that
the old gear/talents/rotation remain best after changing buffs. Full-v2 geared feedback,
independent fresh confirmation and actual preset/guide/browser delivery remain necessary
before replacing public BiS references. The website and historical references were not
changed by this calculation turn.

A new Affliction full-raid request adapter is implemented and passes four actual-data
tests, including all eight real gear canary constructions, both hand layouts, set,
trinket, enchant and wand changes. It preserves the completed old-buff blue winner only
as an initial seed and gives new requests new identities. It cannot reuse old DPS as
full-v2 evidence. No Affliction numerical gear job or public qualification has started.

The original Warlock first-pass window still ends at 2026-10-21 06:24:18.106 UTC. This
separate owner-requested post-deployment comparison neither resets it nor grants more
corrections. Completing the remaining Warlock search under the new baseline needs a
new explicitly bounded window; preserve the old ledger and all checkpoints.

## Reproduction

Affliction continuation preparation is independently checked as of06:41UTC: the new
full-buff gear runner reconstructed96old stages/103592authenticated origins, then built
all17slot pools/25groups/10451distinct gear proposals and8control definitions. Eight
focused request/gear tests and lint pass. This replay started no new fights. Its receipt
is `optimization/reviews/affliction-full-raid-gear-preflight-20261021-064101.json` under
the simulator artifact root. The V2 numerical entry rejects the now-expired original
Warlock window. The requested extension is still pending; do not bypass this guard.

The new gear phase can be inspected without authorizing numerical dispatch:

```sh
NODE_OPTIONS=--max-old-space-size=8192 node artifacts/forever-simulator/optimization/review-tools/run-warlock-affliction-full-raid-gear-v2.mjs artifacts/forever-simulator/optimization/bounded-native-studies/764404e8248b94f6e9426ffa9b70e64f67f90c6606c3902858197fd2bcd4c86c/completed.json --plan
```

These private review tools require the authenticated local model, publication and
admission artifacts. They are not standalone commands for a fresh clone.

```sh
NODE_OPTIONS=--max-old-space-size=8192 node --test artifacts/forever-simulator/optimization/review-tools/raid-full-buffs-v2.test.mjs
NODE_OPTIONS=--max-old-space-size=8192 node artifacts/forever-simulator/optimization/review-tools/raid-full-recheck-audit-v2.mjs --verify
NODE_OPTIONS=--max-old-space-size=8192 node --test artifacts/forever-simulator/optimization/review-tools/raid-full-recheck-audit-v2.test.mjs
```

The `--verify` CLI writes an exclusive audit receipt; if that receipt already exists, use
the replay tests to verify it without overwriting evidence. Do not edit the four frozen
full-raid measurement helpers or contract after capture, rerun completed numerical jobs,
reset class clocks or promote the results merely because their controls passed.
