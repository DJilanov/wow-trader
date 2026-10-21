# Forever leveling: player experience redesign

Status: implemented and verified, including optimized build and desktop/mobile browser flows.
Not deployed by this task. This replaces the player-facing
presentation decisions in the earlier theoretical-progress review; evidence audits remain
authoring tools, not the main guide interface.

## Product contract

A player should be able to answer four questions without opening an explanation:
Where am I going? What level am I aiming for? What do I do now? What comes next?

Blank starting progress means level 1 / 0 XP for planning. It must not produce five
unknown rows or require completing an XP form to read the route. A forecast is never
written into recorded XP or quest completion. A fresh recorded bar anchors the remaining
route; absent/stale bars use the route projection, not a fabricated observation.

All screens use one continuous forecast. Chapter boundaries carry XP forward. Quest XP
is resolved at the modeled hand-in level, one-time rewards count once, kill overlap is
deduplicated, and selected/skipped dungeon choices affect subsequent chapters. There is
no independent empty-bar chapter audit in the normal player flow.

## Information architecture

1. **Route overview:** chapter name, target/entry level, expected entry and finish,
   completion, next destination, and Start/Continue. Personal starters show your
   character; shared chapters expose party differences only where relevant.
2. **Quest reader:** current instruction and location first. A compact expected-progress
   result follows the current quest. Chapter target, progress correction and next chapter
   remain easy to find. No source hashes, certification prose, six-column ledgers, or
   repeated XP caveats in the default view.
3. **Update progress:** a focused, accessible dialog for the level and XP shown in game.
   Existing saves, bookmarks, reports and other characters remain intact. Identity,
   dungeon policy and advanced calculation settings stay in Settings.
   Personal steps use Done as the explicit manual completion report, rather than a second
   checkbox followed by Done. Shared steps retain participant confirmation; Next only
   browses. Real eligibility and entry requirements remain enforced.
   The new storage generation migrates existing characters without overwriting the previous
   generation's rollback copy. A corrupt current save does not silently fall back to stale progress.
4. **Optional details:** one progressive disclosure for XP breakdown, sources and model
   assumptions. These explain the actual continuous result shown above, not a separate
   diagnostic with different entry assumptions.

## Targets and handoffs

Dungeon entry requirements remain explicit. Outdoor preparation targets follow the next
selected departure requirement. Personal starter goals are derived from the route's
calculated outcome and real pickup requirements, not the user's blank/current actual
level or an unconditional old source bracket. A partial projected starter exit bar rounds
up to the next whole level for its suggested goal; this does not add XP or an extra grind
step. If no exit is calculable, retain an authored goal rather than invent an outcome.
A planning target is not a command to grind
to a source-recommended level: continue early when the next activities are eligible.

Additional combat needed at a real checkpoint is separate from quest/required-kill XP;
it cannot silently become an earned reward or an observed kill count. Missing combat
data is not zero XP and is not evidence that extra grinding is needed. A blocked forecast
offers one useful correction/data message, rather than five empty tables.

## Implementation sequence

- [x] Shared guide-forecast adapter: defaults, continuous carry, fresh-bar anchoring,
      personal/party scope, targets, and explicit data limitations.
- [x] Player-facing chapter summary and compact optional XP breakdown.
- [x] Consistent route overview, reader header, step result and chapter continuation.
- [x] Focused progress-correction dialog, preserving actual-report safeguards.
- [x] Regression tests for fresh, returning, mixed-party, stale-bar, optional-dungeon,
      missing-data and level-60 cases.
- [x] Real desktop/mobile journeys and visual review using full local references and the
      production-equivalent configuration with combat references absent.
- [x] Completion receipt, including remaining data/publication limitations.

## Release acceptance

Passing unit tests or HTTP 200 is insufficient. Verify what a new player actually sees:
clear numeric targets, useful default XP, readable current instructions, an obvious next
destination, correction/reload persistence, no mutation of reported progress by forecasts,
keyboard/dialog behavior and no mobile overflow. Preserve the first failing checks in
the review evidence rather than relabeling them as passes.

The current production configuration has no combat-reference dataset. Private local
provider data must not be uploaded or relabeled by this UI work. Full-input and
production-equivalent results must be reviewed separately; complete public kill-XP
forecasts cannot be claimed while that release input is unavailable. No commit, addon
installation or production deployment is included in this implementation pass.

## Implementation receipt · 21 October 2026

- `packages/leveling/src/campaign-guide.ts` owns the continuous player projection;
  overview, reader summary, step result and optional XP breakdown consume the same ledger.
  Actual XP is never inferred or automatically awarded. Saved updates are anchored to a
  fixed guide step, not the moving reading cursor. Per-plan caches are bounded.
- `leveling-guide-progress.tsx` provides focused personal/party correction. The reader
  exposes Start immediately; personal Done is the explicit report. Next only browses.
  Dungeon entry still requires real party progress and unlocks. Future unaccepted quests
  are no longer mislabeled as already completed.
- The browser sweep exposed a real optional-dungeon failure: excluding a stop merges
  neighboring chapters, but links used static boundaries. Links and bookmarks now resolve
  against the active plan; a regression test preserves the ownership check.
- Visual inspection fixed clipped completion checkboxes and the mobile dialog heading.
  Chapter jumping is folded away from the current instruction. No new UI dependency was added.
- Browser storage now writes `kfc-leveling:characters:v2`. Only an absent v2 falls back to
  v1; migration never changes the v1 bytes. The validated workspace payload remains version 1.
  Corrupt v2 data cannot silently resurrect old v1 progress. Older releases use the retained
  rollback copy; progress made independently in two reader versions is not auto-merged.

### Verification

- Leveling: **488 tests passed**, including fixed-anchor, continuous carry, default 1 / 0,
  stale/invalid bars, level 60, missing rewards, optional choices and quest-report status.
- Web: the two-worker full run passed **923/925** tests, with two existing simulator
  cases timing out at 5 seconds. Both affected files passed all **36** tests when rerun with
  one worker and unchanged timeouts. The initial unrestricted run also had contention
  timeouts; it is not recorded as a passing full run. No simulator test was weakened.
- Both package typechecks and lints passed. The optimized webpack production build passed,
  including TypeScript, all 57 static pages and standalone packaging.
- The final focused web regression run passed all **24** tests. Formatting, script syntax
  checks and `git diff --check` passed.
- Real browser flows passed at 1440 px and 390 px with a 320 px overflow probe, for both full
  local references and absent combat references: defaults, numeric targets, chapter carry,
  Done without an initial XP form, actual-data isolation, correction/reload, legacy migration,
  optional-dungeon exclusion/restoration, per-player correction, entry guards and Escape.
- Full-input receipt/screenshots:
  `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-player-flow-full-J4YRF3`.
  Absent-combat receipt/screenshots:
  `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-player-flow-quest-only-JmArCi`.
  These are temporary local review artifacts, not published assets.
- The final optimized-build player-flow sweep passed at both viewport widths, including
  chapter-jump navigation, the visible mobile dialog heading and the missing-kill-XP
  explanation. Receipt/screenshots:
  `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-player-flow-quest-only-dHQOWU`.
  A copy of its receipt and mobile reader screenshot is retained under
  `artifacts/leveling/player-experience-review-20261021/production-report.json` and
  `production-reader-390.png` (ignored local artifacts).
  Production correctly withholds private combat references even when a local reference
  directory is configured. The attempted full-input assertion against production therefore
  failed, as retained under `wow-trader-player-flow-full-GgDBjy`; the publication guard was
  not bypassed. Full-input numerical checks use the explicitly local development preview.
- The earlier failing optional-boundary check is retained under
  `wow-trader-player-flow-full-IEuKe9`; the later test-helper selector failure is retained
  under `wow-trader-player-flow-full-VypVlD`. Neither is relabeled as a pass.

Re-run the authoritative player-flow check against an isolated local preview:

```sh
LEVELING_TEST_HELPER=http://127.0.0.1:3329 node scripts/check-leveling-player-flow.mjs \
  --playwright-package=.cache/forever-sim-upstream/package.json --mode=full
```

Point `--playwright-package` at an installed Playwright package. For the second sweep, restart
the preview with combat references absent and use `--mode=quest-only`. The check blocks API
writes, uses isolated browser contexts and refuses a non-local target. Older standalone
browser scripts are not substitutes for this updated player-flow acceptance check.

### Release boundary

This pass changes application code and documents the intended player experience. It does
not install an addon, publish private reference data, deploy a server, or claim a playtested
perfect 1–60 route. In particular, current production lacks combat references: quest-based
estimates work, but missing kill XP remains explicitly uncounted. A later recorded bar can
correct the remaining route without inventing that missing history.
