# Tank item optimization

V3 replaces starter loadouts with separately measured threat and physical-mitigation
setups for Warrior, Bear and Paladin. Full native presets and ranking scores come
from the same approved model selection. Installations without that selection retain
the older V2 starter comparison. Deployment status is recorded by the operational
release receipt described below.

## What this delivers

Search every admitted pre-raid candidate in every occupied equipment slot, without
locking the PvP armor or filtering by editorial EP, item level or item quality.
Search ordered ring/trinket pairs, weapon/shield pairs, all eligible set subsets
(including alternative items for the same set slot), and compatible reviewed
pre-raid enchants. Respect class, weapon geometry, faction, profession, level,
unique-equipped, mutually exclusive quest rewards and acquisition evidence.

Two independent objectives are reported. Threat maximizes TPS. Physical mitigation
minimizes DTPS. Report HP, armor, TPS and DTPS together. The default search has no
HP floor; `--health-floor=starter` is a separate conservative comparison. A hard
starter-HP floor alone would reject full Valor before considering its other
benefits. Neither objective is a universal tank-BiS definition. Magic encounters, cooldown
timing, talents, rotation optimization and guaranteed global optimality are outside
this item search.

Run Warrior first, then Bear and Paladin with the same eligibility and sampling
policy. Use separate dungeon and raid encounter inputs. Do not compare an optimized
Warrior to starter-only other classes while calling it an optimized class tier list.

## Current state

| Work                                                | Status                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Reconcile published native and browser engines      | Implemented: all three tank controls match exactly for DPS, TPS and DTPS at 100 iterations                                            |
| Correct Paladin exclusion                           | Implemented and qualified: Righteous Fury, all four optimized setups, optional proc variants and measured action counters             |
| Explain Bear threat                                 | Implemented: form/ability coefficients, measured action totals and explicit inherited-coefficient limitations                         |
| Item, pair, set and enchant candidate generation    | Implemented and covered by regression tests                                                                                           |
| Resume, numerical cache, source/data checksums      | Implemented; search measurements remain isolated from active releases                                                                 |
| Independent request/report replay                   | All twelve cases passed reconstruction from their raw numerical cache and frozen source inputs                                        |
| Current Valor thresholds and missing combat effects | Client evidence audited; isolated model and Go regression test implemented                                                            |
| Warrior raid item optimization                      | Both enchant branches converged, passed two independent 20,000-fight comparisons and full evidence replay                             |
| Full Valor versus optimized mix comparison          | Main and sensitivity full-set controls measured; both raid and dungeon objective mixes independently confirmed                        |
| Warrior dungeon and Bear searches                   | All four Warrior and four Bear cases converged, passed held-out validation, replay, import and counter qualification                  |
| Paladin searches                                    | All four raid/dungeon cases converged and passed held-out validation, replay, imports and action counters                             |
| Browser engine and polearm picker                   | Implemented in isolated release; all six desktop/mobile real-combat and reload checks passed                                          |
| Exact selected-build imports                        | All twelve cases passed their four desktop/mobile import checks: 48 checks total                                                      |
| Winning-build action counters                       | All twelve cases reconcile with their pooled 40,000-fight reference metrics                                                           |
| Native full presets and defaults                    | All three classes have four conservative setups and two optional proc variants; 42 full-preset desktop/mobile checks pass             |
| Production model reader                             | Strict model/build/measurement/asset/browser gates; nine publication regressions and all three actual packages pass                   |
| Isolated runtime assembly                           | All three packages assembled; four filesystem/selection tests and four actual runtime checks pass; other selections preserved         |
| Optimized public rankings and deployment            | V3 passes 42 public browser checks and 67 focused web/runtime tests; operational release status is recorded in the deployment receipt |

## Valor and Heroism evidence

Current-client set **189, Battlegear of Valor**, has eight admitted items:
16731, 16733, 16730, 16735, 16737, 16736, 16732, 16734. Its current thresholds are:

| Pieces | Spell           | Effect in this physical encounter                                   |
| ------ | --------------- | ------------------------------------------------------------------- |
| 2      | 18679           | +8 resistances; existing static model                               |
| 3      | 13198           | +15 strength; existing static model                                 |
| 4      | 1302721         | Remove disarm proc; encounter has no disarm, so no combat credit    |
| 5      | 450587 → 450589 | Heal 88–132 and grant 10 rage on the client-defined melee auto proc |
| 6      | 21347           | 15 health per five seconds                                          |

The published starter engine omitted the last three thresholds. Applying the old
Heroism handler by name would use the wrong thresholds. The research model checks
the exact extracted payload and trigger records:
100% client proc chance, done-melee-auto mask 4, no listed ICD or PPM entry, 110 heal
with 0.4 variance and 100 tenths of rage. It requires a landed white hit. Importantly,
the client proc chance **does not establish the server cadence**: the server can
override it. The main model retains the inherited same-spell **1-PPM** reference
as an explicitly unverified assumption. The original 100%-client-chance model is
retained only as sensitivity evidence. The periodic regeneration tick phase is
also a model assumption.
No player-made healing threat is fabricated for direct resource gains.

The Go regression checks four/five/six-piece thresholds, exactly one registration,
the rage amount, misses, specials, spell hits and accidental 100% proc frequency.
The preparation command validates
the source mechanics manifest and table checksums before admitting the model.

Heroism IDs 21994–22001 exist in the extracted client but are absent from the
reviewed Forever acquisition catalog and runtime database. A client record alone
does not establish availability. They remain explicitly excluded pending verified
acquisition and current-stat admission; older Classic values are not substituted.
The similarly named SoD sets are not silently mixed into set 189.

## Reproduction

```sh
node scripts/prepare-tank-item-optimization.mjs
```

Initialize once. During a campaign, reuse its frozen `engine.json`; do not prepare
a different engine between queued cases. Changed source/data creates a new model
identity and requires its own qualification and measurements.

Run and review that frozen model:

```sh
node scripts/optimize-simulator-tanks.mjs --profile=tank_warrior --scenario=raid
node scripts/optimize-simulator-tanks.mjs --profile=tank_warrior --scenario=solo
node scripts/compare-warrior-tank-sets.mjs
node scripts/verify-tank-search-engine.mjs
node scripts/verify-tank-item-optimization.mjs --report=artifacts/forever-simulator/optimization/tank-item-search-v1/runs/REPLACE_WITH_RUN_CHECKSUM/report.json
node scripts/archive-tank-search-sources.mjs --run=REPLACE_WITH_RUN_CHECKSUM
node scripts/stage-tank-browser-engine.mjs
node scripts/check-tank-browser-engine.mjs --release=REPLACE_WITH_STAGED_RELEASE
node scripts/qualify-tank-item-builds.mjs --report=artifacts/forever-simulator/optimization/tank-item-search-v1/runs/REPLACE_WITH_RUN_CHECKSUM/report.json --release=REPLACE_WITH_STAGED_RELEASE
node scripts/benchmark-optimized-tank-builds.mjs --report=artifacts/forever-simulator/optimization/tank-item-search-v1/runs/REPLACE_WITH_RUN_CHECKSUM/report.json --release=REPLACE_WITH_STAGED_RELEASE
node scripts/stage-optimized-tank-profile.mjs --profile=tank_warrior --browser-release=REPLACE_WITH_STAGED_RELEASE
node scripts/check-optimized-tank-profile.mjs --release=REPLACE_WITH_DELIVERY_RELEASE
node --test infra/simulator/tank-optimization.test.mjs
```

Other profiles: `feral_tank_druid`, `protection_paladin`. Optional
`--objective=threat|mitigation` runs one objective. `--verify-only` measures the
baseline and checks the pool without starting the search. `--workers=1` through
`--workers=6` controls native concurrency. The default is four. Repeating the same
command resumes an exact matching checkpoint and reuses validated simulation data.

`--health-floor=starter` adds the explicit baseline-HP constraint. Provisional
enchant models (including Crusader) are included and retain their provisional
status in the selected-gear description. Use `--provisional-enchants=exclude` for
the separately fingerprinted deterministic-enchant search. Historical raid-only
enchant acquisition remains excluded in either case.

Both enchant branches have been measured for all three tanks in both modes.
Conservative results supply the immediately usable defaults. Provisional results
remain separate and require the existing explicit proc opt-in; loading a build
must not turn that opt-in on. The two branches share compatible numerical cache
records, so shared controls are not counted as independent additional evidence.

The full-set control leaves accessories, enchants, talents and rotation identical.
Across two independent seed ranges (160,000 fights total), the **100%-client-chance
sensitivity model** measured:

| Mode / gear                 |      TPS | Physical DTPS |    HP |
| --------------------------- | -------: | ------------: | ----: |
| Dungeon / PvP starter       |   895.17 |        587.03 | 6,479 |
| Dungeon / eight-piece Valor | 1,357.16 |        552.18 | 5,999 |
| Raid / PvP starter          | 1,063.26 |        372.14 | 8,384 |
| Raid / eight-piece Valor    | 1,296.45 |        347.38 | 7,856 |

These figures are not the main-model prediction and must not be published as
confirmed server performance. A separate 2,000-iteration 1-PPM diagnostic changed
the raid comparison to 1,064.28 → 1,072.42 TPS and 371.60 → 350.97 DTPS. This
material sensitivity means the high-threat recommendation depends on cadence.
Receipts: `warrior-valor-0574e0307ef89af6-20000.json` and
`cadence-sensitivity/comparison.json`. The refreshed **main 1-PPM model**, again
20,000 fights per seed and 160,000 fights total, measured:

| Mode / gear                 | TPS      | Physical DTPS | HP    |
| --------------------------- | -------- | ------------- | ----- |
| Dungeon / PvP starter       | 895.17   | 587.03        | 6,479 |
| Dungeon / eight-piece Valor | 911.77   | 554.02        | 5,999 |
| Raid / PvP starter          | 1,063.26 | 372.14        | 8,384 |
| Raid / eight-piece Valor    | 1,071.17 | 350.93        | 7,856 |

Receipt: `warrior-valor-90f734eac357cd6c-20000.json`. These are full-set controls
with identical accessories and enchants, not independently optimized full-Valor
accessory/rotation builds. Both sets remain dependent on unverified proc cadence.

Artifacts are under `artifacts/forever-simulator/optimization/tank-item-search-v1`:
`engine.json` selects the research engine; `engines/<checksum>` preserves source,
client evidence, data and native executable; `runs/<checksum>` contains inputs,
per-objective checkpoints, comparison logs and final independent-validation reports.
These are research artifacts, not active-model or publication pointers.

`verify-tank-item-optimization.mjs` independently reconstructs every coordinate,
legal candidate pool, screening shortlist, selection, convergence decision and
final seed comparison from the raw cache. It checks the exact source character and
encounter request, model/data/source checksums, result identities and iteration
counts. It rejects unfinished objectives, capped searches and edited results. Its
`replay.json` receipt is required before a case can be published. Replay launches
no new combat simulations. Selected native/browser equality is a separate gate.

The Bear starter had a Tauren paired with an Alliance UI selector and no second
profession. The search records Horde from the character race and explicitly uses
Enchanting as its second profession. Other race, talent, rotation, consume and buff
inputs remain those in the pinned comparison request.

Two additional eligibility gaps were found and corrected: the source-filtered
general catalog omitted the separately admitted Bear/Paladin PvP armor, and the
Classic weapon allowlist rejected the published Bear's polearm. Only the exact
published armor IDs receive provisional acquisition metadata. Other missing items
are not admitted by this fallback. Future Druid searches include polearms;
previous search receipts retain their original candidate scope. The simulator's
weapon-picker allowlist is aligned in the isolated browser package. All six
desktop/mobile checks passed, including selecting a different polearm and retaining
it after reload. Native preset delivery is qualified separately below.

## Completed Warrior raid searches

Both main-model raid searches have converged. Each selected objective passed two
fresh 20,000-fight seed ranges. The following values pool those ranges. They are
the approved model references, not a server-validated BiS claim; live release
status is recorded in the deployment receipt.

| Gear / objective          | TPS     | Physical DTPS | HP    | Armor   |
| ------------------------- | ------- | ------------- | ----- | ------- |
| Published starter         | 1,063.6 | 372.1         | 8,384 | 7,073   |
| Threat / static enchants  | 1,261.6 | 374.2         | 6,822 | 6,683.8 |
| Threat / provisional proc | 1,273.2 | 372.7         | 6,822 | 6,659.2 |
| Physical mitigation       | 831.2   | 220.9         | 7,196 | 8,136.6 |

Under the 1-PPM reference model, neither optimized raid objective selected Valor
pieces; all eligible Valor subsets were part of the search. This result depends on
the proc-rate assumption and the fixed encounter/rotation, rather than proving
that Valor is universally inferior.

The mitigation result is identical in the two enchant branches. The threat result
trades health for output; the physical-mitigation result trades health and threat
for lower incoming physical damage. Neither is a universal recommendation for
magic damage or unmodeled burst encounters.

The conservative raid result selected these items after searching every admitted
candidate, the legal pairs and set combinations. The provisional threat variant
uses the same items with different weapon/boot enchants.

| Slot      | Threat                                | Physical mitigation                         |
| --------- | ------------------------------------- | ------------------------------------------- |
| Head      | Lionheart Helm (12640)                | Helm of Awareness (18313)                   |
| Neck      | Mark of Fordring (15411)              | Evil Eye Pendant (18381)                    |
| Shoulders | Highlander's Plate Spaulders (20057)  | Stoneform Shoulders (13955)                 |
| Back      | Cloak of the Honor Guard (20073)      | Shifting Cloak (18511)                      |
| Chest     | Timbermaw Tunic (252484)              | Deathbone Chestplate (14624)                |
| Wrists    | Gordok Bracers of Power (18533)       | Warder's Wristguards (250583)               |
| Hands     | Raider Gauntlets (272095)             | Heavy Thorium Gauntlets (279264)            |
| Waist     | Might of the Timbermaw (19044)        | Deathbone Girdle (14620)                    |
| Legs      | Titanic Leggings (22385)              | Legplates of the Eternal Guardian (11927)   |
| Feet      | Bloodmail Boots (14616)               | Shalehusk Boots (11787)                     |
| Ring 1    | Painweaver Band (13098)               | Tarnished Elven Ring (18500)                |
| Ring 2    | Don Julio's Band (19325)              | Ring of Awareness (272409)                  |
| Trinket 1 | Adaptive Combat Assistant (272437)    | Vigilance Charm (18370)                     |
| Trinket 2 | Frozen Heart of the Mountain (249469) | Vigilance Charm (18370)                     |
| Weapon    | Felstriker (12590)                    | Bone Slicing Hatchet (18737)                |
| Shield    | Dreadguard's Protector (18756)        | Premier High Warlord's Shield Wall (272591) |
| Ranged    | Satyr's Bow (18323)                   | Precisely Calibrated Boomstick (2100)       |

Historical item stats/acquisition and inherited item effects remain provisional
where the source catalog says so. Static-enchant policy describes enchant consent;
it does not certify all item proc rates. Vigilance Charm has no unique restriction
in the pinned reference; the pair is conditional on that historical admission.
The shield's title does not impose a faction restriction in the extracted record;
its rank/vendor access still requires confirmation.

Raid run identities:

- Provisional enchants: `8fe4bdefdb8084382ddb886ca12f1e56c1f3cbbffd8984815d44101d656892f6`.
- Static enchants: `994bca31bed7b5a163d6165a6cf7a859f4f14d9c1e26b6c710c79237ddd38f02`.
- Engine: `90f734eac357cd6cb03cb2356cd93d508fbc9b014ceff2b022d978db6ca4f7e3`.

Canonical replay checked 96,079 and 114,944 distinct request records respectively,
including every screening, shortlist, accepted move and final seed comparison.
The two cases reuse compatible numerical evidence and must not be described as
entirely independent measurements. The source archive preserves 24 reachable
implementation files and checks all eight direct search inputs; snapshot
`6aa5443ee75e2edac6cec7868def9ca28d3aabab0f347d7dcfb6688de20368bf`.

Browser research release `64153d7900060d98d5f74ea0` passed all six starter checks
at 1440px and 390px, real combat, saved-character reload and Druid polearm selection.
The simulation button's enabled and hovered states also meet text contrast checks.
No active, profile or publication pointer was changed. Exact selected imports are
qualified separately; this starter receipt alone does not approve optimized defaults.

The additional completed conservative results, each pooled across the same two
20,000-fight confirmation ranges, are:

| Class / mode / objective       | TPS     | Physical DTPS | HP    | Armor  |
| ------------------------------ | ------- | ------------- | ----- | ------ |
| Warrior / dungeon / threat     | 1,069.6 | 704.0         | 5,409 | 4,320  |
| Warrior / dungeon / mitigation | 751.4   | 340.7         | 5,719 | 7,421  |
| Bear / raid / threat           | 1,788.1 | 577.0         | 8,514 | 7,505  |
| Bear / raid / mitigation       | 1,239.7 | 370.5         | 8,676 | 10,855 |
| Bear / dungeon / threat        | 1,688.8 | 747.3         | 6,345 | 7,081  |
| Bear / dungeon / mitigation    | 1,170.8 | 484.5         | 6,902 | 10,434 |
| Paladin / raid / threat        | 884.9   | 537.9         | 7,005 | 7,289  |
| Paladin / raid / mitigation    | 603.1   | 274.4         | 7,154 | 8,350  |
| Paladin / dungeon / threat     | 1,104.8 | 677.7         | 4,778 | 6,827  |
| Paladin / dungeon / mitigation | 731.1   | 355.2         | 5,391 | 7,830  |

HP and armor are rounded here for readability. These remain fixed-race,
fixed-rotation model comparisons. A threat-optimal setup can take more damage
and have less health; the implemented ranking UI displays that trade-off.

The import qualification compares all combat fields after narrowly normalizing
empty UI raid slots and the engine's equivalent omitted/explicit level-60 value.
Additional players, nonempty padded buffs, changed character levels and other
combat differences are rejected. It also simulates both the actual captured
browser request and the original frozen request natively, requiring exactly equal
metrics, health and armor; displayed browser results must match at their two-decimal
precision. Full gear, professions, talents, rotation, support and encounter imports,
reload persistence and proc consent are checked at both desktop and mobile widths.

Both Warrior raid enchant branches passed all eight selected-build import checks.
The optional Crusader variant requires explicit consent, and consent returns to OFF
after reload. The research imports currently use 100 fights for qualification;
Full production preset packages for all three classes are qualified below.

`benchmark-optimized-tank-builds.mjs` obtains the full action counters for the two
20,000-fight confirmation ranges. Every DPS/TPS/DTPS mean and standard deviation,
HP and armor must match the original confirmation; weighted action totals must
match the pooled 40,000-fight reference. It retains the full unit evidence in a
separate content-addressed cache. All twelve cases passed, including both Paladin dungeon branches.
This gives the new tier lists the exact winning-build breakdown instead of
reusing starter counters or mixing sampling ranges.

The active review processes record their completed cases in
`replay-monitor.json`, `import-review-monitor.json` and `measurement-monitor.json`
under the research directory. Twelve cases cover three classes, two modes and
both enchant policies. Missing, capped, rejected or mismatched evidence stops
the relevant review; the presence of a search checkpoint is not publication approval.

## Native preset delivery and publication

`stage-optimized-tank-profile.mjs` requires all four completed mode/enchant-policy
cases for one class. It prepares four conservative full setups and adds only the
selected variants that actually require provisional enchant consent. A first visit
loads raid physical mitigation. Saved characters remain intact; changing the
setup loads the complete measured character and encounter immediately. HP, armor,
TPS and physical DTPS references remain visible together.

The overlay uses the pinned native UI's complete-settings API through a guarded
entry adapter. It replaces the old starter controls and text while retaining user
gear saves. Same-document share changes re-enter the native importer. Code and
asset checksums form the new release identity; source numerical assets remain
immutable. Other profiles navigate to their already-approved website workspaces.

The approved packages are Warrior `92dc3e4210e6cb7776f16fb9`, Bear
`6b775ba64f7a75331f1b3000` and Paladin `76d3a520f95fdb16a89c9282`.
Each passed 14 full-preset checks at desktop/mobile widths: all six presets
simulate the measured combat setup, complete share links import correctly, custom
gear survives reload, the fresh save-name matches the selected setup, and proc
consent stays off until explicitly enabled. Native approvals do not select a
production model.

The entry adapter uses the verified profile-player declaration and simulator-module
import instead of assuming an unmangled constructor export. Druid's pinned bundle
exports its UI under a short alias; regression tests cover that form.

The production reader is
`apps/web/src/lib/forever-simulator-tank-model-updates.ts`. A separate
`tank-model-updates.json` selection binds all three tank profiles to their approved
releases. It verifies numerical/catalog identity, native preset payload, four source
measurement files, every published build's settings/gear/counters and the exact
desktop/mobile browser evidence. The shared presentation and preset-safety readers
use this result without changing other class model selections. Verification is
shared within a render, never cached across requests.

The counter reporter originally compared JSON equipment literally. Bear's empty
off-hand exposed `{id: 0}` versus `{}`. The reporter and staging adapter now compare
the pinned protobuf equipment encoding, preserving every actual item/enchant field.
Previously qualified Warrior evidence is retained with its source version, not
relabeled as a new measurement. The five relevant review/entry/library sources are
preserved in snapshot
`e7ce09a7084f096ea319c03937c1c236c364782e55e1c7c21df8b3585af2098b`.

The public ranking update is implemented as snapshot V3 in
`apps/web/src/lib/forever-optimized-tank-tier-list.ts`. It derives all six entries
per scenario directly from the three validated runtime model proofs. There is no
second manually maintained score dataset. Each conservative threat/mitigation
entry retains the recorded 40,000-fight metrics, action totals and source hashes.
The projection rechecks incoming attacks, support, healing and encounter geometry
against the comparison policy, including protobuf default/enum normalization.

The ranking UI selects the corresponding threat or mitigation setup while
retaining the selected class. It shows HP and armor with TPS/DTPS/DPS, exposes every
item and enchant with historical-source labels, and links to that exact full setup.
Methodology, metadata and structured data describe the independent validation and
fixed race/professions/talents/rotation scope. Imports run 5,000 iterations for
convenient reruns; reference results pool two independent 20,000-fight seeds.

The existing starter format remains readable only before an optimized selection
is installed. Once `tank-model-updates.json` exists, any missing or invalid approved
profile makes the rankings unavailable; there is no stale starter-score fallback.
The targeted web/runtime suite passes **67 tests**, including nine model-publication
regressions and four checks against the actual three-class runtime. Typecheck, lint
and the isolated production build pass. All ranking fixtures now contain recorded
Warrior, Bear and Paladin data; no synthetic class identity is used. The combined
fixture has 28 documents and is reproducible from the real reviewed runtime:

```sh
node scripts/record-optimized-tank-fixture.mjs \
  --runtime-root=artifacts/deployments/tank-optimized-20261023/review-root-v1 \
  --output=apps/web/src/lib/fixtures/optimized-tank-models.json.gz
```

The fixture SHA-256 is
`3bb69df2b63642e789ace6a5c2b54b80862a791e3b459daa176e9e91366daef2`.
Tests mutate copies in temporary directories for negative cases. Omitted protobuf
repeated fields normalize to empty defaults; additional target inputs remain
rejected. The actual runtime gate also checks real module and payload bytes,
rather than relying on fixture metadata alone.

Static asset staging now recognizes the separate optimized-tank selection. It
includes all three selected class releases alongside the existing DPS sources and
rejects partial or malformed tank pointers. Both direct asset serving and static
staging keep optimized proofs, research proofs and raw measurements private while
serving the native build payload and module. The **25 static/deployment Node tests**
and four assembly tests pass, alongside 32 tank logic tests. The 12 simulator
asset web tests are included in the 67-test targeted suite. Another **116 publication/DPS regression tests** pass,
including current and historical Warlock selection paths.

`scripts/check-optimized-tank-rankings.mjs` passed its complete real-browser gate:
24 class/objective/scenario/viewport board checks, 12 public exact imports and six
fresh public workspace checks. It binds the real three-profile approval, verifies
scores/HP/armor/equipment/links, class preservation on metric changes and default
presets, then writes a separate receipt without selecting a model. The successful
local receipt is
`artifacts/deployments/tank-optimized-20261023/optimized-browser-review-v3.json`; it
binds selection `56f928379bc42e90f5dda9d24f187586b4adf16f2a9ba479ac17d22bbc796f0e`
and records 24 hashed preview screenshots. Desktop/mobile previews were visually
reviewed. The verifier accepts default indexing when no robots meta is emitted,
rejects indexing exclusions in headers/metadata, and initializes test storage only
on HTTP documents.

```sh
node scripts/check-optimized-tank-rankings.mjs \
  --base-url=http://127.0.0.1:PORT/tools \
  --artifact-root=/absolute/path/to/isolated-approved-runtime-root \
  --output=artifacts/deployments/tank-optimized/browser-review.json
```

The isolated-root assembly command is
`scripts/stage-optimized-tank-selection.mjs`. It requires all three real approved
profile identities, one engine and the current global presentation as the source.
It verifies incoming asset hashes, preserves the four existing selection files
byte-for-byte, and never overwrites an output root or changes the live selection.
Its four tests cover partial/cross-profile approval, source drift, input/output
aliasing, symlink escape, changed assets, consent gates and existing-output
preservation. Real Warrior/Bear preflight passes; an intentionally cross-profile
Paladin reference is rejected before any output is created.

The local base runtime's four selection hashes match the live server's current
selection hashes as checked on October 23. Recheck them before deployment; another
release must not silently replace changes made while this campaign runs.

```sh
node scripts/stage-optimized-tank-selection.mjs \
  --source-root=/absolute/path/to/current-runtime \
  --output=/absolute/path/to/new-review-runtime \
  --warrior=92dc3e4210e6cb7776f16fb9 \
  --bear=6b775ba64f7a75331f1b3000 \
  --paladin=76d3a520f95fdb16a89c9282

FOREVER_TANK_REVIEW_ROOT=/absolute/path/to/new-review-runtime \
  pnpm --filter @wow-trader/web exec vitest run \
  src/lib/forever-optimized-tank-runtime.integration.test.ts \
  --maxWorkers=1 --minWorkers=1
```

The runtime gate must report **four passed tests**, using the three actual class
packages. It covers production model/presentation/preset-safety readers, both V3
ranking projections, exact public payload/module hashes, private-evidence denial
and unchanged source selections. It deliberately skips in ordinary unit runs
without `FOREVER_TANK_REVIEW_ROOT`; those skips are not publication evidence.
The actual run passed all four tests against `review-root-v1`, followed by the 42
public browser checks above. The immutable staging receipt retains its original
`staged-awaiting-runtime-reader-and-public-browser-review` status; subsequent test
and browser receipts are separate evidence.

The current production build also passed the existing-model HTTP deployment
verifier against the unchanged base runtime: all 11 published DPS profiles retain
their full approved libraries and matching item databases. Receipt:
`artifacts/deployments/tank-optimized-20261023/baseline-compatibility.json`.
Four actual desktop/mobile V2 tank-page browser checks passed metric switching,
class preservation, layout and browser-error checks; their screenshots were
visually reviewed. This is compatibility evidence, not approval of the optimized
V3 models. The final V3 browser gate now records hashed screenshots of every
selected class/objective/scenario/viewport preview in a unique review directory.

The Paladin raid reports are
`1ac6c49b074f8c0dd9109612e9a959ba44262a1d19e911961c54f4a91261a645`
(proc policy) and
`9465c9051dec2f02535956bdadf6ca079b532709ef1c563040050597473462ff`
(conservative). Both converged, passed held-out confirmation, canonical replay,
all eight selected-import checks and full action-counter reconciliation. Their
40,000-fight raid references are now listed above. The optional proc threat setup
measures 896.1 TPS / 524.1 physical DTPS / 6,548 HP / 7,721 armor; conservative
mitigation is unchanged by the proc branch. Paladin dungeon reports
`bc14e2e81f5a43cb0e5c5c3147dc2b69169d820a49b5a2451c52041bb401733a`
(conservative) and
`a1cb744a04b06005abb98ec6ef2a097da13bf4931c669fbdbaeba5c46ef2ea85`
(proc policy) passed the same complete qualification. The optional dungeon threat
setup measures 1,147.5 TPS / 704.0 physical DTPS / 4,726 HP / 6,375 armor; its
mitigation result matches the conservative branch.

## Release procedure

1. Recheck the source runtime's four selection hashes and the live application
   release. Assemble the three approved model packages in a separate root using
   the command above; retain all existing non-tank models and selections.
2. Require four actual runtime tests, all 42 native preset checks and the 42 public
   browser checks. Check metric switches, HP/armor, gear, exact imports, saved
   characters and explicit proc consent. No missing profile may use a substitute.
3. Commit and push the scoped source changes after checks pass. Build an isolated
   server release from that exact pushed commit and verify its source manifest.
4. Stage immutable assets, run canary checks and activate through the guarded
   release workflow. Keep rollback pointers, memory limits and unrelated websites
   intact. Verify both tank lists, all three native workspaces and existing DPS
   workspaces against the public endpoint.
5. Record the released commit, selected model identities, source/asset hashes and
   actual live readback in
   `artifacts/deployments/tank-optimized-20261023/deployment/final-receipt.json`.
   This operational receipt is the authority for deployment status; local model
   qualification alone is not a claim that a release is live.

## Verification and publication gate

Screen all legal proposals at 80 iterations. Retain at least 16 candidates
(including the incumbent) and every candidate within the combined approximate
95% sampling margin of the best result for the 500-iteration recheck. Apply the
same rule with a minimum of four for the 2,000-iteration selection. There is no
fixed top-N cap that silently drops uncertain ties. Always retain the incumbent.
Repeat all coordinates until stable, with a six-pass cap. A capped search
must retain its `converged: false` status. Search gains are exploratory. Two unused
seed ranges each compare starter and candidate at 20,000 iterations; require the
gain to exceed the combined approximate 95% sampling margin in both ranges.
Every proposal has a numerical cache identity including exact request, gear,
iterations, seed and engine. Keep full eligibility coverage in the report.

Before publication: qualify the changed native engine against the actual browser
WASM engine for starters and winning/set-boundary candidates, inspect every chosen
item and effect admission, replay exact imports, verify defaults/preset switching,
run relevant Node/Go/web tests, typecheck, lint and build, and inspect desktop/mobile
ranking pages. Publish a new model identity for changed mechanics. Never attach
these measurements to the old immutable engine or silently change its scores.

Outstanding model limitations include the inherited Bear ability threat
coefficients, provisional incoming-rage behavior, and other unverified item procs.
Sampling precision does not resolve those mechanics uncertainties.

Final source qualification passed 67 focused web/runtime tests, 116 publication/DPS
regressions and 61 Node tests, plus typecheck, lint, scoped formatting and
`git diff --check`. The isolated Linux production build passed the same checks.
The frozen engine's native/WASM controls, selected-build imports, all 42 native
full-preset checks and the 42 public ranking/workspace browser checks are separate
integration evidence. The operational receipt records the canary, activation and
public readback results; a successful build alone does not establish deployment.
