# Per-step theoretical XP and loot coverage

Updated October 21, 2026. A concurrent `231a8c2` commit now contains earlier extraction/model work;
the newest audit-writer, targeted-refresh and acquisition/source-context fixes remain in the working
tree. This task has
not committed or deployed changes, installed anything into WoW, or published an authorized combat
dataset. The October 20 implementation extends the earlier quest-only pickup budget.

## Planning is separate from measurement certification

Owner-approved October 21 scope: finish the theoretical guide using sourced, labeled estimates;
do not require comprehensive recordings or dungeon-clear profiles first. Known compatible combat
counts once. Unknown contributions stay excluded from the known-input subtotal, not assigned zero
as a game fact or invented to fund a pickup. Real eligibility, stale-bar and XP-gap checks remain.

`campaignPlanningReadiness` evaluates the continuous, audience-relevant route through all five
level-60 endpoints. Nonblocking evidence warnings and independent chapter-baseline deficits do not
fail that planning gate. Missing endpoints, real gaps, unmet checkpoints and blocking issues still
fail. `--require-plannable` checks this local planning gate; `--require-covered` retains the older
strict coverage check. Publication authorization is reported separately and remains enforced.
Planning-ready is neither a playtest certificate nor permission to distribute private references.
The whole-route audit retains explicit source/adaptive preparation steps. Unlike the per-quest
no-assumed-grinding panel, it does not claim that known quest kills alone supply every level.

Dungeon-clear profiles are optional refinements for additional path-specific trash/boss kills.
They are not prerequisites for dungeon quest inclusion or planning readiness. A compatible sourced
payout is still needed before any particular dungeon kill contributes numeric XP. Missing extra
clear XP does not earn a flat level bonus or erase already-counted quest kills.

The model uses a historical Classic formula as a reference, not current-build calibration:
[formula](https://github.com/cmangos/mangos-classic/blob/master/src/game/Tools/Formulas.h) and
[party distribution](https://github.com/cmangos/mangos-classic/blob/master/src/game/Groups/Group.cpp).
Blizzard's [October 8 notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-15/2360696/5)
confirm individual-level lower-enemy adjustments and an approximately 20% dungeon-XP increase.
That increase is relative to an earlier Forever payout, not an absolute multiplier for Classic
or the quest-reward coefficient. It is not applied again to a post-change observation.

Public observations can refine reference assumptions without being promoted to controlled samples.
For example, the [October 9 RFC report](https://us.forums.blizzard.com/en/wow/t/so-i-tested-the-exp-in-rfc-post-change/2377311)
provides player/party levels, rested context and approximate run gains, but not an exact mob
manifest or rested-exhaustion record. It is a sanity check, not a calibrated per-NPC payout.

Group Loot is the party's distribution setting, not proof that every quest item follows the same
sharing rule. The historical [Blizzard manual, page 71](https://assets.blz-contentstack.com/v3/assets/blt3452e3b114fab0cd/blt2e9295db02a222fc/6025bcbb6968b53d529edb2a/media_manual_classic_enUS.pdf#page=72)
distinguishes single-recipient collection items from items available to every eligible member.
Do not multiply every quota by five, assume independent rolls for all items, or infer stack sizes
from this setting. Item-specific unknowns remain visible without blocking an otherwise funded plan.

Run the planning check offline, preserving prior audits:

```sh
pnpm --filter @wow-trader/leveling build
node scripts/audit-leveling-quest-xp.mjs \
  --destination=artifacts/leveling/audits/2026-10-21/planning-reference \
  --rewards=artifacts/reference/questie/completion-20261019/published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --combat=artifacts/leveling/loot-preparation/combat \
  --runtime-build=70450 --require-plannable --retain-audits --gzip
```

The runtime pin above is the previous reviewed value, not automatic detection of the installed
client. No new addon package, deployment or data-publication approval is implied by this check.

## October 21 capture-completeness update

Reprocessing existing captures resolved the remaining 52 quest-quantity records without a network
request. Two of those quests mark their items as **Provided**; these are not additional collection
work after pickup. This does not assign zero XP to any earlier acquisition of a quest-starting item.

The private preparation queue now has **0 pending quest pages and 12 pending item-rate records**,
all 12 already captured. Queue totals do not include stack/sharing review gaps. Its 1,164 drop
references (1,153 sample-based plus 11 reported overrides) are labeled evidence, not observed
current-build, quest-conditioned probabilities. None has fixed items-per-drop evidence, so this
does **not** make the full loot-XP projection ready. Unknown stacks, party loot rules and route
creature choices remain explicit review work. Do not repeatedly fetch unchanged pages to resolve
facts they omit.

The normal operator queue still preserves all 897 tasks; it was not pruned or restarted. The smaller
private preparation queue describes remaining extraction gaps, not necessarily unfetched URLs.
Read its snapshot separately from the normal crawl status:

```sh
pnpm leveling:loot:status \
  --staging=/Users/dimitarjilanov/wow-trader-reference/staging --human
```

The read-only command validates the combat artifact, matching report/queue checksums and staged
record identities, including the rate-refresh queue's checksum and membership in the coverage
queue. Reprepare after new captures; status does not reprocess or mutate them.

Preparation also emits `rate-refresh-queue.json`. The October 21 targeted refresh ran all **10**
originally queued captured item pages: nine items gained numeric reported rates (15 NPC drop rows)
and one item (`266434`, Resaan's Heirloom) still has no rate or attempt count. The remaining **11**
item records have no captured NPC drop rows; some show vendor, spell-created or quest-reward
relations instead. Review those acquisition mechanics rather than assuming they require more
ordinary mob drops. They remain unresolved in the coverage queue. The refresh list is a candidate
list, not evidence that a new request will reveal the missing field.

The one remaining rate-refresh candidate was already refreshed successfully in this batch. Do not
repeat that unchanged request simply because its numeric rate is absent; review its interaction
mechanic or wait for new source evidence. The generic coverage queue is not a list of unfetched
pages and was not emptied to make the coverage status appear complete.

No broad quest expansion is needed for the currently identified guide quests: all 1,161 hand-ins
retain XP data. Stack sizes, party loot sharing and actual kill XP require in-game validation;
more quest-page fetching cannot establish them. Add newly identified dungeon quests when their real
IDs become available.

### Variable-stack calculation support

Explicit conditional stack weights now survive capture → private combat preparation → the quota
resolver → chronological XP scenarios. Both boundaries reject conflicting stack bounds and invalid
weights. The planner supports solo collection, a pooled party quota, and the last finisher among
2–5 players with independent rolls. Missing weights are never replaced by a uniform distribution.

The absorbing-state calculation includes failed drops and overshooting the final item quota.
For example, needing two items with guaranteed drops of one or two items at equal weights takes
1.5 kills on average, not `2 / 1.5`. A pooled two-player quota takes 2.875 kills; two independent
players take 1.75. These are synthetic math checks, not measured server facts.

Solo/pooled expected kills use a remaining-quota recurrence. Independent-party expectations sum
the completion-time survival curve until the uncomputed tail is bounded by `1e-8` kills. All
models remain conditional on IID drop events and the supplied evidence. Calculation is capped at
5,000,000 state/weight operations and 10,000 kills; exceeding either budget returns unresolved,
not a partial forecast. The fast fixed-stack path is unchanged. Cross-quest joint inventory and
correlated drops are still not modeled. No actual captured record yet provides these weights.

The parser also handles the saved source renderer's explicit `outof: 0` / percentage-in-`count`
encoding. Such records are reported percentages, not sample counts. The `-1` placeholder stays
unknown. A missing/null denominator in an older capture cannot prove that the original value was
zero, so preparation does not guess this encoding from old nullable fields.

### Single-success collection

A missing exact stack size no longer blocks a collection quota that one successful drop always
finishes. This includes a solo one-item objective, a one-item objective for each independently
looting player, or a verified minimum stack large enough to cover the whole relevant quota.
The model calculates the geometric completion distribution without adding a fictitious stack
fact. For independent players it models the last finisher; it does not pay only the first player.

A pooled five-player one-item objective still requires five items in total, so unknown stack
sizes remain unresolved. Unknown sharing in a party, missing probabilities and multi-item quotas
without sufficient stack evidence also remain unresolved. Sample item-count ratios are not treated
as drop-event probabilities unless single-item drops are established, even for a one-item quest.
Reported rates remain reference evidence, not measured current-build, quest-conditioned chances.

The refreshed nine item pages supply 15 reported NPC rows, of which 11 match the current on-route
reference creatures and enter the private dataset. Their stack sizes are still unknown. The tenth
item, Resaan's Heirloom, has no numeric rate; the archived step instead says to click Resaan and
uses a gossip directive. Its capture also lists `Retrieve Heirloom` as a creating spell. This is
an acquisition-mechanics review, not a reason to invent a 100% mob drop or repeatedly fetch an
unchanged rate page. No new requests or in-game observations were made during this reprocessing.

### Explicit purchases and shared source context

Preparation retains positive `sold-by` evidence as optional `vendorEvidence`: vendor IDs, source
URL, source checksum and capture time. The combat binder requires an exact named purchase in the
objective's local source segment and a matching targeted vendor. Vendor availability alone is not
enough. Conditional, negative or alternative instructions, mismatched names and unsupported markup
remain unresolved. A purchase adds zero kill XP without removing another objective's real kills.

This fixes Rhapsody Malt (item 2894), quest 384 objective 2, without new page requests. All four
archived purchase bindings agree; the real route check passes across all 11 Dwarf/Gnome class
editions, including the Dwarf Hunter source `chapter-123-6-11-dun-morogh-hunter:source-step-0041`.
The generic item-coverage queue remains conservative and still includes acquisition reviews;
Rhapsody Malt is not in the 10-item NPC-rate refresh queue.

`campaign-source-profile.ts` now supplies the same context to route construction and combat
binding: class, five-player reference party, unknown tank/healer and reference source rate 1×.
That rate selects source-guide branches; it is not a server XP multiplier. Previously combat used
an unknown rate and recruiting solo context, which skipped an already-selected Hunter chapter.
An explicitly selected, version-matched step may also reuse another race's default source branch;
faction, class, rate and per-step character conditions remain enforced. The existing handling of
original `.group`/`.solo` directives is unchanged. An explicit stale/missing source
does not borrow another source version's objective proof. No actual party state is changed.

Regenerate private data, then run the read-only real-archive regression:

```sh
pnpm leveling:loot:purchase:check
```

The checker validates source/combat checksums and identities before building the affected editions.
It never fetches pages, publishes data, changes progress or sends game input.

### Pickpockets and guaranteed hand-in items

The local source binder now distinguishes two more acquisition methods from ordinary creature
drops. Both require a known one-item quota and agreement with the objective's local instructions:

- Quest 2242 / item 7737: the archived Rogue step explicitly says to cast Pick Pocket on Sethir
  the Ancient and avoid fighting him. The mapped NPC name must agree. A successful prescribed
  pickpocket requires no kill XP; failures and incidental fights are not modeled as guaranteed XP.
- Quest 3909 / item 11243: all three archived Feralas variants hand in quest 4041 before the
  collection marker. The item capture links to that reward quest, whose existing capture explicitly
  says `You will receive: Videre Elixir`. Both capture provenances are retained. The item adds no
  further drop kills; quest 4041's own prerequisites and acquisition work remain separate.

`rewardEvidence` is optional, validated metadata containing the item-source provenance and a
deduplicated list of corroborating quest-source provenances. A `reward-from` relation alone is
insufficient: choices, differently named rewards, missing corroboration, later/unrelated hand-ins,
self-reward cycles and unknown/multiple-item quotas remain unresolved. A contradictory current
capture removes stale reward attribution. Existing private captures are read, never rewritten.

Neither method overrides a verified numeric kill quota or conflicting provider kill instructions.
The binder refuses `.use`/`.cast` item-transformation contexts; pickpocket attribution additionally
requires explicit combat avoidance and holds kill-bearing instructions. Shared objective-context
boundaries prevent borrowing proof across neighboring objectives. No IDs are special-cased in the
runtime resolver. The real-archive checker above now covers these four source steps plus selected
Night Elf/Rogue and Human/Warrior routes, alongside its eleven purchase editions.

The generic 12-item coverage queue remains conservative: it has no selected source-step context.
These source-bound fixes do not imply that every acquisition variant is resolved. The other eight
non-NPC-drop records still require review, including live-target spells, photos and corpse-use
items. In particular, the source explicitly requires kills for the ooze jars, Aquementas and
Bael'Gar; do not erase those fights merely because a use-item spell creates the quest item.
Corpse reuse, spell effects and party ownership cannot be established by repeatedly fetching the
same ordinary drop-rate page.

## Contract

The selected campaign quest step has a folded **Theoretical XP after this step** panel. It shows
each participating player's chronological pickup, objective and hand-in entries: before/after level
and XP, separate quest/kill XP, and any remaining known-XP shortfall. Open the panel to calculate;
closed panels do not run the additional three scenario forecasts.

Choose a hypothetical level-1 route start or fresh saved actual XP from the current selected step.
The hypothetical copy clears reported quest rewards/objective confirmations, not actual storage.
The actual-anchored ledger excludes already rewarded quests and unknown remaining kills on quests
already in progress. A stale/missing bar must be refreshed rather than reconstructed as actual XP.
No scenario invents grinding XP to fund a pickup. An unresolved reward or a genuine unmet pickup
requirement stops projection; it is not replaced by a guessed future level.

Same-visit hand-ins precede pickups. If a real gate remains between them, the compiler splits the
compound source step, preserving the original pickup ID and migrating old gate bookmarks.
Modeled-funded pickup prompts can be omitted; actual prerequisite and progress checks still run.
Automatic omission uses the default hypothetical route, not proof that the player completed it.
An edited planning multiplier recalculates the visible forecast, not actual eligibility.

### Verified Northshire example

The private local Human/Warrior route includes 10 Kobold Vermin, 10 Kobold Workers and 12 Kobold
Laborers. An unrelated use-item directive no longer erases the vermin quota. Quest 21's 450 XP
hand-in occurs before accepting quest 96627 in the same visit.

At the explicitly assumed 1× outdoor kill rate, resolved kills/rewards project **level 4 + 1,681 XP**
before 96627; the level-4 pickup prompt is omitted. With outdoor kill XP deliberately set to zero,
quest rewards alone leave **20 XP**, not the old 470-XP gap. Missing drop kills remain excluded
from this known-input subtotal. Neither result is an observed Forever XP bar.

## Combat and loot assumptions

- Settings persist an outdoor kill XP multiplier, default 1×, separately from quest XP. It affects
  historical outdoor estimates, never observed final payouts or separately configured dungeon tuning.
- The reference group model uses each subject player's own level for its solo baseline and
  level-weighted member shares, flooring per kill, with no assumed party bonus. The subject levels
  up after each kill; other member levels stay at the objective's starting snapshot. Gray/boosting
  ambiguity remains unresolved. Exact Forever tuning and synchronous group level-ups need live
  calibration. [Primary historical references: formulas](https://github.com/cmangos/mangos-classic/blob/master/src/game/Tools/Formulas.h)
  and [group distribution](https://github.com/cmangos/mangos-classic/blob/master/src/game/Groups/Group.cpp).
  The per-player adjustment follows Blizzard's October 8 correction in the
  [Forever development notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-15/2360696/1).
  That note does not establish exact current multipliers, party bonuses or boost thresholds.
- For fixed items-per-drop and probability `p`, solo collection models a negative-binomial
  completion time; its expected kills are `ceil(quantity / stack) / p`. Pooled party loot uses the
  party's total item requirement. Independent rolls use the distribution of the last member to
  finish, not the solo count and not automatically five times that count.
  Explicit variable-stack weights use the bounded absorbing-state model described above.
- Fast/expected/slow are deterministic scenarios using per-objective P10, rounded-up expected,
  and P90 completion counts. They are not a guaranteed range, route-wide confidence interval, or
  a confidence interval for a sampled drop probability. Planning is bounded to 10,000 kills.
- Shared active objectives reuse compatible same-NPC kill batches. This is a deterministic overlap
  approximation, not an exact joint stochastic loot/inventory model. Correlated drops, quests
  competing for the same consumed item, inventory already held, and multiple on-route NPC mixes
  still need more evidence/modeling. Do not present their subtotal as a complete route guarantee.
- Unknown probability, quantity, items-per-drop, variable-stack distribution, objective ordering,
  or party sharing stays unresolved. A zero drop chance is not free completion. Gathering-only
  objectives do not get a fabricated mob-drop queue.
- `targetBuild` scopes the planning dataset. Page rates have `sourceBuild: null` unless separately
  established; an edition URL does not verify current-build tuning. A known mismatching source
  build is rejected. All such computed kills remain reference estimates, never calibrated payouts.

## Modules

`campaign-xp.ts` owns the existing continuous ledger; `campaign-xp-event.ts` describes its phase
entries. `campaign-theory.ts` runs the three scenarios without side effects. `quest-loot.ts` owns
the bounded distributions, `combat-loot.ts` binds evidence to objective quotas, and
`loot-coverage.ts` prepares missing-data tasks. The React panel/settings live in
`apps/web/src/components/leveling-step-projection.tsx`.

The reference parser preserves explicit `percent`, `percentOverride`, sample counts and
fixed/variable `stack` bounds on item `dropped-by` NPC relations. Bounded JSON `pctstack` preserves
conditional quantity weights without executing source code. Reported overrides take precedence.
Valid positive `count/outof` ratios are labeled `sample-ratio`; zero observations, impossible ratios
and known multi-item stacks do not establish per-kill probabilities. Missing stack evidence still
blocks kill forecasts, and sample ratios cannot fund a known multi-item drop. Quest quantities can
also be recovered from unambiguous full item-name footer counters retained in older captures,
excluding prose numbers, supply sections, rewards and conflicting claims. Unsupported markup
remains missing. Tests and capture completeness do not certify live loot tuning.

## Prepared local data and the next crawl

The pinned QuestieDB export was regenerated in a temporary checkout. All three raw export hashes
match the previous provider manifest. No installed addon was changed. Its item tuples contain
IDs and display text, **not quantities**; the importer now retains IDs with nullable quantities.
The preparation script recovered 108 consistent quantities from explicit archived guide counters.

Current local inputs/outputs (ignored artifacts):

| Output                                            | State                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `artifacts/leveling/combat-with-loot-identities`  | Re-imported private references; original combat root untouched                   |
| `artifacts/leveling/loot-preparation/combat`      | Prepared private dataset; publication unchanged                                  |
| `artifacts/leveling/loot-preparation/queue.json`  | 12 item-data gaps, all captured; no pending quest pages                          |
| `artifacts/leveling/loot-preparation/report.json` | 309 route loot quests across 28 race/class editions; 1,692 manual-review entries |

631 staged captures were reused, including the corroborating reward quest. The preparation retains
1,164 labeled drop references (1,153 sample-based plus 11 reported overrides)
and zero fixed-stack facts. Review entries include sharing, stack bounds, source-creature choice
and mixed objective order; these are not 1,692 additional page requests. No transport, session,
identity or pacing settings were changed. Existing staging was read only.

The owner subsequently requested adding these tasks to the normal quest crawler. Both
`artifacts/reference/questie/leveling-evidence-unresolved.json` and
`/Users/dimitarjilanov/wow-trader-reference/queue/questie-unresolved.json` now include them:
52 tasks were already queued, so 543 were added, for 897 total (548 quests, 349 items).
All 354 previous entries were preserved. No active crawl was modified by this task.
Queue regeneration supports `--additional-queue`; retain that
flag as shown in [the queue instructions](quest-xp-import-and-probe.md#route-evidence-quest-queue).
The separate bounded refresh below is still useful for older cached captures missing loot fields.

Reprepare after new captures (offline; idempotent):

```sh
pnpm leveling:loot:prepare \
  --combat=artifacts/leveling/combat-with-loot-identities \
  --staging=/Users/dimitarjilanov/wow-trader-reference/staging \
  --destination=artifacts/leveling/loot-preparation
```

The original bounded batch used the following launcher form, without replacing the normal quest
queue. This is an operational reference, **not an instruction to repeat the completed batch**.
Any future refresh still requires owner authorization and new source/parser evidence;
preparation/status do not start it:

```sh
QUEUE_SRC=/Users/dimitarjilanov/work/test/wow-trader/artifacts/leveling/loot-preparation/rate-refresh-queue.json \
QUEUE=/Users/dimitarjilanov/wow-trader-reference/queue/leveling-loot-rate-refresh.json \
LIMIT=10 /Users/dimitarjilanov/wow-trader-reference/run-questie-crawl.sh --refresh
```

Keep the launcher's existing authorization, pacing, profile and single-crawl guards. Regenerate
the queue after each batch: missing stack/sharing semantics need review, not endless identical
requests. A successful fetch is not automatically sufficient data. Review parser errors and
`cacheErrors`, source percentages, sample counts, stack semantics and candidate creatures.

If raw HTML was retained, `--html-directory=<directory>` reparses canonical
`forever-{quest|item}-{id}.html` files locally before deciding what needs fetching. Without an old
staged record, cached HTML also needs an explicit `--permission-ref`. Original captures are not
overwritten. `--sharing-overrides=<json>` accepts reviewed `{questId,itemId,sharing}` entries;
`sharing` is `independent`, `pooled` or `unknown`. No sharing mode is inferred from quest shareability.

## Remaining delivery boundaries

For measured certification, confirm Forever's outdoor kill multiplier with controlled unrested observations; collect missing
drop/count evidence and review party sharing/route creature choices. Variable stacks are supported
only with explicit weights; the current captures still lack that evidence. Joint inventory models
are not implemented. Production still rejects `private-reference` datasets:
source authorization/provenance review is required before provisioning a public combat artifact.
These are precision/publication boundaries, not prerequisites for using the estimated planning
guide or its funded continuous-route check. The full route is not playtest-certified, and live
production has not acquired combat data from this task.
No new addon archive was built or installed. A later approved commit/deploy is separate work.

## Verification

### October 21 planning gate and optional measurement inputs

Planning policy: `continuous-planning-20261021-v1`; calculator and addon compiler remain v18.
The full real archive passed `--require-plannable`: **33 editions, 132 scenarios and 6,000 chapter
checks**, with all 132 scenarios ready with estimates. Continuous audience-relevant forecasts have
zero blockers, missing starts or shortfalls and retain all 1,161 published hand-in reward IDs.
All five modeled finish endpoints are level 60 in every scenario. No quest reward or kill XP was
invented to change those results; the new gate distinguishes existing planning feasibility from
the stricter evidence check.

Immutable report:
`artifacts/leveling/audits/2026-10-21/planning-reference/campaign-xp-audit-929e6fc027362feb.json.gz`.
Semantic SHA-256: `929e6fc027362feb772880ac96808c0d378103052f386c9f0bce383e78eec14e`;
stored SHA-256: `43fabb9b9dd82df0f77e568fee49b04e527ecb3e408579568fdfcd8e07ab2d0f`.
Both were independently stream-verified: 1,488,600,869 JSON bytes plus a newline, stored in
139,024,672 bytes. The unchanged evidence backlog remains
`campaign-evidence-backlog-a00fb1eb93832117.json` with 3 independent-diagnostic checkpoint tasks,
601 validation tasks and 66 measurement tasks. Its checksum is
`a00fb1eb93832117d8231317e110069079dab0bb30b2a86b9a1b3acbe4ded6ae`.

`planningGatePassed` is true, while `publicationEvidencePassed` and `coverageGatePassed` remain
false. Private references were not relabeled, missing facts were not cleared, and independent
chapter diagnostics remain unchanged (156 blocked, 5,844 incomplete). Those diagnostic statuses
do not mean the funded continuous route is blocked. Comprehensive observations and clear profiles
are optional refinements for this planning finish line, not mandatory user data collection.

The browser labels historical combat estimates and excluded inputs without demanding measurements.
The chapter gap label is a known-input subtotal, not an unconditional instruction to grind.
Real access, pickup, current-bar and known-gap checks remain active. Code-only scope is unchanged:
no addon ZIP, installation, commit, push, deployment or public data provisioning.

Verification passed: **475 leveling tests across 39 files**, including 18 planning-readiness
regressions; **867 web tests across 114 files** on the clean two-worker rerun; package/web
typechecks, scoped lint/format checks, and the optimized production web build. The first broader
web run had one unrelated 5-second simulator-test timeout while other heavy checks were active;
the full clean rerun passed without changing timeouts, expectations or simulator code. The final
copy edits also passed all ten focused presentation tests and a fresh production build. The
isolated build used `.next-planning-check-20261021-v1`, leaving the existing development server
alone. That initial checkpoint used server-rendered component tests; the subsequent real-browser
receipt follows below. No in-game check or certification is claimed.

### Code-only browser completion review (October 21)

The approved finish line is the supported Alliance planning implementation, not an installed or
published, playtest-certified addon. The final real-browser check passed at **1440 and 390 px**
against an isolated loopback development preview, using temporary Playwright 1.64.1 tooling without
adding project dependencies. It verifies:

- Level 4 + 1,681 XP before quest 96627 and no redundant level-4 checkpoint in the default model.
- The default chapter is not labeled `Progression blocked`; deliberately disabling outdoor kill XP
  still exposes the real 20-XP known-input gap instead of silently clearing it.
- Saved character records remain unchanged through projections, assumption-panel toggles and
  planning-setting changes; the outdoor multiplier persists after reload.
- Missing actual bars request fresh actual data, never treat a theoretical bar as reported XP.
- Optional measurement/clear-profile guidance remains accessible in a folded native disclosure.
- XP results precede the detailed assumptions; quest labels and XP bars occupy separate lines.
- No horizontal overflow or browser page errors at either tested width.

`scripts/check-leveling-theoretical-progress.mjs` now checks these conditions, including the
rendered label/bar geometry. The focused presentation suite passes all ten tests. Screenshots
were visually inspected; the final temporary receipt directory is
`/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-theoretical-xp-VeZmnE`.
The temporary tool/preview files were removed after verification (about 750 MB); they can be
regenerated, and the screenshots/reports were retained. The test script is the reproducible source
of this receipt. The pre-existing development server on port 3017 was left alone.

After the final layout change, the optimized production build, web typecheck, scoped lint/format
checks, ten presentation tests, 50 planning/theory/loot tests and six addon-input tests passed.
No arithmetic changed in this presentation follow-up, so the preceding full 33-edition planning
audit and 475-test leveling receipt still describe the same model; the full web-suite receipt
above remains scoped to that earlier run rather than relabeled as a new run.

The final addon parity check also passed all **28 exact editions in memory**, using compiler and
calculator v18 and the same prepared combat SHA `a4cfed4ce58fdcab140d3294e1497718ea93329108bbc5095ffc4e6965e8b1ff`.
Human/Warrior retains 852 hand-ins / 2,457 actions with no redundant 96627 checkpoint. No ZIP was
built, installed or published; the historical runtime/parser values were used only for this
in-memory review, not asserted as detection of the currently installed game.

Code-only acceptance audit:

| Required outcome                                                  | Verification                                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Identified route rewards are available                            | All 1,161 hand-ins have published XP in the checksummed full-route audit; no historical hand-in fallback                     |
| Chronological theoretical progression and safe pickup prompts     | Pure ledger/funding tests, 33-edition / 132-scenario planning audit and the real 96627 browser regression                    |
| Known combat counted once, unknown inputs explicit                | Combat/loot regressions, unchanged evidence backlog, preserved source/sharing and measured/publication guards                |
| Planning does not require exhaustive recordings or clear profiles | Dedicated planning gate passes all 132 scenarios while strict coverage and publication checks remain false                   |
| Usable settings, persistence and responsive presentation          | Desktop/mobile browser checks, unchanged saved members, persisted planning multiplier and accessible folded assumptions      |
| Browser/addon calculation alignment without packaging             | All 28 exact addon editions compile from the compatible combat input; immutable package identity includes its reference hash |

This completes the approved code-only planning work. Fresh game measurements, disputed source
validation, full Horde campaign execution, an installed addon review and distribution remain
separate work; none is claimed by the Alliance planning receipt. Commit/push, deployment, new ZIPs
and public provisioning remain deferred under the owner's instruction.

### October 21 addon combat-reference alignment (compiler v18)

Current identities: calculator `checkpoint-ledger-20261021-v18` and addon compiler
`campaign-addon-20261021-v18`. The addon packager now accepts an explicit `--combat` directory and
attaches its validated data before pickup-gate and funding compilation, matching the browser's
ordering. Both manifest and dataset must match the archive build; bounded files, schema and
checksum checks fail closed. Omitting the option preserves quest-only behavior. The input hash,
build and publication state bind the package identity; loading private data does not authorize
publication or imply actual player XP.

Both in-memory `--verify-all` runs passed all 28 exact race/class editions, with unchanged hand-in
counts between modes. With combat, editions contain 2,120–2,480 actions and 725–864 distinct
hand-ins. Human/Warrior retains 852 hand-ins and omits the redundant quest-96627 checkpoint
(2,457 actions, versus 2,458 without combat). A portable regression also checks the emitted Lua:
the funded checkpoint disappears, its actual quest pickup remains, and the addon still disclaims
visibility into all five players' XP bars.

Passed: 457 leveling tests across 38 files, six addon-input validation tests, 127 focused leveling
web tests across 24 files, package/web typechecks, scoped lint, package build and production web
build. No browser or Lua-runtime check was rerun for this integration-only change. The preceding
865-test full web result and full XP-matrix receipt below predate this compiler identity; they
were not relabeled as new runs. The calculator and prepared reference data are unchanged.

WoW Forever is the confirmed product target. At the owner's request this remains code-only:
no replacement ZIP, installation, publication, commit or deployment. The existing review.3 ZIP
uses compiler v9 and cannot certify this revision. Actual client/parser versions still require
confirmation before an approved future package; see
[recording readiness](forever-leveling-addon-review.md#current-recording-readiness). Loot/sharing,
calibration and real-observation gaps remain; successful compilation is not route certification.

### October 21 refreshed rates and single-success calculation (v18)

Calculator for this earlier full-matrix receipt: `checkpoint-ledger-20261021-v18`; addon compiler identity:
`campaign-addon-20261021-v17`. No addon archive was built or installed. The 456 leveling tests pass,
including the one-item solo/independent distributions, pooled quota holds, sample-ratio guards,
known lower stack bounds and chronological XP without saved-progress mutations. Package/web
typechecks, scoped lint/format checks, the status integration test, package build and optimized
production web build passed. The eleven purchase editions, four source bindings and two selected
acquisition routes passed with the new dataset.

The full web suite passed **865 tests across 114 files in 148.40 seconds** using two workers after
the audit/build jobs finished. The earlier concurrent run had two 5-second simulator timeouts;
that file's 22 tests also passed in isolation. No expectations or timeout limits were changed.
The v17 browser receipt below is historical; this library/data revision did not rerun that browser
check or create any in-game observations.

Reprocessing read 631 existing captures with zero requests, cache errors or staging writes. The
nine refreshed items provide 15 numeric NPC relations; 11 match on-route reference creatures and
are imported with their exact percentages, source checksums and capture times. These eleven
provenances were checked independently against schema-valid staged records. The prepared combat
SHA-256 is `a4cfed4ce58fdcab140d3294e1497718ea93329108bbc5095ffc4e6965e8b1ff`. Both the normal
897-task queue and publication status remain unchanged.

Latest complete XP matrix, recorded before the compiler-v18 integration above:
`artifacts/leveling/audits/2026-10-21/loot-reference/campaign-xp-audit-14a504f9cbfbcf80.json.gz`.
Semantic SHA-256: `14a504f9cbfbcf80cb0f9ac04f51d90ed76e9eec1a66abc9a3baef3e57068cbf`;
stored SHA-256: `19dcb91d9dd854f8c1ee608a500ce876b2ece79951af42aa8abf9d2895377e4c`.
It contains 1,488,454,972 JSON bytes plus its newline in 138,976,825 stored bytes; both hashes
were independently stream-verified. The matching backlog is
`campaign-evidence-backlog-a00fb1eb93832117.json`, semantic SHA-256
`a00fb1eb93832117d8231317e110069079dab0bb30b2a86b9a1b3acbe4ded6ae`.

The 33 editions / 132 scenarios / 6,000 chapter checks retain all 1,161 published hand-in XP facts,
without unresolved rewards or historical fallback. Continuous audience-relevant checks have zero
blocked members or shortfalls, but remain incomplete; independent chapter diagnostics still have
156 blocked checks. The backlog remains 3 checkpoint, 601 validation and 66 measurement tasks.
New reported rates do not resolve missing party sharing or current-build calibration. All 55
unique quest-page candidates remain queued and captured. Certification is still **false**.

### October 21 non-kill acquisition correction (v17)

Historical calculator: `checkpoint-ledger-20261021-v17`; addon compiler identity:
`campaign-addon-20261021-v16`. No addon archive was built or installed. Passed: 450 leveling tests
across 38 files, 127 leveling web tests across 24 files, package/web typechecks, scoped lint, the
status integration test, package build and optimized production web build. The real archive's
eleven purchase editions, four new source bindings and two selected acquisition routes passed.
The initial broader web-suite invocation also ran unrelated simulator tests: 843 passed and 22
failed across ten files, with simulator-test timeouts observed. A subsequent full rerun with two
workers passed **865 tests across all 114 files in 136.37 seconds**, including the previously
timing-out simulator tests. No test expectations, timeout limits or simulator code were changed.
This verifies a lower-concurrency run, not that the default high-concurrency run is reliable under
heavy load. Repeat the verified invocation with:

```sh
pnpm --filter @wow-trader/web exec vitest run src --maxWorkers=2
```

The development-only browser regression passed again at 1440 and 390 px: level 4 + 1,681 XP before
quest 96627, a 20-XP gap with outdoor kill XP disabled, unchanged saved member records and no browser
errors or overflow. The temporary preview was stopped. An initial production-preview attempt did
not load this projection because production correctly withholds `private-reference` data; that
guard was left intact. No private data was authorized or exposed by changing its publication flag.

Prepared combat SHA-256: `61e0a1d7eead34b7e773069867452321cad197c71312cb3f56f8a07b1ab8a0b7`.
The source archive and normal 897-task operator queue are unchanged. Preparation reused 631
captures with zero requests, zero cache errors and no staging writes. Missing stack/sharing facts
and current-build observations remain unresolved.

Its full matrix:
`artifacts/leveling/audits/2026-10-21/loot-reference/campaign-xp-audit-7bc80556732cad8d.json.gz`.
Semantic SHA-256: `7bc80556732cad8dfda27ff7690a45ce7ea56b728e32ab40c23b8cb4a85fa8f9`;
stored SHA-256: `535e63e11a835dd5f3a09b4f1dbd4bd39ee64a0477c6243b509c6e2167ace8e2`.
It preserves 1,474,711,580 JSON bytes plus its final newline in 137,486,716 stored bytes.
Both hashes were independently stream-verified after writing.

The 33 editions / 132 scenarios / 6,000 chapter checks retain all 1,161 published hand-in XP facts
with no unresolved rewards or historical fallback. Continuous audience-relevant checks still have
zero blocked members or shortfalls, but remain incomplete; independent chapter diagnostics retain
156 blocked checks. Backlog `campaign-evidence-backlog-3d20a22e0d9d8ce1.json` (semantic SHA-256
`3d20a22e0d9d8ce175b05cc4ccda37e84145d7080932752fbd9521800f841156`) contains 3 checkpoint,
601 validation and 66 measurement tasks: two fewer validation tasks than v16. The 57 quest-page
issue entries represent **55 unique quest IDs**, all queued and schema-valid in staging, with none
unfetched. The overall certification gate remains **false**. Historical v16/v15 receipts follow.

### October 21 purchase/source-context correction (v16)

Historical calculator: `checkpoint-ledger-20261021-v16`; addon compiler identity:
`campaign-addon-20261021-v15`. No addon archive was built or installed. Passed: 421 leveling tests,
127 leveling web tests, package/web typechecks, leveling lint, package build and optimized web build.
The real-archive purchase checker passed all 11 affected editions. The Northshire browser regression
passed again at 1440 and 390 px: 1,681 XP above level 4 before quest 96627, the 20-XP zero-kill-rate
fallback, unchanged actual member records and no browser errors/overflow. The preview was stopped.

Prepared combat SHA-256: `3dd3917478e48efe2b7ef88e5f8957099dc777fe4aaec89c34a162eec66c63a7`.
Its full matrix:
`artifacts/leveling/audits/2026-10-21/loot-reference/campaign-xp-audit-f96132acad19527a.json.gz`,
semantic SHA-256 `f96132acad19527ab4d029bcb07e059d6069e0f4b47599fa699bdb9d2c03d6f6`,
stored SHA-256 `04f9f93a3a38ebb306894d1d5f3949fe3ebcd3702f5fe8ffdefa21bd9a6a9e25`.
Both checksums were independently stream-verified, including all 1,475,121,857 decompressed bytes
(JSON plus its final newline); storage is 137,528,236 bytes. Older receipts below remain historical.

The 33 editions / 132 scenarios / 6,000 chapter checks still have all 1,161 hand-in XP facts and no
historical fallback. Continuous audience-relevant checks have zero blocked members or shortfalls,
but remain incomplete. Independent chapter diagnostics still have 156 blocked checks. The new
backlog `campaign-evidence-backlog-d5944f1f1de45151.json` (semantic SHA-256
`d5944f1f1de4515165fb86655b45bfc97392737754987f3a8149024a97e1b0c4`) has 3 checkpoint,
603 validation and 66 measurement tasks: 29 fewer validation and one fewer measurement task without
inventing observations. The 57 quest-page issue entries represent 55 unique quests already queued
and schema-valid in staging;
no additional missing quest pages were found. The overall certification gate remains **false**.

### October 21 variable-stack and audit-storage extension

Passed: 403 leveling tests, 164 reference-data tests, 127 leveling web tests, the status CLI
integration test and both audit-storage tests. Typechecks, package builds, scoped lint and the
optimized production web build passed. End-to-end pure logic verifies variable-stack fast/expected/
slow XP, evidence-conflict handling and unchanged actual progress. The earlier browser receipt
below predates this extension; it was not rerun for these library/CLI-only changes.

The full matrix exposed a real audit serialization failure: one giant `JSON.stringify(report)`
exceeded Node's single-string limit. The writer now streams top-level matrix entries, preserving
the complete canonical JSON, detailed per-step ledgers and semantic SHA-256. `--gzip` optionally
compresses the stored artifact; `fileSha256` authenticates the actual file bytes separately.
Immutable output collisions fail without overwriting evidence, and failed writes clean only their
own temporary file. A regression stores and stream-verifies a complete >512 MB logical matrix
without materializing the whole JSON string. No heap increase or summary-only substitution is used.

The diagnostic run uses `--retain-audits`, which skips the audit command's cleanup hook; default
uncompressed audit retention is unchanged. Compressed diagnostic files are explicitly retained,
not automatically pruned by the existing plain-JSON retention policy. The 2 GB logical report
budget remains a hard failure, never silent truncation.

```sh
node scripts/audit-leveling-quest-xp.mjs \
  --destination=artifacts/leveling/audits/2026-10-21/loot-reference \
  --rewards=artifacts/reference/questie/completion-20261019/published \
  --combat=artifacts/leveling/loot-preparation/combat --retain-audits --gzip
```

Use `pnpm leveling:xp:audit:test` to verify the writer. Gzip output preserves the existing logical
`campaign-xp-audit.v8` schema and can be inspected with `gzip -dc <report.json.gz> | jq ...`.
The separate evidence-backlog JSON remains uncompressed for existing queue/review consumers.

The complete rerun is
`artifacts/leveling/audits/2026-10-21/loot-reference/campaign-xp-audit-8ef5ee6fa9d6b284.json.gz`:
semantic SHA-256 `8ef5ee6fa9d6b284ea9421546433ed0812d317efe829d4e447f59d42bd170b0d`,
stored-file SHA-256 `fe210c2252c0e0febbb0ac7e3b7c112d4fb4b9ea4d6d58dc55959222b855f95a`.
It preserves 1,470,713,396 logical JSON bytes in 135,989,182 stored bytes. The new format avoids
the single-string failure, not the calculation itself or its evidence requirements.

Results: 33 editions, 132 scenarios and 6,000 chapter checks; all 1,161 unique hand-in IDs have
published Forever XP, with zero unresolved hand-in rewards or historical fallback. The continuous
audience-relevant ledgers have zero blocked members or shortfalls but remain incomplete. Independent
chapter-baseline diagnostics have 156 blocked and 5,844 incomplete checks. Their three checkpoint
tasks concern quests 1641, 6182 and 92432, not missing quest rewards; these diagnostics do not prove
the full continuous route is blocked or justify removing actual eligibility checks.

The backlog is `campaign-evidence-backlog-c81b05898b853f26.json` in the same directory, semantic
SHA-256 `c81b05898b853f26c8dfa57d63af4de386bb25c6fd90cd565f9f18daa349595c`: 3 checkpoint
tasks, 632 validation tasks and 67 measurement tasks. The source combat snapshot is still private,
with unknown stack evidence and uncalibrated contexts, so the overall coverage gate is **false**.
Both the compressed-file checksum and the complete decompressed semantic checksum were independently
stream-verified after writing. All 57 quest-page issue entries in this backlog passed staged-record
identity/schema validation and are already in the normal crawler queue: zero unqueued candidates,
zero unfetched quest pages. Unverified mechanics are not evidence that another quest fetch is needed.

### October 21 extraction update

Passed: 392 leveling tests, 163 reference-data tests, all 127 leveling web tests and the read-only
status CLI integration test. Leveling/reference typecheck, lint and package builds passed; script
lint, web typecheck and the optimized production web build passed. The real-data browser check
passed at 1440 and 390 px, including both Northshire XP results, no actual-member mutations and
no browser errors/overflow. The temporary local preview was stopped.

The broad web suite is **not green**: its two-worker rerun passed 852 tests but hit the existing
5,000 ms timeout in 13 simulator tests across `forever-simulator-profile-model-updates-v3.test.ts`
and `forever-simulator-fresh-demonology.test.ts`. No simulator code or test limits were changed.
This receipt does not claim a passing full-web check or a deployed release.

### October 20 implementation receipt

Focused distributions, counter import, quota recovery, overlap, saved actual XP, phase ordering,
genuine shortfalls and cache preparation have unit coverage. Local-only browser regression:

```sh
LEVELING_TEST_HELPER=http://127.0.0.1:3317 \
node scripts/check-leveling-theoretical-progress.mjs \
  --playwright-package=/absolute/path/to/installed/@playwright/test/package.json
```

It uses isolated browser storage and blocks non-GET/HEAD requests, checks old 96627 bookmarks,
per-step XP, multiplier persistence, missing actual bars, unchanged member data, browser errors
and desktop/mobile overflow. Start the preview with the prepared `LEVELING_COMBAT_ROOT` and the
published quest rewards; a production-mode preview correctly refuses private reference data.

Executed checks: 381 leveling tests, 154 reference-data tests and the full 736-test web suite
passed. Leveling/reference typecheck, lint and package builds passed; touched web/script lint,
web typecheck and the optimized production web build passed. The final focused web rerun passed
14 tests. The real-data browser check passed at 1440 and 390 px, with unchanged actual member
records and no browser errors/overflow. Preparation was repeated with identical output checksums
and no network requests. The temporary local preview was stopped after verification.
