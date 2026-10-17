# Remaining simulator catalog coverage

The public all-slot expansion is live, but an all-slot catalog is not proof that every usable
pre-raid item has been admitted. Do not describe the current search as global, exhaustive BiS.

## Weapon-source parity verified, October 17

Current runtime UIe14/native3dde/DB029b correctly preserves vendor-observed weapon damage.
The raw source catalog is build69893; the pinned in-game vendor captures are build69913. Six
raw weapon ranges disagree, but `compile_forever_equipment.py` explicitly takes exported values
through `import_forever_vendor.weapon_fields`. All18 exported weapons match their observed
minimum/maximum/speed exactly in the compiled database. The entire served UI database also
matches that compiled database, HTTP200. No correction or numerical restart was needed.

| Item ID | Raw catalog damage | Compiled / observed damage | Speed |
| ------- | ------------------ | -------------------------- | ----- |
| 272594  | 88–133             | 53–80                      | 1.80  |
| 272595  | 142–214            | 85–129                     | 2.90  |
| 272599  | 142–214            | 85–129                     | 2.90  |
| 272603  | 147–222            | 109–165                    | 3.00  |
| 272681  | 96–178             | 64–119                     | 2.90  |
| 272683  | 66–123             | 44–82                      | 2.00  |

Actual isolated Chromium tooltip checks for all six IDs show the compiled/observed ranges,
with zero page errors and no combat requests or equipment changes. Immutable manual receipt
`optimization/reviews/weapon-vendor-parity-44776d1fe9813199.json` pins source bytes, native binary,
DB and all18 comparisons. These checks confirm the existing pinned model, not current server
values or that every non-exported weapon is observed. The raw ranged values match the two-hand
table, while the pinned ranged table matches the three observed ranged weapons; that explains
why raw-catalog formula agreement alone would not validate runtime damage.

Future guide adapters must take simulation values from the exact compiled database linked by
the reviewed case, joining acquisition metadata separately. Copying raw catalog weapon fields
into recommended-item tooltips would reintroduce these six discrepancies. Keep capture/build
provenance visible rather than relabelling old observations as live-server verification.

## Current local admission, October 17

The 26 reviewed recoveries are now admitted LOCAL ONLY. Current UI `21a0ef96934be4ef740d6de4` has
2,591 items: 1,954 current-stat and 637 historical references. Blackhand13965 and Eye13968 now
have partial readable current effects:1% passives replacing old2%, and20s/CD300s uses. Their
missing base metadata, acquisition, empty scripts and Blackhand Orc/Ogre doubling remain
unverified/unmodeled, explicitly labelled. See Drakkisath proof5082090688c48977 and owned
drakkisath-trinkets.mjs/Go helper/tests. These two are not counted as complete current items.
Current native3dde1e2b…/DB029bd1e5… supersede the MCP freeze;181 Node tests, strict TypeScript,
22-page build and five-profile browser catalog smoke pass. No optimized defaults promoted. The public
r15 engine remains at 2,565. The staging sections below are the historical research trail;
they do not describe the current admission status.

Owned `infra/simulator/current-prebis-equipment.json` pins the reviewed candidates, blocks and
raw/compiler/set/faction evidence. The shared loader checks all raw snapshots, table counts/
hashes, ratings and historical identities before renormalizing; the pure merge rejects evidence
drift, raid sources, unknown IDs and conflicting existing values. Current stats, metadata and
historical acquisition are separate facts. Provisional source fields follow candidates into
optimizer eligibility, tooltip warnings, independent reviews and portable exports.

IDs9394/9419/18760 remain blocked. Cape10776 root/snare utility, set548 Gouge and six unsupported
D1 proc thresholds are disclosed, not assigned invented damage. PvP22879/23258 keep current
set0;23298/23313 keep548. Their historical Horde/Alliance access is an explicit provisional
source model, not a verified client faction wearer flag, server vendor or displayed rank.

Run `pnpm simulator:prebis:verify-current`. Receipt
`optimization/current-prebis-browser-6610123df8eac186.json` records the fresh raw-evidence check,
exact compiled equality and actual browser/native Rogue/Warlock/Hunter fixtures on the earlier native SHA
`f59e2df32f80ccdfb6aac7214c4698a378ba443f51f39111013ec1bc9b353615`, database SHA
`aacabaeeb0be7bd8b241373d5372f3ad3a86cbef6d2af69e80f2e2b868523048`. These integration fixtures
are not recommended equipment or optimization results. The five-profile catalog browser smoke
also verifies tooltips/search/equip/reload/combat and incompatible PvP faction rejection. All
177 Node tests and strict TypeScript pass. Current native5eaf/MCP proofb6864d11c2d38029 and mana
proof7c164627c5dc2557 supersede the local runtime; catalog data is unchanged and the five-profile
browser smoke still passes. Old integration proofs remain original-engine-specific evidence.

Old native/DB/UI/exports are preserved. Existing candidate coverage must be revalidated, not
relabeled. The actual four archived Warrior cases each have20 newly eligible recovered IDs;
all four current coverage checks correctly reject the old reports. Arms includes two-hand9408;
Fury instead permits9401 in either hand. All four Rogue PvP IDs remain ineligible for Warrior.
Canonical fixed-blue controls still point at the old DB and are preserved. New immutable
version-aware references and guarded current-browser recapture are implemented; current-catalog
Arms feedback is being restarted with a new identity after correcting the verified MCP model bug.
No new public defaults or
deployment are included in this local admission.

## Current-client omission audit, October 17

Read-only artifact `optimization/catalog-current-gaps-0902bab96c450e2f.json` records 29 items
that have both current-client stat records and reviewed historical non-raid acquisition, but
are absent from the simulator database. Its inputs are the checksummed 70425 mechanics snapshot
`b52b73d2…`, the pinned Classic equipment reference and the actual current database. Nothing was
added to the active database or running optimization.

The omission is deliberate protection against obsolete stats: `mergeClassicPrebis` refuses a
Classic fallback whenever a current Forever record exists. That guard is correct, but a separate
current-value import is needed to recover these candidates. Examples include Beaststalker's
Bindings 16681 and Lightforge Belt 16723, both also missing from the imported example builds.

26 have no linked ItemEffect rows. They still need current metadata, stat, set and acquisition
validation; effect-free does not mean approved. Necromantic Band 18760 additionally contains
HealthRegen (item modifier 46), which the existing 44-stat equipment compiler does not support.

Three had linked effects requiring explicit review; the cape's passive utility is now resolved
in the separate staging path described below:

| Item                      | ItemEffect row | Spell   | Finding                                                             |
| ------------------------- | -------------- | ------- | ------------------------------------------------------------------- |
| Horned Viking Helmet 9394 | 98478          | 22641   | Reckless Charge, on-use, 30-minute cooldown; triggers 13327.        |
| Galgann's Firehammer 9419 | 98539          | 1293980 | Equip proc triggering Firebolt 18083; cadence/model not approved.   |
| Silky Spider Cape 10776   | 233785         | 1293819 | Two -7% snare/root-duration modifiers; utility, not generic damage. |

Snapshot `effectIds` are **ItemEffect row IDs**, not spell IDs. Resolve ItemEffect.SpellID
before looking up SpellEffect/SpellName. A direct lookup by the row ID falsely appears missing.
These findings use the existing checksum-verified mechanics capture with manifest
`89ab45e5…`; no external scrape or new extraction is needed.

Raw ItemSparse metadata was located for all 29. None has a profession or required-ability lock;
race masks are unrestricted. Four legacy PvP leather items (22879, 23258, 23298, 23313) carry
class mask 8, so they must not become unrestricted Warrior candidates. Preserve unique limits,
item sets and source faction restrictions. Galgann's current inventory type is main-hand-only,
not the historical one-hand metadata. The existing acquisition source remains historical,
not a confirmed Forever drop location.

## Implemented staging command

Run `pnpm simulator:prebis:stage-current` from the repository root. It accepts no output,
snapshot or publication overrides. It verifies the current normalized snapshot, mechanics
manifest, raw ItemSparse and linked-effect table checksums/row counts and level-60 combat ratings. The current rating
coefficients must also match the engine's captured table. Historical acquisition is revalidated
against all 839 exact records in the pinned source database; historical stats are never copied.

The original result is `optimization/staged-current-prebis/current-prebis-92fe9f39504a09ce.json`:
26 staged candidates, three explicit blocks (9394, 9419, 18760). That immutable report predates
the local admission above; rerunning staging after admission does not overwrite it. Current class masks, unique flags, weapon hands and set
membership are retained. Missing current set membership clears stale historical membership.
Each applicable set/vendor-access review and provisional acquisition warning remains attached.

Independent receipt `staged-current-prebis/compiler-parity-15709babc53c4dd5.json` proves all
26 gameplay objects match the existing upstream Python equipment compiler exactly. All25 prior
candidate/provenance objects are unchanged; earlier stagef9bdd… and parity9c1… remain archived.
Compiler agreement is not proof of set/proc runtime behavior or current loot.

Silky Spider Cape10776 is now staged with explicit utility evidence, not silently stripped of
its effect. Checksummed ItemXItemEffect/ItemEffect rows connect233785→1293819; two SpellEffect
rows apply-7% duration to mechanics7/11 on the wearer. Exact passive equip/cooldown/condition
fields, absence of proc options and static target/scaling payloads are verified. Its normalized
stats remain10 Stamina/30 armor. `effectReviews` retains the unmodeled utility and limits zero
combat contribution to a stationary encounter without root/snare mechanics. Adoption still
requires utility disclosure; this does not claim its crowd-control behavior is simulated.

Repeated execution verifies an existing content-addressed report instead of overwriting it.
A preset-only acquisition record initially produced an explicit undefined optional source
field, which JSON omitted and immutable replay rejected. A regression test failed before the
conditional-field fix and passes afterward; actual CLI replay now passes. Two additional utility
regressions fail before/pass after, including changed/on-use/proc/dynamic/conditional negative
controls. Twelve focused staging tests and the complete157-test simulator suite pass. No active database, native binary,
browser release or frozen Arms input was changed by staging.

### Set-runtime limitation found during review

The current generated ordinary-set adapter overrides manual named-set handlers whenever a set
ID has a generated definition. Its D1 sets181–189 represent flat bonuses but mark their five-piece
proc thresholds unsupported. Consequently, the manual five-piece handlers in
`sim/common/item_sets/dungeon_set_1.go` are not proof that these procs execute in Forever:
`GetActiveSetBonuses` skips them after the generated override. Valor189, for example, applies
its two-piece resistances/three-piece Strength but not its five-piece Warrior's Resolve proc.
Do not approve runtime coverage or global optimality from the presence of a manual handler.

Before claiming complete D1 model coverage, explicitly reconcile the current-client thresholds
and engine dispatch, validate proc payload/cadence and prevent double-counting flat bonuses.
Keep unverified cadence provisional. Set548 follows a different legacy named Rogue handler;
its current stat thresholds have now passed the focused review below, with utility still scoped out.
This read-only finding does not alter the frozen experiment, activate fallback effects or claim
that any particular untested set will beat its selected gear.

### Reviewed Rogue PvP stat thresholds

Receipt `staged-current-prebis/set-runtime-3c01e421bac195c8/review.json` connects the current
set548/SpellEffect/SpellAuraOptions records to the actual registered engine callbacks. The
checksummed client rows give40 AP and40 RAP at two pieces and20 Stamina at six, matching
`sim/rogue/items_sets_pvp.go`. There is no generated set548 override.

Owned regression `infra/simulator/current-prebis-sets_test.go` ran through an isolated Go
`-overlay`, without changing engine files. All seven zero-through-six-piece fixtures pass:
the two/six-piece stat blocks appear exactly once, never below threshold, and the four-piece
callback adds no fabricated stats. The receipt records source hashes and the reproduction
command/working directory. Its synthetic set-count fixtures test dispatch and stat callbacks,
not complete equipment, combat performance or current availability.

The four-piece spell23048 reduces Gouge's cooldown by one second in the client; the engine
callback is a no-op. This is explicitly unmodeled utility, with zero contribution only in the
stationary damage scenarios that do not use Gouge. Do not describe it as full PvP set support.
Staged23298/23313 retain Rogue class mask8/proto6 and current set548. Horde22879/23258 still
have current set0, not their obsolete historical set522. No candidate has been admitted and
historical vendor/faction access still needs its separate review.

Run the exact command in the receipt from its recorded working directory to reproduce the
focused Go check. Its overlay paths are local; re-create them if the repository moves.

### Historical PvP faction-access review

Receipt `staged-current-prebis/pvp-access-542b9d68eaddb39b.json` cross-checks the installed
AtlasLoot Classic PvP faction groups and set-membership tables against the pinned vendor
records. Historical22879/23258 belong to the Horde group;23298/23313 belong to Alliance.
The source file hashes and exact item/vendor/set relationships are retained. An eventual
provisional-access import must restrict its acquisition sources accordingly, not treat all
four items as faction-neutral because the current race masks are unrestricted.

Current wearer data still wins: Rogue-only class mask8, Horde set0 and Alliance set548.
The stored `RequiredPVPRank` values12/14 are raw client indices, not a claim that these require
displayed ranks12/14 or that the current Forever honor/vendor unlock has been observed.
No historical stat, set membership or displayed rank may overwrite current metadata. These
are reviewed historical access assumptions, not confirmed Forever vendors; no items were admitted.

### Mana-proc integration, local only

The three reviewed models below are now installed through the SAME guarded installer in both
native and browser preparation. Local native5f67aa508b8263496307c4f636d9d6b586c61d9afbc6ddbde83e9f26f3465b23
and UI45fc7e86c7768fbd7b4a08a2 include the fix and matching support-query behavior. All22 pages
build; no items/stats changed (same2,565-item DBb11f…). New runtime/model files and evidence
dependencies are fingerprinted. No production deployment or new public recommendations.

`pnpm simulator:prebis:verify-dungeon-mana` executes three non-optimized five-piece fixtures in
the actual browser and native engine, then sends each exact captured request to archived62fe.
Receipt `optimization/dungeon-mana-browser-27455b6a7d86c7a4.json` proves native/browser DPS
agreement and positive mana recovery for each new model, versus no recovery in the old engine.
Item/enchant/revision/DB guards prevent non-equivalent data comparisons. The verifier hash is
recorded; old646447… proof is retained. This is execution parity, not a simulated-BiS result,
measured DPS gain, or independent server proc verification. The client text explicitly describes
spellcasts for Magister/Devout and melee/ranged autoattacks for Beaststalker.

`pnpm simulator:prebis:stage-dungeon-mana` verifies the70425 snapshot, raw SpellEffect and
SpellAuraOptions checksums, current set identities/thresholds and the exact existing handler
source. It stages an isolated Go overlay; there is no apply/output override and it does not
rewrite the active source, native binary, database or UI release.

| Set             | Client five-piece payload       | Local dispatch         |
| --------------- | ------------------------------- | ---------------------- |
| Magister181     | 5%,200 mana, spell450527→450554 | Restored and Go-tested |
| Devout182       | 5%,200 mana, spell450576→450554 | Restored and Go-tested |
| Beaststalker186 | 5%,200 mana, spell450577→450554 | Restored and Go-tested |

Initial receipt `staged-dungeon-mana/1bdb498b89c30906/review.json` preserves all input/source hashes,
original/corrected exit codes and checksummed logs. The regression fails on original dispatch
in all six5/6-piece cases, then passes the corrected overlay: actual200-mana recovery, valid
and invalid event types, missed-autoattack rejection, four-piece negative controls and no
duplicate flat/MP5 bonuses. Adjacent ordinary-set/core mana tests pass with the same overlay.
Completed replay verifies staged source/overlay/log bytes without rerunning or rewriting proof.

The current validator also pins self-targeting, effect indices, radius/class masks and every
resolved static/dynamic coefficient on both the proc aura and energize payload. A new regression
failed before the stricter checks and passes after; altered targets, scaling classes, resource/AP
coefficients and group/PvP multipliers now fail closed. The real checksummed client rows still
pass, and the original/fixed Go overlay regression was rerun successfully for the new receipt.
The earlier `ce34347abbcc95bb` receipt remains archived. New staging proof7c08e0f408a15871
explicitly restores original dispatch AND support-query files in its before overlay, even when
the active checkout is already corrected. The after overlay and installed-source Go checks pass;
162 Node tests and10 focused mana tests pass. This is model evidence, not live-server verification.

The other six D1 proc thresholds remain gated. Dreadmist has a visible5% heal payload but has
not been added to this mana-only patch. Shadowcraft, Wildheart, Elements, Lightforge and Valor
have scripted ProcChance100 records; those do not establish a100% chance, PPM or internal
cooldown. Existing manual rate assumptions must remain provisional. Lightforge/Elements list
client mask81924, whereas the manual handlers currently split melee-only/spell-only triggers;
Valor's client mask4 also needs comparison with the manual all-melee trigger before enabling it.
Do not expose those dormant handlers merely because their spell IDs exist.

Both Arms cases closed on the earlier62fe engine before integration. Preserve those exports and
the exact archived binary; a25-iteration unchanged Arms smoke does not replace fresh affected-case
review after data/model changes. Recovered-item admission is now covered above; affected-case
revalidation remains next. The mana fix alone does not complete all set models. Run direct
Go checks sequentially after source generation; concurrent generation can invalidate file reads.

## Required admission sequence

1. Preserve the closed Arms experiment's exact evidence; do not relabel it for the new engine.
2. Review the staged current stats and weapon/armor values; never restore historical numbers. Check
   level-60 rating coefficients, AP/RAP, separate base/bonus armor, damage-only versus healing,
   school-specific power, class/hand restrictions, unique limits and current set links.
3. Keep unresolved health regeneration and item procs gated. Review utility effects explicitly,
   rather than silently dropping a field or treating a proc as unconditional damage.
4. Stage the new catalog and provenance separately. Integrate only reviewed records, verify
   the native/browser engine and enumerate newly eligible candidates for each completed case.
5. Rerun affected gear/talent feedback before publication. Existing coverage gates intentionally
   reject newly admitted, untested candidates. Do not edit old evidence to claim they were tested.

Warblade of Caer Darrow 13982 is a different gap: its pinned Classic source lists quest 5466,
but the current mechanics snapshot has no item record and it is not in the admitted historical
non-raid archive. Blade of Hanna 2801 has current values and an ItemEffect row 238936 mapping
to Improving Form 1325535, but its acquisition/runtime model is not approved in this library.
Neither is automatically imported from a foreign example's gear identifiers.
