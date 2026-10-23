# KFC Solo/Raid visual tier board

Status: committed, pushed, deployed and verified on both public ranking pages on
October 23, 2026.

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
typography. No numerical engine or numerical publication is changed by this UI.

## Production release

- Application commit: `e7a7680b09fa92a61de35a02787e1da250ba8171`.
- Source and static delivery release: `kfc-helper-tier-board-20261023-e7a7680`.
- Next build ID: `nVIojhgTQU7OCaUkk9Nq7`.
- Live Solo: <https://kfcguild.online/tools/forever/tier-list/solo>.
- Live Raid: <https://kfcguild.online/tools/forever/tier-list>.
- Server receipt: `/home/wow-trader-system/shared/backups/tier-board-20261023-e7a7680`.

The exact pushed archive passed its Linux production build, 22 focused web tests,
31 model-registry tests, 34 policy/deployment tests, typecheck and lint. All 1,507
tracked source blobs and 49,265 frozen numerical artifacts were verified before
and after activation. Static delivery verified 48,777 files and 2,622 compressed
variants.

Candidate and public checks passed for both modes at 1440, 390 and 320 pixels:
six interactive browser cases and six text-containment cases per environment.
The deployed desktop and mobile boards were visually inspected. All 30 artwork
files matched their recorded hashes over HTTP. Both pages retained their canonical
URLs, indexability, 21 server-rendered tiles, complete 21-row evidence table,
structured data and sitemap entries. The public asset sweep checked 475 assets
across 23 pages.

Simulator delivery passed for all 11 profiles and 23 library entries. Real WASM
and preset-switching checks passed for Warrior, Smite Priest and Warlock at all
three candidate widths (nine cases), followed by public desktop checks (three
cases). The candidate and public metrics matched. These short smoke runs do not
replace the published 5,000-fight ranking measurements.

The numerical installation remains `results-20261022-2489a71`, with all four
active/model/profile/publication pointer hashes unchanged. Protected sibling
processes retained their PIDs, restart counts and memory limits. Anonymous usage
collection, the 768 MB web heap and unrelated runtime settings were preserved.
The community comparison article was neither republished nor restarted.

`final.json` in the receipt records all seven candidate and seven public gates,
the release identity, unchanged sibling services and numerical pointers, and the
stopped preview. The owned SSH tunnel was also closed. For a guarded rollback,
run `node control.mjs --rollback` from that receipt directory; it checks the
current release before restoring the previous Helper source, static delivery and
build labels. Documentation-only follow-up commits do not change the deployed
application identity above.
