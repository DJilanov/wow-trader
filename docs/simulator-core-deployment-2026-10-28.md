# Complete practical simulator deployment — October 28, 2026

All nine classes and the four healer profiles are live at
https://kfcguild.online/tools/forever/simulator. This completes the owner's
practical pre-raid release, using the accepted 2% target within the reviewed
candidate scope. It does not claim mathematical global optimality.

## Active release

| Setting                   | Value                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Pushed application commit | `c2e86606db119abe1a4f9793f12b8cae6df8b05a`                                                           |
| Activated                 | `2026-10-28T09:32:19.859Z`                                                                           |
| Next build                | `c0FfHHOlrGwz4Y2mJUTIZ`                                                                              |
| Source                    | `/home/wow-trader-system/releases/kfc-helper-simulator-core-20261028-c2e8660`                        |
| Simulator data            | `/home/wow-trader-system/shared/simulator-releases/full-class-core-20261028-c2e8660`                 |
| Static delivery           | `/home/wow-trader-system/shared/static-delivery/releases/kfc-helper-simulator-core-20261028-c2e8660` |
| Operations receipts       | `/home/wow-trader-system/shared/operations/simulator-core-20261028-c2e8660`                          |
| Managed process           | `kfc-helper-web`, port 19210                                                                         |

The source release preserves existing server-side guild login and leveling
corrections. A fresh copy of the prior live source received 1,453 checksum-verified
files from the pushed simulator code and dependencies. Identical lockfiles
allowed reuse of immutable dependencies; dependency outputs and Next were built
fresh on Linux. Source checksums were verified again after the build.

The initial 1 GiB build heap was insufficient during TypeScript checking. The
optimized production build passed with 3 GiB; the runtime still uses 768 MiB.
Only Helper restarted, and all unrelated PM2 process IDs remained unchanged.
No migration, credential change or notification send was involved.

## Release scope

The public deployment verifier checks 15 DPS/tank profiles and 45 published builds,
including the supported physical, caster, hybrid and tank configurations. All
four healer pages have complete working defaults. Holy uses release
`2647d16d94136cb1f5087e0c`: 270 named core frames and 7,560 configurations covering
all 30 acquisition profiles, three archetypes, three assignments and 28 mechanics
assumptions at 180 seconds in the stacked encounter.

Holy's original measurements and reviewed same-model profession equivalence are
retained. Transfer diagnostics are not presented as new performance confirmations.
All 270 selected references matched current browser/WASM results exactly. Final
indexed review found zero selected known failures. Publication requires the
source-bound private admission certificate, which is not publicly downloadable.

The optional 900-frame encounter expansion remains unfinished. Three completed
extension frames, raw evidence, recovery checkpoints and original deadlines are
preserved. That deeper refinement requires a separate future call; it is not
running in the background and does not block this practical release.

## Verification

- Local: 1,716 web tests, 94 Paladin SDK tests, 55 infrastructure checks,
  12 combat-library regressions and 19 catalog-update planner regressions passed.
  Strict types, scoped lint/formatting and production builds passed.
- Linux: dependency builds and optimized Next build passed. All 1,453 overlaid
  source files and 120,276 packaged runtime files were verified. Runtime content
  is deduplicated to 7,139 unique contents across 34 required release directories.
  Raw optimization SQLite databases were not uploaded.
- Private preview: 23 browser checks, 15 profiles / 45 builds, compressed asset
  delivery, private-file denial and readable static assets passed before activation.
- Fresh public Chromium review: 23/23 checks passed. All 15 DPS/tank profiles
  completed actual 32-fight simulations; Priest, Druid, Shaman and Paladin healing
  completed actual 64/128-fight simulations. Four 390px mobile checks found no
  horizontal overflow. There were zero browser or asset errors.
- Independent public verifier: 15 profiles / 45 builds passed with matching
  published item databases and private-proof denial. Nine public pages and 105
  assets passed the site smoke. Helper and guild remain online, and the existing
  Discord login provider still responds successfully.

Functional smoke simulations verify delivery and execution; their small sample
outputs are not new optimization or numerical qualification results.

Local evidence lives below
`artifacts/forever-simulator/optimization/remaining-class-updates-20261027-v1/`:

- `public-release-browser-Qr4m8Q/report.json`: fresh public browser report.
- `committed-cumulative-deployment-Tsyvxl/public-verification.json`: public build verifier.
- `committed-cumulative-deployment-Tsyvxl/public-site-assets.json`: public asset smoke.
- `combined-runtime-D4dQjP/report.json`: packaged runtime inventory and dependencies.
- `paladin-core-release-admission-jyBU5k/report.json`: Holy admission and failure review.

Server operations receipts retain the build, source/runtime verification,
candidate reviews, activation, post-activation health and preview cleanup results.
The temporary local 3029–3035 servers, 3038 SSH tunnel and remote 19238/19239 preview
were stopped. Owner development ports were left alone. The new owned Next build
cache (~432 MiB) was removed; evidence and rollback releases remain. Available
server space after that cleanup was approximately 4.43 GiB.

## Rollback

The activation controller automatically restores its prior application, public
environment fields and static delivery if activation fails. It completed
successfully. Do not rerun it blindly; it requires the exact previous state.

For a later rollback, first confirm the active release is still the one recorded
above. The prior source is
`/home/wow-trader-system/releases/kfc-helper-dungeon-xp-20261028-0760377`; its
prior simulator root is
`/home/wow-trader-system/shared/simulator-releases/tank-optimized-20261023-c6d56b7`.
The prior static delivery is
`/home/wow-trader-system/shared/static-delivery/releases/kfc-helper-dungeon-xp-20261028-0760377`.

Use the operations directory's `activation-before.json` to restore only the
recorded `FOREVER_SIMULATOR_ROOT`, `SEO_RUM_BUILD` and `TOOL_USAGE_BUILD` lines
in `shared/env/web.env`, preserving every other setting. Atomically restore the
`current` source symlink, restart only `kfc-helper-web` with its existing
environment-file configuration, and restore the prior static directory through
`activateStaticDelivery` from `scripts/activate-static-delivery.mjs`. That helper
validates Nginx configuration before reload. Recheck health, public assets and
the selected class engine before `pm2 save`. Preserve the failed release and
receipts for diagnosis.
