# KFC search discovery follow-up — November 2, 2026

The account-side fixes are active. Google indexing and rankings remain pending.
This extends the [cross-product Search Console review](search-console-review-2026-11-02.md).

## Additional findings

- All 31 guild sitemap pages have incoming links in the audited public graph.
- Google's saved homepage HTML already contains the Forever title, H1, guild
  description and links to recruitment, the launch page and tools. An old TBC
  homepage is not the explanation for its current low search visibility.
- Sampled legacy Helper simulator/leveling URLs and www/HTTP guild URLs reach
  the expected canonical destinations. This is a sample, not an exhaustive
  redirect audit of the catalog.
- Four published healer simulators were omitted from the tools sitemap because
  its existing spec list covers the other simulator routes. All four have real
  published libraries, HTTP 200 responses and self-canonical metadata.

## Fix and account actions

Added Priest, Druid, Paladin and Shaman healing workspaces to the existing tools
sitemap. No share/build/release query variants, fabricated last-modified dates
or duplicate URLs were added. The sitemap gained exactly four page URLs and
removed none. Image sitemap locations are excluded from page-URL comparisons.

Resubmitted `https://kfcguild.online/tools/sitemap.xml`; Search Console reports
**Success, 2,581 discovered pages**, read November 2. The guild sitemap remains
successful with 31 pages, and the catalog shard submitted earlier remains
successful with 2,240 URLs. Discovery is not index inclusion.

Requested indexing of the guild-preparation guide after confirming it is still
discovered but unindexed. Google accepted it. This brings today's totals to
**seven KFC requests and three community requests**, ten accepted requests across
both properties. Do not resubmit these pages daily.

## Release and checks

- Source changes: `apps/web/src/app/sitemap.ts` and its new regression test.
- Nine focused sitemap/SEO tests, scoped lint/format, full Linux Next 16.3.5
  webpack build and TypeScript passed.
- Candidate and actual public HTTP checks passed for all four healer libraries,
  Warrior, Hunter, unique sitemap entries and the 32-profile raid-composition API.
- Actual preview and public Chrome passed all four published libraries and
  Warrior engine initialization. Preview emulated only the existing production
  `/forever-sim` asset mount; the live check used the real Nginx routing.
- Static delivery validated compressed assets and retained preceding chunks for
  existing tabs. No combat calculation, preset, item dataset or native search ran.
- Only Helper web restarted. Guild, community, raid worker, calendar and ingest
  PIDs were preserved. No database or robots/rate-limit change was made.
- Private preview and tunnel were stopped after verification. Concurrent Chrome
  instances required targeting the owner's browser PID through ScriptingBridge;
  no other browser process was interrupted or any cookie/token exported.

Activated **10:22:10 UTC**, November 2:

- Release: `/home/wow-trader-system/releases/kfc-helper-seo-healers-20261102`.
- Build: `hVMXXEzcl6sMG4xmX8gOj`; Helper PID: `1476650`.
- Static delivery: `shared/static-delivery/releases/kfc-helper-seo-healers-20261102`.
- Source was the live `kfc-helper-raid-composition-20261101-e077cad` plus only the
  sitemap change and test; unrelated dirty local leveling code was excluded.
- No Git commit/push was requested or created.
- Local evidence: `artifacts/seo-kfc-healers-20261102/`.
- Private server receipts and rollback controller:
  `/home/wow-trader-system/shared/operations/seo-healers-20261102/`.

The preceding release and delivery pointers are in `activation.json`. The
controller restores the preceding public RUM/usage labels, web pointer/process
and delivery if activation verification fails. Credentials were not copied into
the local receipts. Canonical source and regression tests are ready for the next
requested commit.

KFC's older coverage report still has nine indexed pages and its October 4–31
performance has only 57 impressions. Today's fixes do not establish a ranking
gain. Review actual crawl/index states after November 9 and complete performance
periods after November 16; the existing report records the queries and constraints.
