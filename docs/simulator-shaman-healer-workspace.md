# Shaman healing workspace

The Shaman workspace is implemented at `/forever/simulator/healing-shaman`
(`/tools/forever/simulator/healing-shaman` on KFC). The latest delivery is verified
locally, including a production standalone build. It has not been deployed.

## Available builds

The library contains 198 measured configurations in 45 groups across Dwarf, Orc,
Tauren, Troll and Skyborne Windshaper. Riptide support, Riptide mobility and Mental
Quickness builds each have tank, group and burst assignments. Every selected
configuration passed the agreed 2% bounded comparison; 194 also passed the
separate 1% assessment. These are declared model references, not proof of a
global optimum or measurements of live-server healing.

All assignments use a stationary, stacked five-player group, 180 seconds, 800
incoming damage per second and full improved raid support. The delivered profession
profiles are Engineering/Tailoring. Horde profiles explicitly assume the declared
Five Thunders quest access; Dwarf gear does not borrow those unlocks or Horde-only
items. Other professions and encounter types are not included in these defaults.

The default is Dwarf, Riptide support, group healing and conservative MP5 scaling.
Both MP5 references are selectable for every race. Troll also has measured rank
sensitivity references; other races do not borrow those results.

Changing race, assignment, archetype or mechanics reference loads its own complete
gear, talents, consumes and casting plan. A personal edit clears the reference
score. Changing only the requested fight count preserves the historical reference.
Useful healing, absorbs and useful Mana Tide mana have separate result fields.

## Source and transport

- `packages/forever-data/src/shaman-healer-workspace.ts` owns strict personal-build
  validation and immutable source/release bindings.
- `infra/simulator/shaman-healing-browser-request.mjs` edits the reviewed protobuf
  actor while retaining its encounter and raid buffs. Equipment effects are rebuilt
  from the equipped items and learned talents before each run.
- `infra/simulator/shaman-healing-worker.mjs` runs the frozen Shaman WASM model in a
  dedicated worker. Stop terminates that worker. Request generations prevent stale
  replies from changing the page after cancellation or a setup change.
- `apps/web/src/components/shaman-healer-workspace.tsx` reuses the existing KFC
  gear dialog, tooltip, talent editor and page-scrolling layout.
- `apps/web/src/lib/shaman-healer-simulator.ts` verifies release manifests, file
  sizes, SHA-256 checksums and paths before serving immutable assets. Brotli,
  gzip, ETags and HEAD are supported.
- `apps/web/src/lib/shaman-healer-configuration.ts` bounds shared links to 12,000
  encoded characters and 65,536 decoded bytes. Saved builds are namespaced by
  release. Shared data cannot supply an arbitrary protobuf actor.

The native callbacks are `kfcShamanEquippedWasmReady` and
`kfcShamanEquippedSimulate`. They differ from the Paladin callbacks.

## Preparing a browser release

Build `@wow-trader/forever-data`, then run
`node scripts/prepare-shaman-healer-browser.mjs` with:

| Argument                                     | Input                                                               |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `--library`                                  | Prepared library directory with index, catalog and group JSON files |
| `--presentation`                             | Matching presentation JSON                                          |
| `--wasm`, `--runtime`, `--codec`             | Reviewed WASM, `wasm_exec.js` and generated protobuf codec          |
| `--wasm-sha`, `--runtime-sha`, `--codec-sha` | Expected SHA-256 hashes of those frozen inputs                      |
| `--esbuild-package`                          | Package path from which the existing esbuild dependency resolves    |
| `--out`                                      | Fresh destination for immutable releases                            |

Preparation validates every configuration, bundles the adapter and worker,
generates both compressed encodings, checks decompression round trips and writes
the content-derived release plus `prepared.json`. It runs no optimization and
does not activate a release. An existing immutable release is not overwritten.

The current reviewed release is `53e4d50c2689af5e980b6cfb`, under
`artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-browser-review-v1/candidate/healing/healing-shaman/`.
The unchanged release is now also assembled and selected under
`artifacts/forever-simulator/healing/healing-shaman/`. All 156 raw and encoded
assets match the reviewed candidate. The WASM is 43,077,978 bytes uncompressed
and 4,867,614 bytes with Brotli.

For final delivery, include this class directory in the complete simulator release,
preserve all other class pointers and follow the normal commit, push, pushed-source
build, candidate verification, activation and live-smoke workflow. Do not publish
the isolated review server or replace another development instance.

## Verification

The package checks pass 34 focused Shaman tests. The separate infrastructure suite
passes 248 tests. Related web tests pass 45 tests, including all existing healer
configuration and asset-delivery suites. TypeScript, scoped ESLint, formatting,
the SDK declaration build and the full Next production build pass.

Both development and packaged production builds pass 13 real Chromium checks:
first defaults, global scrolling, tooltip placement, dialog dismissal, enchant
editing, save/reload/share, race/build switching, real simulation, hard Stop,
failed group downloads, failed WASM downloads and recovery, corrupt storage and
mobile layout. Each review contains four successful 64-fight browser jobs, all
matched to the pinned native engine within the established numerical tolerance.
The 10,000-fight cancellation attempt is recorded separately and is not counted
as a completed numerical run.

Production-build browser receipt, relative to the healer-model-admission folder:
`shaman-browser-review-v1/workspace-review-23DeXi/report.json`, SHA-256
`8e48d7e09e92688aae865dda80a323a4acf372274798c01779862232ac917277`.
Original failed interaction checks and the first standalone staging failure are
retained. The staging failure was caused by starting the review server before its
static/public assets were copied; restarting after staging passed. No production
service was changed.

The assembled main package also passes the same 13 actual interaction checks
on its normal default page, without a release query: four new 64-fight browser
jobs match the frozen native engine, and Stop/recovery, storage, sharing,
asset-failure recovery and desktop/mobile scrolling pass. Both screenshots were
viewed. The current report is
`remaining-class-updates-20261027-v1/shaman-healer-host-review-1dqPau/report.json`,
SHA-256 `80c8a781834a1ea3aad41e01c57d40c07a9713ab47f50a586b16a88119406303`,
under `artifacts/forever-simulator/optimization/`. The whole Shaman class is now
locally complete and awaits the complete-project release.
