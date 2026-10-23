# Separate Solo and Raid DPS benchmarks

Status: requested and scenario confirmed; implementation and fresh measurements pending.
This is separate from the committed `a719aa6` dungeon-order release.

## Problem verified

The public community article lists Fury at 597.9729 DPS. Its authenticated common
benchmark intentionally supplies full-v2 buffs but clears all external debuffs.
The Warrior simulator's published Fury reference is 838.1323 DPS, from a different
support scenario. Decoding and comparing the two saved setups confirms the same
equipment and rotation, but different support: the original includes Faerie Fire,
Improved Expose Armor, Sunder Armor, Curse of Recklessness and Gift of Arthas.
The article is therefore neither an unassisted solo benchmark nor a fully supported
raid benchmark. Its score must not simply be renamed to either.

## Confirmed product contract

- Solo means sustained DPS against the same boss, not farming, leveling speed or
  survivability. Remove outside buffs, resource grants and boss debuffs. Retain the
  character's own pet, self-buffs and self-applied effects according to its pinned
  engine, trained abilities and explicit rotation.
- Raid means sustained DPS with a documented common raid-buff and boss-debuff policy.
  No world buffs or external Power Infusion/Innervate unless explicitly introduced
  as a separate policy revision.
- Both use level 60 versus one stationary level-63 target for 300 seconds, the same
  equipment, professions, consumes, positioning and rotation per reviewed build.
  This isolates support, not a claim that the existing raid rotation is solo-optimal.
- Measure each build independently in both scenarios. Rank and assign tiers against
  each scenario's own leader; never use a fixed multiplier or old validation DPS.
- Make Raid/Solo visible before the scores. Preserve selection in the URL and serve
  the selected ranking in HTML. Filters, labels, JSON-LD and methodology must agree.
- Each result needs an exact benchmark import, scenario label, date, sampling margin
  and request/response/engine/database identities. The import must not receive the
  normal raid-default migration when the user is reproducing a Solo measurement.

## Implementation order and acceptance

1. Audit self-support ownership and trained-rank behavior in every selected immutable
   engine. Clearing all support alone is insufficient: several reviewed rotations
   assume precast self-buffs supplied by configuration. Do not grant one class another
   class's buff, stack incompatible self-blessings or invent talent ranks.
2. Implement versioned, pure Solo/Raid setup transformations with source-bound tests;
   retain the old hybrid policy only as historical reproducible evidence.
3. Extend the evidence runner to produce independently authenticated scenario receipts,
   refusing changed publications, engines, unsupported fields or rotation warnings.
4. Run fresh real WASM measurements, retaining complete reproducible inputs/results.
   Verify sampled public imports reproduce the same request and score within the
   stated sampling contract. Test no raid-default leakage on initial load and reload.
5. Update both ranking surfaces and class-guide links from the same scenario evidence.
   Do not silently publish local numerical-model updates to make a link resolve.
6. Verify schema rejection and binding, independent ordering/tiering, switching,
   keyboard access, no-JS HTML, empty/error states and 1440/390/320 layouts.

## Publication boundary

The current frozen Helper simulator installation has 21 standard measured builds.
The newly published community article contains 25 builds from a newer reviewed
research set. Exact model/publication availability must be checked before linking
new scenario imports. A ranking must not claim its setup is available publicly
when that immutable engine or catalog has not been installed. Numerical publication
is a separate verification step, not an incidental side effect of this UI change.

No new Solo/Raid score, dataset, source change, commit or deployment is claimed by
this planning document.
