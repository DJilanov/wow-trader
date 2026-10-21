# Forever leveling: player experience redesign

Status: implementation in progress. Not deployed. This replaces the player-facing
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

- [ ] Shared guide-forecast adapter: defaults, continuous carry, fresh-bar anchoring,
      personal/party scope, targets, and explicit data limitations.
- [ ] Player-facing chapter summary and compact optional XP breakdown.
- [ ] Consistent route overview, reader header, step result and chapter continuation.
- [ ] Focused progress-correction dialog, preserving actual-report safeguards.
- [ ] Regression tests for fresh, returning, mixed-party, stale-bar, optional-dungeon,
      missing-data and level-60 cases.
- [ ] Real desktop/mobile journeys and visual review using full local references and the
      production-equivalent configuration with combat references absent.
- [ ] Completion receipt, including remaining data/publication limitations.

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
