# Weapon-proc enchant evidence

Reviewed October 16, 2026 against the local Forever client capture. This is a payload audit,
not a confirmation of server proc rates, trigger eligibility, dual-wield behavior or availability.
The four effects remain provisional and require explicit browser opt-in.

## Pinned evidence

Mechanics capture:
`artifacts/forever-mechanics/70425/8464d7adbd3e6aba33b8c8ccefe6085c7b5c2ac0672685cbfb7e8671b01fffb8/mechanics-20261016T084757Z-2aedcf9205934b11898d991d60ee8d1d/`.

Manifest SHA-256:
`89ab45e5831a45d32fba9db6982c63e307348f2b2d9cfcef7db9a2b1ad942f72`.
This matches `inspectionSource` in `infra/simulator/inspection-data.mjs`. The compressed
effective tables used below were independently checked against their manifest hashes:

| Table                |   Rows | SHA-256                                                            |
| -------------------- | -----: | ------------------------------------------------------------------ |
| SpellItemEnchantment |  2,217 | `652a8d44a96485d957f58cb65fcb1a34d86919096f7a0cb846b7e258af2b4955` |
| SpellEffect          | 42,697 | `644f5a388c7036a5296fa05faf3533f43c817220969ca53f9a1f39a3e26d5d93` |
| SpellMisc            | 31,919 | `1da49c03832274672a0e79f9064e3873f5183b36e602b7af29f0365bfadd7d69` |
| SpellDuration        |    134 | `46d0a19199da1276018dd8d0b0da83a4b1c05747b60823790fcf0f19de210853` |
| SpellAuraOptions     | 12,793 | `9c38e0f6be9a7cd359aa789a66697e8fdc30c8d77314b74cac5dbc6449001eec` |
| SpellName            | 31,939 | `79fc6b36256cf0ecff10eebd36acfdaeaabdab56ecbf3a23a54c2f031f2540b1` |
| Spell                | 31,939 | `04d3d029eb2f83e114e68235b6116937c417734232570244bda827bd334d0bad` |

Some tables contain encrypted records, as declared by the manifest. Missing rows are not proof
that an effect cannot exist. No separate `SpellProcsPerMinute` table was included in this
capture; its absence from the capture is not proof of absence from the client.

## Client facts versus modeled assumptions

| Enchant effect     | Client-linked payload                                                                                                                                                                        | Current engine cadence                                                                      | Boundary                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 36, Fiery Blaze    | Spell 6297, effect 684690: Fire school, base damage 11, variance 0.36363637. Enchant `EffectPointsMin[0]` is 15.                                                                             | 15% on eligible landed weapon attacks; damage roll 9–13.                                    | The numeric 15 agrees with the modeled chance, but does not independently verify the complete trigger rules. The engine uses action ID 6296 for reporting, not the client's payload ID 6297. |
| 803, Fiery Weapon  | Spell 13897, effect 690415: Fire school, base damage 40, zero variance.                                                                                                                      | 6 PPM.                                                                                      | Payload is client-backed; the 6 PPM rate is not established by these rows.                                                                                                                   |
| 1898, Lifestealing | Spell 20004, effect 697642: Shadow school, health-leech effect 9, base points 30, amplitude 1.                                                                                               | 6.66 PPM, damage and health return.                                                         | Base payload is client-backed; trigger frequency and proc interaction rules remain assumptions.                                                                                              |
| 1900, Crusader     | Spell 20007, effect 697922: aura 29, Strength index 0, base points 100. SpellMisc duration index 8 resolves to 15,000 ms. Effect 697923 is a healing payload with mean 100 and variance 0.5. | 1 PPM, separate weapon buffs, 100 Strength for 15 seconds at level 60, healing roll 75–125. | Strength and duration are client-backed; cadence, eligible triggers, simultaneous weapon buffs and healing threat are not verified by the payload.                                           |

Crusader also links a passive spell, **458112**, through enchant effect type 3. Its effect
1163878 has aura 42 and triggers spell 20007. Its `SpellAuraOptions` row 237995 declares
`ProcChance: 100`, `ProcTypeMask: [20, 0]`, `ProcCategoryRecovery: 0` and
`SpellProcsPerMinuteID: 0`. This must not be interpreted as “Crusader procs on every swing”:
the event mask and relationship between the enchant's type-1 proc and type-3 passive need
separate verification. The inherited engine uses its own PPM manager rather than importing
this passive's trigger logic. This is another reason to retain provisional status.

The engine rules above were read from the maintained local
`sim/common/enchant_effects.go`; the active native binary remains SHA prefix `3dad4336014e`.
No combat code, provisional classification, optimizer inputs or public defaults were changed
by this audit. The running proc-enabled feedback experiment is conditional on those models.

## Required before calling a proc verified

Record the exact client build, weapon speed, hand, landed attacks, special attacks, proc
timestamps and overlapping buffs in a controlled in-game test. Compare observed eligible
events and intervals with the modeled rules, including dual-wield and extra-attack cases.
Any mechanics correction requires a new binary identity, browser parity and fresh optimization
evidence. A larger simulation sample cannot resolve an incorrect proc model.
