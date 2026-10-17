# Build recommendations → practical rotation guides → search discovery

User-requested next phase, October 17, 2026. The current priority remains completing the
pre-raid talent/rotation/gear feedback loops for every supported useful spec, one spec at a time.
An archived optimization winner is not a current-engine recommendation. No guide should claim
maximum DPS until its exact build and rotation pass the same publication checks.

## Product outcome

The user explicitly confirmed the long-term target is a full player-facing BiS guide like
[Wowhead's Fury pre-raid guide](https://www.wowhead.com/classic/guide/fury-warrior-dps-pre-raid-best-in-slot-bis-gear-wow-classic),
not a simulator dashboard or a single winning loadout. The reference organizes recommendations
by equipment slot, distinguishes alternatives, explains choices, lists sources/locations and
enchants, and includes race-dependent weapon choices. It is a Classic/Season-of-Mastery reference,
not evidence that its item rankings, acquisition or mechanics apply to Forever. Reuse that useful
information structure with original Forever analysis; do not copy its prose or import its rankings
as simulation results.

Each approved build should answer both “what should I equip?” and “how do I play it?” on a
readable, shareable page. Original simulation experiments, interpreted for real players, are
the differentiator—not more generic descriptions of abilities or copied guide text.

Start with one canonical class/spec guide, for example the PROPOSED
`/forever/guides/warrior/fury`. This route does not exist yet. Include gear, talents, enchants,
rotation and limitations as sections. Add a separate rotation page only once it answers a
substantially different need with enough useful content; do not create near-duplicate pages
for the same query. Link guides from the simulator, class talent page, item pages and the
Encyclopedia, and link the guide back to the exact reproducible simulator setup.

The repository already has TBC BiS presentation at `/tbc/encyclopedia/bis/[slug]` and a
`packages/bis` catalog/legality adapter. Reuse suitable presentation and ID/source contracts,
but do not relabel its rule-based TBC scores as Forever combat results. Resolve the final
Forever canonical route against this existing navigation before implementation; do not ship
duplicate indexable BiS and guide pages answering the same question.

Inspection of `packages/bis/src/catalog-adapter.ts` confirms that `CatalogStatRow` takes client
stat IDs and rating values, not the combat engine's normalized 44-stat vector. For example,
Lionheart Helm (12640) has 28 CritRating in the raw catalog, but the compiled vector stores
2 percentage points at index 19. Do not cast compiled items into that adapter, reinterpret
2 as a rating, or re-score simulation winners
with the TBC evaluator. The simulation-backed guide adapter needs its own explicit unit/schema
boundary: retain the reviewed compiled values for numerical claims and join item/source metadata
by ID. Per-slot alternatives still need their own measurements before a complete guide is published.

## Rotation guidance accompanying every approved build

1. State the objective and supported scenario: single-target DPS, target level, encounter
   duration, race/faction, party support, professions, consumables, tier-bonus switches and
   item/model confidence. Threat/survival, healing and AoE require their own objectives and
   experiments. A single-target DPS winner does not prove a tank or AoE recommendation.
2. Give a short practical summary, then separate pre-pull actions, opener, sustained priority,
   execute phase and cooldown rules. A priority is a conditional decision list, not a fixed
   sequence of buttons. Separate queued attacks and off-GCD actions from normal GCD abilities.
3. Explain exact tested conditions in player language: resource thresholds, stance changes,
   proc handling, debuff upkeep, cooldown alignment and when to skip a low-value action.
   Preserve the exceptions; never turn a conditional action into “always cast this.”
4. Explain the relevant talent choices and how they change the rotation. Use spell IDs and
   current names/icons from the same client snapshot. Do not attach a generic Vanilla rotation
   to a Forever talent build or a different weapon style.
5. Offer mistakes to avoid, plus measured alternatives: simplified versus full priority,
   alternative resource thresholds, and any mechanical assumptions. Only show a DPS cost or
   improvement when a controlled independent-seed experiment actually measured that change.
6. Show a readable sample combat timeline and spell breakdown from an actual saved detailed
   run. Label it illustrative: proc timing and player latency make it unsuitable as a rigid
   second-by-second promise. Do not infer a distribution from a single sample.
7. Provide “Load this build” with gear, talents and rotation together and an explicit warning
   before replacing the user's current setup. Never silently enable provisional enchant models.
8. Show author/reviewer, meaningful review date, client build, engine/catalog fingerprints,
   sources, assumptions and a short changelog. Distinguish modeled, observed and unknown facts.

### Evidence contract and publication gate

Use the winning APL already saved in `settings.player.rotation` in
`kfc-reviewed-simulator-build.v1`, alongside the exact talents, equipment, encounter, native
binary SHA, DB SHA and feedback/rotation receipts. Existing reviewed exports are immutable;
do not rewrite old winners when the engine changes.

Add a versioned rotation-guide artifact keyed to that reviewed export's checksum. It should
contain the publication objective/scenario, linked APL hash, prerequisite and ability IDs,
opener/priority/execute/cooldown explanations, experiment references and known limitations.
Maintain a mapping from each player instruction to its APL action/condition or an explicitly
reviewed practical note. A prose generator must reject unsupported APL operators or keep that
section under manual review—not invent an explanation. Compile supported AND/OR/comparison,
resource, cooldown and aura conditions with their original semantics and ordering.

Publication requires:

- Current client/talent legality, non-raid acquisition/recipe checks, complete gear/enchant
  coverage and completed fixed-blue → talent/APL → equipment → actual-gear feedback receipts.
- Reproducible independent-seed comparisons; sufficient iterations and uncertainty reported.
- Exact browser/native agreement for the approved loadout and rotation.
- Tests for the APL-to-instruction mapping, resource threshold boundaries, priorities,
  unsupported actions, stance/weapon constraints and conditional cooldowns.
- A reviewer checks whether the instructions are practical for a human. If a simplified
  alternative is offered, simulate it separately; do not imply ideal automation is effortless.
- A patch changing any linked talent, item effect, spell or engine input marks the guide
  “needs revalidation.” Keep the previous version accessible with that warning, not falsely fresh.

The current Fury 19/31/1 and Arms 39/10/2 exports are archived research candidates, not inputs
for a newly published “best rotation” claim while current item-model revalidation is pending.

## BiS guide contract: the actual player-facing deliverable

Each finished class/spec guide needs:

- A useful gear summary covering all equipment slots, item icons/tooltips and the exact suggested
  enchant. Two-handed builds explain the intentionally empty off-hand. Link items, enchants and
  known recipes to the Encyclopedia and offer Wowhead references where local source data is absent.
- Per-slot reasoning plus tested replacements: recommended in the selected setup, competitive
  alternative and practical starter where supported. Give the measured difference/uncertainty in
  that loadout, not an invented universal item score. Rings, trinkets, weapons and set bonuses
  must show dependent pairs/packages; users must not be told that independently ranked pieces
  always combine into the best complete set.
- Source and location, faction, race, profession/reputation/PvP requirements, quest exclusivity,
  and confidence. Current item stats, provisional historical stats, historical acquisition and
  verified Forever acquisition remain different fields. Missing drop origins are labelled rather
  than fabricated; guessed drop rates or farm times are never presented as facts.
- A practical acquisition checklist. Clearly separate an uncapped theoretical pre-raid setup
  from accessible dungeon/quest/crafted choices and expensive or high-rank PvP options. The
  current simulation cases allow Rank14/exalted rewards: they cannot silently become a practical
  no-high-rank guide. Changing that availability policy requires new filtered full-loadout runs.
- Explicit weapon-style coverage. The current candidate policy preserves the control's style;
  two-handed Arms or dual-wield Fury therefore cannot prove a best-across-styles claim. Evaluate
  relevant alternatives with their own legal talents/APL and full feedback: two-handed Fury,
  dagger/non-dagger Rogue, Hunter melee stat sticks and caster staff/one-hand-plus-off-hand.
  State untested frontiers rather than interpreting a rejected candidate as a measured loss.
- The actual tested talent build, relevant stat tradeoffs, enchants/consumes and playable rotation
  instructions. “Load in simulator” must load the same complete scenario and retain warnings.
- Last substantive review, client/engine/catalog versions, assumptions, author/reviewer and a
  readable update history. New items mark linked recommendations stale until revalidation, not
  merely until a date label changes. Useful existing guides can remain visible with that warning.

The current optimizer proves neither a complete ranked alternative list per slot nor the cheapest
farming route. Add an explicit alternative-evaluation stage after convergence: screen replacements
and relevant pairs/set packages in the final context, validate close finalists with independent
measurements, and preserve those receipts. Do not turn low-iteration search comparisons into
precise published DPS deltas. These guide-facing alternatives and acquisition notes are a separate
deliverable, not something the new campaign runner already claims to have finished.

Publication flow is: reviewed catalog → reproducible full simulation campaign → independently
tested alternatives → versioned guide-data adapter → original explanations/practical review →
server-rendered canonical guide. The adapter consumes the immutable campaign result linking both
accessory audits and the final rotation receipt, not just a standalone gear/export JSON. Its contract
must tie every recommendation and numerical claim to the exact case and receipt hashes. Publication
and replacing a live recommendation remain explicit review actions; a new simulation never pushes
untested prose or a public BiS claim automatically.

## Additional content worth building after the verified guides

Prioritize useful original answers over page count:

1. **Pre-raid alternatives and acquisition checklist.** Best available replacement per slot,
   profession/reputation requirements, mutually exclusive quest choices and upgrade impact.
   Keep uncertain loot origins labelled; a historical acquisition source is not verified Forever loot.
2. **Stat and enchant breakpoints.** Explain the tested hit/expertise/crit or mana thresholds,
   and show how gear and party support change their value. Calculate these from the current
   model, not a hard-coded Vanilla cap. Link each enchant to its recipe and material costs.
3. **Patch-impact reports.** “What this patch changes for Fury” with the before/after talent or
   item payload, affected recommendations, rerun status and measured impact when available.
   Do not publish an untested patch-note interpretation as a demonstrated DPS change.
4. **Specific build comparisons.** Fury versus Arms under matched support, or two meaningful
   play styles, with limitations. Do not publish a universal tier list from unmatched scenarios.
5. **Practical dungeon preparation.** Gear/consumable shopping lists connected to the existing
   Trader and leveling/dungeon pages, with realm/faction, scan time, AH fee and availability.
   Volatile market values need freshness labels; stale values must not look current.
6. **Troubleshooting pages supported by evidence.** Questions such as “why is my DPS lower
   than the simulator?” and examples comparing uptime, missed procs, ability priorities and
   raid buffs. Do not claim to analyze player logs before an actual supported log input exists.

Start with one complete Warrior guide after revalidation, review its usability, then reuse the
evidence-backed structure for the next spec. Each spec must have its own reasoning and experiments.

## Search implementation and feedback loop

- Server-render the useful guide text, gear, priorities and sources in Next.js. Users and
  crawlers should not need the WASM combat engine or iframe to understand the recommendation.
- Use descriptive unique titles/H1s, an honest summary, crawlable links, a stable canonical
  URL, OG artwork and a sitemap entry. Dates change only for substantive content/evidence updates.
- Use `Article` and `BreadcrumbList` only where appropriate and matching visible content.
  Structured data does not guarantee a rich result or improve ranking by itself. Do not promise
  game guides FAQ rich results or treat an in-game crafting recipe as a cooking Recipe result.
- Keep arbitrary simulator configurations, search/filter combinations and duplicate experiment
  pages out of the index as appropriate. Do not block a URL in robots.txt when Google needs to
  crawl its noindex directive. Canonical and noindex policy needs route-specific review.
- Validate rendered HTML and structured data; use Search Console URL Inspection on representative
  published guides and submit their sitemap. Authentication must not hide public guide text.
- Review query/page impressions, clicks, CTR, position and indexing together after sufficient
  search data accumulates. Improve pages answering real player questions; do not manufacture
  duplicate pages for every keyword spelling. Rankings cannot be guaranteed or given a fixed ETA.
- Share useful guide links with players and communities where welcome. Seek genuine references
  to our experiments and tools, not paid/spam links or mass automated posting.

### Primary guidance checked October 17

- [Google: helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
  emphasizes original information/analysis, clear sourcing and useful answers.
- [Google: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies#scaled-content)
  covers pages produced to manipulate rankings without sufficient user value, irrespective of tooling.
- [Google: generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
  permits useful assistance but does not exempt content from quality/spam requirements.
- [Google: breadcrumb markup](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
  and [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
  describe eligibility and validation, without a guarantee of search appearance.

This plan does not authorize automatic public publication, fabricated testing results, a live
deployment or an assertion that the unfinished all-spec optimization goal has been achieved.
