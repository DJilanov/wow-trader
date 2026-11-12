# Item values and crafting profits in game

Collector 0.15.8 uses the existing synchronized market history for item tooltips
and an attached, movable profession pricing panel. Companion source 0.3.17 carries
the updated, checksum-verified installer. The market API and saved scan format
are unchanged.

## November 12 — crafting costs in item tooltips

After opening a profession, learned outputs show **Cost to make / item** and
**Buy missing materials / craft**. Shift expands the reagent breakdown. Owned
materials retain their value, recipe learning is already paid for, and multi-output
crafts separate per-item material value from per-craft cash. Missing prices and
variable output do not become a zero or invented exact cost. The last loaded
profession remains available after its window closes during the same session.

The new Forever profession-leveling page compares material spending with one-time
recipe costs, reuses crafted inputs and produces a whole-stack shopping list.
It retains explicit guards for missing acquisition prices and learning skills;
the current published catalog does not yet support fully automatic unlearned
recipe recommendations. [Behavior, source coverage, limitations and verification](profession-leveling-planner.md).

## November 12 — current disenchant eligibility and transient metadata

The blanket unavailable disenchant value was caused by a stale **70862** eligibility
pack on the installed **70888** client. The existing quality/item-level/weapon-or-armor
probability model was already present; the exact-build eligibility check stopped
calculation before that model was reached.

Collector **0.15.7** / Companion **0.3.16** carry a fresh frozen capture of build
70888 and hotfix `e2433417f16e1d5d338aecff6aa3c706d38351d100a339bd2c19696235086c7b`,
using clean definitions revision `86c0801007bbcb767f4bc275413d24bc6b2d486c`.
The pack contains **10,167 equipment records: 8,454 eligible and 1,713 excluded**.
The full item sweep supports **8,196 reference valuations** while preserving
special-loot, weapon-bracket and cross-build exclusions. The probability model
and AH fee math are unchanged.

A replay of the actual synchronized 70888 Alliance price pack reproduces the
old-pack failure for Rough Bronze Leggings and succeeds with the new pack:
**543 copper gross / 514 copper after the AH cut**. The underlying scan is from
November 11 at 06:32:25 UTC and is stale at verification; this is a historical-price
replay, not a fresh quote or a guaranteed disenchant result.

Tooltips now distinguish **Data update needed**, **Material prices missing** and
**AH cut unknown**. Known material yields remain visible when their monetary
value cannot be calculated, and missing material prices identify the affected
materials. Lack of an AH book no longer erases the game's identity needed for
yield lookup. Missing prices never become zero or a partial profitable value.

Manifest generation and desktop pre-packaging now refuse a stale eligibility
pack when an installed Forever client is available on the maintainer Mac. Other
build machines can explicitly check their target with
`node scripts/prepare-addon-manifest.mjs --check --wow-root /path/to/World-of-Warcraft`.
A build machine without an installed client still verifies the complete bundle;
this does not claim automatic extraction or an update on users' computers.

The same update includes the grouped pending-row scanner described in the
[AH runbook](ah-native-scan-recovery.md#november-12--transient-readiness-in-the-0156-scan).
One full WoW restart is required to load its new TOC module before testing.
Private evidence, capture, replay and rollback: `artifacts/trader-disenchant-70888-20261112/`.

Both versions are installed locally and the Companion has been restarted.
Bundle checksums, installed static files and application signature integrity
passed verification; generated price/account packs and private Companion settings
were preserved. The full addon controls, 48 Companion tests, 11 desktop tests,
eight data/preflight tests, typechecks and builds pass. In-game tooltip and fresh
scan confirmation remain pending the required full WoW restart. No public
installer promotion or server deployment is included in this local update.

## November 12 — final read before marking rows unresolved

The latest 0.15.4 scan uploaded but remained below the pricing gate: 191,007 rows,
6,184 unresolved and 96.7624% completeness. All 20 sampled unresolved rows were
ready when the old timeout finalizer reread them for diagnostics, after already
counting its pending queues as failures. Installed 0.15.5 files had not been
loaded when that scan started.

Collector **0.15.6** adds a bounded final read of the pending rows, preserving
readiness/financial validation and classifying the same read used for diagnostics.
No extra item-load or full-AH query is sent during this phase. Unready or
uninspected rows remain excluded; quality gates and metadata timeouts are intact.
Companion **0.3.15** retains the optional final-pass counters locally. The regression
and boundary controls pass; live recovery still needs a fresh scan after `/reload`.
The old incomplete snapshot is neither repaired nor relabeled complete.

[Incident, finalization rules and verification](ah-native-scan-recovery.md#november-12--pending-rows-were-ready-at-the-cache-deadline).
Private evidence: `artifacts/ah-final-pass-20261112/`.

## November 12 — initial response timeout and request diagnostics

Collector **0.15.5** replaces the 30-second auction-list response limit with a
bounded **120-second wait**, displays elapsed time, and records one local failure
with its stage and timings. Issued full-market requests now retain the existing
15-minute cooldown even if they fail, including across `/reload`. No automatic
repeat query is sent. Existing good scans remain intact; a response timeout cannot
become a fabricated empty or complete scan. Companion **0.3.14** retains those
optional diagnostics locally without changing public upload checksums.

The delayed-response regression, request lifecycle/cooldown/reload controls and
scanner UI checks pass. Live recovery from this specific report is still an
in-game check. See the [response-timeout runbook](ah-native-scan-recovery.md#november-12--no-auction-list-response).
Evidence and rollback: `artifacts/ah-response-timeout-20261112/`.

## November 11 — AH recovery verified; missing upload restored

The first saved 0.15.4 scan on build **70888** is **100% complete**, with 166,356
rows, three bid-only and zero unresolved/invalid/protected rows. It remained local
because Companion was stopped. Meanwhile the exact 70888 catalog was published,
so the old website-selected 70862 scan no longer had a retained catalog and showed
“under review.” Starting Companion 0.3.13 completed the automatic upload.
Production accepted the scan; the public Alliance Trader now renders **405 crafts**
and no review banner. The scan was about 11 hours old at verification and remains
labeled stale until another scan is saved and uploaded. No code, preferences,
publication rules or server services were changed. This verifies the AH cache fix;
it does not update the separate exact-build disenchant eligibility pack.

[Incident and verification](ah-native-scan-recovery.md#november-11--live-recovery-and-catalog-handoff-confirmed).
Private receipts: `artifacts/catalog-scan-handoff-20261111/`.

## November 10 — native AH load completion and retries

The follow-up 0.15.3 scan still had 4,415 unresolved listings at 97.142%
completeness. All 20 samples remained uncached after request calls that returned
without error. The first recovery implementation requested each item once and
never retried missing metadata.

Collector **0.15.4** skips cached items, tracks both client load-result events,
and retries failed or missing loads up to three attempts with backoff. Attempts
share rate, concurrency and frame budgets; the existing three-minute hard bound,
readiness validation, 98% pricing gate and full-scan cooldown are unchanged.
Companion **0.3.13** retains the additional bounded diagnostics locally, excluded
from public uploads. The silent-first-failure regression fails on the previous
loader and recovers with the correction. Actual recovery needs a new live scan;
no older snapshot is relabeled complete.

[Full incident, implementation, checks and rescan instructions](ah-native-scan-recovery.md).
Private audit and rollback: `artifacts/ah-cache-retry-20261110/`.

## November 10 — initial native AH cache recovery (0.15.3)

Collector **0.15.3** actively requests missing item data instead of only rereading
incomplete replicated listings. Requests are deduplicated per item, rate-limited
and frame-budgeted. Genuine load requests receive bounded extra grace; rows still
need Blizzard's complete-data flag before being priced. The 98% pricing threshold
and full-scan cooldown are unchanged. Low-quality scans show an explicit incomplete
state and retain a local sample of at most 20 unresolved rows.

Companion **0.3.12** preserves those diagnostics locally; they are excluded from
the public upload and its checksum. The new Collector and signed native arm64
Companion are installed locally, with generated packs, settings and credentials
preserved. Start the updated Companion and restart WoW once, then run one scan
while keeping the AH open. Actual recovery on the server must be confirmed by
that new scan; synthetic recovery is not a live-game observation.

[Incident, implementation, tests and operator instructions](ah-native-scan-recovery.md).
Private evidence: `artifacts/ah-cache-fix-20261110/`.

## November 9 — build 70862 data update

Collector **0.15.2** and Companion **0.3.11** carry a fresh client/hotfix capture
for **1.60.1.70862**. The previous 70790 eligibility pack caused the repeated
disenchant failure. The new pack contains 9,656 equipment records: 7,950 eligible,
1,706 excluded and 7,692 supported Classic-reference valuations. Rough Bronze
Leggings remains eligible at item level 21. Probability tables and pricing rules
are unchanged; exact-build isolation remains enforced.

The old-pack failure and new-pack success are reproduced using the synchronized
Alliance price pack at its captured scan time: **537 copper gross / 508 copper
after the AH cut**. This is a historical-price replay, not a fresh live AH quote
or verified Forever yield. The full Lua checks, source-snapshot validation,
installer tests, desktop typecheck and Companion package checks pass.

The updated addon and native arm64 Companion are installed locally. Generated
market/account packs and Companion settings/credentials are preserved. Run
`/reload` in WoW to load the addon update. Actual tooltip confirmation remains
an in-game check. No commit, push, public installer promotion or server deployment
is included. Private capture, replay and install receipts:
`artifacts/trader-disenchant-70862-20261109/`.

## November 6 — build 70790 tooltip recovery

Collector **0.15.1** and native arm64 Companion **0.3.10** are installed locally.
The previous eligibility pack covered 70755, so build 70790 correctly withheld
DE estimates. The fresh, frozen 70790 capture now covers 8,422 equipment items:
6,732 eligible and 1,690 excluded. The full Lua sweep supports 6,476 reference
valuations while retaining the special-loot and weapon-bracket exclusions.

The owner's Rough Bronze Leggings (`2865`, green armor, item level 21) is eligible.
Replaying the actual synchronized Alliance price data reproduced the build
failure with the old pack and produced **728 copper gross / 691 copper after the
5% AH cut** with the new one. All three material prices were present. This is a
probability-weighted Classic reference estimate, not a guaranteed Forever yield.

Tooltip failures now display their reason even when a provenance label is
present, so a missing material quote cannot be hidden behind “Unavailable.” The
Collector version constant now matches its TOC. Regression controls cover the
reported item, the hidden-reason case, exact build isolation and the full pack.

Both generated market/account packs, WoW SavedVariables, Companion settings and
encrypted credential file were preserved during verified atomic installs. The
Companion resumed successfully and synchronized history. `/reload` in WoW loads
the new tooltip data/code; an actual player hover remains the final in-game check.
No public installer promotion, server deployment, commit or push was requested.
Private receipts/replay/ZIP: `artifacts/trader-disenchant-70790-20261106/`.

## Player workflow

1. Restart WoW after updating the addon files.
2. Hover an item for its vendor value, latest AH ask, historical normal, proceeds
   after the AH cut and supported average disenchant proceeds. Values are per
   item. Hold Shift for expected materials, history evidence and buying guidance.
3. Open a crafting profession. The WoW Trader panel opens beside it; the
   **WoW Trader prices** button or `/wowtraderprices` toggles it. Drag its header
   to reposition it on a smaller screen.
4. **Selected recipe** shows input quantities, bag inventory, missing materials,
   material value, estimated cash needed, output prices and the AH/disenchant/vendor
   profit comparison. The native crafting quantity updates the calculator; its
   own **Calculate crafts** field can also model a different quantity.
5. **Recipe profits** searches learned recipes and sorts by best exit, AH,
   disenchant or vendor profit. Clicking a row selects the native recipe outside
   combat. Daily/long-cooldown recipes are omitted from repeatable rankings.
6. **Latest asks** uses current price depth. **Historical normal** is a planning
   view requiring the existing six independent half-hour observations. Missing
   history is never replaced silently with today's asking price.

New local scans refresh quotes without a reload. Shared history downloaded by
Companion becomes available after `/reload`, as before. Product, exact build,
region, realm and AH scope must match. A missing item in the latest complete scan
has no current quote, even if its historical reference remains available.
References expire after seven days without an item observation. Scans older than
one hour remain labelled references and cannot populate current profit rankings.

## Money and eligibility rules

- AH exits subtract the existing 5% faction/regional or 15% neutral cut. Unknown
  fees disable market proceeds. Deposits and completed sales are not inferred.
- Material value includes every consumed reagent, including materials already
  owned. Cash required to buy missing materials is separate. Current cash budgets
  use feasible whole auction stacks, display surplus and do not claim the
  mathematically cheapest possible combination. Missing stack detail leaves the
  budget unavailable rather than inventing fractional purchases.
- An unlimited, ordinary gold-only reagent offer observed at a merchant this
  session can provide a cheaper vendor cost. The quote is character-specific and
  expires after 24 hours. Limited stock and extended-currency offers are excluded.
- Deterministic output quantities are multiplied by craft count. Random output
  and extra specialization procs are not assumed. Missing prices, unknown reagent
  alternatives, currency inputs and unsupported recipe types suppress profits.
- Modern recipe allocations include selected optional/alternative reagents.
  Legacy trade-skill and craft/enchant windows have separate adapters. Direct
  enchants expose input costs without inventing a tradeable item or service price.
- BoP/quest/account-bound outputs cannot use the AH exit. Item links with random
  suffixes or bonus variants cannot inherit the base item's market price.
- Secret values are rejected before arithmetic, string matching and comparisons.
  Native selection occurs only after a player click, outside combat. Crafting,
  purchases, disenchanting and posting remain player actions.

## Disenchant evidence

The addon table is generated from the website's `tbc-disenchant-table-v1` model.
Its established TBC build is 69795. The shipped Forever eligibility snapshot was
extracted from the installed launch product **wowf, 1.60.1.70888**, with a frozen
hotfix overlay and WoWDBDefs revision
`86c0801007bbcb767f4bc275413d24bc6b2d486c`.

The extraction includes Item, ItemSparse, ItemDisenchantLoot and SpellCooldowns.
It captures 10,167 green/blue/purple equipment records: 8,454 eligible and 1,713
excluded by the captured rules/flags. The Lua controls exercise 8,196 supported
Forever reference valuations. No Outland material can enter those valuations.
Item-level 61–99 client brackets use the corresponding final Classic-era bracket,
and newly eligible low-level items use the first compatible reference bracket.

**Eligibility is client evidence; loot probabilities remain an estimate.**
Tooltips and the crafting panel label Forever estimates accordingly. Required
material prices must all be present. The client does not contain the server's
complete loot probability table, so this feature does not label those probabilities
as verified Forever behavior.

Green weapons at item levels 21–30 are withheld because of a
[firsthand beta report of inconsistent essence outcomes](https://github.com/ClassicWoWCommunity/forever-bugs/issues/351).
That report does not establish launch behavior; it explains why a generic Classic
estimate would be insufficient for this bracket. No change was made to the
existing website's TBC table on that basis.

Another 98 eligible items carry a special disenchant loot-table flag. Their
ordinary bracket estimates are withheld because that flag points to a different
distribution. The flag meanings are cross-checked against the
[primary item-flag definitions](https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Entities/Item/ItemTemplate.h).

The captured Item and ItemSparse tables have 94 and 89 encrypted records;
SpellCooldowns has 77. Missing item eligibility is withheld. Readable long
cooldowns add 104 spell IDs to the exclusions, alongside runtime cooldown checks
and known legacy recipes. The eligibility table itself has zero encrypted records.
This does not claim to recover encrypted future content.

The compressed source archive and SHA-pinned pointer live in `data/trader/`.
These contain only the four public client tables, not account SavedVariables or
Companion credentials. A different build requires a new eligibility pack for DE;
AH and vendor tooltips do not depend on that pack being current.

## Rebuild and verification

Recheck the archived source and both generated tables:

```sh
node scripts/prepare-addon-client-valuation.mjs --check
pnpm --filter @wow-trader/catalog exec tsx ../../scripts/prepare-addon-disenchant.mjs --check
node scripts/prepare-addon-manifest.mjs --check
node --test scripts/addon-valuation-data.test.mjs
node scripts/test-trader-addon.mjs --lua=/path/to/lua-5.1
pnpm --filter @wow-trader/desktop test
pnpm --filter @wow-trader/desktop typecheck
pnpm --filter @wow-trader/companion-core test
```

For a new installed client, use the existing .NET extractor boundary:

```sh
dotnet run --project tools/extractor-dotnet -- valuation-snapshot \
  --wow-root "/Applications/World of Warcraft" --product wowf \
  --locale enUS --region eu --definitions /path/to/WoWDBDefs/definitions \
  --definitions-revision EXACT_GIT_SHA --output artifacts/item-valuation
node scripts/prepare-addon-client-valuation.mjs --source=/path/to/evidence.json --archive
node scripts/prepare-addon-manifest.mjs
```

Pin and verify the definitions checkout before extracting. The extractor refuses
mixed build/hotfix captures and publishes its evidence atomically. The generator
validates provenance, duplicate records, numeric fields, item flags and ambiguous
brackets. Encrypted eligibility rules prevent publication. Regenerate checksums
after any shipped Lua/TOC change; the installer rejects mismatched modules before
touching the installed addon and preserves generated market/account packs.

## Delivery evidence

Automated coverage includes JavaScript/Lua pricing parity, fee rounding, whole
stacks, owned materials, multiple outputs, missing material prices, no-disenchant
flags, build/realm isolation, historical expiry, long cooldowns and secret values.
The UI harness exercises late profession loading, native quantity updates,
selection, searches, route sorting, tooltip reuse, stale labels and desktop/
compact positioning. Installation tests verify retained generated data and
rollback when a new pricing module is tampered with.

The actual game session and final appearance still need a player smoke check;
the automated UI harness is not an in-game screenshot. No server migration or
web deployment is required for these addon calculations. Public Companion
downloads require the normal separately requested commit/push/release workflow.

The initial November 4 install used Collector 0.15.0 and native arm64 Companion 0.3.8. Both
generated addon packs were preserved; account SavedVariables, Companion settings
and its token entry were preserved. Original bundles, final install receipts, test logs
and `WowTraderCollector-0.15.0.zip` are retained privately under
`artifacts/trader-valuations-20261104/`. Bundle signature integrity and all 14
packaged addon checksums were verified. The application was not launched.

The owner confirmed that game access is unavailable until servers open in about
12 hours. Pending player checks: open a learned recipe, hover bag/output/reagent
items, change native crafting quantity, switch profit exits and select a ranked
recipe. A successful offline harness run does not close that live check.
