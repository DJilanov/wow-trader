# Quest-funded pickup gates: test deployment — October 20, 2026

Status: deployed and verified for browser testing. Real in-game route validation, measured
grinding evidence and addon publication remain separate gates.

## Exact release

| Item                                            | Verified value                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Deployed application commit                     | `015b2057183e5fbf84081e5efc21002168c5e64b`                                   |
| Server release                                  | `/home/wow-trader-system/releases/kfc-helper-leveling-test-20261020-015b205` |
| Next production build                           | `O65ZgiMwjXg25136SWj1c`                                                      |
| Tracked source files verified against Git blobs | 1,094                                                                        |
| Source manifest SHA-256                         | `a19f48fb12c1df912130e43a5c64e6227326dd8422b0a039b32f33bc0cf6a624`           |
| Immediate rollback                              | `/home/wow-trader-system/releases/kfc-helper-leveling-test-20261020-d4390d3` |
| Live web PID / restart count                    | 3661044 / 153                                                                |

The nine-file application change was committed and pushed before deployment. A clean detached
worktree passed verification; the server received a Git archive of that exact commit and built
all 11 shared packages and Next with the frozen lockfile. Source bytes were checked before and
after building and again before activation. No dirty-worktree overlay was deployed.

A separate broad `b4f6307` (`Adapt`) commit landed while this release was building. It is not
part of this scoped deployment. Newer repository or documentation commits do not imply that
their application changes are live; the deployed application identity is the explicit commit above.

The first server build hit the existing 768 MB Node heap cap during typechecking. The successful
retry used a build-only 2,048 MB cap after checking available memory. The private runtime
configuration remains at 768 MB; no secret-bearing environment copy was made. No core file was
created. Live Helper web used approximately 290 MB RSS at verification.

## What to test

Open the [Human/Warrior Northshire chapter using the old quest-18 bookmark](https://kfcguild.online/tools/forever/leveling/routes/alliance-human/chapters/premade-start-115?plan=premade&class=warrior#campaign-start-115-level-2-18).
Refresh an existing tab; keep saved progress. The bookmark now opens the actual pickup rather
than a separate instruction to reach level 2. The nine preceding hand-ins fund 1,040 XP, versus
400 XP required for level 2, without counting any kills.

Only observed levels or already reported hand-ins satisfy actual eligibility. Do not report a
quest complete unless it was completed in game. Real shortfalls, quest prerequisites and
fresh-bar observations remain enforced. Leader-only starter rewards are not credited to the
other four players; saved XP is never overwritten with a forecast.

The [level-5 Elwynn handoff](https://kfcguild.online/tools/forever/leveling/routes/alliance-human/chapters/premade-start-116?plan=premade&class=warrior)
also remains available without first grinding to level 6. See the
[planner contract](forever-leveling-adaptive-handoffs.md) for the conservative reward calculation.

## Verification

- Clean release: 346 leveling tests and 552 web tests, both strict typechecks, leveling and
  touched-script lint, formatting, nine local web dependency builds, all 11 server package
  builds and the server production Next build passed. The earlier 691-test development web
  count included unrelated workspace tests and is not this release's web test count.
- Candidate and active-release browser checks passed at 1440px and 390px: level-5 Elwynn,
  old quest-18 bookmark migration, no redundant level-2 card, confirmed earlier rewards despite
  a stale lower saved bar, explicit in-game confirmation, pickup persistence after reload,
  unchanged actual XP/other players, no horizontal overflow and no browser errors. Active-release
  guide tests used a local SSH tunnel with an isolated browser context and blocked non-GET/HEAD
  requests; no real browser saves or server reports were changed.
- Candidate and active optional-dungeon controls passed: four defaults, planning-level override,
  slot skip, reload, dungeon exclusion/restoration, first-run mobile save and no earned-XP mutation.
- Candidate checks passed for five pages and 30 assets. Its guild-root icon was checked through
  the unchanged canonical Nginx route; `/tools/kfc-icon.svg` matched the old release. Direct Next
  does not own the guild-root icon. Public checks used no remapping and passed six pages and 57
  assets: guild home, Tools, Forever, Northshire, Elwynn and Warrior.
- The public Northshire response advertises `workflow-20261020-v8`, contains no redundant
  level-2 action/card, and omits its old imperative. The legacy Helper chapter URL still redirects
  one-to-one with HTTP 301. The Discord website returned HTTP 200.
- Public Warrior checks actually selected another reviewed build and clicked Load build at both
  widths. The iframe initialized, reached a complete document and cleared its loading notice.
- Candidate and public simulator compatibility verification retained numerical model
  `81d964b453f4e6abb50a81e7`, presentation `8df7a7e5afd43f588d6ca257`, 2,591 items and nine
  reviewed builds across three profiles. Private proof files remain inaccessible.

Browser artifacts:

- Candidate guide: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-adaptive-handoffs-Sa5L6Z`.
- Candidate bundles: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-guaranteed-bundles-8NRnS1`.
- Active guide: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-adaptive-handoffs-29XPHK`.
- Active bundles: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-guaranteed-bundles-T4jP7u`.
- Public simulator: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-funded-live-simulator-1AidP7`.

## Operational boundary

Only `kfc-helper-web` restarted. Ingestion (3528524), guild web (3542598), Discord web (3575767),
reference publisher (3390339) and official updates (3057700) retained their PIDs, states and restart
counts. No migration, crawler run, Nginx/media change, addon install or public download activation
occurred. Only the public `SEO_RUM_BUILD` marker changed in the existing private web environment.

Published quest index SHA-256 remains
`c1575845706be535c73c760e2ca2f5312cf1ea406c6f2909674cf56fc1c0990e`;
its record-set SHA-256 remains
`fc3bc41392c2870cebbd20e68f5aeaf196c21dc5e187ab5664555483b29de960`.
Simulator selection/publication pointer checksums also remained unchanged.

The temporary preview on port 19224 (PID 3660854) and local test tunnels were stopped. The previous
immutable web release remains available for rollback. Machine-readable release/source identity
and results are in `source-deployment.json` and `source-files-verified.json` in the release.
Public-marker, process and artifact rollback metadata are under
`/home/wow-trader-system/shared/leveling/web-test-20261020-015b205`.

## Immediate web rollback

Run only while this exact release remains active. This restores the previous web source and
public build marker, without changing data, other applications or browser progress. The old
minimum-level prompts may reappear after rollback; no earned XP or quest report is reversed.

```sh
ssh root@89.167.46.193 bash -s <<'REMOTE'
set -euo pipefail
node <<'JS'
const fs = require("fs");
const root = "/home/wow-trader-system";
const release = root + "/releases/kfc-helper-leveling-test-20261020-015b205";
const previous = root + "/releases/kfc-helper-leveling-test-20261020-d4390d3";
if (fs.realpathSync(root + "/current") !== release) throw Error("Another release is active");
if (!fs.existsSync(previous + "/apps/web/.next/standalone/apps/web/server.js"))
  throw Error("Rollback release is unavailable");
const before = JSON.parse(fs.readFileSync(
  root + "/shared/leveling/web-test-20261020-015b205/web-public-env-before.json", "utf8",
));
const file = root + "/shared/env/web.env";
let raw = fs.readFileSync(file, "utf8");
raw = before.SEO_RUM_BUILD === null
  ? raw.replace(/^SEO_RUM_BUILD=.*\n?/m, "")
  : raw.replace(/^SEO_RUM_BUILD=.*$/m, () => before.SEO_RUM_BUILD);
const temporary = file + ".manual-rollback-015b205";
fs.writeFileSync(temporary, raw, { flag: "wx", mode: 0o600 });
fs.renameSync(temporary, file);
const link = root + "/current.manual-rollback-015b205";
fs.symlinkSync(previous, link);
fs.renameSync(link, root + "/current");
JS
WOW_TRADER_ENV_FILE=/home/wow-trader-system/shared/env/web.env \
  pm2 restart kfc-helper-web --update-env
pm2 save
curl --fail --silent http://127.0.0.1:19210/tools/api/v1/data-status
REMOTE
```
