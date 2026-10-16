# Forever patch notes talent updates and combat simulator

## Product decision

Add a daily official-news import to the existing Changes page, reconcile talent and spell data
against the installed Forever client, and build a WoWSims-style simulator using a reviewed existing
engine. Keep these as three connected releases: importing an announcement must not silently change
the calculator or the combat model.

The simulator compares complete characters: equipment, dungeon-set thresholds, talents,
race, buffs, rotation and encounter. The approved scope now includes every launched profile in the
reused engine, not a Warrior-first pilot: 15 individual profiles across nine classes plus the raid
builder. Tank profiles keep their provisional encounter assumptions; unimplemented healing agents
are not presented as working simulators.

The implementation is deployed and the daily production worker is active. The original research
and later model validation requirements remain applicable; automatic news ingestion is not
automatic model approval.

## Production deployment October 16

Feature commit `14f9b5d` is pushed. Web release `kfc-helper-simulator-20261016-r11`, build
`8HugevLp4-Lvt8LDnKKT7`, retains the r10 production baseline and v3 XP readers with the scoped
simulator overlay. Existing catalog surfaces, crawler/publisher and ingestion runtime are preserved.
The new updater is saved in PM2 under `kfc-helper-official-updates`, namespace `kfc`.

The first notes and talent checks succeeded at 10:00 UTC. The published talent snapshot is generated
October 16 for build 70425, checksum
`02d195f23062210e4f6f4ea1b2b06e32587a18f56f228862148fa68fd9e8ee18`. All 661 new talent assets and
3,475 simulator files were hash-verified on the server. Both sources are next due at 06:00 UTC on
October 17. Daily publication remains independent from the pinned combat model and AH catalog.

Linux validation passed 41 data tests, 230 web tests, lint, TypeScript and the production build.
Every supported individual profile produced a browser combat result; Raid and mobile layouts passed.
The public HTTPS class/profile flow also produced a real combat result after activation.

The verified pre-publication backup is
`/home/wow-trader-system/shared/backups/simulator-20261016-r11-Qr28yC/wow_trader.dump`
(216,217,477 bytes). The release retains prior publication pointers and the web environment backup.
Rollback must use the compatible r10 web runtime, not a pre-v3 XP reader. Source/runtime files,
published assets and backups are retained; only the new generated build cache was removed.

## Existing data and concrete gaps

Checked October 16, 2026:

| Surface             | Current evidence                                                                                                                         | Consequence                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Blizzard notes      | Topic 631316 public JSON returns HTTP 200; post 6 is ID 6435321, edited October 16 at 00:16:31 UTC                                       | Import the topic and its edits, not a dated slug or only post 6                                     |
| Forum pagination    | The response has six stream entries despite `posts_count: 4`                                                                             | Follow actual post identities and pagination; do not use the count as completeness proof            |
| Changes page        | `apps/web/src/app/forever/encyclopedia/changes/page.tsx` displays catalog comparisons and the imported preview changelog                 | Add official notes as an independent feed without replacing existing histories                      |
| Published talents   | Public preview API reports October 8 data, build 1.60.1.70291, published October 10                                                      | The October 15 patch is not represented simply because the website is online                        |
| Installed client    | `.build.info` reports active `wow_classic_beta` version 1.60.1.70425                                                                     | Extract a new candidate instead of relabeling build 70291                                           |
| Local catalog       | Latest retained build-70291 snapshot has 23,946 items, 536 sets, 1,562 members and 1,468 set effects                                     | IDs and set relationships already exist, but presence is not availability or mechanical correctness |
| Combat item outputs | That snapshot has zero normalized item-stat, weapon-damage and item-effect rows                                                          | These outputs are not ready to feed a credible simulator                                            |
| Item stat cause     | `CreateItemStats` expects `StatModifier_bonusAmount`; the sample Helm of Valor instead contains `StatPercentEditor` and stat-type arrays | Implement the build's budget-based stat resolver with verified rounding and slot mapping            |
| Item effect cause   | 12,619 raw ItemEffect rows have no `ParentItemID`, which the current normalizer requires                                                 | Resolve the actual item-to-effect link, including ItemXItemEffect where supported                   |
| Talent identity     | `createTalentKey` currently uses class, tree and talent names; source talent records have no required game IDs                           | Add durable mappings before renames and tree moves become silent save migrations                    |
| BiS package         | It already enforces item legality and set thresholds; its current evaluator produces a rule-based score                                  | Reuse legality and adapters, not the score as simulated DPS                                         |

The inspected catalog is under
`artifacts/local-catalog/9073201543de/catalog-snapshots/wow_classic_beta/70291/enUS/8f792ef0e23f260503538004465fa80df639597decba8f76382162a6538ea8c7/catalog-snapshot-manifest.v4/`.
Magister's Regalia is set 181 and Battlegear of Valor is set 189, each with eight member IDs and
separate threshold spell IDs in that snapshot. The target is their current effective client data,
not an assumption that historical Classic bonuses still apply.

## Daily official notes import

### Source collection

Use the public topic endpoint `https://eu.forums.blizzard.com/en/wow/t/631316.json`. The supplied
`/6` URL identifies a post number; the topic ID remains useful when the title and slug change.
[Discourse documents](https://meta.discourse.org/t/fetch-all-posts-from-a-topic-using-the-api/260886)
the initial topic response and additional `posts.json?post_ids[]` requests for missing stream IDs.

Run a bounded one-shot Node job once per UTC day, proposed default 06:00 UTC, through the server's
existing scheduling conventions, with a nonoverlap lock and a persisted successful-run date. Keep the website in PM2;
no Docker or continuously polling browser is required. Use a separate source-specific request
policy: a few Blizzard requests daily must neither consume nor bypass the Wowhead crawl gate.

1. Allowlist the host, topic and official authors; validate topic identity and the trusted
   staff/author metadata. Ignore ordinary replies, signatures and user data.
2. Read the topic and all missing relevant stream posts with bounded pagination. Recheck existing
   official posts as well as new IDs: an edited first post can contain new information.
3. Keep each original response privately with its hash, retrieval time, post ID/number,
   `created_at`, `updated_at` and revision metadata. Hash normalized substantive content separately
   so likes, view counters and serialization changes do not create news entries.
4. Use conditional requests only if the source supplies validators. This inspected response had
   neither ETag nor Last-Modified; normalized content hashes must handle ordinary unchanged 200s.
5. Validate size, content type, redirects and schema before import. Honor source restrictions and
   Retry-After; stop on access challenges. A failure keeps the last good publication and records
   an alert rather than blanking the Changes page.
6. Import idempotently and publish validated official-news summaries atomically. Detect edits,
   corrections and confirmed removals without silently erasing historical revisions. An incomplete
   pagination response is not evidence that a post was deleted.

Store timestamps in UTC and display the viewer's timezone explicitly. Keep the post's stated
patch date separate from its edit time: an October 15 note edited October 16 is not two patches.
A forum date does not establish a client build or rollout time.

### Storage and publication

Reuse `externalDataSources`, immutable `externalDataSnapshots` and their publication mechanism
for a distinct Blizzard source. Add focused post revisions, normalized change claims, entity links
and review status where they need indexing. Do not mix the forum payload into the Talents Forever
snapshot or market catalog contracts.

Public content should be short factual summaries, numerical changes and links to the original
post, with attribution. Retain complete source bodies privately rather than republishing entire
patch notes by default. Render approved plain text or a restrictive structured-content model;
never inject Discourse's `cooked` HTML directly into React.

### Changes page experience

Offer Official updates, Client changes and Preview-source history filters on the same page.
Official cards show the patch date, edit badge, class/spec tags, short changes, source link and
whether the calculator and simulator have caught up. Show last successful check separately from
last content update. A successful check with no edits must not imply a new patch.

New numerical news can appear automatically after source validation. Proposed interpretations,
talent migrations and simulator behavior changes require their own gates. A stale talent snapshot
must not make otherwise valid official news unavailable.

## Keeping talents and spellbooks current

### Treat notes as claims and the client as a versioned source

Normalize each claim into its source revision, class/spec, candidate entity IDs, field, old/new
value when explicit, units, scope, applicability and evidence state. Distinguish mechanical,
structural, tooltip-only, bug-fix and unknown-impact changes. Name matching can propose mappings;
it cannot conclusively select a spell with several ranks or similarly named variants.

Examples from the [official development notes](https://eu.forums.blizzard.com/en/wow/t/631316/6):

- Fire Nova's stated coefficient changes from 0.214 to 0.143, but its base damage and mana cost are
  described without exact replacement numbers. The coefficient alone does not define the spell.
- Missile Barrage changes position and rank cap. Updating its tooltip without allocation rules
  would leave a broken calculator; a general description of column rearrangements cannot supply
  every final grid coordinate.
- Shred has a tooltip-only fix explicitly described as not changing damage. Do not buff its
  simulated damage a second time.
- Auras becoming raid-wide change buff scope and composition assumptions, not only tooltip text.

Optional language-model assistance may propose structured claims and summaries. It must not
generate and execute engine patches or promote ambiguous coefficients without review.

### Client reconciliation

Extend the existing .NET extractor rather than replacing the JavaScript product stack. Audit the
current build's available schemas before choosing the authoritative talent system. Existing
Forever-fork code points to Trait tables, so do not assume legacy Talent/TalentTab represents the
active tree.

The extraction candidate should cover TraitTree, TraitNode, TraitNodeEntry, their join tables,
TraitDefinition, TraitDefinitionEffectPoints, TraitEdge, Curve/CurvePoint and relevant cost and
condition tables. Resolve talent ranks through their effect curves where the client uses them.
Export active-tree membership, ranks, prerequisites, layout, spell IDs and allocation conditions;
do not select an obsolete node merely because its ID or display name looks plausible.

Normalize the spell graph needed by those talents: effects and AP/SP coefficients, class masks,
triggers, costs, durations, cast times, recovery categories, aura periods, charges and proc data.
Preserve raw rows and unresolved formula tokens. Client data can establish a displayed value
without proving an undocumented server-scripted interaction.

The local collector/companion can later detect a changed installed build or hotfix hash and offer
an extraction/upload workflow. The production server cannot read a Mac installation while that
Mac is offline. Until fresh evidence arrives, show announced changes and stale-data warnings.

The existing `forever-data sync` importer can also check the aggregate Talents Forever export
daily as a separately attributed candidate source. Reuse its schema/semantic validation and
immutable imports; do not publish a changed feed blindly or mistake a beta-source label for
independent client verification. Client mappings and official claims determine which changes
are reconciled, disputed or still waiting for current evidence.

### Stable identity and publication

Use a durable internal entity ID mapped to exact-build Trait/spell IDs and source aliases.
Names and tree coordinates are labels, not permanent save keys. Keep legacy name keys readable
inside their original snapshot; migrate only through an explicit reviewed mapping.

Retain the existing immutable snapshot URLs and local/shared builds. When rank caps shrink,
prerequisites change or talents disappear, show the affected points and require a legal migrated
allocation. Never silently spend or discard points in another talent.

Track separately whether an entity is announced, client-reconciled and modeled/tested. Publish
calculator data after structural, rank and asset validation; publish a simulator model only after
its own tests. Notes and client disagreements remain visible with their source/build rather than
one source blindly overwriting the other. Per-class releases can keep unaffected classes current.

## Resolving dungeon equipment and set bonuses

First extract build 70425 into an isolated candidate with pinned definitions and hotfix identity.
Do not mutate the current AH catalog merely to populate simulator inputs.

Resolve budget-based stats using ItemSparse, the build's RandPropPoints/quality/slot mapping,
item bonuses and applicable level curves. Distinguish flat percentages from ratings and verify
the level-dependent conversion of hit, crit, expertise and haste. Preserve school-specific damage,
spell damage and healing as distinct inputs until the current ruleset establishes a conversion.
Use the appropriate build-specific damage, armor, shield and scaling tables for weapons and armor;
do not substitute Classic weapon ranges because the existing normalized array is empty.

Resolve item effect membership through the actual link tables. Connect each set threshold through
ItemSetSpell to the full spell/aura/trigger chain, including conditions, proc event, chance or PPM,
internal/shared cooldown, duration, stack rule and affected abilities. A threshold ID is not an
implementation of the bonus.

Gate simulator admission per item/effect, not on whether all 23,946 items are solved. Start with
the chosen Warrior dungeon gear, all used weapons/trinkets and Valor's relevant thresholds; then
cover each other spec's sets. Validate sampled raw stat calculations against ordinary in-game
tooltips/character stats or another independently scoped source, including zero and negative cases.
Record missing or unsupported fields, never replace them with zeros or projected future equipment.

Count equipped pieces once and activate each applicable threshold once. Compare whole legal
loadouts: replacing one stronger item can lose a valuable five-piece proc. Unsupported effects
block a trusted comparison or enter an explicitly provisional sensitivity scenario, not a silent
no-effect baseline. Acquisition availability remains separate from client visibility.

## Simulator engine and application integration

### Engine candidates

The [WoWSims Classic source](https://github.com/wowsims/classic) uses a Go simulation engine,
protobuf contracts and a TypeScript UI, with WebAssembly/browser-worker support. Its
[MIT license](https://github.com/wowsims/classic/blob/master/LICENSE) permits adaptation while
requiring the notice to remain; retain the requested visible upstream link too.

Candidate revisions inspected on October 16:

- WoWSims Classic `7779ebbf79dc7f1341e6ab939b28a3402c9a730a`: baseline engine and test infrastructure.
- [ProfetGit Forever](https://github.com/ProfetGit/forever-sim)
  `b2e6a49ef4eac49e26c860cff277053d0aea76cf`: older adaptation with stated gear and rotation gaps.
- [gunba Forever](https://github.com/gunba/wow-forever-sim)
  `9a27c3d6af91d1ca0dbcf94a124b8869ad522108`: active October-15 mechanics work; its current ranking
  scenario uses hypothetical equipment. Evaluate its mechanics, not that gear as confirmed loot.

Both inspected forks retain MIT. Audit licenses for any separately imported data/assets too.
Pin a reviewed commit and validate every supported profile in the browser before publication.
Do not fetch arbitrary upstream branches into production or use a Forever fork's Classic toggle
as proof of a pristine Classic control: its talent and item schemas may already be modified.

Keep Next.js, TypeScript contracts, PostgreSQL and the existing .NET extraction boundary. Reusing
Go/WASM is a narrow engine exception to the JavaScript preference, not a move to .NET or a second
application backend. A new TypeScript combat engine would have to recreate and validate the same
event timing, combat tables, resource rules and effects; it is not required to get a Next.js UI.

### Typed runtime boundary

Add a focused TypeScript adapter from our exact-build catalog and talent IDs to a pinned engine
contract. Generate the protobuf boundary where practical; do not pass positional talent strings
from the Encyclopedia directly to a different tree schema.

Run interactive simulations in browser workers with cancel/progress and bounded concurrency.
Serve versioned WASM/data assets lazily, with immutable URLs and matching manifest hashes. This
keeps repeated simulations off the storage-constrained production server. Optional larger jobs
can later use a separately limited worker; they must never share the AH ingestion event loop.

Every run/save/share URL records the build and hotfix, item and talent snapshots, mechanics/model
version, engine revision, rotation, complete encounter/buff settings, seed schedule and iterations.
Retain an old compatible engine for historical replays, or clearly report that replay is unavailable;
never silently rerun a historical link against today's mechanics.

### Player experience

Add `/forever/simulator` and its supported profile pages with gear selection and active set thresholds beside Talents,
Buffs, Rotation, Encounter and Results panels. Offer an explicit import from an Encyclopedia build
and later an addon character export. Preserve the KFC design and usable mobile controls.

The first useful actions are Compare gear A/B, Compare talent builds and Show dungeon-set upgrade
path. Results include average DPS with sampling uncertainty, ability breakdown, resource waste,
proc/crit/miss rates and uptime. Show item/model coverage and unresolved assumptions beside results.
More iterations reduce sampling noise, not uncertainty about an unverified game mechanic.

For scaling, compare real complete loadouts and small stat perturbations under identical scenario
settings. Evaluate set thresholds as combinations rather than one static score per item. Report
which buffs, caps or proc interactions explain the difference. Keep hypothetical stat-growth
experiments separate from obtainable gear and never extrapolate one beta curve into a future tier.

## Validation and patch feedback loop

Connect each modeled effect to the source entities it depends on:

```text
Official note revision or client snapshot diff
  -> affected talent spell item and set identities
  -> affected model rules and regression fixtures
  -> candidate simulator release and targeted benchmarks
  -> reviewed publication and visible freshness state
```

Only dependent results/caches become stale; unrelated classes and historical runs remain usable.
Benchmark regressions explain a change, but an expected DPS number must not be regenerated merely
to hide a broken model. Use independent seeds or held-out scenarios when validating a selected
rotation or gear winner, and distinguish a candidate winner from a proven global optimum.

Required checks include:

- Import: unchanged 200/304, edited first/old post, appended post, renamed slug, partial pagination,
  inconsistent counters, invalid author, malicious HTML, timeout/429, overlap and restart recovery.
- Talents: complete rank curves, active-node selection, cycles, invalid prerequisites, moved/removed
  talents, reduced rank caps, unknown claims and unchanged historical/shared builds.
- Catalog: budget/slot/quality boundaries, item bonuses, damage ranges, effect joins, client tooltip
  parity and no accidental change to TBC extraction.
- Engine: resource generation, weapon normalization, hit/crit/glancing/resist tables, cast/GCD and
  channel timing, aura scope/exclusivity, DoT rules and every enabled proc/set threshold.
- Patch examples: Fire Nova coefficient, Shred tooltip-only behavior, Missile Barrage allocation
  and the updated raid-wide buff scope. Unknown numerical parts stay unresolved.
- Runtime: browser/native parity within an agreed tolerance, deterministic seeded reruns, numerical
  sanity, invalid input rejection, cancellation, mobile responsiveness and no heavy synchronous work
  on the main thread.
- Game validation: compare available ordinary tooltips and player-provided combat logs/controlled
  tests. Do not try to bypass secret values or protected UI. Logs remain private by default.

## Delivery order and acceptance gates

1. Daily official feed and Changes UI. Accept when edit detection, source attribution, last-good
   fallback, freshness indicators and the once-daily job pass integration tests. This can ship
   independently of all combat work.
2. Fresh client mechanics and item candidate. Accept when current talent structure and the first
   dungeon loadouts have complete, individually evidenced inputs. Market publication stays separate.
3. Reviewed engine choice and all-supported-profile alpha. Accept when legal builds run in browser
   worker, all enabled effects have tests, unsupported gear is visible and saves are versioned.
4. Dungeon-set and talent comparisons. Accept when A/B changes, set breakpoints, repeated runs and
   selected controlled game observations agree within declared tolerances.
5. Additional validated mechanics and simulation-backed BiS. Reuse legality and candidate pruning from
   `@wow-trader/bis`, evaluate finalists with the simulator, then validate on independent runs.
   Add healers/tanks only with their own survival/healing scenarios and evidence gates.

Daily notes are the small independent delivery. Modern item normalization and class-mechanics
validation are the substantial work; a complete all-class simulator should be planned as several
validated releases, not one automatic patch-note conversion.

## Implemented release

### Simulator and equipment policy

`pnpm simulator:prepare` builds the pinned MIT Forever adaptation at
`9a27c3d6af91d1ca0dbcf94a124b8869ad522108`. Node orchestrates the build; Go 1.27.2 and protobuf
tools live in the ignored local cache. No Go service or Docker is needed at runtime. The build
self-hosts its JavaScript, CSS, fonts, workers and WASM; item icons may still use the upstream icon
host. MIT notices and the WoWSims/Forever credits remain visible.

The supported pages are Balance, Feral and Feral Tank Druid; Hunter; Mage; Protection and
Retribution Paladin; Shadow and Smite Priest; Rogue; Elemental and Enhancement Shaman; Warlock;
Warrior DPS and Protection Warrior; and Raid. Alternative talent builds and rotations remain
available inside the corresponding class engine. The upstream healing-only agents are unlaunched.

The real-source allowlist retains 1,908 equipment records and excludes 939 projected records.
Projected rankings are removed. The fallback database is restricted too, so an unsupported item
cannot reappear with obsolete Classic stats. A retained item is not a claim about loot availability
or perfect server-side mechanics. Combat results are explicitly labelled beta estimates.

The current release is `97542052802008a0112748b0`, with 22 built pages including upstream support
tools. Assets live under `FOREVER_SIMULATOR_ROOT/<release>/`; `active.json` chooses the new default.
The Next route serves only manifest-listed files, rejects traversal and escaping symlinks, streams
WASM with its correct MIME type and uses immutable caching. Old releases remain addressable.
The iframe uses a scoped content-security policy and the simulation runs in the user's browser.

### Daily source updates

`pnpm forever:updates --local-only` validates and archives official notes without database writes.
With a writer `DATABASE_URL`, `pnpm forever:updates --talents` also checks the structured Talents
Forever feed. Notes and talents run independently: failure of one source does not cancel the other.
No Wowhead queue, pacing checkpoint or crawler process is changed.

`scripts/forever-updates-worker.mjs` runs on startup if due, then at 06:00 UTC daily. Import locks
prevent overlap; persistent health records prevent repeated same-day fetches. Notes use the complete
topic stream, author/staff validation, robots policy, bounded responses and source cooldowns that
`--force` cannot bypass. Raw captures remain private. The Changes page displays affected classes,
systems and change categories with direct links to the original post; it does not mirror the full
forum article. A failed refresh retains the last validated publication.

Talent publication requires all nine classes and 27 complete trees, consistent beta build metadata,
and non-decreasing generation/build dates. Assets are staged and hash-verified before changing the
existing PostgreSQL publication pointer. Full-checksum asset URLs preserve old snapshots; existing
12-character asset URLs remain readable and ambiguous prefixes fail explicitly. Neither importing
the feed nor publishing notes modifies the separately pinned combat model.

The published October 16 feed has 466 complete talents and 1,826 spellbook entries for build 70425
with no validation issues. It retains its attributed beta-source provenance, not independent
client-verification status.

### Current client extraction

`pnpm extract:forever:mechanics` uses the installed client and reviewed WoWDBDefs commit
`996e53f029c0213b223aecb94d754f6b4b9efb49`. The .NET boundary captures 58 item, Trait, curve and spell
tables plus CombatRatings into an immutable snapshot, with current build/hotfix hashes and encrypted
row counts. A patch or hotfix change during extraction prevents publication. It does not alter the
AH catalog or attempt to decrypt unavailable records.

The build-70425 extraction normalizes 12,400 equippable records; 12,328 have resolved base fields.
It contains 536 sets, 1,477 threshold effects and 469 active class talent records. Seven talent
positions are off-grid and 147 talents contain unresolved rank text. These remain review findings,
not guessed replacements. Modern budget-based stats and actual item-effect joins are implemented;
the raw spell graph remains available for mechanical review.

The small report at `/forever/simulator/data` is separate from simulator inputs. The installed
client and planner can disagree even for the same named item. Resolving a base field or threshold
spell ID does not establish an undocumented proc, item-bonus variant or server formula. Importing
client evidence therefore does not silently overwrite the combat engine's equipment/model data.

To revalidate an existing snapshot without another CASC extraction:

```sh
pnpm --filter @wow-trader/forever-data build
pnpm forever:mechanics:import /absolute/path/to/manifest.json
```

### Development and production activation

`pnpm dev` prepares the cached simulator before starting the website. For a web-only preview with
existing data, set absolute `FOREVER_SIMULATOR_ROOT`, `FOREVER_UPDATES_ROOT` and
`FOREVER_MECHANICS_ROOT` paths, then run `pnpm --filter @wow-trader/web dev`. The engine needs a
first build, but does not need a game session or database connection to calculate a local scenario.

The production activation steps are deliberately separate from implementation:

1. Build the reviewed code and simulator; keep the tested v3 XP readers and unrelated services.
2. Transfer the immutable simulator release and its `active.json` into the shared simulator root.
   Transfer the client audit report if it should be public; raw source captures stay private.
3. Configure the web roots using `infra/pm2/web.env.example`. Keep legacy talent assets available
   and use the same `FOREVER_ASSET_RELEASES_ROOT` for both web and daily worker.
4. Create a mode-0600 `shared/forever-updates.env` from the worker example with a database writer.
   The worker reuses existing external-data tables; no new schema migration is needed.
5. Start `infra/pm2/forever-updates.config.cjs`, inspect both health files and the published pages,
   and save PM2 only after checks pass. Restart this separate worker against a new code release;
   it must not continue executing an obsolete release after deployment.

Rollback changes the simulator's active manifest or existing source publication pointer, not the
raw capture archive. Never erase locks while their owner is alive, reset the leveling crawler or
publish missing/encrypted values as zero to make a release appear complete.

### Verification and remaining model work

Browser checks executed real combat runs for all 15 individual profiles; Raid loaded without
JavaScript errors. The directory, audit and Changes layouts passed 1,440px and 390px checks.
`pnpm simulator:smoke` repeats this against `SIMULATOR_TEST_URL` using the pinned engine's Playwright
dependency; set `CHROMIUM_PATH` when using installed Chrome. The browser suite verifies runtime
integration, not parity with live combat logs.

The remaining model work is explicit entity reconciliation, reviewed talent-save migration across
tree changes, individual item/proc/set-effect coverage, controlled in-game validation and a
simulation-backed BiS optimizer. The current extraction and report support that work; they do not
claim it has all been completed. No arbitrary engine code is generated from patch-note text.
