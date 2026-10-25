# Hunter dungeon-upgrade recovery

## Current full-raid delivery status — October 25

The three fixed primaries passed independent numerical replay and export. Candidate
`29d2a2c67bc4922af0cef622` now passes the strict 822-source UI build, all 3,499
file checks, 40 desktop/mobile UI checks, two saved-character checks and six actual
25-iteration UI comparisons against the existing native controls, including full
owner/pet/target metrics. Current-host completion/error/cancellation/privacy checks
also pass. No fresh holdout, seed, engine asset or measured setting was changed.

The actual application preview is
`hunter-full-raid-v2/profile-preview-0cfc9af764695d74`. Its desktop/mobile build
selection, displayed DPS, exact rotation guidance and saved selection/reload pass.
All 59 focused/shared web tests, full web TypeScript and scoped lint pass.
Final integrity validation `profile-delivery-validation-f8834cf631812d7d.json`
passed with **50,638 source/evidence pins**. Hunter was selected locally at
**2026-10-25 02:33:36.946 UTC**, before its original 05:03:16.065 UTC deadline.
Only the Hunter entries in `profile-model-updates.json` and `published-reviews.json`
changed; all other entries were preserved. Rollback copies and the receipt are in
`hunter-full-raid-v2/local-selection-b155a5e1-599d-445a-8a1e-892479bcc6b5`.
No commit, push or production deployment was performed. Arbitrary seventeenth-debuff behavior remains unqualified.

The complete UI-control and host reports each retain approximately 11 MB of source
provenance. Runtime summaries preserve the exact verification fields and bind the
complete reports by checksum, while avoiding roughly 22 MB of provenance reads per
page. Two source-backed projection regressions pass; the original reports remain
intact. The existing read limit was not increased. The first failed application
preview is preserved separately. The 26 Node contracts cover presentation/export
binding, encounters/codecs, evidence names/projections and selection merging;
the 59 web tests cover builds, profiles and shared publication readers.

| Selected build | Fresh reference DPS | Fresh samples |
| --- | ---: | ---: |
| Beast Mastery · Raid | 918.970607 | 360,000 |
| Marksmanship · Raid | 922.368667 | 400,000 |
| Survival · Raid | 883.431243 | 400,000 |

These are the unchanged full-raid fixed-primary results, not a new cross-class
ranking or a claim of global optimality. The 25-iteration desktop/mobile fights
only verify delivery against existing controls and do not replace those samples.

## October 24 storage recovery

The first geared-feedback owner db097535-8902-4fb2-9331-c69209124960 completed
the Beast Mastery selection and Marksmanship's initial category controls, then
exited at the next study's **5-GiB free-space guard**. No guard was weakened and
the failed owner remains recorded.

Go's regenerable compiler cache occupied 11 GB. Clearing only
/Users/dimitarjilanov/Library/Caches/go-build with the toolchain's
**go clean -cache** recovered free space from about 4.2 GiB to 15 GiB. None of the
34,852 previously protected source/evidence paths pointed into that cache.
Catalogs, compiled qualification binaries, WASM, captured controls and numerical
records were not deleted.

The exact supervised state-recheck command resumed as owner
b6f408eb-29e0-40b7-b535-069d3742b063, supervisor 82951 / producer 83159. Its command
SHA-256 remains
3749228880fe4561356c4458939ade1a762a39e6e2a80ce1c13e4ec39fcb7997.
The class start and deadline remain October 24 05:03:16.065 UTC and October 25
05:03:16.065 UTC. Existing measurements are replayed by the normal source gates;
no seed reservation or correction allowance was added. The live log is
feedback-owner-after-cache-reclaim-20261024.log under hunter-dungeon-upgrade-v1.
All-three completion, independent final confirmation and delivery remain pending.

## Catalog and qualification

Base **Beastmaster Armor, set 515**, is absent from the catalogs in the
[dungeon-set audit](simulator-dungeon-set-catalog-audit.md). Its eight pieces need
their own current-client mechanics and acquisition review before Hunter item
comparisons can claim complete pre-raid coverage.

| Work                                           | Evidence                                                                                                                                | Status                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Recover the eight base pieces                  | Current 1.60.1.70532 definitions, sparse metadata and exact membership                                                                  | Implemented                          |
| Separate the same-name alternate set           | Base 515 and alternate 1669 have distinct IDs, members and bonuses                                                                      | Implemented                          |
| Review base-set spell payloads                 | Exact thresholds, proc mask/chance, mana amount, attack power and armor                                                                 | Implemented                          |
| Recover four individual pet effects            | Item links, parent triggers, child effects, durations and range                                                                         | Implemented                          |
| Prepare item stat drafts                       | Eight drafts retain all four separate effect requirements; no catalog writes                                                            | Implemented                          |
| Recover item/quest reward associations         | Same-TOC baked item records corroborate all eight pieces and sixteen class/faction associations                                         | Implemented                          |
| Corroborate reference reward delivery          | Four preserved records plus four indexed Forever reward sections cover all eight milestones; quantities/live delivery remain unverified | Reference coverage implemented       |
| Implement and regression-test runtime behavior | Base-ID dispatch, mana proc, four pet effects, range, expiry, lifecycle and Hunter bonus-armor dependency                               | Implemented in an isolated workspace |
| Prepare complete candidate catalog and set domains | 2,687 items; all three published styles include every one of the 247 two-to-eight-piece subsets and mandatory full-set comparison | Implemented |
| Qualify a Hunter native/WASM release           | All 25 corrected native/WASM controls and six parent comparisons passed; original failed v1 evidence preserved                           | Controlled admission implemented     |
| Run item-by-item and set comparisons           | Actual supervised study completed: 195,905 origins, 24,385,780 iterations, all three styles stable                                        | Numerical study completed              |
| Authenticate completed gear evidence            | Exact successful command, complete controls and independent replay of all 707 stages and all admitted origins/iterations                 | Actual positive replay passed |
| Compare five consumable coordinates            | Food, Blasted Lands buff, flask, alcohol and mana-regeneration elixir; 81 typed derived controls                                          | Implemented; proposal checks passed  |
| Recheck geared talents, APL and pets            | Three current-model style banks; 1,509 effective proposals covered by 75 typed controls                                                  | Implemented; proposal checks passed  |
| Close consume, gear and state feedback         | Four-pass bound, fixed-scenario guard, complete incumbent-tie composition and open caps/cycles                                           | Completed for all three styles |
| Supervise three-style feedback execution       | Exact completed-gear path, independently replayed parent and 116 first-style native/WASM category controls passed                         | Actual owner completed all three styles |
| Authenticate completed three-style feedback    | Latest successful command, exact parent/domain, every saved control and full sealed-stage replay; 14 source/supervisor contracts           | Actual positive replay passed |
| Prepare every retained finalist for fresh confirmation | Exact per-selector request reconstruction, original-seed provenance, explicit inspection alignment and lossless fixed-width batches; 18 contracts | Actual positive source passed |
| Execute alignment and fresh 2%/1% confirmation | Ordinary supervised confirmation owner, sealed alignment replay, complete RNG claims and fixed holdout execution; 17 contracts | Actual supervised alignment and fresh confirmation completed |
| Independently authenticate completed confirmation | Latest successful owner, full parent/alignment/holdout replay, exact report projection and original claims; 14 contracts | Actual positive replay passed |
| Independently confirm and deliver              | All three fixed primaries independently exported; matching UI and application/library checks                                         | Source passed; corrected UI built, browser delivery pending |

The preparation itself starts no Hunter numerical optimization or publication.
The subsequent supervised control job started the class clock as recorded below.
The corrected release admits the bounded Hunter gear study. Its completed gear
source has passed independent replay; feedback, fresh confirmation and public
presets remain unqualified. The frozen
completed Rogue studies are unchanged. All
prepared Hunter drafts explicitly carry `catalogAdmissionAllowed: false`.

## October 24 corrected admission and gear dispatch

The exact corrective command `2b760426d432fdd5d9344038dc1199013718a97e449c7a5f9c4a16c05c2ed1c7`
completed successfully under run `94b2d992-fa2e-435f-83ab-6f68198ff174` after the
Rogue six-builder owner finished. All 25 actual corrected native/WASM controls
matched with zero DPS difference, including the previously failing no-pet case;
six parent comparisons passed. The saved current admission is
`hunter-full-raid-v2/prepared.json`, semantic SHA-256
`bf52a513de67af573eae4e88dcbf8e6f5f0609792c6577223ad0be13cda6ab64`, byte SHA-256
`72f96db164152a2e4ce57e019e5d159fe68f692b47732a272a109913a9d83846`.
The original 05:03:16 UTC class start and October 25 deadline remain unchanged.

All four current gear-request tests pass against these fresh controls. Actual
gear preflight `c0f2b79fdedc10f64af384fd854255ce5d700ec2c0e64cf72e68e95839939e85`
passed with 198 controls in batches of 64/64/64/6, 27,446 candidates each for
Beast Mastery and Marksmanship, and 27,438 for Survival. Each style retains
28 full-set comparisons. The ordinary gear supervisor completed successfully; its log is
`hunter-dungeon-upgrade-v1/gear-owner-after-controls-v2.log`. Request and preflight
logs are `gear-requests-after-controls-v2.log` and
`gear-preflight-after-controls-v2.log` in that directory. Selection and subsequent
independent source replay both completed before feedback preparation began.

## October 24 completed gear source

The actual owner `462485e9-516d-42aa-a7e4-ca6f7ff7551c` terminated successfully
with exit code zero at **13:42:31 UTC**. All three styles are stable: Beast
Mastery used two passes, Marksmanship one, and Survival four. This initial
fixed-talent/APL study recorded **195,905** original native jobs and
**24,385,780** iterations; it is not final independent DPS qualification.

The canonical completion is
`bounded-native-studies/15ec685cb36a1186f131191d22b8b61620291e2c3cd43b5b9aaf29f565d148ec/completed.json`,
semantic SHA-256
`ef8cb284964804c3087ecf23e5b223e87df41ff9a0cce090cd4bc9aef3002087`.
Its result is `result-57d08f935673a6d8.json`, semantic SHA-256
`57d08f935673a6d8d5af26550af1f85494c502efda2df5f177edc28e9d5badca`.
The original **05:03:16 UTC** class start and **October 25, 05:03:16 UTC** deadline
remain unchanged.

The separate completed-source reader actually passed. It authenticated the
successful command, complete declaration/domain and saved full-unit controls,
then independently reconstructed all **707** stages and all 195,905 origins /
24,385,780 iterations without new numerical jobs. Its log is
`hunter-dungeon-upgrade-v1/gear-completion-source-review-15ec685c-v1.log`.
This admits the exact bounded gear source to feedback; it does not qualify a
public preset, a global optimum or fresh 2%/1% confirmation.

The ordinary feedback preflight passed with this exact canonical completion
argument, **8,641** source pins and another complete read-only parent replay.
Each style has 27 consume and 66 gear controls; state controls are 23/23/29 for
Beast Mastery/Marksmanship/Survival. This preflight executed zero new fights and
wrote no numerical evidence. Its log is
`hunter-dungeon-upgrade-v1/feedback-preflight-after-gear-15ec685c-v1.log`.
The actual ordinary feedback supervisor is now running with that exact gear
completion argument, after Rogue confirmation and Mage's first control owner
terminated. Its original October 25 05:03:16.065 UTC deadline remains unchanged.
It begins by replaying the completed gear source before executing its own
category controls and bounded studies. Output is
`hunter-dungeon-upgrade-v1/feedback-owner-after-mage-controls-20261024.log`.
No completed-feedback or fresh-qualification claim is made while it runs.

The owner has now finished its initial completed-gear replay and all **116**
Beast Mastery category controls: 27 consumes, 66 gear and 23 state controls.
Their native/WASM comparisons passed, and the actual bounded Beast Mastery
consume search has started under study identity
`1d8d57659083cec51c9cae21d723e1977a3a0c860758ab4504d43d30e31e67c2`.
This is first-pass execution evidence, not stable all-style feedback or fresh
qualification. Its counters and phase continue in the same owner log.

## Exact base mechanics

The base members are 22010, 22011, 22013, 22015, 22016, 22017, 22060 and 22061.
The independently preserved alternate 1669 uses 226897–226904. The inherited
name-based Hunter handler resembles the alternate set: it grants three- and
five-piece effects, uses spell 450577 at four pieces and has no eight-piece armor
bonus. Applying that handler to base 515 would be incorrect.

The current base effects are:

| Pieces | Spell         | Client definition                                                                       |
| ------ | ------------- | --------------------------------------------------------------------------------------- |
| 2      | 18679         | +8 resistance to each nonphysical school                                                |
| 4      | 27785 → 27786 | Ranged white-hit proc mask 64, 4% chance, restores 200 mana, no client ICD or PPM entry |
| 6      | 14049         | +40 melee and ranged attack power                                                       |
| 8      | 14803         | +200 bonus armor                                                                        |

This establishes client definitions, not an observed server proc cadence. The
four-piece effect must not inherit the alternate's 5% melee/ranged proc. The
isolated implementation overrides the base set by ID while preserving alternate
and Classic behavior, and avoids double application of static bonuses.

## Individual equip effects

| Piece        | Parent → child | Child payload                                       |
| ------------ | -------------- | --------------------------------------------------- |
| Cap 22013    | 27038 → 27039  | Pet health +3%, aura 133                            |
| Gloves 22015 | 27043 → 27042  | Pet weapon crit +2%, aura 52                        |
| Tunic 22060  | 27225 → 27208  | Pet base armor +10%, aura 142, physical school mask |
| Boots 22061  | 27206 → 27205  | Pet damage +3%, aura 79, all-school mask 127        |

Each parent is a periodic-trigger aura with a **3,000 ms refresh**. Each child
targets the pet, has a **4,000 ms duration**, and uses a 100-yard range definition.
Several passive spell rows contain `ProcChance: 101` with a zero proc mask; these
must not become attack procs. The source review also preserves the distinct bonus
coefficient fields rather than treating all four parents as identical.

The classic aura identifiers are consistent with the
[CMaNGOS aura definitions](https://github.com/cmangos/mangos-classic/blob/master/src/game/Spells/SpellAuraDefines.h).
That implementation is a reference for interpreting enum labels, not evidence of
Forever server behavior. Weapon crit must not become spell crit, and base-armor
scaling must not become total-armor scaling. The current simulator pet's base
armor is incomplete; a stationary fixed-pet-uptime DPS encounter cannot qualify
an armor/survival benefit simply by multiplying its available armor field.

The isolated runtime applies the four pet child auras with their 4-second duration
and 3-second refresh. A pet equipped and in range before the pull starts buffed;
a later enable waits for the next owner refresh. A dismissed pet loses its auras.
Moving beyond 100 yards stops refreshes and lets the current aura expire; returning
in range restores it on the next refresh. Range uses the simulator's one-dimensional
owner/pet separation, rather than a three-dimensional position model.

The corrected Go tests cover Cat and Wind Serpent stat effects, repeated resets,
no pet/zero uptime, dismissal and later enable, refresh/expiry and range transitions,
Classic/alternate isolation and owner-versus-pet effects. The boots attach to the
shared damage multiplier, rather than the physical-school-only multiplier. Actual
native/WASM spell-damage controls remain required. Exact server timing and
acquisition remain unobserved; no optimization DPS gain is established here.

The tests also exposed a missing Hunter stat dependency: `BonusArmor` did not
contribute to effective `Armor`. A separate constructor patch adds that dependency
for Hunter. The eight-piece regression now verifies both the +200 bonus-armor
stat and the +200 effective-armor contribution. The tunic's pet effect separately
scales only `GetBaseStats()[Armor]`; it does not multiply inherited armor.

## Acquisition evidence

The installed Forever QuestieDB identifies eight Hunter milestone quests with
class mask 4, level requirement 58 and separate Alliance/Horde race masks. Its
quest-side baked fields supply requirements. The item-side `questRewards` field
separately supplies associations for all eight pieces and sixteen item/quest
links, corroborated by the new [reward audit](simulator-dungeon-set-catalog-audit.md#item-side-reward-associations-recovered-on-october-24).

The reviewed Forever reward rows are:

- [8952](https://www.wowhead.com/forever/quest=8952/anthions-parting-words)
  and [9017](https://www.wowhead.com/forever/quest=9017/anthions-parting-words):
  boots 22061, pants 22017 and mantle 22016, all received together.
- [9000](https://www.wowhead.com/forever/quest=9000/saving-the-best-for-last)
  and [9008](https://www.wowhead.com/forever/quest=9008/saving-the-best-for-last):
  cap 22013 and tunic 22060, both received together.

The item-side records associate bindings 22011 with 8906/8914, and belt 22010 plus
gloves 22015 with 8931/8938. Their page review and delivery semantics remain pending:
an item/quest association does not establish quantities or choice-versus-simultaneous
delivery. Failed page retrieval and other-flavor search results remain failed
evidence; the new source does not relabel those pages as reviewed. The original
immutable drafts retain their earlier pending relations. No unrestricted wear mask
is turned into an acquisition approval, and no Hunter catalog release is admitted.

On October 24, cached primary-page reward sections became available through web
search for all four remaining quests. They list bindings for
[8906](https://www.wowhead.com/forever/quest=8906/an-earnest-proposition) and
[8914](https://www.wowhead.com/forever/quest=8914/an-earnest-proposition), and both
belt and gloves for
[8931](https://www.wowhead.com/forever/quest=8931/just-compensation) and
[8938](https://www.wowhead.com/forever/quest=8938/just-compensation).
All four sections use the guaranteed-reward heading rather than a choice heading.
The listed names match the independently recovered item/quest associations.

The separate facts-only record is
`hunter-dungeon-upgrade-v1/indexed-quest-rewards-20261024.json`. This is explicitly
indexed primary-source evidence: direct page requests still return a challenge or
cache miss, and no full page body or omitted item quantity is invented. It does
not rewrite the original twenty-page review inventory or the frozen Hunter
fixture. The supplemental reference review is now implemented below; compiled-model
admission remains required before numerical optimization. No live server delivery is established.

The existing local quest cache was also checked read-only as a possible source.
It reports build 69795 and contains none of these Hunter milestone IDs, so it
does not supply current 70532 acquisition evidence.

## Supplemental reference review

`infra/simulator/hunter-beastmaster-acquisition.mjs` composes the unchanged strict
mechanics review with the full same-TOC reward inventory and the four indexed
primary reward sections. It cross-checks the current client/hotfix snapshot,
exact base membership, all eight class/faction milestones, required items,
reward names/IDs, both faction associations for every piece and the all-listed
reward heading. Preserved page records and indexed sections keep separate source
labels. No omitted quantity is synthesized and the original pending fixture is
not rewritten.

Four tests pass, covering immutable inputs, missing/duplicate quests, choices,
cross-flavor URLs, alternate IDs, wrong names, missing paired rewards, invented
quantities, class/faction changes, snapshot drift and fabricated admission flags.
The facts-only indexed source is also retained in
`infra/simulator/fixtures/hunter-beastmaster-indexed-reward-source.v1.json`, so the
public unit test does not depend on ignored research artifacts.

The actual preparation report is
`hunter-dungeon-upgrade-v1/acquisition-supplement-8df598e5445e055f.json`, semantic
SHA-256 `8df598e5445e055f750437ee7486759814877c6e815864cf1d0e5f9102c80db0`,
byte SHA-256 `8603f388bbca06b62c53d481e52d58232c9019b9ee734731bc68822c9577c293`.
Ten source pins bind the exact inputs, validators and preparation command.
It corroborates eight pieces/eight milestones/sixteen faction reward links,
with zero combat jobs, catalog writes or class-clock writes. Catalog admission,
numerical qualification and publication remain false; live server delivery and
exact quantities remain unverified. This is reference coverage, not a Hunter
optimization result.

```sh
node --test infra/simulator/hunter-beastmaster-acquisition.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-hunter-beastmaster-acquisition-v2.mjs --prepare
```

## Candidate catalog and complete set proposals

`hunter-beastmaster-catalog.mjs` appends eight current-stat records without
replacing any parent item. Hunter-only acquisition narrows the unrestricted raw
wear mask. Four individual pet effects remain attached to their exact item IDs;
none becomes an owner stat. Inspection preserves all four set thresholds and
simultaneous rewards without inventing mutually exclusive quest choices.

The current preparation report is
`hunter-dungeon-upgrade-v1/catalog-931109ef8a2edad6.json`, semantic SHA-256
`931109ef8a2edad6914de39df2eed641ec79eb8c4be478484642fdefa586de98`,
byte SHA-256 `f8f4d77e4e79638bd6f293bd41e954efa4c8e8fb65adbc7ca7cfc064243c1cc8`.
Its 545 pins bind the 2,687-item candidate database and actual BM/MM/Survival
published settings. Each style has 27 proposal groups, all eight pieces in their
eligible slot pools and every **247 two-to-eight-piece subset**. A deterministic
maximum-piece assignment for each admitted set remains mandatory. The shared
enumerator retains weapon layouts, ordered jewelry pairs, compatible enchants
and acquisition/ownership gates. Six catalog/gear-bank tests pass. These are
proposal counts, not measured damage or an exhaustive global optimum.

## Frozen native and WASM preparation

The isolated compiler copies only the frozen Rogue model's 475 declared files.
It preserves its complete 2,679-item database and model corrections, appends the
eight Hunter pieces, applies the tested set/pet/bonus-armor changes and rebuilds
both engines from the same source. Database encoding checks parent equality,
complete round-trip equality and every compiled combat-item representation.
Ten Go regressions pass: six Hunter mechanics/lifecycle tests, complete database
conformance, Darkmantle and both Valor regressions. Three Hunter asset/import
tests also pass, retaining exact class/faction gates and all separate pet effects.

The current context is `hunter-full-raid-model-v2/context.json`:

- Release: `50df0df3d3d0124bb3b14791`.
- Context semantic SHA-256: `41953f3937013b178efb8b4c38af04f9ecd5149848ae6f451072ca42f3dfba3c`.
- Database semantic SHA-256: `0c952cdc3f6b279893da2074eda8981b5a2338f7af7fa06266e4d0b476541c7a`.
- Native SHA-256: `22c5d84a4045d5fd590d5021517d00d7ba30a7cf3d81c9eb538720e1e45e91bf`.
- WASM SHA-256: `918d135678846921ddc3fed1265e9d26ae932f5fd96cac33094ebba1cbb63c23`.

It binds 478 resulting compiler files and thirteen generated inputs. No old
numerical score or historical reviewed preset is carried into qualification.
The model is unselected, `classQualified: false`, and starts no Hunter class
clock or optimization jobs. The build log is
`hunter-dungeon-upgrade-v1/model-build-v2.log`.

The first zero-job catalog/model preparation used the retention-modified shared
cache module. The approved Rogue compatibility split changed that enclosing
module's source identity, so Hunter received a fresh catalog and model binding.
The initial catalog/model/logs remain preserved; changed preparation sources
and the previous cache source are archived in
`hunter-dungeon-upgrade-v1/source-rebinding-20261024/record.json`.
The second build's native and WASM byte hashes exactly match the initial build:
the source-binding repair changed neither compiled runtime. The initial
unqualified context is not reused as a numerical admission.

## Three-style control preparation

`hunter-full-raid-controls-v1.mjs` prepares 25 controls: original/full-raid
settings for each published style; each one-through-eight-piece BM boundary;
full sets on MM/Survival; all four individual pet-effect items; Wind Serpent,
absent-pet and zero-uptime isolation; Wind Serpent without boots; and removal of
external buffs. Every control explicitly selects Forever while preserving the
source talents/APL and weapon geometry. Captured-input validation rejects a
Classic fallback, changed player/raid/encounter data, wrong seed/iterations,
unapproved proc opt-in or mismatched source binding.

Four actual-settings contract tests pass. Their typed request fixtures stay in
memory and are never saved as browser captures or numerical evidence. The
zero-job preflight passes all 25 controls against release
`50df0df3d3d0124bb3b14791`, with 8,047 source pins. Logs are
`hunter-dungeon-upgrade-v1/control-contract-tests-v1.log` and
`hunter-dungeon-upgrade-v1/control-preflight-v1.log`. Subsequent real captures and
the remaining correction are recorded below. Complete model admission, full item/policy/consume feedback, independent
confirmation and verified public delivery still remain.

```sh
node --test infra/simulator/hunter-beastmaster-catalog.test.mjs artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-gear-bank-v2.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-model-assets-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-hunter-full-raid-model-v1.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/prepare-hunter-full-raid-model-v1.mjs --prepare
node --test artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-controls-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-hunter-full-raid-controls-v1.mjs --plan
```

## Actual controls and the queued correction

The first supervised model-validation job started the Hunter update clock at
**2026-10-24 05:03:16.065 UTC**, with the unchanged hard deadline
**2026-10-25 05:03:16.065 UTC**. It saved all 25 genuine UI captures under
`hunter-full-raid-v1/`. Seventeen native/WASM pairs passed the batch's canary
checks. The eighteenth deliberately removes the pet, but its inherited APL
still requests Intimidation, spell 19577. Native and WASM admission reject that
unavailable spell. The job exited with code 1; it produced no completed control
batch, six-parent qualification or optimized score. Its log is
`hunter-dungeon-upgrade-v1/control-owner-v1.log`.

The ordinary single correction uses `hunter-full-raid-controls-v2.mjs`. Only the
two deliberate pet-absence controls remove their one unavailable Intimidation
action. Full raid, published originals, Wind Serpent and the actual Survival
melee APL remain unchanged. Two focused correction tests pass. The corrected
command is SHA-256
`2b760426d432fdd5d9344038dc1199013718a97e449c7a5f9c4a16c05c2ed1c7`.

Its initial execution stopped before capture because the live Rogue numerical
owner held the shared workspace lease. The failed attempt is preserved in
`hunter-dungeon-upgrade-v1/control-owner-v2.log`. It does not justify bypassing a
lease or starting another clock.

Before any v2 combat, a read-only review found another diagnostic mistake: the
published Survival setup fights in melee and correctly has no ranged-auto mana
procs. The effect checker now verifies the four-piece aura's actual registration
on every qualifying loadout, requires a positive 200-mana proc only when ranged
autos occur, and requires zero proc mana for the melee-only control. It still
checks all individual pet auras and actual Wind Serpent lightning-breath damage.
Four effect regressions pass, including positive ranged and negative melee cases.
No APL was changed to force a proc.

The original checker/test/queue sources and complete failed-v1 source binding are
preserved in `hunter-dungeon-upgrade-v1/final-correction-source-archive-20261024/`.
The original main corrective command, single correction identity and class
deadline remain unchanged. Both failed attempts stay in the ledger. Every v2
capture will be made freshly against its current verified source graph.

The separate read-only diagnostic authenticated the original 8,064 source pins
against those preserved snapshots and checked all seventeen saved pairs on
complete unit metrics and the corrected effect contracts. Its report is
`hunter-dungeon-upgrade-v1/partial-effects-e67ffc73ca9a26ff.json`, byte SHA-256
`e5d5a912099a8e8d15460c8221f1f55422bcadd3c47ce57968dda252d6eed9e9`.
It verifies actual mana payloads, all four pet effects, Wind Serpent spell damage
and Survival's registered aura with zero ranged-proc mana. It starts no fights
and explicitly disallows qualification; full-batch and parent checks are still
incomplete. Reproduce it with:

```sh
node artifacts/forever-simulator/optimization/review-tools/audit-hunter-partial-effects-v2.mjs --verify
```

The corrected zero-job preflight passes all 25 cases with 8,069 source pins; log
`hunter-dungeon-upgrade-v1/control-correction-preflight-v2.log`. The exact command
is queued behind actual live Rogue PID 90098 by queue PID **43410**, with 8,070
pins including the queue itself. Log:
`hunter-dungeon-upgrade-v1/control-queue-v2.log`. The queue checks process liveness,
the original run identity, source hashes and the unchanged deadline. It does not
steal a lease, retry changed code or create a new phase. Cancellation releases
its own queue record after the next bounded poll.

## Item-search implementation and admission gate

The three-style request adapter and complete item banks are connected to the
existing callback-only monotone selector. All occupied slots, ordered hands and
jewelry, set subsets and compatible reviewed enchants are included. Weapon
geometry determines ammunition and sharpening stone versus weightstone. Each
admitted set's maximum-piece assignment remains mandatory through 10,000-fight
decisions, including full Beastmaster. The existing six-pass/noise-guard policy
and 400,000-origin bound remain unchanged.

Four request/construction/composition tests passed on the real full-raid v1
captures, including all ranged/ammunition families and mandatory full Beastmaster
under explicitly synthetic in-memory tie scores. These are not numerical
evidence. The current integration tests target fresh v2 captures and must be
rerun after the queued control job supplies them. Three additional isolated
completion-gate tests pass: running/failed supervisors and an unrelated successful
command cannot admit prepared controls.

The gear loader requires the actual successful corrective owner, authenticates
every capture and raw native/WASM/parent record, reconstructs all complete metric
and effect comparisons, and binds the stable completed run identity. It does not
pin a mutable whole ledger or trust a success flag alone. The runner then requires
separate native/WASM controls for every ordered hand geometry, each ranged family
and every mandatory complete set, in batches of at most 64. No scalar study has
been dispatched and its actual positive admission/preflight remains pending the
completed corrected controls.

After those controls finish:

```sh
node --test artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-gear-requests-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/run-hunter-full-raid-gear-v1.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/supervise-hunter-full-raid-gear-v1.mjs --search
```

Fixed-policy gear selection still needs geared talents/APL, pet/consume feedback,
fresh independent comparisons and verified UI delivery. None of this preparation
qualifies a new DPS score or public preset.

## Completed-gear source reader

The new `load-hunter-full-raid-gear-completion-v1.mjs` accepts an explicit
canonical `bounded-native-studies/<identity>/completed.json` path. It first
requires the latest matching gear supervisor to have completed successfully
with the exact producer source and arguments. Running, failed and foreign
commands cannot admit a result, and a later unfinished matching run cannot fall
back to an older success. A later legitimate phase does not invalidate the
stable completed-run identity: the reader does not pin a mutable whole ledger.

The reader reconstructs all three complete gear domains, every mandatory set and
all derived controls. It authenticates the saved native/WASM records and complete
unit metrics, including resources and pets, before reconstructing every saved
numerical stage through the existing read-only journal verifier. Final gear,
settings, request identities, fixed decision precision and complete semantic
results must agree. Missing controls cannot start a replacement fight. The
controlled target-aura union is limited to sixteen; this conservative check does
not establish global arbitrary-input engine debuff enforcement.

The producer and reader now share their exact declaration builder. This change
was made before the first gear command started. Both the running Rogue graph and
queued Hunter correction were checked first: neither freezes the gear producer.
The queued corrective command, its source graph and original class deadline are
unchanged. The refactored real gear preflight still rejects incomplete controls
with zero native/browser jobs; log
`gear-refactored-incomplete-controls-guard-v2.log`. The gear producer explicitly
pins the new declaration/source-contract test before its first dispatch.

Seven supervisor tests pass in `gear-supervisor-contract-tests-v2.log`.
Seven further tests pass in `gear-source-contract-tests-v1.log`, using the actual
three-style input domains and a real saved complete-unit pair. Declaration and
result-shape fixtures are explicitly in memory and grant no numerical admission.
They reject partial style domains, changed bindings, missing controls, open
passes, changed settings, false qualification and matching DPS with missing
resource/pet metrics. Scoped ESLint passes for the nine affected modules.

The final preparation receipt is
`hunter-dungeon-upgrade-v1/gear-reader-preparation-9a3cbcda2ba0bdcf.json`
(byte SHA-256 `f2e72f21ef2be8ef6e8483b6c92eeb5364782c54c75373cfab7f1140c9d0ae23`).
It binds the nine affected sources, fourteen passing contracts, actual rejected
preflight and unchanged 8,070 queued-control source pins. Its
`actualGearCompletionReplayVerified` and numerical/publication flags remain false.

The actual completed-gear replay remains unverified: the queued controls must
finish and the numerical gear study must run first. Once that study prints its
completion identity, run `review-hunter-full-raid-gear-source-v1.mjs --verify`
followed by its exact relative `completed.json` path. That CLI starts no combat,
publishes nothing and writes no numerical evidence.

## Consumable and state feedback preparation

The callback-only Hunter feedback modules now connect consumables, the complete
item search and geared talent/APL/pet selection. The completed-gear admission and
replay reader is implemented, but its actual positive source is still pending.
The numerical feedback owner is implemented as described below; its real preflight
still requires the queued controls and initial gear study to finish. No Hunter scalar study or new public
preset has been admitted by these proposal checks.

`hunter-full-raid-consume-policy-v1.mjs` adds mana regeneration to the four
existing consumable coordinates: none, ordinary Mageblood and Greater Mageblood.
The compiled model's actual enum values are 0, 1 and 2. The request adapter uses
that model's codec and preserves gear, APL, pet, ammunition, weapon stones,
potions, runes, remaining elixirs and the raid/encounter. Its two coordinate
sweeps inspect 500/2,000/10,000-fight requests and retain the actual incumbent at
every precision. An accepted change at the sweep limit stays open. The zero-job
preflight constructs 81 typed controls over the three actual input prototypes,
in batches of 64 and 17; log `consume-proposal-preflight-v2.log` under
`hunter-dungeon-upgrade-v1/`.

`hunter-full-raid-state-sources-v1.mjs` authenticates the historical declarations
and complete APL templates, then projects only talent/APL/pet proposals. Old DPS
and old-context requests are excluded. The three published current-model inputs
reconstruct exactly. Their initial banks contain 67, 206 and 208 candidates;
historical duplicates reduce to 8, 9 and 9 retained states. Beast Mastery uses
nine declared APLs and five implemented offensive pets; Marksmanship uses
fourteen APLs and six pet/no-pet choices; melee Survival uses thirteen APLs and
six choices. Current talents, historical anchors and legal current one-point
neighbors feed the existing single bounded joint expansion, rather than a claim
of exhaustive talent optimization.

The state preflight covers 1,509 effective proposals with 75 derived controls
over 375 observed ranks, declared knob values, pet types, spell presences and
source families. Equivalent APL aliases share numerical inputs and keep their
provenance. All three incumbents are mandatory. The controls fit batches of 64
and 11; log `state-proposal-preflight-v2.log`. Every retained historical state is
explicitly remeasured at inspected 10,000-fight precision on the current gear
and consumables before selection. This adapter preserves an ordinary or absent
mana elixir; it does not call the old wrappers that force Greater Mageblood.

`hunter-full-raid-feedback-search-v1.mjs` composes consumes → gear → state with a
four-pass maximum. A change requires another complete pass; the effective state
and every inner selector must be stable together. Cycles, unfinished inner
selectors and pass limits cannot produce a qualified preset. A separate guard
preserves race, class, pet speed/uptime, fixed consumables, raid support, distance
and encounter. Retained states are carried without silently truncating the
declared 64-state bound. This is a bounded heuristic, with fresh independent
2% retained-contender / separate 1% original assessments and exact selected
native/WASM/UI checks still required before publication.

Seven consumable/selector tests pass in `consume-feedback-contract-tests-v2.log`.
Fourteen state/feedback tests pass in `state-feedback-contract-tests-v2.log`,
including a complete real-input Beast Mastery consume/gear/state composition
with explicitly synthetic tie scores. Full Beastmaster reaches the mandatory
10,000-iteration request stage in that test, and the actual incumbent remains
selected. These fixtures create no worker, fight or numerical evidence journal.
Both input preflights also start zero native/browser jobs and grant no numerical
or publication admission. Scoped ESLint passes for all nineteen new proposal,
selector and feedback modules, with no warnings. The queued control owner's
8,070 source pins remain unchanged.

The immutable preparation receipt is
`hunter-dungeon-upgrade-v1/feedback-preparation-7ee5a6ae4414a56a.json`
(byte SHA-256 `e07b9074633b46b3671039151f1194c430b72d5b9eb3867c4ca7e4c38b3447b3`).
It binds the nineteen source files, both passing test logs, both final input
preflights and the unchanged queued-source audit. It explicitly grants neither
numerical admission nor publication.

From the repository root:

```sh
node --test artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-consumes-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/consume-coordinate-search-v2.test.mjs artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-states-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-feedback-closure-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-hunter-full-raid-consumes-v1.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/prepare-hunter-full-raid-states-v1.mjs --plan
```

## Supervised full feedback runner

`run-hunter-full-raid-feedback-v1.mjs` now connects the tested selectors to one
ordinary `state-recheck` owner for all three styles. Both the producer and
`supervise-hunter-full-raid-feedback-v1.mjs` require `--gear-completion` followed
by the exact canonical path printed by the completed gear study. There is no
implicit “latest” source and no preview admission. The loader authenticates the
successful gear supervisor, every saved control and the complete sealed gear
replay before constructing any feedback execution domain.

Each style preserves its selected gear and published talent/APL/pet state as the
starting control. Historical state declarations supply proposals only, with old
scores excluded. Consumable coordinates, weapon geometry/complete sets and
talent/APL/pet features have separate declared native/WASM control groups, each
in batches of at most 64. The same full-v2 encounter, fixed-context guards,
four-pass closure, six workers and 400,000-origin bound per style apply. The one
Hunter class deadline remains unchanged; styles and control groups receive no
new clock or corrective allowance.

Every numerical branch completes its framework replay before its selected
complete-unit native/WASM control and immutable branch report. The final report
references all three branches. Cycles, unfinished inner selectors and pass caps
remain open: an open final report exits unsuccessfully and cannot qualify a
preset. The selected-input validator checks linked fingerprints, actual inner
stability, scenario preservation and exact typed reconstruction. Accepted state
changes retain identical control identities after JSON persistence.

Eight owner/cache-boundary tests pass in `feedback-owner-contract-tests-v2.log`;
seven real-input construction/result tests pass in
`geared-feedback-contract-tests-v4.log`; and two saved-control tests pass in
`feedback-cached-parity-contract-tests-v1.log`. They preserve all three actual
typed style inputs, cover mandatory full Beastmaster and reject false stability,
changed context, partial steps, missing parent completion and corrupt cached
records. The cache tests use a real saved complete-unit pair but a virtual
aggregate: no worker, browser or numerical journal is created. A present invalid
record fails rather than executing replacement fights. The final validator also
requires explicit boolean selector outcomes and every original retained state
proposal; absent fields cannot masquerade as stability or silently shrink the
retained comparison domain. Scoped ESLint passes for
the twelve new modules, and both producer/supervisor graphs resolve with 108
source modules and zero output writes.

The actual current read-only execution preflight is correctly rejected before
model preparation because the real gear owner is unfinished; log
`feedback-real-incomplete-gear-guard-v3.log`. Normal execution additionally
requires the live approved supervisor before loading any source. After a real
gear completion has been independently verified, run the producer with `--plan`
and the exact `--gear-completion` path; only after that succeeds run the supervisor
with `--search` and the same path. No feedback numerical dispatch or actual
positive feedback preflight has occurred yet. The whole-feedback source reader
is implemented below; actual completed-source replay, fresh 2%/1% confirmation
and UI delivery still remain.

The final execution-preparation receipt is
`hunter-dungeon-upgrade-v1/feedback-execution-preparation-c91a27d66ada8115.json`
(byte SHA-256 `714d40a20eaf0dd981aa4a37ff963d8f4a667bba3a5b33be485430fbc4f081a0`).
It binds twelve source files, seventeen passing tests, the resolved execution
graphs and the actual rejected preflight. All 8,070 queued Hunter pins and
12,256 live Rogue pins remain unchanged. It starts zero native/browser jobs and
explicitly records that the actual positive feedback preflight is unverified.

## Independent full-feedback reader

`review-hunter-full-raid-feedback-source-v1.mjs --verify` accepts the exact
`feedback-all-styles-…json` path printed by the completed feedback producer.
It requires all three stable styles in their declared order and the latest
successful `state-recheck` supervisor, bound to the exact gear-completion
argument and current producer bytes. A later unfinished retry cannot fall back
to an older success; later unrelated phases do not invalidate the terminal run.

The reader loads and independently replays the shared gear parent once, rebuilds
each style's complete declaration/control domain, authenticates all three initial
control categories and the exact selected complete-unit native/WASM pair, and
replays every saved numerical stage/origin without starting replacement fights.
Completion paths come from the stored identity/result receipt. Stage files and
all references are hash-verified and contained; symlinks and oversized stages
are rejected. Final source pins are rechecked after all three branches.

Six real-input source contracts passed in `feedback-reader-contract-tests-v1.log`.
The same initial run preserved one supervisor-fixture failure: it accidentally
left two owners running, which the production guard correctly rejected. Only
that fixture was corrected; all eight supervisor/contained-file contracts then
passed in `feedback-reader-supervisor-contract-tests-v2.log`. Scoped lint and
formatting pass for seven new files, and the read-only import graph resolves
98 modules. The actual unfinished owner is rejected before parent/model loading;
this preparation starts zero native/browser jobs. An actual positive completed
feedback replay remains unverified until the numerical producer finishes.

The receipt is `hunter-dungeon-upgrade-v1/feedback-reader-preparation-d463d7ff08e964ed.json`
(byte SHA-256 `836170efcb4575fd9ecc9c4467b89054f7aa2c4fb253ab17f566e0aebbe0b9f5`).
It binds the seven new files, both test logs, the static/actual negative gates
and the audit of all 12,256 Rogue and 8,070 queued Hunter pins. All existing
preparation sources also remain unchanged. Successful saved-source replay
still does not replace fresh 2%/1% confirmation or authorize publication.

## Fresh confirmation source preparation

`prepare-hunter-full-raid-confirmation-v1.mjs --plan --feedback-report` requires
the exact completed three-style report. It authenticates and independently
replays the shared gear/feedback parents before reconstructing each selector's
actual starting input, selected control and final frame. A missing, partial or
open source cannot become a successful preview. No RNG reservation, combat or
filesystem write occurs in this preparation.

Every final stable-pass state finalist, gear decision finalist and consume
coordinate finalist is retained, including mandatory full Beastmaster. Numerical
aliases preserve every original source location, settings/state identity,
inspection seed and metric. They do not merge scores from different seed ranges.
The existing confirmation helper accepts twelve arms; the adapter keeps the
same selected incumbent in each batch with up to eleven contenders, preserving
the entire tail rather than truncating it. A declared 512-effective-arm bound
fails explicitly if exceeded.

The initial real-input regression caught a genuine inspection-seed mismatch:
consume decisions use **189900001**, while the existing confirmation protocol
requires genuine 10,000-fight source metrics at **77191**. The new alignment
adapter exposes exact additional requests for configurations that lack that
measurement. It retains the old seed/metric separately and rejects missing,
borrowed or relabeled results. Only exact new-request metrics can complete
alignment. Even a large alignment gain cannot replace the frozen incumbent or
change which contenders are included. This pure adapter does not execute those
requests; supervised numerical execution is still pending.

After alignment, each fixed batch uses the existing two independent 20,000-fight
samples with 100,000-wide RNG reservations, the approved 2% assessment and the
unchanged original 1% assessment. Known historical ranges, actual parent-stage
ranges and all saved controls are excluded; new batches and styles must also
have mutually disjoint reservations. Material gaps and excessive uncertainty
reject acceptance. Holdout results never choose a replacement. The comparisons
remain nominal per-comparison practical assessments, without a simultaneous
confidence or global-optimality claim.

All **18** final contracts pass in `confirmation-preparation-contract-tests-v3.log`:
six real-input reconstruction/provenance tests, four alignment tests, five batch
and margin tests, and three preparation gates. The real-input case composes the
complete Beast Mastery domain with explicitly synthetic in-memory tie scores;
it creates no numerical journal or fight and does not qualify the other two
styles' completed numerical sources. Scoped lint/formatting pass for ten files,
and the static import graph resolves 106 modules. The original failed regression
is preserved in `confirmation-real-input-contract-tests-v1.log`.

The receipt is `hunter-dungeon-upgrade-v1/fresh-confirmation-preparation-9175866745d5b673.json`
(byte SHA-256 `485fe966a2021901b3d6a919dbb8cab3125810072f21410ec7359f30e9c4ef3c`).
All 12,256 Rogue, 8,070 queued Hunter and 47 earlier preparation-source pins
remain unchanged. Actual positive preparation, supervised alignment/holdout
execution, independent result replay and selected UI delivery remain pending.

## Supervised fresh confirmation execution

`run-hunter-full-raid-confirmation-v1.mjs` and its supervisor now implement the
ordinary all-style `confirmation-delivery` command under the original Hunter
clock. The exact completed feedback-report path is mandatory. Numerical mode
requires its live supervisor before model, registry or combat work; `--plan`
only authenticates sources and reports planned counts. No actual positive
preflight or numerical confirmation has occurred yet.

The command freezes all pending inspection inputs and every original arm before
alignment outcomes arrive. It measures missing 10,000-fight/77191 inspections in
a bounded study and independently replays its saved origins/stages before
freezing any holdout plans. An already-inspected source skips the empty numerical
stage. Both substudies remain part of the same ordinary command and deadline;
they do not create new corrective allowances or clocks.

Every batch receives its original immutable RNG claims before any fresh combat.
Claims are verified against all registries for overlap, with exact-byte checks
for every owned record. A study with existing files cannot recreate a missing
claim, even if it stopped before completion. Fresh execution uses the frozen two
20,000-fight samples, assesses both margins, and never switches the incumbent.
Material gaps produce an unsuccessful command and a preserved diagnostic
report. A completed result still requires a separate completed-owner source
review and actual UI delivery before publication; the reader is implemented below.

The selected native/WASM control is carried from the independently authenticated
parent only after proving whole numerical-request equivalence on the unchanged
model and selected settings. Missing parent proof, a borrowed style's control
or changed settings rejects reuse. This avoids replacement fights for an
identical input without relaxing complete-unit parent verification.

All **17** final contracts pass in `confirmation-execution-contract-tests-v2.log`:
four owner/source gates, five staged execution/margin checks, five actual
temporary-file reservation checks, and three checks over the real compiled
styles' request inputs. Numerical outcomes and parent-proof shapes in these
tests are explicit isolated fixtures; they do not qualify an actual completed
parent. Scoped lint/formatting pass for fifteen files. Both entry graphs resolve
128 source modules with no build-output writes. The real missing-source preflight
rejects before simulation or RNG writes.

The receipt is `hunter-dungeon-upgrade-v1/confirmation-execution-preparation-9d377936d67dc9b7.json`
(byte SHA-256 `bae53e6a990d62f813d190b867aa41061fbc931f39ec5182902722ae546333a1`).
All 12,256 Rogue, 8,070 queued Hunter and 57 prior preparation-source pins remain
unchanged. This preparation starts zero native/browser jobs and writes no real
RNG claims. Actual positive execution and completed-owner review remain
unverified; no preset, ranking or release is published.

After the genuine feedback report exists, assign its exact path to
`HUNTER_FEEDBACK_REPORT`, then run from the repository root:

```sh
node artifacts/forever-simulator/optimization/review-tools/run-hunter-full-raid-confirmation-v1.mjs \
  --plan --feedback-report "$HUNTER_FEEDBACK_REPORT"
node artifacts/forever-simulator/optimization/review-tools/supervise-hunter-full-raid-confirmation-v1.mjs \
  --search --feedback-report "$HUNTER_FEEDBACK_REPORT"
```

Run the supervisor only after the actual source preflight succeeds and the
workspace is available, within the existing deadline.

## Independent completed-confirmation reader

`review-hunter-full-raid-confirmation-source-v1.mjs --verify` requires the exact
`confirmation-all-styles-…json` path printed by the producer. Before loading the
model or parents, it rejects missing styles, unaccepted results and any attempt
to self-claim completed-owner review or publication. The latest matching
`confirmation-delivery` command must have actually succeeded with the exact
feedback argument and producer bytes. An unfinished retry cannot fall back to
an older success; unrelated later phases do not invalidate the terminal receipt.

The reader authenticates the complete feedback parents once, reconstructs the
original alignment declaration and independently replays its saved origins and
stages. It reproduces the exact pin set used to freeze holdouts. An
already-inspected source can skip that stage only when no alignment inputs were
required. Missing sealed alignment data fails without starting replacement
combat or creating files.

It then reconstructs every three-style plan and declaration, reads the original
RNG claims without writing or repairing them, verifies their exact hashes and
global non-overlap, and replays every fresh holdout stage. The whole producer
report, including scores, iteration counts, source bindings, selected-control
proofs, replay receipt and separate original 1% outcomes, must match the
reconstruction. The raw report remains unchanged. Only the returned verification
object gains `completedOwnerIndependentReview: true`; UI publication stays false.

All **14** contracts pass in `confirmation-reader-contract-tests-v2.log`: six
source/alignment/report projections and eight supervisor/contained-file checks.
The fixtures test protocol boundaries rather than actual admitted numerical
evidence. Scoped lint/formatting pass for eight new files, and the static reader
graph resolves 119 modules. The actual unfinished supervisor rejects review
before model loading. No positive sealed-alignment or completed-owner numerical
replay has been verified yet; both await genuine completed Hunter data.

The receipt is `hunter-dungeon-upgrade-v1/confirmation-reader-preparation-61880f83f01ac9a5.json`
(byte SHA-256 `8bb987aa4e210a00933bfd7c3b29dca7fbb7c449355cbfa0aadc2eb70e573ff0`).
All 12,256 Rogue, 8,070 queued Hunter and 72 previous preparation-source pins
remain unchanged. This work starts zero native/browser jobs, writes no RNG
claims, and changes no published preset, ranking or release.

## October 24: all three feedback styles completed

The exact resumed owner `b6f408eb-29e0-40b7-b535-069d3742b063` completed successfully
at **21:50:37.421 UTC** with exit code zero. Beast Mastery, Marksmanship and
Survival all finished stable and passed their selected native/browser controls.
The final all-style report is
`hunter-full-raid-v2/feedback-all-styles-eff3d7165d0a8e96.json`, semantic SHA-256
`220eac712aee90d9df7eb31a5667d38eb5a2ef420f7aae179dd685f00f8d3fd1`.
The earlier storage-guard failure remains unchanged; no clock was reset.

The independent reader completed successfully against that exact report:

```sh
node artifacts/forever-simulator/optimization/review-tools/review-hunter-full-raid-feedback-source-v1.mjs --verify artifacts/forever-simulator/optimization/hunter-full-raid-v2/feedback-all-styles-eff3d7165d0a8e96.json
```

Its log is `hunter-dungeon-upgrade-v1/feedback-independent-source-review-eff3d716-v1.log`.
All three returned branches have `completeSemanticReplayVerified: true`; the
process exited zero. This source replay creates no numerical jobs and does not
qualify fresh holdouts. The confirmation owner
`e0a863cb-6c80-4f2e-ab25-6760e1e09a3c` is now running against the same exact
feedback report. It has completed parent-source validation and **42 genuine
alignment jobs / 420,000 iterations** at the declared inspected seed. Fresh
confirmation has started; at 22:59 UTC, **24 new jobs / 480,000 iterations** were
complete. Alignment and fresh samples remain distinct, and neither changes the
frozen selection. The log is
`hunter-dungeon-upgrade-v1/fresh-confirmation-owner-eff3d716-v1.log`.

At **23:40 UTC**, Beast Mastery and Marksmanship had finished their fresh
batches. Survival was running, with **424 / 652 jobs** and **8.48M / 13.04M
iterations** completed overall. These are execution counts; they do not establish
acceptance before the full result and independent completed-source review.

At **00:12 UTC on October 25**, the same fresh owner closed successfully with
exit code zero. All **652 jobs / 13,040,000 iterations** completed, separately
from the **42 alignment jobs / 420,000 iterations**. Both the approved **2%**
and original **1%** retained assessments passed for all three unchanged primaries.
The actual report is
`hunter-full-raid-v2/confirmation-all-styles-768880fa13b3dc26.json`, semantic
SHA-256 `768880fa13b3dc2615a9b47cd82562d80d2cecb78062632a3108ccd71c969c76`.
Its selected fresh sample counts are 360,000 for Beast Mastery and 400,000 each
for Marksmanship and Survival; delivery readers must preserve those actual counts.

The combined independent completed-source review/export is now running against
that exact report, using the unchanged canonical completion reader. Its log is
`hunter-dungeon-upgrade-v1/independent-confirmation-build-export-768880fa-v1.log`.
That independent process subsequently closed with exit code zero. Its actual
export report is `hunter-full-raid-v2/build-exports-c6b96aa9b2177e87.json`, semantic
SHA-256 `c6b96aa9b2177e87f8a5b3f36e7dc2940498d50fb8419fbbde261675e945defb`.
All three selected raw browser result/stat pairs and complete native unit metrics
were authenticated after canonical parent/alignment/holdout replay, with **9,478**
source pins. No numerical job, seed claim or selection was changed.

Actual browser controls and application delivery remain pending. The original deadline remains
**October 25 at 05:03:16.065 UTC**. All artifact paths above are relative to
`artifacts/forever-simulator/optimization/`.

## Full-raid rotation guidance

`hunter-full-raid-rotation-guidance-v1.mjs` now renders all three styles from
their effective requests, preserving the selected talents, pet, ammunition,
consumes and complete pre-pull/priority action lists. It requires matching
compiled database identity and full-v2 raid support. Omitted protobuf defaults
are normalized only for presentation; the original settings hash is retained.
Unsupported or hidden actions fail instead of disappearing from the guide.

Nine tests pass against the actual current input prototypes and all three saved
stable feedback frames. They cover every declared rotation policy, every
implemented pet (including no pet where supported), retained talent states and
no/ordinary/Greater Mageblood choices. Changed requests, foreign rulesets,
incomplete support and mismatched catalogs are rejected. These tests create no
combat jobs and do not qualify fresh results.

Validation `hunter-dungeon-upgrade-v1/full-raid-guidance-validation-138bfa30b8c95b2f.json`
has semantic SHA-256
`138bfa30b8c95b2f485aa73a6c6d5fcf958d67ed0f5d0303c8116e910e590378`.
It freezes the three new implementation/test/validation sources and verifies
**45,658** source/evidence pins, preserving all earlier **45,613**. Actual ESLint,
Prettier and bundled entry graphs pass. The existing three style renderers are
unchanged. Final UI build exports and local selection still need actual fresh
qualification and browser delivery checks.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-rotation-guidance-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/validate-hunter-full-raid-guidance-v1.mjs
```

## Full-raid build export gate

`hunter-full-raid-build-export-v1.mjs` preserves the three primaries fixed before
confirmation. It requires an independently replayed completed owner, an accepted
2% assessment and the separate original 1% result. A false original 1% result
stays false; it is never relabeled as a pass. The export binds the exact selected
settings, gear legality, enchant policy, complete guidance and raw selected
browser control proofs. Every resulting build still requires browser delivery
and has `publicationAllowed: false`.

`export-hunter-full-raid-builds-v1.mjs` is the file-writing entry point. Given an
actual completed confirmation report, it calls the independent completed-source
reader, authenticates the selected result/stat protobuf bytes and complete
native/browser unit metrics, then writes immutable build inputs and an export
receipt. It enforces the original Hunter deadline and changes no profile
pointers, numerical ledgers or selected settings. The current fresh plan has
**652 requests / 13,040,000 iterations in 29 batches**, covering every retained
finalist across all three styles.

Eight export contracts pass. Three actual saved selected controls also pass raw
result/stat byte authentication and strict complete native unit comparison.
Unit tests use explicitly mocked confirmation receipts solely to test the export
guards; they are not fresh numerical evidence. **A positive export against the
currently running fresh owner remains pending**, along with actual UI/defaults,
configuration/Gear Sets/library generation and desktop/mobile delivery checks.

Validation `hunter-dungeon-upgrade-v1/full-raid-build-export-validation-b3b3bc1cd4f8be60.json`
has semantic SHA-256
`b3b3bc1cd4f8be60b480b94c568515594d3e442ae6722768bf3794bf3fac0322`.
It freezes four new export/test/validation sources, passes actual ESLint,
Prettier and bundled entry checks, and verifies **45,716** source/evidence pins
while preserving all earlier **45,658**. It creates no combat jobs or fresh RNG
claims and does not change the strict finite-metric gate or existing owners.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-build-export-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/validate-hunter-full-raid-build-export-v1.mjs
```

After the exact fresh confirmation report has completed, pass its path to
`export-hunter-full-raid-builds-v1.mjs --confirmation-report`. A feedback report or
unfinished producer report cannot substitute for that source.

The exporter itself calls the unchanged canonical
`loadCompletedHunterRaidConfirmation` reader in a process separate from the
numerical owner. This authenticates the actual terminal supervisor, parents,
alignment, RNG claims and complete saved-stage replay before build generation.
Use it as the combined independent completed-source review and draft export;
running the separate console reader immediately beforehand would repeat that
same replay. Export-specific raw-byte, complete-unit and source-pin checks still
run afterward. The combined positive execution started after the actual fresh
owner completed successfully and finished against export `c6b96aa9b2177e87`.

## Full-raid preset prototype and compatibility checks

`hunter-full-raid-preset-overlay-v1.mjs` now generates nine virtual Hunter-only
files from the three actual saved stable feedback settings. It keeps each exact
gear/APL pair and selected talents, pet, ammo, consumes and debuffs. First-visit
defaults explicitly select the BM gear, talents and APL with the selected full-v2
support. The Pet/Melee starter stays separate and has no full-raid qualification
claim. No upstream file, saved character or selected profile is changed.

Gear Set hooks now set required Engineering/Leatherworking, disable item swapping
and free tier bonuses, and reconcile ammunition plus both weapon stones. This
prevents a bow from retaining gun ammunition or a two-handed weapon from
retaining an off-hand stone. Other pet options and nonweapon consumes stay as
the user selected them. Configuration presets additionally load the complete
selected talents/APL/pet/consumes/range/debuff setup. A runtime Hunter guard and
statically typed Hunter reference keep those callbacks class-correct without
type casts or suppressed compiler errors.

Nine tests pass, including all **16 transitions** among the three current Gear
Sets and separate starter, using real protobuf decoders and the equipment/weapon
consume validators. They also check class rejection, full-v2 defaults, exact
source files, None/ordinary/Greater Mageblood preservation, immutable inputs and
changed upstream anchors. The latest passing log is
`hunter-dungeon-upgrade-v1/full-raid-preset-contracts-v4.log`.

`check-hunter-full-raid-preset-types-v1.mjs` runs the real upstream strict compiler
over the generated presets, simulator entry and imported dependencies. All
**545 source files** typecheck with zero candidate diagnostics. Negative controls
confirm that missing profession, ammunition and weapon-consume setters are
detected. Earlier compiler and test-harness failures remain in their original
logs; the passing preparation log is
`hunter-dungeon-upgrade-v1/full-raid-preset-prototype-preparation-v3.log`.

The sealed preparation is
`hunter-dungeon-upgrade-v1/full-raid-preset-prototype-preparation-53e86075c627a39c.json`,
semantic SHA-256 `53e86075c627a39c506a68f74d6221df1eb69a616e0bbd81dcdfc48f1c079aee`.
It preserves all **45,716** previous pins and verifies **45,765** source/evidence
pins, four actual ESLint/Prettier checks and four bundled entry graphs. Its
virtual preset input is `full-raid-preset-prototype-09110378f028b40b.json`; its
strict type report is `full-raid-preset-prototype-types-489bc6a92ce074e8.json`
in the same directory.

These are **unselected prototype inputs**, with zero combat/browser jobs and no
new qualification claim. They still need exact binding to the independently
replayed fresh build exports, immutable UI compilation, actual desktop/mobile
default/switch/Gear Set checks, delivered native/browser controls and matching
application/library integration before local selection.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/hunter-full-raid-preset-overlay-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-hunter-full-raid-preset-prototype-v1.mjs --prepare
```

## Complete presentation composition and preflight

Thirteen separate presentation modules now cover exact export binding, source
loading, virtual source composition, whole-project type checking, isolated Vite
compilation, immutable output, independent file/share verification, desktop/mobile
interaction probes and focused tooltip contracts. The export binding checks each
unchanged settings/state hash and actual sample count against the sealed preset
prototype. A separately failed original 1% assessment cannot be promoted into a
passed result; the approved 2% gate remains distinct.

The complete settings-only preflight passed for **51 virtual files**, all **28**
retained presets and **822** actual TypeScript source files, with zero diagnostics.
It also checked formatting/lint for all **13** new sources, bundled all thirteen
entry graphs and preserved all **45,765** prior pins in **45,783** verified pins.
The receipt is
`hunter-dungeon-upgrade-v1/full-raid-presentation-prototype-validation-1b593056ec1b206c.json`,
semantic SHA-256 `1b593056ec1b206c6ef2b7732ebc1802c4ff14ab2724972b9650e5c70b594ecb`.
The passing log is `full-raid-presentation-prototype-validation-v5.log` in the
same directory. This creates no compiled release, combat jobs or qualification.

That audit caught raid-dependent materials in the separate Pet/Melee starter.
The presentation now repairs only that starter and regenerates its ammunition
and weapon-consume hooks through the unchanged preset factory. All three measured
gear/APL pairs, their simulator defaults and numerical evidence stay exact.
Earlier failed preflight logs remain intact.

Four focused tooltip tests pass. Missing display names and triggers for four
Hunter pet effects now come directly from the captured client rows; the existing
Darkmantle tooltip projection is reused for the shared catalog. All original
behavior and qualification annotations are preserved. Tests reject changed pet
amounts, fabricated triggers and missing source-name relations.

The actual-export contract suite requires the real independent export's exact
path and semantic hash; it does not accept mocked qualification. Its positive
execution, immutable UI compilation and browser checks are still pending that
export. The prepared browser probe checks defaults, configuration switching,
all **sixteen** Gear Set transitions at each desktop/mobile size, complete share
export/import/reload and disabled provisional consent, while rejecting combat
requests. Actual delivered native/WASM controls and application/library review
are separate remaining gates. No local profile was selected or deployed.

## Selected UI combat control preparation

The actual delivered UI now has a separate control source reader, worker recorder,
single-fight capture driver, complete wire/metric binder and six-control runner.
The runner requires the exact independently verified compiled release and passed
UI smoke report. It then exercises all three selected configurations at desktop
and mobile widths, with **25 iterations at seed 189830001**, matching each actual
saved selected control. It starts no native jobs or fresh holdouts and cannot
change the ranking, class clock or RNG reservations.

Nine source-backed contracts pass against the **three actual saved controls**.
They verify complete protobuf requests, stats admission, complete owner/pet unit
metrics and target metrics. They reject changed seed, equipment, class, fight
flags, warnings, spell/resource/aura counts and pet actions even with unchanged
display DPS. Empty unused raid parties retain their original bytes. The isolated
worker permits one fight per character; completed and failed raw captures are
retained before semantic acceptance.

The preparation receipt is
`hunter-dungeon-upgrade-v1/full-raid-ui-control-preparation-af401f8e3de94820.json`,
semantic SHA-256 `af401f8e3de9482008d539bf90a7c6bd5dbfd58b912acd352b1f2bdd9c4ce32f`.
It checks formatting/lint and bundled graphs for **seven** new sources, preserves
all **45,783** prior pins and verifies **45,792** total pins. The passing logs are
`full-raid-browser-control-contracts-v1.log` and
`full-raid-ui-control-preparation-v1.log` in the same directory.

This preparation runs **zero new native/browser fights**. Actual six-control
execution remains pending the completed independent fresh export, compiled
presentation and UI smoke gates. The CLI
`run-hunter-full-raid-browser-controls-v1.mjs` takes the actual UI smoke report
path and semantic SHA-256 as its two arguments. Application/profile/library,
current-host and saved-character verification remain separate gates. Arbitrary
boss-debuff overflow remains unqualified.

## Current-host and saved-character review preparation

Hunter now has separate completion-bridge and saved-character review commands.
The bridge command requires the actual passed six-control report and runs through
the current production HTML adapter. Its prepared checks cover exactly one
privacy-safe success notice, preserved validation errors, cancellation and late
result suppression, Do Not Track and Global Privacy Control. Three intended
25-iteration runs are diagnostic guard evidence, not numerical qualification;
the cancellation request and controlled late delivery are recorded separately.

The saved-character probe requires the exact independent compiled-UI verification
report. In isolated desktop/mobile browser storage it checks the first-visit
default, removes a real weapon enchant from a personal copy, reloads and requires
the full personal character to remain unchanged. Its worker guard rejects all
combat requests. It never opens the owner's browser profile or storage.

The source preparation passed formatting/lint and bundled graphs for all **four**
new modules. The receipt is
`hunter-dungeon-upgrade-v1/host-review-preparation-3191a7bc605a3bdf.json`, semantic
SHA-256 `3191a7bc605a3bdfeba05f50199071e6f161998d9bdf82d94ee04589db72f165`.
It preserves all **45,798** prior pins in **45,803** verified campaign pins.
The log is `hunter-dungeon-upgrade-v1/host-review-preparation-v1.log`.

Actual browser execution remains pending the completed independent export and
compiled presentation. This source preparation starts zero native/browser jobs
and does not qualify host behavior or DPS. The bridge's current application
hashes are captured separately at execution so shared adapters remain available
for later class integrations. Local profile selection still requires successful
browser/application/library verification within the original Hunter window.

## Compiled full-raid presentation and application reader

All **nine** presentation contracts passed against the actual independent exports,
including exact settings/state/gear/APL binding and separate original 1% handling.
The first compiled UI attempt then stopped in publication metadata: the inherited
writer treated Hunter's talent-allocation string as a Rogue points array. Its
original source, failure log and unselected candidate remain intact. No numerical
source or result changed.

The version-two writer uses a separate pure Hunter publication projection. Three
new regressions verify the actual text allocations, full guidance and **360,000 /
400,000 / 400,000** sample counts, and reject the old array representation or stale
metadata. The version-two independent verifier also uses the correct string
contract; earlier frozen bodies were not edited.

The corrected immutable UI build completed as **92adc3b779315f2f61371019**, retaining
all **22** pages and **3,499** files. Strict all-class TypeScript passed across
**822** sources. Numerical assets remain byte-identical to model
**50df0df3d3d0124bb3b14791**, and all three measured gear sets remain unchanged.
The receipt is `hunter-full-raid-v2/presentation-build-df6876388cc49679.json`,
semantic SHA-256 `df6876388cc49679a199be88b959c068ae2e6a45b83f3ebb0dc9c879106c4a7d`.
The publication is `presentation-publication-57aef3fc20cf23e3.json`; proof byte
SHA-256 is `a21fdb70803213f5d9c388cd318a619dadc3ad1721871b997935b2bd74c75499`.
Independent compiled-file/share verification passed for all **3,499** files,
all three complete settings links and **nine** unchanged numerical assets. Its
receipt is `hunter-full-raid-v2/presentation-verification-a74ef00da3ce42b7.json`,
semantic SHA-256 `a74ef00da3ce42b794302830c5783cc81aabd57304d37c36b7e0597589154cec`.
The candidate is not selected and has no browser-delivery approval yet.

The new `apps/web/src/lib/forever-simulator-full-raid-hunter.ts` reader pins exactly
the three real exports, model/native/WASM/database identities and completed
confirmation owner. It validates exact settings, state, guidance, ammunition,
pet, consumes and retained-arm coverage while preserving actual sample counts
and the separate 1% result. **28** focused web tests, full web TypeScript and
scoped lint pass. The real regression fixture is
`apps/web/src/lib/fixtures/hunter-full-raid-builds.v1.json.gz`; older Hunter
fixtures remain unchanged. Profile/library adapters and real browser delivery
are separate remaining work.

## Historical tooling and model-bound browser comparison

The first browser probes stopped before opening a browser because the shared
`eslint.config.mjs` changed after the prior lint snapshot. A full audit found
**zero changes in all 9,478 numerical-source files**, and exactly that one change
among **45,803** historical preparation inputs. All other **45,802** files still
match. The current configuration and its strict TypeScript lint rules were
checked and left unchanged.

The transition receipt is
`hunter-dungeon-upgrade-v1/ui-tooling-transition-2d01cb0629c473b0.json`, semantic
SHA-256 `2d01cb0629c473b0b8cfc222947c15c645abd923743ad955d167d82e9176172e`.
It retains the original `17a3edcf…` lint digest in the authenticated historical
record and archives the actual current `a665e599…` bytes separately. Original
lint bytes were not recovered, and no read API invents or substitutes them.
Version-two UI input loading exposes current source pins and historical tooling
pins separately. Four regressions verify this distinction, reject arbitrary
historical claims and keep runtime-source mismatches fatal. No numerical owner,
model, historical report, class clock or correction phase was changed.

The next probes opened the actual UI and found an additional test-harness issue:
the generic checkout codec does not recognize `GreaterMagebloodElixir`. The
model-bound normalizer now uses the exact qualified Node codec
`ddda496c…` and stat/pseudo-stat enums from the compiled UI's actual common-proto
source `90558758…`. It preserves the same cap-level/default/zero-padding
comparison scope, with strict consume parsing and no dropped nonzero values.
Five tests pass against all three actual exported settings; unknown consumes,
lower levels, excessive vectors and foreign codecs remain rejected.

The version-three probes then exposed a real delivered-default error: the
first-visit target had an unspecified creature type instead of the confirmed
Dragonkin type. Hunter Monster Slaying can make that difference numerical, so
the comparison was not weakened or normalized away. Release `92adc3b779315f2f61371019`
remains an unselected candidate that failed the first-visit check.

The next presentation adds an optional standalone encounter default, cloned
before loading it so personal edits cannot mutate class defaults. Only Hunter
provides the new option; raid embeddings keep their existing encounter. The
Hunter preset supplies the exact encounter from all three confirmed builds.
Ten actual-export presentation contracts and eight encounter/codec regressions
pass. The version-three builder produced immutable candidate `ef2ce231825f400e6ad8ca7e`
with 822 strict TypeScript sources and all 3,499 output files;
version-four browser/saved-character/control probes require that candidate's
actual release and proof hashes. Final browser and application approval remains
pending. Earlier frozen sources, failed candidates and failure logs are preserved;
the numerical engine, qualified settings, seeds and original clock are unchanged.

## Atomic Gear Set persistence

The corrected encounter candidate `ef2ce231825f400e6ad8ca7e` passed the
first-visit and saved-character checks. The saved-character test also changes
the target to Humanoid and the duration to 217 seconds; both personal encounter
choices and removal of a weapon enchant survive desktop/mobile reload.
Its real UI smoke test then found a separate persistence bug during Beast Mastery
to Survival Gear Set switching: ammunition changed and emitted the shared event
before the off-hand stone was applied. The live player changed, but storage had
already recorded that event ID and retained the earlier consumes.

A new preset overlay applies all hook changes inside `TypedEvent.freezeAllAndDo`.
The class guard stays outside that helper because the upstream helper logs and
catches exceptions. The regression executes the generated callbacks with the
actual upstream event dispatcher and real qualified protobuf decoders, checking
that one persisted event contains the final ammunition and both weapon consumes.
The failed candidate and raw failure report remain intact. The next candidate
must pass all configuration/Gear Set transitions, sharing, saved-character and
selected native/WASM checks before local selection.

The first selected-control run reached the result screen, then failed while
persisting evidence because its filename whitelist rejected the underscore in
`beast_mastery`. That result has no retained raw capture and does not qualify
anything. Its failure report and original log are retained. A separate filename
helper now accepts the actual variant keys while rejecting traversal, separators,
hidden names and excessive length; two regressions pass. Runner version six
repeats the existing fixed controls without changing seeds or fresh holdouts.
The final delivery receipt must disclose the unqualified initial run separately.

## Saved evidence and verification

The hash-verified capture retains selected original rows, parent/child spells,
source table hashes, rating conversions, historical icons, quest requirements and
the inherited engine sources. Historical item stats are not used.

- Fixture: `infra/simulator/fixtures/hunter-beastmaster-source.v1.json.gz`,
  byte SHA-256 `6d72170e42d72e963d636ab3668366156f22652d22de64685b489a0e96923f3b`.
- Capture receipt: `hunter-dungeon-upgrade-v1/source-c9c8068d6e54e4ac.report.json`,
  byte SHA-256 `c9c8068d6e54e4ac101f593aa7a3e49d1e56d108df5b14f4c610a50fa17d5d3b`.
- Preparation: `hunter-dungeon-upgrade-v1/review-bbcd5e66fa1c12f4.json`,
  byte SHA-256 `bbcd5e66fa1c12f410cd44763192421e150221dc3dd6fa80e9efa5f30c2ccf53`.
- Isolated engine verification:
  `hunter-dungeon-upgrade-v1/engine-tests/verify-9hsfWT/report.json`, byte SHA-256
  `39d3e1a6d85ded4e91be4816bc55c9673be1d34a95a012014dcc3cef059ae229`.

The report paths are relative to
`artifacts/forever-simulator/optimization/`. Older immutable preparation records
remain historical; the exact current source hashes are in the latest named record.

Seven source/draft tests pass, including changed proc masks/chances, wrong resource
amounts, pet target and school changes, weapon-versus-spell crit, base-versus-total
armor, altered duration/periods, unreviewed effect fields, alternate-set substitution,
unverified reward inference and input preservation. All five existing catalog-audit
tests also pass. Two additional dispatch tests preserve existing Darkmantle and
independently prepared Heroism overrides, reject changed/duplicate anchors and
preserve inputs. Scoped ESLint passes for the new JavaScript modules.

The isolated Go receipt records ten passing top-level test functions: six Hunter
groups plus the existing Darkmantle, compiled-database and two Valor regressions.
The negative run fails on both missing base-set thresholds and missing pet auras
before the correction. All 475 pinned parent source files remain unchanged.
Earlier failed harness attempts are preserved separately and do not qualify a
model or numerical result.

From the repository root:

```sh
node --test infra/simulator/hunter-beastmaster-source.test.mjs \
  infra/simulator/hunter-beastmaster-dispatch.test.mjs \
  infra/simulator/dungeon-upgrade-catalog-audit.test.mjs
node artifacts/forever-simulator/optimization/review-tools/capture-hunter-beastmaster-source-v1.mjs --capture
node artifacts/forever-simulator/optimization/review-tools/prepare-hunter-beastmaster-review-v1.mjs --prepare
node artifacts/forever-simulator/optimization/review-tools/verify-hunter-beastmaster-engine-v1.mjs --verify
```

Capture and engine verification require the preserved private source artifacts;
Node tests use the compact fixture. These commands start no optimization jobs.
They write separate immutable evidence and isolated test workspaces, without
selecting a release, changing a catalog/preset, deploying or starting a budget ledger.
