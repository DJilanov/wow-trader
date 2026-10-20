# Adaptive leveling planner test deployment — October 20, 2026

Status: deployed and verified for browser testing. Real in-game validation, measured grinding
evidence and addon publication remain separate gates.

## Exact release

| Item                                           | Verified value                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Deployed application commit                    | `d4390d397975ba7624e48630e17293338414bfd3`                                   |
| Server release                                 | `/home/wow-trader-system/releases/kfc-helper-leveling-test-20261020-d4390d3` |
| Next build ID                                  | `FiNeT0n3-aL3x7R2Q4Fp4`                                                      |
| Tracked source files checked against Git blobs | 1,091                                                                        |
| Source-file manifest SHA-256                   | `7470c46c85ce1c1a6c90a8b9d45df8635b4d510ace4d51941c38999ab2c5d2c8`           |
| Immediate rollback                             | `/home/wow-trader-system/releases/kfc-helper-leveling-test-20261019-101882a` |
| Live web PID at verification                   | 3656897                                                                      |

The commit was pushed before deployment. An isolated clean worktree was tested, and the server
received a Git archive of that exact commit. All 11 shared packages and Next were built from
source on the server with the frozen lockfile; no dirty-worktree overlay or development build was
deployed. Source blobs were rechecked after the build and before activation.

Only the 16 planner/UI/test/documentation files were committed in the application release.
The 247 unrelated locally modified or untracked files were excluded and preserved. A later
documentation-only commit records this receipt without changing the deployed application code.

## What to test

Open the [Human/Warrior Elwynn chapter](https://kfcguild.online/tools/forever/leveling/routes/alliance-human/chapters/premade-start-116?plan=premade&class=warrior).
Refresh an existing tab; do not clear saved progress. In Settings, record the leader's actual
level and XP. At level 5, Elwynn's handoff can be completed without first grinding to 6.
Individual quest minima and prerequisites still apply when their pickups are reached.

Chapter ranges and imported source-only grinding suggestions are advisory. Forecasts carry
actual bars forward, while necessary quest/stop gaps remain explicit. Dungeon and optional
catch-up targets use the selected policy; skipped optional dungeons do not retain departure
gates. Personal starter handoffs check the leader, whereas shared entry checks require all five.

## Verification

- Clean release: 324 leveling tests and 552 web tests passed, plus strict typechecks, lint,
  formatting, all package builds and the server production Next build. Earlier development
  counts include unrelated tests from the dirty workspace and are not the release-scope count.
- Candidate and live desktop/mobile browser checks saved level 5 + 123 XP through Settings,
  completed the Elwynn handoff, reloaded persisted completion, and preserved the party's actual
  XP and quest state. Both 1440px and 390px passed without page errors or horizontal overflow.
- Candidate and live optional-bundle checks passed: four defaults, planning-level overrides, skipped
  slots, reload, dungeon exclusion/restoration, first-run mobile saving and party identity.
- Public checks passed for five pages and 55 assets: guild home, Tools, Forever, leveling and
  Warrior simulator. The public Elwynn response contains “No fixed zone-entry level” and no old
  “Reach level 6 before Elwynn Forest” gate.
- Public Warrior testing actually selected another reviewed build and clicked Load build at
  both widths. The iframe initialized, its document completed, and the loading notice cleared.
- Simulator verification retained model `81d964b453f4e6abb50a81e7`, presentation
  `8df7a7e5afd43f588d6ca257`, 2,591 items and nine reviewed builds across three profiles.
  Private proof files remain inaccessible.
- The Discord site returned HTTP 200. The legacy Helper guide URL still returns the canonical
  one-to-one 301 redirect.

The direct private Next preview lacks Nginx's guild-root `/kfc-icon.svg` route, just like the old
direct Next server. That icon was checked through the unchanged canonical Nginx route; helper
icons at `/tools/kfc-icon.svg` matched the previous release. All other candidate assets were
checked against the candidate. The final public five-page asset check used no such remapping.

Browser artifacts:

- Candidate handoff: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-adaptive-handoffs-c2AMNL`.
- Candidate bundles: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-guaranteed-bundles-6ctdKN`.
- Live handoff: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-adaptive-handoffs-iQiJts`.
- Live bundles: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-guaranteed-bundles-EG37yq`.
- Public simulator: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-adaptive-live-simulator-1xx23q`.

## Operational boundary

Only `kfc-helper-web` was restarted. Ingestion (PID 3528524), the guild website (3542598), Discord
website (3575767) and reference publisher (3390339) retained their online states and PIDs.
No database migration, crawler run, Nginx change, media deletion, game installation or public
addon activation occurred.

The published quest feed was not changed. Its index SHA-256 remains
`c1575845706be535c73c760e2ca2f5312cf1ea406c6f2909674cf56fc1c0990e`.
Only the public `SEO_RUM_BUILD` marker in the existing private web environment was changed.
No temporary secret-bearing environment file was created.
The temporary candidate and SSH test tunnels were stopped after verification. The previous
immutable web release remains available for rollback.

Machine-readable identity and checks are in the release's `source-deployment.json` and
`source-files-verified.json`. Process and public-environment rollback metadata are under
`/home/wow-trader-system/shared/leveling/web-test-20261020-d4390d3`.

## Immediate web rollback

Run only while this exact release remains active. It restores the prior web release and the
public build marker, leaving quest data, media, other processes and browser saves intact.
The older workflow does not recognize newly introduced checkpoint bookmark IDs; choose the
chapter manually if resume selects an earlier step after rollback. Actual XP and reported quest
states are not rewritten.

```sh
ssh root@89.167.46.193 bash -s <<'REMOTE'
set -euo pipefail
node <<'JS'
const fs = require("fs");
const root = "/home/wow-trader-system";
const release = root + "/releases/kfc-helper-leveling-test-20261020-d4390d3";
const previous = root + "/releases/kfc-helper-leveling-test-20261019-101882a";
if (fs.realpathSync(root + "/current") !== release) throw Error("Another release is active");
const before = JSON.parse(fs.readFileSync(
  root + "/shared/leveling/web-test-20261020-d4390d3/web-public-env-before.json", "utf8",
));
const file = root + "/shared/env/web.env";
let raw = fs.readFileSync(file, "utf8");
raw = before.SEO_RUM_BUILD === null
  ? raw.replace(/^SEO_RUM_BUILD=.*\n?/m, "")
  : raw.replace(/^SEO_RUM_BUILD=.*$/m, () => before.SEO_RUM_BUILD);
const temporary = file + ".manual-rollback-d4390d3";
fs.writeFileSync(temporary, raw, { flag: "wx", mode: 0o600 });
fs.renameSync(temporary, file);
const link = root + "/current.manual-rollback-d4390d3";
fs.symlinkSync(previous, link);
fs.renameSync(link, root + "/current");
JS
WOW_TRADER_ENV_FILE=/home/wow-trader-system/shared/env/web.env \
  pm2 restart kfc-helper-web --update-env
pm2 save
curl --fail --silent http://127.0.0.1:19210/tools/api/v1/data-status
REMOTE
```
