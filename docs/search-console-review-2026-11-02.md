# KFC and WoW Forever Discord Search Console review

Reviewed November 2, 2026 through the owner's signed-in Chrome. Both are verified
Domain properties: `sc-domain:kfcguild.online` and
`sc-domain:wowforeverdiscord.online`. No OAuth tokens or browser cookies were exported.

Follow-up: the [KFC-specific review](kfc-seo-follow-up-2026-11-02.md) subsequently
fixed four missing healer sitemap entries, verified Google already has the
correct Forever homepage content, refreshed the tools sitemap successfully and
added one accepted guild-guide request. The initial nine requests recorded below
therefore became ten across both properties; no ranking increase is claimed.

## What Google reports

Performance window: October 4–31, 2026, Web search, all countries and devices.
These are aggregate positions, not a promise about an individual search result.

| Property | Clicks | Impressions | CTR | Average position |
| --- | ---: | ---: | ---: | ---: |
| KFC, including tools and legacy Helper | 3 | 57 | 5.3% | 35.6 |
| WoW Forever Discord | 195 | 6,753 | 2.9% | 8.0 |

The community's exact `wow forever discord` query has 271 impressions, four
clicks, 1.5% CTR and average position 8.5. `wow forever guild recruitment discord`
has 175 impressions, 29 clicks and average position 4.2. Its homepage has 74
clicks and 3,521 impressions; the recruitment directory has 55 clicks and 632
impressions. The community already has page-one average positions for several
relevant queries; this does not establish page one for every location/device.

The page-indexing report is dated **October 23**, older than the performance
report and today's URL inspections:

- KFC: nine indexed, 4,003 discovered but not indexed, three redirects.
- Community: 36 indexed, 13 discovered but not indexed, six crawled but not
  indexed, four robots exclusions, three noindex exclusions and two redirects.
- Both homepages are indexed with the inspected URL selected as canonical.
- Both manual-action and security reports say **No issues detected**.
- Neither property has sufficient Core Web Vitals field data to assess a pass.

KFC's roughly three-month crawl report contains only 716 requests across its
hosts, with 597 for the apex. Nine percent of requests were discovery. Today's
live Google test could fetch and index the Warrior simulator, but the index view
did not know that URL. This supports prioritizing discovery; it does not prove
one technical setting caused Google's crawl decisions.

The apex host-status report says no recent crawl difficulty. Robots retrieval
had a high failure rate in the past but is acceptable recently; DNS and server
connectivity are acceptable. The newest displayed 5xx examples are October 9
resources on the old Helper host. Do not label these historical examples an
unresolved current outage. Ordinary recent access-log user-agent matches also
include obvious scanners impersonating Googlebot; they are not verified Google
traffic and were not used as ranking evidence.

## Actions completed

1. Submitted the missing
   `https://kfcguild.online/tools/forever/encyclopedia/sitemap/0.xml` in the KFC
   Domain property. Search Console returned **Success**, 2,240 discovered URLs.
   The guild, tools and community sitemaps were already successful. The empty
   `/1.xml` shard was not submitted as another discovery source.
2. Requested indexing once for each URL below. Google accepted all nine into
   its priority crawl queue, with no quota or rejection dialog. This is a crawl
   request, not evidence that indexing or ranking has already changed.
3. Fixed a verified internal-link gap: `/alliance` and `/horde` appeared in the
   community sitemap but had no incoming links in the complete public-page
   audit. The homepage's existing faction labels now link to those destinations
   in the server HTML, with normal keyboard navigation and unchanged styling.
4. Preserved intentional API/private-form restrictions and noindex on filtered
   directories. Preserved redirects and canonical ownership across the three
   applications. No bot allowance, rate limit or publication gate was loosened.

| Property | URL requested |
| --- | --- |
| KFC | `https://kfcguild.online/wow-forever` |
| KFC | `https://kfcguild.online/tools` |
| KFC | `https://kfcguild.online/tools/forever/leveling` |
| KFC | `https://kfcguild.online/tools/forever/simulator/warrior` |
| KFC | `https://kfcguild.online/tools/forever/raid-composition` |
| KFC | `https://kfcguild.online/tools/forever/tier-list` |
| Community | `https://www.wowforeverdiscord.online/guides/wow-forever-warrior-dps-guide` |
| Community | `https://www.wowforeverdiscord.online/guides/wow-forever-dps-tier-list` |
| Community | `https://www.wowforeverdiscord.online/` after the link change |

The KFC launch page, composition and tier list were discovered but unindexed;
tools, leveling, Warrior simulator and the two community guides were unknown in
the inspected index view. The updated community homepage was already indexed.

Intentional community exclusions were checked individually: robots blocks the
addon API, `/lfg/new`, `/reports/new`, `/reports/status`; noindex excludes the
three reported region/activity filter URLs. Four of the six crawled exclusions
are JavaScript/font resources, and the other two are template downloads. These
are not missing public guide pages. Do not request their inclusion or start a
validation campaign to remove correct privacy/duplicate-content controls.

## Verification and release

- HTTP audited **235 distinct public pages**: all 73 community sitemap pages,
  a deterministic 100-page KFC/catalog sample and 65 KFC priority pages, with
  overlap deduplicated. The priority set includes all 31 guild sitemap pages,
  actual published simulator slugs, class talent pages and tool hubs.
- All returned 200 with matching canonicals, titles/descriptions and indexable
  metadata. KFC has 4,848 current sitemap URLs; the catalog audit is sampled,
  not a claim that all 4,848 pages were fetched. Four invented generic simulator
  slugs in preliminary probes returned expected 404s; the final audit uses real
  sitemap slugs and does not count those probes as broken product links.
- Full Linux Next 16.3.6 webpack production build, including TypeScript, passed.
  Scoped ESLint, formatting and `git diff --check` passed.
- Private-preview and live Chrome passed server-rendered links, canonical tags,
  keyboard navigation into both factions and layout checks at 1440 and 390 px.
- Three focused search-content tests passed. An earlier mixed 35-test run had
  32 passes and three database-dependent failures because the isolated local
  PostgreSQL on port 55432 is stopped. Those DB checks were not claimed as
  passing or redirected to production; this two-link change has no persistence
  changes. No DB integration suite or migration was required for the release.
- Only `wow-forever-discord` restarted. The Helper, guild site, calendar,
  ingestion and raid-worker PIDs were preserved, with no fresh fatal app errors.

Released November 2 at **10:00:54 UTC**:

- Source: `/home/wow-forever-discord-source-releases/seo-discovery-20261102`.
- Build directory: `.next-release-seo-discovery-20261102`.
- Build ID: `build-TfctsWXpff2fKS`; web PID: `1474299`.
- Changed source: `discord-website/app/(site)/page.tsx` only.
- Canonical page source SHA-256:
  `67d585d64195b6b13bb190dfc82956a7ac1c774e4d9a541dd695b74226a24abc`.
- Local receipts: `artifacts/seo-search-console-20261102/`.
- Private remote activation/rollback:
  `/home/wow-forever-discord/.data/seo-search-console-20261102/`.
- No commit or push was requested or created. No unrelated dirty source was deployed.

The worker remains on its separate November 1 release with the illustrated-card
overlay. This website release does not replace the worker or its durable message
receipts. Future worker releases must still include the canonical latest native
contracts and roster-announcement renderer.

## Next review

Review URL inspections and sitemap processing after November 9, then compare
complete performance periods after November 16. These dates are review points,
not a deadline by which Google must index the requested pages. No new scheduled
job was installed; the existing read-only Search Console importer still requires
its separately configured OAuth access.

1. Track the nine requested pages separately from the older bulk exclusion count.
   Record Google's crawl date, selected canonical and actual index state. Do not
   resubmit daily or equate the priority queue with inclusion.
2. For the community, assess the query/page pairs already receiving impressions:
   branded Discord, class discussions and recruitment. Shaman and Warrior
   Discord queries each average 7.3 but have under 1% CTR. Improve useful class
   discussion/build guidance on existing destinations if subsequent evidence
   supports it, rather than generating nine duplicate invitation pages.
3. KFC's 57 impressions are too few to justify a confident title experiment.
   First determine whether its useful guild and tool pages are actually crawled.
   Retain the distinct guild/community identities and truthful public content.
4. Continue original tested build/rotation guides and real group activity. Links
   from relevant independent communities can help discovery and recognition;
   no external messages, directory submissions, purchased links or fabricated
   activity were authorized or sent in this task.

[Google URL Inspection guidance](https://support.google.com/webmasters/answer/12482179)
distinguishes live eligibility from the indexed state.
[Google's indexing report guidance](https://support.google.com/webmasters/answer/7440203)
explains why correct redirects, noindex and robots exclusions need not be fixed.
Neither sitemap submission nor a successful live test guarantees ranking.
