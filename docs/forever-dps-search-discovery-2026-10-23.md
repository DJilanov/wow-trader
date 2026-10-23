# DPS search intent and internal discovery

Status: committed, pushed, deployed and publicly verified.

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

## Verified rollout

Application commits: Helper `65ce30606f600f91994f06075945705c98bdbd14` and community
`af3a56a8c2bec838e80cbf03165b4e83f8f78700`. Both exact archives were built on Linux.
The Helper candidate passed 20 focused web tests and 34 policy/deployment tests,
typecheck and lint. A transient font-bundling failure was resolved by removing only
the incomplete candidate output and rebuilding the same committed source; no font
or numerical asset was replaced to bypass a check.

Private editorial preview checks passed all 30 article/class/width cases. Candidate
and public discovery checks each passed 12 entry-page/width cases with JavaScript
disabled. All 30 public editorial cases passed after the database update, together
with 13 SEO checks and a 22-page/453-asset public sweep. The comparison article has
no embedded ranking board. The two numerical pages still render their 21 builds,
their canonical URLs, structured data and sitemap entries.

The atomic publication changed exactly ten recognized guides; the other 17 guide
records and protected fields on the ten updated guides were preserved. The update
is idempotent and its private backup supports guarded rollback. Source changes and
the actual published database content were both checked.

Warrior/Priest preset switching and genuine fixed-seed smoke runs passed at 1440,
390 and 320 pixels before and after activation, with matching result text. All
11 profiles/23 published entries passed delivery verification. The 49,265 numerical
artifacts passed checksums before and after Helper activation; numerical selections,
the 768 MB runtime heap, enabled usage collection and unrelated services were
preserved. QA blocked all non-read requests. Owned previews, SSH forwarding and the
isolated database were stopped.

Community retention now keeps the live source release and the two most recent
rollback releases. The two older clones were removed after process, symlink and
active-configuration checks. Shared state and private backups remain intact;
approximately 6.4 GB was free after deployment and cleanup. Helper historical
sources used by running workers were not broadly pruned.

Private server receipts:

- `/home/wow-trader-system/shared/backups/seo-discovery-20261023-65ce306/`
- `/home/wow-forever-discord-release-audit/seo-discovery-20261023-af3a56a/`

Run the community receipt's `node control.mjs --rollback` first to restore the ten
articles and prior website, then the Helper receipt's same command if needed.
Both refuse a later deployment; article rollback also refuses subsequent editorial
or SEO edits. Local screenshots and reports are under
`artifacts/deployments/seo-discovery-20261023` (ignored). Later documentation-only
commits do not change the deployed application identities recorded above.
