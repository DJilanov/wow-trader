# Joint collection forecasts

Introduced in local ledger `quest-funded-joint-collection-ledger-20261101-v28`,
the current ledger can count a supported collection task once when several objectives use the same
creature. It does not infer kills from a level deficit. The complete route remains
unfunded; see the [current audit](forever-leveling-no-grind-audit-2026-10-31.md).

The v46 ground-pickup pass adds source-backed collection/hand-in work without changing this joint loot calculation. Each player collects their own object item; the ground tasks add no modeled kill XP or respawn time. Its current route totals are recorded in the [no-grinding audit](forever-leveling-no-grind-audit-2026-10-31.md); older partial bars below belong to their stated revisions. The v47 conversation pass likewise adds no kill credit and leaves this loot kernel unchanged.

A separate multi-creature collection prototype passed narrow probability/XP-input equivalence checks but regressed actual route allocation. It was excluded from product source; the current route still requires a single supported target for the collection calculation. Two real Human Paladin failures and the compiled prototype are retained privately in `.cache/leveling-no-grind-20261031/unselected-equivalent-v45/regression.json`. Its incomplete full-matrix/native runs are not passing checks. Reusing any such model requires whole-route regression proof and conservative overlap inventory handling.

## Calculation contract

`loot-joint-distribution.ts` calculates the distribution of the time needed to
finish all supplied fixed-stack collections and any deterministic kill objective.
For independent completion times, the combined completion CDF is the product of
the individual CDFs. The mean is the sum of the remaining tail probabilities.
Taking the maximum of the separate means is insufficient: two independent
one-item objectives with a 50% chance each have a joint mean of 8/3 kills, rather
than two kills.

Pooled loot multiplies the item quota by the number of players. Independent
personal rolls require every player's quota to finish. Shared corpse copies use
one roll stream. These semantics must already be established by the objective's
validated loot inputs; the Group Loot setting alone establishes none of them.

The kernel reports the mathematical mean, bounds on its omitted tail, the minimum
possible kills and the 10th/90th percentile counts. The existing scenario selector
rounds the mean upward for its integer reference kill budget. XP then follows that
budget and the changing player levels. **That XP is a planning estimate, not the
statistical expectation of XP across every possible drop history or a guaranteed
minimum payout.** The expected scenario is held if the calculated bounds straddle
an integer kill-budget boundary.

Work is bounded to 10,000 kills, 100,000 probability states and 5,000,000 state
operations. Exceeding a bound produces an explicit unknown result. A result is
accepted only after its remaining mean tail is bounded by 1e-10 kills, or an exact
single-collector mean is available together with the required percentiles.

## Eligibility and accounting

`combat-loot-joint.ts` requires one explicit shared NPC, compatible existing build
and drop context, fixed stacks (or a single success that completes the quota), and
known fresh inventory. Duplicate consumption of the same item by different quests
is held. Several random item rolls require the same reviewed historical loot
template identity; its preparation admits only unconditional, ungrouped rows.
The [pinned historical loot engine](forever-leveling-quest-drop-probability.md)
supports independent reference rolls for those rows. Current Forever correlation,
loot rates and sharing remain unverified.

Consecutive relevant quest changes form a combat phase. The phase cannot cross an
acceptance or hand-in. Its combat is credited once, and a later completion does not
pay again. Deterministic shared kill requirements can form a lower bound on the
collection work. Unsupported variable-stack, multi-creature or partially completed
joint inventory remains unknown.

When known work overlaps a different unresolved collection, the supported prefix
may still count. That work marks the other collection's remaining inventory
unknown; a later step cannot restart that other quest at a fresh full quota.
Previously completed counters remain completed.

## Reviewed Elwynn example

The archive's candle-and-dust step permits both Kobold Miners and Kobold Tunnelers.
The reviewed local action explicitly sends the player to **Kobold Tunnelers in
Fargodeep Mine**, and the forecast and native `.mob` hint use NPC 475. The override
requires the exact source chapter/step, expected instructions, both expected quest
objectives, and the reviewed normal creature identity and level bound. Different
source wording or additional objectives do not silently inherit it. The immutable
archive is unchanged.

At the historical base rates of 66% for eight candles and 50% for ten gold dust,
the separate-starter reference mean is approximately 20.092456603 kills, giving a
21-kill planning budget. The current real-route check credits 1,450 reference kill
XP once at that step, rather than crediting both collections separately. The
five-player pooled case has different quotas and its own forecast.

Book Return is active during this visit. Its Lost Book rate/remaining inventory
and its later custom encounter remain unresolved. Counting the supported candle
and dust work does not manufacture Book Return kills. The archive also hides this
particular candle/dust step behind an unrelated `.isNotOnQuest 91775` branch. For
the explicitly reviewed canonical action only, the native renderer removes that
unrelated quest condition while preserving both completion directives. The book
quest and other source branches are retained.

## Verification and limits

Tests compare the numerical kernel against a separate binomial-survival
calculation, exercise pooled/copied/independent party completion, deterministic
floors, operation limits, unknown correlation, duplicate consumption and partially
known overlaps. Ledger regressions verify that kills pay once and unknown later
inventory cannot earn a fresh full quota. Native tests check the target hint and
the removal of the unrelated condition.

The real-input receipt is
`.cache/leveling-no-grind-20261031/source-scenarios-joint-collection-review.json`.
The complete matrix and native compilation checks are separate receipts. None of
these local checks constitutes an in-game playtest, publication activation or proof
that every chapter reaches its target. No crawler or player recording is required
to reproduce this calculation from the frozen inputs listed in the current audit.
