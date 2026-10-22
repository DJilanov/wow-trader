# Tool usage measurement

## Scope

This is separate from page views, outbound link intent, real-user performance monitoring and native community signups. It records successful browser actions, not unique users, Discord joins, attended raids, gameplay, completed purchases or revenue. No identity is carried between Helper and Discord.

| Action                        | Actual trigger                                                                                           | Does not count                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `leveling_setup_saved`        | A player explicitly saves a character setup and its workspace is successfully written to browser storage | Browsing, automatic restoration, shared-link import, backup import or a failed storage write                           |
| `talent_build_saved`          | A nonempty valid build is written to browser storage                                                     | Opening talents, allocating a point, copying a link, restoring a build or a failed save                                |
| `market_item_watched`         | A new watchlist entry is successfully persisted                                                          | Restoring, removing or clearing entries, or a failed storage write                                                     |
| `crafting_calculation_loaded` | A player opens calculation details and a successful, validated calculation response loads                | A collapsed row, failed request or arbitrary row click. This is not proof of a fresh market scan or a profitable trade |
| `simulation_completed`        | The engine emits its successful-result event and the current same-origin simulator frame notifies Helper | Frame readiness, a Run click, progress, previous results, an error or a cancelled run                                  |

The first, second and fifth actions currently belong to Forever only. Market/watchlist and crafting actions distinguish Forever from TBC.

The versioned `completionBridge=events-v1` HTML presentation adapter imports the existing release's checksummed `preset_utils` module before its entry module. It identifies the simulator by its public method contract, subscribes once per instance to `simResultEmitter` on the first simulation call, and preserves the original method arguments, return values, promise identities and exceptions. It never reads results or changes requests, defaults, storage or engine files. Missing/ambiguous contracts fail measurement rather than the simulation. Browser privacy preferences are checked in both the adapter and host collector. Bare immutable engine URLs remain unchanged; adapter HTML has its own ETag and full-URL cache identity, like the existing raid-default adapter.

This avoids rebuilding or requalifying numerical models just to add measurement. Do not republish reviewed builds, replace the artifact root or regenerate tier snapshots for this presentation change. Verification must cover every selected release/profile, exact request bytes and fixed-seed results with/without the adapter, success/error/cancellation behavior, navigation/readiness, and unchanged artifact hashes. A newer engine that already contains the compiled workspace bridge needs a duplicate-emission review before rollout; a marker search alone does not prove runtime coverage.

## Data boundary

The strict `tool-usage.v1` report contains only a release label, one of the five actions, game edition and coarse mobile/desktop category. Extra fields are rejected. The server requires the report's release to match the configured release. No raw URL, query, referrer, character, item, price, build allocation, user ID, session ID, cookie or IP address is read or stored by this counter.

The browser respects Do Not Track and Global Privacy Control, omits credentials and the referrer, and does not create analytics storage or cookies. Each action/edition pair is suppressed for 30 seconds within one page runtime. This is burst suppression, not a distinct-person calculation; another tab or later page runtime can report another action. Fetch failures do not change a tool's successful operation and are not automatically retried.

The server folds accepted actions directly into bounded daily UTC aggregates. Individual event timestamps are not retained; the aggregate's last-update time is rounded to a minute. Groups are bounded at 256 and daily counts at 1,000,000. Requests are limited to 1 KiB and 120 per process/minute, with a maximum 32 queued writes. These limits can omit actions during overload and are not evidence of low demand.

Files are mode 0600, with newly created directories mode 0700. An atomic directory lock coordinates independent writers; a same-directory temporary file and rename avoid half-written aggregates. Corruption and linked daily files fail closed rather than resetting counts. The newest 90 UTC dates are retained; collection prunes older date-named files on its next successful write. Non-date files and directories are not removed. Hosting security/access logs remain a separate data flow and can contain request metadata.

## Activation

Disabled by default. Use the protected web environment, never a public environment variable:

```dotenv
TOOL_USAGE_ENABLED=true
TOOL_USAGE_ROOT=/home/wow-trader-system/shared/seo/tool-usage
TOOL_USAGE_BUILD=the-actual-release-name
```

Create the protected directory for the existing web process's OS account. Supply the same settings during the Next build and at runtime. The deployment script supplies the current release label to the build; activation rejects a missing/mismatched runtime label, an unavailable directory or a static Forever page without that exact compiled label. No migration, Discord credential or additional analytics secret is needed.

Before activation, verify the published privacy notice, normal tool saves, browser privacy controls and a controlled local ingestion/reporting cycle. Never send synthetic actions to the production root just to produce a dashboard count. Keep the feature disabled if the engine or consent/privacy deployment is not ready. `TOOL_USAGE_ENABLED=false` stops ingestion immediately; already open or static pages may still attempt requests, but disabled ingestion does not persist them.

If `.writer-lock` remains after a crash, stop all writers using that root, establish that none is running, inspect the last daily aggregate and any temporary file, then remove only the abandoned lock directory. Never remove a lock merely because a request timed out; a slow writer may still own it. After recovery, verify a successful write in an isolated directory before restoring the live writer. Do not reset or overwrite the existing daily JSON.

## Read-only report

```sh
node scripts/tool-usage-report.mjs --root=/protected/tool-usage
```

The default is the last seven complete UTC dates. An explicit range is also supported:

```sh
node scripts/tool-usage-report.mjs --root=/protected/tool-usage --from=2026-10-15 --to=2026-10-21
```

The report separates action/edition/device, lists release labels, and identifies missing days. Missing files mean unknown collection, not proven zero use. Including today requires an explicit range and is marked partial. Corrupt or misdated records fail the report rather than silently lowering totals. It reads at most 90 days and does not alter counts or publish anything.

Compare these counts with native event signups and recruitment submissions as separate aggregates. There is no compatible person-level join key. Native repeat signups do not establish attendance, and a contact-link click is not a confirmed guild enquiry. Production observations still need a complete collection period after an approved release.
