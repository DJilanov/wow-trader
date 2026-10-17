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
