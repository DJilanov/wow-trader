# Item weapon-skill correction

The owner chose to keep the equipment and ignore only item-granted weapon skill. All other
item properties, procs, enchants, talent/racial bonuses and acquisition restrictions remain.
This is an explicit model assumption, not independent verification of Blizzard's server rules.
The encyclopedia archive is not rewritten to manufacture matching game-file evidence.

## Numerical evidence

The isolated numerical release is `81d964b453f4e6abb50a81e7`; the corrected all-class preset
presentation is `8df7a7e5afd43f588d6ca257`. Both retain all 2,591 item database records.
Eight skill-bearing records have zero skill in the simulator dataset. A Forever-only runtime
guard also rejects item skill from imported old data, without clearing talent/racial skill.
The original native binary, database files, engine source and historical results are intact.

The correction performed 21,141 simulation requests / 3,758,725 combat iterations, not millions
of different gear combinations. All five affected builds received two bounded all-slot sweeps,
legal enchant carry-over checks and retained weapon/ring/trinket pair comparisons. Screening
used 100 iterations, shortlists 1,000; final selected builds each have two independent 20,000
iteration confirmation ranges. A replacement requires a significant gain in both ranges.
This is a practical correction, not an exhaustive talent/APL search or proof of global BiS.

| Published build                 | Corrected modeled DPS | Correction outcome                                      |
| ------------------------------- | --------------------: | ------------------------------------------------------- |
| Fury, standard enchants         |                838.13 | Revised gear; Ironfoe / Felstriker                      |
| Fury, provisional proc enchants |                870.65 | Revised gear; Premier High Warlord's Blade / Felstriker |
| Rogue Combat                    |                661.19 | Revised gear; Premier High Warlord's Razor / Felstriker |
| Rogue Mutilate                  |                647.16 | Revised gear; Premier High Warlord's Razor / Felstriker |
| Rogue Subtlety                  |                613.34 | Revised gear; Premier High Warlord's Razor / Felstriker |
| Arms, standard enchants         |                802.22 | Original gear retained; skill-free control              |
| Arms, provisional proc enchants |                823.25 | Original gear retained; skill-free control              |
| Two-hand Fury                   |                735.36 | Original gear retained; skill-free control              |
| Hunter Beast Mastery            |                863.48 | Original gear retained; skill-free control              |

These figures use each build's existing complete scenario and must not be used as a normalized
cross-class ranking. PvP rank/reputation costs are not capped. Historical item availability and
item-proc cadence remain provisional. Felstriker's remaining modeled value is not dagger skill.
The four skill-free controls reproduce the original native result exactly at the same 25-fight
seed; their new 40,000-iteration averages naturally differ from older seed ranges.

## Reproduction and inspection

Evidence and isolated binaries live in
`artifacts/forever-simulator/optimization/item-skill-revalidation-v1/`.
The native binary embeds the same regenerated protobuf database as the browser, using a Go
overlay rather than editing the frozen checkout. Original binary and JSON records were also
compared across all 2,591 items: no pre-existing differences in their numerical item fields.

Preparation is a one-time operation for this immutable study. If `context.json` exists, resume
`--run`; do not repeat preparation or overwrite its timestamps/source pinning.

```sh
node scripts/revalidate-simulator-item-skills.mjs --prepare
node scripts/revalidate-simulator-item-skills.mjs --run
node scripts/update-simulator-presets.mjs --model-update
node scripts/review-simulator-preset-safety.mjs --release=8df7a7e5afd43f588d6ca257 --model-update
```

These commands do not deploy production. The final review selects the already-built, approved
model locally. It checks all 15 supplied profile screens, all Gear Sets/configurations, all
18 desktop/mobile full-share imports, safe first defaults and saved-character preservation.
It then performs a fresh 25-fight native/browser parity check for every delivered build.
Actual browser approval: `optimization/reviews/item-skills-browser-96d484b1530c48b4.json`.

Provisional-enchant variants remain full-share-only. They are not added as automatic-opt-in
Gear Sets. Consent is OFF after load/reload; controlled research explicitly opts in only for
its own isolated simulation. Unfinished specs retain source-reviewed starter labels.

## Runtime selection and safety

`model-update.json` selects the corrected numerical/presentation pair. `published-reviews.json`
links the three fresh profile publications. `active.json`, `presentation.json` and the original
`preset-safety.json` deliberately retain the frozen research/historical parent. Do not inspect
`active.json` alone and conclude that the public model did not change.

The new reader authenticates model assets, original non-raid preset safety, all nine correction
records, exact selected request hashes, independent confirmation seeds, measured DPS averages
and browser approval. Published DPS, precision and share URLs must match that corrected proof.
Malformed/stale approval blocks the iframe with a review state instead of silently loading old
recommendations. The manifest schema explicitly validates the optional item-skill policy;
unrecognized metadata remains rejected. Old immutable manifests still parse for rollback.

Saved personal characters are never overwritten. The visible model-update notice explains
that returning users should load a current preset for revised gear. Gear Sets/configurations
preserve their documented scope; **Load build** applies the complete measured scenario.

## Deployment and rollback

Stage from the current production source, not the entire dirty local worktree. This rollout
overlays six owned web files and the simulator manifest source/test in `forever-data`. Rebuild
that package before the Next application. Upload both immutable releases, nine private result
records, three fresh profile publications and browser approval. Never upload simulation-cache
directories or native executables as public assets. Hard-link unchanged uploaded assets where
possible, then verify every manifest checksum.

Run the candidate with an isolated hard-linked asset tree and copied selection pointers. Check
real desktop/mobile shares, scrolling, class navigation/history, Arms and two-hand combat,
Stop recovery, subsequent combat and the decoded KFC logo. Only then switch public selection
and restart `kfc-helper-web`. No database migration or ingestion/crawler/guild restart belongs
to this update. The current activation receipt and final public checks are recorded in
`context.md` and `fixes.md`.

Rollback restores the backed-up published pointer, removes only this rollout's model selector,
restores the previous web environment/source symlink and restarts Helper web. Historical model
assets and checkpoints remain available. Future model changes must use a new coherent study;
do not relabel unfinished old-skill searches as measurements on the corrected engine.
