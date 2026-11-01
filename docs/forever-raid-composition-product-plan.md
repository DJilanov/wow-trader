# Forever raid composition suggestions

Research and implementation plan, November 1, 2026. This work inspected current
code, saved measurements and the October 30 talent export. It did not change
production, run optimization searches, or qualify the old numbers for the new
hotfix. The goal is an explainable planner for 10, 20 and 40 players, connected
to the existing raid manager and simulator.

## Implementation status — November 1

The reference-led planner is deployed at
<https://kfcguild.online/tools/forever/raid-composition>.
It includes all three raid sizes, class/spec cards, five-player groups, editable
roles and support, mandatory Warrior/Sunder duty, legal blessing/curse allocation,
locked seats, drag and keyboard movement, party mana arrangement, local saving,
validated share links and an explicit suggestion preview. It reads 32 existing
build references without changing their historical measurements. The raid manager
now uses a generated projection of the same support registry and links to the
appropriate planner size; TBC retains its own rules.

This delivery is **reference-led selection**, not a qualified new-hotfix combat
optimizer. Whole-raid simulations, selected-player parse modeling, encounter
survival, actual character/alt import and applying a proposal to a private raid
remain later phases. The UI does not claim a current total raid DPS figure or
current-patch optimality. Current Druid crit stacking remains visibly assumed.
See [the implementation and verification notes](forever-raid-composition-implementation.md)
and [the live release receipt](forever-raid-trash-roles-release-2026-11-01.md).

## Product decision

Recommend the highest raid damage composition that meets the chosen encounter's
tanking, healing and mechanic requirements. Also offer a separate mode supporting
a selected player's personal damage. These objectives can choose different
rosters. Neither score is a predicted Warcraft Logs percentile.

Do not reserve one mandatory slot for every class, or add a support specialization
because a Classic guide once required it. A duplicate buff can have zero additional
value while the player providing it remains an excellent damage/healing choice.
Explain a recommendation through its measured effect on the whole roster and its
mechanic coverage, rather than arbitrary class scores.

Owner-confirmed composition requirement: every 10-, 20- and 40-player plan must
include at least one Warrior, tank or damage. Assign that Warrior to maintain
Battle Shout and Sunder Armor on the relevant physical kill target. Use a Warrior
tank when its actual build and encounter assignment can maintain the debuff;
otherwise assign a damage Warrior. Other tank classes do not satisfy this duty.
The optimizer must preserve this requirement during additions, swaps and alt
selection. It must not recruit a Rogue just to replace the assigned Sunder duty.

Default to the owner's pre-raid acquisition rules: no raid items, no raid-dependent
crafting materials, weapon-skill bonuses ignored, and shared raid support where
actually supplied. Existing ranking fixtures remain historical references with
unchanged provenance. They are not automatically feasible 10-player compositions.

## Baseline inspected before implementation

| Area                               | Actual state                                                                         | Consequence                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Discord raid manager               | `../discord-website/lib/raids/composition.ts`, revision `forever-preview-2026.09.15` | Scores party effects with priorities and confidence multipliers; does not calculate DPS or choose a complete optimal raid               |
| Party layout                       | `../discord-website/lib/raids/roster-layout.ts`                                      | Existing five-player groups and assignments already support 2/4/8 groups                                                                |
| Current DPS references             | `apps/web/src/lib/data/forever-dps-tier-list.current.raid.json`                      | 25 builds, 5,000 iterations each, captured October 28; five-minute stationary level-63 target, pre-raid retained loadouts               |
| Support policy                     | `infra/simulator/raid-buff-defaults.v2.json`, `tier-scenarios.mjs`                   | Full support is configured independently of actual providers; includes both Druid flags and several legacy debuff flags                 |
| Tanks                              | Current raid/dungeon snapshots                                                       | Separate threat/mitigation comparisons; synthetic physical damage, not encounter survival proofs                                        |
| Healers                            | `forever-healer-tier-list.json`                                                      | Three assignments on four injured recipients; useful for archetype evaluation, not evidence for how many healers a 40-player raid needs |
| Client mechanics archive inspected | `artifacts/forever-mechanics/70425/`                                                 | The available structured mechanics archive predates the supplied October 30 hotfix                                                      |

The existing party helper incorrectly treats several now raid-wide effects as
party-local for this new purpose. Its duplicate penalties must not be carried
across as evidence that another Warrior, Hunter or Druid is undesirable. Retain
TBC's separate rules; updating Forever must not silently change TBC.

## Patch evidence and required corrections

The October 30 [Talents Forever raw export](https://talentsforever.com/data.json)
was fetched directly. Its per-row hotfix/source information matters: a recent
export date does not make every spell a newly verified observation. The raw
capture and hashes are in `artifacts/raid-composition-research-20261101/`.

The supplied screenshot agrees with the export that Moonkin Form and Leader of
the Pack now provide 3% general critical-strike chance. This is crit chance, not
3% damage. The [older official development notes](https://eu.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-26-october/631316/6)
still describe the previous separate spell/physical auras. Version both records;
do not let the older official text overwrite a newer hotfix observation.

| Effect                                                                | Evidence relevant to the planner                                                                                                                 | Implementation rule                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Druid crit                                                            | October 30 export: both auras grant all-crit, raid-wide, subject to form/range                                                                   | Proposed default: one shared crit category. Stacking/exclusivity of the new hotfix still needs current client/server evidence; until then label the assumption and do not award 6% for bringing both      |
| Expose Armor                                                          | Export: five-point rank 5 removes 2,250 armor; five rank-5 Sunders also remove 2,250. Improved Expose reduces resource cost/refunds combo points | Default armor coverage comes from the required Warrior's assigned Sunder duty. No extra Rogue utility credit for replacing equivalent armor coverage; verify overwrite rules and actual maintenance costs |
| Trueshot Aura                                                         | Export describes ranged attack power                                                                                                             | Benefit actual ranged AP attacks; do not give Warriors a melee AP bonus. Resolve the learned rank separately from the talent's first-rank tooltip                                                         |
| Shadow Weaving / Improved Scorch / Improved Shadow Bolt / Stormstrike | Current exported descriptions specify the caster's own damage                                                                                    | Never award those effects to other players merely because a legacy global debuff flag exists                                                                                                              |
| Curse of the Elements                                                 | Current spellbook describes all-magic vulnerability                                                                                              | Audit the old separate Curse of Shadow setting. Do not grant two overlapping magic multipliers by default                                                                                                 |
| Blessings and curses                                                  | Spellbook limits one Blessing per Paladin per recipient and one Curse per Warlock per target                                                     | Assign actual casters to recipients/targets; unlimited player buff slots do not remove these restrictions                                                                                                 |
| Totems                                                                | Official notes make specified offensive totems raid-wide; distinguish unchanged group effects                                                    | Keep Strength/Grace/Windfury as the requested offensive package, using verified legal placement, improvement sources and range. Respect Windfury/Flametongue exclusivity and other active totem conflicts |

This is a list of model inputs requiring audit, not a claim that every configured
legacy flag currently produces an incorrect numerical multiplier. Inspect and
control-test the actual pinned engine before classifying each flag as harmless,
ignored, or numerically wrong. The current export does not establish every
stacking rule or server behavior.

## Rogue versus Fury: what the saved evidence actually says

The retained October 28 shared raid comparison measures:

| Build          |    DPS |
| -------------- | -----: |
| Fury           | 862.67 |
| Combat Rogue   | 707.14 |
| Mutilate Rogue | 693.35 |

Fury exceeds Combat by 155.53 DPS, approximately 22.0% relative to Combat. Under
that exact fixed single-target comparison, with requirements already covered,
Fury is the better damage seat. This is not a new-patch ranking or proof about
all equipment, targets and encounters.

A Rogue's presence must earn its place through actual encounter utility or a
better legal damage setup. Under the owner's approved policy, the required
Warrior already maintains Sunder, so Expose does not justify reserving a Rogue
seat or receive hypothetical Sunder-saving credit. The inspected armor values
match. Kick, control/stealth tools and threat management matter only where the
fight or route benefits from them; Warriors can also interrupt. There is no
automatic unique-interrupt credit.

Account for the assigned Warrior's real Sunder application, ramp-up and refresh
cost in its rotation, damage and threat. This does not add another roster seat,
but the actions are not numerically free. Keep the same maintenance assignment
in both sides of a Rogue/Fury comparison unless the chosen Warrior actually
changes. If a later explicit scenario permits Expose instead, compare both
complete maintenance plans and their legal stacking; this is outside the default
recommendation policy.

For steady-state Sunder maintenance, the inspected base cost is 15 rage and the
stack lasts 30 seconds: approximately `15 / 30 = 0.5 rage per second` after the
initial stack is established. Model the initial applications separately and
refresh with enough margin to preserve uptime. Do not treat maintenance as
continually rebuilding all five stacks. The saved 155.53-DPS gap is approximately
18.03% of Fury's own DPS (the earlier 22.0% uses Combat's DPS as its denominator).
There is no measured evidence that this maintenance cost closes that gap, and
Expose has its own action/resource cost. When the assigned Warrior tank handles
Sunder in both rosters, a damage Warrior does not inherit that maintenance duty;
the unchanged tank cost cancels from the seat comparison. The default plan does
not treat Sunder upkeep as a reason to reserve a Rogue.

The comparison is a full swap:

`raid DPS with Rogue and legal assignments − raid DPS with Fury and legal assignments`

If no required mechanic favors Rogue and this difference stays negative after
current-patch controls, a maximum-damage recommendation may contain zero Rogues.
Likewise, a Bear supplying the confirmed shared crit category removes the need
for a second Druid solely for that buff; a second Druid may still win on its role
or other actual contribution.

## Shared rule and scenario model

Keep one versioned capability registry in the Helper project and consume the
same published data from the Discord manager. The browser must not import
server-only simulation helpers. Publish validated JSON/data, never executable
remote code or private roster records. Existing character specialization labels
need an adapter to exact simulator builds, including Bear/Cat, caster variants,
healer archetypes and hybrid talents.

Each capability needs:

- Spell IDs and learned rank; source build, hotfix identity, source URL and review
  state. Keep unknowns distinct from verified absent effects.
- Provider requirements: actual talent ranks, active form/pet, equipped items and
  chosen action. A specialization label alone does not establish the build.
- Scope: raid, party, assigned recipient, target, or caster-only. Include range,
  target/pet eligibility, uptime and refresh/cast cost.
- Stacking category and operation: strongest-only, mutually exclusive, independent,
  or unknown. Track provider capacity, such as blessings per recipient, curses
  per target, active totems and pet choice.
- Numerical adapter and affected profiles. An improved-buff checkbox must map to
  a real baseline/talent effect in the current build, not a legacy default.

Separate the event's desired roster, actual available players, and an ideal
anonymous composition. A player with several alts occupies at most one seat.
Unknown spec/builds can appear in planning but cannot be credited with verified
specialist buffs. Locking a player/role in place must survive optimization.

Encounter inputs include size, tanks/add assignments, healer demands, duration,
armor/resistances, target count/type, movement/melee uptime, interrupt/dispelling
requirements and relevant immunities. Published encounter facts and leader
assumptions remain distinguishable. Do not invent boss mechanics for missing
Forever encounters.

Respect the owner's 16 boss-debuff scenario as an explicit modeling constraint
unless superseded. Count all simultaneous target auras, including per-player
DoTs and private modifiers; 16 enabled external checkboxes do not prove a
40-player run stays within the cap. The existing cap audit has a missing-feature
observation, so enforce and test the rule before claiming a compliant raid model.
Do not claim the configured cap independently establishes the live game's rule.

## Sizes and healer/tank requirements

| Size | Groups | Editable initial planning allocation |
| ---- | -----: | ------------------------------------ |
| 10   |  2 × 5 | 2 tanks, 2 healers, 6 damage         |
| 20   |  4 × 5 | 2 tanks, 4 healers, 14 damage        |
| 40   |  8 × 5 | 3 tanks, 8 healers, 29 damage        |

These allocations are UI starting settings, not measured optimal compositions or
boss requirements. Encounter profiles/leader choices replace them. An encounter
requiring fewer healers can trade a seat for damage only after the chosen safety
constraints pass. Synthetic healer HPS scores cannot establish that permission.
Keep alternate tank/healer assignments available for fights with different needs.

For 10 players, each missing provider is a meaningful tradeoff; all full-support
flags may be impossible simultaneously. At 20 and 40, additional copies mainly
contribute personal performance, assignments and redundancy. They do not multiply
raid-wide auras. Party placement still matters for effects that remain party-local,
healing assignments, Mana Tide, range and positioning.

## Calculation and search

For roster `R` and support assignments `A`, resolve each recipient's actual
numerical conditions and evaluate:

`damage(R,A) = sum of player-and-pet damage over the encounter / encounter duration`

Count pets once. Support actions consume the provider's time and resources;
raid benefits are already reflected in recipient outputs. Do not add a second
"buff DPS" subtotal to an already buffed raid total. Per-player contribution
explanations are counterfactual swaps, not additive shares that necessarily sum
to the total.

1. Validate current mechanics, candidate loadouts and encounter constraints. Reject
   illegal gear, missing providers, unavailable talents, conflicting assignments
   and player/alt duplication before scoring. Require at least one Warrior and a
   valid Sunder/Battle Shout assignment, including after every proposed swap.
2. Generate feasible tank/healer/support combinations. Fill remaining seats with
   qualified damage candidates. Use a bounded beam plus one- and two-seat swaps;
   lookahead must catch combinations whose benefit appears only together.
3. Use cached per-profile responses to rank candidates quickly. Sample only legal
   support packages encountered during search, rather than all combinations of
   every possible buff. Test important interactions instead of assuming all buff
   gains are linear.
4. Re-evaluate finalists with their exact resolved settings. Use a genuine coupled
   raid model where implemented for shared target state/procs/charges and resource
   schedules. First audit whether our pinned engines can execute a mixed-class
   raid with consistent rules: class-specific releases cannot simply become one
   coherent raid engine by adding their results.
5. If only independent per-player runs are available, label totals as estimates,
   expose unmodeled cross-player effects and avoid claims of joint threat,
   healing/survival or a fully simulated 40-player raid. Required encounter safety
   remains a validated constraint, not an arbitrary DPS penalty.
6. Compare the highest candidates on a second seed with sampling intervals and the
   owner's practical 2% tolerance. Retain near ties and distinguish uncertainty
   in mechanics from Monte Carlo noise. The 2% target is not proof of global
   optimality over every possible roster/build/rotation.

Personal-parse mode optimizes one selected player's expected damage subject to
minimum viable raid constraints, with limited external cooldown/resource
assignments explicitly scheduled. It cannot give every caster the same exclusive
cooldown at full uptime. Maximum raid DPS remains the default objective.

## Speed and update strategy

Reuse admitted equipment/talents/rotations initially. This is a composition study,
not another all-slot gear search for every class. Correct the new patch's talent
legality and material mechanics first; do focused build corrections where needed.
Never relabel October 28 outputs as fresh October 30 measurements.

Cache by complete numerical identity: model/patch, character/loadout/talents/APL,
resolved support and maintenance, encounter, timing, consumables, seed and sample
count. A changed candidate or relevant buff invalidates affected requests only.
A shared crit change can affect every benefiting class even if only the Druid
patch note changed. Do not invalidate only the named provider class, or discard
new items just because older items were tested before.

Store versioned scenarios, inputs, results and recommendation explanations so a
new patch can rebuild affected suggestions. Search work runs in supervised
background jobs, with progress/cancel/checkpoints and measured budget. Page loads
only read published results. No background combat/gear jobs were started by this
research; preserve all earlier run windows, frozen evidence and deadlines.

## User experience

The class-card grid from the reference is a useful summary, paired with the
actual party layout:

- Top: 10/20/40, encounter, pre-raid phase, maximum raid DPS / support selected
  player / progression, and tank/healer requirements.
- Class cards: current and target counts, spec/role breakdown, mains and eligible
  alts, known versus unconfirmed builds. Main/alt/flex distinctions use text and
  icons as well as color. Choosing one alt removes the player's other variants
  from simultaneous availability.
- Party layout: 2/4/8 groups, five seats each, existing drag-and-drop plus keyboard
  move controls. Use one page scroll and the KFC visual system.
- Coverage: a raid-wide strip and party-local details. Show Covered, Missing,
  Conditional and Assumed distinctly. The expanded panel names the provider,
  beneficiaries, current rank, conflicts and actual maintenance assignment.
- Suggestions: "Replace this seat", "Use this alt", "Recruit this role" and
  "Assign this buff" with raid damage difference, utility tradeoffs and confidence.
  Show the before/after composition; unknown gains stay unknown rather than 0.
- A missing-buff example should say "Bear already covers the planned crit aura;
  compare this Balance seat on its remaining benefits". Extra same-class players
  must not be painted red just because their aura is duplicated.
- Save/share anonymous plans without exposing member identities. Applying to a
  real raid uses the manager's existing authentication, organizer authorization,
  revision checks and seat validation. It updates the draft only; sending DM
  confirmations still requires the leader's separate reviewed publication.

Avoid a badge claiming "perfect" without current inputs and evidence. Present
Best tested, Close alternatives and Needs mechanics verification. Spell/gear and
rotation guidance can link to existing internal encyclopedia/simulator content.

## Delivery order and acceptance

1. **Mechanics and source adapter:** capture current build/hotfix effects, reconcile
   the rule table, qualify shared crit behavior and audit relevant engine flags.
   Validate actual build legality after the Druid/Paladin/Mage changes. Preserve
   old snapshots; update the Forever rule revision separately from TBC.
2. **Pure resolver and comparison API:** legal provider/recipient assignments,
   scope/range/stacking, maintenance costs and exact numerical request identity.
   Read current qualified DPS/tank/healer data through existing loaders. No
   unsupported candidate receives invented performance.
3. **10-player end-to-end:** compare useful support skeletons, verify first/second
   Rogue, first/second Druid, missing Warlock and second Paladin cases, and show
   precise explanations. Start with this size because false full-support assumptions
   are most visible there.
4. **20/40 and UX:** same resolver/search with additional role/assignment needs,
   reference-style cards, native party layout, availability/alt constraints and
   responsive live comparison. Calibrate search breadth from measured runtime.
5. **Raid-manager integration and release:** reuse canonical players/rosters,
   preview/apply with revision checks, publish only reviewed scenarios and compare
   the recommended roster against its exact simulator inputs in real browsers.

Required regressions include: one crit provider covers the raid; a second does
not double its category under the selected assumption; personal-only effects
cannot buff allies; no ranged-AP credit to pure melee; correct blessing/curse
caster capacity; legal totem and weapon-imbue/poison combinations; pet-dependent
support absent with the wrong pet; at least one Warrior in every raid size;
removing or swapping the last Warrior is rejected; a tank Warrior can cover
Sunder without reserving a damage Warrior; Sunder is not credited to a non-Warrior
tank or granted instantly at five stacks; no default Expose recruitment credit;
real cost of Sunder/Expose; no double counting
of pets/buffs; legal debuff population; healer/tank minima; one player/one alt;
locked seats preserved; 10/20/40 totals and five-seat groups; stale patch rejection;
conditional builds; sampling ties; deterministic replay; TBC preservation; denied
non-organizer apply; and no DM side effect from building/rearranging a suggestion.

Review mobile widths, keyboard movement, one-page scrolling, clear missing-data
states, links, real response time and background cancellation. Release follows
the project's explicitly requested commit/push/deploy flow when implementation
is authorized; this research itself includes no deployment or new Git commit.

## Research verification before implementation

Read the actual current roster code, support policy, 25-build DPS snapshot and
tank/healer methodology. Verified the Fury/Combat difference directly from stored
numbers and captured the October 30 raw export with its SHA-256. A machine-readable
receipt is `artifacts/raid-composition-research-20261101/research.json`. No app code,
existing simulation snapshots, protected cache helper or production data changed.
No unit/build suite was run in that initial research phase. Implementation checks
are recorded separately in the implementation notes linked above.

Primary references: the raw [Talents Forever export](https://talentsforever.com/data.json)
(client-derived, CC BY 4.0), the dated [Blizzard development notes](https://eu.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-26-october/631316/6),
the supplied October 30 screenshot and our own stored measurements. The October
30 [datamining report](https://www.wowhead.com/forever/news/massive-talent-tree-changes-to-druids-and-paladins-class-tuning-for-wow-forever-383670)
provides additional context and explicitly separates live hotfix observations from
published development notes. New-crit stacking and unverified encounter details
remain research gates rather than assumed facts.
