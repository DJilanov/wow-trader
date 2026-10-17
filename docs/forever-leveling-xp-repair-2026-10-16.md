# Quest metadata and XP renderer repair — October 16, 2026

## Cause and scoped fix

The priority crawler stopped at 1,133/1,419 on quest 2866 at 05:09:42 UTC with
`Quest XP metadata identity mismatch`. A permitted capture shows the requested ID and canonical
edition are correct. Its primary name is `The Ruins of Solarsal `, including a trailing space,
while the HTML heading is trimmed. The fix trims surrounding quest metadata/Gatherer name
whitespace to match that boundary. It does not accept a different name, ID or edition.

Separately, 124 numeric records were held for a changed core-script revision. Source core
`global-core.js?25318d8a` has full SHA-256
`25318d8aafded7f7b7da8385f81a9aaee35fb1470007119d3c31f8d5dee8a1a8`.
Static Acorn inspection found unchanged function bodies:

- `roundQuestXp`: 81 bytes, SHA `d2d2b79f00dba1e3978785d683225f8a430c5768a75035051cd39f4982ad8f85`.
- `getMaxPlayerLevel`: 171 bytes, SHA `ae0588a6d0eff97ecb1ed8c0bbf9cbc43ed5488ba4e4ceb8da1abbea36612298`.

The current quest script still has full SHA
`5f36c4ad6b8159cef34450542f3264c877c07f2c1c2079815ade2fd712101bdf`; its scaling/rounding order is
unchanged. Only the verified `quest-5f36c4ad-core-25318d8a` pair was added to the existing allowlist.
Scripts were parsed as data, never executed. Unknown future renderers still hold numeric rewards.

Capability is `wowhead-quest-xp-20261016-v3`, with explicit v1/v2/v3 reader compatibility. Known
available facts remain cached; old unknowns can refresh once, and current-v3 unknowns are cached.
Neither a missing payload nor an unsupported renderer becomes zero XP or an estimated multiplier.

## Deployment and evidence

- Web/publisher: `kfc-helper-xp-reader-20261016-r10`, Next build `cI5AXKYrvutnEVG7KfJty`.
  This is the actual combat-r9 baseline plus parser, contracts, quest-XP tests and a minimal
  quest-2866 fixture. Unrelated worktree changes, market data and the private combat import
  were not deployed. No dependency/lockfile change or database migration was needed.
- Compatible readers were activated before writing v3 evidence. The captured page was reprocessed
  offline using the original 06:56:05.660 UTC capture and SHA
  `9375901e3a2dbb971e45f728e73292f0172679e85d1d7edd9814e638e1a4ffa8`.
  Quest 2866 published as 2,700 XP at 07:05:16 UTC with its level-dependent table and no issues.
  No reward was inferred from an unscaled historical table or multiplied twice.
- Worker: `crawl-20261016-r9-xp`; its new bundle retains full archive orchestration. No concurrent
  crawler was started. Only Helper web/publisher and the previously stopped reference crawler
  were reloaded/started; ingestion remains PID 1169337. New PIDs: web 3041619, publisher 3041638,
  crawler 3041944. Credentials/environment files, guild/community apps and player saves unchanged.
- Six diagnostic requests used the same durable one-minute HTTP gate while the worker was stopped:
  Wowhead robots, quest's initial/canonical pages, CDN robots and two script assets. CDN robots
  returned 404; no challenge, access denial, redirect restriction or cooldown was bypassed.
  Private raw diagnostics are retained only in the protected backup, not public data or Git.
- Local checks passed: 78 reference tests, 220 web tests, 3 archive/recovery CLI tests, strict
  TypeScript, lint, package build, focused formatting and diff checks. Linux checks passed:
  76 reference tests, 220 web tests, lint/types and optimized webpack build with 59 static pages.
  Private/public Chrome tests passed real published XP, per-player levels, refresh/continuation,
  unchanged actual saves, mobile overflow and axe accessibility.
- Final public smoke checks returned HTTP 200 for Forever home, the Alliance human premade
  route, both Forever/TBC traders and Forever data status, without catalog-review/database-error
  screens. Stopped the private preview PID 3041410 and its local SSH tunnel after testing.
  Removed only r10's generated `.next/cache` (233 MiB); standalone/static/runtime files and
  protected backups remain intact. No previous release or user data was deleted.

## Backfill and progress inspection

Backup: `/home/wow-trader-reference-worker/backups/20261016-xp-repair.QgDGAy/`, containing the old
staging/queues/checkpoints plus a checksum-validated snapshot of all 1,129 published records.
The original published snapshot had 1,002 available and 127 unknown facts. The new recovery queue
is exactly those 127 unknown IDs; it does not recrawl available rewards or reset priority progress.

```text
/home/wow-trader-reference-worker/shared/queues/forever-xp-recovery-c24804d2afe7a3ce.json
/home/wow-trader-reference-worker/shared/queues/reference-crawler-recovery-v3.config.cjs
/home/wow-trader-reference-worker/shared/recovery-xp-c24804d2afe7a3ce-status.json
```

Queue SHA: `c24804d2afe7a3ce25d37692957d406602920a5eb0654d9eb6108ac48d63d39d`.
This new checkpoint runs before the original priority queue (still at 1,133), full 2,535-ID archive
and general catalog (still at 746). Both saved priority/base files matched backup byte-for-byte
after restart. The completed 317-ID recovery remains preserved, not reset or overwritten.

At 07:11 UTC, the new checkpoint had advanced to 5/127 with `error: null`. The first three
source pages (5634, 1779, 657) lack numeric scaling payloads and remain unknown. Quest 658
was successfully recovered and published as 2,800 XP with no issues; this verifies the complete
fetch → parse → publish path, not merely an online process. Quest 2866 remains published as
2,700 XP. The old 05:09 identity error in the crawler log is historical, not a fresh failure.

```sh
node /home/wow-trader-reference-worker/current/dist/cli.js status --status /home/wow-trader-reference-worker/shared/recovery-xp-c24804d2afe7a3ce-status.json --staging /home/wow-trader-reference-worker/shared/staging
cd /home/wow-trader-system/current
node scripts/repair-leveling-quest-xp.mjs status --baseline /home/wow-trader-reference-worker/backups/20261016-xp-repair.QgDGAy/baseline --rewards /home/wow-trader-reference-worker/shared/published --expected-unknown 127
```

A processed record is not necessarily a resolved reward. Three original unknowns lacked scaling
configuration; some source records may remain unknown even after the renderer repair. Future
source changes still fail safely. Collection completeness is not proof of a funded/playtested route.

## Safe stop and rollback boundary

Stop only the reference crawler with `pm2 stop kfc-helper-reference-crawl` if source access or
validation fails. Preserve all checkpoints, pacing state, locks owned by running processes and
the immutable published records. Never reset a cursor or run a second worker to accelerate it.

**Do not downgrade to v2-only readers/workers after v3 facts exist.** Retain r10's compatible
reference reader when rolling back unrelated UI work. Use the backup to investigate/rebuild a
compatible release, not to erase newly published legitimate facts. Resume the reviewed worker via
the v3 wrapper only after inspecting the saved failure; PM2 autorestart remains disabled.
