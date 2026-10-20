# Reviewed simulator deployment — October 20, 2026

Status: deployed and verified on the public site.

## Release receipt

| Item                | Verified value                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| Application commit  | `91b06f575c0f1aaaea9b6288ffe07f2f5f73dd2e`                                        |
| Production source   | `/home/wow-trader-system/releases/kfc-helper-simulator-reviewed-20261020-91b06f5` |
| Next build          | `FxgzTlOyYvw9WgD6-Cxb5`                                                           |
| Simulator root      | `/home/wow-trader-system/shared/simulator-releases/reviewed-20261020-91b06f5`     |
| Web process         | PID `3686049`, restart count `154`                                                |
| Previous source     | `/home/wow-trader-system/releases/kfc-helper-leveling-test-20261020-015b205`      |
| Operational receipt | `/home/wow-trader-system/shared/backups/simulator-reviewed-20261020-91b06f5`      |

The pushed source was built on Linux with the frozen lockfile. All 1,243 tracked source
files match their committed Git blobs before/after building, before activation and after
public verification. All 21,128 artifact files match their size/SHA-256 inventory. The six
required source/presentation releases are isolated from the old artifact root. Twelve older
immutable release directories are retained by hardlinks, preserving asset URLs in existing
tabs without duplicating their contents or replacing the old rollback root.

Only `kfc-helper-web` restarted. Ingestion, guild web, publisher, official updates and the
stopped crawler retained exact PID/state/restart counts. Only the two public environment
settings `FOREVER_SIMULATOR_ROOT` and `SEO_RUM_BUILD` changed. Runtime heap and all private
values were retained; no migration, Nginx change or worker activation occurred.

This deploy uses the owner's committed `685c6d5` source plus the scoped deployment-gate
follow-up. It therefore includes that commit's other application source, but does not install
or activate its separate storage/crawler tooling. No dirty-worktree overlay was shipped.

## Final verification

- Local full web: **771/771 tests**, 109 suites, including the 487 simulator tests.
- Deployment-gate tests: **11/11**, locally and on Linux; scoped lint and format pass.
- All 11 shared package builds and the production Next compile/typecheck pass.
- Candidate and public verification each pass all seven selected profile routes, every
  selected public item database checksum, ignored weapon-skill policy and private-proof 404s.
- Candidate and public browser sweeps each pass **34 desktop/mobile build checks** and
  **15 genuine 25-fight simulations**: full measured imports, scrolling and reload persistence,
  zero page errors. Both environments produce exactly the same saved-setting and same-seed
  result arrays. These functional smoke fights are not new independent optimization evidence.
- Guild home, Trader and Leveling return HTTP 200. The legacy Helper Mage link resolves to
  the correct canonical public page. No application errors appeared in the live error log.

Browser reports are `browser-stage.json` and `browser-public.json`; exact comparison is
`verified.json`, in both the operational receipt above and the local
`artifacts/forever-simulator/optimization/deployment-20261020-qZeHKX` directory.
The temporary stage proxy, tunnel and verified preview process have all been stopped. Live
web health remains HTTP 200. Final disk usage is 68%, with 24 GB free; no release or evidence
was deleted for this deployment.

The initial test adapter had request-interception cleanup errors, corrected by using a real
local HTTP asset-mount proxy. One initial Feral reload observation timed out; isolated desktop/
mobile checks and the subsequent complete staged and public sweeps passed without an app or
combat-model change. This is not claimed as a diagnosed production application defect/fix.

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

After deployment the owner requested a separate raid-wide-buff recheck for every DPS:
Moonkin Aura, Leader of the Pack, Trueshot Aura, Battle Shout, Strength of Earth, Grace of Air
and Windfury. The owner confirmed this is not duplicate totem stacking. These new runs have
not started and must not relabel the current references. Audit effective self/provider buffs
and common encounter/debuff assumptions before presenting a cross-class comparison.

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

Run the following only while this exact release remains active. The controller verifies the
current source before restoring the preceding source and the two previous public settings,
then restarts only Helper web and checks health. It does not reverse any data or browser saves.

```sh
ssh root@89.167.46.193 \
  'node /home/wow-trader-system/shared/backups/simulator-reviewed-20261020-91b06f5/activate-reviewed-deployment-20261020.mjs --rollback'
```
