# Separate Solo and Raid DPS benchmarks

Status: both scenarios measured, committed, pushed, deployed and publicly verified.
This is separate from the committed `a719aa6` dungeon-order release.

## Problem verified

The public community article lists Fury at 597.9729 DPS. Its authenticated common
benchmark intentionally supplies full-v2 buffs but clears all external debuffs.
The Warrior simulator's published Fury reference is 838.1323 DPS, from a different
support scenario. Decoding and comparing the two saved setups confirms the same
equipment and rotation, but different support: the original includes Faerie Fire,
Improved Expose Armor, Sunder Armor, Curse of Recklessness and Gift of Arthas.
The article is therefore neither an unassisted solo benchmark nor a fully supported
raid benchmark. Its score must not simply be renamed to either.

## Confirmed product contract

- Solo means sustained DPS against the same boss, not farming, leveling speed or
  survivability. Remove outside buffs, resource grants and boss debuffs. Retain the
  character's own pet, self-buffs and self-applied effects according to its pinned
  engine, trained abilities and explicit rotation.
- Raid means sustained DPS with a documented common raid-buff and boss-debuff policy.
  No world buffs or external Power Infusion/Innervate unless explicitly introduced
  as a separate policy revision.
- Both use level 60 versus one stationary level-63 target for 300 seconds, the same
  equipment, professions, consumes, positioning and rotation per reviewed build.
  This isolates support, not a claim that the existing raid rotation is solo-optimal.
- Measure each build independently in both scenarios. Rank and assign tiers against
  each scenario's own leader; never use a fixed multiplier or old validation DPS.
- Make Raid/Solo visible before the scores. Preserve selection in the URL and serve
  the selected ranking in HTML. Filters, labels, JSON-LD and methodology must agree.
- Each result needs an exact benchmark import, scenario label, date, sampling margin
  and request/response/engine/database identities. The import must not receive the
  normal raid-default migration when the user is reproducing a Solo measurement.

## Implementation order and acceptance

1. Audit self-support ownership and trained-rank behavior in every selected immutable
   engine. Clearing all support alone is insufficient: several reviewed rotations
   assume precast self-buffs supplied by configuration. Do not grant one class another
   class's buff, stack incompatible self-blessings or invent talent ranks.
2. Implement versioned, pure Solo/Raid setup transformations with source-bound tests;
   retain the old hybrid policy only as historical reproducible evidence.
3. Extend the evidence runner to produce independently authenticated scenario receipts,
   refusing changed publications, engines, unsupported fields or rotation warnings.
4. Run fresh real WASM measurements, retaining complete reproducible inputs/results.
   Verify sampled public imports reproduce the same request and score within the
   stated sampling contract. Test no raid-default leakage on initial load and reload.
5. Update both ranking surfaces and class-guide links from the same scenario evidence.
   Do not silently publish local numerical-model updates to make a link resolve.
6. Verify schema rejection and binding, independent ordering/tiering, switching,
   keyboard access, no-JS HTML, empty/error states and 1440/390/320 layouts.

## Publication boundary

The current frozen Helper simulator installation has 21 standard measured builds.
The newly published community article contains 25 builds from a newer reviewed
research set. Exact model/publication availability must be checked before linking
new scenario imports. A ranking must not claim its setup is available publicly
when that immutable engine or catalog has not been installed. Numerical publication
is a separate verification step, not an incidental side effect of this UI change.

The user selected the 21 currently published standard builds first. Both datasets
contain fresh 5,000-fight measurements per build: 210,000 fights in total, with seed
58723001. Solo policy SHA-256 is
`3e61ec9d40c4842f0ec9174e72c5d4daf07832845bdb6fbb64e73a8198f678dc`;
Raid is `d45eb0dc4cc4511131e0fda84f3ae90ebdfac8c95fbe5ed0b867bf7f7fce4e84`.
Fury measures 416.6808 Solo and 839.8683 Raid DPS. The leaders differ: Demonology
Solo and Marksmanship Raid. These are independent results, not scaled old scores.

The Helper renders Raid at `/tools/forever/tier-list` and Solo at `/solo` below
that route. The community article selects its SSR mode with `?scenario=solo|raid`.
Both consume the same authenticated snapshots. The original hybrid snapshot and
newer class-guide research remain historical references, not these rankings.

Exact imports use the frozen simulator's supported `?i=gtrcmxeu` category selector
to load gear, talents, rotation, consumes, miscellaneous, external support, encounter
and UI sampling settings. Without the last category, the simulator retains the
reader's iteration count and seed. Imports must not receive raid-default migration.
Public Fury imports reproduced both recorded scores at 5,000 iterations, with
matching support/character/encounter inputs and no production event writes.

Local browser checks passed both sites and both modes at 1440, 390 and 320 pixels,
including filtering, mode persistence, back navigation, images and exact import
links. Rankings load no numerical engine. Offline evidence verification reuses the
42 measured responses and starts zero new fights.

The user authorized committing, pushing and deploying both repositories after
checks. The verified application commits are Helper
`e1b02de4eaa46717b8136b2e26e30e29c27fe9cf` and community
`c8ad9cab901f6a761ad7917b675f56410d2c0684`. Documentation follow-ups do not change
these deployed application identities.

## Verified production rollout

- Raid: https://kfcguild.online/tools/forever/tier-list
- Solo: https://kfcguild.online/tools/forever/tier-list/solo
- Community article: https://www.wowforeverdiscord.online/guides/wow-forever-dps-tier-list
  with `?scenario=raid|solo`.

Both exact pushed archives were built on Linux. The full local Helper suite passed
1,484 tests; the committed Linux candidate passed 19 focused web tests, 34 policy
and deployment tests, typecheck, lint and its production build. The rebased community
suite passed 393 tests, typecheck and scoped lint; its Linux build passed source,
compiled-output and static-asset guards.

Candidate and public browser checks each passed 12 site/mode/width combinations,
with filters, mode reload/history, icons, exact imports and no horizontal overflow.
Both sites expose all 21 rows in server HTML. Canonicals, indexability, Helper
JSON-LD and the Solo sitemap entry passed. The public sweep covered 13 pages and
127 assets, including both homepages, both simulators and the previously reported
recipe icons. Warrior/Priest preset switching and real WASM smoke runs passed at
all three widths; candidate/public outputs match. All non-read QA requests were
blocked, including any sampled legacy RUM attempt.

The community update changed only the recognized tier article. Its other 26 guides
remain byte-identical; category, author, cover, visibility and publication date were
preserved. The first rollout safely restored the previous website when an
unprivileged publication command could not traverse the private audit directory.
The retry ran the guarded publication CLI as the deployment operator, kept the
backup private (0600) and retained the unprivileged website runtime. No directory
permissions were relaxed and no article change occurred during the failed attempt.

The frozen numerical root remains `results-20261022-2489a71`. All 49,265 artifact
files passed checksums before and after Helper activation; numerical selections
remain unchanged after both releases. The 768 MB Helper runtime heap, enabled usage
collection and unrelated services were preserved. Owned previews, tunnel and local
test database were stopped.

With the user's separate cleanup approval, six unused old community snapshots were
removed in full after active-process and retained-symlink checks. Shared application
data, the live release and rollback releases were retained. Cleanup restored about
8 GB before builds; approximately 6 GB remained after the new candidates.

Private server receipts and guarded rollback commands:

- Helper: `/home/wow-trader-system/shared/backups/tier-solo-raid-20261023-e1b02de/`;
  `node control.mjs --rollback` from that directory.
- Community: `/home/wow-forever-discord-release-audit/tier-solo-raid-20261023-c8ad9ca/`;
  `node control.mjs --rollback` restores the article backup and prior website while
  refusing a later deployment or editorial change.

Local screenshots and verification reports are retained under
`artifacts/deployments/tier-solo-raid-20261023` (ignored). No newer research model or
the four omitted research builds were published by this rollout.
