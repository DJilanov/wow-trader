# Priest Virtuous recovery

The selected Priest library and embedded WASM catalog omit all eight base
Virtuous pieces, IDs **22078–22085**, set **514**. Existing results retain their
original catalog; they do not establish whether Virtuous would win.

## Source and catalog

Current build **1.60.1.70532** supplies stats and effects. Historical records
supply icons only. The isolated proposal preserves all **2,680** parent items
and other database fields, appending exactly eight items for **2,688** total.
No selected catalog, browser release, preset or ranking changes.

The raw wear mask is unrestricted (`-1`). Eight baked class/faction quest
relations support a separate, conditional Priest acquisition reference. Actual
reward quantities and simultaneous live delivery remain unverified.

| Pieces | Current base effect                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| 2      | +8 Arcane, Fire, Frost, Nature and Shadow resistance                                                          |
| 4      | Spell 27778 triggers shield 27779: 2% chance, 60-second internal cooldown, 488 absorption, 30-second duration |
| 6      | +23 unified spell power, which already contributes to healing                                                 |
| 8      | +200 bonus armor                                                                                              |

Alternate set **1675** has different thresholds and mana effects; they cannot
contribute to base set 514. The shield has zero spell-power coefficient and
Priest family 6/mask `[1,0,0,0]`. Power Word: Shield modifiers and family
interactions require explicit admission. The proc mask remains `[139944,0]`;
mapping it to this engine's incoming events also requires admission.

## Implemented payload reference

`priest-virtuous-source.mjs` reviews exact captured rows;
`priest-virtuous-drafts.mjs` prepares current stats and the isolated catalog;
`priest-virtuous-reference.mjs` renders the Go component from reviewed values.
These modules live under `infra/simulator/`.

The component exposes two intentionally unregistered APIs:

- `ForeverVirtuousPassiveStats` computes the sourced flat bonuses using base-set
  identity and the Forever ruleset.
- `RegisterForeverVirtuousShieldReference` requires an incoming-event policy and
  a family multiplier. It neither installs a set handler nor defaults either
  unresolved behavior.

All **22 named native checks** and the same **22 actual Chromium/WASM checks**
pass. They cover thresholds, alternate/Classic isolation, fixed capacity at
different spell-power values, explicit multiplier transport, absorption,
replacement, expiration, reset, mana/GCD isolation, chance, cooldown boundaries,
duplicate guards and rejection before RNG consumption. Both backends observe
**93 procs in 5,000 isolated chance opportunities**. That test resets the cooldown
between opportunities; separate checks prove the sixty-second gate.

The controlled event reference accepts landed direct enemy results and excludes
periodic/friendly events. Multipliers 1 and 1.2 exercise the policy boundary.
These are test interpretations, not verified server behavior. Overlapping
shields retain the existing engine's unverified application-order reference.

A name-scoped test initialization hook uses existing item 16696 without changing
its stats, set identity or ordinary-character effects. All **620** parent compiler
files remain unchanged; only the component and its test file are added. The
initial inventory preflight failure and late-aura test-setup failure are retained.

## Evidence and commands

Paths below are relative to
`artifacts/forever-simulator/optimization/priest-virtuous-recovery-v1/`:

- Source: `source-4fb5b5f056a0e163.report.json`.
- Catalog: `prepared-2ea9752ae7c637fa.json`, 79 source pins and eight source contracts.
- Native: `reference-controls/verify-1IGiCc/report.json`, 684 source pins.
- Chromium/WASM: `reference-browser-controls/verify-DRleum/report.json`, 1,312 pins,
  zero page errors and matching seeded chance count.

```sh
node --test infra/simulator/priest-virtuous-source.test.mjs infra/simulator/priest-virtuous-reference.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-priest-virtuous-catalog-v1.mjs --prepare
node artifacts/forever-simulator/optimization/review-tools/verify-priest-virtuous-reference-v2.mjs --verify
node artifacts/forever-simulator/optimization/review-tools/verify-priest-virtuous-reference-wasm-v2.mjs --verify
```

## Remaining work

1. Admit event eligibility, Priest-family interactions, overlap rules and the
   supported acquisition domain from evidence.
2. Integrate all four thresholds into base-ID dispatch, preserve alternate and
   Classic behavior, and compile matching native/WASM/catalog assets.
3. Obtain a separate approved numerical update window. The original Priest
   window expired at **2026-10-24T20:33:53.864Z** and has not been restarted.
4. Compare individual pieces, subsets and the complete set across all slots,
   with geared talent/rank/rotation feedback and independent confirmation.
5. Deliver matching defaults, presets, library and guidance; verify actual
   desktop/mobile behavior and include them in an authorized release.

Source preparation and component tests grant no full-set, numerical or
publication qualification. The complete 72-piece and all-class campaign remains open.

The V1 sources and successful receipts remain unchanged. The current V2 runner
formats the inventory lookup and binds a new native/browser receipt; it changes
no component or test behavior. This preserves sealed source history while
bringing the active tooling through the final format check.
