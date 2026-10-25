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

### October 25, 2026 profession relationships

Helper web release `kfc-helper-professions-20261025-r1` reads reviewed profession evidence from the
existing community-reference tables. Native item/recipe tables and live-observation tables are not
modified. This is separate from the continuously running raw-reference file publisher above.

Published snapshot `1817234d-4bdd-4eba-9014-51ffc885e2e6` targets the actual published client build
`70532`, not the crawl's older `70450` catalog. Its checksum is
`d023a1f1f27a370a544f1da21127e27813cf459bdd2ed5cd1c36d1ea92442371`. The graph contains 8,131
named entities and 48,598 relationships, including teaching references for 2,046 of 2,228 recipes,
1,643 teaching items and 606 validated coordinate joins. All 65 proposed teaching links and 18
QuestieDB acquisition relationships passed current-build review. Replication permission for the
QuestieDB data was confirmed by the owner on October 25; the pinned revision and the original
`includedAuthored=false` export remain unchanged.

The website distinguishes source-reported relationships, name/description matches, pinned QuestieDB
baselines and actual live trainer observations. It never labels crawled trainers as observed in-game,
invents trainer costs, or treats a shipped recipe as guaranteed available on the realm. Related recipe
names are copied from the exact current client into the reference graph for readable NPC links.
Per-relation provider attribution and coordinate provenance remain separate.

Publication retains the 14-day Forever freshness policy. This snapshot's oldest accepted capture
expires at `2026-11-01T14:18:12.765Z`; readers suppress it after that bound. Re-export/review against a
new client build instead of silently carrying the old build forward. Renew source captures when they
expire; reviewing a record does not reset its capture date.

The repeatable workflow is:

1. `scripts/export-profession-client.mjs --expected-build BUILD --output FILE.json.gz`, using the
   existing protected read-only web database environment.
2. `scripts/review-profession-publication.mjs --client FILE.json.gz --queue QUEUE.json
--reconciliation REPORT.json --staging DIRECTORY --questie PINNED_EXPORT --output BUNDLE.json`.
   The Questie export checksum must match reconciliation. All original captures remain unchanged.
3. `scripts/publish-profession-reference.mjs --mode review|publish|withdraw --bundle BUNDLE.json
--client FILE.json.gz --expected-checksum CHECKSUM --expected-file-sha256 SHA256`, using the existing
   protected owner database environment. The importer verifies the separate relation artifact too,
   refuses a changed current build, and requires at least 8 GiB free disk for review/publication.

The production importer is isolated at
`/home/wow-trader-system/shared/operations/profession-publication-20261025/runtime/`; it contains the
validated import-library revision, independently of the immutable web bundle. Publication is atomic
and repeat imports are idempotent. Replacing this source holds its preceding published revision
instead of combining duplicate revisions. `withdraw` returns only the checksum-matched snapshot to
review; it does not delete evidence or modify native data.

Current published coverage deliberately leaves 182 recipe-learning identities and 368 teaching-item
acquisition sources unresolved, with 25 conflicting/unused item records held. The original crawl
reports still describe unmodified captures, so their gap counts are not the current-build published
coverage counts. The 11 ambiguous and 134 unmatched recipe-item identities remain review work;
missing evidence is not interpreted as removal. Another 70 of the 676 fetched NPCs lack usable
baseline coordinates. These gaps need specific identity/location evidence, not another blind crawl.

Reference-only NPC/object pages without coordinates or corroborating live observations remain
`noindex` and outside sitemaps. The current Forever catalog sitemap includes the 606 coordinate-backed
NPC pages; the unplaced World Fishing Trainer stays excluded. Existing item indexing gates remain
unchanged.

Only Helper web restarted. Ingestion, raw-reference publishing, the stopped crawler and simulator
selections stayed unchanged. Deployment receipts and rollback controls are under the same protected
operations directory. No credentials were copied into source or public artifacts.

Verification passed: 33 focused crawler/publication tests, 19 world-data tests, 14 focused web tests,
typechecks, targeted lint and the isolated production build. Live Playwright checks passed for all
12 desktop/mobile cases at 1440px and 390px, covering recipes, items, coordinate-backed and thin NPC
pages, and TBC separation. Checks included HTTP status, self-canonicals, indexing directives, loaded
images and horizontal overflow; screenshots were also reviewed. Sampled native recipe payloads
retained their pre-publication hashes. The browser receipt and screenshots are under
`artifacts/reference/profession-publication-20261025/browser/`.

Storage recovery removed only rebuildable compiler/npm caches and one verified unused release,
`public-navigation-20261019-r1`. Its temporary archive was compared against the original before
removal, then deleted locally at the owner's request on October 25. No archive of that release is
retained. Future verified unused release cleanup should delete those copies without archiving them;
active, process/symlink-referenced and current rollback releases remain protected.

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
