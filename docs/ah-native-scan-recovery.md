# Native Auction House scan recovery

Collector **0.15.7**, Companion **0.3.16**. The matching client eligibility pack
covers build **70888**. Disenchant probabilities, pricing formulas, the 98%
completeness threshold and the fifteen-minute full-scan cooldown are unchanged.

## November 12 — transient readiness in the 0.15.6 scan

The screenshot's scan, `423d5d6f-d161-4193-a4df-bbf59202674b`, ran Collector
**0.15.6** on build 70888 and finished at 06:29:34 UTC. It visited 179,427 rows,
priced 175,099 and retained 4,328 unresolved: **97.5879% completeness** in 221,395 ms.
The final pass checked all 4,368 queued rows and recovered 40, with zero uninspected
rows and no final-pass timeout. Its consistent samples all showed uncached,
unready items; the earlier finalization shortcut is no longer the cause.

There were 8,890 successful load-result notifications, no explicit load failures,
and every queued item had been observed ready at least once, yet later samples
were uncached. This is consistent with transient readiness/cache eviction; the
saved report cannot establish the client's exact cache policy. Blizzard's
[Item object marks item data as evictable](https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_ObjectAPI/Mainline/Item.lua).
The modern item-load API itself matches Blizzard's
[asynchronous callback implementation](https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_ObjectAPI/Mainline/AsyncCallbackSystem.lua).

Collector **0.15.7** adds the pure `NativePendingRows.lua` scheduler. Initial
reading groups deferred positions by item ID before issuing explicit cache loads.
Load notifications, confirmed cache readiness and newly ready pending rows
prioritize the affected group. Those rows are consumed before later bulk work
can move on to other items. Every row still needs its own ready flag and readable
quantity/price; one ready item never substitutes another row's financial data.

The ordinary scan and prioritized reads share the existing 250-row/eight-millisecond
frame budget. Skipping consumed positions is budgeted too. Duplicate notifications
are deduplicated, ordinary observations cannot endlessly retry an unchanged group,
and completed positions cannot be priced twice. Unknown IDs remain pending for the
ordinary retries/final pass. Metadata rate, attempt limits, response/cache/final
bounds and the quality gate remain intact. Local counters now separate prioritized
checks and recoveries. No extra full-market query is introduced.

A 10,000-listing/500-item regression with a cache that holds only eight items
fails under the previous scheduler and completes under the new one. Pure scheduler
tests cover grouping, identity changes, deduplication, rescheduling and skip budgets.
Existing deadline, cancellation, failure, secret-value and quality controls remain
part of the full suite. This is controlled eviction testing; actual live recovery
still needs a fresh scan after the update.

The new module is in the checksum-verified bundle. **Quit and reopen WoW once**
to load its TOC entry, then perform one scan and Save & Reload. The screenshot
itself was a finished incomplete scan, rather than an active processing hang.
The same package refreshes the separately stale disenchant data to build 70888.
Capture, replay and scanner evidence: `artifacts/trader-disenchant-70888-20261112/`.

Collector **0.15.7** and Companion **0.3.16** are installed locally. All sixteen
bundle files, fourteen static installed addon files and the packaged application's
signature integrity were verified. Generated market/account packs and Companion
settings/credentials were preserved during installation; Companion was restarted
and reached its normal scan/synchronization flow. The full addon runner passes
**1,225 native assertions**, the valuation/UI controls and the full client-data
sweep. Companion tests (**48**), desktop tests (**11**), data/preflight tests
(**8**), both typechecks/builds, focused lint/formatting and Lua 5.1 parsing pass.
No server deployment or public installer promotion was performed. The 4,328-row
incomplete snapshot remains incomplete; live recovery is still pending a fresh
scan with the newly loaded addon.

## November 12 — pending rows were ready at the cache deadline

The latest uploaded scan `adb9fa89-cff2-43cf-af1f-4ac8c363eefc` finished at
05:56:35 UTC on build 70888. It visited 191,007 rows, priced 184,823 and counted
6,184 unresolved: **96.7624% completeness** in 223,145 ms. Production archived it
but rejected it for pricing with `completeness_below_98_percent`.

It reports Collector **0.15.4**. The installed files and Companion bundle were
already 0.15.5/0.3.14; this scan was made by the older code still loaded in WoW.
The new timeout logic cannot be evaluated from that scan's version.

All 20 unresolved diagnostic samples had `hasAllInfo=true`, cached metadata and
readable financial fields when sampled. The finalizer first counted its pending
queues as unresolved, then reread a sample only for diagnostics. It never used
those ready rows to update the market. This proves an inconsistent finalization
path for the sampled rows; it does not prove that every unsampled row was ready.
The missing listing prices cannot be reconstructed from this saved snapshot.

Collector **0.15.6** replaces that queue-count shortcut with a **finalizing**
phase. It reads both the deferred prefix and the unread queue remainder once,
within the existing 250-row / eight-millisecond frame budget. Ready validated
rows become priced or bid-only. Still-unready, invalid and protected rows remain
excluded. Diagnostics sample the same API read used for classification, so they
cannot report a separately reread readiness value. No further explicit item-load
or full-market requests are issued in this phase.

The final pass has a ten-second wall-time cap after metadata loading stops. Any
uninspected remainder stays unresolved and is counted separately; it receives no
invented diagnostic sample. New local counters record checked/recovered rows,
uninspected rows and final-pass timeout. Cache loading still stops after its
existing 180-second hard limit, the initial response wait remains 120 seconds,
and the 98% quality gate and fifteen-minute full-scan cooldown remain intact.
AH closure/cancellation still abort without saving a partial market. The UI shows
**Checking the remaining listings** until the scan is saved.

Companion **0.3.15** accepts the optional final-pass counters and failure stage.
Public upload fields/checksums are unchanged. No historical scan is relabeled
complete and no server/catalog deployment is needed.

The deadline-readiness regression fails on 0.15.5 and recovers every synthetic
late-ready row with the final pass. Further tests cover both pending queues,
ready/bid-only/unready mixtures, one-read diagnostic consistency, frame/cap
accounting, request suppression, cancellation and the visible progress state.
The final run passes **1,222 native assertions**, the full addon runner, **48
Companion tests**, **11 desktop tests**, both typechecks/builds, focused lint,
formatting, Lua 5.1 parsing and signed-package verification. Collector 0.15.6 and
Companion 0.3.15 are installed locally, generated packs and private settings are
preserved, and the Companion process has been restarted. Actual recovery needs a
fresh scan after `/reload`; synthetic results do not establish what all 6,184
missing live rows would have contained.

Private scan audit, server acceptance check, tests and rollback receipts:
`artifacts/ah-final-pass-20261112/`.

## November 12 — no auction-list response

The reported “Scan was not saved” detail was “The native market request timed
out or …”, identifying the **initial response wait**, before any new auction list
was read. Collector 0.15.4 stopped that wait after 30 seconds. Its cache timeout
is a separate phase; increasing item-load retries cannot repair a missing list.
The last saved scan remains the complete 70888 result below. The old addon
did not persist failures, so the report alone cannot distinguish a delayed server
response from a request silently ignored during server cooldown.

Collector **0.15.5** now:

- Waits **120 seconds** for the list event, showing elapsed time and the limit.
  It sends one full-market request; waiting never generates another query.
- Records the issued request timestamp before calling the API, including when
  response or throttle events fire synchronously. If the Lua call throws, that
  timestamp reservation is rolled back. The existing **15-minute local cooldown**
  covers issued requests even when they time out, are cancelled, or the AH closes,
  and survives `/reload`. Completed scans retain their existing cooldown too.
- Saves one bounded `nativeScanner.lastFailure` record containing failure code,
  stage, timing, build/version and row counters. The specific failure is restored
  after reload until superseded by a successful scan. No owner or bidder data is
  retained. Save & Reload is available for failure diagnostics even with no scans.
- Shows **No auction list received** for a response timeout, distinct from item
  cache resolution. Failure metrics describe that attempt, while the recent-scan
  list and all valid market snapshots remain intact.

The scanner requires a
[`REPLICATE_ITEM_LIST_UPDATE` event](https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_APIDocumentationGenerated/AuctionHouseDocumentation.lua)
while its request is pending. It does not infer freshness from a nonzero cached
row count, recover unsolicited late results after timeout, fabricate an empty
scan, lower the pricing gate, or bypass server cooldowns.

Companion **0.3.14** retains the optional local request diagnostics. Older and
empty Lua tables are supported; malformed optional diagnostics are ignored
without blocking valid market uploads. These fields are excluded from public
uploads and their checksums. No backend/catalog change is required.

A delayed-response regression fails on 0.15.4 and passes with the new wait.
Controls cover responses before the deadline, hard timeout, no response, reload
and cooldown expiry, manual retry, synchronous response/throttle events, API
errors, AH closure, old-scan preservation, and the visible countdown/failure UI.
The final checks pass **1,192 native assertions**, the full addon runner, **48
Companion tests**, **11 desktop tests**, both typechecks/builds, focused lint,
formatting, Lua 5.1 parsing and signed-package verification. Collector 0.15.5 and
Companion 0.3.14 are installed locally, with generated packs, settings and
credentials preserved; Companion was restarted successfully. Actual live-server
recovery still requires a new scan; a longer wait does not guarantee that the
server will return a list.

After installing, open Companion, run `/reload`, and make one scan while keeping
the AH open. If the previous attempt was sent by 0.15.4, allow **15 minutes from
that request** before retrying: the old version did not save its request time,
and installing new code cannot recover that missing timestamp. A subsequent
failure can now be retained with Save & Reload for precise diagnosis.

Private baseline, tests, installation receipts and rollback copies:
`artifacts/ah-response-timeout-20261112/`.

## November 11 — live recovery and catalog handoff confirmed

Collector 0.15.4 produced scan `aba6522f-c748-4560-a95f-300939b6b7f7` on
build **70888** at 06:32:25 UTC: 166,356 reported/visited rows, 166,353 priced,
three bid-only, **zero unresolved/invalid/protected rows and 100% completeness**.
Duration was 169,722 ms. The request diagnostics record 6,460 attempts including
2,644 retries. This is actual client evidence of recovery, rather than a synthetic
success claim.

At the later website report, Companion was stopped and this scan was still
local-only. The guardian had correctly published 70888 and retired 70862 under
the latest-only retention policy. The website therefore selected the previous
accepted 70862 scan and showed the generic “under review” message for its absent
catalog. No new catalog approval was pending.

Starting the existing Companion 0.3.13 uploaded the scan automatically. Production
accepted it, with the exact 70888 catalog containing 24,389 items and 2,227 recipes.
The public Alliance Trader page returned HTTP 200, showed **405 crafting results**
(50 on page one), build 70888, and no catalog-review banner. The scan was already
about 11 hours old, so the page correctly labeled prices stale/reference-only;
upload time did not replace capture time.

Automatic uploads were enabled, while **Start at login** was disabled. Keep the
Companion running for saved scans to upload, or enable its existing Start at login
setting. No preferences, quality gates, cross-build rules, catalog records or
server services were changed. A fresh scan plus Save & Reload updates quote age.
This AH confirmation does not change the separate exact-build disenchant pack.
Private receipts: `artifacts/catalog-scan-handoff-20261111/`.

## Incident

The November 10 scan `7a3269c6-416f-4b88-9dde-a58dc7d9d332` visited all 157,168
reported rows. It priced 148,888, found 12 bid-only rows and retained 8,268
unresolved rows, giving 94.739% completeness. No invalid or protected rows were
reported; the AH stayed open. The previous scan had 4,970 unresolved rows. The
last complete local scan was November 7.

Previously `ReadNativeRow` returned early whenever `hasAllInfo` was not true.
The cache phase only reread those rows for 60 seconds. It did not request item
data or retain the identities of rows still incomplete at timeout. Those old
counters prove the timeout path, not the precise reason the server/client never
supplied complete rows. Missing listings cannot be reconstructed from that saved
snapshot, and no historical scan is relabeled complete.

## Follow-up scan and remaining flaw

The next live scan, `c5ff23b0-1d6f-4383-97a9-488446014f29`, used Collector
0.15.3 on build 70862. It visited all 154,484 rows, priced 150,057, found 12 bid-only
rows and retained 4,415 unresolved rows: **97.142% completeness**. The AH stayed
open throughout its 120,751 ms duration. Of 19,774 initially deferred rows, 15,359
recovered, but the scan still failed the existing 98% pricing gate.

The new evidence recorded 4,815 distinct item-load calls, zero Lua-call errors
and 2,300 items already cached before requesting them. All 20 unresolved samples
had readable counts and buyouts but `hasAllInfo=false` and `itemDataCached=false`.
This establishes persistent missing metadata for the sampled rows; it does not
prove server throttling or explain every unresolved row.

Version 0.15.3 treated a successful request call as its only attempt. It did not
observe load-result events or retry items still missing. Version 0.15.4 corrects
that confirmed gap rather than changing the completeness gate.

## Implementation

- `NativeItemCache.lua` deduplicates deferred rows by readable item ID and skips
  metadata already cached. Requests use the client's
  [RequestLoadItemDataByID API and load-result events](https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_APIDocumentationGenerated/ItemDocumentation.lua),
  with the item-info API as a compatibility fallback when the request API is absent.
- The Collector registers `ITEM_DATA_LOAD_RESULT` and `GET_ITEM_INFO_RECEIVED`.
  Synchronous and duplicate events are handled without double-releasing slots.
  Polling the actual cache and rereading native rows also work if events are lost.
- Initial attempts and retries share a **50 requests/second** token bucket with
  a burst of four, at most 256 in-flight items and a two-millisecond processing
  budget. These are conservative application limits, not claimed Blizzard limits.
- Missing events release their request slot after five seconds. Failed, timed-out
  or still-uncached items receive up to **three attempts total**, with five and
  ten seconds of backoff before the second and third attempts. Reopening a
  deferred item after cache eviction shares that same per-scan attempt cap.
- Successful request calls extend the existing 60-second grace period, still
  bounded by **180 seconds in the resolution phase**. Cancel, AH close and the
  hard deadline stop further requests. Oversized or persistently failing queues
  remain incomplete; finishing them is not guaranteed.
- Readiness and financial validation remain mandatory. A successful load event
  cannot qualify an item the cache still reports missing, and metadata loading
  never overrides `hasAllInfo=false` for a native row.
- Local diagnostics distinguish distinct requested IDs from total attempts,
  retries, in-flight items, observed success/failure events, timeouts, loaded
  items and exhaustion. Up to 20 unresolved samples retain item ID, cache and
  readiness flags, readability, attempt count and the last observed load result.
  They contain no owner/bidder names or actual prices.
- The Companion accepts old scans and both generations of local diagnostics.
  These fields remain excluded from public uploads and checksums. No public
  contract, pricing formula, yield model, database migration or extra full-AH
  query is introduced.

## Verification of 0.15.4

The regression first failed on 0.15.3 when an accepted item request silently
failed to populate the cache. It passes with bounded retries. Additional controls
cover explicit asynchronous failures, duplicate/synchronous events, missing
notifications, preloaded metadata, cache eviction, late results, per-item attempt
caps, outstanding/rate/frame budgets, cancellation, AH closure and hard timeout.
The existing 157,168-row / 8,268-deferred-row recovery test remains included.
Persistent failures retain diagnostics and remain excluded from prices.

The full Lua runner also checks JavaScript/Lua pricing parity, crafting,
tooltips and exact-build eligibility. Companion tests check bounded optional
retry evidence, backwards compatibility and unchanged public upload/checksum.
Desktop installer tests verify module integrity and preserve generated packs.

The final local run passes 1,170 native assertions, 45 Companion tests and 11
desktop tests, plus the full addon runner, both typechecks/builds, focused lint,
formatting and Lua 5.1 parsing. Collector 0.15.4 and signed Companion 0.3.13 are
installed; the Companion was launched successfully. Generated market/account
packs and private settings/credentials were preserved during installation.
The next live scan was pending at installation; the November 11 result above now
confirms actual 0.15.4 recovery on build 70888.

Commands:

```sh
node scripts/test-trader-addon.mjs --lua=/absolute/path/to/lua-5.1
pnpm --filter @wow-trader/companion-core test
pnpm --filter @wow-trader/companion-core typecheck
pnpm --filter @wow-trader/companion-core build
pnpm --filter @wow-trader/desktop test
pnpm --filter @wow-trader/desktop typecheck
node scripts/prepare-addon-manifest.mjs --check
pnpm --filter @wow-trader/desktop build
```

Run the core build before packaging the desktop app so its bundled parser retains
the new diagnostic fields. Actual live-game recovery remains an in-game check;
the regression does not establish that every incomplete server row is caused by
missing item metadata.

## Next scan

1. Open Companion 0.3.16 and quit/reopen WoW once to load Collector 0.15.7
   and its new pending-row module before scanning.
2. Open the AH and start one scan. Keep the AH open while item data is loading;
   the cache phase can last up to three minutes.
3. Use **Save & Reload** after completion. A healthy scan can refresh pricing;
   an incomplete scan remains excluded and retains its local diagnostic sample.
4. If issues remain, inspect the new `cacheDiagnostics` alongside the scan ID.
   In particular, distinguish missing IDs, unsuccessful load requests, uncached
   items, and cached items whose replicated rows remain incomplete. Do not drop
   the readiness flag, reset the full-scan cooldown or lower the quality threshold.

Initial evidence is under `artifacts/ah-cache-fix-20261110/`; the follow-up audit,
checks and rollback copies are under `artifacts/ah-cache-retry-20261110/`. Source
and installed data from the original incident remain preserved. No commit,
push, public installer promotion or server deployment is part of this local fix.
