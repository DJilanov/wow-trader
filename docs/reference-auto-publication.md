# Continuous reference publication

The isolated source crawler keeps its existing queue, checkpoint, staging store and
72–90 second source-navigation pacing with a durable 50-start rolling-hour cap. A separate `kfc-helper-reference-publish` PM2 worker reads
completed normalized records and publishes in bounded 200-record cycles every minute.
It makes no Wowhead requests and never writes to the native catalog or market database.

## Validation and display

- Validate schema, edition, exact entity identity, freshness and checksums.
- Compare items with the currently published, English client build in a read-only
  transaction. Known name, class, subclass, requirement, primary-stat, weapon-damage
  and speed conflicts are held. This is not exhaustive spell-effect certification.
- Verify quest IDs and known titles against the checksummed current quest artifact.
  Website metadata and sitemap checks also account for current observed titles.
- Quest XP has one narrower exception: a same-edition XP record may publish when its quest ID is in
  the checksum-bound leveling archive queue but absent from the static client task table. A known
  client-title disagreement is still held. This exception feeds the leveling planner only; it does
  not make the external quest reference complete or eligible for search indexing.
- Publish useful matching partial facts with explicit missing-detail labels.
  Unresolved tooltips, placeholders and facts without useful display content stay held.
- Only complete, matching references are eligible for item/quest indexing and sitemaps.
  Client records, tools and pages remain available even without an indexable reference.
- Preserve a newer or complete valid published record when a later fetch is worse.
  Write checksum-addressed files before atomically replacing the manifest. Failed
  validation or publication does not replace the last public manifest.

New/changed staging files and client revisions take priority over routine rechecks.
Persistent per-record signatures avoid unnecessary copying and survive worker restarts.
Routine rechecks become due hourly and run oldest-due-first in bounded cycles; stale or conflicting
references are rejected immediately by website readers regardless of that queue.
The publisher honors the same 8 GiB free-disk reserve as the crawler.

## Configuration

The publisher uses the Helper's existing read-only `web.env` database connection and
`WOW_TRADER_WORLD_SNAPSHOT`, not the ingestion/owner credentials. The PM2 declaration
contains only public filesystem paths. Helper and publisher must both use:

```text
WOW_TRADER_REFERENCE_DIRECTORY=/home/wow-trader-reference-worker/shared/published
WOW_TRADER_LEVELING_QUEST_QUEUE=/home/wow-trader-reference-worker/shared/queues/forever-archive-xp-336bb641f1c6e5a6.json
WOW_TRADER_LEVELING_QUEST_QUEUE_SHA256=336bb641f1c6e5a62ad1c91170d609c9bfbc75c32c1948811bbed6c20784f805
```

Defaults:

```text
/home/wow-trader-reference-worker/shared/staging
/home/wow-trader-reference-worker/shared/published/index.json
/home/wow-trader-reference-worker/shared/published/records/
/home/wow-trader-reference-worker/shared/publication-status.json
```

The status file records each checked identity, complete/partial/held classification
and reasons. These are validation results, not guaranteed Google indexing counts.
Freshness remains 14 days for Forever and 90 days for TBC. Refresh selected records
when necessary; do not bypass source rate limits or freshness checks.

## Operations

```sh
pm2 logs kfc-helper-reference-publish --lines 20 --nostream
pm2 stop kfc-helper-reference-publish
pm2 restart kfc-helper-reference-publish
```

`scripts/reference-publisher.mjs --once` runs one bounded publication cycle with the
same environment. Backfill already-staged facts with successive cycles; do not
restart or reset the source crawler. No schema migration or database writes are needed.

The publication locks are separate from crawler locks. If a crash leaves a lock,
confirm that its saved PID is no longer a publisher process before removing only that
stale publication lock. Never clear a live lock or source pacing/checkpoint files.
Publisher errors are retried on the next cycle without modifying the public manifest.

Deploy from an immutable copy of the active Helper release with only the reference
reader/publisher files overlaid. Verify complete, partial, conflicting and uncrawled
pages, canonical/robots metadata, and both edition sitemaps before switching `current`.
Keep the prior Helper release for rollback. To roll back, stop the publisher, switch
to the previous release and reload only `kfc-helper-web`; leave ingestion, the guild
website, community website and source crawler unchanged.

## Verified production rollout

### October 18, 2026 leveling completion

Release `kfc-helper-leveling-quest-completion-20261018-r1` is active, and the independently managed
publisher has been reloaded with the checksum-bound leveling queue. The queue SHA-256 is
`336bb641f1c6e5a62ad1c91170d609c9bfbc75c32c1948811bbed6c20784f805`. The active Alliance campaign
has available facts for all 619 unique hand-in IDs. Published IDs 308, 1641, and 1645 were verified
against their exact staged records; each is a valid zero-XP quest.

The complete production audit is
`/home/wow-trader-system/shared/reports/leveling-quest-completion-20261018/campaign-xp-audit-a4382a7d60fd3fd3.json`
with SHA-256 `a4382a7d60fd3fd3ab0be71970997fcb063547f65953c6670530b025bcd28ff5`.
Its coverage gate remains false because publication completeness and route feasibility are separate
release gates. The full archive queue is also still incomplete at 1,479 available, 173 unknown, and
883 unpublished records out of 2,535 IDs.

The pre-sync production staging backup is
`/home/wow-trader-reference-worker/backups/20261018-local-quest-completion-164833/quest-staging-before.tar.gz`
with SHA-256 `017c7c9a08c59b890834de9c6e72e3e6fc3a9a3494031af3cb2cc88ceb280f6a`.
No source request was needed for publication, and the crawler remained stopped.

### October 8, 2026 initial rollout

October 8, 2026, 17:47 UTC: Helper release
`kfc-helper-reference-auto-20261008-r1` is active. The publisher is running under PM2,
and its process configuration is saved for reboot. At this checkpoint, 552 records
were published: 366 complete and 186 useful partial references. Another 50 staged
records were held for conflicts or insufficient usable content.

| Edition and entity | Published | Complete | Partial |
| ------------------ | --------: | -------: | ------: |
| Forever items      |       173 |       92 |      81 |
| Forever quests     |       199 |      175 |      24 |
| TBC items          |       180 |       99 |      81 |

The live worker automatically published TBC item 814 after the unchanged crawler
captured it at 17:45:52 UTC. No manual publication invocation, crawler restart or
website rebuild was needed for that new record. The full source queue is still
incomplete, and these counts are not Google indexing results.

Verification passed: 248 unit tests across Helper, reference-data and world-data;
strict typechecks, lint, portable package builds and the production Next build.
Live Playwright checks at 390px and 1440px covered complete, partial, conflicting
and uncrawled pages, self-canonicals, robots metadata, wrapping and five sitemaps.
A regression test verifies that the sitemap's native stat/damage query cannot
mix facts from different item IDs or builds. Temporary preview processes were stopped.

Progress is available in `publication-status.json` and the publisher's PM2 log.
The crawler's separate `status.json` continues to report source fetching progress.
