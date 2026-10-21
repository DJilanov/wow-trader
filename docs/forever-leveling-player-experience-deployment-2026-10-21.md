# Leveling player experience: production deployment — October 21, 2026

Status: deployed and publicly verified at **2026-10-21 16:33 UTC**.

## Exact release

| Item                           | Verified value                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Application commit             | `faf65ebdc83d3c57b15a75d723c91591eee7561d`                                                |
| Release                        | `/home/wow-trader-system/releases/kfc-helper-leveling-player-experience-20261021-faf65eb` |
| Next production build          | `ZqIm34-hbMMe_P4lT4fyA`                                                                   |
| Tracked source blobs verified  | 1,310                                                                                     |
| Source-manifest SHA-256        | `f9eefa56814b44d0c7ed754b3d2009b7c5f05b68d1672ab01eb5850bfeea1266`                        |
| Immediate rollback             | `/home/wow-trader-system/releases/kfc-helper-leveling-planning-20261021-6409827`          |
| Helper web PID / restart count | 3881829 / 161                                                                             |

The application commit was already pushed when deployment was requested. It was exported directly
from Git, not copied from the working tree, and installed with the frozen lockfile in a new release
directory. All source blobs matched Git before and after building, before activation and after public
verification. Concurrent uncommitted work was excluded. This documentation follow-up does not change
the deployed application identity above.

## What to test

Open the [Human/Warrior guide](https://kfcguild.online/tools/forever/leveling/routes/alliance-human?plan=premade&class=warrior)
or [Northshire reader](https://kfcguild.online/tools/forever/leveling/routes/alliance-human/chapters/premade-start-115?plan=premade&class=warrior).
Refresh existing tabs without clearing saved progress.

- Blank starting progress plans from level 1 / 0 XP. Northshire shows target level 5, and each
  chapter carries the preceding chapter's projected XP forward.
- Current instructions, expected progress and the next destination replace the default evidence
  audit tables. Personal starters show your character, not five unknown party rows.
- Start is immediately available. Personal Done is an explicit completion report; Next only browses.
  Real dungeon-entry requirements and prerequisite reports remain enforced.
- Update level / XP anchors a real correction to its guide step. Browsing and reloading do not
  move that anchor, change the recorded bar, or award forecasts as earned XP.
- Optional-dungeon choices survive reload, including exclusions that merge adjacent chapters.
- The new reader migrates an existing v1 workspace into `kfc-leveling:characters:v2`, leaving the
  v1 rollback copy untouched. Keep both keys: updates made independently in the two reader versions
  are not automatically merged.

Production combat references remain unconfigured. Missing kill XP is explicitly omitted and does
not itself justify extra grinding. This deployment does not publish private reference data, install
an addon, or certify a fully playtested 1–60 route.

## Verification

- Ten web dependency packages, Linux Next production compilation, both strict typechecks, lint,
  touched-script checks, formatting and standalone packaging passed. The build used a temporary
  3,072 MB heap cap; runtime remains at its existing 768 MB limit. Previous static chunks were
  retained without overwriting the candidate's own chunks, protecting already-open tabs.
- All **488 leveling tests** passed. The complete Linux web run covered **949 tests**: 944 passed
  initially, while five cases in one large simulator-fixture file timed out. All 22 tests in that
  file passed on an isolated one-worker rerun with unchanged assertions and timeouts. Both logs
  are retained; the initial run is not described as a clean pass. All **25 deployment/support
  tests** passed locally.
- The extended candidate browser sweep passed at 1440 px and 390 px, with a 320 px overflow probe:
  numeric targets, default 1 / 0, continuous chapter bars, personal completion without an initial XP
  form, actual-data isolation, fixed corrections, reloads, legacy migration, optional-dungeon
  changes, per-player corrections, entry guards, Escape, visible dialog headings and chapter jumps.
- Identical core guide checks passed against the candidate and the actual public HTTPS site at
  desktop and mobile widths. Tests used isolated browser contexts and blocked API writes; no real
  user's browser saves or server reports were modified.
- All seven selected simulator profiles and their 17 published builds passed candidate and public
  compatibility gates, including database checksums and private-proof protection. Warrior and
  Warlock actually initialized and completed Load build at both viewport widths, with no browser
  errors or overflow. No new numerical model or selection was published.
- Candidate asset checks passed for five pages and 33 assets. Public checks passed for **10 pages
  and 89 assets**, including guild home, Tools, Forever, guide, both simulators, the two previously
  reported recipe-icon examples and the Discord website. The legacy Helper guide URL retains its
  one-to-one HTTP 301 redirect.

### Reviewed streaming diagnostics

Two new `The destination stream closed early` entries were logged during public browser navigation.
Both have digest `144992331`; no other new error lines occurred. The exact installed React source
registers this message through `destination.on("close", createCancelHandler(...))`. Direct candidate
HTML and WASM abort experiments did not reproduce the entries; their exact browser requests have
not been identified. No successful controlled reproduction is claimed, no logs were suppressed,
and no framework or application code was altered to hide them. Public browser and asset checks
passed. Details and the source checksum are retained in `stream-review.json`.

## Operational boundary and evidence

Only `kfc-helper-web` restarted. Ingestion (3528524), guild web (3542598), Discord web (3575767),
reference publisher (3390339) and official updates (3057700) retained their PIDs, states and restart
counts. The crawler remains stopped. Shared simulator selection and quest-reference index hashes
are unchanged. Only the public `SEO_RUM_BUILD` environment marker changed; credentials, data roots
and runtime limits did not. This deployment did not change Nginx, database schemas, media pointers
or public downloads.

Machine-readable source/build identity is recorded in the release's `source-deployment.json`.
The guarded controller, source manifest, verification results, failed and successful build logs,
stream review and public/candidate receipts are under:

`/home/wow-trader-system/shared/backups/leveling-player-experience-20261021-faf65eb/`

Local browser screenshots and receipts are under the ignored directory
`artifacts/deployments/leveling-player-experience-20261021/`. The extended candidate sweep is retained
at `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-player-flow-quest-only-ZTiQNc`.
The owned candidate process and test transport are stopped after verification.

## Guarded web-only rollback

The controller refuses rollback if a later deployment moved production or other runtime settings
changed. It restores the preceding web source and public build label, restarts only Helper web,
and checks health. Shared data and both browser workspace generations remain intact.

```sh
ssh root@89.167.46.193 \
  'node /home/wow-trader-system/shared/backups/leveling-player-experience-20261021-faf65eb/control.mjs --rollback'
```
