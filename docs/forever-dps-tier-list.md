# WoW Forever DPS tier list

## Product

Canonical route: `/tools/forever/tier-list`. The page is a server-rendered, searchable
comparison of published pre-raid builds, with class filters, explicit tier boundaries,
sampling margins, expandable build details, original gear/rotation links and reproducible
benchmark imports. The Forever hub, simulator directory and individual simulators link to
it. Canonical/Open Graph metadata, breadcrumbs, an ordered structured-data list and a
sitemap entry make the actual content discoverable without loading a simulation engine.

This is original KFC content and measurement, not copied competitor scores or an assertion
that the highest single-target damage is the best raid composition.

## Numerical contract

`infra/simulator/tier-benchmark.mjs` owns the common comparison policy:

- Level 60, one stationary level-63 Dragonkin, 300 seconds, no duration variation or
  health-based early ending.
- Full-v2 raid, party and individual support. No world buffs, externally supplied
  Power Infusion or Innervate. No external boss debuffs; effects supplied by the player
  or pet remain modeled.
- Each published standard build retains its reviewed gear, enchants, talents, race,
  professions, consumables, positioning and explicit rotation.
- 5,000 genuine WASM fights per build, fixed seed `58723001`. Each profile uses its
  selected immutable engine and database. Provisional proc-enchant variants are excluded.

These are **new common-scenario measurements**, not replacements for the original
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
- `apps/web/src/lib/data/forever-dps-tier-list.json`: generated, committed public
  measurement snapshot. Raw input/output evidence stays in the ignored artifact tree.
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

Use the prepared research workspace with its immutable simulator artifacts, pinned
protobuf codec and installed Chromium. Start the normal loopback web preview, then run:

```sh
SIMULATOR_TEST_URL=http://127.0.0.1:3334/tools node scripts/benchmark-simulator-tier-list.mjs
node --test infra/simulator/tier-benchmark.test.mjs
pnpm --filter @wow-trader/web exec vitest run src/lib/forever-dps-tier-list.test.ts src/lib/forever-dps-tier-list-data.test.ts src/components/forever-dps-tier-list.test.tsx
```

The browser benchmark runs locally, not as page-request work on production. Saved evidence
is identified by the complete binary request, including equipped item/enchant data, rather
than by a class name or a rounded DPS number. Do not manually edit scores, substitute
an older engine, weaken admission checks or enable provisional proc variants to fill gaps.

The “Open benchmark setup” link imports the common encounter and support with that build;
set 5,000 iterations and seed 58723001 to repeat the sampling. Save an existing personal
character before importing any build.

## Deployment acceptance

Deploy only committed, pushed source and its matching reviewed simulator artifact root.
Before and after activation, verify the actual SSR ranking, its canonical/structured data,
sitemap entry, internal links, filters, expandable rows, 320/390/1440 px layouts and a real
benchmark import. Verify that the Priest first-visit defaults still equip Spellblade and
that saved personal builds remain intact. A numerical snapshot or HTTP 200 alone is not
deployment acceptance.
