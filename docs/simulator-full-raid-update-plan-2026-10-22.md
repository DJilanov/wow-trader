# Bounded full-raid preset updates

## Authorization and limits

On October 22, 2026, the owner explicitly answered **“Yes, authorize the bounded
full-raid updates”** to the request for a separately recorded update window for
Warrior, Rogue, Hunter, Druid, Mage and Warlock **after Retribution and Shockadin**.
Question reference: `call_8183aa9693344b5d83183075f2db2d03`, item 0.

This is authorization for new work, not a reset of an expired original window.
Preserve original class ledgers, study declarations, measured results and releases.
Start each separate update clock only with its first actual supervised update job;
none of these six update clocks has started at the time of this record. Target
2–4 hours per class, retain the 24-hour hard cap, the approved 2% retained-contender
margin and the separate original 1% audit. Do not perform deep timing searches.
Do not modify frozen helpers or numerical inputs belonging to a running study.

## Evidence driving the update

The October 22 local registry audit used the actual frontend presentation and
published-library readers. It found 23 entries: 21 standard DPS and two opt-in proc
variants. This is a count of existing local entries, not proof that every entry
satisfies the current end-to-end requirements.

The decoded library scenario audit found 17 entries that differ from
`infra/simulator/raid-buff-defaults.v2.json`. Six match it: Affliction, Shadow,
Smite, Elemental, Stormcaller and Enhancement. Significant differences include
missing Warrior Trueshot Aura, normal rather than improved Hunter/Feral totems,
and missing Mage Kings. Some other differences are utility-only or may be supplied
by the character's own talent; do not infer a DPS loss from every differing flag.

Six entries lack inline source-bound rotation instructions: Fury, Fury proc opt-in,
Arms, Arms proc opt-in, Two-hand Fury and Combat Rogue. Existing DPS values remain
attached to their original scenarios; changing a link's buffs does not revalidate
its reference DPS.

Audit logs:

- `artifacts/forever-simulator/optimization/local-preset-registry-audit-20261022-v1.log`
- `artifacts/forever-simulator/optimization/local-preset-buff-audit-20261022-v1.log`

## Required work per class

1. Capture the exact current catalog, effects, talents, enchants, acquisition rules,
   selected gear/APL and full-v2 scenario. Preserve the old measured baseline.
2. Remeasure the incumbent under the actual improved raid-wide buffs, unlimited
   player buffs and the existing maximum of 16 boss debuffs. Do not import old
   scenario scores as new-scenario evidence.
3. Perform bounded feedback across all 17 slots, hands as complete loadouts, ordered
   rings/trinkets, set combinations, legal nonraid enchants and retained APL/talents.
   Reuse requests only when their complete numerical identity is unchanged.
4. Explicitly audit weapons: main hand, off hand/shield and ranged/relic; class/hand
   legality, current stats, relevant spell schools, proc assumptions, enchants,
   nonraid acquisition and available R14 alternatives. Compare one-hand/off-hand
   combinations against eligible two-hand alternatives, not one item in isolation.
   Never remove a candidate merely because its name looks like a different role.
5. A caster winner without relevant spell power requires an explicit saved
   comparison against eligible caster weapons and an explanation grounded in the
   engine's actual proc/stat rules. Item hit/crit are universal in the pinned
   Forever engine; that is not permission to prefer an unmeasured melee weapon.
   Ignore item weapon-skill bonuses without deleting the items. Feral stat sticks
   and Shaman melee-weaving require their own modeled mechanics, not caster or
   melee name-based filters.
6. Freeze finalists, obtain genuine independent confirmation with the approved 2%
   and separate 1% assessments, and check native/browser parity. Report practical
   equivalence honestly; do not call a retained incumbent the absolute maximum.
7. Deliver the same qualified settings to the first-visit default, Preset
   Configurations, Gear Sets, library and exact rotation guide. Verify desktop,
   mobile, item stats, single scrolling and Simulate. Compare the actual live
   release with the approved local release during a separately authorized deploy.

Keep newly completed specs, remaining Warlock specs, optimized tanks, catalog
coverage, access uncertainty and incremental-update requirements in the overall
campaign. This update authorization does not imply that those tasks are complete,
authorize a deployment, or allow silent deadline extensions.

## October 22 weapon and delivery audit

Repeat the read-only audit from the repository root:

```sh
node scripts/audit-simulator-weapons.mjs --live --record
node --test infra/simulator/weapon-audit.test.mjs
```

`--record` writes an immutable audit artifact, not presets or a publication approval.
Without `--live`, the audit reads local data only. It uses the actual frontend
presentation/library validators, authenticates the saved-build codec and each
catalog/preset asset, decodes all three weapon slots from reviewed links, and
fails if local publication pointers change during the audit. Live release assets
must match their local manifest hashes; unknown live releases fail closed.

Actual completed report:
`artifacts/forever-simulator/optimization/weapon-audit-8f6fc36a7fe29018.json`.
It covers all 15 character profiles, 28 selected local preset metadata entries,
28 live preset metadata entries and 23 local reviewed library links. All ten
reviewed caster-library builds have relevant spell-power main hands. No reviewed
library build has a role/hand/explicit-wearer/item-skill flag from this audit.
These checks are not new simulations, full equip-eligibility/acquisition proofs,
or proof of global BiS.

Five live presentations differ from their current local selections: Shadow,
Smite, Elemental/Stormcaller, Enhancement and Warlock. Six live preset entries
require explicit caster-weapon review: Persuader on Shadow, Smite, Elemental and
Stormcaller; Sageblade on Affliction and DS/Ruin. The unfinished local DS/Ruin
starter also has Sageblade. Do not confuse it with a qualified DS/Ruin result.
Sageblade has Intellect/universal item hit in these catalogs, so lack of spell
power is a review trigger, not proof that the item has zero caster benefit.

Separate real fresh Chromium visits, with empty character storage and no combat,
confirmed the live first-visit defaults for Shadow, Smite and Elemental actually
equip Persuader 22384. This is not only stale metadata or a user's saved character.
Both completed local Priest libraries instead use Spellblade 272683 (+94 generic
spell power), and the local Elemental/Stormcaller builds use War Staff 272603
(+94 generic spell power). The local Shadow comparison already tested Scepter of
the Unholy 13349. Do not use Classic item labels to override current Forever
stats or replace a measured loadout without revalidation.

Six regression tests pass, including school-specific power, universal crit,
physical proc weapons, feral stat sticks, paired hands, missing/invalid data and
input immutability. Scoped ESLint and formatting pass. No numerical jobs, preset
changes, commits, push or deployment were performed by this audit. Live delivery
remains an explicit outstanding task, not an already-deployed fix.
