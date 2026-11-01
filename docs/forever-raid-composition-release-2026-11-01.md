# Forever raid composition release — November 1, 2026

Live planner: <https://kfcguild.online/tools/forever/raid-composition>.
The owner reviewed the local product and authorized commit, push and deployment.

## Active sources

- Helper application: `bc5b7359ac23ce022fad78ce1270bfc6815937dd` (`bc5b735`), source
  `/home/wow-trader-system/releases/kfc-helper-raid-composition-20261101-bc5b735`, Next build `WicyTmClgRTnaAY05NIJa`, activated
  `2026-11-01T08:05:04.459Z`. Its matching compressed static-delivery label is
  `kfc-helper-raid-composition-20261101-bc5b735`.
- Discord raid-manager integration: `ef4cc40f7c1c56d89051968c9d2b6ce3febb69a7` (`ef4cc40`), source
  `/home/wow-forever-discord-source-releases/raid-composition-20261101-ef4cc40`, build `build-TfctsWXpff2fKS`, activated
  `2026-11-01T07:54:21.255Z`.
- Initial feature commit `820aa1e`; approved damage-default updates `f1eec22`
  and `ef4cc40`; explicit Node tooling imports `aac4acb`; visible numeric input
  widths `bc5b735`. All were pushed before their applicable source release.
  Later documentation-only updates do not require an application restart.

The release adds 10/20/40-player class/spec compositions, five-player parties,
Warrior/Sunder duty, shared support, legal blessing/curse assignments, lock/move,
reference-led suggestions with preview/apply, saving and anonymous share links.
The raid manager uses the same versioned support registry and links to the
appropriate planner size. Independent TBC rules remain.

## Final encounter defaults

| Players | Boss health | Raw physical boss DPS |
| ------- | ----------: | --------------------: |
| 10      |   1,100,000 |                 2,500 |
| 20      |   2,200,000 |                 5,000 |
| 40      |   4,000,000 |                10,000 |

The owner confirmed that DPS is **before** tank mitigation. Values remain editable
and are stored in anonymous drafts. Damage, player/pet threat, selected and maximum
reference tank TPS, useful healing, estimated kill time, tank health/armor,
mitigated damage, healing allocation/cadence and theoretical death risk are shown.
Boss damage changes the survival stress model; the retained outgoing DPS/TPS
benchmarks are not resimulated when that input changes.

The numeric inputs have explicit widths after a live visual check found the
shared 85px count-control rule clipping long health values. The final browser
regression checks their rendered widths as well as 320px layout containment.

## Numerical interpretation

The product sums retained October 28 individual benchmark means as clearly labeled
historical full-support reference estimates. It does not claim a qualified new-
hotfix coupled raid simulation or current global optimum. DPS already includes
pet damage, so it is counted once; pet threat remains separate from player TPS.
Missing healer damage/threat is not invented. Healing references describe capacity
under separate workloads rather than guaranteed combined healing delivered.

Death risk is a bounded illustrative physical model with source-bound incoming
attack categories, per-outcome mean damage, healing/absorb-equivalent pulses,
selected main tank, 50% default tank-healing allocation and a 95% sampling interval.
It excludes boss spells, within-outcome damage spread, correlated cooldowns,
interruptions and mana exhaustion. A zero observed death count displays its upper
sampling bound rather than a survival guarantee. Mechanics/source qualification
and private player/alt roster application remain later phases.

## Verification

- 72 Helper and 35 Discord unit/regression tests passed. Final default-only changes
  also passed all 45 focused composition/survival/rendering cases.
- Strict/scoped TypeScript, scoped ESLint and formatting passed. The two small
  operational scripts passed lint and their actual extraction/sync commands.
  Re-extraction reproduced both committed metric files byte for byte; no new
  native optimization search was run.
- Both complete Linux production builds passed, including TypeScript. Existing
  nested bridge-worker dependencies must be retained when cloning the community
  source. Its webpack build handles the existing external dependency symlink;
  Turbopack rejected that symlink. Reuse the already generated matching Prisma
  client rather than running generation against shared dependency storage.
- Final private candidate and public Chrome checks passed 24 cases each: sizes,
  defaults, numeric values/kill-time calculation, death-model response, HPS,
  locks, last-Warrior protection, keyboard/native moves, undo, comparison/apply,
  stale proposal cancellation, share/restore and 1440/390/320px layouts.
  No browser exceptions or failed script/style/image/font responses were seen.
- Ten public routes returned their expected status, including anonymous raid API
  401 and the KFC calendar feed. The legacy Helper URL permanently redirects to
  the new planner. The real catalog has 32 references, 28 player threat counters,
  three bound incoming tank models and four single-target healer references.
- Static delivery passed its existing raw/compressed integrity, Nginx, gzip/MIME,
  caching and private-file denial checks. All 29 released source files were
  rechecked after activation against their committed checksums.
- Only Helper web and community web were deliberately restarted. Ingestion,
  the native raid worker and the guild application retained their process IDs.
  An unrelated CV API performed a separate rolling restart around 08:00 UTC;
  it remained online and was not controlled by this release.
- Temporary candidate servers/tunnel were stopped. Approximately 10.84
  GiB remained free. No migration, signup, roster publication or Discord DM was
  created by the smoke checks. Authenticated organizer browser actions were not
  exercised against a real raid; the scoped rules passed their unit checks and
  authenticated API boundaries remained closed to anonymous requests.

## Receipts and rollback

Server operations:
`/home/wow-trader-system/shared/operations/raid-composition-20261101/` and
`/home/wow-trader-system/shared/operations/raid-composition-inputs-20261101/`.
Local receipts/screenshots are in the corresponding `artifacts/` directories.
The integration is the exact-baseline, checksum-pinned overlay committed under
`infra/raid-composition/`; it excludes unrelated concurrent signup editing.

Immediate Helper rollback: restore `/home/wow-trader-system/releases/kfc-helper-raid-composition-20261101-ef4cc40` and
`/home/wow-trader-system/shared/static-delivery/releases/kfc-helper-raid-composition-20261101-ef4cc40`, plus the two previous public build-label environment
lines from `helper-activation.json`. Restart only `kfc-helper-web` and use the
existing static-delivery activation controller; recheck health/assets before
saving PM2. Preserve all other environment values and shared data.

Discord rollback: reactivate `/home/wow-forever-discord-source-releases/kfc-calendar-20261101` with
`.next-release-kfc-calendar-20261101` using its existing named PM2 definition. A new definition
must retain the correct cwd and build directory; `pm2 reload` alone can preserve
an old cwd. Do not restart the raid worker or roll back the database.
