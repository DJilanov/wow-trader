# WoW Forever tank tier lists

Status: committed, pushed, deployed and verified on both public ranking pages on
October 23, 2026.

Follow-up in progress: the deployed release described below still contains the
original two-class starter comparison. Local changes add a measured Paladin and
reconciled per-ability threat details. The Paladin exclusion rationale below was
incorrect: the pinned engine registers both Righteous Fury and Seal of Fury.
Item-by-item optimization is now explicitly required; see
[simulator-tank-item-optimization.md](simulator-tank-item-optimization.md) for its
scope, measured progress and publication gate. Neither the deployed starters nor
the new local starter measurements are optimized gear rankings.

## Player experience

- `/tools/forever/tier-list/tanks/solo`: **Solo / dungeon**, a three-enemy pull with
  own class buffs and no outside raid support.
- `/tools/forever/tier-list/tanks`: **Raid**, one boss with the shared raid support
  package and documented class-specific self-cast exclusions.
- Both use the same colored S–D icon board as the DPS pages. Native buttons select
  a tank; its preview shows threat, incoming damage, DPS and an exact simulator import.
- The **Threat generation** view ranks total TPS highest first. **Damage taken**
  ranks physical DTPS lowest first. Both metrics remain visible in the preview and
  server-rendered detailed table. There is no hidden weighted overall tank score.
- All four ranking pages cross-link. The Helper hub, simulator directory and tank
  workspace headers link the two tank modes. Both routes have canonical metadata,
  breadcrumbs, measured-build ItemList data and sitemap entries.

“Solo” follows the requested name for the dungeon comparison. It does **not** mean
an unhealed character clearing a dungeon alone. Both scenarios use an explicit fixed
healer; the page states this above the board and in its FAQ.

## Scope and measurements

| Input                | Solo / dungeon                       | Raid                                                            |
| -------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Character level      | 60                                   | 60                                                              |
| Attacking targets    | 3 × level 62                         | 1 × level 63                                                    |
| Duration             | 60 seconds                           | 300 seconds                                                     |
| Target armor         | 3,731 each                           | 3,731                                                           |
| Minimum melee damage | 1,200 each                           | 3,000                                                           |
| Swing interval       | 2 seconds                            | 2 seconds                                                       |
| Damage spread        | 33.33%                               | 33.33%                                                          |
| Parry haste          | Disabled                             | Disabled                                                        |
| Healing              | 2,000 HPS, delivered every 2 seconds | Same                                                            |
| Outside raid support | None                                 | full-v2, without Salvation/world buffs/external resource grants |
| Sampling             | 5,000 iterations, seed 61723001      | Same                                                            |

These are synthetic physical encounters. All attackers are assigned to the tank;
the tank stands in front. They have no additional AP, encounter scripts, execute
phase, magic damage, movement, target swaps or duration variance. Total dungeon TPS
does not establish threat control on each individual enemy. HPS is an input, not a
healer performance prediction. Death probability and burst-survival claims are not
ranked.

The compared references are the currently published enchanted blue PvP starters:
Human Protection Warrior (8/5/38) and Tauren Feral Bear (0/41/10). Gear, race, talents
and rotation are retained between modes. Raid Windfury removes the Warrior's main-hand
coating. Own Shout and Faerie Fire and incompatible armor-debuff sources are treated
as specified in `tank-tier-policy.mjs`; the native import records every setting.
Starters are not fully optimized BiS builds or guaranteed phase/vendor unlocks.

| Starter            | Dungeon TPS | Dungeon DTPS | Raid TPS | Raid DTPS |
| ------------------ | ----------: | -----------: | -------: | --------: |
| Protection Warrior |      894.96 |       586.55 | 1,063.22 |    372.69 |
| Feral Bear         |    1,281.64 |       783.25 | 1,465.55 |    591.07 |

These are actual measured means, not editorial scores. Bear leads threat; Warrior
receives less physical damage under these inputs. The original four measurements
comprise 20,000 fights. A native-import replay is a separate verification run and
must not be counted as additional independent sampling evidence.

Tiers share the DPS board's boundaries: S ≥95%, A ≥85%, B ≥70%, C ≥55%, D <55%.
For threat, share is `tank TPS / highest TPS`. For mitigation, share is
`lowest DTPS / tank DTPS`. Approximate 95% sampling margins use
`1.96 × stdev / sqrt(iterations)`; near ties use the combined standard error.
Margins do not account for uncertainty in beta mechanics.

The original deployed release left Protection Paladin **not ranked yet**, citing
the newer Seal of Fury threat, absorb and mana mechanics described in the
[official Paladin deep dive](https://worldofwarcraft.blizzard.com/en-gb/news/24302099/world-of-warcraft-forever-class-deep-dives-paladin).
That exclusion was inconsistent with the modeling policy used for the other tanks.
The pinned engine implements Righteous Fury (×1.9 Holy threat), and the starter
uses Seal of Righteousness. Local controls confirm Holy and physical threat are
treated separately. Independent validation of every server mechanic is still not
claimed. A newer local Paladin development model is not silently used for these
starter measurements.
Incoming rage and other scripted tank effects retain the published engine's
provisional status. Magic, cooldown use, utility and overall class strength are not
implied by either metric.

## Reproduce and verify

Current tank presentation: `3c62628f43a96aa1d77e702b`; numerical source:
`81d964b453f4e6abb50a81e7`; upstream revision:
`9a27c3d6af91d1ca0dbcf94a124b8869ad522108`.

The benchmark starts a loopback-only server for the selected immutable installation,
captures fresh native starter settings, validates equipment against the published
starter file, checks the actual APL, and runs the real Chromium WASM worker. It pins
the manifest, database, binary, starter file, strict protobuf codec, complete combat
request and complete response. UI-only catalog metadata is explicitly projected out
before strict combat-protobuf parsing.

```sh
node scripts/benchmark-simulator-tanks.mjs --release=3c62628f43a96aa1d77e702b --write-snapshot
node scripts/benchmark-simulator-tanks.mjs --release=3c62628f43a96aa1d77e702b --verify-cache --write-snapshot
node --test infra/simulator/tank-tier-policy.test.mjs infra/simulator/tier-benchmark.test.mjs infra/simulator/tier-scenarios.test.mjs
pnpm --filter @wow-trader/web exec vitest run src/lib/forever-tank-tier-list.test.ts src/lib/forever-tank-tier-list-data.test.ts src/components/forever-tank-tier-page.test.tsx
```

Use `--artifact-root=/absolute/path` for a prepared research root containing the
matching installation and the pinned protobuf codec used by the DPS benchmark.
The deployed runtime intentionally omits that research codec; a SHA-verified copy
is preserved in the private deployment receipt. The
read-only `--verify-cache` path never launches Chromium or creates new measurements.
Evidence is kept under
`artifacts/forever-simulator/optimization/tank-tier-list/<release>/`; compact public
snapshots are in `apps/web/src/lib/data/forever-tank-tier-list.{solo,raid}.json`.
The full request/response files are runtime research artifacts and are not Git source.
Preserve them with release receipts before publication.

The server pins the exact approved active/global selection heads and verifies the
selected manifest, numerical/starter hashes and support policy. A tank-specific
model override invalidates the comparison; unrelated class overrides do not.
Full model proof and installation verification run during build and deployment.
Metadata and the page share their compact verification within one request;
results are not cached across requests that could select a newer model.
Missing, stale or incompatible data hides the scores, shows a refresh state and
disables indexing. A newer model needs new measurements; old scores are not relabeled.
Reading the ranking never launches the numerical engine or changes stored characters.

Local review artifacts and the production-preview receipts are in
`artifacts/deployments/tank-tiers-20261023/`. Publication must use committed source,
matching simulator delivery and the retained evidence, followed by public visual,
asset, native-import and SEO checks. Existing numerical publications and the DPS
snapshots are unchanged. This feature does not require a replacement numerical
engine or numerical publication pointer.

## Verified production release

- Application commit: `117fa2554a11d5ed7f478df2727f8f156d11f9ad`.
- Source/static delivery: `kfc-helper-tank-rankings-20261023-117fa25`.
- Build ID: `O3wsG0FMfzDSJyR3rbLr3`.
- [Solo / dungeon tanks](https://kfcguild.online/tools/forever/tier-list/tanks/solo).
- [Raid tanks](https://kfcguild.online/tools/forever/tier-list/tanks).
- Server receipt: `/home/wow-trader-system/shared/backups/tank-rankings-20261023-117fa25`.
- Guarded rollback: run `node control.mjs --rollback` from that receipt directory.
  It checks the current release before restoring the previous `e7a7680` Helper,
  static delivery and build labels.

The exact pushed source passed its Linux production build, strict typecheck, lint,
37 focused web tests, 31 model-registry tests and 37 policy/deployment tests.
All 1,531 tracked source blobs and 49,265 frozen installation files were verified
around activation. Static delivery verified 48,787 files.

Both candidate and public checks passed six tank browser cases (both modes at
1440, 390 and 320 pixels), six DPS browser cases and six DPS text-layout cases.
The deployed tank boards were visually inspected at desktop and mobile widths.
Tank checks include both metric directions, full evidence tables, keyboard selection,
native imports, images, canonical/structured data, navigation and no overflow.
The public main asset sweep covered 23 existing pages / 475 assets; the separate
tank-page sweep covered two pages / 18 assets, with overlap between the sweeps.
All 32 portrait/badge JPEG hashes were verified over HTTP. Both tank sitemap entries
and all four ranking pages' indexable metadata passed.

The original four tank measurements and native import replays passed, with matching
displayed DPS/TPS/DTPS. Full binary requests/responses were independently checked
against the committed means and deviations after transfer to the private receipt.
Simulator delivery passed all 11 profiles and 23 library entries. Warrior, Smite
Priest and Warlock preset switching plus real WASM passed nine candidate cases
(three widths), then three public desktop cases, with matching metrics.

The public tank-page warm-fetch medians were 121 ms for Solo / dungeon and 155 ms
for Raid in the acceptance run. These samples are operational checks, not a traffic
or ranking guarantee. The first implementation's full-proof work on every page read
was replaced by approved-selection pins before publication.

The frozen numerical root remains `results-20261022-2489a71`; all four publication
pointer hashes are unchanged. Protected sibling services retain their PIDs,
restart counts and memory limits. The community site was not republished or
restarted. Anonymous usage collection and the 768 MB runtime heap are preserved.
The owned candidate process, local preview and SSH tunnel are closed. `final.json`
records the completed gates and preservation checks. Documentation-only follow-up
commits do not change the deployed application identity above.
