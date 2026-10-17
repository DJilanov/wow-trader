# Forever tank starter sets

Implemented locally on 2026-10-16. These are level-60 starting loadouts, not BiS lists,
survivability guarantees, or claims that beta vendors/launch phases permit obtaining every item.
Existing saved characters remain unchanged; select the named starter under Build library → Gear
Sets to replace their equipment. Gear presets preserve talents, rotation, race and encounter.
The follow-up default-enchant update adds reviewed role-specific enhancements to those presets;
see `simulator-default-enchants.md`. The table below deliberately remains equipment-only.

## Selection and calculation

| Profile            | Locked blue PvP armor family | Gear stamina | Base armor + bonus armor | Gear defense | Gear melee hit |
| ------------------ | ---------------------------- | -----------: | -----------------------: | -----------: | -------------: |
| Protection Warrior | Premier Mortarplate          |          209 |              5,452 + 100 |            0 |           4.8% |
| Protection Paladin | Premier Chevalier            |          242 |                5,795 + 0 |           32 |           1.5% |
| Feral Tank         | Premier Dragonhide           |          204 |               1,017 + 30 |            0 |           3.9% |

These totals sum the actual equipment arrays only. They exclude character base stats, talents,
buffs, consumes, enchants, set effects and Bear Form multipliers. In particular, **none of these
sets is advertised as crit immune**. Simulated threat and damage taken are scenario-dependent.

Each locks the matching six-piece set plus its wrists and belt. Warrior and Bear now prioritize
threat in accessories: the PvP armor supplies their stamina baseline. Paladin retains defensive
accessories. Curated rings/trinkets and role-compatible relics are fixed; remaining slots use a
deterministic weighted score over the already admitted real-item catalog:

`score = sum(itemStat[i] * roleWeight[i]) + weaponDPS * roleWeaponDPSWeight`.

The general filler search uses uncommon/rare items with required level ≤60 and item level ≤65.
The explicitly reviewed epic Don Julio's Band is an exception, not permission to admit raid epics.
Exclude faction-restricted,
profession/ability-dependent and unresolved random-suffix candidates. Require compatible weapon
proficiencies, a one-hander plus shield for Warrior/Paladin, and a two-hander with empty off-hand
for Bear. Main-hand DPS weights never apply to ranged stat sticks. Choose different rings/trinkets
even if an item is not marked unique, and reject different items sharing a unique-equipped limit
category (the engineering trinkets share category 707). Enraged Idol and
Sentinel's Libram are explicit role-compatible relic choices, not winners of a zero-stat tie.
No raid or synthetic projection is introduced by the filler search.

Warrior and Bear use **Adaptive Combat Assistant (272437)** plus **Frozen Heart of the Mountain
(249469)**: 2% expertise and 0.9% hit provide reliable threat. Adaptive's absorb/explosion is not
implemented in the pinned engine, so no damage from that use is credited. Frozen's modeled
on-use shadow/frost power is not given hypothetical physical AP value. Paladin uses
**Defender's Grip Stabilizer (272440)** plus **Guardian Talisman (1490)** for defense/stamina;
Guardian's use is not assumed implemented. The Undermine trinkets share a one-equipped limit.

The offensive rings are **Don Julio's Band (19325)** and **Theramore Signet (271908, Alliance)**
or **Insurgent's Band (272064, Horde)**. Both new BG rings grant 16 stamina / 17 AP in the reviewed
client; the similarly named Militant's Band is a mana-regeneration item, not the melee counterpart.
Separate eligible Horde presets and raid defaults preserve faction identity. Loading an unavailable
faction preset is rejected in code, including programmatic/keyboard activation. The obsolete
Warrior combined Tanky shortcut was removed because it could apply the Alliance ring to Horde.
Gear-set loading still leaves talents and rotation alone.

A 1,000-iteration seed-1337 check on the preceding gear baseline compared five legal pairs from
Adaptive Combat Assistant, Frozen/Molten Heart and Weakness Analyzer. Adaptive + Frozen led the
tested pairs: Warrior 895.27 TPS versus 884.52 for Adaptive + Molten; Bear 1,205.19 versus 1,197.99.
This is a scenario-specific candidate check, not proof of global BiS or statistical separation.
Do not equip multiple Undermine trinkets together or count unavailable Classic item stats.

The weights and selected IDs live in `infra/simulator/tank-starters-adapter.mjs`; the prepared
release includes `kfc-tank-starters.json` with all selections, numeric weights, raw totals and
limitations. It now additionally includes separate enchant totals/counts; `kfc-default-enchants.json`
contains exact enchant application IDs and source evidence. Its item IDs are runtime evidence;
generated database records stay out of Git.
The item picker uses the same weights for new tank characters instead of the old Paladin
zero-stamina defaults. Existing players' saved weights are not silently replaced.

The numerical weights are **our editorial role priorities**, not sim-derived EP
or values claimed by a class guide. Warrior and Bear prefer expertise/hit, weapon DPS and
offensive attributes rather than adding stamina through accessories. Paladin emphasizes defenses,
while retaining some spell-power value for threat. Bear
assigns no value to block or parry. These published guides informed the qualitative trade-offs:

- [Protection Warrior, Forever](https://www.icy-veins.com/wow-forever/protection-warrior-tank-pve-guide/)
- [Protection Paladin, Forever](https://www.icy-veins.com/wow-forever/protection-paladin-tank-pve-guide/)
- [Feral DPS/tank, Forever](https://www.icy-veins.com/wow-forever/feral-druid-melee-dps-and-tank-pve-guide/)

Their currently published beta guidance is not a validated level-60 BiS proof. Weapon DPS matters
for Forever Bear; the obsolete Classic assumption that weapon damage is irrelevant is not used.
Flat weights do not solve hit caps, effective health, boss-specific resistances or proc interactions.

## Evidence and engine safeguards

The maintained upstream revision remains `9a27c3d6af91d1ca0dbcf94a124b8869ad522108`.
Its broader PvP input has the missing Paladin/Druid records even though they are absent from its
source-filtered general equipment catalog. Admit **only the 16 explicitly selected missing armor
records** after checking family, rarity, item level, class allowlist, slot, finite stat array and
complete six-piece membership. The previously admitted Warrior records are preserved.

All 24 armor stat arrays were independently compared with our normalized client snapshot
`1.60.1.70425`, SHA-256
`b52b73d2765c00a0569a86f2923843ea1c264fafd5af9d5eec3874db4d7a23aa`, hotfix
`8464d7adbd3e6aba33b8c8ccefe6085c7b5c2ac0672685cbfb7e8671b01fffb8`.
Every selected record has resolved fields. Crit/dodge were converted using the client GameTable
coefficients (14 crit rating / percentage point and 12 dodge rating / percentage point at 60).
The GameTable hash is unchanged from the fork's audited rating input. Never fill absent stats
with guessed Classic values. A later upstream revision or client item change needs fresh review.

The three rings are additionally admitted directly from that immutable, SHA-verified normalized
client file by `infra/simulator/verified-accessories.mjs`; the old planner supplies icons only,
never its stale stats. Generic crit/hit rating is converted once (14/10 rating per percentage
point). Unresolved fields/effects, unknown stat types, wrong names or a changed checksum fail
closed. Hand of Justice and Blackhand's Breadth are absent from this verified item snapshot and
remain excluded, as explicitly requested by the maintainer. Absence is not proof of game removal.
Preparing this release requires that exact `<checksum>.json` in `FOREVER_MECHANICS_ROOT`
(default `artifacts/forever-client-data`). It is not committed to Git and is not silently replaced
by the daily source worker's active file. Published prepared releases are self-contained.

Client AllowableRace is unrestricted for the selected armor. The fork's broad vendor importer
assigns the exporting character's Horde flag even to unobserved Alliance-named armor; that flag
is not reliable item-eligibility evidence. Remove it only on the 16 admitted records. This does
**not** prove cross-faction vendor access; access and unlocks remain explicitly provisional.

Defaults and loading a starter disable the synthetic forced-Tier-1 switch. Real gear supplies
its stats naturally; no bonus-stat or paid-hit compensation is added. Old saved settings still
load unchanged, including an explicit Tier 1 switch, until the player chooses the starter.
Normal gear-set loading propagates the gear's load callback.

The fork lacks current definitions for Sanctuary (382) and Vindication (2086). The owned Go
overlay uses the client ItemSetSpell/SpellEffect evidence: spell 14049 grants 40 AP at two
Sanctuary pieces; spell 14047 grants 23 spell power at two Vindication pieces; spell 14467 grants
20 stamina at six pieces. Four-piece outdoor movement/stun-cooldown utility stays unmodeled.
The existing Warrior set 281 already implements 40 AP / 20 stamina. The override prevents the
old name-based Sanctuary healing bonus leaking into Bear results or stacking twice.

This is a scoped engine extension, so the WASM checksum intentionally differs from the earlier
UI-only redesign. The ordinary combat formulas are not changed. All code/Go inputs participate
in release hashing and the builder runs the focused set-threshold test before publication.
Generalized BiS, phase availability, faction purchase plans, talent optimization and missing
Paladin Seal of Fury mechanics are not represented as solved by these starters.

## Checks

```sh
pnpm simulator:test
pnpm simulator:prepare
SIMULATOR_TEST_URL=http://localhost:3017 pnpm simulator:smoke:workspace
```

The build runs the pinned engine's TypeScript/Vite build and
the focused `TestKfcTankStarterSetThresholds` and `TestKfcEnchant` Go checks. The later local
tooltip/enchant release is `4a30cdef5ca4a6f1da3935ca` (3,484 files); starter items and priorities
are unchanged. Details and required raw mechanics evidence:
`docs/simulator-item-tooltips-enchants-plan.md`. Additional inspection checks run through
`pnpm simulator:smoke:inspection`; tank and DPS suggestion research lives in
`docs/simulator-enchant-priorities.md`.
The browser suite verifies real combat for all supported profiles. The twelve unchanged
profiles compare exact fixed-seed worker requests and results against the original ignored
baseline. Tanks instead assert the exact new gear, no forced Tier 1/bonus stats, and finite
combat results; their old projected/empty-gear outputs are not valid expected results.
Preset checks cover existing edits and saved custom sets, load/reload, gear-only semantics,
Tier 1 reset, method disclosures, both faction ring variants and desktop/mobile layouts.
The common library-order check
also covers 1,600px to catch the former wide-screen side-column layout.

## Embedded item-picker dismissal

Native Bootstrap backdrop clicks and Escape already closed the item picker inside its iframe.
Pointer events on the surrounding Next website never enter that document. The site wrapper now
sends a narrow dismissal message on parent-document pointerdown. The workspace accepts it only
from its same-origin parent and clicks the existing selector close control, retaining normal
cleanup and gear state. It neither closes unrelated modals nor weakens the simulation message guard.
Both listeners are disposed normally. Browser regressions cover parent-gutter dismissal at desktop
and mobile widths, internal backdrop clicks, inside clicks remaining open and rejected foreign
origin/source messages.
