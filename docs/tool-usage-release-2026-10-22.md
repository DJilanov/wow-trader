# Anonymous Tool Measurement Release

## Approved Scope

The owner approved a UI-only simulator completion adapter and anonymous action
collection only after the complete verification gates pass. The numerical engines,
item data, reviewed builds, presets and saved browser state must remain unchanged.
No synthetic data may enter production totals.

Candidate source: `9c7aa0f8e7341bbafb08b5c565009e2cd7cf8188`, following the initial
`3329310` implementation. The scoped source is reachable from the pushed `main`
merge `dbd3be3`; unrelated numerical research on `main` is not part of this deployment.

Status: deployed and publicly verified. Collection was enabled on October 22,
2026 at 15:58:57 UTC. Only `kfc-helper-web` restarted; protected sibling processes
and simulator pointers remained unchanged. The private preview was stopped.

Active release: `kfc-helper-tool-usage-v2-20261022-9c7aa0f`.
Next build ID: `cksWCEFwW5yvr8O6iilqc`.
Artifact root remains
`/home/wow-trader-system/shared/simulator-releases/results-20261022-2489a71`.

## Implementation

The existing immutable runtime files are served unchanged. A distinct
`completionBridge=events-v2` HTML variant imports the same runtime module before
the entry module. It observes successful result events only for active calls,
deduplicates notifications and suppresses runs whose cancellation was requested,
including late successful engine results. It does not make native cancellation
faster or alter the engine's returned result. Original promises, arguments,
receivers and errors are preserved.

Internal numeric event IDs are retained only in a bounded in-memory map for pending
calls, never reported or stored. The envelope remains the strict two-field
completion notification. The host folds five successful tool actions into daily
UTC aggregates by release, edition and coarse device category. No account,
character, browser/session identifier, item, raw URL, IP or build allocation is
part of those aggregates. DNT and GPC apply to both the bridge and collection.

## Release Gates

- Exact source verification against 1,427 committed Git blobs.
- All 49,265 existing artifact files verified against the frozen manifest,
  including numerical assets, databases, presets, reviews and tier data.
- Actual fixed-seed WASM runs for all 23 published builds: identical request bytes,
  results and browser storage with and without the final adapter.
- All ten selected runtimes: success, missing-target validation failure,
  cancellation-request suppression with the native outcome recorded separately,
  logs, DNT and GPC. The first adapter failed the late-cancellation boundary and
  was never activated; the second adds the explicit guard rather than waiving it.
- All sixteen page/frame selections unchanged apart from the presentation query.
- Actual host/iframe/isolated-ingestion checks at 1440, 390 and 320 pixels, plus
  DNT/GPC cases. Two rapid completed runs send one action; privacy cases send none.
  Browser counter requests contain neither cookies nor referrers.
- Isolated HTTP/storage/report checks cover all five actions and both supported
  TBC actions, rejection boundaries, private file modes, partial UTC days and
  missing periods. QA data uses a separate directory.
- Fresh Linux production build, all 1,287 web tests across 148 files, 26
  deployment/report tests, strict TypeScript and full lint. The Linux web run used
  a 15-second per-test budget for the heavy evidence suites; every assertion ran.
  Static delivery verified 48,754 files and 2,608 compressed variants.

After activation the standard public verifier passed all eleven reviewed profiles
and 23 builds. Public browser checks passed at all three widths, including actual
WASM results, the final adapter contract and no horizontal overflow. These
disposable contexts enabled DNT/GPC and additionally blocked non-read HTTP methods;
they attempted no writes and added no production counts. All 49,265 frozen
artifact files passed their checksums again after activation.

The initial read-only production report correctly marks the seven preceding UTC
dates as missing/unknown. There is no historical backfill, identity matching or
synthetic production baseline. October 22 is a partial rollout date, not a complete
observation period. Actual usage and outcomes still require real observations.

Runtime and evidence directories are under
`/home/wow-trader-system/shared/backups/tool-usage-v2-20261022-9c7aa0f`.
The original candidate's receipts remain separate; it is not production evidence
for the final version. Build-generated `next-env.d.ts` is restored from this
candidate's own committed archive after compilation, without changing the bundle.

## Operation

Production aggregation root: `/home/wow-trader-system/shared/seo/tool-usage`.
The feature requires matching build/runtime enablement and release labels. Only
Helper web may restart; native ingest, bots, KFC and community workers remain
unchanged. Deployment must compare source/static selections, relevant settings,
artifact pointers and protected process identities before activation, with the
previous selections retained for rollback. No numerical root is switched.

Read-only report from the active release:

```sh
node scripts/tool-usage-report.mjs --root=/home/wow-trader-system/shared/seo/tool-usage
```

The default report covers the last seven complete UTC dates. Missing days mean
unknown collection, not verified zero demand. Explicitly including today marks
it partial. Counts are browser-reported actions, not unique people, Discord joins,
attendance, completed trades or verified gameplay. Native community participation
and recruitment submissions remain separate measures with no person-level join.

Set `TOOL_USAGE_ENABLED=false` in the protected web environment and restart only
Helper web to stop ingestion. Preserve existing aggregates; do not seed totals,
reset files or steal a writer lock. See `tool-usage-measurement-2026-10-22.md` for
retention, overload behavior, integrity failures and crash recovery.
