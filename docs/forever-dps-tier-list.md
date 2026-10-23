# WoW Forever DPS tier list

## Product

Raid route: `/tools/forever/tier-list`; Solo route: `/tools/forever/tier-list/solo`.
Each has its own canonical, metadata and independently ranked SSR content.
The page is a server-rendered, searchable
comparison of published pre-raid builds, with class filters, explicit tier boundaries,
sampling margins, expandable build details, original gear/rotation links and reproducible
benchmark imports. The Forever hub, simulator directory and individual simulators link to
it. Canonical/Open Graph metadata, breadcrumbs, an ordered structured-data list and a
sitemap entry make the actual content discoverable without loading a simulation engine.

This is original KFC content and measurement, not copied competitor scores or an assertion
that the highest single-target damage is the best raid composition.

## Numerical contract

`infra/simulator/tier-scenarios.mjs` owns the two versioned comparison policies.
`tier-benchmark.mjs` retains the original hybrid policy for historical reproduction.
Both current policies use:

- Level 60, one stationary level-63 Dragonkin, 300 seconds, no duration variation or
  health-based early ending.
- Solo: configured maintained self-support only, no outside buffs, boss debuffs or
  mana grants. Talent, form, pet and rotation effects still follow the pinned engine.
  A Shaman receives one air totem rather than two incompatible buffs.
- Raid: full-v2 raid, party and individual support plus the policy's documented boss
  debuffs. Stacking and caps follow each engine. No world buffs, external Power
  Infusion or Innervate.
- Each published standard build retains its reviewed gear, enchants, talents, race,
  professions, consumables, positioning and explicit rotation.
- 5,000 genuine WASM fights per build, fixed seed `58723001`. Each profile uses its
  selected immutable engine and database. Provisional proc-enchant variants are excluded.

The same character configuration and rotation is retained across both scenarios;
Solo does not imply separately optimized solo play, farming speed or boss survival.
The first split covers 21 published standard builds across eight classes, totaling
210,000 new fights. Retribution, Shockadin, DS/Ruin and Destruction await compatible
numerical publication before being added.

These are **new scenario measurements**, not replacements for the original
40,000-fight validation scores, new gear optimization studies, actual raid logs or
live-server mechanic confirmation. The class-specific engines retain their own reviewed
model corrections. Acquisition restrictions and beta assumptions still apply.

S/A/B/C/D boundaries are 95/85/70/55 percent of the top measured build. The approximate
95% sampling margin is `1.96 * stdev / sqrt(iterations)`; adjacent differences within
the combined sampling margin are labeled near ties. These margins do not quantify
model uncertainty or establish an optimal rotation.

## Ownership and freshness

- `scripts/benchmark-simulator-tier-list.mjs`: authenticates publication, database and
  WASM hashes; admits rotations through the real engine; runs browser worker jobs;
  retains complete binary requests and responses in immutable local evidence files.
- `apps/web/src/lib/data/forever-dps-tier-list.{solo,raid}.json`: generated, committed
  public snapshots. The unsuffixed JSON remains historical. Raw input/output evidence
  stays in the ignored artifact tree, keyed by the full binary request and policy.
- `forever-dps-tier-list.ts`: validated public contract, ranking, tier assignment and
  filtering. It does not run simulations.
- `forever-dps-tier-list-data.ts`: binds the snapshot to the installed published-build
  identities. Missing evidence or changed publications hide the ranking and mark the
  page noindex until the new build set has been measured. No old score is relabeled.
- `components/forever-dps-tier-list.*`: accessible comparison board; all rows and links
  render before hydration. Filtering retains the original absolute ranks.

Retribution, Shockadin and Destruction are not automatically ranked merely because an
engine supports them. They require a published reviewed build and a measurement under
this same policy. Tank and healing rankings require different metrics.

## Reproduction

Use the prepared research workspace with the exact installed publication root, pinned
protobuf codec and Chromium. Measure with an explicit scenario and artifact root.
To verify existing evidence and regenerate links without running any new fights:

```sh
node scripts/benchmark-simulator-tier-list.mjs --scenario=solo --artifact-root=/absolute/frozen-root --verify-cache --write-snapshot
node scripts/benchmark-simulator-tier-list.mjs --scenario=raid --artifact-root=/absolute/frozen-root --verify-cache --write-snapshot
node --test infra/simulator/tier-benchmark.test.mjs infra/simulator/tier-scenarios.test.mjs
pnpm --filter @wow-trader/web exec vitest run src/lib/forever-dps-tier-list.test.ts src/lib/forever-dps-tier-list-data.test.ts src/components/forever-dps-tier-list.test.tsx src/components/forever-dps-tier-page.test.tsx
```

The browser benchmark runs locally, not as page-request work on production. Saved evidence
is identified by the complete binary request, including equipped item/enchant data, rather
than by a class name or a rounded DPS number. Do not manually edit scores, substitute
an older engine, weaken admission checks or enable provisional proc variants to fill gaps.

The “Simulate Solo/Raid setup” link imports the exact encounter, support and character,
plus 5,000 iterations and seed 58723001 through the native `?i=gtrcmxeu` categories.
It bypasses ordinary raid-default migration. Save a personal character before import;
this action also changes sampling preferences. The original reviewed-build link is
separate because that experiment can have different support.

The community importer verifies both snapshots against complete saved binary evidence
before writing its bundle and downloads. Its one-article publication script compares
the existing editorial fingerprint, writes a private backup and refuses concurrent or
unrecognized edits. No other guide or publishing state is changed.

## Deployment acceptance

Deploy only committed, pushed source and its matching reviewed simulator artifact root.
Before and after activation, verify the actual SSR ranking, its canonical/structured data,
sitemap entry, internal links, filters, expandable rows, 320/390/1440 px layouts and a real
benchmark import. Verify that the Priest first-visit defaults still equip Spellblade and
that saved personal builds remain intact. A numerical snapshot or HTTP 200 alone is not
deployment acceptance.
