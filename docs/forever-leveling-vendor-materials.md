# Source-bound vendor materials

## Current implementation — November 5

The isolated **V1302 plan / frozen V1303 engine** restores Soothing Spices (1218). Every player buys **three Soothing Spices from Helenia Olden**, then accepts and turns in the quest at Jarl during the existing northern Dustwallow visit, before Stinky’s Escape. The Theramore purchase precedes Mudrock Soup and Bugs. All older route actions, personal quotas and reward facts remain unchanged.

The reference reward is **1,350 client-final XP per player**, paid once. Buying the spices adds no kill or incidental XP. After later level-dependent recalculation, the fast-case gap before Krol’dok 42 falls from 6,984 to **5,926 XP**. Without manual mallet confirmation, expected/slow cases still need **136,622 / 100,167 XP** before Maraudon 46. The later **V1320 / frozen V1321** revision includes this program and the crawler follow-up. Its exact **1–41 prefix is now published**, at **17:34:44 UTC**, with **1,520 tasks / 60 documents** per mode and both public downloads checked. The later full-route fast deficit is **2,776 XP**; no-mallet expected/slow deficits are **133,604 / 97,017 XP**. [Publication and rollback](forever-leveling-download-deployment-2026-11-04.md).

## Evidence and implementation boundary

The captured chapter 15, step 14 explicitly buys three spices from Helenia; step 16 accepts and turns in 1218 at Jarl. The pinned Forever item export lists vendor 4897, and the same NPC export identifies Helenia Olden and her vendor flag. The historical SQL also lists that exact product/vendor pair with no stock limit or condition. These are source/provider references, not observed current shop inventory, player money or availability.

The new `campaign-material-purchases.ts` helper qualifies a single unconditional buying instruction only when the source collection, item identity, personal quantity, named vendor and provider evidence agree. The material compiler records that provenance as a non-combat purchase. The forecast preserves the physical stock step and consumption; it does not flag the qualified purchase as unexplained gathering. Conditional text, a different product/quantity/vendor, missing vendor evidence or an unbound source remains unqualified. Existing default gathering, loot probabilities and numerical XP rules are unchanged.

The implementation is isolated at `.cache/leveling-no-grind-20261031/spices-purchase-preview-v1295/`; the frozen source/runtime is `spices-purchase-engine-v1303/`. The shared material-work type has a narrow optional purchase receipt. No new dependency or mutable global state is introduced.

## Verification

- **4,080 tests / 240 files** pass, including nine purchase regressions. All 239 earlier test files remain byte-identical.
- Strict typecheck, lint and build pass. Eighty focused material/item/vendor tests pass.
- Six fresh and six restored actual-five-class cases, 30 class/workload cases and all **16,683 pins** pass.
- **404 saved handoffs / 2,020 player continuations** retain event streams, endpoints and XP bounds. These include stock held before acceptance and zero remaining spices after hand-in.
- **320 native exports / 640 roles** pass independent review and Lua syntax, retaining the exact source purchase and all previous controls.
- Thirty source-flow cases have no warnings or violations. Canonical locks remain unchanged.

The first handoff audit assumed that stock appears only after an objective-completion event. It failed on the legitimate earlier purchase. Its script, failed log and terminal receipt remain intact. The corrected audit explicitly tracks the purchase inventory event while retaining all older item checks; no source, saved-state code or numerical input changed to satisfy it.

Evidence under `.cache/leveling-no-grind-20261031/`: `spices-data-v1295.json`, `spices-vendor-v1298.json`, `spices-route-v1302.json`, `spices-delivery-audit-v1304/summary.json`, `spices-delivery-audit-v1304/handoffs-v1305.terminal.json`, and `source-flow-progress-v1311.json`. Full 1–60, the original wider-group matrix, final travel and actual-game validation remain unfinished.
