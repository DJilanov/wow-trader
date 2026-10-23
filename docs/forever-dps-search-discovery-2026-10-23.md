# DPS search intent and internal discovery

Status: implementation and local checks complete; production rollout pending.

KFC owns the full numerical Solo and Raid rankings and their exact simulator
imports. The community website's existing `wow-forever-dps-tier-list` URL becomes
an editorial guide titled **WoW Forever Solo vs Raid DPS: How to Compare Builds**.
It explains support, fair comparisons, a source-derived Fury example and a
reproduction workflow, with prominent links to both KFC rankings. Its full ranking
board is removed. The URL remains stable and its canonical continues to identify
the unique community article; there is no cross-domain canonical or blanket noindex.

The Forever hub and simulator directory expose equally prominent, descriptive
links to both numerical rankings. Individual simulator headers link to both modes.
All nine community class guides also link directly to both KFC rankings and to the
explanatory article. Paladin's unranked research status remains explicit.
Both KFC ranking methodologies also link back to the editorial comparison guide.

Neither numerical measurements nor engine publication changes. KFC's two canonical
ranking URLs, SSR rows, structured data and sitemap entries remain intact. Community
titles, excerpts and Article metadata describe the editorial purpose; guide sitemap
timestamps follow the actual database update.

The ten-article refresh uses a bounded, atomic publisher. Recognized prior sources
are authenticated against the `c8ad9ca` publication fingerprints, with a small
compressed public-source regression fixture. The CLI writes a private backup before
updating, preserves custom metadata and refuses hidden, missing or edited guides.
Rollback is revision-bound and refuses later editorial or SEO changes.

Local validation includes SSR discovery tests, strict TypeScript, lint, the full
398-test community suite and isolated PostgreSQL tests for dry-run, ten-row
publication, idempotence, metadata preservation and guarded atomic rollback. Public
acceptance must verify the exact committed Linux candidates, links on desktop and
mobile, the unique article, all nine class guides, numerical invariants and assets.

Search Console account integration is outside this change. Technical crawlability
does not establish Google indexing or organic traffic growth.
