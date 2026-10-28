# Current class rankings and healer comparisons

The tier lists use the current admitted simulator builds, rather than the old
21-build publication. DPS covers 25 conservative builds across all nine classes
in both solo and raid support modes. Tanks cover the three current classes in
raid and dungeon modes, with separate threat and mitigation gear. Healers have
their own page at `/forever/tier-list/healers`.

## Healing assignments

All 13 supported healer archetypes are measured under each of three shared
assignments. Gear, talents, race, consumes and spell priorities come from the
current reviewed presets. No new gear or rotation optimization is performed.

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
damage. Overhealing never adds score. Builds passing 99% assignment survival rank
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
