# Account crafting network

Last validated: 2026-09-15 against `wow_anniversary:69795`.

## Product behavior

The workbench can price a final recipe in two modes:

- Direct mode buys every listed reagent from the selected Auction House.
- Account-network mode chooses the cheapest deterministic way to acquire every reagent: buy it or
  make it through one or more eligible profession recipes. Only raw leaf materials are bought from
  the AH; internal alt transfers do not pay an AH cut.

Account-network mode is enabled with `network=1`. Cooldown recipes are always excluded from both
ranked final crafts and intermediate material routes; there is no query-string override. The
workbench reports direct reagent cost, raw-leaf cost,
savings, integer leftovers, ordered craft steps, and cross-profession transfers. If the final craft
is unprofitable when its intermediates are valued at their direct AH asks, the evidence panel warns
the player to compare selling the intermediate instead.

The current profile is a transparent simulation. It assumes catalog recipes are known when their
profession specialization is selected. Actual character recipe ownership, inventory, skill, and
cooldown state have not been imported yet.

## Calculation rules

`packages/economics/src/production-planner.ts` owns the pure calculation. The planner:

1. Aggregates duplicate root requirements.
2. Treats direct AH purchase as one acquisition candidate.
3. Recursively expands every allowed deterministic recipe that creates the item.
   Deterministic consumable item transformations use the same planner edge contract without being
   mislabeled as a profession.
4. Uses guaranteed integer output and `ceil(required / output)` craft counts.
5. Carries leftovers without crediting them as immediate profit.
6. Aggregates duplicate raw leaves before consuming AH depth.
7. Retains several alternatives so a locally cheap route is not automatically chosen before shared
   AH depth is priced.
8. Rejects unavailable order-book depth and bounds recursion to twelve recipe layers.
9. Excludes direct self-input recipes and terminates reversible conversions through the depth bound.
10. Rejects every direct or shared cooldown edge unconditionally; the primary profit model has no
    override that can make a time-gated craft eligible.

Expected Alchemy mastery procs never satisfy a downstream material requirement. They affect final
expected sale output only. Random-output recipes are excluded from intermediate planning because
their minimum and maximum output differ. Prospecting and expected disenchant materials also remain
outside the intermediate graph until their probability models can provide an explicit risk policy.

Internal materials retain their raw acquisition cost; they are never free. AH fees apply to the
selected final exit only.

## TBC profession profiles

`apps/web/src/lib/specializations.ts` contains a build-locked TBC profile rather than changing the
immutable extracted recipe graph. The UI changes the available selector by profession and supports
an `All branches (multiple alts)` simulation for accounts with more than one specialist.

- Alchemy: Transmutation, Potion, and Elixir Mastery use the visible provisional `1.20x` expected
  output model. Guaranteed output remains the base quantity.
- Blacksmithing: Armorsmith plus Master Axesmith, Hammersmith, and Swordsmith recipe lines.
- Engineering: Gnomish and Goblin trainer-only recipe lines.
- Leatherworking: Dragonscale, Elemental, and Tribal TBC specialist sets.
- Tailoring: Mooncloth, Shadoweave, and Spellfire recipe locks. The matching specialty-cloth craft
  has a guaranteed output of two, but is normally excluded from the account network because it is
  time-gated.

The spell and recipe IDs are explicit and apply only to build `69795`. This prevents TBC assumptions
from leaking into Forever. Background evidence is documented by the Wowhead profession guides for
[Alchemy](https://www.wowhead.com/tbc/guide/professions/alchemy-overview),
[Blacksmithing](https://www.wowhead.com/tbc/guide/professions/blacksmithing/overview),
[Engineering](https://www.wowhead.com/tbc/guide/professions/engineering-recipes-locations),
[Leatherworking](https://www.wowhead.com/tbc/guide/professions/leatherworking-overview), and
[Tailoring](https://www.wowhead.com/tbc/guide/professions/tailoring-overview).

## Required-skill evidence

Some trainer recipes expose `MinSkillLineRank=1` even when the actual craft requires a higher skill.
`TrivialSkillLineRankLow` is the yellow difficulty boundary and cannot safely replace the required
rank for every recipe. `apps/web/src/lib/recipe-requirements.ts` therefore contains only audited,
build-specific corrections. Enchanted Leather spell `17181` is currently corrected to Enchanting 250. Add another override only after independent validation, and keep it scoped to the exact build.

## Forever migration

Do not reuse the TBC specialization map implicitly. For a new Forever build:

1. Extract and publish the exact client/hotfix tuple through the existing catalog gates.
2. Run the production graph audit: deterministic outputs, maximum depth, multiple producers,
   cooldown edges, self loops, and strongly connected components.
3. Validate every specialization ability ID, locked recipe ID, and guaranteed yield rule against the
   new client plus authoritative gameplay evidence.
4. Add a new build-keyed profile and tests; leave the TBC profile unchanged.
5. Audit trainer recipe skill ranks and add narrow build-specific corrections where the client field
   is not the actual requirement.
6. Test a golden cross-profession chain such as raw leather -> Enchanted Leather -> Leatherworking
   item using a controlled AH fixture.
7. Confirm direct mode and account-network mode produce identical results when no crafted
   intermediate is cheaper.
8. Confirm time-gated recipes remain excluded unconditionally and stochastic recipes remain
   excluded unless a separately supported risk policy is introduced.

## Next personalization slice

Extend the addon snapshot with character profession skill, specialization spell IDs, and known
recipe spell IDs. The server can then construct `allowedRecipeSpellIds` for the production planner
instead of using the current catalog-access simulation. Inventory and capital should be added after
recipe eligibility; owned materials must show both cash cost and replacement/opportunity cost.
