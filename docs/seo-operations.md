# SEO search-surface operations

## Objective and current state

KFC Helper publishes one canonical search surface under `https://kfcguild.online/tools`. Search
eligibility is evidence-driven: a URL enters a sitemap only when the corresponding page has a stable
identity, the required evidence, no known identity conflict, and indexable metadata. The same policy
feeds page metadata and sitemap admission.

Implemented in the codebase:

- `search-surface-report.v1` eligibility and release-audit contracts;
- exact-client plus reviewed-reference gates for item and quest pages;
- published-community eligibility for NPC/object pages, with observed identity conflicts held for
  review;
- normalized entity relationships (`sold_by`, `dropped_by`, `rewarded_by`, `starts_quest`,
  `ends_quest`, `teaches_recipe`, `crafted_by`, `requires_item`, and `located_on_map`);
- crawlable, paginated NPC and object directories;
- deterministic `catalog-change-set.v1` receipts and build-comparison pages;
- local and production HTTP SEO release audits;
- opt-in, daily-aggregate real-user Web Vitals collection;
- read-only Search Console intelligence with two 28-day windows and review-only candidates;
- bounded IndexNow publication from a fresh, complete, zero-issue release audit.

Production activation is intentionally separate from implementation. RUM and IndexNow use protected
server configuration; Search Console still needs owner-provided OAuth credentials and property
access. No credential belongs in the repository.

Production state verified on 2026-10-18:

- web release `kfc-helper-seo-activation-20261018-r4`, build `Z42SViOchM0h7IVnJufW5`;
- complete report
  `/home/wow-trader-system/shared/seo/production-search-surface-report-20261018-r4.json`: 3
  sitemaps, 6,292 unique URLs, 6,292 HTTP/canonical/indexability passes, zero issues;
- nightly 03:17 audit installed with a deterministic 400-page sample, two concurrent requests, and
  report `/home/wow-trader-system/shared/seo/nightly-search-surface-report.json`; its latest
  activation run audited 400/400 pages from the 6,292-URL surface with zero issues in 44,637 ms;
- the nightly job fetches the loopback production app but verifies the public
  `https://kfcguild.online/tools` canonical. Public DNS/proxy/TLS remains a deployment smoke and the
  manual `seo:audit:production` command remains available for an edge-path audit;
- privacy-minimal RUM is enabled at a 5% sample rate under release label
  `kfc-helper-seo-activation-20261018-r4`; an isolated write smoke verified the aggregate schema,
  release label, and mode-0600 daily file without adding synthetic production data;
- IndexNow key verification is live. The first stateful batch received HTTP 200, acknowledged 500
  URLs, and left 5,791 eligible URLs pending. Search Console remains disabled until the site owner
  supplies read-only OAuth credentials and confirms the exact property.

## Search eligibility and entity graph

`apps/web/src/lib/search-surface.ts` is the pure policy. Its result records URL, canonical, state,
reasons, last-modified evidence, content hash, outgoing links, and evidence kinds. Valid states are
`indexable`, `review_required`, and `excluded`.

The source boundary is deliberate:

- exact client data is authoritative for client identity and player-facing catalog fields;
- a checksum-validated published reference can complete an item or quest page;
- the pinned community snapshot supports locations and acquisition relationships;
- exact-build runtime observations corroborate or conflict with community identity but do not
  silently overwrite it;
- conflicts and missing required evidence remain `noindex, follow` and absent from sitemaps.

NPC and object directories publish 200 eligible entities per page. Entity pages link to the correct
directory and render normalized relation labels while retaining the original relation kind and
source provenance.

## Release audit

Run a bounded local audit against an already running development server:

```sh
pnpm seo:audit
```

The local command fetches the local app while verifying its public `kfcguild.online/tools`
canonicals. The production command audits every declared sitemap URL and is the required IndexNow
quality gate:

```sh
pnpm seo:audit:production
```

The audit recursively reads only sitemap URLs declared by `robots.txt`, rejects duplicates, and
verifies HTTP 200, self-canonical metadata, absence of `noindex`, title, and description. Its report
is written under `artifacts/seo/` and must not be treated as a substitute for Search Console.

`infra/pm2/seo-audit.config.cjs` defines a 400-page deterministic nightly sample at 03:17 server
time. It uses the loopback application endpoint with the public canonical base, preventing the
scheduled bulk check from becoming a CDN/TLS loopback load test. Install it only after the release
containing the script is active:

```sh
mkdir -p /home/wow-trader-system/shared/seo
pm2 startOrReload /home/wow-trader-system/current/infra/pm2/seo-audit.config.cjs \
  --only kfc-helper-seo-audit --update-env
pm2 save
```

The full audit remains a release operation; the nightly sample is a regression signal.
`stopped` is the healthy PM2 state between scheduled runs because the job has `autorestart: false`;
the cron rule remains attached and starts the next run.

## Privacy-minimal real-user performance

The browser sends only:

- a normalized route template (never an entity ID, query string, or search term);
- the application release label;
- metric name, numeric value, and rating;
- coarse `mobile` or `desktop` viewport class.

The endpoint does not create cookies or accept user/session IDs. It does not read or persist the
request IP. Individual events are immediately folded into a daily histogram containing count, sum,
minimum, maximum, rating counts, and bounded buckets. Daily files are mode `0600` and updated by an
atomic rename.

Enable it in the protected production web environment only after choosing a release label:

```dotenv
SEO_RUM_ENABLED=true
SEO_RUM_ROOT=/home/wow-trader-system/shared/seo/rum
SEO_RUM_BUILD=kfc-helper-YYYYMMDD-rN
SEO_RUM_SAMPLE_RATE=0.05
```

Create the directory before reloading the web process. Set `SEO_RUM_ENABLED=false` to stop browser
collection immediately. The route returns 204 while disabled. These values must also be present when
Next builds the web application because static layouts decide whether to include the browser
collector during compilation. `deploy-production.sh` supplies the release name at build time, and
`activate-production.sh` refuses an enabled RUM release when the protected runtime label or compiled
artifact does not match that release.

## Search Console intelligence

The importer uses only the official read-only OAuth scope
`https://www.googleapis.com/auth/webmasters.readonly`. It verifies that the credential can access
the configured property, then requests final web-search data grouped by page and filtered to the
canonical tools prefix. It compares the latest finalized 28 days with the prior 28 days and emits
review candidates for low CTR, striking-distance rankings, click decline, and new visibility without
clicks. It never edits metadata or content.

Create `/home/wow-trader-system/shared/env/search-console.env` from
`infra/pm2/search-console.env.example`, mode `0600`. A URL-prefix or domain property is supported;
the value must exactly match a property returned by Search Console. Then run once manually:

```sh
node --env-file=/home/wow-trader-system/shared/env/search-console.env \
  /home/wow-trader-system/current/scripts/search-console-intelligence.mjs \
  --report=/home/wow-trader-system/shared/seo/search-console-intelligence.json
```

After inspecting the report, install the daily 04:43 PM2 schedule:

```sh
pm2 startOrReload /home/wow-trader-system/current/infra/pm2/search-console.config.cjs \
  --only kfc-helper-search-console --update-env
pm2 save
```

The API exposes top rows rather than guaranteeing every row. This is recorded in every report.
Implementation follows the official
[Search Analytics query contract](https://developers.google.com/webmaster-tools/v1/searchanalytics/query),
[sites-list contract](https://developers.google.com/webmaster-tools/v1/sites/list), and
[OAuth guidance](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing).

## Bounded IndexNow publication

IndexNow publication is disabled until `INDEXNOW_KEY` is configured. The web app serves that key at
`/tools/indexnow-key.txt`; because the key file is below `/tools/`, only URLs below that path are
eligible. Use the same key in the protected web environment and the shell that runs publication.

Publication requires this order:

1. deploy and complete public smoke tests;
2. run `pnpm seo:audit:production` so the report is complete and no more than 60 minutes old;
3. preview the bounded diff with `pnpm seo:indexnow:dry-run`;
4. run `pnpm seo:indexnow` with the protected IndexNow environment loaded.

The outbox fingerprints title, description, canonical, content hash, and outgoing links. Only new or
changed, HTTP-200, self-canonical, indexable URLs are selected. The default batch is 500 and the hard
protocol ceiling is 10,000. State advances only after HTTP 200 or 202. The receipt never stores the
key and clearly records that receipt does not guarantee indexing. IndexNow participants share
submissions, but this integration makes no claim that Google consumes them. See the official
[IndexNow protocol](https://www.indexnow.org/documentation).

A newly published key can briefly return HTTP 403 while participant validation propagates. A 403
must not advance local state. Confirm that the participant fetched the key successfully, wait for
propagation, and use a single-URL diagnostic before retrying a bounded batch; do not loop retries.

## Release checklist

1. Run focused tests, web type checking and lint, then the production build.
2. Deploy the immutable release without touching ingestion or crawler state.
3. Smoke the home page, directories, one eligible entity, one held entity, build comparison,
   `robots.txt`, and all sitemap documents.
4. Run the complete production SEO audit and archive its report with the release receipt.
5. Reload the nightly SEO audit process.
6. Reload RUM only when its protected settings are present.
7. Reload Search Console only when its read-only credential file is present and manually verified.
8. Submit the bounded IndexNow diff only when its key endpoint and audit gate both pass.

Rollback the web release normally. Keep search reports, RUM aggregates, Search Console reports, and
IndexNow state outside immutable releases under `/home/wow-trader-system/shared/seo`.
