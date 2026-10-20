# KFC tools site migration

## Outcome

The canonical public product moves from `https://helper.kfcguild.online` to
`https://kfcguild.online/tools`. The guild website and Helper remain separate Next.js builds and PM2
processes. Nginx is the composition boundary: guild routes continue to port 19200, while `/tools`
and `/tools/*` go to the Helper web process on port 19210.

The legacy hostname remains operational for two purposes:

- `/v1/*` stays on the independently deployed ingestion process at port 19211;
- every public page receives a one-to-one HTTP 301 redirect to the equivalent apex `/tools` URL.

This is a URL migration, not a content duplication. Public pages emit only apex `/tools` canonicals,
internal links and assets honor the Next.js base path, and the guild sitemap no longer duplicates
the Helper root.

The active Helper release is `kfc-helper-seo-activation-20261018-r4`, build
`Z42SViOchM0h7IVnJufW5`. Its sitemap supplies `lastmod` only for pages backed by an actual review or
catalog publication timestamp; pages without that evidence intentionally omit the field. Release
`kfc-helper-seo-foundation-20261018-r2` is the immediate web rollback, with the earlier migration
releases retained behind it.

## URL map

| Before                                                | After                                                | Behavior                      |
| ----------------------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| `https://helper.kfcguild.online/`                     | `https://kfcguild.online/tools`                      | 301                           |
| `https://helper.kfcguild.online/forever/trader`       | `https://kfcguild.online/tools/forever/trader`       | 301                           |
| `https://helper.kfcguild.online/tbc/encyclopedia/...` | `https://kfcguild.online/tools/tbc/encyclopedia/...` | 301                           |
| `https://helper.kfcguild.online/tools/...`            | `https://kfcguild.online/tools/...`                  | 301 without a doubled prefix  |
| `https://helper.kfcguild.online/v1/...`               | unchanged                                            | Authenticated ingestion proxy |

Query strings are preserved by the redirects. HTTP requests are upgraded to HTTPS before the same
routing policy is applied.

## Deployment order

1. Build and verify immutable Helper and guild-site artifacts.
2. Record the active Helper release, guild build directory, Nginx files, and PM2 process IDs.
3. Point the Helper `current` symlink to the new release and restart only `kfc-helper-web`.
4. Verify `http://127.0.0.1:19210/tools/api/v1/data-status` before changing public routing.
5. Atomically install both Nginx host configurations, run `nginx -t`, reload, and execute the public
   redirect, canonical, sitemap, and ingestion-validation smoke tests.
6. Start the guild application from its verified build so root `robots.txt`, sitemap ownership, and
   links agree with the new canonical URL.
7. Save the PM2 process list only after every public smoke passes.

The ingestion process is independently pinned and must not be restarted by this migration.

## Verification

- Guild `/`, recruitment, news, and guides still return 200 from the guild application.
- `/tools`, Forever/TBC landing pages, Trader, Encyclopedia, item, and recipe pages return 200.
- Every Helper canonical starts with `https://kfcguild.online/tools`.
- Legacy public URLs redirect in one hop and never produce `/tools/tools`.
- Legacy `/v1/uploads/auction-scan` still reaches Fastify and rejects an unauthenticated valid-size
  request with the expected authentication or schema response.
- Root `robots.txt` advertises the guild sitemap, Helper root sitemap, and both bounded catalog
  shards. Tool operational/API routes remain disallowed.
- Sitemap URLs are unique, use the apex hostname, remain within the 50,000 URL and 50 MB uncompressed
  limits, and do not duplicate `/tools` between the guild and Helper roots.
- Googlebot, Bingbot, and OAI-SearchBot receive the bounded search-crawler policy; ordinary browsers
  are not throttled by that crawler-only key.
- `kfc-website`, `kfc-helper-web`, and the separately pinned ingestion process remain online.

The latest complete Helper audit found 6,292 unique URLs across the Helper root sitemap and two
bounded catalog shards, with no duplicate entries and 6,292/6,292 pages passing HTTP, canonical,
robots, title, and description checks. The guild sitemap remains independently owned and audited.
Evidence-backed dates remain on the reviewed root, Forever overview, simulator, leveling, catalog,
and approved reference records. Trader, edition, market, directory, and world pages without a
recorded revision intentionally omit `lastmod`.

Approved item 25 and quest 10 are self-canonical and sitemap-listed. Held item 100 and incomplete
quest 581 are self-canonical but emit `noindex, follow` and are absent from every sitemap. Five
post-release Forever Trader samples completed in 0.466–0.563 seconds, with 0.217–0.276 seconds to
first byte. These are operational samples, not percentiles or Core Web Vitals.

## Rollback

Restore the saved Nginx files, run `nginx -t`, and reload. Repoint the Helper `current` symlink to the
recorded prior release and restart only `kfc-helper-web`. Restart `kfc-website` with its prior
`KFC_BUILD_DIR`. Do not restart or repoint ingestion. Retain the failed artifacts and logs until the
cause is understood; remove only generated, inactive release directories after a successful retry.

## Search follow-up

After the public cutover, submit the root and Helper sitemap URLs in the verified `kfcguild.online`
Search Console property. Keep the legacy property while Google processes the redirects, inspect a
representative old/new URL pair, and watch selected canonical, indexing, crawl errors, structured
data, Core Web Vitals, and queries. Redirects should remain in place for at least one year and longer
when practical. The read-only importer, release audit, privacy-minimal RUM, and bounded IndexNow
workflow are implemented in [`seo-operations.md`](seo-operations.md). Privacy-minimal RUM and the
IndexNow ownership key are active; the first bounded 500-URL submission received HTTP 200. Search
Console OAuth access and independent editorial backlinks remain owner/external follow-up; the
application does not fabricate any of these signals.
