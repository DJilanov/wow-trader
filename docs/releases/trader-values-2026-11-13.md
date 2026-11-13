# Trader valuation release — November 13, 2026

## Live state

- Web: `baa3ad5e92043315db00cae5d8345f3755fcb0fd`, release
  `kfc-helper-resale-depth-20261113`.
- Ingestion: `d308984c4648c0f91cd83cbdfbc77f6a11a5a856`, independently pinned to
  `kfc-helper-net-values-20261113`. The subsequent change is a web/addon resale
  policy; the eligibility API is unchanged.
- Published Forever catalog: build **70938**, UUID
  `ab8473dc-24b7-42dc-94a6-424b46991632`, extractor **0.6.1**.
- Local installation: Collector **0.15.10**, Companion **0.3.19**. Bundle integrity,
  all sixteen packaged file hashes, and preservation of settings, credentials,
  generated packs and SavedVariables were checked. Public desktop installer
  promotion is separate from this local installation and web deployment.

The KFC guild and Forever Discord applications retained their running processes.
Only the helper web and ingestion services were replaced. Temporary preview
servers, the SSH preview tunnel and the local inspector session were closed.

## Behavior

The profession planner compares material and one-time learning costs minus
vendor returns, or the better supported vendor/disenchant return. The upfront
shopping budget is separate. Consumed intermediates and purchased overstock do
not receive a second disposal credit. Recipes and professions share the same
logic; there are no item-specific ranking exceptions.

AH resale values require **50 currently listed units**, counted across stacks.
The requirement covers crafting rankings, historical craft-profit charts,
buy-for-resale suggestions and disenchant material proceeds. Existing
listing-count/history checks remain where applicable. Reagent and recipe
purchases can still use smaller quantities. Vendor values do not depend on AH
stock. Understocked disenchant recovery falls back to vendor in the leveling
planner; the addon identifies low stock separately from missing prices and
outdated client data. Listed supply is not proof of completed sales.

The repeated “Data update needed” came from bundled build-70888 eligibility on
build 70938, plus Companion skipping market refreshes when SavedVariables had
not changed. The API now supplies checksummed, build-scoped eligibility on its
first market page. Companion preserves it across pagination and downloads on
manual checks and every five minutes during automatic synchronization. The
addon prefers matching downloaded evidence and retains its native bootstrap.
Native eligibility is distinct from the explicitly estimated Classic yields.

Both web and ingestion use `WOW_TRADER_CATALOG_ROOT` to read immutable published
catalog evidence. Its production value is
`/home/wow-trader-system/shared/catalog-releases`.

## Verification

- 54 focused web tests; 38 market tests; 51 Companion-core tests; 36 catalog
  tests; 15 contract tests; 16 ingestion tests; 11 desktop tests passed.
- Addon controls passed, including 120 JavaScript/Lua comparison cases, 1,225
  native scanner controls and the 49/50 resale boundaries. Type checks, relevant
  lint checks, production builds and desktop packaging passed.
- All **10,227** downloaded eligibility tuples match an independent native
  extraction. The generated **7.5 MB** installed Lua pack loads successfully
  with 6,023 price records; Rough Bronze Leggings evaluates to **530 copper**
  after AH cut using that particular synchronized market, not a fixed quote.
- Live desktop/mobile browser checks cover worker execution, preference
  restoration and budget/returns/net reconciliation. The real Blacksmithing
  data contains 412 recipes; the stock policy reduces supported DE values from
  270 to 255 and retains vendor fallback. The browser fixture marks candidate
  recipes learned for testing; it does not assert the character owns them.
- Live API pagination retains one history revision and sends eligibility only
  on the first page. All 15 simulator profiles and 83 assets across five pages,
  including both websites, pass deployment checks.

Evidence is in `artifacts/catalog-70938-20261113/` and production operations
directories `net-values-20261113` and `resale-depth-20261113` below
`/home/wow-trader-system/shared/operations/`. Release source manifests record
the prior web baseline, committed overlay and individual source hashes.

## Operations

The remaining in-game check is to run `/reload`, then inspect item and crafting
tooltips. The current market and client eligibility are already synchronized.
Unknown material prices or supply below 50 remain explicit rather than becoming
invented proceeds.

Ingestion has an independent physical release path. **PM2 `startOrReload` does
not reliably replace an existing pinned working directory or script path.** A
successful restart and `/health` response do not establish that new code is
running. Check PM2's actual paths and the authenticated eligibility response.
The first activation caught this and replaced only the ingestion declaration,
with the former declaration retained for rollback.

The web rollback target is `kfc-helper-net-values-20261113`. Restore its web
pointer and recorded build labels, then restart only `kfc-helper-web`.
Ingestion can remain on its verified pinned release. Static delivery retains
the preceding assets for compatibility; activation records hold its previous
pointer. Preserve the pinned ingestion release during storage retention.
