# Local storage maintenance

Browsertrix keeps disposable browser profiles and crawl work inside its named Docker container. Once the crawl stops, only the archive/pages/reports required for parsing are copied to the host; the container is removed on success, failure, and cancellation. Explicit `BROWSERTRIX_KEEP_ARCHIVE=1` retains the full copied workspace. A forcibly terminated process can leave a container; the scheduled job removes only exited, labeled crawl containers whose owner process is gone, after an hour. It never prunes Docker volumes.

`pnpm clean:storage:preview` lists eligible leftovers. `pnpm clean:storage` applies these policies:

- Inactive `.next-*` preview outputs: 2 GiB and seven days, with a one-hour grace period. The normal `.next` output is excluded.
- Guardian: the deployed release and its rollback. The Guardian lock prevents concurrent pruning during reconciliation or installation.
- Simulation cache: 2 GiB, 500,000 result files, and seven days. Readers/writers hold leases; eviction skips active simulations, ignores fresh files, and runs at most hourly after simulation batches.
- Intermediate `campaign-xp-audit-*` reports: the three newest per workflow across dates. Approved/published reports, reference/final workflows, and files referenced by source or documentation remain protected. Associated evidence backlogs and migration backups are not part of this policy.
- Generated numeric game-build media/world snapshots: the newest two builds plus the Guardian's current build and referenced paths. Catalog definition directories retain the newest two plus referenced/current manifests. Unknown directory names are excluded.

Put a `.storage-keep` file in a directory to protect it and its descendants from report/build/snapshot pruning. Protected, open, or fresh data can exceed the size budgets. Cleanup rejects symlinked candidate paths. Keep necessary historical evidence referenced in version-controlled documentation or protected by this marker.

Build wrappers clean previews after completion, Guardian installation prunes releases after activation, and audit generation prunes intermediate reports after writing a result. The hourly macOS agent performs daily retention when producers are idle, and weekly `pnpm store prune` under the same idle check. It does not launch Docker if Docker is stopped.

Install with `pnpm storage:install:macos`. The agent runs the scripts from this checkout using the current Node binary; reinstall after moving the checkout or removing that Node version. Records live in `~/Library/Logs/DeveloperStorageMaintenance/`, with at most 720 hourly samples. Each sample records free space and the logical size of unique deleted-but-open files visible to the current user. Daily folder totals identify subsequent growth. Notifications trigger below 20 GiB free or above 1 GiB/hour of measured loss, with a six-hour cooldown. Deleted-file logical sizes are diagnostic estimates, not promises of physical space recovery.

To disable: `launchctl bootout gui/$(id -u)/online.kfcguild.storage-maintenance`, then remove `~/Library/LaunchAgents/online.kfcguild.storage-maintenance.plist`. This leaves the bounded monitoring records and project-level cleanup hooks intact.

Verification: `pnpm storage:test`, plus the reference-data crawler tests and typecheck. A 24-hour monitoring window is needed to establish whether background growth has stopped.
