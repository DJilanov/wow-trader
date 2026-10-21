# Per-step theoretical XP and loot coverage

Updated October 21, 2026. The extraction/status changes described below are local and uncommitted;
this task has not deployed them, installed anything into WoW, or published an authorized combat
dataset. The October 20 implementation extends the earlier quest-only pickup budget.

## October 21 capture-completeness update

Reprocessing existing captures resolved the remaining 52 quest-quantity records without a network
request. Two of those quests mark their items as **Provided**; these are not additional collection
work after pickup. This does not assign zero XP to any earlier acquisition of a quest-starting item.

The private preparation queue now has **0 pending quest pages and 21 pending item-rate records**,
all 21 already captured. Queue totals do not include stack/sharing review gaps. Its 1,153 drop
references are labeled sample-based ratios, not observed current-build,
quest-conditioned probabilities. None has fixed items-per-drop evidence, so this does **not** make
the full loot-XP projection ready. Unknown stacks, party loot rules and route creature choices
remain explicit review work. Do not repeatedly fetch unchanged pages to resolve facts they omit.

The normal operator queue still preserves all 897 tasks; it was not pruned or restarted. The smaller
private preparation queue describes remaining extraction gaps, not necessarily unfetched URLs.
Read its snapshot separately from the normal crawl status:

```sh
pnpm leveling:loot:status \
  --staging=/Users/dimitarjilanov/wow-trader-reference/staging --human
```

The read-only command validates the combat artifact, matching report/queue checksums and staged
record identities. Reprepare after new captures; status does not reprocess or mutate them.

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
| `artifacts/leveling/loot-preparation/queue.json`  | 21 item-data gaps, all captured; no pending quest pages                          |
| `artifacts/leveling/loot-preparation/report.json` | 309 route loot quests across 28 race/class editions; 1,681 manual-review entries |

630 staged captures were reused. The preparation retains 1,153 labeled sampled drop references
and zero fixed-stack facts. Review entries include sharing, stack bounds, source-creature choice
and mixed objective order; these are not 1,681 additional page requests. No transport, session,
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

To use the existing operator launcher for a bounded batch **when ready**, without replacing its
normal quest queue, give this queue its own destination and explicitly refresh old cached pages:

```sh
QUEUE_SRC=/Users/dimitarjilanov/work/test/wow-trader/artifacts/leveling/loot-preparation/queue.json \
QUEUE=/Users/dimitarjilanov/wow-trader-reference/queue/leveling-loot.json \
LIMIT=20 /Users/dimitarjilanov/wow-trader-reference/run-questie-crawl.sh --refresh
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

Confirm Forever's outdoor kill multiplier with controlled unrested observations; collect missing
drop/count evidence and review party sharing/route creature choices. Variable stacks are supported
only with explicit weights; the current captures still lack that evidence. Joint inventory models
are not implemented. Production still rejects `private-reference` datasets:
source authorization/provenance review is required before provisioning a public combat artifact.
The full route is not certified, and live production has not acquired combat data from this task.
No new addon archive was built or installed. A later approved commit/deploy is separate work.

## Verification

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
