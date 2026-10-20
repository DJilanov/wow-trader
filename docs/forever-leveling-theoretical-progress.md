# Per-step theoretical XP and loot coverage

October 20, 2026. Implemented locally; not committed, deployed, installed into WoW, or published
as an authorized combat dataset by this task. This extends the earlier quest-only pickup budget.

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
- The historical group model uses the highest eligible starting party level's solo baseline and
  level-weighted member shares, flooring per kill, with no assumed party bonus. The subject levels
  up after each kill; other member levels stay at the objective's starting snapshot. Gray/boosting
  ambiguity remains unresolved. Exact Forever tuning and synchronous group level-ups need live
  calibration. [Primary historical references: formulas](https://github.com/cmangos/mangos-classic/blob/master/src/game/Tools/Formulas.h)
  and [group distribution](https://github.com/cmangos/mangos-classic/blob/master/src/game/Groups/Group.cpp).
- For fixed items-per-drop and probability `p`, solo collection models a negative-binomial
  completion time; its expected kills are `ceil(quantity / stack) / p`. Pooled party loot uses the
  party's total item requirement. Independent rolls use the distribution of the last member to
  finish, not the solo count and not automatically five times that count.
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

The reference parser preserves explicit numeric `percent`, `count`, `outof` and fixed/variable
`stack` bounds on item `dropped-by` NPC relations. `count/outof` alone does not become probability:
counts can describe item stacks. Quest item quantities require unambiguous item links/counters
in objective or Progress-table rows, excluding rewards, unrelated editions and sidebar content.
Unsupported markup remains missing. Fresh real-page validation is still needed before claiming
complete loot coverage; tests do not substitute for that data.

## Prepared local data and the next crawl

The pinned QuestieDB export was regenerated in a temporary checkout. All three raw export hashes
match the previous provider manifest. No installed addon was changed. Its item tuples contain
IDs and display text, **not quantities**; the importer now retains IDs with nullable quantities.
The preparation script recovered 108 consistent quantities from explicit archived guide counters.

Current local inputs/outputs (ignored artifacts):

| Output                                            | State                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `artifacts/leveling/combat-with-loot-identities`  | Re-imported private references; original combat root untouched                     |
| `artifacts/leveling/loot-preparation/combat`      | Prepared private dataset; publication unchanged                                    |
| `artifacts/leveling/loot-preparation/queue.json`  | 595 deduplicated tasks: 246 quest quantities/identities + 349 item drop references |
| `artifacts/leveling/loot-preparation/report.json` | 309 route loot quests across 28 race/class editions; 531 manual-review entries     |

87 staged captures were reused, but none currently contains usable numeric drop facts. The
review count includes sharing, source-creature choice and mixed objective order; these are not
531 additional page requests. The crawler was not started. No transport/session/identity/pacing
settings were changed. The existing staging directory was read only.

The owner subsequently requested adding these tasks to the normal quest crawler. Both
`artifacts/reference/questie/leveling-evidence-unresolved.json` and
`/Users/dimitarjilanov/wow-trader-reference/queue/questie-unresolved.json` now include them:
52 tasks were already queued, so 543 were added, for 897 total (548 quests, 349 items).
All 354 previous entries are preserved. The existing profession crawl was left running;
no new crawl was started. Queue regeneration now supports `--additional-queue`; retain that
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
drop/count evidence and review party sharing/route creature choices. Variable-stack and joint
inventory models are not implemented. Production still rejects `private-reference` datasets:
source authorization/provenance review is required before provisioning a public combat artifact.
The full route is not certified, and live production has not acquired combat data from this task.
No new addon archive was built or installed. A later approved commit/deploy is separate work.

## Verification

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
