# Raid-core DPS recheck — October 20, 2026

Status: Feral and all three Hunter raid revalidations are deployed and publicly verified.
Other class follow-ups remain separate; older measurements are not relabelled.

UI follow-up: a shared seven-buff default adapter is now implemented and passes865web
tests plus typecheck/lint. It covers all individual class/tank pages, including one-time
current-character migration, without altering any measured build or its DPS reference.
Historical full benchmark imports deliberately retain their recorded buffs. This UI
correction is not completion of the remaining numerical revalidations. Actual all-profile
browser smoke and production rollout are in progress; see context.md for final receipts.

October20 17:50UTC: sourcec8265bc, Hunterpresentationc98e5e028954b29c1ee0354e. All3Hunter
40k references905.7161/910.6219/868.5296 are live in actual defaults/configs/GearSets/library,
with7core buffs and Greater20. Feral18c6325ffc446938063c598f/752.0645 is also live from the
previously committed handoff.852tests and both candidate/public34desktop/mobile checks /
15combat runs each pass with identical settings/results. Only Helperweb restarted; see
docs/simulator-hunter-raid-deployment-2026-10-20.md for exact source/build/artifacts/rollback.
Earlier chronological notes below describe the stages before this verified deployment.

Hunter update,17:10UTC: all three fresh40k confirmations now pass: BM905.7161, MM910.6219,
SV868.5296modeledDPS. SV conservative retained gap0.922642% passes original1% and owner2%.
Its27,779-origin full gear pass and1249-origin state review retained16/4/31/Cat/melee APL;
exact unchanged-state applicability avoids a redundant gear correction. Independent fresh
source replay and selected inspected10k native/browser DPS/stdev equality pass. SV fresh
coverage has no separate rotation/enchant arm; those were inspected in the bounded search,
not each fresh-confirmed. Export tests/write and shared three-spec UI handoff are pending.
The owner authorizes commit→push→deploy after that handoff; production remains unchanged.

Feral follow-up now has accepted fresh confirmation (752.06 DPS / 40,000 fights) and an
actual selected browser replay of the original inspected 10,000 fights with exact native
DPS/variance equality. Its corrected V2 preset is now selected on the actual local Helper
page, with desktop/mobile default, configuration, gear, rotation-guide and combat checks
passed. All 819 web tests pass. Production is unchanged; this does not assert global optimality.

Hunter BM now has accepted fresh confirmation: **905.72 DPS / 40,000 fights**, with a
0.15023% conservative retained-contender gap, passing both owner2% and original1% checks.
The all17-slot/pair/set/enchant pass measured27,802 configurations/2,928,000 fights; bounded
actual-gear talent/nine-APL/five-pet feedback added520 configurations/308,020 fights. The
selected state is unchanged, so its full gear evidence still applies without another sweep.
Independent raw-source audits and actual selected10k browser/native equality pass. Different
APLs were inspected jointly; not every rotation received separate fresh40k confirmation.

Marksmanship's actual-class A4/Greater20 bridge also passes: the legacy12 model reproduces
its previous inputs, Greater20 adds exactly8MP5 without stacking, and four new diagnostic
origins/40,000 fights measure896.1319 versus898.2924 DPS on the fixed build. These are inspected
diagnostics, not its fresh final qualification. MM full gear work now measures55,125new
configurations/5,795,040fights across two finite all-slot/pair/set/enchant sweeps, accepting
a1.355% gear improvement before the small-gain stop. Its1198-configuration/486640fight
talent/fourteen-APL/sixpet-or-no-pet review retains7/40/4/Cat/Aimed-then-Sniper. Strongest
inspected alternate is+0.9472%, below the1% material threshold. Independent complete source
audits and all native/WASM controls pass. Fresh two20k confirmation accepts910.6219DPS/40k;
conservative retained gap0.995878% passes original1% and owner2%. Independent confirmation
audit, selected inspected10k native/browser equality and qualified export all pass. SVbridge
and independent audit pass, with legacy/GreaterDPS both868.377 in this scenario. SVfinite
gear/melee-state work is underway; it finishes before
the owner-authorized combined Hunter UI verification and commit→push→production rollout.
Current BM/MM/SV defaults and production references remain unchanged.

The owner requested that every DPS receive Moonkin Aura, Leader of the Pack, Trueshot Aura,
Battle Shout, Strength of Earth, Grace of Air and Windfury. This experiment changes only that
coverage, preserving each deployed build's gear, talents, APL, race, consumables, other buffs,
debuffs and encounter. It therefore measures within-build buff effects, not a standardized
cross-class tier ranking. The separate question about normal stat buffs such as Kings remains
open; no answer is assumed.

## Measured effects

Both columns use the same two explicitly inspected 10,000-fight ranges: **20,000 fights per
setup**, not the older public reference's 40,000-fight samples. Minor differences from the
website's old numbers are expected. No blanket multiplier was used.

| Class/spec              | Old setup DPS | Seven-buff setup DPS |    Change |
| ----------------------- | ------------: | -------------------: | --------: |
| Warrior Fury            |        838.01 |               838.05 |    +0.00% |
| Warrior Arms            |        802.51 |               802.58 |    +0.01% |
| Warrior two-handed Fury |        735.31 |               735.38 |    +0.01% |
| Rogue Combat            |        661.25 |               662.16 |    +0.14% |
| Rogue Mutilate          |        647.17 |               648.38 |    +0.19% |
| Rogue Subtlety          |        613.28 |               614.35 |    +0.17% |
| Hunter Beast Mastery    |        863.44 |               903.25 |    +4.61% |
| Hunter Marksmanship     |        853.65 |               896.13 |    +4.98% |
| Hunter Survival         |        786.14 |               868.38 |   +10.46% |
| Druid Feral DPS         |        653.23 |               741.25 |   +13.47% |
| Druid Balance           |        573.83 |               573.83 | unchanged |
| Mage Frost              |        572.16 |               572.16 | unchanged |
| Mage Fire               |        650.27 |               650.27 | unchanged |
| Mage Arcane             |        659.53 |               659.53 | unchanged |
| Warlock Demonology      |        830.09 |               836.09 |    +0.72% |

The Warrior differences are tiny and below the conservative uncertainty estimate; do not
present them as meaningful improvements. Rogue differences are also well below the agreed
2% first-pass tolerance. These values are measurements of the existing builds, not maxima
after reoptimization. The two explicitly opt-in provisional-proc Warrior variants are separate
from these standard presets and have not been requalified here.

## Checks and provenance

- Eight focused actual-input tests pass: all 15 publications and real item/enchant projections,
  unchanged player/encounter inputs, duplicate prevention and rejected invalid derivations.
- Thirty actual native/WASM detailed controls pass: 750 native and 750 browser fights, full
  player/pet/resource equality, actual stat responses. No game-engine file was edited.
- Two bounded model-specific studies completed with **60 new native requests / 600,000 fights**,
  zero imported/reused measurements, and exact saved-measurement replay. Seeds `77191` and
  `177191` are explicitly inspected exploration ranges, not fresh final holdouts.
- An independent audit replays all 60 raw admissions, request identities, model bindings,
  pooled means/variances and report rows, plus all 30 detailed controls. Four audit tests pass,
  rejecting missing specs, changed results, wrong labels/requests and false fresh/BiS claims.
- Scoped lint/format and `git diff --check` pass. Executed source/verifier files are frozen.

Artifacts are under `artifacts/forever-simulator/optimization/raid-core-recheck-v1`:

| Document          | Semantic SHA-256                                                   |
| ----------------- | ------------------------------------------------------------------ |
| `controls.json`   | `eea14bfca16de89eae7ce88fd2b2b37c8cf5c89c187cecf41cba78c56ebb9214` |
| `comparison.json` | `9159a783ab47632649d965fd640f704c4f586929b2126f0350fd5b18063364de` |
| `audit.json`      | `0ad59c0105acc4a8522ee9cfa60ce164e5b6c4316877032ab1ef338b282a8e2c` |

The physical-source study identity is
`0f71d17d57e73fc5d94e9f6583702052f7fab0698aab97d4f28adfe1ef3bf5a3`,
result `72fbecc78f10d0d0ca5580b61ded1755c7ba054dc6e0e59eb6022d07dc58ad35`.
The Greater-Mageblood-source study identity is
`f0cbbb38dc1ba00ae06df72c363ee6f89b19912842f436d8bff28c4ceba32581`,
result `cd783dc52d372620645d1e52000554990e85c6ea29afd04a79b656a422ae778d`.
Different models and altered combat inputs never share numerical cache entries.

## Follow-up, not completion

Prioritize Feral and the three Hunter specs for bounded all-slot and talent/rotation feedback,
then recheck the smaller changes without restarting exhaustive talent grids. Retain proposed
contenders from earlier work, but remeasure changed contexts rather than marking items
globally “already tested.” Independent qualification and real library/default/UI delivery are
still required before these become new public presets.

### Feral model and consume bridge completed

The existing Feral preset has **no Mageblood**, not legacy 12 MP5. A separate, genuine
class-1 Feral comparison now tests the verified non-raid Greater Mageblood Elixir on the
existing immutable A4 model. All 2,591 original item records and enchants are unchanged;
the eight additional Mage items do not change its equipped data. Neither model was edited.

Two actual native/WASM controls pass full player/pet/resource parity. The no-consume A4
control exactly reproduces the original M81 control and effective stats. Greater Mageblood
adds exactly 20 MP5 and changes no other effective stat; the old engine never receives the
new enum, and legacy/Greater values are never stacked.

Four new A4 requests / 40,000 fights, with zero imported origins, give **741.25 DPS without
Mageblood versus 744.25 with Greater Mageblood**: +3.00 DPS / +0.405%, 20,000 inspected fights
per arm. Both no-consume scalar ranges independently reproduce their measured M81 values;
that agreement is checked, not used to relabel old results. Saved replay, a separate audit
of all four raw admissions and nine input/audit tests pass. These are diagnostics, not fresh
qualification or a new BiS selection.

Bridge evidence is in `optimization/feral-raid-core-bridge-v1` under the same artifact root:

- Comparison: `2d023177a8ef8ae7ac1bb81ce8d645a41a02171eb8302554e24a85f9c46237d7`.
- Independent audit: `cf9202a707b0996fc8bad446da95b602b6caaba78687a16a182b6633d928cf56`.
- Study: `b054154653fadd2012431a3566484572f1efd27c408895262d1e96e7326da9ff`.
- Result: `c88b71d4aab6644824113d553cbead2cc0085dec079f0838b75572ba9b66ec82`.

The subsequent fixed-talent/APL gear pass has 11,489 unique proposals across all 17 eligible
slot pools, hands/ring/trinket pairs, complete per-set assignments and compatible non-raid
enchants. It retains low-item-level special cases such as Wolfshead and Manual Crowd
Pummeler. Four additional regression tests and seven actual native/WASM gear controls pass
(175 fights per engine), with full player/pet/resource parity. The existing finite two-sweep
policy, six workers and 40,000-origin safety cap bound this new-context pass. Talent/rotation
feedback and fresh retained-contender confirmation still precede any new preset delivery.

The actual sweep has now completed: **12,231 new configurations / 1,592,620 fights**, one
full 24-group sweep followed by exact saved-measurement replay. The current gear remains
selected: 744.29 DPS versus the inspected combined leader's 748.16, a 0.52% gain below the
existing 1% material-change threshold. These are 10,000-fight inspected selection values,
not fresh final validation. There were no imported old-context journals; 374 exact requests
were reused within this same study across groups. Selection SHA:
`3bf590f6d635718cc94f84cebe55ee7823863d0313cdaf8a6c68149be05cac93`; result SHA:
`f5d4bf605d33cdf3e64fe8de528a7beaf6fdade5ed6d0cbe258fadc1016a6e66`.

The next finite actual-gear state pass retains the earlier high-precision talent roots,
legal current one-point neighbors, and joint Cat APL/Tea/Rune alternatives, including an
explicit remeasurement of every historical retained state among inspected finalists.
Five preparation tests and three completed-gear integration tests pass. Full gear-source
replay and six actual native/WASM controls pass (150 fights per engine, full unit/resource
parity). The bounded actual state search completed **558 new requests / 280,700 fights**,
starting from 326 initial talent/conjured candidates, five historical talent roots and ten
distinct retained states from twelve old arms. Full saved replay and a separate replay of
all state origins, controls, packed stages and selection pass; three additional negative/
integration tests pass. This is not a restart of the full blue talent grid.

It selected `050022-45010032021030212051-055`, moving one point from Blood Frenzy to
Nature's Reach, with five-combo-point Rip and the 60-energy shifting policy. Rune stays
selected. The inspected 10,000-fight result is **752.11 versus 744.29 DPS**, +1.05%.
Because this is a material state change, a focused retained-gear applicability check is
required before fresh independent confirmation; the current result is not yet a qualified
public preset. Old top gear challengers are proposals, not reusable changed-context DPS.

State study: `00186ca37797b13afb6c90a40df1a1304c8562b3a825868509c016365c84c6bd`;
result: `89141bf23de4429e33b6701db35726b868fa643f0b03e7de321bbbe81067f149`;
selection: `15ed04cd8e2ce1703917421de50260200651c3f4c90ab83702a1e28f03817daf`.
All executed state sources/readers are frozen. No public preset has changed.

### Focused gear applicability closed

The new state received a finite retained-gear check rather than another full pool restart:
94 prior top proposals across all 24 group families, measured combinations and all 17 earlier
high-precision finalists. All were remeasured under the new talents/APL; old-context DPS was
not imported. Five proposal/input tests and seven actual native/WASM controls pass.

The study completed 300 new requests / 414,520 fights, with exact same-study reuse and full
saved replay. A separate reader replays every raw origin, packed stage, control and selection;
three additional integration/negative tests pass. Gear remains unchanged at inspected
752.11 DPS; the inspected leader is 756.32 (+0.56%), below the existing 1% material threshold.
The selected input exactly reproduces the completed state result, so applicability is closed.
This is retained-only current-context coverage, not a new all-pool sweep or global 2% proof.

Study: `9f8d843ebadef89d4aa8228ac0fd10f7477cf3faaf82f823f537ad979385d7cc`;
result: `121cd041ef3d296abef3998ea55eed60ce5cd7dc89665450d577ae259fd1bc7e`;
selection: `5110bbc02979ecc3a4fee86560653021ac1a72568ccc2dfd1869b37ba42656d3`.
Two fresh independent 20,000-fight ranges per retained arm, followed by selected UI/default/
guide delivery, remain mandatory. No final validation or public promotion has occurred yet.

The new applicability driver also passes an actual completed-run CLI replay: zero new native
jobs, the same stored semantic receipt and byte-identical result-summary content. This fixes
invocation-metadata/idempotence handling for the new driver without rewriting old frozen
sources or evidence. Operational replay is not fresh statistical validation.

### Fresh independent Feral confirmation accepted

The selected build and eleven genuine measured alternatives were frozen before two new,
disjoint 20,000-fight ranges per arm. The actual batch completed **24 new requests / 480,000
fights**, with no imported/reused numerical origins. Its selected reference is **752.0645 DPS
over 40,000 fights**, not the earlier inspected 10,000-fight value.

The largest conservative retained gap is **0.69846%**, passing both the owner's 2% practical
limit and the original 1% assessment. Strict retained dominance does not pass: the gear
alternative averages +4.55 DPS and the enchant alternative +2.94 DPS. These small gains
remain disclosed; the selected build was not replaced after seeing the holdouts. No global
optimality or live-server-mechanics guarantee is inferred.

All 24 raw admissions, packed stages, frozen-plan identities, statistics, source bytes and
range ownership pass a separate replay; four input/plan tests plus three fresh-source tests
pass, as do scoped lint/format/diff checks. Reserved ranges are 100,000 seeds wide, but only
20,000 fights were measured per arm/range—precision is never relabelled.

Study: `8a7e0a6aee6b9541ce7937847eed945c2f68aebf384b1fcb86e283d914c59ece`;
result: `bbbdecab12ffeb0027795e2b69ee7108fdc6b1325b4be80c6dd29ab756a4ec89`;
summary: `6d9cc23ad8d0a8320ca2e6eea6827cfb8d18134df6dd0707c40071d69d875312`.
Range context: `6eecbeafd14567592521943da0358074155a6dceb770637ce3cb42c66644675e`;
seeds `1861009171200000` and `1861009171300000`.

Actual A4 selected-browser parity, qualified export, preset/config/gear/rotation-guide updates
and real desktop/mobile UI review remain required. No new preset selected or deployed yet.
Original first-pass results/clocks remain unchanged; this is the additional post-deployment
raid-context revalidation.

The Feral setup already has all normal stat buffs listed in the pending question, so that
question does not prevent this controlled pass. Actual running handles and recovery status
remain at the top of `context.md`.

The original all-class scope remains active: remaining Warlock, Priest, Shaman, Paladin and
optimized tank work is not completed by this diagnostic. Original class clocks/correction
history were not reset. The live application remains the previously verified `91b06f5` release.
