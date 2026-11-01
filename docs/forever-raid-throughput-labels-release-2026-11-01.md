# Composition simulation labels — November 1, 2026

Live: <https://kfcguild.online/tools/forever/raid-composition>.

- Pushed runtime source: `e077cad8738f315b2b1b38dd9a3b133a78604826`.
- Source release: `/home/wow-trader-system/releases/kfc-helper-raid-composition-20261101-e077cad`.
- Build: `AFYJvK25nOyVtVai8QzDn`; activated `2026-11-01T09:02:28.220Z`.
- Matching static delivery: `kfc-helper-raid-composition-20261101-e077cad`.

Each of the 32 class/spec rows, each selected roster seat, and every build option
shows the one-player saved simulation number before DPS, TPS or HPS. Tank TPS
comes from the active calculated pre-raid mitigation build; healer HPS is useful
healing throughput. No alternate threat-build number or tank DPS is substituted
for TPS. Missing measurements say Unmeasured. Seat counts remain separate, and
changing a build updates its number and unit. Existing dated-reference labels,
raid calculations, boss defaults and saved compositions retain their behavior.

Verification passed: 61 focused tests, scoped strict TypeScript, scoped lint and
formatting, plus the complete Linux production build with TypeScript. Both the
private candidate and public release passed 31 Chrome checks each, covering all
32 rows/options, all seats at 10/20/40 players, changing roles, selected-main-tank
references, trash assignments, navigation, sharing, locks and widths 320–1440px.
There were no browser exceptions or failed asset responses. A full local typecheck
also encountered two unrelated unfinished leveling export mismatches; that work
was preserved and excluded from the committed production overlay.

All 8 overlaid files matched committed hashes after activation. Only Helper web was
restarted by this release; ingestion, the guild website, community website and
raid worker retained their PIDs and stayed online. An independent `ai-cv-api` PID
change was observed and recorded; no action was taken on that application.
No database migration, signup, Discord message or new native optimization ran.
Private preview and SSH tunnel are stopped. Remaining free space: 9.21 GiB.

Receipts: `artifacts/raid-throughput-labels-20261101/deployment/` locally and
`/home/wow-trader-system/shared/operations/raid-throughput-labels-20261101/` remotely.

Rollback source: `/home/wow-trader-system/releases/kfc-helper-raid-composition-20261101-8a6d6ff`.
Rollback static delivery: `/home/wow-trader-system/shared/static-delivery/releases/kfc-helper-raid-composition-20261101-8a6d6ff`.
Restore the two previous public build-label lines recorded in
`helper-activation.json`, restore the source pointer, restart only
`kfc-helper-web`, then use the existing static-delivery activation controller to
restore the prior delivery. Recheck health/assets before saving PM2; preserve all
other environment values and applications. The preceding feature release is
[documented separately](forever-raid-trash-roles-release-2026-11-01.md).
