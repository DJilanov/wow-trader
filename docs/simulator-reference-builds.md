# Reference talent builds

The extended pre-raid catalog is live in r15. Example-build import is a separate, local
research input, not a replacement of public defaults or a claim of optimized BiS.

Four current public MythicSim snapshots were inspected individually on October 16, 2026:

| Example         | Talent points | Ranking snapshot                                                                                |
| --------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| Fury Warrior    | 18/31/2       | [Source](https://mythicsim.com/wow-forever/tier-list/sims/7ade8650-c6b1-44a3-b72c-71ded01b080e) |
| Arms Warrior    | 39/10/2       | [Source](https://mythicsim.com/wow-forever/tier-list/sims/ce50ecc4-769c-4493-a3de-97e7a613df42) |
| Shockadin       | 23/0/28       | [Source](https://mythicsim.com/wow-forever/tier-list/sims/c528b8d7-3266-4393-9f8e-3fd06d111907) |
| Survival Hunter | 0/20/31       | [Source](https://mythicsim.com/wow-forever/tier-list/sims/58097a04-18fc-4fe0-b7be-883ed9667400) |

The admitted input is `infra/simulator/reference-builds.json`. It retains factual talent
allocations, equipment/enchant identifiers, source links, source-response SHA-256, snapshot
timestamps, engine revision and encounter metadata. It does not mirror their descriptions,
rankings, stat tables or reported DPS. No jobs were submitted to MythicSim's simulation queue.
Their [terms](https://mythicsim.com/terms) do not permit bulk ranking/guide mirroring without
written permission; this is four bounded example references, not a crawler or mirror.

## Validation and boundaries

- Their engine is `sage3648/mythicsim-forever-engine-go` revision
  `5af130344b6fb5150a5b3a2295f26d20adee625d`; ours remains the pinned Gunba revision
  `9a27c3d6af91d1ca0dbcf94a124b8869ad522108`. No combat code is ported in this import.
- Their ranking encounters use 120 seconds with 15 seconds variation, level-63 target and
  empty trinket slots. Our proposed optimization baseline is fixed blue PvP gear and controlled
  local scenarios. Do not compare the published DPS values directly.
- Map by named talent fields, not blindly by string positions. One known spelling difference
  (`twohandedWeaponSpecialization` versus `twoHandedWeaponSpecialization`) is explicit. All
  allocations require exact 51 points, tier/prerequisite legality, matching max ranks and exact
  agreement between semantic ranks and the advertised talent string. Current-tree fingerprints
  prevent silently using stale imports after an engine/tree update.
- Current source ranking builds differ from older `outside_builds.json` and bundled UI defaults
  in that repository. Those files are not treated as current tier-list evidence.
- All four source gear sets have missing/not-admitted equipment in our catalog. Missing IDs are
  recorded; no new item, raid equipment, historical stat fallback or unknown enchant is admitted.
  Source equipment is reference-only and never silently replaces the controlled baseline.
- Foreign APLs and options are recorded by identifier only, not installed. In particular,
  Shockadin needs an audited Holy Shock rotation, and Survival needs its weaving/pet/distance
  assumptions adapted before either can become a complete promoted build.
- `referenceTalentSeeds` selects only the requested profile/variant. The reviewed Fury and Arms
  talent policies add their one matching reference to the legal seed set and record attribution
  in evidence. Shockadin and Survival remain available for later spec-by-spec adaptation.

## Reproducing the import

`pnpm simulator:import:references` validates the four cached public snapshots and writes
`artifacts/forever-simulator/reference-candidates.json`. An explicit `--refresh` performs four
anonymous read-only GETs of the fixed public snapshot IDs; there is no recurring fetch or sim
submission. Review and promote the generated archive separately with an explicit source edit.

Before publishing a recommended build: freeze the PvP-blue baseline, port the correct APL,
test independent RNG seeds, optimize equipment/enchants, repeat feedback, then review the real
browser build. Import and static legality alone are not sufficient.

## October 17 delivery recheck

The public HTTPS simulator still serves engine `5df1a1d37d43e95fa440c1b5` with 2,565 items:
1,928 current-client items and 637 labelled Classic references. The additions cover all 14
equipment types; Hand of Justice and Blackhand's Breadth are present, and the sampled raid
exclusions remain absent. This was a read-only production check, not a new deployment.

Four bounded read-only snapshot requests passed the current importer and confirmed unchanged
talent allocations and source engine revision for the examples above. Their live response bytes
now differ from the pinned October 16 snapshots; the original evidence was preserved rather than
relabelled or replaced during a running experiment. Cached import replay and all 10 focused
reference/talent tests pass. These examples remain local search seeds, not public recommended
builds, and their missing equipment and foreign rotations remain uninstalled.

The subsequent LOCAL current-item recovery raises the catalog to2,591, separate from the public
2,565-item release. Cached example import replay still validates all four talent allocations.
Missing equipment remains Fury272403, Arms13982, Shockadin272411/2801 and Survival272397.
No missing source item, foreign rotation or raid equipment is silently substituted. Recovery
integration tests and169 Node tests pass, but these are not fresh per-spec optimization proofs.
