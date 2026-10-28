# Current class rankings and healer comparisons

The tier lists use the current admitted simulator builds, rather than the old
21-build publication. DPS covers 25 conservative builds across all nine classes
in both solo and raid support modes. Tanks cover the three current classes in
raid and dungeon modes, with separate threat and mitigation gear. Healers have
their own page at `/forever/tier-list/healers`.

## Healing assignments

All 13 supported healer archetypes are measured under each of three shared
assignments. Gear, talents, race, consumes and spell priorities come from the
current reviewed presets. Self-damaging mana runes are disabled only in the shared comparison; original presets remain unchanged. No new gear or rotation optimization is performed.

| Input            | Shared comparison                                                   |
| ---------------- | ------------------------------------------------------------------- |
| Duration         | 180 seconds                                                         |
| Positions        | Stacked, two yards apart                                            |
| Recipients       | Four injured members, 18,000 maximum health each; healer at index 0 |
| Tank assignment  | 800 damage per second to one recipient                              |
| Group assignment | 200 damage per second to each of four recipients                    |
| Burst assignment | 2,500 damage per recipient every 15 seconds                         |
| Sampling         | 256 fights each at seeds 58723001 and 58723003; 512 total           |
| Support          | Reviewed full raid support                                          |

These tests represent a five-person assignment with raid buffs, rather than a
complete 40-person healing raid. The tank case is a deliberate heavy-demand
stress test. Source spell/proc/scaling assumptions remain visible as beta model
limits; workload normalization does not validate new server mechanics.

Useful HPS equals effective healing plus absorbs actually consumed by incoming
damage. The v2 policy excludes self-damaging mana runes and checks that surviving
assignments reconcile exactly with delivered damage and final missing health. Overhealing never adds score. Builds passing 99% assignment survival rank
first. Failed builds remain in D, ordered by survival before useful throughput.
Passing builds use the existing relative tier boundaries: S ≥95%, A ≥85%, B ≥70%,
C ≥55%. The page also displays survival, overhealing, remaining mana and average
missing health. Sampling margins pool both independent batches; they do not
account for uncertainty in beta mechanics.

Build links restore the source gear and casting setup. Personal simulator
scenarios retain their original workload; the link is not falsely described as
an exact replay of the standardized healing workload. Complete comparison jobs
and responses remain in the private local evidence directory.

## Repeatable updates

```sh
pnpm simulator:tier-list:refresh --artifact-root=/absolute/runtime/path
pnpm simulator:tier-list:verify --artifact-root=/absolute/runtime/path
```

`FOREVER_SIMULATOR_ROOT` or `artifacts/forever-simulator` is used when no explicit
runtime is supplied. `--evidence-dir=/absolute/path` selects another evidence
store. The default store is `artifacts/forever-simulator/optimization/tier-comparison`.

The refresh command prepares inputs through the same admitted presentation and
build loaders used by the website. It checks source selections before and after
the preparation and measurement stages. Only conservative, non-opt-in builds
enter the public comparisons. All currently supported profiles must be covered;
adding a new profile/build intentionally requires a coverage review.

Requests are cached by complete numerical input, model/asset identity, source
build and comparison policy. Unchanged builds reuse exact request/response
receipts. A class-specific model or build update reruns its affected comparisons
without restarting the gear optimizer or recalculating unrelated classes.
`verify` only authenticates existing receipts and rewrites the matching public
snapshots; it never launches Chromium or starts a simulation. Original evidence
and failed runs are retained.

DPS and tank comparisons each use 5,000 fresh fights. Healer comparisons use
512 fights. These sample counts describe the comparison, and are kept separate
from original 40,000-fight gear-search confirmations. Tank imports normalize
incoming attacks, healing, support and weapon-coating/Windfury compatibility.
Measured action breakdowns reconcile with the tank DPS/TPS totals.

## Publication and verification

The five compact snapshots live in `apps/web/src/lib/data/`:

- `forever-dps-tier-list.current.{solo,raid}.json`.
- `forever-tank-tier-list.current.{solo,raid}.json`.
- `forever-healer-tier-list.json`.

Their source bindings cover the active model selectors, manifests and healer
release pointers. A changed or unavailable binding hides scores and disables
indexing, rather than relabeling old results. Page requests never run engines.
The admitted simulator models and their private publication checks remain intact.

```sh
node --test infra/simulator/current-tier-policy.test.mjs
pnpm --filter @wow-trader/web exec vitest run src/lib/forever-current-tier-lists.test.ts src/components/forever-healer-tier-list.test.tsx
pnpm simulator:tier-list:smoke --base-url=http://127.0.0.1:3029/tools --output=artifacts/tier-browser-review
```

The real browser smoke covers all five pages at 1440, 390 and 320 pixels, class
filtering, assignment/objective switching, links, image loads and horizontal
overflow. Publication still follows commit, push, production build, candidate
review, activation and public review. The existing runtime can be reused when
all source bindings match; raw numerical archives do not need uploading.

The October 28 evidence is under
`artifacts/forever-simulator/optimization/current-tier-refresh-20261028/`.
It records 50 DPS measurements, 12 tank measurements and 78 healer batches:
329,968 new fights total. Cache replays are not counted again as new fights.

The initial v1 healer trial is retained as diagnostic evidence and was not deployed.
Its self-damaging resources could contaminate assignment accounting across models.
The admitted v2 comparison uses a separate policy fingerprint and fresh batches;
old trials are not pooled as additional independent samples.

## Verified production release — October 28, 2026

Application commit `00587e8a2eb127815576e04868b68eb484774c3c` was pushed before
the Linux build and activated at 11:34:19 UTC. All five tier-list pages are live
under https://kfcguild.online/tools/forever/tier-list; healer rankings are at
https://kfcguild.online/tools/forever/tier-list/healers.

- Next build: `uPzbMx6guRnUfdz5lPnP1`.
- Source: `/home/wow-trader-system/releases/kfc-helper-class-tiers-20261028-00587e8`.
- Static delivery: `/home/wow-trader-system/shared/static-delivery/releases/kfc-helper-class-tiers-20261028-00587e8`.
- Unchanged numerical runtime: `/home/wow-trader-system/shared/simulator-releases/full-class-core-20261028-c2e8660`.
- Operational receipts: `/home/wow-trader-system/shared/operations/class-tiers-20261028-00587e8`.

The release overlays 41 exact committed files onto the prior live source and
verifies them before and after the production build. Existing server-side guild
login and leveling fixes are preserved. The build uses a 3 GiB heap; runtime
retains its 768 MiB cap. Only `kfc-helper-web` restarted; guild and unrelated PM2
processes were preserved. There is no database migration or dependency change.

Next standalone tracing can create an incomplete `public/` tree. The build must
always merge the full source `public/` and `.next/static/` into their standalone
destinations, including when those directories already exist. The first private
candidate exposed this packaging omission; it was corrected before activation.
Keep previous immutable static assets and simulator compression when assembling
the successor static delivery. The corrected build script and the failed
candidate evidence are retained in the operational directory.

Public verification passed all 15 responsive tier-list cases, all four healer
source-build restorations and real WASM simulations, the 15-profile/45-build
simulator verifier, and ten pages/117 assets. Private qualification files remain
inaccessible and Discord login remains available. The final accounting change
passes 43 focused web tests and five policy tests. Before that correction the
full web suite passed 2,185 tests with four integration tests skipped; strict
web types, scoped lint/formatting and the Linux production build also pass.

Temporary local 3029/3038 and remote 19238/19239 review processes are stopped;
owner development servers were preserved. The default comparison evidence store
contains 218 immutable receipts, including historical diagnostic runs. Only the
140 matching current measurements are admitted to the five public snapshots.

The prior source and static releases, both named
`kfc-helper-simulator-core-20261028-c2e8660`, remain available for rollback. Before
rollback, confirm the current source/static pointers still match the release
above. Use `activation-before.json` to restore only the three captured public
environment fields, preserving every other setting; restore the previous source
pointer, restart only Helper and activate the previous static delivery. Verify
the public pages and Discord provider, then save PM2 state. The numerical runtime
is shared by both releases and must remain unchanged. Activation and rollback
scripts are task-bound; do not replay them against a later release.
