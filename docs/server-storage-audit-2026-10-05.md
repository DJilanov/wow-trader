# Server storage audit — 2026-10-05

Initial read-only audit of `root@89.167.46.193`, completed around 13:00 UTC, followed by
user-approved cleanup at 13:22 UTC. The initial estimates below are historical; the cleanup
receipt records what was actually removed and retained.

## Completed cleanup receipt

- User approved the four recommended categories with “clear”. The unreviewed raid staging copy
  remained outside the cleanup scope.
- Fresh guards checked exact target paths/inodes, mounts, active and saved PM2 configuration,
  process command lines/working directories, Nginx/systemd/cron references, retained symlinks,
  open files and package-manager activity. Relative build directories were resolved against their
  owning application's working directory, not matched to another project's build by name alone.
- An unmanaged Next.js process, PID `687835`, still uses
  `kfc-helper-item-market-20260927-r13/apps/web/.next/standalone/apps/web` and listens on
  `127.0.0.1:19212`. Its release was excluded and the process was not stopped. Retained-source
  symlink checks pruned the obsolete build directories rather than treating their self-links as
  dependencies from live code.
- Permanently removed **30 Helper releases** and **34 community build directories**, listed below.
  Removed only `/root/.npm/_cacache` from npm, preserving `_npx`, settings and logs. Cleared
  **292 APT archive entries**, preserving the archive directory, its lock and the `partial` directory.
- Measured filesystem recovery: **30,260,068,352 bytes / 28.18 GiB**. Available space increased from
  **6.6 GiB to 34.8 GiB**; `df -h /` now reports **52% used**, down from 91%. Inode usage fell from
  32% to 22%. Actual filesystem recovery includes metadata beyond the initial regular-file estimates.
- Seven Helper releases and three community builds remain. All protected directory identities and
  the live Helper pointer were unchanged. Shared data, PostgreSQL, backups, the archive, staging
  copy, secrets and public companion installers were not removed.
- All **19 PM2 services** retained the same PID, online status and restart count. Public HTTPS checks
  passed for Helper, Trader, Leveling, the Human Elwynn chapter, Discord and the guild homepage:
  HTTP 200 with no checked catalog/database/server-error markers. No service reload/restart,
  migration, deployment, commit or push was performed.
- Deleted builds were not moved to trash: restoring them requires rebuilding or an existing backup.
  Download caches can be recreated. No automatic release-retention job was added.

## Initial audit findings

The root filesystem is 91% used, with approximately 6.6 GiB available. Inodes are only 32%
used. Retained deployment artifacts, rather than PostgreSQL or logs, are the main opportunity.

| Candidate                                   | Reclaimable regular-file blocks | Status                                                                                                             |
| ------------------------------------------- | ------------------------------: | ------------------------------------------------------------------------------------------------------------------ |
| 31 obsolete Helper releases                 |                       18.33 GiB | No active or saved PM2 reference; retained-release symlinks do not depend on them                                  |
| 34 obsolete community Next.js builds        |                        4.25 GiB | Keep the active build and two rollback builds listed below                                                         |
| `/root/.npm/_cacache`                       |                        4.56 GiB | Download cache, not installed application dependencies                                                             |
| `/var/cache/apt/archives`                   |                        0.35 GiB | Downloaded packages, not installed system packages                                                                 |
| `/home/wow-forever-raids-stage-20261003-r1` |                        1.99 GiB | No active reference found, but no Git metadata; review unique source/configuration before removing the entire copy |

The first four candidates total **27.50 GiB**, bringing available space to approximately
34 GiB. Including the staging copy would total **29.49 GiB**, bringing available space to
approximately 36 GiB. Directory metadata is not included, and concurrent writes can change totals.

These estimates count each regular-file inode once, using allocated blocks rather than apparent
file lengths. An inode is counted as reclaimable only when every hard link is inside the candidate
set. Approximately 0.79 GiB of Helper files remain linked outside obsolete releases and are excluded
from the savings estimate. Do not add the pnpm store or nested Turbo/desktop directories to these
totals: doing so would double-count data or assume shared files are removable.

## Retained paths

Retain these Helper releases under `/home/wow-trader-system/releases/`:

- `kfc-helper-leveling-dungeons-20261005-r6`: active web target of `current`.
- `kfc-helper-leveling-quality-20261004-r5`: immediate web rollback.
- `kfc-helper-leveling-workspace-20261004-r4`: additional working web rollback.
- `kfc-helper-leveling-preview-20261004-r1`: full pre-feature fallback.
- `kfc-helper-forever-research-20261004-r4`: older documented fallback, retained conservatively.
- `kfc-helper-ingest-auction-20261001-r1`: independently active ingestion release.
- `kfc-helper-item-market-20260927-r13`: unmanaged local Next.js server discovered during cleanup guards.

Retain these builds under `/home/wow-forever-discord/`:

- `.next-release-leveling-20261004-r4`: active `FOREVER_BUILD_DIR`, including saved PM2 state.
- `.next-release-leveling-20261004-r3`: previous build.
- `.next-release-leveling-20261004-r1`: pre-feature fallback.

Also retain PostgreSQL data/WAL, all shared Helper data and secrets, catalog/world/guide archives,
market uploads, media, publicly advertised companion installers, backups, active application
dependencies, unrelated live websites, and the Node runtime used by the community app.

The shared Helper directory is approximately 3.43 GiB, including 1.80 GiB of companion downloads
and 0.78 GiB of backups. These are not disposable release artifacts. `/var/backups` is approximately
1.5 GiB, and `/home/_archive` approximately 1.2 GiB; neither is approved for deletion or proven to
have a complete off-server replacement.

Browser caches were not included because deployed applications may depend on them. Logs are
comparatively small; reducing rollback/build accumulation should take priority over losing logs.

## Removed Helper releases

All 30 paths below were removed and are relative to `/home/wow-trader-system/releases/`.
The initially audited `kfc-helper-item-market-20260927-r13` was retained, not removed.
This receipt is not authorization for recursive deletion of the release root or future wildcard cleanup.

```text
kfc-helper-actionable-trader-20260927-r5
kfc-helper-bot-policy-20260915-r6
kfc-helper-companion-arm64-20260928-r16
kfc-helper-companion-platforms-20260928-r15
kfc-helper-faction-markets-20261001-r19
kfc-helper-forever-preview-20260916-r7
kfc-helper-forever-research-20261004-r3
kfc-helper-forever-trader-20260927-r1
kfc-helper-forever-trader-20260927-r2
kfc-helper-forever-wowhead-links-20260927-r3
kfc-helper-initial-20260915
kfc-helper-initial-20260915-r3
kfc-helper-initial-20260915-r4
kfc-helper-initial-20260915-r5
kfc-helper-leveling-workspace-20261004-r2
kfc-helper-leveling-workspace-20261004-r3
kfc-helper-market-bigint-20260929-r17
kfc-helper-nginx-streaming-20260930-r18
kfc-helper-product-search-20260916-r9
kfc-helper-remove-attribution-20260916-r8
kfc-helper-scan-poll-20260927-r14
kfc-helper-scan-refresh-20260927-r12
kfc-helper-seo-20260915-r1
kfc-helper-seo-live-search-20260915-r3
kfc-helper-seo-live-search-20260915-r4
kfc-helper-seo-live-search-20260915-r5
kfc-helper-seo-typeahead-20260915-r2
kfc-helper-world-explorer-024fc46
kfc-helper-world-explorer-3cf6be0
kfc-helper-world-explorer-bd1543a
```

## Removed community builds

All 34 paths below were removed and are relative to `/home/wow-forever-discord/`. The application root, its source,
`node_modules`, workers, `.data`, secrets, and artifacts are not in the cleanup list.

```text
.next-release-20260929
.next-release-20260929-design
.next-release-20260929-design-v2
.next-release-20260929-editorial
.next-release-20260929-editorial-v2
.next-release-20260929-final
.next-release-20260930-community
.next-release-auction-20261001-r1
.next-release-auction-20261001-r2
.next-release-auction-auto-20261001-r1
.next-release-auction-auto-20261001-r2
.next-release-auction-cadence-20261001-r1
.next-release-bridge-d721bcd
.next-release-community-tools-3f0e061
.next-release-consent-c8032a09
.next-release-discord-listings-20261001-r1
.next-release-event-editing-beta-20261003-r4
.next-release-group-future-20261002-r1
.next-release-group-pvp-time-20261002-r1
.next-release-group-time-fix-20261004-r2
.next-release-history-e4fe94f8
.next-release-leveling-20261004-r2
.next-release-listing-auto-review-20261004-r1
.next-release-loot-experience-20261003-r5
.next-release-native-raids-20261003-r1
.next-release-no-notices-ec0b4b88
.next-release-open-signup-20261003-r3
.next-release-pairs-fb1ff2b
.next-release-party-roster-20261004-r6
.next-release-pilot-0cd1af4
.next-release-raid-loot-20261003-r2
.next-release-research-20261004-r1
.next-release-research-20261004-r2
.next-release-research-20261004-r3
```

## Initial verification and future execution boundary

Read-only checks covered filesystem/block/inode usage, PM2 live and saved paths, Nginx roots,
aliases and upstreams, cron/systemd path references, live/retained application symlink targets,
open-file references, release/build inventories, and hard-link-aware allocated-block accounting.
No cross-release dependency was found in retained application symlinks. No active reference to
the staging directory was found; this does not establish that its source/configuration is redundant.

Before approved cleanup, repeat active/saved PM2, `current`, build-directory, symlink and open-file
checks against the exact candidate paths. Exclude anything newly referenced, retain the protected
paths above, and never follow environment/data symlinks during removal. Cache contents can be
downloaded again; deleted old deployment builds require rebuilding or restoring an archive.

After cleanup, check actual disk recovery and public Helper/community/guild endpoints without
restarting unrelated services. A future deployment retention policy should retain active releases,
independently pinned workers/ingestion, and explicitly chosen rollback copies, rather than merely
keeping the newest directory names. Such automation has not been implemented by this audit.
