# Buying opportunities and material price history

The buying assistant compares actual Auction House price levels with a bounded
historical normal range. An opportunity is a conditional resale estimate, not a
prediction that the market will recover or evidence of a completed sale.

## Shared policy

- Latest accepted observation per item per half-hour bucket; at least 98% scan
  completeness. Quality breaks timestamp ties. Substandard scans never add evidence.
- At least six independent buckets; at most 336 observations within seven days.
- Normal ask is the median p10 ask. Its band uses the larger of 5% or twice the
  median absolute deviation, with a minimum radius of one copper.
- A buy requires a scan at most one hour old and at least three market listings.
  Falling, rising, oversupplied, thin and spike-risk markets are excluded.
- Resale target is the lower end of the normal band. The AH cut is 5% on faction
  and regional houses or 15% on neutral houses. Unknown fees lock recommendations.
- Buy ceiling is the smaller of 85% of normal and the net target divided by 1.2.
  This requires a 15% discount and at least a 20% conditional return after the cut.
- Consume actual ascending price depth below that ceiling. Cap units at 10% of
  normal listed supply, with a minimum of one and a hard maximum of 100. An optional
  per-item budget and lower quantity limit can reduce this further.
- Fees round upward to copper. Deposits, expiry losses and sell-through are unknown.
  Whole auction stacks must be checked in game; the collector aggregates unit depth.

The website and addon use the same rules, with exact JavaScript/Lua comparison
tests. Lua refuses money values that cannot safely participate in its integer
arithmetic. Web suggestions and addon tooltips expose the target, buy ceiling,
quantity, purchase cost, AH cut and conditional profit before deposits.

## History across patches

Histories stay separate by product, region, realm and Auction House. A new build
starts independently unless a maintainer records a same-economy compatibility
link. Each link has a cutoff and reason; linked histories are included only when
the complete item-version record is unchanged apart from its build ID. A launch,
realm reset, different realm or faction must not inherit the earlier economy.
Links follow increasing build numbers; chained links preserve cutoff restrictions.

Migrations: `0021_market_history_continuity.sql` and the additive scan-name/category
columns in `0022_market_scan_item_identity.sql`. Preview a reviewed link with:

```sh
pnpm --filter @wow-trader/ingest-api market:history:link \
  --product wow_classic_beta --region EU --realm REALM --faction alliance \
  --from OLD_BUILD --to NEW_BUILD --since 2026-10-31T00:00:00Z \
  --reason 'Compatible patch; unchanged realm economy verified' --same-economy
```

Replace the example scope/builds/cutoff with the reviewed values. Add `--apply`
to persist the link and rebuild derived market signals. No beta-to-launch link is seeded.

## In-game workflow

Collector 0.13.0 adds the pure `MarketPolicy.lua` module before `Collector.lua`.
`/wowtrader market` opens buying guidance. Search, filter buys/watchlist, set a
per-item gold budget, choose a quantity limit and page through results. Hover a
row for its full plan. It does not buy or post anything.

Completed local scans immediately replace the displayed price, supply, label and
buying plan. Queued local scans work without a downloaded pack. A newer synchronized
community book can also supply quotes; an older local book cannot replace it. When the Companion
is available, it downloads bounded history after synchronization and atomically
replaces `MarketData.lua`. Run `/reload` to load that external update. Build and
market compatibility remain exact for the running client; queued scans from
another scope and items absent from the latest scan cannot generate a purchase.
Stale quotes never generate a buying alert.

Companion 0.3.6 understands the extended, backwards-compatible API history and depth fields
and writes version-2 Lua packs. Older companions still accept the API's existing
fields, but need updating to provide the full new in-game history. The installer
ships and verifies the new policy file and preserves generated market data.

History downloads use 500-item pages pinned to a scan and policy revision, with
bounded requests, rate-limit retry and a five-minute overall deadline. A failed
or changed page cannot replace the installed pack with partial data. Uploads
serialize derived updates per economy: delayed scans retain the latest book,
and backfills update any reviewed dependent builds. Open web pages lock buying
plans when their scan passes one hour, even without a new scan or page reload.

## Verification and delivery

```sh
pnpm --filter @wow-trader/market test
pnpm --filter @wow-trader/market build
node scripts/test-trader-addon.mjs --lua=/path/to/lua-5.1
pnpm --filter @wow-trader/companion-core test
pnpm --filter @wow-trader/desktop test
```

Evidence for this update is under `artifacts/trader-buy-20261031/`. Production
must receive the additive migration before the new API/web readers. Rebuild
derived market signals after deploying the shared policy. Preserve raw scans and
scope boundaries; do not fabricate history to unlock a new market.

Validated price-only item search is independent of recipe-catalog publication.
Client-reported names/categories are retained with the scan; unknown stats and
vendor values remain unavailable until catalog verification. Crafting keeps its
published-catalog requirement. Price-only mode also skips the recipe evaluator.

Deployed October 31, 2026 at 15:08:43 UTC from `c496dcb`, with packaging fixes
`95a5d35` and `3dc8d86`. Collector 0.13.0 and Companion 0.3.6 are installed locally;
all four desktop architectures are downloadable from the public addon page.
Ninety-five focused tests, 120 JS/Lua comparisons, 14 real PostgreSQL controls,
15 responsive browser checks and 80 live assets pass. Real public API pagination,
authentication and all four public downloads pass. Receipts are under the evidence
paths recorded in `context.md`; `fixes.md` records deployment recovery details.

Deployment requires both service processes. Probe compiled API runtime imports;
a web-only filtered dependency install does not contain all API dependencies.
PM2 reload can retain its previous API cwd/script: recreate that process using the
candidate's ingest ecosystem configuration and verify the actual paths before
calling deployment complete. Preserve old API/web/static releases for rollback.

Mac package hooks repair bundle integrity with ad-hoc signatures, which are not
Developer ID signing/notarization. Verify secure token persistence in the real app.
Versioned asset IDs prevent immutable download caches from retaining old packages.

No new market observations were generated by the rollout. Players must scan in
game, save with `/reload` or logout, allow Companion synchronization and reload
again to load downloaded history. Six independent half-hour buckets and a scan
under one hour old are required for a buying recommendation.
