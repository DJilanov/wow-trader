# Current-client PvP catalog coverage audit

Verified read-only on October 21, 2026. This is an input-coverage audit, not a new simulation,
proof of live vendor access, or permission to reuse numerical evidence on another model.

## Evidence

- Current client `1.60.1.70425`, hotfix `8464d7adbd3e6aba33b8c8ccefe6085c7b5c2ac0672685cbfb7e8671b01fffb8`.
- Authenticated item snapshot SHA-256: `b52b73d2765c00a0569a86f2923843ea1c264fafd5af9d5eec3874db4d7a23aa`.
- Mechanics manifest SHA-256: `89ab45e5831a45d32fba9db6982c63e307348f2b2d9cfcef7db9a2b1ad942f72`.
- Existing vendor-input bytes SHA-256: `b5dceb870225a4985becbc769d9e7917ae11357533f2810dac3db10c32fece0e`.

Inventory selection uses the exact single-class ItemSparse mask, item name beginning `Premier `,
blue quality and required level at most 60. It does not filter by EP, stat priority or presumed
healing role. This identifies client records; it does not establish their release availability.

| Class   | Client records | Existing vendor input | Missing input families                   |
| ------- | -------------: | --------------------: | ---------------------------------------- |
| Warrior |             16 |                     8 | Plate                                    |
| Paladin |             32 |                     8 | Lamellar, Luminous, Scaled               |
| Hunter  |             16 |                     8 | Chainmail                                |
| Rogue   |             16 |                     8 | Leather                                  |
| Priest  |             32 |                     8 | Mooncloth, Silken, Voidcloth             |
| Shaman  |             48 |                    16 | Flatmail, Linkmail, Ringmail, Scalemail  |
| Mage    |             16 |                     8 | Silk                                     |
| Warlock |             16 |                     8 | Dreadweave                               |
| Druid   |             48 |                    16 | Beasthide, Dreamhide, Kodohide, Wyrmhide |

The vendor input therefore contains 88 of these 240 records. Its family allowlist is not a
complete inventory of the current client's blue PvP-named gear. The importer also hardcodes
faction restriction 2; this is not item-specific evidence of live faction availability.

## Selected numerical models

The actual databases, not presentation labels, were inspected separately:

| Profile             | Source model                        | Present / client records |
| ------------------- | ----------------------------------- | -----------------------: |
| Warrior, Rogue      | `81d964b453f4e6abb50a81e7`          |              8 / 16 each |
| Hunter              | `a4eabfa5c89f3813c1b74bde`          |                   0 / 16 |
| Balance, Feral      | `a4eabfa5c89f3813c1b74bde`          |              8 / 48 each |
| Mage, Warlock       | `a4eabfa5c89f3813c1b74bde`          |              8 / 16 each |
| Shadow, Smite       | `bbbde15964092df1ecbf1dec`          |              8 / 32 each |
| Elemental starter   | fallback `81d964b453f4e6abb50a81e7` |                   0 / 48 |
| Retribution starter | fallback `81d964b453f4e6abb50a81e7` |                   8 / 32 |

This does not invalidate measurements on their pinned models, and does not establish that every
missing record is eligible. It does prevent treating a bounded model qualification as proof of
complete live-client pre-BiS coverage. Some omitted families appear to be alternate-faction or
healing variants, but those descriptions cannot replace access, stat and effect review.

## Shaman input guard

Private reusable helper `optimization/review-tools/shaman-pvp-input-audit-v1.mjs` under the
simulator artifact root verifies all 16 existing vendor Shaman inputs against current item stats,
ratings, sets 301/2094 and exact spell payloads. Ten actual-data and tamper regressions pass.
Its coverage result explicitly reports the remaining 32 client pieces, rather than claiming the
16-piece subset completes the class. It makes no model, combat or class-budget changes.

Client spell name and description identify equip spell 22801 as **Ghost Wolf Speed**, +15% speed.
It is not a Lightning Shield damage bonus. The stationary-DPS utility exclusion is limited to
encounters where the player never enters Ghost Wolf. The helper verifies both boot links, the
spell-family payload, authenticated text and zero-proc options before stat normalization.

## Required next work

October22 Paladin follow-up: the read-only
`optimization/review-tools/paladin-current-pvp-audit-v1.mjs` independently checks all32
Chevalier/Luminous/Scaled/Lamellar pieces, their actual stats/icons/set memberships and
exact glove/set payloads. All10 actual-data/tamper tests pass. The32-piece audit is not
runtime admission or a new model;24pieces are still missing from the current vendor input.
Existing Chevalier rows hardcode restriction2 despite the Alliance rank-family inference;
the mismatch is disclosed rather than treated as live access. Client mask2 is simulator
Paladin4, not Hunter2. Full evidence, current runtime gaps and future talent boundaries:
[Paladin preparation](simulator-paladin-preparation-2026-10-22.md).

1. Preserve completed studies, frozen source files and their conditional references. Do not relabel
   their catalogs as complete or silently substitute gear while retaining their DPS.
2. Review missing families' access, restrictions, individual effects and set bonuses before admitting
   them into isolated models. Do not discard healing-looking items using an EP or stat-priority guess.
3. Complete Smite's source-bound local handoff before starting another spec's numerical work. Its
   browser review does not close this wider catalog question.
4. Prepare Shaman and Paladin on their properly reviewed catalogs before starting their shared class
   clocks. Test actual runtime set and item behavior, not just imported stats.
5. Correct completed classes within the owner's approved time windows. Expired budgets must not be
   reset implicitly. Request extension authority where needed; safe input audits can proceed first.
6. Use exact backend/request identities for valid reuse. New item or mechanic inputs require their
   own focused comparisons, feedback and independent confirmation before preset replacement.
