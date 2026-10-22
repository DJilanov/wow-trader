# Forever leveling: task-first production release

Status: committed, pushed, deployed and publicly verified on **22 October 2026**.
Final verification completed at **06:49:20 UTC**. Deployment followed explicit user authorization.

## Release identity and scope

- Application commit: `193078b40c57f1f835396b5185d7872b683a3f3f`.
- Next build: `tfqFPXnAnBXMoXjmnYfBr`.
- Release: `/home/wow-trader-system/releases/kfc-helper-leveling-task-first-20261022-193078b`.
- Source manifest: **1,317 Git blobs**, verified before and after building and again after activation.
  SHA-256: `58b62283fae64191775f8b417de06a49304fb66a7723ec5e37435ae43192060f`.
- Server receipt: `/home/wow-trader-system/shared/backups/leveling-task-first-20261022-193078b`.
- Previous runtime: `kfc-helper-leveling-player-experience-20261021-faf65eb`.
- Static delivery: the matching new release; previous hashed chunks remain available.

This release includes the independently forecast party starters, personal/shared chapter split,
expected-entry wording, kill-first Redridge/Wetlands merge and task-first guide correction.
Normal travel and questing no longer insert repeated XP-recording tasks. The reader shows the
expected chapter finish and next destination. Manual corrections stay optional during ordinary
play; actual quest minima, dungeon entry requirements and unlock checks remain enforced.
Existing saves, correction anchors and removed-reminder bookmarks are preserved or migrated.

The 35-file application commit excludes the user's unrelated simulator work, crawler changes,
private combat references and addon packages. Documentation follow-up commits do not change
the application source identity above.

## Verification

The exported commit was installed with the frozen lockfile and built on the production Linux
host in an isolated release directory before activation.

| Check                                        | Result                                                                |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Leveling unit tests                          | 505 passed / 41 files                                                 |
| Full committed web suite                     | 957 passed / 121 files, one worker, unchanged timeouts                |
| Deployment support tests                     | 39 passed locally                                                     |
| Leveling and web strict typechecks           | Passed                                                                |
| Leveling, full web and touched-script lint   | Passed                                                                |
| Authorized archive audit                     | 33 race/class contexts / 61 source chapters passed                    |
| Normal Linux web production build            | Passed; all 57 static pages and standalone packaging                  |
| Candidate guide acceptance                   | Passed at 1440 px / 390 px, with 320 px overflow probe                |
| Extended candidate player flow               | Passed at both widths, including legacy saves and optional dungeons   |
| Public guide acceptance                      | Passed at both widths with the same checked outcomes as the candidate |
| Candidate and public simulator browser flows | Warrior / Warlock initialized and loaded builds at both widths        |
| Candidate and public simulator data gate     | Identical passing results: seven profiles / 17 published builds       |
| Candidate assets                             | Eight pages / 39 assets passed                                        |
| Public assets                                | Ten pages / 89 assets passed                                          |

The guide checks cover blank progress as level 1 / 0 XP, useful targets, continuous chapter XP,
independent party starters, personal completion without an XP form, fixed correction anchors,
reload persistence, party-member isolation, removed-reminder bookmarks, chapter-result copy,
keyboard/dialog behavior and real entry guards. Desktop/mobile task and chapter-result
screenshots were visually inspected.

The public asset sweep includes the guild home, tools hub, Forever landing, guide overview,
both simulator pages, recipe pages 1301455 and 1301428, and the Discord website. Legacy Helper
links still redirect to the apex `/tools` path with their query intact.

### Build retry, retained evidence

The initial explicit webpack build failed inside Next's Google-font loader with
`TypeError: Cannot read properties of null (reading '1')`; its log is retained as `build.log`.
The root cause was not proven. Fetching the same font CSS afterward returned valid responses,
which does not establish the cause of the earlier failure.

The project's normal `pnpm --filter @wow-trader/web build` then passed using its default
Turbopack build. No source/dependency patch, mock font or weakened test was used for the retry.
Its log is `finish-build.log`. The successful source/build receipt is `build-passed.json`.
The initial log also retains the fully passing 505-test and 957-test runs.

## Activation and runtime safeguards

The static delivery was activated before the web release. Only `kfc-helper-web` restarted.
The guild website, ingest, reference publisher, official updates and Discord site retained
their PIDs and restart counts; the crawler remained stopped. Simulator model/review pointers
and the published reference index retained their checksums. No unrelated service was deployed.

The live Helper web PM2 restart limit had drifted to **600 MiB**, despite the committed
`ecosystem.config.cjs` specifying **1100 MiB**. The candidate's measured high-water RSS was
about 632 MiB. The old production process also had a logged 600-MiB memory-triggered restart
during staging; another web restart was observed before activation without a proven cause.
The old release, protected services, reference pointers and other environment settings were
rechecked before continuing. Both snapshots are retained in `before.json` and `runtime-before.json`.

Activation restored the existing committed **1100-MiB web-only restart limit**, verified the
actual PM2 value, and saved PM2 state. The **768-MiB Node heap stayed unchanged**. Rollback
restores the captured old restart limit as well as the previous runtime, static pointer and
public build label. No global memory limit was changed.

The runtime env file was checksum-verified as unchanged except for the public `SEO_RUM_BUILD`
label. The final check confirmed the activated web PID remained online without another restart.
The owned candidate server, local proxy and SSH tunnel were stopped after the browser checks.

Public logs gained two recognized `The destination stream closed early` entries during the
verification window. They match the installed React destination-close cancellation handler;
the exact requests were not established and no controlled reproduction is claimed. They were
retained in `stream-review.json`, not hidden. There were no other error lines in that window.

## Testing and rollback

Test the [party guide](https://kfcguild.online/tools/forever/leveling/routes/alliance-human?plan=premade&class=warrior)
using a fresh or existing saved character. Check the starter-to-party handoff, Lakeshire task,
chapter finish and optional progress correction. Browser verification is not a measured
in-game 1–60 playthrough or evidence of a globally fastest route.

Production still has no published combat-reference dataset. Missing kill XP remains uncounted;
this release does not invent it, bypass publication controls or certify leveling-time estimates.
The reserved dungeon quest slots and unavailable identities are not newly verified by this release.

If rollback is explicitly authorized, run on the deployment host:

```sh
node /home/wow-trader-system/shared/backups/leveling-task-first-20261022-193078b/control.mjs --rollback
```

The controller refuses to overwrite a later application's deployment. The old static delivery is
`kfc-helper-leveling-player-experience-20261021-faf65eb-r1`. Review current state before rollback;
an old receipt is not authorization to replace later work.

The final machine-readable receipt is `verified.json` in the server receipt directory and
`source-deployment.json` in the physical release. A local copy of the public/candidate checks,
screenshots and verification receipt is retained under the ignored directory
`artifacts/deployments/leveling-task-first-20261022/`.
