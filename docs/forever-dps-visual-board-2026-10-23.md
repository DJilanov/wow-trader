# KFC Solo/Raid visual tier board

Status: implemented and locally verified; production rollout pending.

The KFC ranking routes still used a stacked row list after the community site
received the newer icon board. Both KFC modes now use that visual design: colored
S–D bands, spec portraits, class badges, DPS beneath each portrait and a selected
build preview. The complete score table is available under a native expandable
summary. It preserves every build, exact import and original reviewed-build link
in server HTML.

Search, class filters, empty/reset states, native keyboard selection and independent
Solo/Raid routing remain supported. Button styles are scoped against KFC's global
uppercase/spacing rules so captions and DPS remain inside their tiles on mobile.
All artwork is local; its source hashes and attribution are retained in the public
asset manifest. The 30 JPEGs total 67,548 bytes. No production dependency is added.

The two measured datasets, numerical policies, tier boundaries, canonical URLs,
structured data and sitemap entries are unchanged. The community comparison guide
keeps its distinct editorial purpose; this change restores the visual ranking
board on the canonical KFC pages rather than duplicating it in the article.

Local verification: 22 focused ranking/SSR/asset tests, strict TypeScript and lint;
31 existing/new model-registry regression tests passed against the committed Sync
parent. Both modes passed browser checks at 1440, 390 and 320 pixels for grouping,
scores, selection, filters, keyboard use, full table, mode reloads, images and exact
imports. Mobile text containment was checked after correcting inherited button
typography. No numerical engine or production publication is changed by this UI.

Production acceptance requires the exact pushed Linux source, the frozen numerical
installation, candidate/public visual inspection and asset checks, source/artifact
identity guards and unchanged sibling services. Deployment receipts record the
actual released commit after those gates pass.
