# Reference crawler source recovery — October 17, 2026

## Incident

The active full-archive phase stopped at cursor 478 of 2,535 while requesting
`forever-quest-581`. The prior record, quest 580, was complete and the exact quest 581 checkpoint
was preserved. The priority XP queue (1,419/1,419) and v3 recovery queue (127/127) were already
complete. The publisher remained online.

The saved error and a direct reproduction from both the production host and a separate local
network returned the same HTTP 403 CloudFront response. Disk, staging size, queue identity, parser
state and PM2 memory were healthy. Wowhead robots policy still allowed the individual Forever quest
path. This was an upstream access denial, not a corrupt checkpoint or a production-host-only block.
The extracted client `QuestXP` table cannot substitute for this source because it contains
level/difficulty curves, not the per-quest reward binding.
The browser/crawler comparison and source-owner handoff are documented separately in
[the browser access issue](wowhead-browser-access-issue.md).

## Recovery behavior

Release `crawl-20261017-r10-source-wait` adds an opt-in managed-worker policy:

- `--wait-on-source-cooldown` converts HTTP 403 into a durable source cooldown;
- a source `Retry-After` is honored; without one, the cooldown is six hours;
- the job remains online in `waiting` state with an ISO `retryAt` and the exact `currentKey`;
- the same checkpoint is retried after the cooldown, with the existing declared crawler identity,
  robots check, 72–90 second navigation gate, durable 50-start rolling-hour cap and single-worker lock;
- cooldowns over 24 hours, invalid state, robots denials, challenges, parser failures and storage
  failures still stop for operator review.

The standalone bounded crawler and workers without the new flag retain their prior fail-closed 403
behavior. The change does not rotate proxies or identities, add cookies, impersonate a browser,
skip denied records, clear pacing state or bypass access controls.

## Production receipt

- Active release: `/home/wow-trader-reference-worker/releases/crawl-20261017-r10-source-wait`
- Previous release: `/home/wow-trader-reference-worker/releases/crawl-20261016-r9-xp`
- Active launcher:
  `/home/wow-trader-reference-worker/shared/queues/reference-crawler-recovery-v3.config.cjs`
- Deployment backup:
  `/home/wow-trader-reference-worker/backups/20261017-source-wait.qpHEOB`
- PM2 application: `kfc-helper-reference-crawl`, one instance, `autorestart: false`

At 06:21:29 UTC the live source again returned HTTP 403. The worker remained online with zero new
PM2 restarts and saved:

```text
state: waiting
cursor: 478 / 2535
currentKey: forever-quest-581
lastCompletedKey: forever-quest-580
retryAt: 2026-10-17T12:21:29.888Z
error: Source access denied: HTTP 403; cooldown saved without bypassing access controls
```

The pacing sidecar has the same `notBefore` timestamp. No staged or published record was changed by
the denied request. PM2 state was saved after activation.

## Verification

- TypeScript typecheck: passed.
- Focused pacing, crawler and job tests: 35/35 passed.
- Reference-data lint: passed.
- Reference-data production build: passed.
- Full reference-data test run: 79/79 passed after restoring the development Mac above the
  publication worker's intentional 8 GiB free-disk reserve.
- Deployed CLI/config checksums matched the local build and passed Node syntax checks.
- Live PM2 arguments include the unchanged v3 recovery, priority and archive paths plus
  `--wait-on-source-cooldown`.

## Operations and rollback

Inspect without changing state:

```sh
node /home/wow-trader-reference-worker/current/dist/cli.js status \
  --status /home/wow-trader-reference-worker/shared/archive-xp-336bb641f1c6e5a6-status.json \
  --staging /home/wow-trader-reference-worker/shared/staging
pm2 describe kfc-helper-reference-crawl
```

Stop safely with `pm2 stop kfc-helper-reference-crawl`. Do not delete `.request-pacing.json`, alter
the checkpoint or start a second worker. Before rolling back code, stop the worker and preserve the
current checkpoint. The r9 reader predates the `waiting`/`retryAt` status fields, so an r9 rollback
also requires restoring an r9-compatible checkpoint after review; switching only the `current`
symlink is not sufficient. The prior launcher and release pointer are retained in the deployment
backup above.
