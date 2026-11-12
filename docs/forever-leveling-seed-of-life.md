# Seed of Life: post-boss pickup and retained parcel

The private **V1539 engine / XP revision 217** implements Seed of Life as a supplied-item delivery. The **V1540 primary candidate** picks it up after Princess Theradras and batches the return with the next existing Moonglade visit. This fixes an early pickup and an unnecessary separate trip. It does not complete full-route XP or travel qualification.

## Source and item lifecycle

The pinned provider identifies quest **7066**, minimum level **45**, as an ordinary quest for all classes. Zaetar's Spirit **12238** starts it; Keeper Remulos **11832** receives it. The supplied item is **17760, Seed of Life**. Historical `quest_template` requires exactly that one item at delivery, and its pickup and reward script fields are zero.

The archived Maraudon instructions place the Princess kill at step 56 and Zaetar's pickup at step 57. The historical Princess death event also summons Zaetar. The method binds the selected Princess objective before the friendly pickup; it does not add a server prerequisite requiring quest 7065 to be rewarded. Zaetar's friendly level-60 entry is never treated as an enemy or assigned kill XP.

Each player receives one Seed at pickup, retains it and delivers it once. The supplied-item ledger and actual task reporting use the same transfer. The obsolete generated “Complete Seed of Life” action is removed and its bookmark points to the actual return. Native exports contain the captured pickup and hand-in, with no invented `.complete 7066` counter or acquisition fight. Current client-cache snapshots do not contain this quest; the required-item slot is explicitly a historical reference, not a newly observed client counter.

## Route placement and reward

The pickup follows `dungeon-maraudon-objectives-complete-7065`. The return moves from the immediate Maraudon exit to `library-41-before-dungeon-blackrock-depths`, immediately before the already selected Rabine Saturna hand-in. That section has a **53–55 route reference**; the full forecast has not yet verified its actual entry and exit bars. No class teleport or additional Moonglade journey is assumed. Every player keeps the Seed and its quest-log slot until delivery.

The reward evidence remains unchanged: historical base **6,100 XP**, with the dungeon coefficient applied once and the existing rounding. The controlled component test pays **14,500 per player at level 46** and **5,800 at level 59**, demonstrating that delivery level matters. These are reference calculations, not measured Forever payouts. Task reporting updates inventory and requests an actual XP update; it does not manufacture an observed bar.

## Saved progress and verification

Saved supplied-parcel and conversion models bind related phase order, item requirements, source guards, locations and rewards. Repeated chapter/version and reward-provenance strings are stored once inside the identity; numerical tables use compact tuples. No hash truncation or increased validation limit is used. The V1540 builder also binds the complete route, raw combat data and frozen engine using their full SHA-256 values in the model revision. The current primary identity is **9,855 characters**, within the existing **10,000** limit. Tests reject changed guards, reward sources and capture times as well as changed recipes and delivery definitions.

All **4,313 tests / 257 files**, strict typecheck, lint and six package builds pass. All **256 older test files remain unchanged**. Eighteen new component cases cover personal supply, single delivery, reward scaling, source binding, invalid phase order, duplicate phases, saved continuation, native exports and missing inventory.

The current independent primary audit covers **30 player forecasts, 120 serialized player continuations and 20 native role exports**, including source/manifest coverage and Lua syntax checks. XP totals and bounds before the current checkpoint are unchanged. The Seed pickup is now later, so no Seed or Seed reward is granted before the unresolved normal Scion payout. The written-route quest-log scan is a structural check; it does not qualify source-condition skips or gameplay beyond that checkpoint.

## Scion review and remaining work

The separately pinned historical core has an explicit `NO_XP` gate and separate normal/elite gain branches. Its generic temporary-spawn implementation does not establish that all summons grant zero XP. Historical Scion rank, multiplier and AI rows do not establish the current Forever spawn flags or normal-dungeon tuning. **No zero payout, elite-rate substitution or new Scion calibration is adopted.**

Normal Scion payout, Twisted's full **25 carvings per player / 125 per party**, later route funding and travel, actual-game behavior and the original wider-group matrix remain unqualified. The public V1394 download and canonical locks are unchanged. Nothing in this revision is committed or deployed.

Evidence under `.cache/leveling-no-grind-20261031/`: `mara-core-review-v1508/manifest.json`, `mara-seed-reference-v1509.json`, `seed-route-construction-v1514.json`, `seed-method-validation-v1519.terminal.json`, `seed-method-engine-v1521/scope.json`, `scion-source-review-v1522.json`, `seed-route-validation-v1524.json`, `seed-route-qualification-v1525.json` and `source-flow-progress-v1526.json`. Earlier failed checks are retained; the final checks above pass.

The current Willow/overlapping-loot change preserves this Seed method and all primary XP totals and bounds. Latest receipt: `source-flow-progress-v1546.json`. [Current implementation and checks](forever-leveling-collateral-loot.md).
