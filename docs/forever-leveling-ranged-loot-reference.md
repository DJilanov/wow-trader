# Ranged quest-item drops: evidence and implementation work

## Current finding — November 5

The historical fixed-one importer remains unchanged. A separate opt-in implementation now imports explicitly sourced variable-stack metadata. The current captured percentages for the two outdoor quests below are item-count ratios, however, and do not establish the probability of a successful multi-item drop. Quantity metadata alone does not qualify their kill estimates. The crawler follow-up is now qualified in the separate V1320 quest-only candidate; Jarl Needs Eyes is now qualified in the separate V1340 quest-only candidate, with the real parent, forty eyes per person, safe camp and return. The crawler quest-only program is included in the **17:34:44 UTC V1331 publication**; The later Jarl quest-only program remains unpublished. [Its qualification](forever-leveling-quest-availability.md). Neither receives invented acquisition XP. [Publication evidence](forever-leveling-download-deployment-2026-11-04.md).

| Quest / source | Existing evidence | Status |
| --- | --- | --- |
| 1258, … and Bugs; Silt Crawler 922 | Twelve Pristine Crawler Legs per player; captured item-count ratio 57.1613%; historical SQL has 1–2 per successful drop | Quantity reference implemented; event probability unresolved; full quest-only candidate qualified |
| 1206, Jarl Needs Eyes; Darkmist Spider 4376 | Forty eyes per player; captured item-count ratio 85.0446%; historical SQL has 1–3 per successful drop | Quantity reference implemented; event probability unresolved; method not admitted |
| Fixed-one importer | Preserves captured probabilities and only supplies qualified missing fixed-one metadata | Implemented; remains unchanged |
| Explicit ranged-stack reference | Bind the SQL row, creature/item identities, source revision/hash, and stack-selection rule | Implemented in the isolated V1285 prototype; source pins and schema validated |
| Ranged-stack enrichment | Fill only missing compatible metadata; preserve captured rates, samples, timestamps, quantities and empirical distributions | Implemented and tested; six existing captured pairs enriched without changing rates |
| Single weighted-collection selection | Reuse the existing single-objective mean and quantiles without claiming independence between objectives | Implemented and tested with synthetic reported event probabilities; actual sample ratios remain unknown |
| Quest reintegration | Retain complete pickups, prerequisites, individual counters, enemy access and actual returns; compare travel and work | Crawler program qualified; eyes program component-only |
| Full validation | Component, fresh/resumed five-class forecasts, native exports, then the original wider matrix | Crawler primary-party revision passes; full 1–60 and wider matrix pending |

The existing variable-stack estimator already accepts an explicit weighted quantity distribution. It must continue to reject a bare min/max range. A new historical reference must be explicit; neither the presence of a range nor a missing count establishes a uniform distribution on Forever. An empirical captured distribution, when available, takes precedence.

The primary [CMaNGOS loot implementation](https://github.com/cmangos/mangos-classic/blob/3e488ebf1cd85efef6e24880e9495d9efcc32577/src/game/Loot/LootMgr.cpp#L425) selects a count between the SQL limits. Its pinned [`urand` implementation](https://github.com/cmangos/mangos-classic/blob/3e488ebf1cd85efef6e24880e9495d9efcc32577/src/shared/Util/Util.cpp) uses an inclusive uniform integer distribution. This qualifies an explicit historical conditional stack assumption, not verified Forever server code or a measured current distribution. Planning output identifies that assumption separately.

V1288 passes **4,071 tests across 239 files**, strict typecheck, lint and build. Regression coverage preserves the rejection of actual multi-item sample ratios, bare min/max bounds, conflicting metadata, multiple variable objectives and separate kill-floor combinations. Synthetic reported-probability solver tests are not evidence for the actual two quests. The component trials that could not price the captured ratios remain recorded as failed attempts.

Pricing acquisition kills still requires an explicit successful-drop event probability, or a separately justified model for the captured counts and stack distribution. Do not relabel an item-count ratio as a reported event probability or divide it by an assumed mean silently. Ordinary source requests returned HTTP 403; that result does not justify inventing the missing semantics.

## Full crawler program qualified — V1320–V1326

The separately checked crawler program now uses the existing omission path on the real route, retaining the twelve-leg personal quota, parent pickup, northern camp and Theramore return. It adds only the existing 3,150 quest reward; actual gathering kills and time remain unpriced. All 4,092 tests, 2,110 saved player continuations and 320 native exports pass. The fast gap is now 2,776 XP. This is not a probability-model qualification or publication. [Exact method and evidence](forever-leveling-crawler-followup.md).

## Separate quest-only forecast path — V1310

The existing `exclude-unpriced-extra` policy already supports omitting unknown outdoor acquisition XP when its single source, captured evidence and full personal quota are qualified. The earlier ranged-stack diagnostic retained both crawler types, so that path was not reached. V1310 explicitly selects the captured Silt Crawler 922 source and preserves the raw source alternatives, quantities and item-count ratio. All fifteen actual class/workload component cases receive only **3,150 quest XP**, with **zero acquisition XP**; ten native roles pass the component’s syntax/directive checks. Parent 1204 is an explicit isolated starting assumption. Full route pickup/return, clear camp instructions, independent saved/native/source review and admission remain pending. No new policy or event probability was invented, and this does not price actual gathering duration.

Evidence: `crawler-omission-component-v1310.{plan,json}`, `probe-crawler-omission-v1310.mts` and `v1310-crawler-omission.log` under the cache directory below. This changes the next action: qualify the complete quest-only program under the already selected omission policy rather than treating an unresolved event probability as a blanket blocker to quest reward forecasting.

## Evidence

All paths below are under `.cache/leveling-no-grind-20261031/`:

- `missing-stacks-v1272.json` records the existing fixed-one selector returning no stack references for these items.
- `missing-stacks-v1273.json` contains the actual parsed creature loot rows: 922/1088 → 5938, 1–2; 4376/4377/4378/4379/4380 → 5884, 1–3.
- The SQL input is `classic-db-reference/Full_DB/ClassicDB_1_12_1_z2815.sql.gz`, SHA-256 `4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0`, ClassicDB revision `603ece109099ce44a5447a1b1cffd65c7272d71c`.
- Captured probabilities remain in `zulfarrak-combat-v1175.json`, SHA-256 `55e9a7ecc81a328b5ab9a5fc39dee6aadf1f0ff7da78fa441bc613023ca9bddf`.
- `classic-stack-rule-v1275.json` pins the downloaded primary implementation and `classic-stack-rule-v1275.cpp`.
- `classic-stack-random-v1277.json` pins the exact random-number implementation; `classic-stack-random-v1277-Util.cpp` has SHA-256 `f408c8a466a183cabdf96b0f7c18907b8cbb2144d73b0b2e8b81fdf421b43133`.
- `ranged-loot-v1279.json` records the six-pair enrichment and preservation checks. Its combat output has SHA-256 `79d37f98945042360faf91db31d9e6aa5bb64d7c40d1ddd12b929572907f57a5`.
- `ranged-single-preview-v1285/` contains the isolated implementation. `v1288-single-{focused,full-tests,typecheck,lint}.log` and `v1285-single-build.log` record the checks. `v1280-ranges-parser-tests.log` records all 11 opt-in parser tests passing.
- `v1283-crawler-component.log`, `v1284-crawler-targets.log` and `v1285-single-focused.log` preserve failed diagnostics. `ranged-item-source-v1287.json` records the ordinary source-page HTTP results.

Do not assume one item, pool the party into one player's quota, substitute the historical 80%/100% roll for the captured percentages, invent current samples, or grant an acquisition before the source method is complete. Keep the existing fixed-one path and its regression tests unchanged. New range support should have a separate schema and explicit opt-in producer, with invalid or conflicting evidence held rather than silently accepted.

The ordinary enemy ceiling remains the lowest participating player's level +4. The +5 exception remains limited to independently qualified dungeon bosses. New collection quests must not replace the pending requirement to fund and validate the complete 1–60 priority route and original 33-edition / 528-setting / mixed-roster / 784-native-starter scope.
