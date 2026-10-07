# Permissioned Wowhead reference enrichment

October 7, 2026. The owner confirmed crawler permission, not an API/export entitlement.
The crawler is deployed as an isolated production worker. Website enrichment/index-policy changes
remain local and unpublished; native database rows are not overwritten. KFC recruitment and the
neutral WoW Forever community keep their own Discord destinations.

## Boundary

Use explicit `/tbc/item=ID`, `/forever/item=ID` and edition-specific quest pages. Public item XML
documents provide the tooltip; page data provides entity facts and selected source/use relationships.
HTML and JavaScript are parsed with Cheerio and Acorn, never evaluated. Imported output contains
plain strings and a numeric-fact allowlist, not executable HTML. Comments, user profiles, screenshots,
news, guide prose and Wowhead's Auction House buyout estimates are not imported.

Default: one worker, at least 60 seconds between every HTTP attempt, including robots,
redirects and XML, at most 20 uncached records per invocation. This is a conservative
operator policy, not a documented Wowhead quota. The configurable minimum is 40 seconds
(at most 90 requests/hour), and the maximum is 120 seconds. A robots crawl-delay can increase it, and a larger or invalid
robots delay stops the run rather than creating an overflowing timer. The crawler reads robots before
each run, checks redirects against the original entity/edition and host, limits body size and request
duration, persists Retry-After cooldowns, and stops on blocked/challenged pages. No proxy
rotation, browser impersonation, credential use or challenge bypass is implemented.

The staging directory has an exclusive `.crawl.lock`; publication has a separate `.publish.lock`.
`.request-pacing.json` persists the last HTTP attempt and next permitted time under
that lock, including between batches and restarts. A 429 or 503 saves the source's
cooldown and stops without an immediate retry. Missing/invalid Retry-After defaults
to five minutes. Long cooldowns stop before any further request, including robots;
resume only after that time and review the source response. Never delete pacing
state to bypass throttling. Malformed state fails closed.
A crashed run may leave its lock behind: confirm no worker is running before removing that specific
lock. Source 404s are quarantined for seven days, count toward the batch limit, and do not stall later
IDs. `--refresh` rechecks them. Access denials, parser drift and challenges still stop the whole batch.
Extracted facts are cached rather than storing entire pages containing other users' comments.
Fresh staging records are skipped; `--refresh` explicitly rechecks them. Forever freshness is 14 days,
TBC 90 days. A failed fetch never overwrites the last valid record.

## Run a bounded batch

From the repository root, use absolute paths outside Git for queue/artifact files. The parent queue
directory must exist. This example seeds real requested IDs, not synthetic production content:

```sh
pnpm --filter @wow-trader/reference-data dev seed --game forever --kind item --ids 25,2362,281728 --queue /tmp/forever-items.json
pnpm --filter @wow-trader/reference-data dev crawl --queue /tmp/forever-items.json --staging /tmp/wowhead-staging --permission-ref owner-confirmed-2026-10-07 --limit 20
pnpm --filter @wow-trader/reference-data dev report --queue /tmp/forever-items.json --staging /tmp/wowhead-staging
```

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
54k records; two source documents per item at 60 seconds each already means about
75 days, before quest pages, redirects or interruptions. A record is not one HTTP
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

Production paths on `89.167.46.193`:

```text
/home/wow-trader-reference-worker/current                  isolated runtime
/home/wow-trader-reference-worker/shared/queues/            queue and build provenance
/home/wow-trader-reference-worker/shared/staging/           unreviewed normalized facts
/home/wow-trader-reference-worker/shared/status.json        durable checkpoint
```

PM2 process `kfc-helper-reference-crawl` runs a single worker, 100-record batches, at
least 60 seconds between all HTTP attempts (at most 60/hour), a 384 MB Node heap,
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
runs; review and explicitly publish selected fresh batches rather than assuming
that eventual queue completion makes the whole catalog publication-ready.

## Review and publish

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
Known item name, classification and level-requirement conflicts with client records suppress the
reference, item indexing and sitemap inclusion. Sitemap checks read only the core client identity
fields for candidate approved IDs in bounded database queries. These current-build comparisons are
not added to the existing persistent catalog cache or mixed into source evidence.
This is not a complete stat/effect comparison: reviewers still need to
compare the remaining client fields. It displays attributed source facts beside client/runtime facts,
never writes them into the native
catalog tables or lets them silently change economic calculations. New client builds require review
when their facts differ; the source crawl timestamp is not an exact-build certification.

## Local pilot and remaining rollout

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
fresh live inventory above. The full crawl has started, but is **not completed or published**.
Review exact-build conflicts, then publish approved records to a durable application-readable store
before releasing the indexing policy. The crawler does not automatically send collected records to
Google.

Verification: reference package tests, lint, strict typecheck and build; Helper web tests, lint,
typecheck and production build. KFC's focused tests and typecheck pass, and its new Tools page
passed desktop/mobile checks. KFC's full build compiled/typechecked but could not prerender `/about`
because local PostgreSQL at port 5454 is unavailable; local Redis is also unavailable.

## Indexing policy and release order

The candidate Helper release makes unapproved item/quest detail pages `noindex, follow`. Item URLs
are removed from its generated sitemaps until approved evidence exists. Approved quest references
can render independently with an explicit external-evidence label. Existing tools, search functions,
client records, recipes and professions remain usable. Private/download/API routes stay protected.

This intentionally reduces the old catalog URL count. Without a published directory, **no item detail
page passes the new index gate**. Sitemap eligibility also checks that the approved files are present,
complete and checksum-valid; a manifest alone is insufficient. Changed client builds can invalidate
a previously reviewed match, so re-review the references alongside catalog publication.
Do not accidentally deploy an empty artifact or call that a complete
enrichment release. Stage/review important records, configure the published path, verify both accepted
and held pages, then release this policy deliberately. The current live site is unchanged.

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
