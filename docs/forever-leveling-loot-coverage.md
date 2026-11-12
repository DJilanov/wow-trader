# Fixed-path loot coverage and Twisted Evils

The latest private V1540 candidate / V1539 engine retains this coverage calculation and all raw probabilities. It accepts Twisted Evils before the outer-cave preparation, counts required material fights once and keeps incidental carving progress unknown. Full single-clear yield remains unverified. [Current behavior, checks and limits](forever-leveling-collateral-loot.md). The V1483 results below are historical component evidence.

The private **V1483 engine** adds a fixed-path loot calculation and removes friendly spirit forms from Twisted Evils' selected combat sources. All **4,263 tests / 254 files**, strict typecheck, lint and six entrypoint builds pass. All 252 older test files remain unchanged. No probability, reward, current clear profile or new XP is adopted by this revision.

## Personal quotas and sharing

Twisted Evils remains **25 carvings per player, 125 inventory items for five players**. Both checked local client builds, 70205 and 70450, give item 17684 a first flags value of zero, corroborating the existing pooled reference. The multi-drop flag is absent. The current server's actual eligible drop probability is not established by that item field.

The selected combat pool now excludes the friendly Spirit of Maraudos and Spirit of Veng. Their raw capture records and the complete original alternative-source list remain in provenance. Their observations are not reassigned to the hostile transformations. The source correction does not invent repeatable Khan fights or infer a drop rate for another creature entry.

## Conditional coverage calculation

`estimateFixedLootCoverage` is exported from the leveling package. Callers supply a personal quantity, party size, sharing rule and fixed-one drop batches with explicit kill counts and probabilities. The function supports party sizes one through five and pooled, shared-roll or independent loot. For one player the sharing modes are mathematically equivalent; unknown multiplayer sharing remains unresolved.

The result reports total required inventory, uncapped and usable expected items, expected missing items, completion probability and failure probability. A separate `guaranteedGivenInputs` flag requires enough deterministic successful events. A floating-point success probability near one does not set that flag. Tiny failure tails are retained separately, and usable items cannot exceed the uncapped expectation or the quota.

The calculation assumes independent fixed-one events under the supplied rates and counts. It does not infer spawn populations, quest eligibility, current-server rates, fair loot allocation, travel or clear time. A bounded calculation returns `unknown` without a partial result if its budget is exhausted.

## Maraudon diagnostic

The pinned historical database contains 597 map-349 creature rows. Removing known conditional/pool/group rows and friendly forms leaves **317 rows** with both captured carving records and matching historical quest-only loot references. This cohort is a diagnostic input, not an authored player path or a verified current Forever clear.

Applying two separate rate hypotheses to that same cohort gives:

| Rate hypothesis | Expected items before the quota cap | Required inventory |
| --- | --- | --- |
| Captured table ratios, applied as per-eligible-kill rates | 52.92 | 125 |
| Historical 80% quest-only reference | 253.60 | 125 |

The captured records do not include an eligible-quest-kill denominator; the older quest-only rate is not a current-server observation. The difference exposes a data qualification problem. It does not establish that a real clear falls short, or authorize replacing captured probabilities with 80%. No single-clear completion guarantee or additional farming is inserted into the route.

## Verification and remaining work

The 24 new tests cover pooled personal quotas for all party sizes, distinct sharing modes, mixed-source probabilities against exhaustive outcomes, tiny failure tails, calculation limits, numerical item bounds and the spirit-source correction. The full V1456 route comparison preserves every field of **six current primary forecasts / thirty player ledgers** and **twenty native role exports**. No new native Lua syntax run is claimed; the compared Lua bytes are unchanged.

Six new saves after the Twisted pickup preserve all subsequent events, endpoints and XP bounds across **thirty player continuations**. Older hypothetical combat projections using the removed spirit definitions are rejected. The earlier 750-player continuation result remains historical evidence for V1459.

The primary lower bars remain **46 + 849 / 46 + 44,185 / 46 + 84,018** without optional mallet confirmation, then stop at unresolved normal Scion XP. Twisted acquisition, real-route integration, full 1–60, travel/current-game verification and the original **528 edition/settings, 32 mixed settings and 784 native starter cases** remain unfinished. The public V1394 download and canonical locks are unchanged.

Separately, **V1486 resolves the apparent Pariah hand-in conflict**: the provider distinguishes acquisition materials from the Union hand-in objective. **V1504 implements the captured return and V1496 inserts the complete method into the private primary candidate.** That addition does not qualify Twisted's current full-clear yield or the normal Scion payout. [Corrected semantics, implementation and evidence](forever-leveling-pariah-items.md).

Evidence under `.cache/leveling-no-grind-20261031/`: `mara-population-inspection-v1478.json`, `coverage-validation-v1482.terminal.json`, `coverage-engine-v1483/scope.json`, `twisted-clear-diagnostics-v1484.json`, `coverage-baseline-v1485.json`, `pariah-hand-in-semantics-v1486.json`, `coverage-qualification-v1487.json`, `source-flow-progress-v1488.json` and `coverage-handoffs-v1489.json`.
