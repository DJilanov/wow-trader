# Profession leveling and crafting tooltip costs

Current local addon: **Collector 0.15.10 / Companion 0.3.19**. The new web route is
`/tools/forever/trader/leveling`, linked from Forever Trader. The web release is
validated separately from the local addon installation; public desktop installers
are not promoted by this web rollout.

The goal is to reduce the gold needed to level a profession using the selected
realm/faction's AH scan, including the cost of learning recipes. A low reagent
price alone must not make an expensive pattern look attractive.

## In-game tooltip

Open the character's profession window to load its learned recipe definitions.
Hovering a matching output item then shows:

- **Cost to make / item:** consumed materials valued from the synchronized AH
  depth, or a cheaper unlimited vendor quote observed during this session.
- **Buy missing materials / craft:** additional cash after bag inventory,
  including purchases of whole auction stacks.
- Recipe name and output quantity; Shift adds reagent quantities and costs.

Owned materials retain their value. Acquisition cost is already sunk for learned
recipes and is labeled accordingly. Multiple learned recipes for the same output
are compared by material cost per item. Variable outputs and missing prices do
not produce an exact or zero unit cost. The last opened profession's definitions
remain available after its window closes; reopen professions after a reload.
This is a learned-recipe view, not a claim to price every unlearned craft.

## Leveling page

Choose the market and profession, current/target skill, character level and
skill-up strategy. Mark recipes actually learned and usable by this character.
For unpriced recipes, enter the one-time learning/purchase price in gold; where
the learning requirement is missing, also enter its required skill.
These preferences are stored only in this browser, per market and profession.

The result separates material spending from recipe purchases/training fees,
gives an execution order and a copyable shopping list, and retains whole-stack
leftovers. Vendor proceeds are deducted by default. An optional best-of-vendor/
disenchant objective uses estimated Classic yields, available Enchanting skill,
self vs another enchanter, per-item service fees and faction/neutral AH cut.
Only leftover crafted outputs count; consumed intermediates and purchased
overstock earn no recovery credit. Missing evidence or prices fall back to
vendor. The gross shopping budget remains separate: future proceeds cannot
pay for earlier reagents. Fractional copper is retained during comparison and
rounded once for the result, with disposal rows reconciled to its total.
Profession rank upgrades, tools, travel and materials already in the bags are
not included in this version. Vendor reagents use AH prices on the web page;
the in-game tooltip can use directly observed vendor prices.
Mining coverage is limited to smelting recipes. Gathering professions cannot be
leveled entirely by purchasing AH materials and are not presented as complete
crafting routes.

Recipe unlocks are charged only on first use, including when a route leaves and
later returns to the same recipe. Already learned recipes have no new unlock
fee. A recipe on the AH consumes real recipe-item stock as well as its purchase
price. Unknown costs never default to zero. Trainer observations match product,
build, region, realm and faction; already-trained services are excluded. Only
positive observed fees are auto-priced because the older collector could store
zero when its trainer cost API was unavailable. Confirm a genuinely free unlock
explicitly with a zero override or mark it learned.

The page selects accepted scans and requires their exact published English
catalog. It uses canonical item markets, excluding variant-specific listings.
Published, nonexpired teaching-item relations and captured trainer requirements
are supported. Cooldown crafts, incomplete extractions, missing skill bands and
unsupported acquisition restrictions are excluded. Unknown learning skills are
distinct from an actual skill-one requirement; a user override cannot lower a
captured requirement. An incomplete route explicitly reports its reached skill.

## Page design and search discovery

The calculator uses a compact profession header, three setup steps, a market-time
label and an explicit reminder to mark learned recipes. The result emphasizes
net cost, upfront budget and expected returns, followed by the material and learning breakdown. Recipe catalogs and
the server-rendered questions below the tool explain supported professions,
missing fees, AH scans, estimated skill-ups and excluded costs.

The canonical search URL is `/tools/forever/trader/leveling`. Profession and
market query parameters remain calculator settings and canonicalize to that
page. The Forever hub and Trader link directly to it, and the tools sitemap
includes it once. Search metadata targets profession leveling at skill 1–300;
social previews use the dedicated `/tools/og/profession-leveling` image. JSON-LD
describes the actual page and its visible breadcrumbs. No ratings or FAQ rich
result promises are added. Google chooses indexing and rankings independently.

## Calculation and limits

`profession-leveling-prices.ts` validates auction lots and computes a bounded
knapsack table per item. Each quote finds the cheapest whole-stack cover within
the observed stock, including overbuy. Tables grow on demand and are reused
throughout the route; requests over 20,000 units per item remain unsupported.

`profession-leveling.ts` searches increasing skill levels, carrying acquired
recipes, cumulative auction demand and usable crafted inventory. It retains up
to 24 alternatives per level and caps work at three million transitions. This
is a bounded comparison, not proof of a global minimum over every possible
route. The result states that limitation; partial searches are never presented
as complete routes. Calculation runs in a dedicated browser worker with a
30-second timeout, so it does not freeze the page.

Orange mode uses one craft per captured skill-up increment. Expected mode uses
the explicit linear planning model `(gray - skill) / (gray - yellow)` after
yellow, accumulating expected attempts within a contiguous recipe segment and
rounding craft purchases upward. This is **not a measured Forever probability**.
No gray recipe advances skill. Expected routes must be checked at each skill
checkpoint and recalculated when actual skill-ups differ. Blizzard's
[Classic manual](https://us.media.blizzard.com/manuals/wow/wow-classic-manual-enUS.pdf)
describes the color distinction, not that linear probability model.

## Current data coverage

The initial November 12 check found build **70888** published with **2,227
recipes**, no trainer observations and no catalog teaching-item links. The
client now stores the item/effect association in `ItemXItemEffect`; extractor
**0.6.1** joins that table while retaining older client support. Direct learning
links require the learn trigger (6), so 178 applied enchant-scroll effects are
excluded from the 1,887 initial candidates.

A fresh extraction recovered **1,709** teaching-item links. Its hotfix differs
from the published catalog, so the catalog was not replaced. A compatibility
review checked item restrictions, profession, skill bands, reagent inputs and
output quantities against the exact published build. It qualified **1,677 links
for 1,668 recipes** and withheld 32: four changed crafts, fourteen profession
requirement mismatches, thirteen changed profession/skill bands and one changed
item requirement. These counts describe all professions, not available AH stock.

Published evidence snapshot: `3d7cb40e-b438-4e91-a0e5-1783c47f2580`, source
`client-profession-links`, checksum
`4082512807b8551683a13bc0c628331816c3cbc19d39bc8d40154c0ab69db5e1`.
Each relation records both hotfix identities and its catalog UUID. Client facts
remain tied to that catalog rather than using an arbitrary expiration date.
Auction prices still come from the selected scan. Class/race/specialization-locked
patterns are excluded from universal purchase recommendations.

**Trainer learning fees remain unknown.** The user cannot collect them at present.
Known-recipe and manual fee/skill overrides work without trainer evidence;
unknown fees never become zero. A complete, automatic 1–300 route is not promised
when those inputs or auction stock are missing. To collect fees later, enable
`/wowtrader evidence on`, open the trainer with available/unavailable/used filters
visible, then Save & Reload and let Companion upload. Check
`/wowtrader evidence status`: unavailable client APIs may capture no records.

To qualify future client relationships after building the catalog and world-data
packages, use `scripts/prepare-client-profession-links.mjs` with `--manifest`,
`--base` (the exact published identity export) and a new `--output` path. Review
its rejection report. `scripts/import-client-profession-links.mjs --bundle ...`
creates reviewed evidence; `--publish` explicitly publishes it. Import rechecks
the checksum and live catalog identity and requires the existing owner database
configuration. Never substitute a fresh catalog merely to add learning links.

## Verification

Evidence and rollback receipts live in
`artifacts/profession-leveling-20261112/`. The browser test uses real public
market/catalog data through a read-only database session. It checks unknown-cost
partial output, a learned-recipe route, one-time manual learning fees, preference
restoration, worker execution and mobile overflow.

The full-range performance scenario marks every recipe learned **only for
benchmarking**; it does not assert that a real character can know every recipe
at skill one, nor validate a published leveling recommendation. A 438-recipe
test completed 1–300 in about 3.3 seconds with the bounded search. Unit controls
cover acquisition amortization, missing prices/requirements, stock sharing,
whole-stack optimality against exhaustive small cases, crafted intermediates,
skill-up bands and money precision. Addon regression controls cover per-item vs
per-craft cost, tooltip reuse, missing reagent prices and variable output.

Collector 0.15.9 and Companion 0.3.18 were installed locally with sixteen bundle
checksums, fourteen static game-addon files and application signature integrity
verified. Generated market/account packs, settings and credentials were preserved
at installation. Companion restarted and synchronized successfully. The final
focused web controls pass 26 tests; desktop controls pass 11, the full addon
runner passes, and focused TypeScript/lint checks and the desktop package build
pass. The Next development server compiled and served the actual new route;
production candidate and live-browser checks are recorded separately in
`artifacts/profession-leveling-release-20261112/`. That directory also contains
the six item-effect controls, 27 extractor controls and 24 world-data tests.

## November 13: client patches and disenchant refresh

Build **70938** is published with 24,511 items, 2,227 recipes and 1,709 direct
teaching links. The earlier 70888 compatibility relations are historical; the
exact current catalog now carries the native relationships. Guardian definitions
resolve a pinned upstream commit and verify actual DB2 layouts instead of
requiring a Git subject named after every patch. Small reagent-quantity changes
are eligible for promotion only when normalized quantities match checksummed
raw SpellReagents evidence; unrelated semantic changes still require review.

The recurring in-game “Data update needed” was a build mismatch, not missing
rarity arithmetic: bundled eligibility was 70888 and the client was 70938.
Eligibility also depends on armor/weapon class, item flags, rule brackets and
special loot tables. It must not be inferred from rarity and level alone.
Collector 0.15.9 bundles the fresh native snapshot: 10,227 equipment records,
8,480 eligible and 8,222 supported Classic reference valuations. The client
does not contain loot probabilities; yields remain clearly labeled estimates.

Both web and ingestion need `WOW_TRADER_CATALOG_ROOT` pointing at the absolute
immutable catalog-release root (production: `/home/wow-trader-system/shared/catalog-releases`).
The first market-intelligence page includes a build-scoped compact eligibility
pack for all catalog equipment, including items absent from the AH. Rules are
loaded from the manifest's checksummed ItemDisenchantLoot artifact. Optional
evidence failure leaves prices usable and disenchant evidence unavailable.

Companion 0.3.18 preserves that pack across market pagination and writes it into
MarketData.lua. Manual Check scans refreshes it even when SavedVariables is
unchanged; automatic synchronization checks every five minutes. Uploaded scans
are not replayed. Reload the game to load the generated pack. The addon prefers
matching synchronized eligibility, falling back to its matching bundled table;
foreign builds, special loot and missing material prices remain explicit.

The shared catalog eligibility helper also supplies the browser planner's output
values. No profession names, recipes or item IDs influence the optimizer.
Trainer fees, known recipes and actual auction availability still determine
whether a route can be completed.

The November 13 controls passed 41 focused web checks, 51 Companion-core
checks (including a five-minute refresh with an unchanged file), 36 catalog
checks, 15 contract checks, 16 ingestion checks and 11 desktop checks. The
addon runner also checks 1,225 scanner cases, JS/Lua price parity and current
native equipment coverage. All 10,227 API eligibility tuples match the
independently extracted native bootstrap snapshot exactly. Browser checks use
actual accepted market data: 412 Blacksmithing recipes, 561 vendor-valued
items and 270 complete disenchant estimates. Controls verify worker execution,
gross/returns/net reconciliation, preference restoration and 390px layout.

A 221–300 performance fixture with all recipes marked learned completes in
under 0.5 seconds per recovery mode. With identical data, the former gross-cost
choice has an estimated net 123.9856g under the same disenchant settings;
the new net objective finds 93.3402g. This omits learning costs and deliberately
marks every recipe learned for algorithm benchmarking; it is **not** a route
quote for a real character. Actual recipes, training fees and stock must still
be supplied. Evidence: `artifacts/catalog-70938-20261113/`.

## Minimum resale market depth

At the user's request, AH resale estimates now require **at least 50 units
currently listed** for each output or disenchant material. This counts units
across all canonical-market price levels, not 50 auctions or 50 sellers.
Existing listing-count and historical-signal checks still apply where used.
Small reagent stacks and recipe purchases remain usable at their actual
purchase cost. Vendor values are independent of AH depth.

`MINIMUM_RESALE_MARKET_QUANTITY` in the market package supplies the web policy;
the addon's MarketPolicy exposes the same threshold, verified through the
JavaScript/Lua comparison suite. The rule covers crafting rankings, historical
craft-profit charts, buy-for-resale suggestions and profession leveling's
disenchant recovery. Understocked DE materials fall back to vendor recovery in
the leveling planner. The addon shows “Below 50 listed” with the affected
material IDs, keeping low stock distinct from a client-data mismatch.

Regression controls cover 49 vs 50 units, quantity spread across stacks, a
one-item purchase from a supported market, and vendor/crafting-input behavior
in thin markets. This admission threshold does not establish actual sales
demand; AH proceeds remain estimates. No item names or IDs are special-cased.
