# Multicore route builds

The offline builder can run its independent funding forecasts in reusable Node worker threads. The same pure TypeScript simulation runs in serial and parallel modes. The coordinator preserves scenario order, candidate order, tie-breaking and every existing route, XP, enemy-level and quest-log check. It makes route decisions sequentially after receiving the complete batch.

`CampaignFundingPool` is exported from `@wow-trader/leveling/node`; the ordinary package entry remains usable without Node workers. Both `prepareCampaignPlan` and `fundCampaignQuestGaps` accept its explicit executor. Preparation passes that executor through funding, proposal validation, visit reordering and the final funding review. No global executor or mutable execution setting is installed. Funding policies reuse the forecast already owned by the unchanged selected plan; changed proposals still receive a complete replay before acceptance.

## Commands

Both commands select workers automatically. Append `--workers=8` to the existing funding-audit or campaign-addon build arguments to request eight explicitly, or `--workers=1` for serial execution:

```sh
pnpm leveling:xp:funding:audit --facts=SNAPSHOT --combat=ROOT --catalog=ROOT --workers=8
pnpm leveling:addon:campaign [existing build arguments] --workers=8
pnpm leveling:workers:test
```

The first two commands retain their existing input and publication requirements. They do not publish, install or deploy a guide. The addon command still requires all its normal target-build and RestedXP arguments.

Without an override, the pool chooses up to eight workers, reserves one available CPU and checks free memory at construction. Each worker has a 512 MiB V8 old-generation limit. An explicit worker count from 1 to 64 is accepted. One worker or fewer than 100 actions uses the serial path to avoid startup overhead. The pool is reused across batches and editions, and is always closed in the command's `finally` block.

```ts
import { prepareCampaignPlan } from "@wow-trader/leveling";
import { CampaignFundingPool } from "@wow-trader/leveling/node";

const pool = new CampaignFundingPool({ workers: 8 });
try {
  const prepared = prepareCampaignPlan(plan, sources, evidence, {
    ...options,
    fundingExecutor: pool.execute,
  });
  // The caller saves or reviews prepared using its existing artifact process.
} finally {
  await pool.close();
}
```

The coordinator is synchronous and uses bounded waits while workers calculate. This API is for offline build commands; it is not added to website request handlers. Automatic website loading of precomputed qualified routes remains separate work.

## Explicit scenario scopes

`CampaignFundingPool({ scenarios })` can run a declared subset of `campaignFundingScenarios(plan)`. Omit it to retain every supported scenario. The pool copies the selection, preserves canonical scenario order, and rejects empty, duplicate or unavailable cases. Serial fallback and parallel execution use exactly the same selected scenarios. Statistics count the work actually executed.

For the priority shared Human party, the experienced mandatory-dungeon profile with optional stops included has three loot workloads. Those three can use three workers while that route is completed. This is a separate, explicitly scoped calculation; it does not qualify the omitted settings, other editions or mixed rosters. Actual Warrior/Priest/Mage/Rogue/Warlock forecasts and native exports remain independent delivery checks. Broader validation remains required.

```ts
const scenarios = campaignFundingScenarios(plan).filter((scenario) =>
  scenario.difficultyPolicy === "experienced-premade" &&
  scenario.strategy === "dungeons" && scenario.optionalStops,
);
const pool = new CampaignFundingPool({ workers: 3, scenarios });
```

The worker contract tests compare serial and three-worker output, canonical order, copied selection state and invalid scopes. This is not a new website setting or a CLI flag, and no new end-to-end speedup is claimed without a measured run.

## Actual-route benchmark — November 4, 2026

On the local 11-core Mac, while the unchanged earlier builder was still running:

| Execution | 24 full funding forecasts | Relative to serial |
| --- | ---: | ---: |
| Serial | 20.669 s | 1× |
| Four workers, first batch | 8.620 s | 2.40× |
| Four workers, reused pool | 7.560 s | 2.73× |
| Eight workers, first batch | 7.491 s | 2.76× |
| Eight workers, reused pool | 7.514 s | 2.75× |

Every ordered result, including events and XP bounds, has the same SHA-256 as the serial result. Input bytes are unchanged. Evidence: `.cache/leveling-no-grind-20261031/route-worker-benchmark-v252.json` and `v253-worker-benchmark.log`. This measures repeated simulation, not an end-to-end builder speedup or full-guide readiness. Serialization, garbage collection, unequal scenario costs and sequential route choices limit scaling; eight threads do not imply an eightfold improvement.

## Avoiding repeated forecasts

A paired funding pass on the actual 1,654-action itinerary compares the frozen pre-reuse engine with current source, using the same reusable two-worker pool:

| Execution | Full replay batches | Scenario replays | Funding pass |
| --- | ---: | ---: | ---: |
| Before selected-plan forecast reuse | 17 | 408 | 227.172 s |
| After reuse | 10 | 240 | 132.310 s |

The complete returned plan has the identical SHA-256, and all input bytes remain unchanged. Every changed candidate is still replayed. Other checks shared the machine during this single comparison, so the timings are illustrative rather than an isolated throughput guarantee. The replay-count reduction is deterministic for this input. Evidence: `.cache/leveling-no-grind-20261031/policy-reuse-performance-v278.json` and `v279-policy-benchmark.log`; pool counters in the second row of the raw report are cumulative.

## Failure handling and verification

Projected route handoffs can preserve partial combat counters explicitly. Pass
`captureCombatAfterActionIds` to `forecastCampaignXp` for the specific handoff
boundaries under review, serialize the whole `campaignRouteHandoff` result, and
resume at the next active action with both `initialBounds: handoff.xpBounds` and
`initialCombatProjection: handoff.combatProjection`. The snapshot contains modeled
counters, consumed activities, path kills and acquisition context. It is a
hypothetical continuation, never an observation of actual player progress.

Capture is opt-in: ordinary forecasts do not copy combat state after every action.
Use the same immutable route for capture and continuation. Snapshots require
known, unblocked bars for all five members and check route release/build/source
identifiers, active objective definitions, party bars, confirmations, numerical
settings and XP bounds. The independent review also pins the complete plan bytes.
Unknown counters from an actual accepted quest remain unknown; a caller without a
snapshot retains the existing conservative behavior.
Do not attach these snapshots to actual XP recordings or treat them as verified
server payouts. Replay checks compare every subsequent event and endpoint against
the uninterrupted forecast.

Workers receive one shared serialized plan and assigned scenarios. Results are restored to their canonical indices. A failed, incomplete, duplicate, stale or timed-out batch is rejected; partial forecasts never qualify a route. An error closes the pool. The default batch timeout is 60 seconds and can be configured for larger offline studies. An abrupt worker failure may be reported by that deadline while the synchronous coordinator waits.

`node --test scripts/leveling-worker-pool.test.mjs` checks real worker execution, exact serial equivalence, pool reuse and closure, the production preparation/funding integration, equal-score quest selection, serial fallback, errors, deadlines and invalid settings. The funding regression also verifies that an unchanged plan is replayed once across policies and that changed candidates are replayed separately.

## Production composition and preserved routes

The frozen V277 production preparation completed with exit 0 at 10:52:34 UTC on November 4: **13 minutes 18 seconds**, eight workers, 150 parallel batches and 3,600 scenario replays. It preserves all 832 approved actions through level 30. An independent audit passes 48 fresh/restored forecasts for the five actual classes, including event conservation, enemy access, duplicate rewards, forty-slot capacity and continuation from the saved level-30 handoff. Evidence is `prefix-xp-production-v277-review/` and `production-prefix-audit-v280-summary.json` under `.cache/leveling-no-grind-20261031/`.

This is a successful production-composition check, not a matched end-to-end speed comparison or a complete guide qualification. The V244 and V260 runs failed their prefix guard and remain recorded as failures. V273 isolated the cause: restoring approved tasks retained combat activities belonging to the discarded tasks. Preparation now reattaches combat immediately after prefix reuse, checks the prefix after each transformation, and prevents visit batching from moving locked actions. This correctness repair must not be credited as a parallelism speedup.

The performance-only campaign revision v189 retained XP revision v154. Later entrance-placement and conditional-funding work advances the current model; the authoritative current certificates are selected by `data/leveling/validated-segments/primary-human-five/current.json`. Historical timings and frozen studies above remain unchanged. V288's corrected entrance placement also passes full production preparation and an independent 48-case audit. [Current numerical results and remaining scope](forever-leveling-product-plan.md#current-local-state--multicore-builder-and-library--entrance-integration-v258v260).

The V282 performance verification passed 3,152 leveling tests, 203 web-leveling tests and 25 worker/CLI/lock tests, plus the ESM/declaration build, strict package/web checks and package/script lint. Its receipt remains `.cache/leveling-no-grind-20261031/verification-v282-multicore.json`; subsequent source and dataset qualifications are recorded in the current plan.
