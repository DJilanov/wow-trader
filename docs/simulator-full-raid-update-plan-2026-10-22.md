# Bounded full-raid preset updates

## Authorization and limits

On October 22, 2026, the owner explicitly answered **“Yes, authorize the bounded
full-raid updates”** to the request for a separately recorded update window for
Warrior, Rogue, Hunter, Druid, Mage and Warlock **after Retribution and Shockadin**.
Question reference: `call_8183aa9693344b5d83183075f2db2d03`, item 0.

This is authorization for new work, not a reset of an expired original window.
Preserve original class ledgers, study declarations, measured results and releases.
Start each separate update clock only with its first actual supervised update job;
none had started when this initial authorization record was written. Current
execution status is recorded below. Target
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
   player buffs and the required maximum of 16 boss debuffs. Do not import old
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
   Preserve every inspected request's actual seed and identity. If a confirmation
   protocol requires another inspected seed, perform an explicit remeasurement
   with the contender list and incumbent unchanged; retain both source records.
   Do not relabel an old metric or silently drop contenders to fit a batch limit.
7. Deliver the same qualified settings to the first-visit default, Preset
   Configurations, Gear Sets, library and exact rotation guide. Verify desktop,
   mobile, item stats, single scrolling and Simulate. Compare the actual live
   release with the approved local release during a separately authorized deploy.

Keep newly completed specs, remaining Warlock specs, optimized tanks, catalog
coverage, access uncertainty and incremental-update requirements in the overall
campaign. This update authorization does not imply that those tasks are complete,
authorize a deployment, or allow silent deadline extensions.

### October 24 engine-cap verification gap

The controlled-fight readers' sixteen-active-target-aura union check does not
establish global runtime debuff enforcement. Inspection of the actual frozen
Hunter model `50df0df3d3d0124bb3b14791` central aura code found no shared capacity
check in `Aura.Activate`: after exclusive-effect checks it activates the aura.
Its `activeAuras` tracker contains only expiring auras, so counting that slice
would also omit permanent raid debuffs. The exact `sim/core/aura.go` byte SHA-256
is `2e4d188fb765207d7d9ba90a2c513488b41560f60d7e79ffb589ddf060ea60b1`.

An isolated Go runtime audit now confirms the counterexample: seventeen distinct
real Forever negative-aura providers remain active on an enemy target, for both
finite and permanent durations. Refresh preserves seventeen; explicit
deactivation leaves sixteen and reactivation restores seventeen. The expiration
tracker contains seventeen finite auras but zero permanent auras. No combat time
advances and no actions are scheduled. Both baseline observation subtests pass;
both sixteen-slot requirement subtests deliberately fail. This verifies the gap,
not completion of the cap.

Reproduce with `node artifacts/forever-simulator/optimization/review-tools/inspect-boss-debuff-cap-v1.mjs --inspect`.
The saved report is
`optimization/boss-debuff-cap-v1/attempts/inspect-qvgud1/report.json`, under
`artifacts/forever-simulator/`, semantic SHA-256
`f294394068749550ce6b01f8a4b3ee99509b54b338026bf8aba74adfd6c5efb5`.
It records raw Go JSON output, command, test source, and parent hashes. All 478
parent pins remain unchanged. The derived workspace copies all 465 non-test
inputs and adds only the capacity harness; thirteen unrelated parent test files
are explicitly excluded because the frozen release omits their upstream test
helpers. The initial build-only failure is preserved in sibling attempt
`inspect-vMHyAI`; it is not runtime evidence. Five parser regressions reject
compiler errors, panics, missing outcomes and invalid observations.

Global enforcement remains unfinished. It still needs correct negative-aura
membership, refresh/expiration accounting, the declared server replacement and
priority policy, and proof that friendly/player buffs stay unlimited. The audit
directly activates actual providers; it does not claim a server-valid raid
composition or establish eviction rules. Existing frozen studies and binaries
have not been edited; their controlled-fight checks remain selection evidence
for their declared scenarios. Complete qualification and arbitrary-input delivery
must not substitute those checks for the required engine behavior.

The owner chose **verified Forever behavior, with overflow qualification kept
pending**, on October 24 (`call_45eee625431943cda943d6a0f34f4ea9`, item 0).
Do not substitute an assumed reject-new or eviction rule. The requested
sixteen-slot scenario remains in scope. Blizzard's
[2018 Classic announcement](https://worldofwarcraft.blizzard.com/en-gb/news/22646759)
establishes the historical Classic limit; it does not establish Forever overflow
behavior. The [VMaNGOS slot implementation](https://github.com/vmangos/core/blob/development/src/game/Objects/Unit.cpp)
and its [aura ordering code](https://github.com/vmangos/core/blob/development/src/game/Spells/SpellAuras.cpp)
are useful comparisons for classification and displacement, not evidence of
Forever server rules. Continue the remaining class and delivery work while this
qualification stays explicit.

## October 22 weapon and delivery audit

Latest repeat at14:19UTC: `optimization/weapon-audit-be23c184e0e69957.json` now supersedes
the older live-staleness results below. All15profiles,28local/28livepreset entries and
24local reviewed library links were checked. Only Ret differs local/live; both live
Priest defaults now have272683Spellblade(+94genericSP,+1%crit). Actual fresh Chromium
desktop/mobile visits additionally confirmed Shadow and Smite's3weapon slots/enchantIDs
at1440/390widths:4checks,0pageerrors,0combat,0productionwrites. The only remaining role
flag is unfinished DS/Ruin Sageblade22383in local+live starter metadata, not a qualified
DS/Ruin result. Six weapon-audit regressions rerun and passed. This audit did not deploy.

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

Repeat at 13:03 UTC: report
`artifacts/forever-simulator/optimization/weapon-audit-d9fa4d688feadbe9.json`.
All 15 profiles, 28 local and 28 live metadata entries, and now 24 selected local
library builds were checked after qualified Retribution selection. The ten caster
library main hands remain relevant spell-power weapons. The same six live caster
starter rows and unfinished local DS/Ruin row remain flagged. Retribution adds a
sixth local/live presentation mismatch because it is selected locally but not
deployed. No combat, preset edits or deployment were performed by this repeat;
all six weapon-audit regressions were rerun and passed.

## October 24 continuation: current execution and remaining delivery

The complete original campaign remains open. These entries distinguish executed
evidence from prepared code; none authorizes publication or resets a class clock.

| Area | Current evidence | Status |
| --- | --- | --- |
| Rogue full-raid confirmation | Complete independent source/owner review and direct cross-builder checks passed for the three preselected primaries; both 2% and original 1% accepted | Numerically confirmed; matching private UI verified |
| Rogue delivery sources | Actual ten-study source audit authenticated 432,808 native origins / 82,257,280 iterations and sealed namespaces; 20,745 files pinned | Passed; original choices and owner retained |
| Rogue exports and virtual presets | Three unchanged builds and complete rotation guidance; compiled release 3af0f3b699865a9396efdad9 retains all 22 pages, with 821-source strict TypeScript pass | Compiled; application/profile/library adapters implemented and tested |
| Rogue delivery types | 50 focused web tests plus eight raw-wire tests pass; full web TypeScript passes; real fixture binds the application to all three exports and complete guidance | Implemented; 39,090 source/evidence files verified |
| Rogue built-in browser checks | Six actual desktop/mobile controls match complete native metrics; configuration/Gear Sets/sharing/saved-character checks pass; actual current-host completion/error/cancel/privacy checks pass | Implemented and verified; arbitrary debuff overflow remains unqualified |
| Rogue application delivery | Actual Next.js desktop/mobile checks and three promotion contracts pass; local application readers verify all three exact build IDs and DPS values after selection | Selected locally October 24 at 21:51:55.180 UTC, before the original deadline; all other profiles preserved; not deployed |
| Mage full-fight controls | Thirty actual UI/native/WASM pairs plus six unchanged-parent controls; corrected duplicate-Evocation comparison preserves every metric row and original failed owner | Corrective owner and independent completed admission passed |
| Mage gear compatibility | All 497 controls have equal DPS; complete-metric replay found matching roundoff-induced undefined Scorch aura spread in one record | Owner stopped before scalar gear search; all retained controls replayed for diagnosis; comparison prototype remains diagnostic-only |
| Mage engine variance correction | Complete unselected release b471ac0808fb745c26205a72; 99 Go regression outcomes, four asset contracts, unchanged 2,695-item catalog/22 pages/codecs and 45,613 verified pins | Model built and independently validated; strict finite gate unchanged; additional correction approval, model-bound combat controls and complete numerical qualification pending |
| Mage feedback/confirmation compatibility | Feedback v3 and confirmation v2 use corrected source gates, full metric multiplicities and unchanged search/RNG policy; 39 contracts and 13,573 hashes verified | Implemented; actual completed gear/feedback required before dispatch |
| Hunter geared feedback and fresh confirmation | All three styles stable; 42 alignment jobs / 420,000 iterations and all 652 fresh jobs / 13.04M iterations complete; original primaries retained | Fresh owner succeeded; both 2% and original 1% accepted; canonical independent completed-source review and exact three-build export passed under the original October 25 05:03:16.065 UTC deadline |
| Hunter full-raid guidance | Every effective action, pre-pull, talent, pet and ammo binding; all declared policies/retained states and mana-elixir choices; nine contracts and 45,658 preserved pins | Implemented and validated against all three actual saved stable feedback frames; qualified Hunter UI/profile/library delivered locally; production unchanged |
| Hunter full-raid export | Canonical completed-source replay and unchanged primaries; exact raw result/stat bytes, complete native unit parity and 9,478 authenticated source pins | Actual export c6b96aa9b2177e87 passed; matching immutable UI compiled; actual browser/profile/library verification passed; Hunter selected locally at 02:33:36.946 UTC before the original deadline |
| Hunter full-raid preset compatibility | Nine virtual files; exact saved settings, profession/ammunition/weapon-stone safeguards, all sixteen Gear Set transitions; nine contracts, 545-source clean strict TypeScript pass and 45,765 preserved pins | Original prototype retained; actual qualified-export binding, compilation and browser/application/library checks passed; selected locally |
| Hunter complete presentation preparation | Thirteen modules; 51 virtual files, all 28 retained presets, clean 822-source strict TypeScript, thirteen lint/format/bundle checks and 45,783 preserved pins; four source-backed tooltip tests pass | Settings-only preflight passed; optional Pet/Melee starter repaired without changing measured setups; actual-export tests, compiled delivery and desktop/mobile checks passed; Hunter selected locally |
| Hunter selected UI combat controls | Separate raw worker recorder, single-fight capture driver and full request/owner/pet/target binder; nine contracts pass on all three real saved controls; seven sources and 45,792 pins verified | Prepared and source-verified; all six actual desktop/mobile controls passed at the existing fixed seed; one earlier capture-write failure is disclosed separately and qualifies nothing |
| Hunter host and saved-character reviews | Current HTML completion/error/cancel/privacy guard checks and isolated desktop/mobile personal-character reload probe; four linted/formatted/bundled sources and 45,803 preserved campaign pins | Prepared; actual completion/error/cancel/privacy checks and personal-character reload pass; shared application source snapshots remain separate from frozen class/numerical sources |
| Hunter compiled UI and typed build reader | Atomic candidate 29d2a2c67bc4922af0cef622 retains 22 pages/3,499 files and unchanged numerical assets; 822-source strict UI typecheck; 11 actual-export plus eight encounter/codec regressions; 28 web build-reader tests | Independent verification passed all files, three full settings links and nine engine assets; 40 desktop/mobile UI checks, two personal-character checks and six complete native/UI comparisons pass; actual dashboard selection/reload and 59 shared web tests pass; 50,638-pin final validation passed and only Hunter selected locally |
| Hunter browser harness compatibility | All 9,478 numerical files and 45,802 other historical inputs unchanged; one historical lint snapshot separated from current config; four integrity regressions and five model-bound codec tests pass | Probes exposed and corrected a first-visit target-type mismatch and non-atomic preset persistence. Failed candidates retained; actual event-dispatch regression passes; current candidate passed browser/application verification and is selected locally; numerical model/clock unchanged |
| Druid geared feedback foundations | Twenty-one modules, seventeen passing contracts and 8,865 verified hashes; proposal-state, consumes, typed requests, retained coverage and bounded closure prepared | Implemented; completed gear independently replayed; Feral branch completed stable; Balance stopped at a nonfinite Eclipse statistic |
| Druid feedback execution and source admission | Supervised two-style runner, complete current controls, selected-frame validation and independent raw-origin replay; 25 contracts, twenty new sources and 39,112 verified campaign pins | Feral completed 13,932 native jobs /2,703,620 iterations; all488 initial controls match DPS, but one Balance control has nonfinite uptime deviation; owner failed explicitly; all-style completion/source admission pending |
| Druid fresh confirmation | Fixed primary, every retained contender, genuine seed alignment, global full-range claims, separate 2%/1% assessments and independent completed-source replay; 55 contracts and 39,154 verified pins | Complete implementation prepared; gear source admitted; completed feedback/fresh execution and matching UI delivery pending |
| Druid metric execution compatibility | Full-row and strict duplicate-aura prechecks in v2 control/gear/input gates; 40 tests, 31 linted/formatted files and 13,610 verified hashes | Implemented; current twenty-case preflight passed |
| Druid ordinary admission | Original failed workspace-lease attempt preserved; same command resumed after release; twenty real browser/native pairs and four parent comparisons passed complete metric review | Owner succeeded and independent source replay passed with 8,875 pins; no correction allowance used; original October 25 23:25:34.014 UTC deadline retained; gear source admitted; feedback/fresh delivery remains pending |
| Druid post-control gear search | All 369 native/WASM canaries passed; 11,923 Feral and 11,846 Balance candidates; eighteen declared set comparisons for each style | Ordinary owner d13836bf succeeded with 62,051 native jobs /10,387,960 iterations; both branches stable; canonical result fc38a055021a341d retained; independent review replayed every origin and400 stages; subsequent feedback owner0198e4bf failed the strict metric gate; no final qualification |
| Druid statistics correction | Exact Eclipse variance cancellation reproduced from976 saved captures; complete derivative57ac00a190de1da00d51b72d preserves2,703 items/22 pages and changes only three production statistics files | All164 native regressions and independent5,507-pin source/asset review pass; actual model-bound controls and complete numerical requalification remain; no corrective owner dispatched,clock reset or public selection |
| Druid full-raid guidance | Effective-request/database/full-v2 binding, every action/condition, all policies and retained source talent states, Tea/Rune and None/ordinary/Greater Mageblood; eight contracts and 40,112 verified campaign pins | Implemented as a source renderer; actual qualified exports and UI/profile/library delivery still pending |
| Druid matching preset preparation | Eleven virtual files compose atomic class presets, exact cloned encounter defaults and the qualified common protocol/consume picker; eleven contracts and a strict 541-source/11-virtual-file typecheck pass | Settings-only preparation 764fffb4efab5504 adds explicit lint/format/six-graph checks and proves all generated files unchanged from 308e3fc72db5d1b3; numerical inputs unchanged; final gear/feedback/fresh qualification, exact export binding and actual UI/application/library verification remain pending |
| Warlock Deathmist passive component | Exact-ID flat bonuses; fourteen matching native/Chromium-WASM cases, eight source regressions and 40,104 preserved source/evidence pins | Implemented and verified as an unregistered component; fear, complete dispatch, full model and numerical admission remain pending; existing October 23 window unchanged and expired |
| Restoration Shaman foundations | Captured build 70532 graph reproduced; nineteen basic ranks extracted; sixteen direct ranks compiled against 666 unchanged parent files with only two additions | Source preparation fa056150093671a6 and direct component 88ec4f31c834d9e0 sealed; eight source/three rendering/three direct-domain contracts and five actual native/browser controls pass, with twenty matching measurement groups; direct guard composes the broader policy whose five tests also pass; conservative acquisition boundary retains fifteen conditional direct ranks; full class qualification and delivery remain pending; no optimization clock or numerical qualification |
| Priest base Virtuous coverage | Selected-runtime omission confirmed; exact70532 source captured; isolated2,688-item proposal preserves all2,680 parent items; shield payload rendered from reviewed source | Ten source/renderer contracts and22 native/22 actual Chromium component checks pass; incoming-event/family/reward admission,full dispatch,new model and numerical comparisons remain; closed Priest window unchanged |
| Global boss debuff overflow | User chose verified Forever behavior with rejection/eviction qualification deferred | Pending; no invented seventeenth-effect rule |

The first Mage correction changes validation rather than the game model. Evocation's
regeneration and channel auras legitimately share spell ID 12051; comparison now
checks an exact-multiplicity multiset instead of assuming unique ActionIDs. The
failed original owner, raw captures, RNG, all frozen sources and original window
remain unchanged. Gear/feedback/confirmation consumers must use compatible gates
before dispatch; no historical source or terminal status may be rewritten.
The later statistics correction is a separate engine build: it replaces unstable
variance arithmetic while preserving gameplay source. Its fresh qualification
cannot reuse old-model fights and still needs the pending additional correction
approval.

See the [Rogue](simulator-rogue-dungeon-upgrade.md),
[Mage](simulator-mage-dungeon-upgrade.md),
[Hunter](simulator-hunter-dungeon-upgrade.md),
[Druid](simulator-druid-dungeon-upgrade.md) and
[Warlock](simulator-warlock-dungeon-upgrade.md) recovery documents for commands,
actual artifact hashes, tests and outstanding qualification. Matching public
defaults, presets, Gear Sets, library and rotation guidance, desktop/mobile
verification and authorized release remain required. No commit, push or deploy
was performed by this continuation.
