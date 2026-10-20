# Reviewed simulator deployment — October 20, 2026

Status: preparing the owner-authorized production release; not yet live.

The owner committed application source as `685c6d5` and explicitly requested its deployment.
The deployment-verification follow-up follows the normal commit → push → source build →
candidate verification → web-only activation → public smoke workflow. No dirty source overlay,
database migration, ingestion restart, crawler run or addon activation is intended.

## Reviewed scope

| Class   | Ready DPS builds                                                        |
| ------- | ----------------------------------------------------------------------- |
| Warrior | Fury, two-handed Fury, Arms; separate opt-in provisional-proc Fury/Arms |
| Rogue   | Combat, Mutilate, Subtlety                                              |
| Hunter  | Beast Mastery, Marksmanship, Survival                                   |
| Druid   | Feral DPS, Balance                                                      |
| Mage    | Frost, Fire, Arcane                                                     |
| Warlock | Demonology                                                              |

There are 17 reviewed publication entries representing 15 distinct DPS spec/variant builds.
Each reference DPS uses 40,000 validation fights with its complete saved benchmark settings.
These are conditional first-pass results, not guaranteed live-server maxima or a cross-class
ranking. Tank starters and remaining DPS specs are not completed optimization work.

After deployment the owner requested a separate consistent raid-wide-buff recheck for every
DPS: Strength of Earth + Grace of Air + Windfury, plus Hunter Trueshot Aura. The owner confirmed
this is not duplicate totem stacking. These new runs must not relabel the current references.

## Prepared evidence

- Full simulator regression: 487/487 tests, 39 suites. Deployment checker: 11/11 tests.
- Local actual deployment gate: seven profiles, correct class-specific iframe releases,
  matching databases, item weapon-skill bonuses ignored and private proof files hidden.
- Demonology local selection: `optimization/reviews/warlock-demonology-local-selection-65aa2b388d91582b.json`.
- Actual Demonology page: `optimization/reviews/warlock-main-page-89ba83015c834e69.json`,
  desktop/mobile saved settings, first defaults, configs/gear, rotation guide, tooltips,
  scrolling, real 25-fight simulations and both inspected screenshots.
- Finite artifact inventory: `optimization/deployment-20261020-qZeHKX/manifest.json`,
  21,128 files / 784,794,816 bytes. Actual strict readers validate all selected builds;
  every immutable asset size and SHA-256 was checked. No raw simulation caches are shipped.

## Activation boundary and rollback

Before activation the active source is
`/home/wow-trader-system/releases/kfc-helper-leveling-test-20261020-015b205`.
Retain it and the existing artifact root for rollback. Build and verify an isolated candidate
with a separate artifact directory before changing the web process. Preserve private env
values; record only public source/build/artifact identities. Only `kfc-helper-web` may restart.
Recheck the active release before switching; if another deployment moved it, stop and reconcile.

The final source commit, build identity, artifact root, staged/public checks and rollback
command must be recorded here after actual deployment. Preparation is not a deployment claim.
