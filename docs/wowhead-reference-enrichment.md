# Permissioned Wowhead reference enrichment

October 7, 2026. The owner confirmed crawler permission, not an API/export entitlement.
The crawler is deployed as an isolated production worker. Continuous publication is implemented
separately from crawling; see [the publication runbook](reference-auto-publication.md) for validation,
partial display, index eligibility and rollout. Native database rows are not overwritten. KFC
recruitment and the neutral WoW Forever community keep their own Discord destinations.

## October 17: durable recovery from the quest 581 source denial

The full-archive worker stopped at 478/2,535 because Wowhead consistently returned HTTP 403 for
quest 581 from both production and a separate network. Release `crawl-20261017-r10-source-wait`
preserves that exact checkpoint and now waits six hours between access-denial retries instead of
remaining permanently stopped. The first live retry entered `waiting` until 12:21:29 UTC without
skipping a record or changing crawler identity. Diagnosis, implementation boundaries, production
receipt, verification and rollback constraints are in
[the October 17 source-recovery receipt](reference-crawler-source-recovery-2026-10-17.md).

## October 16: whitespace identity repair and v3 renderer/backfill

Active web/publisher reader is `kfc-helper-xp-reader-20261016-r10`, accepting v1/v2/v3 facts.
Worker `crawl-20261016-r9-xp` uses a fresh 127-ID unknown-reward recovery checkpoint before the
unchanged priority/full-archive/base queues. Quest 2866's metadata had a trailing name space;
surrounding whitespace now matches the already-trimmed heading without accepting another ID/name.

Core revision `25318d8a` was independently reviewed: rounding/level-cap bodies match the previous
reviewed core, and quest script `5f36c4ad` is unchanged. Only that exact pair is added, not arbitrary
future hashes. Compatible readers went live first. The original captured quest 2866 has already
published at 2,700 XP, preserving its source SHA/time. Source gaps may still remain.

**Retain v3-compatible readers/workers after new records exist; r9/v2-only rollback is unsafe.**
Current recovery status, backup, SHA proofs, deployment/tests and safe stop/resume guidance:
[October 16 repair receipt](forever-leveling-xp-repair-2026-10-16.md).
The status/active-release labels below are historical snapshots, not the current phase.

## October 15 follow-up: distinguish active progress from a historical base checkpoint

Current worker is `crawl-20261015-r8-full-archive`: recovery → priority → full archive → base.
Helper web is combat r9, preserving the v2 reader; the running publisher retains its compatible
reader. Release labels in the earlier rollout sections below are historical receipts.

The base `shared/status.json` retains its October 13 `blocked` state at cursor 746 while earlier
phases run. That is not the current pipeline's health. The active job owns `staging/.job.lock`,
whose `statusPath` identifies its checkpoint. At 16:34 UTC priority was running at 725/1,419,
without errors; recovery had completed. The archive checkpoint is created only when its phase starts.

The deployed crawler already handles quest 260's exact same-edition/id not-found HTTP 301 without
following its listing, and the job resumes legacy blocked checkpoints at their saved cursor.
Both compiled source-map hashes matched the tested source. A new regression proves that complete
phase sequence, safe quarantine, continued processing and preserved counts. All 71 reference-data
tests pass. No restart, checkpoint reset, extra source request or new production rollout was needed.
Do not clear history or weaken redirect checks; a different future redirect must still stop.

For the currently active phase, use this read-only command (change the status path when its phase
changes), rather than interpreting the base checkpoint as a live failure:

```sh
node /home/wow-trader-reference-worker/current/dist/cli.js status --status /home/wow-trader-reference-worker/shared/priority-xp-1e25e00fcd345e03-status.json --staging /home/wow-trader-reference-worker/shared/staging
```

## October 15: verified renderer repair and the 298-record recovery

Active readers: `kfc-helper-xp-repair-20261015-r8` (web + publisher). Active isolated worker:
`crawl-20261015-r7-xp-repair`. The original snapshot at 08:01:28 UTC has 626 checksummed records,
328 available and 298 unknown. All 298 unknowns have primary quest/minimum levels; the old
`missing_primary_quest_dataset` diagnostic was a consequence of its combined condition, not proof
that metadata was absent. A permitted capture of quest 4811 confirmed the changed core asset.

Reviewed primary assets (SHA-256):

- `https://wow.zamimg.com/js/global-core.js?52d4f803`:
  `52d4f803602b6932b2ffe02d0fe582fa0d98673cd88e60d49e9e4df0d03e3701`
- `https://wow.zamimg.com/js/global-core.js?97211824`:
  `9721182430cd627f42a37be85aebc3370fa61430639555260365391fdeb17ed1`
- `https://wow.zamimg.com/js/quest.js?5f36c4ad`:
  `5f36c4ad6b8159cef34450542f3264c877c07f2c1c2079815ade2fd712101bdf`

Literal AST inspection found byte-identical `roundQuestXp` function bodies (SHA
`d2d2b79f00dba1e3978785d683225f8a430c5768a75035051cd39f4982ad8f85`) and max-player-level
function bodies (SHA `ae0588a6d0eff97ecb1ed8c0bbf9cbc43ed5488ba4e4ceb8da1abbea36612298`)
between core versions. The unchanged quest renderer establishes the multiplier, reduction and
rounding order. Only those two exact renderer pairs are accepted, not arbitrary hash changes.
Unverified future renderers remain unknown with null `rendererRevision`; never infer XP from
comments, Classic level tables or a global Forever multiplier to make this report pass.

Parser capability is `wowhead-quest-xp-20261015-v2`. Readers retain v1 support, and previously
available/conflicting facts remain protected. An old unknown gets one version-aware refresh;
a current-v2 unknown is cached rather than continuously retried. Refresh starts from the validated
same-entity canonical URL, removing the avoidable extra redirect but not its rate limit. Existing
normalized captures omit the dynamic XP payload, so most of the original 298 require refetching.
The single private HTML diagnostic was reprocessed offline with its original source SHA/time;
quest 4811 became available at 490 XP and published at 08:53:09 UTC.

Recovery is serialized ahead of the existing priority and base jobs. It never resets either
checkpoint. Original priority cursor 648 and base cursor 746 were preserved byte-for-byte.
The recovery queue contains the frozen original 298 first, then 19 new affected records (317 total).
Queue SHA: `d3ba3ad0b531151fa4ec7026b8904cca0a1ea7bb9a90176471b384cffdcce07b`.
At least roughly five hours is necessary at the unchanged one-minute request pace; robots,
redirects and access interruptions can extend that. PM2 configuration was saved.

```text
/home/wow-trader-reference-worker/shared/queues/reference-crawler-recovery.config.cjs
/home/wow-trader-reference-worker/shared/queues/forever-xp-recovery-d3ba3ad0b531151f.json
/home/wow-trader-reference-worker/shared/recovery-xp-d3ba3ad0b531151f-status.json
/home/wow-trader-reference-worker/backups/20261015-xp-repair.Gskb8I/baseline/
```

Inspect processing progress and verified publication separately on the server:

```sh
node /home/wow-trader-reference-worker/current/dist/cli.js status --status /home/wow-trader-reference-worker/shared/recovery-xp-d3ba3ad0b531151f-status.json --staging /home/wow-trader-reference-worker/shared/staging
cd /home/wow-trader-system/current
node scripts/repair-leveling-quest-xp.mjs status --baseline /home/wow-trader-reference-worker/backups/20261015-xp-repair.Gskb8I/baseline --rewards /home/wow-trader-reference-worker/shared/published --expected-unknown 298
```

The latter reports actual available facts, original-cohort resolved/remaining IDs and outstanding
issues; crawl completion alone is not numeric resolution. `prepare --destination <new-directory>`
creates a checksummed deduplicated queue/inventory without overwriting outputs. The baseline index
SHA is `d6a2e74a6fa335f091544a47607210a334b518d21c698f6640a834daf2b132da`.
Check all remaining unknown/conflict IDs before claiming full coverage; newly collected quests are
reported separately from the original 298. The publisher validates identities against current client
quests and makes accepted rewards available on refresh without a new web build.

Safe stop: `pm2 stop kfc-helper-reference-crawl`. Resume only after reviewing access failures with
`pm2 startOrReload /home/wow-trader-reference-worker/shared/queues/reference-crawler-recovery.config.cjs --only kfc-helper-reference-crawl --update-env`.
Do not downgrade readers to unpatched r7 or the worker to v1 after v2 facts exist: old schemas reject
those records. Keep compatible r8 readers when stopping collection/rolling back unrelated features.
Do not remove pacing state/locks or launch a second worker to accelerate this recovery.

Verification: 68 reference-data tests, 5 focused web tests, recovery-tool integration test, strict
reference types/lint, focused formatting/lint, 626-record backward-read validation, Linux production
build/private preview and the live XP/browser/mobile/a11y suite. No database/native-catalog writes,
player-save mutation, addon changes or route/UI edits. This evidence repair is not the pending
XP-funded 1–60 route rebuild or proof of sufficient experience in its chapters.

## Boundary

Use explicit `/tbc/item=ID`, `/forever/item=ID` and edition-specific quest pages. Public item XML
documents provide the tooltip; page data provides entity facts and selected source/use relationships.
HTML and JavaScript are parsed with Cheerio and Acorn, never evaluated. Imported output contains
plain strings and a numeric-fact allowlist, not executable HTML. Comments, user profiles, screenshots,
news, guide prose and Wowhead's Auction House buyout estimates are not imported.

Default: one worker with a fresh 72–90 second delay between source-navigation starts,
including robots, redirects and item HTML/XML, and at most 20 uncached records per invocation.
A separate durable rolling window caps starts at 50 per 60 minutes even when the configured delay
is lower or the worker restarts. This is a conservative operator policy, not a documented Wowhead
quota. The configurable delay bounds are 40–120 seconds. A robots crawl-delay can increase them,
and a larger or invalid robots delay stops the run rather than creating an overflowing timer. The
crawler reads robots before each run, checks redirects against the original entity/edition and host,
limits body size and request duration, persists Retry-After cooldowns, and stops on
blocked/challenged pages. Browsertrix page assets are normal browser subresource requests and are
not counted as separate source navigations. No proxy rotation, browser impersonation, credential
use or challenge bypass is implemented.

The staging directory has an exclusive `.crawl.lock`; publication has a separate `.publish.lock`.
`.request-pacing.json` persists the rolling navigation history, last attempt and next permitted time
under that lock, including between batches and restarts. Version 1 pacing files are read without
discarding their last known request and are upgraded on the next write. A 429 or 503 saves the source's
cooldown and stops without an immediate retry. Missing/invalid Retry-After defaults
to five minutes. Long cooldowns stop before any further request, including robots;
resume only after that time and review the source response. Never delete pacing
state to bypass throttling. Malformed state fails closed.

Managed full-catalog workers use `--wait-on-source-cooldown`. A plain HTTP 403 without
`Retry-After` records a six-hour durable cooldown, exposes the active checkpoint as `waiting` with
its `retryAt`, and retries that same entity after the cooldown. A source-provided `Retry-After`
takes precedence. Only bounded cooldowns up to 24 hours are waited automatically; longer or invalid
values, challenges, robots denials and parser failures still stop for operator review. This is
low-frequency outage recovery, not a bypass: the worker keeps its declared identity, single-worker
pacing and exact URL, and does not add proxy rotation, cookies or browser impersonation.

A crashed run may leave its lock behind: confirm no worker is running before removing that specific
lock. Source 404s are quarantined for seven days, count toward the batch limit, and do not stall later
IDs. `--refresh` rechecks them. Access denials, parser drift and challenges still stop the whole batch.
Extracted facts are cached rather than storing entire pages containing other users' comments.
Fresh staging records are skipped; `--refresh` explicitly rechecks them. XP-enabled runs selectively
fetch a fresh legacy display record if it lacks the current typed XP capability. Forever freshness is 14 days,
TBC 90 days. A failed fetch never overwrites the last valid record.

## Run a bounded batch

From the repository root, use absolute paths outside Git for queue/artifact files. The parent queue
directory must exist. This example seeds real requested IDs, not synthetic production content:

```sh
pnpm --filter @wow-trader/reference-data dev seed --game forever --kind item --ids 25,2362,281728 --queue /tmp/forever-items.json
pnpm --filter @wow-trader/reference-data dev crawl --queue /tmp/forever-items.json --staging /tmp/wowhead-staging --permission-ref owner-confirmed-2026-10-07 --limit 20
pnpm --filter @wow-trader/reference-data dev report --queue /tmp/forever-items.json --staging /tmp/wowhead-staging
```

For local diagnostics, add `--browsertrix-screencast-port 9037` and open
`http://127.0.0.1:9037`. The viewer is disabled by default, bound only to host loopback and available
only while Browsertrix is actively processing a page. `BROWSERTRIX_SCREENCAST_PORT=9037` provides
the equivalent opt-in for managed local runs. Do not publish this port on a network interface.

Recognized challenges also produce a sanitized, read-only screenshot report under
`<staging>/challenge-evidence/`. Open the newest report with
`pnpm --filter @wow-trader/reference-data dev challenge-report --staging <staging> --open`. Raw
challenge HTML and verification tokens are not copied into the report. The architecture and the
separate input-mapping design for owned test targets are documented in
`docs/operator-assisted-challenge-inspection.md`.

For quests use `--kind quest`, real quest IDs, and the correct edition. For a large item queue,
download our own advertised sitemap files and seed only their exact item/quest routes:

```sh
pnpm --filter @wow-trader/reference-data dev seed --game tbc --sitemap /tmp/helper-sitemap.xml --queue /tmp/tbc-items.json
pnpm --filter @wow-trader/reference-data dev seed --game forever --sitemap /tmp/forever-0.xml --sitemap /tmp/forever-1.xml --sitemap /tmp/forever-2.xml --sitemap /tmp/forever-3.xml --queue /tmp/forever-items.json
```

The seed parser rejects non-Helper hosts, query URLs and unsafe XML. It does not traverse Wowhead's
site, scrape every integer ID or turn guide recommendations into confirmed acquisition data.
Quest detail URLs were not mass-listed in the current Helper sitemap. Build a reviewed quest queue
from actual routes/client IDs; do not pretend the item sitemaps cover all quests.

Repeat the same crawl command to resume bounded batches. The inspected item inventory is roughly
54k records; two source documents per item at the default average delay already mean about
101 days, before quest pages, redirects or interruptions. A record is not one source
request. Expect weeks to months, not a fixed completion date. Prioritize leveling
rewards, raid items and frequently used crafting materials for reviewed batches.
Do not start a concurrent full-catalog scrape or increase worker count just to finish faster.

## Managed full-catalog run

The October 7 run was seeded from the live Helper's read-only PostgreSQL item inventories and its
checksum-verified current quest artifact, not guesses or the older sitemap alone:

- Forever build 70245: 23,872 items.
- TBC build 69795: 30,133 items.
- Forever world artifact build 70205: 6,609 known quest IDs.
- Total: 60,614 edition-specific records, interleaved so both games and quests make progress.

The quest artifact is the one the live website uses. Client presence is not confirmation that a quest
is currently obtainable. The artifact build is recorded separately from the newer item build.
Seeding uses a read-only database transaction, existing contract schemas, artifact checksum/count
checks and bounded decompression. Queue files are immutable; seed a new directory for a new run.
No market/player/account records are exported and no database writes are performed.

October 7 reliability correction: the worker stopped at cursor 101 on quest 37.
A paced, robots-permitted diagnostic confirmed an NPC starter and a same-edition
object endpoint on the canonical Forever page. The parser had assumed every giver
was an NPC. It now accepts explicit same-edition NPC/object identities while
rejecting foreign hosts, credentials, query/fragment variants, invalid IDs and
crossed editions. The checkpoint and unreviewed staging are preserved on resume.
The pacing rollout also exposed a timeout-ordering bug: the 20-second network
deadline started before the 60-second wait. Request timeouts now start only after
the durable pacing gate, retaining the original network/body deadline. A fake-clock
regression fails with the old ordering and passes with the correction.

Production verification at 19:15 UTC: isolated release `crawl-20261007-r4`
advanced cursor 101 to 102 without changing the queue hash or total. Quest 37
stored NPC starter 261 and object endpoint 55 with no completeness gaps. The
worker continued to the next item, and PM2's process list was saved. All 28
reference tests, strict typecheck, lint and portable build passed. Both website
releases were deployed and verified first; no Helper website, database schema
or reference publication was included in this worker update. Release/checkpoint
backups remain under `/home/wow-trader-reference-worker/backups/20261007-r4`.

October 13 reliability correction: the worker had stopped on October 8 at cursor 607 on TBC
Tigerseye (818). A paced diagnostic found an unrelated edition-4 item preload alongside the correct
edition-5 primary dataset. The parser now ignores foreign preloads while requiring the requested
edition's matching primary item whenever foreign datasets occur. Another edition's same-ID facts
are never merged, and primary-name, canonical/XML identity and literal-only parsing checks remain.
Fifteen regressions cover dataset order, both games, same/unrelated IDs and rejected primary data;
all 53 reference tests, strict typecheck, lint and an isolated production build passed.

The October 13 worker release was `crawl-20261013-r5`, resumed from the preserved cursor 607. Only `parser.ts`
changed across its eight deployed source modules; no unrelated development/publication edits were
shipped. Dependency aliases are now relative and confined to the release, with unchanged dependency
payloads. r4/r2 remain retained for rollback. Private deployment/checkpoint/diagnostic receipts are
under `/home/wow-trader-reference-worker/backups/20261013-edition.nXim7d/`. At 06:00 UTC the worker
was online at cursor 609; item 818 and Forever quest 212 had both published as complete. The live
Tigerseye detail page rendered the new reference. See `fixes.md` for the
recovery receipt. Pacing, queue hash, storage budgets and source-access stop conditions are unchanged.
Follow-up at 06:31 UTC confirmed cursor 621, the same running PID, and no error; 14 new records
had completed since the preserved checkpoint.

### October 15: full source-library leveling priority

The owner requested filling the premade route from the full supplied quest library, prioritizing
shared kills and named trophies over low-drop collection farms. A separate immutable priority
snapshot now contains 1,419 unique Forever quest IDs, including all 614 original priority IDs.
The same `crawl-20261014-r6-xp` runtime and PM2 process 358 are used; no additional worker or
website release was deployed. Existing staging/pacing, the old priority checkpoint and the base
checkpoint are preserved. The same 60-second minimum, 384 MiB heap, 8 GiB reserve, 2 GiB staging
cap and fail-closed source policy apply. PM2 was saved after the scoped worker reconfiguration.

Active snapshot SHA-256:
`1e25e00fcd345e03cba14f3aa3e3fae78fb1c92cf63ba0db881438989e827e8b`.

```text
shared/queues/forever-leveling-xp-1e25e00fcd345e03.json
shared/priority-xp-1e25e00fcd345e03-status.json
shared/queues/reference-crawler-library.config.cjs
shared/queues/reference-crawler-previous.config.cjs
```

At 07:23:46 UTC the new checkpoint was at 156 / 1,419 (152 cache hits, four crawled), without a
job error. This is collection progress, not four verified XP facts or completed route certification.
No fixed completion time is promised; missing fields, access restrictions and storage limits can
hold data or stop the job. Publication continues through the existing independently validated
publisher; native catalogs/players are not modified.

Generate a new full-library snapshot locally:

```sh
pnpm leveling:xp:queue --library --destination=/absolute/path/to/new-queue-directory
```

Default generation deliberately retains the old 614-ID contract. Current source-selection
refinements produce the same 1,419-ID set with a different ranked order, hash
`84d8b04476efe3997b27817c68507887ae28ea754158af42eaf47d71ef2dec49`.
Keep the active snapshot frozen: changing order means a new hash and a separate checkpoint, not
overwriting an active file. Local inventories/config receipts live under
`artifacts/leveling/audits/2026-10-15/library-queues/`.

Inspect or roll back on the server:

```sh
node /home/wow-trader-reference-worker/current/dist/cli.js status --status /home/wow-trader-reference-worker/shared/priority-xp-1e25e00fcd345e03-status.json --staging /home/wow-trader-reference-worker/shared/staging
pm2 stop kfc-helper-reference-crawl
pm2 startOrReload /home/wow-trader-reference-worker/shared/queues/reference-crawler-previous.config.cjs --only kfc-helper-reference-crawl --update-env
pm2 save
```

Stopping is graceful and saves progress/releases locks. The previous configuration resumes its
own preserved checkpoint. Do not delete caches, alter pacing or launch a second worker.

### October 14: priority leveling rewards and exact missing-quest redirects

Active worker release: `crawl-20261014-r6-xp`. Helper web and publisher release:
`kfc-helper-xp-20261014-r5`. The base job had stopped at cursor 746 on quest 260. A permitted,
durably paced diagnostic found its exact `301 /forever/quests?notFound=260` response. Only this
same-origin/same-edition exact-ID not-found form is quarantined for seven days without following
the listing page. Its real HTTP status remains 301. Other redirects, challenges and denials still
fail closed. The original base queue, checkpoint and pacing were preserved.

The literal-only XP parser reads the same-edition primary quest and
`WH.Wow.Quest.setupScalingRewards` payload. It never runs source JavaScript or imports comments.
Inspected public renderers `quest.js?5f36c4ad` and `global-core.js?52d4f803` establish the rounding
and overlevel rules; a different/missing revision holds numeric XP as unknown pending inspection.
The primary quest's `xp` is not assumed to be the final displayed amount. Store base, page multiplier,
full reward and per-character-level table separately; never multiply an adjusted Forever fact again.
For example, quest 214's base 1,250 and 2.375 page multiplier produce 2,950 full XP, but 2,400 at
level 23 using the renderer's rounding order. A capture timestamp does not establish a client build.

XP sidecars (`forever-quest-ID.xp.json`) use `quest-xp-evidence.v1` and parser revision
`wowhead-quest-xp-20261014-v1`. The publisher validates current-client identities, preserves better
existing facts and holds conflicting claims. It writes immutable checksum-addressed records under
`shared/published/quest-xp/records/` and atomically updates `quest-xp/index.json`, independently of
display-reference completeness/SEO readiness. Native catalogs and databases are not modified.
The website reads fresh snapshots on request; reward refresh preserves player saves.

Generate the queue locally from the authorized archive (not guessed ID ranges):

```sh
pnpm leveling:xp:queue -- --destination=/absolute/path/to/new-queue-directory
pnpm leveling:xp:audit -- --destination=/absolute/path/to/reports --rewards=/absolute/path/to/published
```

The active queue has 614 IDs across 33 Alliance race/class editions, with 304 Human IDs prioritized.
The generator includes known prerequisite edges; the current inventory added zero prerequisite-only
IDs and must not be mistaken for a complete externally verified prerequisite graph. The queue hash
is `32bec0be2d118c31288f66c39884355ce6f04d8045724cc7829b98c2a3121447`. Runtime paths:

```text
shared/queues/forever-leveling-xp-32bec0be2d118c31.json
shared/queues/forever-leveling-xp-32bec0be2d118c31.inventory.json
shared/priority-xp-32bec0be2d118c31-status.json
shared/status.json  (base cursor remains 746 while priority work runs)
```

`crawl-priority` processes the separately hash-bound priority checkpoint with `--quest-xp` capability,
then resumes the base queue with its original policy. No concurrent workers or checkpoint resets.
The deployed PM2 configuration supplies both queues/checkpoints. Inspect priority progress with:

```sh
node /home/wow-trader-reference-worker/current/dist/cli.js status --status /home/wow-trader-reference-worker/shared/priority-xp-32bec0be2d118c31-status.json --staging /home/wow-trader-reference-worker/shared/staging
```

At 11:36 UTC, 24 usable facts were published. Collection can leave rewards unknown; this count is
data coverage, not proof of reaching 60. One worker, 60-second durable pacing, storage limits and
access-policy stops remain unchanged. 61 reference tests passed, including real-payload XP
rounding, source validation, capability refresh, priority/base resume and missing-entity redirects.

Production paths on `89.167.46.193`:

```text
/home/wow-trader-reference-worker/current                  isolated runtime
/home/wow-trader-reference-worker/shared/queues/            queue and build provenance
/home/wow-trader-reference-worker/shared/staging/           unreviewed normalized facts
/home/wow-trader-reference-worker/shared/status.json        durable checkpoint
```

PM2 process `kfc-helper-reference-crawl` runs a single worker, 100-record batches, with a
72–90 second navigation delay and a durable maximum of 50 navigation starts per rolling hour, a 384 MB Node heap,
an 8 GiB free-disk reserve and a 2 GiB staging ceiling. Batch size is not requests/hour. The
running process has reduced CPU priority. Its PM2 configuration is
`infra/pm2/reference-crawler.config.cjs`; only this worker's portable runtime was shipped, not the
dirty monorepo or any website release. PM2's process list was saved.

At the reduced rate, redirects, item XML and quest pages mean weeks to months before
source interruptions. The previous 5-7-day estimate no longer applies. The worker stops on access
denials, challenges, incompatible source data or storage-budget exhaustion; `autorestart` is off
to prevent repeated requests to blocked sources. A 404 is recorded and later IDs continue.

From the server, inspect status without loading application secrets:

```sh
node /home/wow-trader-reference-worker/current/dist/cli.js status --status /home/wow-trader-reference-worker/shared/status.json --staging /home/wow-trader-reference-worker/shared/staging
pm2 logs kfc-helper-reference-crawl --lines 30 --nostream
pm2 stop kfc-helper-reference-crawl
pm2 restart kfc-helper-reference-crawl
```

`crawl-all` saves cursor/counters after each successful or cached record, validates the queue hash and
policy on resume, and never invokes publication. SIGINT/SIGTERM save an interrupted checkpoint and
release locks; PM2 allows 30 seconds for shutdown. A crash or SIGKILL can leave `.job.lock` and
`.crawl.lock` in staging. Inspect the saved PID and PM2 status and confirm no crawler remains before
removing only those stale lock files. Do not clear locks from a live process.

The status counters distinguish newly crawled records, incomplete new records, cache hits and new
404s. Completion means the entire queue was processed, not that every source supplied complete
facts or every record is approved. Review incomplete records and exact-build mismatches separately.
With `--staging`, status also reports the configured maximum HTTP rate, last attempt
and next permitted request time. Those request timestamps are not record-completion
timestamps. Old staged facts can exceed their freshness window while a full crawl
runs. The continuous publisher checks freshness as each record becomes available;
eventual queue completion does not make stale or conflicting facts publication-ready.

## Review and publish

The October 8 continuous-publisher workflow supersedes manual approval for every record.
Validated complete records can publish automatically; useful matching partial facts can display
without index eligibility. Conflicts and unusable facts are held for exceptional review. The manual
commands below remain available for a specifically reviewed complete batch and local previews.

The report flags absent tooltips/classifications, unresolved item details, missing source/use context,
and missing quest objectives, requirements, giver or reward context. A candidate passing these
checks is **ready for human review**, not proof that all Wowhead information is complete or correct.
In particular, missing stats on a material are not the same as missing stats on equipment.

Compare the candidate with exact-build client facts and current observations. Resolve differing
names, stats, prerequisites, reward choices, difficulty, game edition and acquisition status. Keep
external source context as external evidence; never manufacture probabilities from unknown sample
counts or transplant Classic/TBC facts into Forever just because the numeric ID matches.

Create a queue containing only the reviewed IDs. Publication refuses incomplete/stale records and
uses checksum-addressed record files plus an atomic manifest:

```sh
pnpm --filter @wow-trader/reference-data dev publish --queue /tmp/reviewed-items.json --staging /tmp/wowhead-staging --destination /tmp/wowhead-published --approve
```

Set `WOW_TRADER_REFERENCE_DIRECTORY` to this **published directory**, not staging, when testing or
deploying Helper. The website verifies record identity, edition, captured date, checksum and quality.
Ensure the PM2 application's operating-system user can read the published directory and its files;
the crawler creates owner-readable artifacts. Ship the manifest and every referenced record together.
Known item name, classification, level-requirement and comparable primary-stat/weapon conflicts
with client records suppress the reference, item indexing and sitemap inclusion. Sitemap checks
read the native identity, primary stats and weapon facts for candidate IDs in bounded database
queries scoped to the selected build. These current-build comparisons are
not added to the existing persistent catalog cache or mixed into source evidence.
This is not a complete stat/effect comparison: reviewers still need to
compare the remaining client fields. It displays attributed source facts beside client/runtime facts,
never writes them into the native
catalog tables or lets them silently change economic calculations. New client builds require review
when their facts differ; the source crawl timestamp is not an exact-build certification.

## Historical local pilot

Nine real edition-specific records were crawled locally: Forever items 25, 2362, 281728;
Forever quests 92753, 95189, 1654; TBC items 32837, 32375, 22450. Six passed the completeness
checks and were published **only to a local preview artifact**. Restored Shortsword lacks source/use
context; Crest of Lordaeron lacks a giver; The Test of Righteousness lacks actual reward data in the
crawled page. The completion-check widget is not a reward and was excluded.

The published preview is `/tmp/kfc-helper-reference-pilot/published`; staging is beside it. Temporary
storage is not a production artifact store. Browser checks at 390px and 1440px verified the approved
Deadmines quest's objective, description, rewards, attribution, canonical and wrapping. The held
quest remained noindex and absent from the local sitemap. Native item rendering/client comparisons
still need a working local database; no production catalog accuracy sign-off is implied.

Queues seeded from the inspected Helper maps contain 30,133 distinct TBC items and 23,824 distinct
Forever items (53,957 combined). They are in `/tmp/kfc-helper-reference-pilot/all-tbc-items.json`
and `all-forever-items.json`. These older sitemap queues were superseded for the managed run by the
fresh live inventory above. The full source queue remains incomplete. Since October 8, validated
records are published continuously to the durable store without waiting for the full queue; see
[the rollout results](reference-auto-publication.md#verified-production-rollout). Publication does
not automatically submit records to Google or guarantee indexing.

Verification: reference package tests, lint, strict typecheck and build; Helper web tests, lint,
typecheck and production build. KFC's focused tests and typecheck pass, and its new Tools page
passed desktop/mobile checks. KFC's full build compiled/typechecked but could not prerender `/about`
because local PostgreSQL at port 5454 is unavailable; local Redis is also unavailable.

## Indexing policy and release order

The active Helper release makes incomplete or conflicting item/quest detail pages `noindex, follow`.
Item URLs are removed from its generated sitemaps until complete matching evidence exists. Quest references
can render independently with an explicit external-evidence label. Existing tools, search functions,
client records, recipes and professions remain usable. Private/download/API routes stay protected.

This intentionally reduces the old catalog URL count. Without a published directory, **no item detail
page passes the new index gate**. Sitemap eligibility also checks that the approved files are present,
complete and checksum-valid; a manifest alone is insufficient. Changed client builds can invalidate
a previously reviewed match, so re-review the references alongside catalog publication.
Do not accidentally deploy an empty artifact or call that a complete
enrichment release. Stage/review important records, configure the published path and verify both
accepted and held pages. This policy and continuous publication are now active in the October 8 release.

Validate desktop/mobile source sections, canonical URLs, structured data and source links; HTTP 200
does not imply indexability. Check a deliberately incomplete record is absent from the sitemap and
noindex, and that an approved matching-name record has visible facts and a self-canonical. Request
indexing for a few genuinely improved pages after release, not all 54k IDs. This is not a guarantee
of Google indexing or rankings; useful original context and trustworthy discovery still matter.

For a separate local preview without reusing another running Next server's output directory:

```sh
WOW_TRADER_BUILD_DIR=.next-reference-preview WOW_TRADER_REFERENCE_DIRECTORY=/tmp/wowhead-published pnpm --filter @wow-trader/web exec next dev --port 19410
```

Keep `WOW_TRADER_BUILD_DIR` empty in the normal PM2 deployment unless its start command and
release paths are deliberately changed. Approved quest references can render without client data;
the page logs the client-service failure and clearly labels the external-only fallback. A missing
reference never substitutes fictional client data and remains noindex.

Publisher terms and robots were checked before the owner supplied permission:
[Fanbyte/ZAM terms](https://corp.fanbyte.com/legal/terms), [Wowhead robots](https://www.wowhead.com/robots.txt).
Retain the real permission record privately; the CLI's permission-ref is an audit label, not a license.
