# Tank item optimization

Status: implementation and measurement in progress, October 23, 2026. The live
tank lists still compare starter gear. They must not be described as optimized
gear rankings until the work below is qualified and published.

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

| Work                                                | Status                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Reconcile published native and browser engines      | Implemented: all three tank controls match exactly for DPS, TPS and DTPS at 100 iterations                                     |
| Correct Paladin exclusion                           | Implemented locally: actual Righteous Fury controls, six measured starter entries, tests and action breakdown UI; not deployed |
| Explain Bear threat                                 | Implemented locally: form/ability coefficients, reconciled action totals, explicit inherited-coefficient limitations           |
| Item, pair, set and enchant candidate generation    | Implemented and covered by regression tests                                                                                    |
| Resume, numerical cache, source/data checksums      | Implemented; search measurements remain isolated from active releases                                                          |
| Independent request/report replay                   | Implemented: both Warrior raid reports passed full reconstruction from raw cache; remaining cases replay as they finish        |
| Current Valor thresholds and missing combat effects | Client evidence audited; isolated model and Go regression test implemented                                                     |
| Warrior raid item optimization                      | Both enchant branches converged, passed two independent 20,000-fight comparisons and full evidence replay                      |
| Full Valor versus optimized mix comparison          | Main and sensitivity full-set controls measured; raid objective mixes qualified; dungeon mixes still running                   |
| Warrior dungeon; Bear and Paladin searches          | Two six-case sequential campaigns active; Warrior dungeon currently running, followed by Bear and Paladin                      |
| Browser engine and polearm picker                   | Implemented in isolated release; all six desktop/mobile real-combat and reload checks passed                                   |
| Exact selected-build imports                        | Both Warrior raid branches passed eight objective/viewport checks; other cases qualify automatically after evidence replay     |
| Winning-build action counters                       | Both Warrior raid branches reconcile with their 40,000-fight references; other cases process after import qualification        |
| Optimized native imports and public rankings        | Pending model qualification, checks, commit/push and guarded deployment                                                        |

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

Both enchant branches are being measured for all three tanks in both modes.
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
it after reload. Final optimized-default delivery remains a separate gate.

## Completed Warrior raid searches

Both main-model raid searches have converged. Each selected objective passed two
fresh 20,000-fight seed ranges. The following values pool those ranges; they are
research results, not yet published defaults or a server-validated BiS claim.

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
production preset packaging and its final import/settings checks remain pending.

`benchmark-optimized-tank-builds.mjs` obtains the full action counters for the two
20,000-fight confirmation ranges. Every DPS/TPS/DTPS mean and standard deviation,
HP and armor must match the original confirmation; weighted action totals must
match the pooled 40,000-fight reference. It retains the full unit evidence in a
separate content-addressed cache. Both Warrior raid enchant branches passed.
This gives the new tier lists the exact winning-build breakdown instead of
reusing starter counters or mixing sampling ranges.

The active review processes record their completed cases in
`replay-monitor.json`, `import-review-monitor.json` and `measurement-monitor.json`
under the research directory. Twelve cases cover three classes, two modes and
both enchant policies. Missing, capped, rejected or mismatched evidence stops
the relevant review; the presence of a search checkpoint is not publication approval.

## Remaining delivery work

1. Finish the other ten search cases and their replay, exact-import and action-counter
   qualification. Retain separate scores and gear for threat and physical mitigation.
2. Package four conservative full builds per tank: raid threat, raid physical
   mitigation, dungeon threat and dungeon physical mitigation. Keep the provisional
   enchant variants separate with the existing explicit consent requirement.
3. Replace native starter defaults and preset labels together in a tank-only model
   release. Keep saved characters and unrelated class/raid workspaces intact.
   Check a fresh visit, every preset switch, full imports and reload at both widths.
4. Publish objective-specific tier data: changing the ranking measure selects the
   corresponding optimized gear. Show HP and armor alongside TPS/DTPS and the
   selected item/enchant list; preserve acquisition and model limitations.
5. Verify model/data/asset identities, public readers, Node/Go/web regressions,
   typecheck, lint, build and desktop/mobile behavior. Commit and push the owned
   changes, then deploy through the guarded release workflow and verify the live
   tank pages without replacing other approved numerical models.

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

Latest focused checks: 26 Node tests across tank policy, candidate search, raw
evidence, polearm picker, build imports and action totals passed; the three web
tank suites passed 16 tests. New scripts passed scoped ESLint and Prettier checks,
and `git diff --check` passed. The frozen engine's 14 native/WASM controls, six
starter browser checks and eight selected Warrior raid import checks are separate
integration evidence. A production build and deployment have not yet been run for
this item-optimization release.
