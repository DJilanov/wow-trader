# Restoration Shaman consumable qualification

The [09:57 passive-damage successor](simulator-shaman-passive-damage.md) preserves
this consume component and addresses the two proc cases identified below. It
passes259native/Chromium controls/2262groups. Mana/scenario and hand/imbue evidence,
then numerical BiS feedback and actual application delivery remain.

## October 26, 09:17 UTC checkpoint

The equipped healing model now supports 23 additional source-reviewed choices
across ten additional axes, preserving all six previously admitted axes. This is
mechanics qualification, not a finished BiS selection or website release. The
all-class DPS, tank and healer goal remains active. No numerical optimization
window started and no presets, Git state or production pointers were changed.

The source is the authenticated effective build 1.60.1.70532 client tables. All
24 captured items and their 26-spell closure were independently replayed against
the original raw tables. Item 21546 is captured to reject its stale Fire mapping;
the other 23 choices are admitted under the explicit pre-pull additive engine
reference. Live acquisition and server stacking are not established by DB2 data.

| Family | Current choices retained |
| --- | --- |
| Health elixir | Minor 27 health, Lesser 120, Fortitude 200, Greater Fortitude 400 |
| Blasted Lands family | 25 Strength, Agility, Intellect, Spirit or Stamina; one enum choice |
| Alcohol | 15/10/10/5 Stamina, or 25 Spirit with a 5 Intellect penalty; one enum choice |
| Generic damage elixir | 15/20/35 spell damage, without direct healing power |
| Fire elixir | 10 Fire damage |
| Shadow elixir | 40 Shadow damage |
| Frost elixir | 15 Frost damage |
| Raptor Punch | 4 Intellect and a 5 Stamina penalty |
| Juju Ember | 15 Fire Resistance |
| Juju Chill | 15 Frost Resistance |

The source calls current item 21546 **Elixir of Holy Power**, spell 1310077,
granting 40 Holy damage. Its inherited `firePowerBuff=2` mapping is rejected.
There is no scheduled Holy damage action in this healing assignment. Raid Zanza,
raid oils, raid food, unknown enums and unreviewed nested consume effects remain
rejected. Zero/no-consume alternatives and every original value remain available.
The future bounded feedback uses these distinct axes rather than enumerating
their entire Cartesian product.

## Runtime and transport

New Forever-only effects are owned by Restoration. The shared consume code and
all existing production outside Restoration remain unchanged. Numeric
`healthElixir=3/4` map to current item 250334/250335, adding 200/400 health. The
old `healthElixir=1` retains item 3825's 120-health payload; it is not silently
reinterpreted. The previously unhandled `spellPowerBuff=3` maps to current Lesser
Arcane Elixir 250342 and adds 15 damage power. These numeric additions pass actual
protobuf/native/Worker transport. Their explicit current names and IDs still
need the matching healer presentation bindings when that release is delivered;
the inherited generated enum labels alone are insufficient.

The actual Intellect dependencies are retained: Kings and Ancestral Knowledge
apply before the Intellect-to-mana and Mental Quickness conversions. Negative
Intellect/Stamina tradeoffs are retained. Damage-only power does not inflate
direct healing. Health from gear and consumes remains the equipped actor's actual
maximum; external recipient health stays controlled by the healing assignment.

These are pre-pull effects without invented mid-fight refreshes. The workload
rejects a selected supplemental effect when its source duration is shorter than
the fixed encounter. Raptor Punch permits at most 300 seconds, Juju 600 and
alcohol 900. The other admitted supplemental durations cover the workload's
1,800-second maximum. Longer fights require a separately modeled refresh/expiry
controller or different choices. Original component fixtures and their declared
scope are preserved.

## Verification and immutable receipts

All **246 native/Chromium controls and 2,243 measurement groups agree**. Seven new
controls add 36 groups. All 2,207 parent numerical groups remain within 1e-7
absolute/relative tolerance, with expected runtime/request identity changes.
The old strict-input control now rejects the genuinely unsupported Fire mapping
instead of the newly admitted Greater Arcane Elixir; its numerical output is
unchanged.

The standalone executable and real browser Worker agree on complete replies for
two repeated supplemental-consume jobs. Three malformed jobs reject. Eight real
compiled faulty implementations are caught: missing Fortitude, damage counted as
healing, duration overrun, raid Zanza, stale Fire mapping, unreviewed nested effect,
disabled stat hook and missing Lesser Arcane effect. Twenty-two portable tests,
scoped ESLint/Prettier/Go formatting and complete simulator compilation pass.
Final review independently reconstructs the full request identity, source
generation and 1,543 file pins.

The 737 compiler inputs preserve 730 of 734 parent files, change four owned files
and add three. Parent and successful new sources are frozen; derive successors.
The first native attempt, `build-SzXyFp`, retains its failed direct-heal fixture:
friendly positions were omitted, so the existing target guard correctly refused
the cast. The successful fixture supplies the actual friendly geometry. No game
mechanic or healing requirement was relaxed.

All paths below are relative to
`artifacts/forever-simulator/optimization/healer-model-admission-v1/`.

| Receipt | SHA-256 |
| --- | --- |
| `shaman-supplemental-consumes-v1/capture-bFvJWu/report.json` | `f695ca46e06835895c1a7cf5e83675370f02ac7712960c04f97f36fd7f588f96` |
| `shaman-supplemental-consumes-v1/build-mYlerq/report.json` | `63f0947ead310c522f35c3d0cb4fcc68f95b401b34a6cc94bfef8087755ebc3c` |
| `shaman-supplemental-consumes-v1/build-mYlerq/browser-review-9UBHYc/report.json` | `180267c214a62634814c1b2e3c0df2a7c1c349f6b6d56950be9131330742e789` |
| `shaman-supplemental-consumes-v1/build-mYlerq/mutation-review-Mkwlgk/report.json` | `8ec555b8ddc0c0d57f277934faf182b48db63d50359eb22b96829624292dec69` |
| `shaman-supplemental-consumes-v1/build-mYlerq/final-review-UDH28c/report.json` | `86acc30a02b68ff8189c74420441c807cc8b2a260806dbf6d573c858a5f3e5cb` |

Source fixture: `infra/simulator/fixtures/shaman-supplemental-consumes-source.v1.json.gz`,
SHA `e4f55cd8a9cacc24fa68d4dcc8ffa6134053b79377ab241581b1b3f63b386b03`.
Model identity: `165f7f543d18b4a8820775c2ff0570cb98df68b14dd73ada250b99553d008e1e`.
Runtime identity: `946c79eff372dc141761f960c5ba1a96c214e9fd25c9f5b3f9b93b5d4457b531`.
The workspace is `shaman-supplemental-consumes-v1/build-mYlerq/workspace`.

## Next required work

Re-audit the older inactive proc scope against actual passive damage. Source
inspection identifies two specific cases requiring explicit treatment:

- Necropile three-piece 1299737 triggers enemy-targeted 28-life drain 1299735.
  Its harmful-spell flag and unspecified server chance cannot be dismissed by the
  previous helpful-casts-only rationale now that Adaptive can damage an enemy.
- The Postmaster four-piece 1302380 grants Return to Sender below 25% health.
  Rune/Circle can lower owner health. Self-reflection eligibility must be bound
  explicitly rather than assumed from the absence of an enemy caster.

These observations do not establish actual server proc chaining or self-reflection.
Both inherited handlers are no-ops, so a successful compile is not proof that
their live contribution is zero. Keep all candidates and preserve uncertainty.
The other reviewed exclusions still need the final expanded-assignment binding.

Then finish explicit mana-support assignments, current Dual Wield/Earthliving
access and legacy/MP5 sensitivities, followed by bounded complete-loadout,
talent/priority/consume feedback and independent 2%/separate 1% confirmations.
Deliver defaults, Configurations and Gear Sets first, then library/guidance,
with real save/share/cancel/host checks. Other classes and tanks remain in scope.

The owner requested a full deployment of all completed work after completion.
Preserve the required commit/push/deploy workflow and perform live checks of the
matching releases. This request does not make current local work deployed or
complete the outstanding calculation and validation gates.
