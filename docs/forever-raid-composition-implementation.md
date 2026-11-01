# Forever raid composition implementation

Implemented and deployed November 1, 2026.
Live: <https://kfcguild.online/tools/forever/raid-composition>.
The owner approved commit, push and deployment after local review. Exact source,
verification and rollback details are in
[the release receipt](forever-raid-composition-release-2026-11-01.md).

## Available behavior

- Complete 10/20/40-player starting compositions, nine class cards with spec and
  role counts, and two/four/eight parties of five.
- One Retribution Paladin per default composition is marked Protection for trash
  and Retribution for bosses. It remains one roster slot; the editor shows both
  phase role totals, a duty sheet entry, and an editable per-seat checkbox.
- Primary navigation uses Trader, Leveling and Encyclopedia without a Forever
  prefix; TBC remains behind the separate TBC Tools destination.
- Editable tank/healer targets and optional support requirements. Every suggestion
  must contain a Warrior. Prefer a Warrior tank for Sunder and Battle Shout;
  steady-state Sunder upkeep is described separately from initial stacking.
- Separate Paladins for Kings and the second blessing; separate Warlocks when
  both magic and armor curses are required. No automatic Rogue/Expose recruitment
  credit, melee Trueshot bonus, or double Druid crit category.
- Explicit duty sheet and missing-support feedback. Planned talent support is
  distinguished from verified active talents/uptime. Shared 3% Druid crit is a
  visible stacking assumption, not a newly verified server result.
- Deterministic constrained reference selection with preview and explicit apply.
  By default it retains the tank/healer core; locked seats are always preserved.
  Infeasible requests explain what to change rather than silently relaxing rules.
- Manual dragging, keyboard-accessible seat swapping and a separate party-mana
  arrangement action. Arrangement preserves locked seats and tank positions and
  only moves seats when planned party support coverage improves. Raid-wide aura
  placement earns no party arrangement benefit.
- Undo, reset, browser-local saving and validated anonymous share links. Links
  contain build IDs, positions, locks and requirements, with no player identities.
  A raid manager's `?size=10|20|40` overrides a differently sized saved draft.
  Invalid/stale drafts are rejected and preserved in storage until a deliberate edit.
- Per-party and raid damage/threat/healing reference totals, separate pet threat,
  maximum individual/tank TPS, and editable boss health. Defaults: 1.1M / 2.2M /
  4M health and 2,500 / 5,000 / 10,000 raw physical DPS for 10 / 20 / 40 players.
- Theoretical tank survival with main-tank selection, 50% default tank-healing
  allocation, editable healing cadence and sampled death probability with a
  95% sampling interval. Health, armor, mitigated damage and unhealed buffer are
  shown alongside the assumptions.
- Responsive KFC styling, one page scroller, route loading state, metadata,
  sitemap entry and links from the main navigation, Forever home, encyclopedia
  and ranking pages.

## Data and calculation boundaries

`forever-raid-composition-data.ts` uses the existing validated DPS, tank and healer
snapshot readers. Its catalog contains 25 damage builds, three mitigation tank
references and four group-healing foundations. These are the retained October 28
measurements. Healer HPS remains an individual reference, never converted into an
encounter healer requirement. Missing data disables numerical suggestions while
leaving the composition editor usable.

The selector searches exact support-mask/provider-count states under role and lock
constraints. It compares historical individual damage, using useful HPS only as a
secondary comparison; it does not apply invented buff multipliers or publish a
current-patch raid DPS forecast. The separate throughput panel sums the retained
benchmarks explicitly as a full-support historical estimate. That objective is
deliberately labeled reference-led.
It is not a coupled combat simulation and does not enforce a simulated 16-debuff
timeline, actual encounter survival, weapon-imbue compatibility or talent legality after
the latest hotfix. Those require the model qualification described in the product
plan. Existing simulation snapshots and optimization windows remain unchanged.

`GET /api/forever/raid-composition` returns the public catalog and versioned support
registry. It exposes no player, signup, attendance or Discord identity data.

## Shared rules and raid manager

Canonical support data:
`apps/web/src/lib/data/forever-raid-support.v1.json`.
Current revision: `forever-2026-10-30.v1`. The source capture hash is recorded in
the registry; source evidence lives in `artifacts/raid-composition-research-20261101/`.

Generate and check the sibling Discord website projection with:

```sh
node scripts/sync-raid-composition-rules.mjs --discord-root=/absolute/path/to/discord-website
node scripts/sync-raid-composition-rules.mjs --discord-root=/absolute/path/to/discord-website --check
```

The projection is `lib/raids/forever-composition-rules.ts`; edit the JSON source
rather than the generated TypeScript. It records the source SHA-256. Update the
revision when changing assumptions so old drafts cannot silently acquire new rules.

The sibling raid manager's composition helper distinguishes raid-wide effects
from party-only effects and avoids duplicate penalties for the shared crit
category. Recruitment remains a coverage heuristic, not a DPS ranking. Its editor
links 10/20/40-capacity Forever events to an anonymous size-specific planner. This
does not import private player data, mutate the event roster, publish attendance
or send Discord messages. Applying anonymous build suggestions to actual players
and their alternatives remains a separate phase.

The sibling checkout contains an uncommitted deployed baseline and concurrent
unrelated work. The scoped raid-manager release is therefore recorded as the
exact-baseline, checksum-pinned overlay in `infra/raid-composition/`. It is applied
only to an isolated copy of the current live source and built before activation.
This preserves the concurrent signup class/spec editor and other unfinished work.

## Verification and repeatable checks

The retained read-only diagnostic checks real catalog availability, role counts,
constraint feasibility and selector runtime:

```sh
pnpm --filter @wow-trader/web exec tsx scripts/check-raid-composition.ts
pnpm --filter @wow-trader/web exec vitest run src/lib/forever-raid-composition.test.ts src/components/forever-raid-composition.test.tsx
pnpm --filter @wow-trader/web exec tsc --noEmit --incremental false
```

Delivery evidence, test/build logs and browser screenshots are in
`artifacts/raid-composition-research-20261101/`. The final implementation receipt
records completed checks separately from the earlier research-only receipt.
The browser runner uses the existing sibling Playwright installation and local
Chrome; it adds no production dependency. Set `COMPOSITION_TEST_BASE_URL` to test
a different local build. No new combat optimization or production writes are
part of these checks.

Completed checks on November 1:

- 48 Helper tests passed, including 21 planner/model-rendering tests and existing
  DPS, tank, healer and validated-reader regressions.
- 35 Discord composition/native-signup/roster-confirmation tests passed.
- Helper strict TypeScript, scoped Discord TypeScript, scoped ESLint in both
  projects, new-file formatting and shared-registry projection checks passed.
- Full production Next.js webpack build passed, including its TypeScript check.
- 18 real Chrome/Playwright checks passed against that production build: all raid
  sizes, required Warrior, locks, keyboard swaps, native dragging, undo, party
  arrangement, stale comparison cancellation, preview/apply, sharing/restoration,
  explicit size precedence and layouts at 1440/390/320px. No browser exceptions or
  failed JS/CSS/image/font responses were observed.
- The actual public API returned 32 of 32 references and a matching support
  revision. Default suggestion checks evaluated 2,700/6,900/8,100 selection states
  for 10/20/40 players in under 10ms per size in the recorded diagnostic.

The native drag test uses an initial short pointer movement before scrolling to
its target; a single automation jump did not start Chrome's native drag gesture.
Both the actual native drop and accessible Move controls were then verified.
Those initial checks preceded deployment. The approved live release is recorded
in the release receipt above; it created no live raid mutation or new native
combat optimization search.

## Throughput and theoretical survival model

The owner requested totals after reviewing the initial planner. Damage includes
pet damage exactly once because the engine already includes it in owner DPS.
Player TPS excludes pets; pet TPS is displayed separately. Maximum selected tank
TPS and maximum tested TPS from a different threat-focused build are labeled
separately; the alternate build never contributes its damage to the selected
mitigation build. Healing totals sum useful HPS from independent 180-second
workloads, so they are capacity references, not guaranteed delivered healing.
Healer damage and healing threat are unavailable and are not filled with zeros.
Missing damage references prevent a kill-time calculation.

Kill time is boss health divided by summed tank/damage reference DPS. It assumes
continuous attacks on one boss and does not resimulate cooldowns/execute phases
for that shorter duration. Missing support is highlighted.

`scripts/extract-raid-composition-metrics.mjs` decodes existing measurement bytes
using an explicitly provided, SHA-verified codec. It authenticates the published
request/response, DPS, iteration count and duration before extracting TPS. It also
extracts the three mitigation tanks' incoming physical outcomes (avoided, normal,
critical, crushing and blocked hits). Outcome probabilities sum to one and their
weighted damage/cadence must reconcile with measured DTPS. Raw reference DPS is
computed from the admitted target's weapon minimum, spread and base swing speed;
the extractor verifies that its other stats contain no added boss attack power.
The resulting compact JSON files are checked into source and bound to the
validated tier snapshots, releases and proof identities. Extraction launches no
new combat simulations and does not use the frozen simulation-cache helper.

The browser survival model scales those outcome mean damages to the owner's
**raw pre-mitigation** boss DPS. It samples independent attacks at the observed
mean cadence and applies fixed healing/absorb-equivalent pulses, capped at tank
maximum health, after damage on ties. Dedicated tank throughput uses separate
single-target healer benchmarks, not the group-healing HPS total. By default 50%
of that capacity is allocated to the selected main tank; remaining tanks/raid
damage are not simulated. It starts at full health and follows the projected
kill duration. It excludes within-outcome damage spread, boss spells, correlated
abilities/cooldowns, interruptions and mana exhaustion.

Sampling uses deterministic per-trial seeds, at most 2,048 trials and two million
events, and refuses unsupported inputs/fights longer than an hour. The Wilson
95% interval quantifies sampling uncertainty only. With no sampled deaths the UI
shows its upper bound rather than a guaranteed 0% risk. It does not establish live
server survival, accurate boss tuning, tank swap viability or current-patch
mechanics. This is a bounded planning stress model, not a qualified coupled raid
simulation or renewed gear optimization.

Re-extract after a new admitted tier measurement with:

```sh
node scripts/extract-raid-composition-metrics.mjs --codec=/absolute/path/to/admitted/codec-node.mjs --evidence-root=/absolute/path/to/existing/evidence
```

If the codec changes, explicitly provide its reviewed `--codec-sha256`. Validate
and commit the regenerated metrics with the matching tier measurements. The
extractor fails rather than inventing missing counters. The final expanded local
checks passed 72 Helper tests plus 35 Discord tests; after the input-width
correction, both the final candidate and live product passed 24 Chrome checks.

## Trash / boss assignment persistence

Boss builds remain in `seats[].profileId`. The optional
`trashProfileId: "tank-paladin"` is allowed only on
`paladin-retribution-static`. Boss damage/threat/healing references, role
requirements and the survival/kill-time models use the boss build, so marking
Protection for trash adds no second player or tank damage to boss estimates.
The trash role tally substitutes Protection for that seat.

Suggestions preserve explicitly assigned flex seats even when the boss-core
checkbox is disabled. Party-mana arrangement preserves their position alongside
locked seats and boss tanks. Manual seat swaps carry the assignment with the
build; replacing the Ret boss build clears its incompatible trash annotation.
Locks prevent assignment edits.

`trashPlanVersion: 1` records the one-time default initialization. Older local
drafts/shared links gain one eligible unlocked Ret assignment if present; all
boss builds and locked choices are preserved. Once initialized, saved opt-outs
remain opted out. No eligible unlocked Ret means no invented player or assignment.
The UI offers an assignment action or an unlock/choose-Ret instruction. Users
can explicitly mark additional Ret Paladins if their trash strategy needs them.
These are planned builds and gear switches, not automatic in-game actions or an
AoE clear-speed simulation.

## Selected main-tank references

The headline Main tank TPS and personal DPS use the selected main tank's existing
calculated pre-raid mitigation reference, exactly like health, armor and incoming
damage. They no longer display the roster-wide maximum tank TPS. The separate
threat-build link follows that same class and labels its different gear/rotation.
For the retained snapshots this is Warrior 337.1 DPS / 831.0 TPS and Bear 370.4 DPS
/ 1,241.2 TPS. These are the admitted all-slot pre-raid results, not generic blue
PvP starter estimates. No replacement measurements or new gear search were run.

A shared main-tank resolver is used by both the headline and survival model. Old
drafts get a valid explicit tank selection, trash-only Protection annotations
cannot become a boss main tank, and moving the main tank's seat preserves the
selection. Both roster tanks still contribute to the raid reference totals.
