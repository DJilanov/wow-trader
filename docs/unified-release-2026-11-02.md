# Unified source release — November 2, 2026

The owner authorized commit, push and deploy across all three products, then
explicitly excluded the unfinished leveling files. Those working files were
left untouched and were never staged or uploaded. Builds came from Git archives.

| Product | Pushed application commit | Production build |
| --- | --- | --- |
| KFC guild | `48588cb7951879ec236d1ded5c045b90bae723e8` | `6CpKSTh2MQENvbfZIq5Jn` |
| Discord community | `f0686674302cc93d7e579c15dcd15e0a081f16e6` | `build-TfctsWXpff2fKS` |
| Helper | `511846676a1b0a9439350457f0085faac2100894` | `muKDKdMpDFNsWupZJcciV` |

The documentation completion commit is promoted as a new Helper source release
with the same compiled application. Promotion checks that the Git diff contains
only this receipt, `context.md`, `fixes.md` and the deployment runbook, and verifies
all other committed files against the already built source. It does not rebuild
or replace models, presets, extracted data or static assets. The active source
directory's `release-source.json` records both the exact documentation/source
commit and `compiledSourceCommit: 511846676a1b0a9439350457f0085faac2100894`.

## Git recovery

KFC's nine merge conflicts retained current upstream raid guides and local
calendar/recruitment work. Runtime/editor state was removed from tracking and
retained locally. The original conflict stages and index remain in
`artifacts/kfc-merge-recovery-20261102T113630Z/`.

Discord was integrated against upstream `2b7b781` in an isolated worktree. This
kept the newer native signup, roster confirmations, illustrated announcements,
calendar bindings and share metadata alongside upstream guide changes. Before
fast-forwarding its canonical checkout, the original source was backed up by
hash and saved in the stash named `Recovery snapshot before reviewed unified
release 2026-11-02`. Do not blindly reapply that stash: the reviewed changes are
already integrated. KFC and Discord now have clean canonical working trees and
match GitHub. Helper retains only the intentionally excluded leveling WIP.

## Verification

- Three clean Linux production builds and strict TypeScript checks passed.
- KFC: 69 tests. Discord: 585 tests, including the build guard regressions, plus
  36 native PostgreSQL checks. Helper: nine sitemap/SEO tests. All passed.
- KFC desktop/mobile checks covered the homepage, guide index, both native raid
  guides, recruitment, images, typography, canonical tags, overflow and calendar.
- Discord desktop/mobile keyboard navigation reached both faction destinations.
  Both leveling events use KFC Discord links, have specific event/share metadata,
  retain noindex, and reject anonymous access to roster confirmations.
- Helper checks covered all four healer libraries, Warrior engine initialization,
  Hunter, the 2,581-entry sitemap and the unchanged 32-profile composition API.
- Six live page asset sets contained 118 verified scripts, styles, fonts/images.
- All 300 KFC, 3,083 initial Helper and 1,704 Discord committed files were hashed
  against their deployed source. Only Next-generated type configuration changed
  in KFC/Discord. The final documentation source has a separate manifest check.
- Generated compressed delivery passed byte/hash, gzip, identity, caching and
  private-file checks before Helper activation. Previous assets were retained.

The original local database runs were superseded: SSH latency exceeded a short
transaction timeout, and simultaneous suites collided in their shared synthetic
bridge fixtures. Final checks ran sequentially next to a fresh, isolated
PostgreSQL cluster on loopback port 55432, using synthetic test credentials.
No tests ran against production data and no production migration was required.

Direct broad TypeScript checking in the old Discord checkout also scans ignored
historical source archives and lacks the separate bridge dependency install.
The isolated strict checks and real production compilation avoid those local
artifacts and passed. No source validation or access control was disabled.

## Runtime and rollback

KFC uses `/home/kfc-website-source-releases/48588cb7951879ec236d1ded5c045b90bae723e8`.
Discord uses `/home/wow-forever-discord-source-releases/f0686674302cc93d7e579c15dcd15e0a081f16e6`.
The raid and listing workers use the same source commit in sibling `-raids` and
`-listings` profiles; calendar uses the main Discord source release.

The raid worker keeps its exact existing `.data` directory, including roster
receipts. Calendar retains `/home/wow-forever-discord/.data`; listings retains
its existing private environment and restricted database role. Auction's full
12-file import graph already matches the release. Ingestion, bridge and unrelated
services were preserved. No production test signup, attendance reply, DM or new
announcement was sent by the verification process.

Previous web releases are retained:

- KFC: `/home/kfc-website-source-releases/raid-calendar-20261101`, build
  `.next-release-raid-calendar-20261101`.
- Discord: `/home/wow-forever-discord-source-releases/seo-discovery-20261102`,
  build `.next-release-seo-discovery-20261102`.
- Helper: `/home/wow-trader-system/releases/kfc-helper-seo-healers-20261102`,
  plus the freshly verified `kfc-helper-511846676a1b` build.

Private forward/rollback definitions, manifests, activation receipts, process
checks and test logs are under
`/home/wow-forever-discord/.data/unified-release-20261102/`. Keep them private.
Local browser evidence and recovery backups are under
`artifacts/unified-release-20261102/`. Temporary previews, synthetic PostgreSQL,
test source copies and the failed guard candidate are removed after validation;
active/rollback builds and all private durable state remain.
