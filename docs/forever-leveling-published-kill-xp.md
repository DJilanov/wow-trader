# Forever kill XP: published calculator reference

## Source and scope

The owner identified Wowhead's [Forever experience calculator](https://www.wowhead.com/forever/experience-calculator?level=10).
Its [developer notes](https://www.wowhead.com/latest-dev-updates/ArtemisGrimm)
describe the October 6 correction for lower-level creatures and the October 12 rounding
correction. The calculator explicitly describes its displayed rewards as solo kills.

On November 1, normal browser navigation captured the requested levels 10, 20, 30, 40,
50 and 60. The level-60 request actually renders the default level 10: the calculator only
accepts player levels 1–59. An additional level-59 request supplies the final pre-cap reference.
The captures retain calculator tables, calculator controls and public asset identities;
they do not export cookies, browser profiles or unrelated page contents.

| Requested player level | Rendered player level | Same-level normal solo XP |
| --- | --- | ---: |
| 10 | 10 | 95 |
| 20 | 20 | 145 |
| 30 | 30 | 195 |
| 40 | 40 | 245 |
| 50 | 50 | 295 |
| 60 | 10 | Unsupported request; excluded as level-60 evidence |
| 59 | 59 | 340 |

All accepted captures have zero rested XP, an empty progress bar and Well Fed disabled.
`combat-calculator-reference.json` retains 77 normal/elite rows with source URLs and capture
checksums. Typical quest values displayed by this calculator do not replace individual
quest reward facts.

## Calculation correction

`foreverNormalKillXp` implements the published solo base. The active kill estimator now uses
it while retaining the existing observation, eligibility and party-context checks.
`classicNormalKillXp` remains available as the historical comparison, not the active Forever
forecast.

For a lower-level creature, the base is `45 + 5 × creature level`; the player's zero-difference
band supplies the reduction. Equal/higher-level creatures use the player's base, with the
published bonus capped at four levels above. Float32 multiplication and nearest-even rounding
are required before applying the elite multiplier.

Examples without rested XP or Well Fed:

| Player / creature | Previous normal reference | Published normal reference |
| --- | ---: | ---: |
| 10 / 5 | 27 | 20 |
| 20 / 14 | 65 | 52 |
| 10 / 11 | 99 | 100 |

The implementation matches all **154** captured normal/elite values. A separate isolated
parity check against the pinned publisher arithmetic matches **11,800** combinations:
player levels 1–59, creature levels 1–100, normal and elite, with Well Fed disabled.
Compared with the historical normal reference, 396 combinations decrease and 60 increase.
This is a correction to estimated rewards, not a change to server behavior.

Source asset:

- URL: `https://wow.zamimg.com/js/react/experience-calculator.6f84c88f.js`
- SHA-256: `6b319abab184f4b163b8c4f0362b2549231b814f5f068ada241bde3741fde8ca`
- The third-party bundle is retained only in the private audit cache; its implementation
  is not distributed with the application. The repository fixture contains numerical facts
  and provenance.

## Party and dungeon boundaries

The source supplies a **solo base reference**. Its generic elite column does not establish
Forever's reduced dungeon payouts, party bonuses, boosting penalties, kill eligibility
exceptions or a dungeon's clear population. Existing conservative per-level party shares
remain estimates. Unknown dungeon tuning still contributes zero; no clear manifest is
invented from this calculator.

The owner's separate observation context remains 24–30 XP **to each player** for a level-20
elite with five level-20 players in a dungeon. That amount is already shared. Matching
per-player observations bypass reference splitting and multipliers; the calculator does not
replace or re-divide them. The reported range is not promoted to verified build-specific
observation evidence.

The captured defaults do not validate rested XP, the optional Well Fed rounding path,
arbitrary configured multipliers or current-build party/dungeon payouts. Quest rewards and
their explicit 2.375× planning basis are unchanged. The leveling cap still grants zero XP
after level 60.

## Validation and release status

`combat-forever-reference.test.ts` checks every captured row through the public estimator,
the float32/tie boundaries, gray/cap exclusions and single conservative sharing for parties
of two through five. Existing tests retain final per-player observation handling and
simultaneous level changes across party members and quest phases.

The private capture and parity receipts are under
`.cache/leveling-no-grind-20261031/experience-calculator-20261101`.
The [no-grind audit](forever-leveling-no-grind-audit-2026-10-31.md) records the current full
route, native-output, build and test results. Previous route reports used the historical
formula and cannot certify the corrected projection. No new browser profile, crawler,
addon ZIP, installation or deployment is required to collect these references.
