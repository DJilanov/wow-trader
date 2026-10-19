# WoW Trader project context

Last updated: 2026-10-19

## Active owner decision and deployment — October19

The owner approved a DISCLOSED2% retained-contender margin for the practical first pass.
This resolves the earlier pending-policy blocker. Preserve the original failed MM1% result
unchanged; do not claim that a new2% contract or MM delivery has already been completed.
The owner also explicitly requested COMMIT/PUSH/DEPLOY HUNTER. Immediate deployment scope
is the already accepted and browser-approved Beast Mastery build/UI94239fb7240949919b83f8ad,
not unfinished MM/Survival. Keep Warrior's current live selection and unrelated production
features. Stage only simulator/dependency changes on the current production source, verify
desktop/mobile/full imports/presets/guide/real small combat, then reload Helper WEB ONLY.
No database migration, ingestion/crawler/guild restart or unrelated dirty-source deployment.
DEPLOYED successfully2026-10-19T03:39:39Z: source0356a87 pushed, release
kfc-helper-hunter-reviewed-20261019-r2, buildf6wrYfrlHBX0eIkZ51X3f. BM is live at
https://kfcguild.online/tools/forever/simulator/hunter with full presets/gear/enchants and
six-priority rotation guidance. Public desktop/mobile/full-import/persistence/25-fight combat
and Warrior regression smokes passed. Local485 web tests/lint/tsc and Linux99 focused tests/
production build passed; all3,494 Hunter assets verified. A concurrent newer leveling release
was preserved by restaging from it; ONLY Helper web restarted, protected services unchanged.
Rollback: kfc-helper-leveling-campaign-test-20261019-r1; private backups
shared/backups/hunter-20261019-r2.UPyGyq. Temporary staging processes/tunnels stopped.
See docs/hunter-production-publication.md for the exact receipt. MM/Survival are NOT promoted.
Original Hunter class clock remains2026-10-18T21:33:17.772Z →2026-10-19T21:33:17.772Z.
MM2% delivery resumes after this rollout; no completed numerical searches need restarting.

## Goal and current target

Build a player-facing WoW economy product with a build-versioned item/profession/recipe archive,
approximately 30-minute Auction House history, realistic crafting opportunities, and evidence-backed
market guidance. TBC Anniversary remains the original validation baseline; Forever Classic Beta build
70291 is now the active public catalog. Build 70205 remains the current validated world/leveling archive.

Client presence, announced content, phase availability, observed sources, and estimated drop rates
are separate facts. Extraction can reveal a shipped rare recipe before it drops, but it cannot prove
its server-side source or probability.

## Repository and stack

- Remote: `git@github.com:DJilanov/wow-trader.git`
- Local: `/Users/dimitarjilanov/work/test/wow-trader`
- Branch: `main`, tracking `origin/main`. Production web release
  `kfc-helper-simulator-prebis-20261016-r15` is active; reference publisher remains on the r10 runtime.
  Web build `mrHKZCVJebJBWwyjWNUdm`, engine `5df1a1d37d43e95fa440c1b5`. The r13 defaults and r12 workspace
  and r11 original simulator releases remain available for rollback. No new commit/push requested.
  Both retain the v3 reader accepting v1/v2/v3 facts. Roll back web only to compatible
  `kfc-helper-xp-reader-20261016-r10`, not a v2-only r9 or earlier release.
  `kfc-helper-library-20261015-r7`, `kfc-helper-zones-20261014-r6`,
  `kfc-helper-xp-20261014-r5`, `kfc-helper-chapters-20261014-r4`,
  `kfc-helper-route-20261013-r3` and
  `kfc-helper-campaign-20261013-r2` retain earlier
  campaign reader; `kfc-helper-premade-20261013-r1` retains the earlier circuit.
  The October 10 talents release also
  remains available. Older rollback remains
  `kfc-helper-leveling-preview-20261004-r1`. Ingestion remains independently pinned to
  `kfc-helper-ingest-auction-20261001-r1`.
- Primary stack: strict TypeScript, pnpm/Turborepo, Next.js, Fastify, Zod, Drizzle, PostgreSQL.
- Boundary tools: .NET 10 for CASC/DB2 extraction and Lua for the in-game collector.
- Full architecture: `blueprint.md`.
- Market workspace, AH source, valuation, signal, and staged UI plan:
  `docs/market-workspace-plan.md`.
- Original Forever leveling route, At-level dungeon timing, shared XP/time calculator, RestedXP
  compiler and pending supporter/payment gates: `docs/forever-leveling-product-plan.md`.
- Revised primary-navigation Leveling product, faction/race/style setup, chapter dashboard,
  current-list reader and party-aware policies: `docs/forever-leveling-experience-plan.md`.
- Account-wide make-or-buy rules, profession profiles, and Forever migration:
  `docs/account-crafting-network.md`.
- KFC Helper subdomain, route contract, Encyclopedia scope, and activation plan:
  `docs/helper-encyclopedia.md`.
- Item-stat normalization, in-game tooltip composition, BiS calculation, and acquisition-source
  graph: `docs/item-library-bis-sources-plan.md`.
- Build-versioned BiS inputs, shared legality rules, class-family mechanics, search, confidence gates,
  and Forever activation: `docs/bis-algorithm.md`.
- Talents Forever public-export audit, evidence schema, preview Encyclopedia, calculator, stable
  build sharing, licensing, and client-reconciliation plan:
  `docs/talents-forever-integration-plan.md`.
- Forever Beta build 69893 client audit, product-specific extraction, item/recipe migration,
  encounter evidence, observed actor binding, and model pipeline:
  `docs/forever-beta-extraction-plan.md`.
- Forever proper Encyclopedia maps, spatial evidence, instances, runtime encounter/loot collection,
  item source graph, mob observations, and quest archive:
  `docs/forever-encyclopedia-plan.md`.
- Tested operation and Forever migration: `docs/runbooks/tbc-validation.md`.

## Latest delivery and remaining validation

### Repeatable pre-raid simulation campaigns (October 17)

- Latest owner-approved optimization order: PHYSICAL → CASTERS → HYBRIDS. Finish Warrior
  (Arms/Fury and their explicit proc scenarios), make the final reviewed builds inspectable on
  localhost, then Rogue → Hunter → Feral Druid. Complete caster specs next; only then proceed
  to Enhancement Shaman → Retribution Paladin, reusing the reviewed physical and caster tooling.
  This supersedes the earlier physical → hybrids → casters suggestion. Finish one spec's full
  feedback/audits before advancing. Warlock work so far was read-only preparation, not simulations.
  This is the research order, not a claim that the runner already supports those pending policies.
  Tank survival/threat recommendations remain separate objectives, not DPS completions.

- October17 owner priority: after a spec's final feedback/audits are reviewed, update the embedded
  simulator's **Preset Configurations and Gear Sets before BiS guide pages**. Both surfaces must
  come from the same completed reviewed build (all17 slots/enchants, matching talents/APL and
  spec options). The separate outer local reviewed-build selector does NOT satisfy this delivery
  requirement. Preserve player-saved builds and explicit provisional-proc consent. Perform engine
  preset integration/rebuild only at an ownership/input boundary, not under a live campaign;
  validate actual built-in clicks and fresh/saved-browser behavior before calling a spec delivered.

- Long-term product clarified: original, crawlable Wowhead-style per-class/spec BiS guides,
  not just the simulator/build picker. Reference was read directly; its Classic/SoM rankings
  are NOT Forever evidence. Guide contract now includes every slot, tested alternatives and
  dependent pairs/set packages, source/location/confidence, enchants, talents, rotation and a
  practical acquisition checklist. See `docs/simulator-rotation-guides-content-plan.md`.
  Independently tested alternatives, practical availability-filtered cases and the guide-data
  publishing adapter remain future work; current uncapped Rank14 cases cannot imply easy pre-BiS.
  Current adapter inspection confirms `CatalogStatRow` uses client stat IDs/ratings, whereas the
  simulator uses normalized 44-stat values (Lionheart12640: raw28 CritRating →engine stat19=2).
  A guide adapter must keep those schemas/units separate and must not feed compiled vectors into
  the TBC evaluator or invent unmeasured per-slot alternatives. Recorded in the guide-content plan.

- User requested that the complete workflow be easy to rerun after new items release, not a
  collection of manual ad-hoc simulation commands. Entry point: `pnpm simulator:prebis:update`;
  read-only `simulator:prebis:plan` / `simulator:prebis:status`. Runbook:
  `docs/simulator-update-runbook.md`; configuration: `infra/simulator/prebis-campaign.json`.
- Versioned input/item/source fingerprints conservatively invalidate every configured case.
  Automatic prepare/verification, release-aware browser templates, a checksum-protected temporary
  loopback server, serial spec/scenario runs, atomic checkpoints, strict resume hashes, disk
  reserve and immutable final receipts wrap the existing full-slot/set/enchant feedback tools.
- Both final accessory audits and final rotation must pass. Confirmed gains return through full
  feedback, including actual-browser accessory recapture; all final RNG ranges are checked
  together. Nothing publishes presets, deploys, touches saved player builds or commits code.
- Current automated class policies remain Arms/Fury (conservative and opt-in provisional procs).
  Other21 captured damage profiles, Shockadin and tank policies are explicitly pending, NOT
  presented as complete. This does not complete the persistent all-class optimization goal.
- Earlier continuation was PROGRESS: saved the completed proc gear raw/range reviews and added
  tested bounded scalar-stage execution plus family/control-aware ranking with real request/
  metric replay. Final scope remains every requested class/spec and practical guide delivery,
  not just these helpers or the three scoped Warrior exports. Last read-only campaign status
  is the same4ee5e4d6… identity, numerical changes=false, actual parent51962 alive and40.11GiB
  free. No production deployment/default-preset promotion, commit, cache migration or deletion.
- Following continuation was also PROGRESS: added owned readonly
  `scripts/review-prebis-accessories.mjs` /`.test.mjs` plus the private lazy expanded-policy
  request producer below. All12 verifier tests and47 combined producer/storage/stage/ranking
  tests pass,0 skipped. All six current completed Arms/Fury accessory audits pass actual full
  replay with the new verifier. No new numerical model/source/worker-count input was changed;
  campaign4ee5e4d6… still reports changes=false/owner alive, last39.96GiB free. Current proc
  trinket screen has finished all1,625 pairs and precision checks for7 candidates with no
  established challenger; the next continuation's full raw/range reviews are recorded below.
- Preceding continuation was PROGRESS: proc trinket stage is complete with independent raw/range
  receipts, the sixth browser holdout row and completed secondary subcontrast are saved, and
  the entire wider request-generation proof85f6a56796bdd149 has passed and is terminal. This
  does not finish the current proc case, wider numerical Warrior search or all-class objective.
  Native rings9106 remains active; browser resumer53287 has since completed successfully as
  documented below. No model/input mutation or deployment.
  Latest status remains4ee5e4d6…/changes=false/owner alive,39.92GiB free. Ring screen was last
  observed533/3,794; current browser seventh job is70,021/100k. These are observations, not
  completion or substitutes for checking the actual handles on the next turn.
- Earlier continuation was PROGRESS: all eight browser measurements are now saved and the
  complete producer and independent request/context/contrast/allocation reviews pass. Ten new
  reviewer regressions and11 existing contracts pass,0 skipped. The tested primary Spearing
  policy has no established gain; wider numerical search/native parity remain pending. Native
  rings9106 continues on six workers. No policy/default/source promotion or deployment.
  Latest actual status: same4ee5e4d6… identity, numerical changes=false, owner alive,39.4GiB
  free. All3,794 ring pairs are screened;31 close candidates/control are now in both100k
  confirmations. These are ongoing measurements, not a completed ring verdict.
  Shared repository HEAD moved externally to c315dd3 (merge); this goal turn created no Git
  commit/push/deployment. Both verifier byte hashes remain unchanged and a fresh current-input
  status still matches4ee5e4d6… with changes=false. Preserve the external commit and unrelated
  reference-crawler documentation edits; no rollback/reset was performed.
- Current continuation is PROGRESS: implemented a private, pure reviewed-to-built-in preset
  overlay and readonly staging probe. `reviews/reviewed-preset-staging-00bd0f61e51932f3.json`
  prepares all five Arms/Fury gear/APL/presets files from completed conservative cases, without
  applying them. It reconstructs the real exporter contract from linked gear/talent/browser/
  rotation evidence, checks current model/catalog, pre-raid legality and reviewed enchants, and
  refuses unfinished cases, stale identities and proc defaults. Eight actual-data regression
  tests pass. Preset Configurations receives matching options/consumes/race as well as gear,
  talents/APL; Gear Sets deliberately changes gear/enchants only. Tooltips retain historical
  acquisition/access warnings and do not promise unchanged buffs/encounter reproduce reference
  DPS. Existing specialty builds/default aliases are preserved; player storage is not touched.
  Actual upstream virtual TypeScript proof `reviews/reviewed-preset-virtual-types-1bab83199ba5ce25.json`
  passes with ZERO baseline/candidate diagnostics and an intentionally missing options-decoder
  negative control. An earlier probe omitted the existing Vite ambient declarations and showed
  four probe-configuration errors; including the actual project declaration fixes the probe,
  not application source. No cached files/browser release/preset have been changed yet.
  Private helpers: `review-tools/reviewed-preset-overlay.mjs`, its test,
  `stage-reviewed-presets.mjs`, `probe-reviewed-preset-types.mjs`. At the idle workspace/input
  boundary, integrate into owned preparation sources, rebuild with explicit model compatibility,
  and verify actual built-in clicks plus fresh and saved browser behavior BEFORE BiS pages or
  calling these spec presets delivered. Do not blindly relabel old numerical evidence for a
  new UI release or rerun/overwrite the frozen owner mid-job.
- Completed the private bounded higher-precision handoff: `review-tools/packed-refinement-bank.mjs`
  and8 tests,48 combined storage/stage/ranking/handoff tests pass. Real-data replay
  `reviews/packed-refinement-handoff-183a0e5089196c57.json` rechecks1,629 original raw records,
  reconstructs all1,625 screen requests/1,638 provenance rows and all42 ranked families, retains
  83 selected full requests/85 selected provenance rows (1,454,761 JSON payload bytes), and
  prepares both existing100k audit ranges without losing the required control. Only four
  existing100k records were replayed;162 prepared range-specific requests remain unmeasured.
  NO new combat, RNG allocations, native throughput claim or full2.86m search completion.
  Own temporary copies only were removed. `probe-packed-refinement-bank.mjs` is the isolated
  real-data probe; all original input/cache fingerprints are rechecked, not changed.
- Real temporary-server/current-browser/exact archived-native smoke passes at2 iterations:
  UI796.25/native796.2515962395962DPS. It is an integration check, not a new recommendation.
  The actual campaign command correctly refuses the live ring audit BEFORE any capture/build
  or state/lock mutation. All source inputs of that running audit remain frozen until terminal.
- Latest completed standalone trinket audit: `accessory-trinkets-f28270581eef8136.json`, status
  `no-confirmed-challenger`;1,625 pairs at2k plus two100k ranges for five near challengers/control,
  1,637 simulations /4,450,000 iterations. HoJ+Adaptive retained; Blackhand+HoJ is about0.862DPS
  lower in those independent measurements, not a universal/spec-independent conclusion.
- Ring audit exec37296/PID28579 is TERMINAL SUCCESS: receipt
  `accessory-rings-f2fd9c30f025a040.json`, SHA
  `f2fd9c30f025a040533fcbb2cde0534e15151593c640d30e45fd5fd7f5f7bdde`.
  4,042 pairs screened at2k;23 close contenders plus control checked in both100k ranges;
  4,090 simulations /12,884,000 iterations, no confirmed challenger. Don Julio+Painweaver retained.
  Raw verdicts were independently recalculated; both real accessory receipts also pass the new
  campaign finalization contract. Source archive `source-archives/accessory-audits-e8b2911afb10cd44.json`
  preserves all nine exact old tool/helper sources before the subsequent workspace-only guard edits.
- Only AFTER that audit terminated, integrated owned/borrowed workspace leases into preparation,
  feedback, accessory and rotation drivers. Native builds now check access BEFORE touching source;
  the isolated regression fails without the guard and passes with it. Actual concurrent prepare,
  capture, feedback and rotation invocations were rejected before mutation of the live audit lock.
- All204 simulator tests, scoped ESLint/Prettier and diff whitespace pass. No new full numerical
  campaign has completed through the new orchestration yet; unit orchestration and actual browser/
  native transport are verified, not a fabricated all-spec optimization/publication success.
- REAL one-command campaign is now LIVE: exec64337, owner PID51962. Identity
  `4ee5e4d68523ddd9c910c76efb2562efa72c87719b0b45ec4d78f3d3497a433e`, state
  `optimization/campaigns/<identity>/state.json`. Recheck its actual process/handle before
  reporting liveness. All campaign/algorithm/engine/catalog inputs are now FROZEN. Documentation,
  artifact-only read-only review tools and the outer Next.js review UI are outside that numerical
  fingerprint; they must not mutate engine inputs. Do not start another native build/audit or
  rerun the command while the owner is live.
- Its real preparation passed proto/data generation, focused Go checks and the22-page build.
  CURRENT LOCAL UI is now `e14af46d79721e1ad50a6f04`; native3dde and DB029b remain unchanged.
  All23 request templates were recaptured on the temporary server. Native preflight and new
  immutable Arms blue30045002aca36264 /controlaf4fa79d4cfb4f94 succeeded in the real browser.
- FIRST CURRENT CASE `arms-alliance` is now `reviewed-local`. Feedback session
  `7689b4a88e95ef53caa7ab9d44841924c75841af197ce23b14464d907ea09e9d` is now TERMINAL
  `closed-loop-reviewed`; child70379 is no longer live. Review `feedback-review-cd2316d2b8d206ee.json`
  is `closed-loop-verified`, reference802.3872932620441DPS across400k measurements, talents39/10/2,
  Overpower-first / HS≥90 rage / Slam+Hamstring / Battle stance. Exact-request/current-native
  screening cache reuse and genuinely new independent validation remain distinguishable.
  Final trinket audit child76588 is TERMINAL SUCCESS: `accessory-trinkets-67eeccbda9f46ef6.json`,
  SHA `67eeccbda9f46ef6912ee276643473843fdf19a2b09fc28867b1da139c388614`,
  no confirmed challenger.1,625 ordered pairs at2k; three close challengers/control in two100k
  ranges:1,633 simulations /4,050,000 iterations. HoJ11815+Adaptive272437 retained; BHB+HoJ
  measured about1.01059DPS lower here. All raw confirmation deltas/thresholds were independently
  recalculated, and the receipt passes `campaignAccessoryRanges`. This is not a universal ranking.
  Final ring child85170 and workers85183–85188 are TERMINAL SUCCESS, not live. Receipt
  `accessory-rings-9497ecdc4fe88c3d.json`, full SHA
  `9497ecdc4fe88c3dcd0d2da5b9323f6b9faeb24e98f0b331b151352009c2f10d`:
  4,042 pairs at2k plus25 close challengers/control in both100k ranges,4,094 simulations /
  13,284,000 iterations, no confirmed challenger. Don Julio19325+Painweaver13098 retained.
  Every one of the4,042 screening metrics was matched to its raw cache record; legal pair-bank
  coverage, four-SE shortlist, all25 raw two-range verdicts/deltas/three-SE thresholds and averages
  were independently recalculated. Both accessory receipts and final rotation have14 collectively
  disjoint selection/validation ranges with the final feedback.
  Final rotation child18620 is TERMINAL SUCCESS: `arms-rotation-audit-55c63f0aa47ca97d.json`,
  SHA `55c63f0aa47ca97d602aa9f774e7612c675c42a0d1f9e0af90989ed43ae22222`;
  450 policies,16 finalists, both100k validation ranges retain the exact incumbent. Local export
  `reviewed-builds/warrior-arms-a30c7886fb1c7414.json`, SHA
  `a30c7886fb1c7414ab9a7582292eb0c298047531d9ce8f0ddb4c997101581341`.
  All linked hashes, current resolved rotation policies, full feedback/export fields and exact
  exported baseline settings were recalculated/checked after the real pipeline exported it.
  This finishes ONE Alliance conservative-enchant scenario, not the whole Warrior campaign,
  a practical launch-day setup, a public recommendation or a proof of global BiS.
- SECOND CURRENT CASE `arms-alliance-procs` is now `reviewed-local`, not live or unfinished.
  Original feedback child19186 is TERMINAL; final audit/export evidence is below. Closed feedback session
  `2ff5659ab5a4488032aa2b17dc9e8c28ea7a1e044e1453fa4f6579763ccefbe7`.
  New blue baselinefbfeda650e28a453 /control74ebc2e489feb859 and explicit-proc baseline
  `warrior-arms-crusader-e61f893cb3df9a84.json` were captured by the actual campaign in the
  browser, not fabricated. Starts with the explicitly provisional Crusader model; public use
  must retain opt-in. Both Fury scenarios follow serially; all later class policies remain
  unfinished. Do not start Warlock or another physical class while Warrior is unfinished.
  First-stage rotation screen tested451 policies on two talent controls and retained25;
  241 legal seeds ×25 APLs then THREE stable refinement rounds. First talent stage is now
  TERMINAL SUCCESS: `warrior-arms-e5f326c5fc4c7843-talents.json`, SHA
  `615b0a92de5c1a6bb5f154f5c43c8a0c5270f275080c5eccc639ebd977ef5856`,
  21,378 actual simulations /7,336,300 iterations. Independently checked baseline/gear/DB/tree
  hashes,51-point legality, selectedTalentEvidence and disjoint seeds. Fixed BLUE proc control:
  38/11/2 (`20325213132515201-0505001-2`), Overpower-first / No Heroic Strike / Slam+Hamstring /
  Battle. Both100k ranges validate the JOINT talent/APL gain:584.68208→645.17984DPS (+10.34712%)
  and584.55528→645.06082 (+10.35070%). Not an isolated talent gain or final equipment result.
  Talent subprocess19214 /workers19229–19234 and gear subprocess42128 /workers42140–42145 are
  now TERMINAL SUCCESS, not live. First gear stage `warrior-arms-97f1ee9d34c4d3a2-gear.json`, SHA
  `08022493877b1350bcd781ba553c5da616effbe407d3fd7a1ace43f1883a6227`, converged in FOUR passes
  (24 groups each;14/3/2/0 accepted changes),45,693 simulations /6,296,060 iterations including
  independent validation. All17 candidate pools were independently recomputed and exactly match
  184/43/168/83/240/124/230/209/215/245/64/64/41/41/149/0/47; no item-level floor/accessory EP
  cutoff. Replayed ALL96 recorded search decisions against197 exact raw cached selection metrics;
  before/best scores, acceptance decisions, final gear, legality and all9 enchants match. All four
  raw100k validation records match exactly; talent/gear/selection RNG ranges are collectively
  disjoint. ADDITIONAL full final-pass replay independently regenerated all24 groups and matched
  EVERY raw measurement:10,865 screenings at80 iterations,1,028 rechecks at500 and120 finalist
  comparisons at2k. Reproduced all proposal counts/shortlists/incumbent/winner metrics, including
  3,097 set proposals,4,042 ring pairs and1,625 trinket pairs. No new simulations were run by this
  audit; it verifies coverage/evidence, not independent high-precision per-item alternatives or
  exhaustive global set enumeration (sets retain the configured EP-selected-per-set-slot policy).
  Separate read-only set-structure audit found35 eligible Arms sets and NO set with multiple
  eligible pieces for the same slot. Therefore the per-set-slot EP choice removes no alternative
  variant in THIS case: all3,096 configured multi-piece subsets are covered (3,097 proposals with
  the incumbent). This does not prove completeness for future classes or arbitrary mixed sets.
  Fixed38/11/2 talents/APL:644.9961651088386 blue-control DPS →817.2154382200699 equipment
  DPS (645.0→817.2 in BOTH100k ranges), not a final proc reference or isolated talent comparison.
  The selected gear uses Crusader1900 and BHB13965+HoJ11815; historical-stat/proc warnings remain.
  Report SHA `03f1bee2d1cd9b20295d952cfb2f386527733407ebf50666d37f06e929decfa8`.
  Equipment-feedback baseline `warrior-arms-feedback-1c18732cf0fbc20f.json`, SHA
  `1c18732cf0fbc20f9139825f70479c301873042ea9bbca128a875e909e3e7e72`, is derived from that exact
  selected gear/talents/APL with the original encounter and explicit proc policy; not a new browser
  agreement receipt. Actual-gear talent/APL child57601 /workers57615–57620 are now TERMINAL
  SUCCESS,335 legal seeds ×26 retained APLs after450 policies on two controls. Receipt
  `warrior-arms-22460b08d0850188-talents.json`, SHA
  `044b89b1ac12caac61dba4840ae768dd6e7aa6b02a9c2d74e90619e0c5121e00`, holds THREE stable rounds,
  23,826 actual simulations /8,627,900 iterations. Independent validation CONFIRMS39/10/2
  (`30325213132515201-0505-2`), Overpower-first / HS≥90 / Slam+Hamstring / Battle: same equipment,
  817.1332055→821.8349356DPS (+0.57539%) and816.9954334→821.9526242 (+0.60676%) in two100k ranges.
  Full current algorithm/source/control/native/DB/tree/gear/request hashes were recomputed;
  four raw validation records match exactly and all8 initial/current talent/gear/selection RNG
  ranges are disjoint. This is a JOINT talent/APL gain, not isolated talent-point DPS or a final
  proc recommendation. It replaces38/11/2 inside this research loop only; no default changed.
  SECOND gear child85931 /workers86151–86156 are now TERMINAL SUCCESS. Receipt
  `warrior-arms-d575615f0937deff-gear.json`, SHA
  `e772d07af8f62e5e8835a2517f77bc9843483e9eb3d4325577bfa7e9f689c392`, converged in THREE passes
  (24 groups each;1/1/0 accepted changes),25,246 actual simulations /3,797,020 iterations.
  Same39/10/2 talent/APL:822.0698393→822.9602803 average DPS; both100k ranges confirm the
  COMBINED equipment change (822.03901→822.84404 and822.10067→823.07652). Belt20041 replaces19044;
  HoJ11815+Adaptive272437 replaces BHB13965+HoJ. These are not isolated per-item DPS claims.
  Report SHA `4e61edc6897a6b887189d174d746f837dee306ecac46e52f18a072419315a40d`.
  The new owned coverage auditor passed this exact receipt through all24 final groups:
  10,864 raw80 screenings,1,028 raw500 rechecks,120 raw2k finalists and four raw100k metric
  references;11,942 unique cache records. All pools/shortlists/selected gear/averages and the
  six associated selection/talent/gear ranges match. Immutable coverage proof
  `optimization/reviews/gear-coverage-d575615f0937deff-da8480f5128002cc.json`, SHA
  `aae45ea0b72ac345d6a495f07ad6301c136a8677ee084419b35c2db55a179642`.
  Its final auditor also checks the actual canonical class tree/51-point legality and request
  encoding; earlier044576eb… coverage proof remains immutable, not overwritten or relabelled.
  FINAL actual-gear talent child3322 /workers3570–3575 and feedback driver19186 are now TERMINAL
  SUCCESS, not live. Receipt `warrior-arms-67bbbf3461866946-talents.json`, SHA
  `f024d360579a62ad3744a6612a717d5e06e27374c8d7ae42263394e7ab8b4b95`:241 legal seeds ×26 retained
  APLs after450 policies on two controls, THREE stable rounds,21,652 actual simulations /
  7,246,400 iterations. Retains exact39/10/2 and HS≥90/Slam+Hamstring/Battle priority; final
  selection is `kept-incumbent-no-proven-gain`. Baseline352b95921793b53a, SHA
  `352b95921793b53a65cfa1edd59ef522e417ff105c72dd48e73ade60a63f69e4`, remains the exact core setup.
  CORE FEEDBACK IS CLOSED: `feedback-review-cffc1a6d56cdba00.json`, SHA
  `cffc1a6d56cdba00b638eadcf394598b93028a4b703548f2c67a9a10bd60600a`, reference822.9812807706201DPS
  across400k measurements in FOUR distinct ranges (two selected-gear +two final-talent baseline
  ranges). Final talent A/B is the same setup: four metric references are TWO unique raw cached
  jobs; the core reference does NOT double-count those duplicates. Recomputed every base core
  review field and current algorithm/control/tree/gear/request/native hashes, matched all raw
  final validation records, and verified all12 historical selection/talent/gear ranges disjoint.
  Current3dde uses full-width SplitMix64 in `sim/core/sim.go`/`rand.go`, not the 31-bit seed
  normalization of the unused GoRand wrapper. No RNG correction or engine change was needed.
  Actual browser agreement `browser-verification-9a8036c01030a95a.json`, SHA
  `9a8036c01030a95a6c94570386d7542737c9116a15835bf8aa54147da304244c`: native836.1185538059378 /
  displayed836.12 at25 iterations, explicitly enabled private research proc model. That low-N
  parity result is NOT the independent822.98DPS reference or consent carried by a public link.
  Final trinket audit child23113 /workers23125–23130 is TERMINAL SUCCESS. Receipt
  `accessory-trinkets-51cb19139add9792.json`, SHA
  `51cb19139add9792e6e30547ce277d09392c03a8b79076315ebea7af9efb017e`, has no confirmed challenger:
  all1,625 ordered pairs at2k, five close candidates/control in both100k ranges;1,637 unique exact
  requests /4,450,000 iterations represented. Independently regenerated the full legal bank,
  source/input hashes and audit identity, matched EVERY raw screening/confirmation measurement,
  and recomputed the complete four-SE shortlist and all deltas/three-SE thresholds/averages.
  All15 historical selection/talent/gear/trinket ranges are disjoint. HoJ+Adaptive retained;
  BHB+HoJ is1.3711208DPS lower here, not a universal trinket ranking.
  Final ring child40130 /workers40142–40147 are now TERMINAL SUCCESS. Receipt
  `accessory-rings-97f7ad60d22652b8.json`, SHA
  `97f7ad60d22652b8b671ac3e8953519bf89fc2b7127ac7742a2d2d28c3b4100c`, has no confirmed challenger:
  all4,042 ordered pairs at2k plus29 close alternatives/control in both100k ranges. Independent
  replay regenerated the legal bank, six current input hashes, ten source hashes and identity,
  matched EVERY raw screening/confirmation measurement, and recalculated all shortlists,
  thresholds/deltas/verdicts/averages.4,102 unique raw requests /14,084,000 represented iterations;
  all18 historical selection/talent/gear/trinket/ring ranges are disjoint. Don Julio19325 +
  Painweaver13098 retained. Swapping ring order changes0DPS; 19325+12548 is0.67501DPS lower and
  19325+19514 is0.78140 lower in this exact scenario, not universal item rankings.
  Final rotation child70574 /workers70586–70591 are now TERMINAL SUCCESS. Receipt
  `arms-rotation-audit-4e774e4b5d17cc7c.json`, SHA
  `4e774e4b5d17cc7c69d53d34bc290e9958e45e64fcc9e4c996667f0bfafd1975`, retains the EXACT incumbent
  across450 policies/16 finalists and both100k ranges (823.1033122 and822.9423481DPS). Independent
  replay matched every raw1k/10k/100k metric, source/context/policy hash and winner/selection.
  There are470 metric references but468 unique raw records /810,000 represented iterations;
  A/B is identical, so four final metric references are TWO unique100k jobs, not400k new draws.
  All14 final and20 historical selection/validation ranges are disjoint. Actual cache reports
  17 new simulations /350,000 iterations and451 reused requests, not468 newly calculated jobs.
  Export `reviewed-builds/warrior-arms-50441a87b2c8d7cb.json`, SHA
  `50441a87b2c8d7cb4cf3a16e55b35ab2afb35172cfd8a1f131b10f9dfd53b0aa`, is now complete. Reconstructed
  EVERY exported field, full settings, legal current gear/pools/enchants/acquisition and opt-in
  requirements against the actual receipts/data. Still822.9812807706201DPS/400k core reference,
  39/10/2, Overpower-first/HS≥90/Slam+Hamstring/Battle. No new simulation ran in these replays.
  Internal observer: `optimization/review-tools/observe-accessory-screen.mjs` under the simulator
  artifact directory. Invoke from the repo with explicit `--feedback-review=<core-review-path>`
  and `--kind=rings|trinkets`. Syntax/scoped ESLint, real partial ring and completed trinket
  paths, and missing/unsupported-kind-before-I/O smoke checks pass. It reads only, starts no
  workers/builds and changes no leases or numerical inputs. It is an internal research helper,
  NOT a new required product/setup command. Always pair it with the actual exec/PID checks.
  Public r15/defaults/production are unchanged. Reserve4GiB; most recent recorded status38.66GiB
  free, same4ee5e4d6… identity and ZERO numerical input changes. Recheck before reporting live.
  No cache/evidence was deleted or archived by this agent. The iMac has8 physical/16 logical cores with64GiB RAM;
  six workers is the current software cap, not its hardware limit. No worker change/benchmark
  was made during this frozen run; any future increase needs a measured throughput comparison.
  Earlier free-space low4.44GiB prompted an asynchronous question whether the three
  INACTIVE caches may be losslessly archived/verified and their unpacked copies removed; NO
  cleanup permission received and NO cleanup performed. Active f40bf8aa… cache/reports stay put.
  Later free-space increases (including16.83GiB) were not attributed to this agent. Immediate
  reserve pressure has eased. The unanswered question does NOT grant cleanup permission.
  Later jumps to31.77GiB and40.09GiB are likewise not attributed to this agent; no original cache
  cleanup was performed. Only isolated copies created by the packed-storage probe were removed.
- CURRENT LIVE owned case is `fury-horde-procs`: exec64337 /parent51962 /
  final rings9106 /workers9126–9131, confirmed via actual exec/ps. Final trinkets85247 /
  workers85260–85265 are TERMINAL SUCCESS, not live. Feedback80788 and
  actual-gear talents63467 /workers63492–63497 are now TERMINAL SUCCESS. First-gear8890 /
  workers8903–8908 are now TERMINAL SUCCESS, not live. First-talent80803 and its
  workers80819–80824 are TERMINAL SUCCESS. Session
  `32bd0d33eae17648da325499336a8f726f19e6841e62f36c6d1237cdf6b0047a`.
  Fresh blue `warrior-fury-horde-blue-66f7af9549c8c732.json` /control3b46bc5443bb2d52 feeds
  provisional-proc baseline `warrior-fury-crusader-68f51a9a16a76629.json`; low-N displays613.83 /
  619.76 are captures, NOT optimized or independent gain evidence. First stage starts200 legal
  seeds, frozen225 policies, six native workers and100k independent final ranges. Talent receipt
  `warrior-fury-b25989f0ab1e0e2d-talents.json`, SHA
  `5db959a868d8133b643bcd7284a25ab114da0d2f1caac8f75ec4931377c064db`, completed13,571 new
  simulations /4,287,800 iterations. Selected19/32/0,30305213002-25053005102210501, with
  HS>=30 /Berserker Rage<=30 /original25 /early Rend. Both100k joint blue talent/APL comparisons
  pass:614.5783363->629.0642933 and614.5984549->629.1491789. Read-only replay
  `reviews/fury-proc-blue-talents-2d3b18d810609ed0.json`, SHA
  `2d3b18d810609ed06c30433cef716586e4f9fe91338939531189a52a86d93c4e`, checks all current source/
  algorithm/control/request/gear/tree/native/DB identities and every four raw final100k detailed
  record. It does not replay every adaptive job, establish final equipment or verify server proc
  behavior. Its two validation ranges are disjoint from current Fury history and both aborted/
  live browser ranges. First gear `warrior-fury-9ac00494c5a2196d-gear.json`, SHA
  `1502c187301f8be5b638aac0c02c10db844c5e1377b74418c8c87ee778e0408c`, converged after two
  passes/54 groups. Its screening checkpoint records77,838 new simulations /7,573,380 iterations
  before the four final100k calls. Independent100k gear checks on fixed19/32/0 and HS30/BRage30/
  original25/early Rend are629.0960058→853.4067775 and629.0117938→853.4957306DPS. Candidate
  average853.4512540 uses200k samples, not400k; the earlier855.0844 search score is low-N.
  Owned full final-sweep replay `reviews/fury-proc-first-gear-coverage-7414b9c691484b90.json`
  matches every27 final groups, current complete input/native/DB identities, all37,889 raw80 /
  1,220 raw500 /135 raw2k /four100k references and38,806 unique raw cache records. It covers
  27,085 ordered weapon pairs,3,094 configured set proposals,3,794 ring pairs,1,625 trinket pairs
  and all single-slot/enchant groups. Not every earlier accepted-pass proposal was replayed;
  this does not expand the set/style bank or establish final feedback closure. Range-only proof
  `reviews/fury-proc-first-gear-ranges-4374255fd7007637.json` checks all24 native/browser/proc
  historical and reserved ranges together. Actual-gear baseline
  `baselines/warrior-fury-feedback-6ebd71ae700d0676.json` completed actual-gear talent feedback:
  `warrior-fury-5bf5aec1568acdac-talents.json`, SHA
  `41d91240c7d7fc0dc469bbaf9926a6b4fe080866f18f911c0be8d3adf1df76dd`,9,590 new simulations /
  3,431,300 iterations. Three refinement rounds favor19/32/0 with BRage<=20, but independent
  checks give +0.3487515DPS vs0.3311590 threshold and +0.1149110 vs0.3311643; only ONE passes.
  The challenger is correctly NOT adopted: original19/32/0 HS>=30/BRage<=30/original25/early
  Rend remains. Core `feedback-review-851424dbe3e20f45.json` is CLOSED,853.4213563069652DPS /
  400k disjoint selected-gear and closing-incumbent samples. Browser receipt6a87bba98580878c
  verifies25/1337 native853.2773138/UI853.28 with explicit proc consent, not a400k estimate.
  Independent replay `reviews/fury-proc-closure-7af6ebd2d69d1769.json`, SHA
  `7af6ebd2d69d1769cc1dcd8133c5b163ac90caced8f33cbaef104b233000ba48`, verifies current
  source/algorithm/control/request/gear/tree/native/DB identities, all four raw detailed closing
  comparisons, two raw selected-gear records, the entire reconstructed core receipt, legal
  enchants/consumes/acquisition and26 disjoint historical/reserved ranges. This represents600k
  raw role samples replayed, NOT600k independent selected-build measurements or new simulations.
  No fresh browser parity run or every adaptive talent job is claimed. Private readonly helper
  `review-tools/review-fury-proc-closure.mjs` has passed scoped lint/explicit-override formatting;
  six existing feedback/talent-evidence tests pass. Final trinket receipt
  `accessory-trinkets-3169125252e56e7d.json`, SHA
  `3169125252e56e7d7022f2ec911e80903a755494718f362d386f94f3aea62605`, now retains11815+272437
  (HoJ+Adaptive) after all1,625 ordered pairs at2k and7 close candidates/control on both100k
  ranges. BHB+HoJ is0.188DPS lower on average in this scenario; this is not proof of a general
  trinket ordering or an isolated enchant gain. Owned full replay
  `reviews/accessory-replay-fury-horde-procs-trinkets-df7b6c3ff844fec6.json`, SHA
  `df7b6c3ff844fec6116acbcfffc8bcaee5b0f5b54f34762e4d8a209da42b7ae5`, matches all1,641 raw
  records /4,850,000 represented iterations, current identity/pools/full shortlist/verdicts.
  Global range-only proof `reviews/fury-proc-trinket-ranges-e191afdf73ccdac3.json`, SHA
  `e191afdf73ccdac3bd08ca23d60a2ec5e28b725906fd104214eadf701e086be7`, checks29 historical/
  reserved allocations together. These role samples share seeds across candidates; they are
  not4.85m independent selected-build draws. Ring bank has3,794 ordered pairs, now screening.
  Ring screening has since completed all3,794 pairs;31 near candidates/control are undergoing
  both100k confirmation ranges. Final rings/rotation/export gates and all wider Warrior
  frontiers remain pending; do not
  promote this core or start Rogue. Both Arms
  cases and conservative Horde Fury are reviewed-local for their declared domains. No other
  class has begun numerical optimization. Recheck actual handles before reporting live.
- Conservative `fury-horde` is now reviewed-local within the frozen225-policy dual-wield case.
  Prior ring8754 /workers8780–8785 and final rotation79106 are TERMINAL SUCCESS.
  Core feedback73193, closing talents55104 /workers55202–55207,
  first talent child73210 /workers73237–73242 and first gear97293 /workers97312–97317 are TERMINAL SUCCESS. Session
  `6db6317c12a86e9d1fb6e518c54e7bc8c0e807f00208a2c0eff0fbb331d66f52`.
  Fresh blue `warrior-fury-horde-blue-0b6c2a563bd09846.json` references control
  `warrior-fury-horde-blue-control-6f9ff3a9f9428be2.json`. Actual capture gives613.83DPS at low
  iterations, NOT an optimized/high-precision estimate. Fixed Horde/explicit Windfury support,
  Engineering+Blacksmithing, zero starting rage/freeTier1/item swap/Recklessness and no known
  raid weapon consumes. Talent stage started200 legal seeds;225 APLs screened on one control,
  14 retained. Both current Arms cases and this scoped case are now reviewed-local. Do not
  start another class. Additional weapon-style/practical-access frontiers remain required
  before best-across-styles or accessible-guide claims; no frozen numerical input was edited.
  Independent control/input replay passes all17 blue items, eight core pieces,10 compatible
  enchants, canonical51-point legality, native/DB/control hashes, zero bonus stats/starting rage,
  no freeTier1/item swap/Recklessness/known raid consumes,300s/one level63 target and no tank
  assignment. The control's18/33/0 is NOT the optimized recommendation. Protobuf omits zero
  defaults: missing player.level means60 per api.proto/core.PlayerLevel; missing false/zero
  settings are not evidence of lost controls. The initial ad-hoc audit incorrectly required an
  explicit level60 JSON property; corrected the AUDIT to match the actual schema, no product fix.
  Current talent algorithmSHA32f3c5e1a4cb9fb37004765f82512ec520e6d1a0c8adede725b9f6daf2945a20;
  completed receipt `warrior-fury-60c1497bf17b5568-talents.json`, SHA
  `b46ca715a98fddf4ee03b31d7c0ae1d44b7cee6d0366ab47a2923472996bb8ee`, validation context
  bc9d3823919f9782c06e463fdf4582126e96a42a211cc87758fbdf2f5987b362. THREE stable refinement rounds,
  12,534 NEW simulations /4,076,600 iterations. Both independent100k ranges CONFIRM the JOINT
  talent/APL gain on fixed blue gear:601.8113122→616.3511376 (+2.41601%) and601.6559754→616.5243481
  (+2.47124%). Selected19/32/0,30305213002-25053005102210501, HS≥30/Berserker Rage≤10/original25/
  early Rend. This is NOT an isolated talent gain, final gear result or public recommendation.
  Independent replay recomputed the exact current source/algorithm/control/native/DB/tree/
  gear/request identities, regenerated all200 legal seed builds and225 raw rotation screens,
  reproduced14-policy retention, verified ALL2,800 initial500-iteration records, eight raw10k
  finalists and all four raw100k checks, allocations/selection and four disjoint selection/
  validation ranges.3,037 unique raw records replayed; adaptive-neighbor rounds were not all
  independently replayed, so this does not claim replay of every12,534 job or global optimality.
  Before the now-completed first gear stage, all17 eligibility pools were independently
  regenerated and match184/43/168/83/240/124/230/209/209/245/62/62/41/41/191/
  142/47, with no item-level floor/accessory EP cutoff. Both weapon slots are included:191 main-
  hand and142 off-hand candidates. Recheck the handle/PIDs before reporting live.
  Additional REQUIRED Fury APL frontier confirmed by pure enumeration of ALL225 current policies:
  Bloodthirst23894 always precedes Whirlwind1680; Execute20662 always precedes both; ZERO policies
  include Slam11605 or Hamstring7373. Threshold/stance/Rend coverage is not ability-priority/
  filler coverage. Test those frontiers through feedback after the frozen campaign, before
  calling Fury/Warrior finished; current scoped receipts remain valid, not globally optimal.
  Current Forever Raging Blows is a3-rage Cleave/Whirlwind discount, NOT a dual-wield-only active
  attack (tree and Go handlers checked). Do not incorrectly remove it from two-handed experiments.
  FIRST gear fingerprint was independently rebuilt from ALL current numerical inputs:
  `08608ae48e90fb3c8b669ef8db050ca08b707ff7ddac144edee9b68943025306`, expected result
  `warrior-fury-08608ae48e90fb3c-gear.json` and its `.checkpoint.json`. The checkpoint's fingerprint
  matches exactly. Full191×142 weapon Cartesian bank gives27,122 combinations,37 rejected by
  existing legality,27,085 legal ordered pairs: independently enumerated, not inferred from
  printed counts. Its pass1 pair group completed before the following set sweep. The2k
  exploratory pair change12590+18392 gave800.3085→801.8304DPS, NOT an independently established
  weapon recommendation. Checkpoint after that group:29,913 new simulations /2,783,880 iterations.
  Final close weapon alternatives still need independent precision, not just aggregate blue-vs-gear validation.
  PASS1 is now complete:27 search groups,20 accepted EXPLORATORY changes,39,153 new simulations /
  3,840,060 iterations; displayed845.76DPS is the2k/1337 search metric, NOT the final independent
  result. PASS2 is now complete:27 groups/three exploratory changes;77,830 new simulations /
  7,628,060 iterations cumulative. Display848.70 is again a2k search score, not a final independent
  result. PASS3 has finished all27 groups with ZERO accepted changes, including another full
  weapon-pair sweep:110,618 new simulations /10,689,820 iterations cumulative. Same848.70 low-N
  search metric. FIRST GEAR VALIDATION is now COMPLETE/accepted/converged: receipt
  `warrior-fury-08608ae48e90fb3c-gear.json`, SHA
  `a3bdacb5ea1014bf6074e5464e346f1a517086a3899bae5cac6e2062ef96ed7a`.
  Fixed19/32/0/current APL:616.5777393642314 blue DPS →847.9231589172553 gear DPS.
  Seed140544840200000:616.6280178313446→847.8951816131188; seed140544840300000:
  616.5274608971183→847.9511362213916, each100k iterations. Overall110,622 NEW simulations /
  11,089,820 iterations; low-N screens and independent validation remain distinct. Provisional
  historical item/stat/proc assumptions remain; not yet a final whole-spec/public BiS result.
  Actual-gear feedback baseline `warrior-fury-feedback-e713a50c707259da.json`, SHA
  `e713a50c707259da7aaa8b015f4b90f9d9540e868fe73f637873af3fa93e7ca3`, now enters another
  200-legal-seed talent/APL stage;225 rotation screens finished,13 retained on the actual gear.
  Independent read-only gear-coverage exec59488 is now TERMINAL SUCCESS: all27 final-pass groups,
  all17 item pools,27,085 ordered weapon pairs,3,094 set proposals,3,672 ring pairs,1,625 trinket
  pairs and all enchant groups independently regenerated. Matched EVERY raw final-pass metric:
  37,759 at80 iterations,1,214 at500,135 at2k and four100k validation references,38,685 unique
  raw cache records. Six selection/talent/gear RNG ranges are disjoint; selected gear equals the
  converged search incumbent. Auditor source SHAda8480f5… unchanged. No new simulation/build or
  numerical-input change. Configured set/weapon-style limits remain, not global BiS proof.
  ACTUAL-GEAR TALENTS are now complete: `warrior-fury-78678741f70c8c90-talents.json`, SHA
  `874819216dec9e32e670287ceba48a2b709f11a5251d55fdca8ee812df412a47`; three stable rounds,
  11,668 new simulations /3,839,300 iterations. The exploratory19/31/1/no-explicit-Rage candidate
  was NOT adopted: first100k delta0.191707 <95% margin0.262465; second delta0.345271 >margin0.263503.
  Both ranges must confirm. Kept19/32/0,30305213002-25053005102210501 and the exact prior
  HS≥30/Berserker Rage≤10/original25/early-Rend APL. Do not display the unvalidated winner field.
  CORE feedback is CLOSED: `feedback-review-0d826e61b73ef7e1.json`, SHA
  `0d826e61b73ef7e10cef8b789b13108cc033462028b7307a14c05c77c4613323`, reference
  848.0059753540504 modeledDPS/400k samples. Four selected-loadout measurements:
  847.8951816,847.9511362,848.1416811,848.0359025DPS. Browser proofdfbf909b86e2cb88 matches
  actual25/1337 native848.7406812613472 to UI848.74; this is parity, not the high-precision reference.
  Independent read-only reconstruction matches ALL current algorithm/control/native/DB/tree/
  request/gear identities, all four raw closing100k records, both statistical verdicts, unchanged
  selection, every core field and eight historical selection/validation ranges (disjoint).
  Receipt `reviews/fury-core-6ecee16238e57ecb.json`, SHA
  `6ecee16238e57ecb5933c434f282e7ad9185a7141f9d65a708b04cbd39383b9c`.
  This does not replay every adaptive neighbor or close the final accessory/rotation gates.
  TRINKETS94056 /workers94310–94315 are now TERMINAL SUCCESS. Receipt
  `accessory-trinkets-1c2907cc6d4b711c.json`, SHA
  `1c2907cc6d4b711c2313610cd60132a77119b7ff6b3eed4762119ceef07cbe74`, retains BHB13965+HoJ11815:
  all1,625 ordered pairs at2k; the one close challenger is the reversed incumbent pair and has
  exactly zero delta in both100k ranges. Independent full replay regenerated legal coverage,
  current source/input identity, all1,629 raw records, four-SE shortlist, three-SE verdicts,
  selection and11 disjoint historical RNG ranges.3,650,000 represented iterations, no new sims.
  Replay `reviews/fury-trinkets-51ec87ae2bc76a3f.json`, SHA
  `51ec87ae2bc76a3f07a4eb3d48ba5be5844552d655a7cbbae6e22f08fbf099da`.
  Ring8754 is now TERMINAL SUCCESS. Final `accessory-rings-5393e4d620367d61.json`, SHA
  `5393e4d620367d61fe72d1291da1aa37076556572ce2a14ca3402357beaf05fd`, retains19325+18500:
  all3,672 ordered pairs at2k and all17 close candidates/control in BOTH100k ranges, no confirmed
  challenger. Final filenames use receipt CONTENT hashes, not the6efa752c… audit identity;
  use actual stdout/case.final paths rather than guessing an identity-based final filename.
  Independent read-only full SCREEN replay now PASSES: `reviews/fury-ring-screen-3202bc605910d254.json`,
  SHA `3202bc605910d254d8cd08f6f6b3a5625b6651f79c2af0ba299cf826d625a50c`.
  Regenerated current bank/identity/input/source/native/cache hashes, checked ALL3,672 exact raw2k
  records (7,344,000 represented iterations) and reproduced the full17-candidate four-SE shortlist.
  Twelve current Fury historical/screen RNG ranges are disjoint. This earlier SCREEN receipt
  does not review precision measurements; it is retained unchanged, not upgraded in place.
  FULL ring replay now PASSES: `reviews/fury-rings-afc9ede18150cb78.json`, SHA
  `afc9ede18150cb783adc76129ea8413d28f8334f64d195aa7ddf8ddb51069482`. Every3,708 raw request,
  full shortlist/deltas/thresholds/verdicts/selection, current source/input/native/cache identity
  and14 disjoint historical ranges match.10,944,000 represented iterations; no new sims/builds.
  Final rotation `fury-rotation-audit-0a57bd040a655876.json`, SHA
  `0a57bd040a6558766bd78cff5f6ad1ecb9ab713aea557c22e9772e244a02512b`, retains the EXACT incumbent
  across225 policies/16 finalists and both100k ranges (848.0469623/848.0800065DPS). Independent
  replay checks EVERY raw1k/10k/100k metric, policy/context/source identity and full selection.
  245 metric references but243 unique requests/585k represented iterations: A/B is identical,
  so final four references are TWO raw100k jobs, not400k new draws. All16 historical ranges
  are disjoint. Complete portable export `reviewed-builds/warrior-fury-9783b0019cee2045.json`, SHA
  `9783b0019cee2045e0ccef4f99f0f76ac0d27a4d194535b09052823e8143bbc6`, matches independently
  rebuilt full settings, legal gear/pools/enchants/consumes/professions/acquisition and warnings.
  Reference remains848.0059753540504DPS/400k core samples;19/32/0 and prior APL are unchanged.
  Combined final-rotation/export proof `reviews/fury-final-export-869e12e810939b20.json`, SHA
  `869e12e810939b20727c30fdfea29f3b6e8bb1ab1a589bebfea968a3539743f4`.
  Fury proc is now running above. Whole Warrior remains unfinished, including staged frontiers.
  EARLIER local pending preview VERIFIED: `share-links/fury-horde-9d84d778350b7833.json`, status
  `core-reviewed-final-audits-pending`. Actual exporter/importer preserves ALL combat settings
  in two clean browser contexts without combat jobs. Real review-page Playwright smoke at1440/390
  passes: two reviewed Arms labels, ONE unfinished Fury preview, exact saved URL, noindex,
  no overflow/page errors. Use http://localhost:3017/forever/simulator/review; not a public/default build.
  FINAL share CLI now also PASSES without --allow-pending: `share-links/fury-horde-f150c4c7c0b949d7.json`,
  SHA `f150c4c7c0b949d76e03dbab548c19673df6e9299f94e12d8c6d5bcf4fc65892`, status reviewed-local.
  The actual exporter/importer preserves every combat setting in two isolated contexts, with
  consent OFF and no combat jobs. Old9d84 preview remains unchanged. FINAL review-page smoke
  now PASSES: `reviews/fury-final-page-78f57311a823e7a7.json`, SHA
  `78f57311a823e7a70ae3dadd46a94a09e0f70cf3860faf71fe9af55de90aab85`.
  Actual1440/390 pages return200/noindex/no overflow, THREE reviewed cards and zero stale
  previews. The exact final Fury link imports every combat setting, consent stays OFF, zero
  combat requests/page errors. Two initial smoke assertions were harness mistakes: compare
  relative/absolute URLs by their resolved target, and install storage instrumentation only on
  actual HTTP-loopback documents, not opaque about:blank popup documents. No app/CSP/storage
  behavior changed or application errors filtered. Old preview status/hash is also checked.
- REVIEWED BUILDS are now available DIRECTLY at http://localhost:3017/forever/simulator/warrior,
  as explicitly requested, not only on the separate /review page. New
  `apps/web/src/components/forever-simulator-reviewed-workspace.tsx` renders the styled top
  selector and explicit Load build action. `reviewedBuildsForSimulator` only returns completed,
  current-release, exact-profile, hash-linked local reviews; previews/waiting/other classes are
  excluded. Both Arms cases and conservative Fury are available. Choosing an option alone or
  visiting the page never replaces a saved character; explicit Load imports the entire combat
  setup into the embedded engine without navigation or a simulation. Provisional consent stays
  OFF and its warning remains visible. All acquisition/model assumptions stay available.
  This is development-only evidence presentation, not production/default promotion.
  Actual desktop/mobile smoke `node scripts/review-prebis-workspace.mjs` PASSES: receipt
  `reviews/warrior-workspace-9675a121f3fea193.json`, SHA
  `9675a121f3fea1935bae55841a5bbd0e06dd486a60d396419dbe499c5cc530c8`.
  Both1440/390 pages return200, have3 correct options/no overflow; all three desktop imports
  and mobile conservative Arms exactly match ALL combat settings/share digests. Consent OFF,
  zero combat requests/page errors, no automatic import. Source bytes rechecked; screenshots
  saved and mobile visually inspected.31 focused tests, strict tsc, scoped ESLint/Prettier pass.
  Browser testing exposed two real wrapper issues, now fixed outside numerical inputs:
  (1) Bootstrap modal focus scrolls its nested frame's close button behind the host fixed header.
  The frame listens for shown.bs.modal and scrolls the dialog header into the unobscured viewport,
  with cleanup/fullscreen guard. Ordinary close clicks now pass; no forced clicks/DOM hiding.
  (2) Mobile hides the desktop Simulate action, so readiness wrongly kept the loading overlay
  despite initialization. A visible explicitly initialized workspace is now accepted; false,
  hidden, wrong-origin/profile/release documents still fail. The mobile regression failed before
  and passes after. Legacy fallback remains for engines without the explicit marker.
  Existing `node scripts/smoke-simulator-frame.mjs` also passes four profiles on first load/reload,
  missed-load-event recovery and blocked-asset retry with saved character unchanged. That broader
  smoke completed before the final mobile-marker adjustment; the final31 tests and actual mobile
  import receipt cover that adjustment. No native build/data/APL or six-worker cap was changed.
- SPEARING frontier now has a separate artifact-only
  `optimization/review-tools/fury-spearing-frontier.mjs` /`.test.mjs`. For each fixed non-Spearing
  APL, untalented builds get only the unchanged no-Spearing control with NO unavailable cast OR
  condition references. Talented variants test opportunistic OP-window use, independent cooldown-
  ready windows with rage caps25/40/60, and explicit Battle-until-execute residence, before every
  modeled attack/queued-HS/filler and after all attacks. These are joint priority/stance-maintenance
  experiments, not isolated Spearing gains. Original attacks/conditions/root settings stay unchanged;
  only return maintenance is moved/decorated, and independent entry actions are explicit.
  Native source verifies spellIsReady uses cooldown/shared-CD only; spellCanCast also enforces
  stance/GCD/resources and must NOT gate entry from Berserker. Spearing hold survives GCD/rage
  shortages, releases when its CD is spent or execute starts, and preserves the original OP return
  predicate. Extra Battle entries are deliberate; future incumbent handling must support them.
  All10 prepared-data tests PASS,0 skipped; scoped ESLint/Prettier pass. Full Cartesian per-anchor
  comparison covers all225 old anchors; guard-state, unavailable-spell, insertion, action/root,
  mutation-isolation and unsafe-template negative checks pass. These are NOT native combat/parity tests.
  FULL69,930-parent composition audit exec27160 /PID97079 is now TERMINAL SUCCESS (pure JS,
  no native jobs):2,976,090 attempted variants,2,863,290 unique rotations and112,800 cross-parent
  duplicates, matching the independently derived counts. All69,930 untalented controls remain
  exact. Additional policies have one Spearing cast and one recovery action above attacks/explicit
  Berserker Rage; unchanged no-Spearing controls retain their own original recovery order.
  Unique mode counts:69,930 controls /541,440 opportunistic /1,688,940 on-ready /562,980 Battle
  residence. Input bytes, source hashes and source mtimes pre-dating the stream were checked.
  Receipt `reviews/fury-spearing-4ef71020e443b2fa.json`, SHA
  `4ef71020e443b2fac0564a1b50a5023a9274dc2e6634a964dfff77f898d802d5`;704s, ZERO combat/native
  parsing/parity jobs. The first ad-hoc closed-form predictor accidentally counted no-explicit-
  Rage anchors toward ALL attempts; corrected to all five rage choices before matching the actual
  completed stream. This was an observer calculation, NOT a runner/measurement change.
  Prototype inputs stayed frozen for the entire observation. Main numerical inputs stay frozen.
  Future integration MUST globally deduplicate, stream/batch the expanded bank, measure cost,
  preserve equivalent source-family provenance, screen learned AND unlearned Spearing controls,
  handle the exact incumbent separately and hash every dependency. One naive1k screen would
  already cost2,863,290,000 iterations BEFORE crossing talents; do not launch that through the old
  in-memory225-policy driver. Explicit numerical/disk budgeting and measured staged screening/
  retention/final audits are required. Do not equate candidate counts with damage or optimality.
- Representative browser-engine admission now PASSES for the staged Fury policies:
  `reviews/fury-browser-admission-34e30c8f1e3d335d.json`, SHA
  `34e30c8f1e3d335dee36118000dbcaeef2122a018b78c59c60890ccff411cc62`.
  A fresh actual UI ComputeStats request preserves the current gear/control. Existing immutable
  E14 WASM validates153 learned/unlearned Spearing policies across four baseline/disabled/
  filler-maintenance parents with ZERO warnings; two negative controls detect the exact unknown
  and unlearned spells.155 actual response summaries and14 before/after byte fingerprints are
  saved. This is representative APL parsing only, NOT full2.86m-bank admission, combat, native
  parity, DPS ranking or optimization. No native builds/jobs or frozen inputs changed.
  The harness bundles existing generated protobuf codecs IN MEMORY, not an engine rebuild.
  Its first assertion incorrectly expected one stats slot: the actual engine pads five slots
  with one active player. The corrected contract requires one party/five slots/one active player,
  exact action counts, no valid-policy warnings and exact negative-control spell errors.
  All five focused contract tests, scoped ESLint and formatting pass; no warnings are suppressed.
  Seven real low-N browser combat executions also PASS via the existing frozen capture helper:
  `reviews/fury-browser-execution-800fd86f107f0ac2.json`, SHA
  `800fd86f107f0ac2d033173e1dbd26da24d470092c7ca8b199b7c5f9ca40a953`.
  The retained baseline exactly reproduces UI848.74 at25/1337. Learned-Spearing no-cast control,
  opportunistic, on-ready25/Battle-residence before BT and late on-ready60/residence all execute
  without browser error or stall. All combat settings and pinned source/data bytes remain exact;
  captured protobuf requests are saved. This is a same-seed execution smoke, NOT a DPS ranking,
  new-policy native parity, independent validation or optimized recommendation. No native jobs.
  Exact-request action replay is now TERMINAL PASS, exec58394:
  `reviews/fury-browser-actions-b1f661ccaa06edf4.json`, SHA
  `b1f661ccaa06edf41e68a57a81aa1e38bf696b76f2a6e11480064c9af2d4a062`.
  Independently decoded every real request: one Warrior/target, exact gear/item stat vectors,
  talents/APLs, Forever rules,25 iterations/1337; combat context outside talents/APL is byte-identical.
  One immutable WASM worker reproduces all seven actual UI displays. Both controls cast zero
  Spearing; additional policies actually cast it213/258/295/274/290 times across25 fights and
  perform both stance transitions. These totals are aggregate counts, NOT per-fight averages.
  The first action verifier incorrectly required Whirlwind for Battle-residence policies.
  Actual per-policy diagnostics and native registration confirm it requires Berserker Stance;
  residence has zero WW and25 Battle/25 return casts (one per fight). Only that explicit family
  may omit WW; all others must cast it, all must cast BT, and missing Spearing/stances still fail.
  No gameplay/engine policy was changed to pass this check. Seven focused contract tests pass,
  including this explicit exception and rejection for every other family. Scoped lint/format pass.
  Codec decoding now stays in the browser and returns compact metrics/hashes, not large raw-byte
  arrays/debug logs. Both in-memory codec hashes, exact response hashes, full action summaries
  and unchanged input/source/engine byte fingerprints are saved. This is still same-seed low-N
  smoke only, not new-policy native parity, independent damage evidence, full-bank execution or
  an optimized build. All core/native source bytes, campaign ownership and six-worker cap stay exact.
  A PRELIMINARY high-precision BROWSER experiment ran separately from the owned campaign and is
  now TERMINAL with a navigation failure after THREE completed arms:
  exec2677 /PID77934, identity `03c90d6eb11391ac51098cbf2028f3f5c68919562058d710d1f7a021fde8b719`.
  Artifact-only `review-tools/probe-fury-spearing-holdout.mjs` uses ONE isolated immutable WASM
  worker, not another native worker/lease. Four predeclared fixed-gear arms: current19/32/0,
  return-priority-only, learned Spearing point on that no-cast return-priority control, and the
  captured on-ready25/before-BT policy. Only IHS−1/Spearing+1 differs in talents. All other
  combat request bytes match outside talents/APL; all four actual ComputeStats admissions pass
  with zero warnings. The first THREE100k arms completed; the fourth arm was interrupted.
  Two fresh ranges63507922000000/63507922100000,100k each, are deliberately shared across arms:
  eight scenario measurements/800k iterations, but200k distinct seed values per arm, NOT800k
  distinct RNG seeds. Both ranges must confirm the predeclared primary JOINT gain at3SE; return-
  order/talent-point/entry-and-hold contrasts are diagnostic, not isolated Spearing damage or
  automatic selection. All current Fury selection/feedback/trinket/ring ranges plus the aborted
  attempt's reserved ranges are protected. New-policy native parity and complete expanded-policy/
  actual-gear feedback remain required before recommendations. No public default changed.
  Declaration `reviews/fury-spearing-holdout-03c90d6e-plan.json` is NOT a result/liveness proof.
  Exec2677/PID77934 actually exited1, not an observation timeout. Read-only capture of the
  failure is `reviews/fury-spearing-holdout-03c90d6e-navigation-failure.json`: execution context
  destroyed during page.evaluate at line400. Its worker was hosted on the Next DEV review page;
  concurrent wrapper/CSS changes can trigger HMR navigation, a plausible cause not established
  by a captured navigation trace. Native51962/80788/8890 remains live and unchanged.
  Continue on an immutable non-HMR loopback host with verified contexts; preserve BOTH reserved
  ranges and all three measurement-only receipts. No partial fourth-arm metric or final verdict
  was used. Do not keep describing2677 as live or restart merely on a poll timeout.
  Previous exec32232 /PID72993 is TERMINAL, deliberately SIGTERM-aborted by this agent after
  observed20,012/100k iterations showed its20-minute-per-job guard was too tight under load.
  Its browser children were verified closed; the native campaign was untouched. No complete
  metric or verdict was saved/used. Abort record `reviews/fury-spearing-holdout-f0883338-aborted.json`
  preserves the old source hash/context and BOTH full reserved ranges. The replacement uses a
  one-hour per-job guard and fresh disjoint seeds; sample precision/arms are unchanged, not reduced.
  Five focused holdout-contract tests pass (contrasts, both-range uncertainty, reordered/missing
  controls, invalid ranges and incomplete/error metrics); syntax/scoped lint/format pass.
  The newly completed native final-rotation ranges were also checked after they became available:
  ALL16 historical native Fury ranges +two aborted reserved ranges +two fresh browser ranges
  are disjoint. The in-flight producer's protected-range snapshot predates that native rotation;
  preserve this additional audit when reviewing its eventual output. First completed arm is
  baseline/63507922000000:848.0261566589868DPS, stdev29.931050048685385,100k iterations/300s.
  Saved as `reviews/fury-spearing-holdout-03c90d6e-63507922000000-baseline.json`, explicitly
  measurement-only/NOT a verdict. Return-first on the same range is847.9162400261956DPS;
  learned-return-first is844.9230467201365DPS. Each has its own immutable measurement-only
  receipt with the same filename pattern. THREE of eight measurements completed; last started
  job was `holdout-0-spearing-on-ready` before the terminal navigation failure. This is still one
  range, not a final contrast verdict.
  Do not call this a gain or pool it with paired controls as additional
  independent RNG draws. Full end-of-experiment fingerprint/contrast/native-parity review remains.
- The SAME predeclared03c90d6e numerical experiment was RESUMED separately on an isolated,
  checksum-verifying loopback server, with NO Next development-page/HMR dependency:
  exec16021 /PID53287, `review-tools/probe-fury-spearing-resume.mjs`. Original probe8d12be6c…
  remains unchanged so its complete numerical identity/fingerprints regenerate exactly03c90d6e;
  the new runtime separately pins its own sources, contracts, source measurements and manifest.
  Runtime source byte SHA9dd51c2416d0aed99bfc4bbd42d5e9144ccb97895a18bafe63a4517d9b927075;
  DO NOT edit it, original probe, either resume contract or any pinned engine/control inputs
  while live. Reuses the existing `startSimulatorLocalServer` without changing frozen source.
  The holder is a small manifest-listed JSON document, not a Next page or full engine UI.
  Both original ranges remain63507922000000/63507922100000. All3 saved complete measurements
  pass exact regenerated request/arm/seed/100k/duration/cast checks; no partial fourth metric
  is reused or counted independently. Resume runs only the5 missing100k jobs, not all8 again.
  Four actual ComputeStats admissions pass with zero warnings. A new25/1337 replay canary
  exactly matches prior848.7406812613472DPS, stdev25.778063363598168, duration and stance/WW casts.
  It is a host/parity check, not an extra ranking sample. New first job
  `holdout-0-spearing-on-ready` completed100k:847.9998639160251DPS/std29.852291429588085,
  actual1,044,373 Spearing casts; saved in the original filename pattern with a separate resume
  declaration pointer. FOUR of eight measurements are complete, still NOT a contrast verdict.
  `holdout-1-baseline` also completed100k:847.9528162925438DPS/std29.968331978111493;
  saved as `reviews/fury-spearing-holdout-03c90d6e-63507922100000-baseline.json`. FIVE of eight
  measurements now complete. `holdout-1-return-first` then completed100k:
  847.8887305069732DPS/std29.910752537162278, saved under the same original pattern. SIX of
  eight rows complete. `holdout-1-learned-return-first` has since completed100k:
  844.7884983184593DPS/std29.851303279052388; its immutable measurement-only receipt is saved.
  SEVEN of eight rows are complete. Current final job is `holdout-1-spearing-on-ready`, last
  seen10,001/100k; check the actual handle53287/exec16021 before calling it live later.
  Completed SECONDARY return-order-only subcontrast is separately recorded in
  `reviews/fury-return-order-subcontrast-28ef1e63560a0d7f.json`: average-0.0870012DPS, both
  differences below the approximately0.4016DPS three-SE thresholds. No established gain;
  uncertainty is not evidence of equality or inferiority. It remains a PARTIAL experiment:
  primary Spearing contrast, remaining rows and producer-final source checks are unfinished.
  Its400k arm-role samples share200k distinct seed values; do not count it as a new independent
  experiment or promote/remove a policy from this secondary check. Additional completed
  SECONDARY talent-point contrast `reviews/fury-talent-trade-subcontrast-10356129a2cafa3e.json`
  verifies the IHS-minus1/Spearing-plus1 trade on the same no-Spearing-cast return-priority APL.
  Both100k differences are negative beyond three-SE: -2.9931933/-3.1002322DPS against
  thresholds0.4003593/0.4008963, average-3.0467127. This diagnoses a modeled no-cast point
  trade loss, NOT the worth of an active Spearing rotation. Source/request-linked four input
  receipts are checksummed; producer-final fingerprints, primary contrast and native parity
  are still pending. No policy is promoted or removed from this secondary contrast.
  Main owned native campaign
  continues on six workers; no lease borrowed/native build/data change. New runtime additionally
  checks disjointness through final native Fury rotation and initial proc talent ranges.
  Declaration `reviews/fury-spearing-holdout-03c90d6e-resume-declaration.json` records verified
  startup, NOT completion/liveness or a gain. Source/result/codecs and holder navigation count
  must still pass final checks. All11 combined holdout/resume-contract tests pass,0 skipped
  (6 resume plus5 contrast tests); scoped ESLint passes. One focused
  existing temporary-server integrity/error test passes (14 unrelated tests not selected).
  Artifact files are excluded by .prettierignore, so default Prettier calls did NOT format/check
  these private files; do not claim they did or format a pinned live source. Formatting at owned
  integration must explicitly address that ignore. App-source formatting checks were real.
- FULL BROWSER HOLDOUT is now TERMINAL SUCCESS: exec16021/PID53287 exit0. Its owned Chromium
  processes53705–53708 and esbuild53625 are absent; no browser/server run should be restarted.
  Producer receipt `reviews/fury-spearing-holdout-resumed-d7e5e25b01a85fde.json`, SHA
  `d7e5e25b01a85fdeccaf34abebfde4a6570dd7c92ebfa2e7110a718b835d1b29`, completes all8 rows.
  Primary joint policy averages +0.0497854DPS: first range-0.0262927 vs0.4010392 threshold,
  second +0.1258635 vs0.4019155. NOT a confirmed gain; no new rotation/talent is adopted.
  Secondary return-order-only is-0.0870012; the no-cast IHS/Spearing point trade costs3.0467127;
  adding entry/hold/casts to that weaker learned control restores3.1834993. That last secondary
  gain is NOT a3.18DPS upgrade over the retained original baseline or a policy-promotion proof.
  New private reviewer `review-tools/review-fury-spearing-holdout.mjs` reconstructs exact
  protobuf requests/control context/51-point trade/seed identities and codecs, verifies all8
  preserved measurement receipts and current source pins/canary/admissions, independently
  recalculates all4 contrast verdicts and checks32 known allocations. Input allocation proof
  `reviews/fury-live-allocations-34d717537b668e0e.json` includes active ring identitye841ee53…
  (3,794 candidates), not completed ring results. Independent review
  `reviews/fury-spearing-independent-407beb9996ba2cbb.json`, SHA
  `407beb9996ba2cbb71cc917949d81a6d7e46d89c4807f6d1f3529c5afec2dae0`, PASSES as browser-
  holdout-only. Reviewer source SHA159c4819e3a96d9b4eb99f1456e335fddd857a86f8d3e7d85d7c15e6a7147b57.
  Ten new actual-report/altered-evidence regressions and11 existing holdout/resume-contract
  tests pass,0 skipped; scoped lint and actual ignore-override formatting pass. No new combat,
  native build or worker lease was created by the reviewer; only protobuf codecs regenerated
  in memory. Raw final protobuf progress payloads were NOT persisted; this checks reported
  decoded measurements, request/source identities and arithmetic, not independent binary
  re-decoding or another combat execution. An additional arbitrary-correlation sensitivity
  bound, using estimated marginal variances, leaves all conclusions unchanged. The live
  criterion was not altered; it is not a simultaneous confidence guarantee.
  Completed800k arm-role samples share200k distinct seed values. Resumer executed only5×100k
  missing jobs plus one25-iteration canary;3 prior completed rows are reused, not new samples.
  New-policy native parity, wider priority/filler/Spearing/style/set/access numerical feedback
  and final publication remain pending. A fixed-policy non-gain must NOT eliminate other
  Spearing policies or complete Warrior/the all-class goal. Native campaign51962/rings9106
  still owns the six-worker lease; its sources/data remain frozen despite browser completion.
- PACKED SCALAR EVIDENCE prototype now passes40 combined storage/stage/ranking tests and a
  real10,000-record storage round-trip plus complete1,625-request stage/ranking replay.
  Private files: `review-tools/packed-evidence-store.mjs`, `.test.mjs` and
  `probe-packed-evidence-store.mjs` under the simulator optimization directory. Not integrated
  into the frozen numerical pipeline. SHA256-named immutable packs bind engine and stage hashes;
  each scalar keeps its exact request digest/iteration count/IEEE754 DPS and stdev. Detailed,
  error or unknown fields are rejected, never silently dropped. Fsync plus no-overwrite atomic
  hard-link publication preserves good evidence; interrupted pending files are not counted.
  Conflicting duplicates, corrupt/truncated packs, symlinks, index/batch limits, stream mutation,
  readonly refresh, close races and publication failures are tested. Single-writer ownership
  still belongs to the campaign; this is not a cross-process mutex or power-loss guarantee.
  The O(N) request index has an explicit per-stage capacity; pack buffers have a bounded LRU.
  Checksum-bound known-pack reloads avoid revalidating every scalar; a failing-before/passing-
  after test also proves modified evicted packs still fail checksum and fresh-open checks.
  Latest storage probe `reviews/packed-storage-ef245a8f6c9ec558.json`, SHA
  `ef245a8f6c9ec558407d07df0c8f42dc4015ac3f69f9723bfc56c88f1f31d543`, exactly compares all10k
  lookups and all10k streaming rows after close/reopen, rechecks all original file digests and
  all pinned input bytes, and removes ONLY its isolated temporary copies.10 packs use520,800
  logical /524,288 allocated bytes versus3,527,006 /40,960,000 for the original JSON files on
  this Mac.18.22s includes source reads/rechecks; not a full-bank throughput benchmark. Two pack
  buffers,10 full validations across7,970 reads; only scalar-storage correctness is established.
  Earlier868f96386e9ec9cc/bced8880cc59debf remain immutable, not controlled speed comparisons.
  Shared52-byte scalar encoder is now intentionally exported and used by storage, the stage
  validator and binary measurement digests; JSON field order and negative zero cannot change
  or lose measurement identity. This is not an engine/numerical-input change.
  Calculated full2,863,290-row scalar size149,115,240 bytes /2,802 packs versus11,728,035,840-byte
  individual4KiB allocation floor excludes indexes, detailed evidence, requests/provenance and
  additional talent/gear/seed stages. New private `packed-scalar-stage.mjs` /`.test.mjs` now
  provides lazy bounded request/result batches,1–6 supplied providers, exact request-order
  digests, duplicate-provenance accounting, precision/control guards, resume from sealed data
  and drain/seal on provider failure/cancellation. Providers can be readonly replay, not native
  simulations; no worker lease/build is acquired. Full requests/results are bounded, while
  digest/first-ordinal indexes remain O(N) under explicit stage capacity. Completion requires
  the entire declared unique bank; missing/extra requests never quietly prune coverage.
  `rankPackedScalarStage` separately replays the EXACT complete bank on a fresh readonly store,
  verifies all request/provenance/binary-metric digests, preserves top/family/required-control
  leaders with stable input-order ties and supports duplicate aliases in distinct families.
  Mixed precision/seeds, absent/unknown families/controls and partial evidence fail closed.
  Ranking retains compact references only, bounded by explicit top+family+control counts and
  a100k-reference safety ceiling; it is screening, not independent validation or global BiS.
  Real proof `reviews/packed-stage-ranking-08d0b62df56f3ea6.json`, SHA
  `08d0b62df56f3ea673fc2353edc04fda6b1016147dd3f035707978620613fb95`, reconstructs every1,625
  current Fury trinket request/metric plus13 provenance aliases. Three readonly-file providers,
  max256 full requests and7 packs/85,060 logical bytes; full reopen hits1,625 with ZERO provider
  calls. All42 ranking families, top5 and a required control exactly match an independent full
  reference sort;83 unique references retained,90 total references high-water.3.56s is small
  replay-only, not full2.86m throughput/memory or new simulation evidence. All1,625 original
  hashes and pinned sources are rechecked; only own isolated temporary copies were removed.
  All40 focused tests pass,0 skipped, plus scoped ESLint and actual Prettier with
  `--ignore-path /dev/null`. Initial empty-family rejection test had a brittle assertion-message
  expectation, corrected to an explicit error; no combat policy changed. Earlier stage-only
  proof68adb8c6f3abdcce remains historical. Full-frontier lazy generation/family fingerprints,
  cost/native throughput evidence and all production-reader integrations remain pending.
  Promote to tracked owning sources only at an input boundary;
  production must never import ignored artifact prototypes. No shared cache was migrated/deleted.
- OWNED full accessory replay is now available as
  `node scripts/review-prebis-accessories.mjs --audit=<completed-accessory-audit.json>`.
  This is an internal read-only verification command, not another product startup/setup step.
  It validates archive containment/symlink/size guards, exact current accessory source/input/
  engine identities and core invariants, reconstructs all eligible ordered pairs and2k raw
  screens, rebuilds the complete four-SE shortlist and independently recalculates every both-
  range100k/three-SE verdict and selected challenger. Even an empty shortlist checks both
  measured controls. Scalar request IDs/precision/fields, status and current pool/enchant/set
  coverage fail closed; confirmed gains remain requires-feedback, never public promotion.
  Self-source/input/engine/receipt identities are rechecked after the replay. It starts NO
  workers/builds/leases or writes and does not claim raw core-history/global-reserved-range
  replay; those separate proofs remain required. All12 focused tests pass with no skips,
  including real current replay and altered evidence/paths/pools/shortlists/metrics/verdicts.
  Scoped lint/format passes. Adding these non-simulator-named verification files does not
  invalidate the frozen numerical campaign; its actual status confirmed unchanged inputs.
  All six actual current completed audits pass with source SHA
  `86729fd24c1e96aafb481287dfa59a799e508f33f36f296103ee3d56e816a205`:
  Arms conservative trinkets a91635a1969d6717 /rings ac009d454db8e83b;
  Arms proc trinkets a25c93ce03d95a8d /rings9d4c930ebde6ffb8;
  Fury conservative trinkets a78804f244727a57 /rings2c2c6abb90b3abd7.
  Receipts use `reviews/accessory-replay-<case>-<kind>-<hash16>.json`. These are new verification
  receipts, not new damage measurements; existing raw evidence is untouched. Wire the verifier
  into the owned update pipeline at the next input boundary, not during the live campaign.
- PRIVATE `review-tools/fury-expanded-policy-stream.mjs` now lazily feeds the unchanged
  Spearing/priority bank into the bounded scalar stage, one parent/up to46 variants at a time.
  It validates exact declared parent/generated counts, current control/17 gear slots/legal
  talents/precision/seed, snapshots current parent/equipment and preserves compact parent/hash/
  family/variant provenance for every alias. No missing/extra bank returns successful coverage.
  Seven producer tests pass; the real generator also passes through the packed stage/ranker
  with duplicated source families (unit-test scalar fixtures only, not actual damage results).
  All47 producer/storage/stage/ranking tests pass,0 skips; lint and explicit-ignore-override
  formatting pass. Sources SHA f1310592cfa9eabc… /test7673c733eed8d1b8… are private until owned
  integration; production must not import ignored artifacts.
  Full generation-only probe57436 /PID97848 is now TERMINAL SUCCESS, actual exit0/process
  absence verified; do not wait on or restart it. Source
  `review-tools/probe-fury-expanded-policy-stream.mjs`, SHA
  `5d055c37a728d659e9ee176faafd6eba65971117d1992113408c08f85e61ef5e`.
  Receipt `reviews/expanded-fury-policy-stream-85f6a56796bdd149.json`, SHA
  `85f6a56796bdd149f5ceb0767d98494d6da53336b4e77efd5dd4b2bb3698885f`, passes all69,930
  parent identities and exactly2,976,090 emitted requests /2,863,290 unique /112,800 aliases,
  all4 mode counts and the exact earlier complete unique-rotation stream4110a59a…. All13 input/
  source fingerprints pass both producer-final and independent fresh-file checks. There are
  6,124 provenance families; top5+two/family+one control has a12,254-reference retention bound.
  Native-request/generated-provenance/unique-stream and family-definition/count hashes are
  preserved. Generation took21.72min under the existing native/browser load, peak RSS1.82GiB.
  This is NOT engine admission, a2.86m DPS sweep, native-throughput proof or final ranking.
  Legacy parent creation still materializes69,930 parents; expanded requests/APLs are consumed
  by parent, and the independent probe kept two O(N) digest sets. Do not claim constant memory
  or native throughput from it. The probe created0 files/cache records; only the returned
  content-addressed receipt was saved afterward. Frozen native campaign and browser inputs
  remain protected despite this probe's completion. The first own generation-only
  attempt3481/PID96642 was deliberately SIGTERM-stopped at100k to compact its oversized final
  report into family count/digests before a clean restart; actual exit143/process absence was
  verified. No numerical sample/range was consumed or deleted. Do not resume that old handle.
- TWO-HAND FURY preparation is now implemented in artifact-only
  `optimization/review-tools/two-hand-fury.mjs` with matching `.test.mjs`. It is NOT integrated
  into the frozen numerical source or a production command. Settings constructor validates both
  factions,16 all-blue equipped items/eight Premier pieces, Arcanite Reaper12784/empty off-hand,
  legal51-point Bloodthirst/zero-DWS talents, zero manual stats/rage/freeTier1/item swap,
  Berserker starting stance, disabled Recklessness, one level63 target/300s, static compatible
  acquisition-checked enchants, non-raid weapon consume and no off-hand consume. It returns
  `uncaptured-control-settings`, NO native request blob/schema/DPS receipt. The constructor
  remains settings-only; its separate actual browser control captures are now saved below,
  not relabelled dual-wield baselines. Existing20/31/0 is only an unoptimized control; no numerical
  talent/gear search, native parity, style comparison or public default promotion has occurred.
  New seed helper redistributes ALL off-hand-only DWS ranks across21 declared damage/rage/
  tier-filler fields; fixed non-DWS ranks cannot decrease during this initial transfer.
  Real full200-parent integration gives1,741 unique legal51-point seeds across nine allocations,
  max3/3 Two-Handed Weapon Specialization and696 Spearing Strike candidates. This does not
  enumerate every global51-point allocation. Adaptive helper independently matches ALL legal
  one-point moves while retaining Bloodthirst and disallowing DWS. All13 prepared-data tests
  PASS,0 skipped; scoped ESLint passes. Actual integration separately checks all1,741 seeds,
  284 unique neighbors from four sampled full-weapon-specialization parents, both faction
  controls and unchanged source input bytes. Receipt `reviews/two-hand-fury-397867b72c1cba02.json`,
  SHA `397867b72c1cba0284835a0ba838b9782f8b4dfab941d9b7af6cfc56fffaa261`, pins the final
  constructor/test sources. Earlierb0f710… receipt remains unchanged. Final constructor also
  rejects unlearned Spearing Strike/Mortal Strike actions; a learned explicit Spearing action
  is preserved without claiming a good priority. Static-looking raid-recipe enchants are rejected.
  Source/model constraint newly verified from the real canonical tree: Improved Slam is Arms
  row5 (min26 points), Bloodthirst Fury row6 (min31); their57-point lower bound exceeds51.
  Do not construct an impossible talented-Slam/Bloodthirst experiment. Untalented Slam remains
  a legal filler with its actual native cast/CD/swing resets, not the improved Arms behavior.
  REQUIRED before numerical integration: owned tracked source/shared seed generator with every
  policy dependency hashed, style-specific campaign cases, native admission/parity of fresh2H requests,
  all-slot talent/APL/gear feedback and independent finals/practical access comparisons.
  Actual TWO-HAND BROWSER CONTROLS now PASS, exec82619 TERMINAL SUCCESS:
  `reviews/two-hand-fury-browser-controls-af67571108054340.json`, SHA
  `af6757110805434022b789798abe20b1b09521d3eb4de732f09180fc663084f8`.
  Separate fresh Alliance/Horde UI/WASM executions use the exact structural settings hashes,
  16 equipped blue items/eight Premier pieces, Arcanite Reaper12784/empty OH,20/31/0 and zero DWS.
  Low-N displays505.78/505.85 at25/1337 are integration controls, NOT independent evidence or
  a comparison against optimized DW gear. Full settings and real request bytes are saved.
  Actual decoded requests match ALL player fields outside the separately verified item database,
  all16 current item stat vectors, encounter/raid/party buffs/debuffs/tanks/dummies, one level63
  target/300s, static enchants/consumes, consent OFF and zero manual/free bonuses. All pinned
  source/input/served-engine bytes remain unchanged. No native job/build was started.
  The initial captures exposed verifier assumptions, not gameplay errors: UI omits default
  false/zero fields, pads zero stat arrays and serializes default level60 as0. Generated protobuf
  comparisons now preserve every combat field; narrowly canonicalize only all-zero manual vectors
  and documented0=60 (api.proto/core.PlayerLevel). Other levels/nonzero/malformed/sparse vectors
  fail. Five focused normalization tests pass, including sparse-vector red/green regression;
  scoped lint/format pass. No original structural receipt was overwritten or upgraded in place.
  The COMPLETE declared two-hand seed bank now passes browser-WASM ComputeStats admission:
  `reviews/two-hand-fury-bank-admission-265d13d0268c8a84.json`, SHA
  `265d13d0268c8a84e2df1ef1d170e53485acca3f705becaa227c1b74bb06eba3`.
  Reproduced the exact200-parent/1,741-seed ordered hashes and validated ALL26,101 applicable
  Spearing variants of ONE fixed captured Horde blue APL, plus two exact unknown/unlearned-spell
  negative controls. Mode counts:1,741 no-Spearing /4,872 opportunistic /14,616 on-ready /
  4,872 Battle residence; zero valid-policy warnings. Actual26,103 responses were checked in64-job
  batches through one immutable worker;226s, ZERO combat or native jobs. Ordered job/response
  digests are saved, not every raw response. The stats request is explicitly DERIVED from the real
  captured combat raid/encounter, removing empty bench slots and setting one active party.
  This is all of the declared seed bank on one fixed APL, not all global talent allocations,
  the2.86m priority frontier, native parity, a damage ranking or an optimized two-hand build.
  Probe `review-tools/probe-two-hand-fury-admission.mjs` is artifact-only, syntax/lint/format pass.
  ALSO REQUIRED Fury Spearing Strike frontier: legal low-Arms talent, Battle-Stance-only native
  attack, absent from BOTH current225 and staged69,930 APLs. Add talent-resolved stance/priority
  policies plus no-Spearing controls; seed points without a usable attack do not cover it.
  Native bonus is target-type dependent (Giants/Dragonkin); compare explicit mob-type scenarios,
  not a target-agnostic "best" claim. Numerical identity still4ee5e4d6… with ZERO changed inputs.
  No extra native workers/builds or two-hand DPS/optimality claim. Current campaign remains live.
- ISOLATED Fury priority/filler frontier is now implemented in artifact-only
  `optimization/review-tools/fury-priority-frontier.mjs` with matching `.test.mjs`. It uses the
  pinned225 rage/stance/Rend anchors and now generates69,930 unique APLs. Its original16,650
  bank remains intact: all SIX relative orders
  of Execute20662/Bloodthirst23894/Whirlwind1680; SEVEN filler families (none, Slam15, Hamstring30,
  both combined orders, both reserved50/60 orders); both Heroic Strike queue placements where
  applicable. No-filler/no-queue duplicates are removed, not counted as different experiments.
  All225 legacy APLs and the exact incumbent remain. Core action objects/conditions, unrelated
  action conditions and disabled Recklessness are preserved. New fillers use explicit rage
  floors and non-E20 guards; the factory changes NO learned talents, cast time or swing timers.
  Existing native hardcast/reset behavior still applies, not the improved-Arms Slam assumption.
  Fixed-blue rebuilding prevents cumulative fillers/Berserker Rage. Malformed/duplicated core
  actions, enabled Recklessness and exceeded explicit100,000-policy budget fail visibly without
  returning partial coverage. Unknown extra controlled incumbents are retained verbatim.
  All14 focused tests PASS,0 skipped; scoped ESLint passes. This includes a semantic per-anchor
  Cartesian coverage check, exact legacy/input preservation, all six core orders, filler/rage/
  execute/queue conditions, fixed-template rebuild and negative controls. Real current Fury
  selected-rotation +control integration ALSO passes:69,930 unique policies,
  225 legacy APLs preserved, all baseline/control/talent hashes unchanged and Recklessness OFF.
  Saved structural-only receipt `reviews/fury-priority-frontier-9e036274dd37c9d4.json`, SHA
  `9e036274dd37c9d4d450cd98fd3cde99642851db4fa54a017a2c56743c7d2a94`, pins actual input
  bytes, prototype/test/anchor source hashes, counts and placement/dependency assertions.
  These are STRUCTURAL checks only: no expanded-bank combat/native parsing/parity or DPS winner
  has been measured. The live optimizer and final gates STILL use the frozen225-policy code.
  At the next numerical-input boundary promote into owned tracked numerical source, keep the
  legacy anchor generator separate from the expanded wrapper (avoid recursion), and connect
  talent/final-rotation/export/independent-review consumers to the SAME expanded contract.
  Inline in the already-pinned Fury module or explicitly include every new transitive policy
  source in algorithm hashes; the campaign fingerprint alone must not permit stale talent-file
  reuse. Native/browser admission, measured screening/holdouts and full feedback remain required.
  Do not import ignored research artifacts from production or relabel old225-policy receipts.
  Expanded reactive priority stage is now STRUCTURALLY covered:180 reactive anchors each test
  the dependent2457→optional11574→11585 block in all FOUR positions among the core attacks.
  In these joint maintenance/priority variants, unchanged return-to-Berserker2458 and optional
  Berserker Rage18499 precede every core attack. Native source confirms a shared1s stance CD,
  Battle-only Overpower and Berserker-only/GCD Berserker Rage. Moving the entire old bundle
  after Execute could starve the stance return; do not implement that misleading comparison.
  Legacy order remains; all four new placements have13,320 policies each. The45 disabled
  anchors remain unchanged. Explicit metadata distinguishes these experiments from isolated
  Overpower gains. Template Battle must require active Offensive State1282733 and return stance
  must require it inactive; unrecognized dependency layouts fail visibly. Tests independently
  reconstruct all Cartesian signatures, action conditions, maintenance priority, dependent-block
  adjacency and rebuilds including a late-reactive/filler incumbent. NO extra native builds/jobs
  or expanded-policy damage measurements have run. Native admission, measured screening/
  retention diversity, independent holdouts and full feedback remain required at the boundary.
- REQUIRED set-assignment frontier found while Fury runs:37 eligible sets/185 pieces. Spider's
  Kiss65 has two unique one-hand weapons (13183/13218), both fit14/15; both legal orders are in
  the full weapon-pair bank, although the first-fit set block collapses them into one slot.
  Postmaster81 has unique ring13392 fitting10/11. Current set generator chooses10 only and
  omits15 legal ring11+armor packages; both full five-piece placements were checked, duplicate
  rings correctly rejected. Earlier Arms35-set audit established no SAME-SLOT EP variants,
  NOT exhaustive slot assignments: the ring-placement frontier also needs closure for Arms.
  Do not call whole Warrior/global set coverage complete using those scoped receipts.
  ISOLATED tested prototype lives in artifact-only `optimization/review-tools/set-slot-assignments.mjs`
  with matching `.test.mjs`. It enumerates every candidate/slot choice, preserves legacy order
  for one-choice slots, delegates actual uniqueness/acquisition to existing gear legality,
  snapshots candidate arrays and fails BEFORE yielding if its explicit safety budget is exceeded.
  No EP pruning, silent truncation, source/lease/build mutation or public setup command.
  All10 focused tests pass,0 skipped, including both ring/weapon orders, ownership boundary,
  budget rejection, array mutation and all17 slots; scoped ESLint passes. Actual37-set integration
  on pre-pair checkpoint9db75905… preserves ALL3,097 old item-ID layouts and yields3,114 legal
  unique layouts from3,132 assignments:15 extra Postmaster packages +two Spider's Kiss orders.
  The two weapon orders are already in the paired-weapon bank; these are layout checks, not
  damage/enchanted-request results. The incumbent was unchanged by the integration probe.
  This is NOT integrated into the frozen optimizer yet. At the next numerical-input boundary,
  promote the helper into an owned tracked module, replace the first-fit/one-EP-per-set-slot
  builder with all compatible slot pools and update the independent coverage replay/tests.
  Never import an ignored research artifact from production code. Use the ordinary new
  fingerprint/full-feedback/independent-validation flow; never relabel old receipts as expanded
  coverage. Complete this, Fury priority/fillers, relevant weapon styles and practical-access
  cases before declaring the class finished or moving to the next class.
  Spider's Kiss model source itself labels its proc uncertain and currently applies armor to
  the wearer. Review current client/observed effect evidence before recommending that set;
  no game-mechanics correction was inferred or applied from the source comment alone.
- NEW owned READ-ONLY raw coverage command: `pnpm simulator:prebis:coverage --gear-review=<path>`,
  implemented in `scripts/review-prebis-gear.mjs`; tests via `simulator:prebis:coverage:test`.
  Recomputes the actual numerical fingerprint, validates linked baseline/talent/DB/engine inputs,
  current canonical class tree,51-point legality and request encoding,
  all17 pools, full final-sweep group/proposal coverage and exact80/500/2k cache shortlists/
  winners, both100k raw checks, aggregates, gear fallback and disjoint RNG ranges. It distinguishes
  metric references from unique records and stable search gear from retained original gear.
  Bounded archive reads, realpath containment and platform-aware traversal checks; no build,
  native workers, lease mutation, artifact write or public promotion. The diagnostic is not a
  numerical generator dependency; adding it and two package aliases left the actual4ee5e4d6…
  campaign identity unchanged with ZERO changed inputs. No fingerprint filter was modified.
  All12 focused tests PASS,0 skipped on the real current dataset: argument/path/size/symlink
  guards, a full real final-sweep replay, unfinished receipt and self-consistent omitted pool/
  group, forged numerical fingerprint and incorrect aggregate negative controls. Scoped ESLint
  passes. Earlier manual first-proc coverage replay also passes through this owned command;
  current second-proc proof is archived above. It is OPTIONAL independent operator validation,
  not a falsely claimed automatic campaign stage. Runbook documents usage/limitations.
- Weapon-source parity audit is COMPLETE, not an outstanding engine bug. Raw source catalog
  build69893 conflicts with build69913 vendor captures for six damage ranges:272594,272595,
  272599,272603,272681,272683. Before changing anything, checked the actual compiled database:
  ALL18 exported weapons already match observed min/max/speed exactly. Upstream
  `compile_forever_equipment.py` explicitly overrides raw weapon values using `weapon_fields`
  on the vendor capture. Served UIe14 database HTTP200 matches the ENTIRE native DB029b; actual
  isolated Chromium hovers for all six disputed IDs show the correct observed values, zero page
  errors and zero combat requests. No item was equipped, numerical input changed or job restarted.
  Immutable manual evidence `optimization/reviews/weapon-vendor-parity-44776d1fe9813199.json`, SHA
  `44776d1fe9813199231d92cfb554f21735ddfcb0c3ad1abdc7d1eda2217ad4af`, pins source bytes/native/DB
  and all18 comparisons. Capture build69913 remains beta evidence, NOT proof of today's server.
  IMPORTANT for future guides: use compiled combat values and join source metadata separately;
  copying raw catalog weapon fields would reintroduce six known conflicts. See catalog-coverage doc.
- Local build-review handoff is now an OWNED command: `pnpm simulator:prebis:share --case=<case>`,
  implemented in `scripts/review-prebis-build.mjs` with `simulator:prebis:share:test`. Original
  staged tools under `artifacts/forever-simulator/optimization/review-tools/` were retained for
  reference, not deleted or used as the supported entry point. This is a read-only browser/UI
  tool, not a numerical optimizer/build dependency; actual status after promotion confirmed
  ZERO numerical input changes and the same4ee5e4d6… identity. No fingerprint filter or engine
  source was weakened/edited to achieve that separation. It reads the
  latest case, validates evidence/current fingerprint/native/browser DB, uses the real UI's full
  Export Link, then imports into a second CLEAN browser context. All player combat settings,
  encounter and raid/party/debuff settings are deeply equal; personal browser storage is untouched.
  UI preferences/EP weights are deliberately not imported by the engine's standard share format.
  `--case=<case>` requires completed final audits. `--allow-pending` explicitly permits a
  `core-reviewed-final-audits-pending` preview, never a finalized recommendation. After the real
  Arms case completed, its actual default SUCCESS branch ran and produced a `reviewed-local`
  full-browser round-trip receipt `share-links/arms-alliance-a35dc4ed6b405efd.json`. The old preview
  receiptebc781480b9e685f remains archived and was not relabelled. No extra combat simulation
  or native build ran. The supported command produced a new conservative full-browser receipt
  `share-links/arms-alliance-94d6c164fa6db67e.json`; old receipts remain valid/immutable. Five CLI
  guard tests pass; three require an installed campaign and explicitly skip without one. Both
  unfinished final mode and --allow-pending without core feedback are rejected before browser
  launch. Proc scenarios now carry `requiresProvisionalEnchantOptIn`, cross-checked against
  case/feedback/export. The verifier checks consent OFF in both contexts; links NEVER enable it.
  The real PROC PREVIEW CLI branch has now PASSED after actual core closure:
  `share-links/arms-alliance-procs-dc030d0122315714.json`, SHA
  `dc030d0122315714bc23c56e94d7e2c3ad4d202d601f88c1c43d0e61001f710d`, status
  `core-reviewed-final-audits-pending`,791-character full-build URL. All combat settings match
  in both isolated browser contexts, consent OFF in BOTH, no combat run or defaults changed.
  Real localhost review-page link path ALSO passes:200/noindex, exactly one reviewed conservative
  case and one visibly unfinished proc preview,822.98 reference,1440/390px no overflow; clicking
  its actual link loads the exact full baseline in a fresh browser, consent OFF, zero combat
  requests and zero page errors. Initial ad-hoc context instrumentation caused three storage
  errors in blank/sandboxed documents; restricting the test hook to top-level localhost pages
  fixed the HARNESS, with page errors still unfiltered. No product bug/change was inferred.
  Actual OPTIMIZED preview also rejects clicking Simulate before consent with the expected
  Crusader enable-provisional-model warning, ZERO raidSim/raidSimAsync requests and no page errors.
  This supplements the earlier unoptimized proc-blue guard test; no opt-in was enabled by the link.
  Proc FINAL CLI branch has now PASSED without --allow-pending, producing
  `share-links/arms-alliance-procs-dd1a5306345f12d0.json`, SHA
  `dd1a5306345f12d023d521e18440053e7da3cf09315b10817f99b0b529fac0c7`, status `reviewed-local`.
  Old previewdc030d… is retained unchanged, not relabelled. Both fresh browser contexts preserve
  all combat settings with consent OFF. The actual review-page path now shows TWO reviewed
  Arms cases, no proc preview;200/noindex,1440/390px no overflow, actual final-link click matches
  the full baseline in a fresh popup, consent OFF, ZERO combat requests and ZERO page errors.
  Initial final-share attempt exposed a real review-tool race: Bootstrap ignores Close before
  shown.bs.modal. New owned `scripts/review-prebis-browser.mjs` waits for shown/hidden events,
  asserts consent without changing it and removes its temporary observers/markers. No forced
  DOM hiding, fixed sleep, engine/source change or consent bypass. All9 focused tests pass,
  0 skipped, including a real Bootstrap opacity-transition failing-before/passing-after fixture
  and a checked-consent negative control. Scoped ESLint passes. See fixes/runbook. This is an
  outer operator-tool fix, not a deployed game-model/UI patch; no defaults/public deployment changed.
- NEW local review screen: `http://localhost:3017/forever/simulator/review`, linked from the
  development simulator directory. It is read-only, noindex and DEVELOPMENT-ONLY; production
  returns not-found BEFORE touching research files. The typed server reader checks receipt
  hashes, campaign/release links, referenced file containment (including symlinks), size limits
  and complete final artifact links/settings. Pending previews never inherit a final label;
  a newly verified final browser share receipt is required. Stale/partial-category/foreign links
  cannot be offered. Imports are explicit, with a save-current-character warning; no auto-load,
  simulation, opt-in, default replacement or public publication.
  35 focused Web tests pass, including final/preview/stale/corrupt evidence, hash-valid wrong
  exported settings, oversized files and production-denial-before-I/O. Full Web
  `tsc --noEmit --incremental false` and scoped ESLint pass. Earlier preview Playwright smoke
  on the existing3017 server
  passes:200/noindex, unfinished label,390px no horizontal overflow, exact full Arms setup loaded
  in a clean context with39/10/2 and HoJ+Adaptive; no combat simulation ran or browser errors.
  Current campaign fingerprint is still4ee5e4d6… with zero changed inputs; free space4.94GiB.
  Preserve existing unrelated simulator-directory edits; this turn only added its dev review link.
  NEW actual final-path Playwright smoke also passes:200, exactly one reviewed case, real final
  receipt loaded through the page's explicit link, and DEEP EQUALITY of every player, encounter,
  raid/party/debuff/tank/target-dummy field against the final baseline. Zero browser errors and
  no simulation started. The provisional Arms case remains visibly unready; not silently opted in.
- Explicit proc-consent flow is implemented in the review UI/reader and owned share command,
  not the frozen engine. Missing/contradictory opt-in metadata is rejected; legacy conservative
  receipts remain valid without enabling anything. UI instructions say Main Hand → Change
  enchant → Allow provisional proc models; repeat after reload. Actual clean-browser tests on
  the UNOPTIMIZED proc-blue control pass: zero combat requests before consent, one WASM smoke
  iteration after an explicit checkbox action, then consent OFF and combat blocked after reload.
  Separate real Export Link/import preserves all combat fields and Crusader1900 while consent
  remains OFF in BOTH isolated contexts. This is UI transport/safety evidence, NOT BiS evidence.
  Root/shared-source lint and Web typecheck pass. Latest numerical fingerprint still unchanged,
  free space4.84GiB /reserve4GiB. Do not bypass core review just to exercise the proc CLI path.

### Earlier partial-trinket correction and fresh Arms run (October 17; superseded above)

- CURRENT LOCAL UI `21a0ef96934be4ef740d6de4`, native
  `3dde1e2bc7192e1899e92d2c46404cdaa997bc8ded9667a9f7255bbac22f8e90`,
  DB `029bd1e5c3e7382a0ee230c503fed0cb22220ea5bb4db16347d632321b6bd0f4`.
  Still2,591 items:1,954 complete current-stat items and637 historical references, two of
  which now have explicitly PARTIAL current effects. Public r15 remains unchanged.
- Owned `drakkisath-trinkets.mjs`/Go helper/tests validate exact linked current records and
  spell text, and replace (not stack) Blackhand13965/Eye13968 historical2% passives with1%.
  Blackhand use gives5% attack/spell crit only to its owner against one marked target; Eye
  gives7% spell hit only. Both20s/CD300s/shared20s. Classic does not receive the new uses.
- Their missing ItemSparse/base metadata and acquisition remain historical/provisional.
  Empty script1318945/1318846 and Blackhand Orc/Ogre doubling remain unmodeled and disclosed
  in import/tooltip metadata. Do NOT call these complete current items or server-verified
  mechanics. HoJ still has the existing explicitly provisional model; no fabricated rates.
- `pnpm simulator:prebis:verify-drakkisath` passes, receipt
  `optimization/drakkisath-browser-5082090688c48977.json`. An executable missing-use Go overlay
  fails the intended runtime assertion, while current scope, actual physical/spell crit,
  spell-hit-only, cooldown, reset and Classic checks pass. Real browser/native results match
  both items over25 runs at299s/599s with25/50 uses. End-time events are inclusive, hence
  fixtures stop1s before CD boundaries. Initial Warlock fixture inherited free Tier1=true;
  corrected to false like native before the passing comparison. These are not BiS results.
- All181 Node simulator tests, scoped ESLint/Prettier, strict upstream TypeScript and full
  22-page build/installed Go checks pass. Five-profile catalog browser smoke passes, including
  current recoveries, source restrictions, quest ownership and real combat. Exact native is
  archived without overwriting prior binaries.
- Fresh current Arms blue baseline `warrior-arms-alliance-blue-a385a1ce5d970b09.json`, control
  `warrior-arms-alliance-blue-control-d126c4767ee2153c.json` (fullSHA
  `d126c4767ee2153c0b38699d85d43ea0e3e5b6e34999954a1ab7d51b09ea1001`).
  Real browser control554.60DPS is UNOPTIMIZED. Old equipped-data guards correctly prevent
  silently calling the previous13965 gear unchanged; this run starts from fresh fixed blues.
- Fresh feedback session `4f2018033bc0096cc80fa960a329fa5eff055efbcd32c4a3135e60030b192518`
  launched under exec93636, with241 legal Arms seeds, six workers and100k validation iterations
  per independent seed. Re-poll its actual handle/process before reporting it live; no old
  session was resumed. Freeze all algorithm/UI/database inputs while it is running. Then
  audit the final rotation, revalidate Fury, and continue every requested spec one at a time.
  The all-class goal remains active/incomplete. No new public recommendations or deployment.
- Subsequent CURRENT progress: talent stage `warrior-arms-0c12bcb9eafee951-talents.json` is
  complete (18,429 simulations /6,799,800 iterations). 241 seed builds ×26 retained policies
  followed the451-policy/two-control audit; three refinement rounds retained39/10/2, Overpower
  first, Slam + Hamstring, Battle Stance, no Heroic Strike on THIS fixed blue gear. Both100k
  independent checks pass:572.9395→627.9505 and572.9136→628.0461DPS (9.6015%/9.6232%). This is
  combined talent/APL improvement, not isolated talent value, global BiS or a gear result.
- Early real browser/native receipt `talent-browser-27f8f91da13a3f9e.json` matches625.2632721 /
  UI625.26 at25/1337, with exact search-versus-browser context equality. New optional
  `scripts/verify-simulator-talent-candidate.mjs` uses the archived SHA-verified executable,
  never rebuilds or touches frozen algorithm/catalog inputs, and keeps an immutable receipt.
- Feedback driver3377 has now launched gear child9812, workers9824–9829 (exec93636). Confirm
  their current liveness before relying on those PIDs. Full actual-gear talent/APL feedback,
  browser review and final rotation audit remain outstanding. Do not promote the blue winner
  as a final pre-raid build, or resume an older engine's session.
- All182 simulator tests pass after adding early-candidate CLI argument regressions; scoped
  ESLint/Prettier and diff whitespace pass. Gear pass1 completed11,939 real simulations /
  1,563,040 iterations and pass2 is running; screening DPS is not a validated gear gain.
- LATEST Arms progress: first gear stage `warrior-arms-1a8354872ea4fb89-gear.json` converged
  after four passes (45,684 simulations /6,297,260 iterations INCLUDING validation). Both100k
  independent checks pass628.040879→797.047460 and628.011386→797.030115DPS:26.9117% average
  equipment/enchant gain at unchanged talents/APL. Current admitted-pool coverage and complete
  gear legality were rechecked independently against feedback baseline5f4c9840… and PASS.
- Actual-equipment feedback baseline `warrior-arms-feedback-5f4c98404dc4b18a.json` has fullSHA
  `5f4c98404dc4b18a450563df3db0b8028f0008973e467d63849d4f0212d54b4b`. Gear currently selects
  HoJ11815 + Adaptive Combat Assistant272437, NOT Frozen Heart or Blackhand. Provisional IDs
  [22340,12927,12555,13098,11815]. This is not yet final: actual-gear talent/APL feedback is
  running and may change the optimum. Do not publish a trinket conclusion from screening alone.
- Same driver3377/exec93636 now runs talent child16074/workers16086–16091. Gear child9812 and
  its9824–9829 workers are TERMINAL after success; do not resume them. New talent stage audited
  450 policies on two controls, retaining25;241 legal seeds. Poll actual handles/PIDs before
  reporting liveness. Full session remains running with completed[talents,gear,feedback].
- Before final recommendation, independently challenge the final accessory choice on final
  gear (including HoJ/Blackhand/Frozen/Adaptive) and scrutinize close gear/enchant contenders.
  A significant improvement must return through feedback, not be added to a “finished” build.
  Existing pool coverage proves the search included candidates; it does not prove every tiny
  per-slot gain independently. No public defaults, commits or deployment were changed.
- LATEST completed actual-gear talent evidence405730e27a298490 (21,005 simulations /7,256,000
  iterations) retains39/10/2 but changes Heroic Strike to≥90rage. Both100k checks pass
  796.936167→802.291004 and796.910570→802.273218DPS (+0.6719%/+0.6729%). Early browser receipt
  `talent-browser-8f3e195f858d9ff3.json` matches815.9640981/UI815.96 at25/1337. That small-run
  parity number is NOT the high-iteration mean or a new gain measurement.
- CURRENT Arms conservative feedback is CLOSED: session4f201803… is `closed-loop-reviewed`,
  exec93636/driver3377 and all its children/workers are TERMINAL after success; lock released.
  Final baseline `warrior-arms-feedback-37fd40e3556582d1.json`, gear7b8b2a15d2269546,
  talents1dd11f32f0ae0ca9 (kept incumbent/no proven gain; cached screening reused correctly),
  browser0154b12ffaf31f98 and review71bc85c4f2716167. Review status `closed-loop-verified`,
  400k measurements/reference802.4207629DPS on native3dde/UI21a/DB029b. No known raid weapon
  consumes; five historical IDs remain disclosed and Rank14/exalted access is uncapped.
  Gear2 converged unchanged at mean802.4856937 with selected HS≥90 APL, not an invented gain.
- NEW finalization tool `scripts/audit-simulator-accessories.mjs` and pure
  `infra/simulator/accessory-challengers.mjs`: requires a closed400k review, checks exact current
  pool/source/native/tree/DB, reserves the same workspace lock and screens ALL legal ordered
  pairs at2k iterations on a new disjoint seed. Every pair within four estimated SE of the
  incumbent is confirmed in BOTH disjoint100k ranges; three SE required in both to flag a
  challenger. Shared-control batching fills six workers without concurrent cache.run calls.
  New winners require feedback; lack of a confirmed challenger is not a global-BiS/tie proof.
- All188 simulator tests, scoped lint/format and whitespace pass. Six new regressions cover
  ordered/duplicate/quest/unique/class/faction/raid/profession legality, no EP/ilvl cutoff,
  unchanged other slots, explicit-zero dedup, uncertain shortlist/confirmation, shared batch
  indexing and CLI guards. Real pool generation reproduces1,625 trinket and4,042 ring pairs.
  Unfinished gear-only evidence is rejected before touching the live feedback lock.
- Historical standalone tools exec56912/PID24515 (trinkets) and exec37296/PID28579 (rings)
  are now TERMINAL SUCCESS, not live jobs. Current receipts and archived source versions are
  recorded in the repeatable-campaign section above. Both retained the incumbent; final rotation
  audit and actual public-build review remain required. The all-class goal is still incomplete.
- Local free space5.1GiB; simulation-cache2.1GiB. No cache, old engine, source evidence or
  user data was removed; watch space before expanding to the remaining cases.

### Requested next phase: rotation guidance and original search content (October 17)

- After verified build recommendations, ship practical rotation guidance tied to the exact
  winning APL: opener, sustained/execute priorities, resource thresholds, cooldown timing,
  talent interactions, common mistakes and separately measured simplified alternatives.
- Plan: `docs/simulator-rotation-guides-content-plan.md`. Includes immutable evidence/prose
  mapping, current-engine publication gates, practical human review, and original acquisition,
  stat/enchant breakpoint, patch-impact and matched-scenario comparison content.
- Public guides should be server-rendered, canonical and crawlable without WASM, with honest
  current-model confidence and appropriate Article/breadcrumb metadata. Google primary guidance
  was checked; no first-page guarantee, duplicated keyword pages or unverified DPS claims.
- This is the next product phase, not a replacement for completing all requested class/spec
  talent/APL/gear loops. The previous local talent links show archived Fury/Arms winners only.

### Current MCP model correction (October 17)

- A read-only coverage audit found a real runtime error in an ALREADY eligible item, Manual
  Crowd Pummeler9449. Current raw ItemEffect98990 specifies3 charges/180-second cooldown;
  actual registered Forever handler had30 seconds/unlimited uses and also granted ranged haste.
  The initial isolated Go regression failed on the actual handler, not just a source-text guess.
- The old feedback exec84303/session1946fe9d…/driver31738 was intentionally SIGTERM-interrupted
  because of that verified model bug. Session is `interrupted`, zero completed steps; driver,
  talent child31959 and all six workers are TERMINAL, lock released. Do NOT restart that session.
  Cacheb7545a20… and exact nativef59e are preserved, not relabelled as new model evidence.
- Shared native/browser installation now applies owned `manual-crowd-pummeler.mjs` and Go
  helper/test. Checksum-verified current tables pin the item/link/payload, unique ownership,
  charges/cooldown, aura319 and30-second duration. Model uses melee-only haste/no resource-haste
  assignment, three uses per encounter/item, no inventory swapping and fresh charges per
  independent iteration. Classic remains its original30-second/all-attack model. Aura319
  semantics are cross-checked against TrinityCore's enum, not claimed as observed server behavior.
- Original/fixed Go proof `optimization/staged-mcp/42937b7094c29600/review.json` passes: original
  fails current cooldown, fixed passes Classic/Forever, charge exhaustion, blocked early uses,
  haste application/expiry, no ranged benefit in Forever and proper encounter reset. The first
  harness reset lacked Cleanup; corrected lifecycle rerun passes. Three new Node regressions
  cover current fields/negative controls and patch idempotence/source drift.
- MCP-stage LOCAL UI `b17a877c7b8dc0b6ce96fa12`,22 pages,2,591-item DBaacaba…. Native
  `5eafabc2a9f47cc6aab93e002517845a5829f6a448ac3bdacb962e8bdc284991` was archived with exact
  SHA verified. Public5df1/r15 is unchanged. `pnpm simulator:prebis:verify-mcp` proof
  `optimization/mcp-browser-b6864d11c2d38029.json` matches real browser/native combat and current
  charges/cooldown: over25 runs,300s old263/new50 uses;600s old511/new75. Non-MCP Arms812.9482600
  is exactly unchanged. These forced integration fixtures are NOT new BiS recommendations.
- Full177 Node tests, strict upstream TypeScript, installed build Go checks, scoped ESLint/
  Prettier and22-page build pass. Five-profile catalog browser smoke passes, including the MCP
  cooldown/charge/melee-only tooltip, recovered-item stats/provenance and faction rejection.
  Build/source-generation and direct Go checks remain serialized. No new production deployment.
- Fresh corrected-engine Arms control is COMPLETE: blue7304da1b8a8cf699/controla853e1d5fdf4eb18,
  warm start2b0ae4f0dddd214a from archived3939…, browser/native receipt8a4bf408a749287d exactly
  matches812.9482600/UI812.95 at25/1337. Current mana proof7c164627c5dc2557 passes all three
  model fixtures. These are integration/control checks, NOT fresh optimized recommendations.
- NEXT PRIORITY before launching another ranking: reconcile current raw effects on provisional
  references. Read-only immutable audit `optimization/item-model-coverage-abb967aed3ba61d4.json`
  checks80 currently admitted item on-uses and135 historical-reference items with current raw
  links (23 historical on-use items). Raw effect rows without ItemSparse/normalized item records
  are PARTIAL evidence, not a complete current item-stat/metadata record. No catalog mutation.
- Selected Blackhand13965 has current passive1318954/Effect1352661 (+1 melee/ranged crit), use
  1318944 (+5 owner-specific crit against enemy via aura306,20s/CD300s/shared category1141/20s)
  and dummy1318945/aura4. Eye13968 has passive1318956 (+1 spell crit), use1287840 (+7 spell hit
  for20s/CD300s/shared1141/20s) and dummy1318846/aura4. Their ItemSparse and normalized item
  records are MISSING; Classic2% crit fallback does not incorporate those partial current effects.
  Do not silently infer complete base stats/metadata, ignore dummy scripts, duplicate passive
  stats or bless old current-effect behavior. Hand of Justice11815 also has partial raw links
  without complete current item metadata. Research/implement a provenance-aware reconciliation
  and appropriate model review before another expensive gear loop. No optimizer is running.
- Preserve the full23 damage cases plus Shockadin/other good supported hybrids and role-appropriate
  tank objectives; goal remains active/incomplete.177 tests/strict TS/current browser checks pass.
  Free space6.3GiB. Do not delete old caches, releases or exact binaries to hide state differences.
- Separate read-only floor audit found91 historically non-raid low-ilvl omissions,82 with current
  item records and19 of those with linked effects. MCP is NOT one of those omissions: it was
  already admitted/eligible, exposing the runtime bug above. No low-level items were imported,
  current stats fabricated or active data changed by this audit. Full coverage still needs review.

### Earlier interrupted current-catalog Arms feedback (October 17)

- Prior turn made concrete progress:26 reviewed current items were admitted and verified locally,
  changing candidate coverage. The all-class goal is still active/incomplete, not a Warrior-only goal.
- Version-aware controls are implemented in `infra/simulator/baseline-control.mjs`. New captures
  write immutable, content-addressed control plus executable baseline; the baseline carries the
  control path/SHA. Talent search, feedback fingerprints, rotation audit and export all resolve
  that same reference. Legacy evidence retains its old template; mismatched DB/identity/content,
  path escape and control chains fail closed. Canonical old files remain byte-identical.
- `pnpm simulator:prebis:baseline --spec=warrior/arms --faction=alliance` produced new-catalog
  blue baseline58fc6a1f4c1c2bbc, controlc0cf3a3921dcaf96. Current non-raid Fury baseline is
  2c64adc00641752b/controlc982c62576a4fba0. Earlier diagnosticc516/d38d had inherited raid-recipe
  weapon consumes and is NOT the current Fury control. Captures now normalize those consumes
  before the browser request; old files are preserved, not overwritten.
- `pnpm simulator:prebis:refresh --baseline=<archived-final.json> --control=<fresh-blue.json>`
  is a guarded warm start, never a new recommendation. It checks the archived DB hash, all
  equipped item/enchant data, current non-raid eligibility/consumes and talent/APL legality;
  recaptures the real current browser request and links an immutable new control. Prior
  coverage/results are not inherited. Conservative Arms seed572ee0202ddc31ca derives from
  archived3939…; browser/native receipt54a48c228d24894f matches812.9482600/UI812.95 at25/1337.
- INTERRUPTED exec84303/driverPID31738, feedback session
  `1946fe9dc01af2b4e7b8d9c5d3d53ab89b2447353f75908c1d289a1687446d0b/session.json` under
  `optimization/feedback-sessions/`. It ran six workers/241 legal Arms seeds under nativef59e,
  DBaacaba/UI3857 and algorithm64220fd362ada8febade319d0c6ce78ec35ab0ae94b1fe6e4ff4fe8c387ac8c3.
  It is now TERMINAL after the verified MCP bug above; preserve it, do not resume/relabel it.
- Initial rotation screen completed451 policies on two talent controls and retained26 variants.
  Current cache namespaceb7545a20cc816c649d8e4887fe0d6248e5beca899522bac7992febdb958b0475 had
  1,413 completed jobs/1,157,500 iterations at the last measured snapshot; these are intermediate
  cached computations, not a finished talent/gear proof. Six native PIDs32179–32184 were confirmed
  live at93–96% CPU. Driver child31959 is the talent CLI. Exact nativef59e was archived with its
  byte hash verified. All four older reviewed Warrior baselines still resolve their original
  legacy controls through the new loader; no historical control/receipt was rewritten.
- Its47 frozen source/data paths were unchanged until the intentional interruption.174 Node
  tests passed at that checkpoint. No public default/deployment/commit/push changed.
  NEXT: new-model rerun, independent final rotation audit and export, then the explicit-proc
  Arms case under the new catalog; affected Fury refresh and the next class follow sequentially.

### Earlier local engine: reviewed current-item recovery (October 17)

- LOCAL UI `3857bbcbda4b436714931a96` is built and manifest-verified: 22 pages, 2,591 items,
  comprising 1,954 current-stat items and the unchanged 637 historical Classic-stat references.
  Native SHA `f59e2df32f80ccdfb6aac7214c4698a378ba443f51f39111013ec1bc9b353615`;
  parsed database SHA `aacabaeeb0be7bd8b241373d5372f3ad3a86cbef6d2af69e80f2e2b868523048`.
  Public r15/engine5df1 remains unchanged at 2,565; HTTPS was rechecked successfully.
- All 26 reviewed current records are now admitted locally through owned
  `infra/simulator/current-prebis-equipment.json`, the guarded raw-evidence loader and pure merge.
  Exact snapshot/table/compiler/acquisition evidence is revalidated on each build. Never copy
  historical stats over them. Three unresolved IDs9394/9419/18760 remain blocked. The original
  stage92fe and compiler parity15709 remain immutable historical evidence, not active status.
- Current stats and provisional historical acquisition are separate source fields, propagated
  into tooltips, optimization reports, independent review and portable exports. Cape10776 CC,
  set548 Gouge and six unsupported D1 procs remain explicitly unmodeled; no fabricated damage.
  Rogue PvP22879/23258 retain current set0/Horde historical access;23298/23313 retain548/Alliance.
  Class masks, unique limits and current required levels are preserved. Faction access is an
  explicit historical-source assumption, not an observed client wearer flag or confirmed vendor.
- `pnpm simulator:prebis:verify-current` produced
  `optimization/current-prebis-browser-6610123df8eac186.json`: fresh raw input checks, full26
  compiled-object equality and three actual browser/native combat fixtures pass at25/1337.
  Rogue534.00, Warlock723.82, Hunter789.90 are NON-OPTIMIZED integration results, not recommendations.
  `node scripts/smoke-simulator-catalog.mjs` passes all five profiles, exact source metadata,
  tooltips/search/equip/reload/combat, duplicate ownership and incompatible PvP faction rejection.
- `pnpm simulator:prebis:verify-dungeon-mana` passes on this new catalog/native binary, receipt
  `optimization/dungeon-mana-browser-04bcf7322baa2cd5.json`; all three fixtures still match real
  browser/native DPS and recover mana, versus zero in exact archived62fe requests. Earlier proof
  27455 remains preserved. Node169 tests, strict upstream TypeScript, scoped ESLint/Prettier,
  `git diff --check` and immutable build-manifest verification pass. Free space6.5GiB.
- NEXT: preserve old engine/data/receipts. Old fixed-blue control filenames refer to DBb11f;
  never overwrite them or relabel old reviews. Immutable versioned controls are now implemented
  and recaptured; affected-case revalidation is running as recorded above.
  Actual eligibility audit finds20 newly eligible recovered IDs in EACH of the four archived
  Warrior cases (conservative/proc Fury/Arms); current coverage correctly rejects all four.
  Arms includes9408 two-hand; Fury instead includes9401 in either hand. Rogue-only PvP IDs stay out.
  Then implement the next spec's own blue control/talent/APL policy. The all-class goal remains
  active and incomplete. No commit/push/new deploy performed.

### Earlier local dungeon mana integration (October 17, superseded build)

- Three reviewed five-piece models are now INTEGRATED LOCALLY, not merely staged: Magister181,
  Devout182 and Beaststalker186,5%/200 mana. Shared guarded installer is called by native and
  browser builders; all source bytes and current-client payloads are checked before patching.
  The support-query API now agrees with runtime dispatch. Other six unsupported D1 procs and
  all four-piece utility thresholds remain disabled. Native SHA
  `5f67aa508b8263496307c4f636d9d6b586c61d9afbc6ddbde83e9f26f3465b23`, local UI
  `45fc7e86c7768fbd7b4a08a2` (22 pages). Database remains EXACTLYb11f…/2,565 items;26 recovered
  items were not admitted at that point; the newer local recovery above supersedes this status.
  No new public deployment or optimized defaults.
- Native62fe was archived exactly under `optimization/native-engines/` before rebuilding.
  Old UI23e8/data/receipts/exports remain preserved. The completed Arms cases below are reviews
  for62fe, not automatically fresh evidence for5f67. New native Arms25/1337 smoke equals old
  812.9482600 DPS exactly; this is not a replacement100k search. Group data recovery with the
  pending affected-case revalidation rather than relabelling old results.
- Real combat proof `optimization/dungeon-mana-browser-27455b6a7d86c7a4.json`: all three forced
  five-piece integration fixtures match actual browser/native DPS at25/1337 and recover mana;
  archived62fe recoversZERO for the same exact requests. Actual mana totals over25 iterations:
  Magister52622.8015, Devout36400, Beaststalker39000. These are NON-OPTIMIZED integration cases,
  not recommendations or statistical DPS-gain claims. Fixture item/enchant data equality, browser/
  native DB equality, revision and verifier source hashes are checked/recorded. Earlier646447…
  proof remains archived. Reproduce with `pnpm simulator:prebis:verify-dungeon-mana` (no overrides).
- Node suite162 passes,10 focused mana tests pass, scoped ESLint/gofmt/Prettier pass. Actual
  installed Go core/common tests pass, including mana recovery, support reporting, negative
  thresholds/events, missed autos and no duplicate stats. A parallel diagnostic initially raced
  generated enchant-file writes; it was rerun sequentially after the browser build and passed.
  Do not run source-generation builds and direct Go checks concurrently. No errors in model combat.
- Staging remains usable after installation: loader is shared, and isolated original/fixed
  overlays now explicitly cover BOTH dispatch and support-query sources. New original/fixed
  proof7c08e0f408a15871 passes without changing active inputs. Pre-integration017423… and older
  1bdb…/ce343… are preserved. Runtime helper/test and metadata dependencies are fingerprinted;
  the new feedback source set has42 inputs. Local free space is now6.7GiB.
- At this earlier checkpoint, NEXT was current-item recovery/provenance admission and affected-case review, then the
  next spec's own blue control/talent/APL policy. No optimization driver is currently running.
  Full class/spec scope remains incomplete;23 named damage cases plus Shockadin/other good
  supported hybrids remain in scope. Do not resume terminal Arms jobs39407/59266.

### Extended catalog and MythicSim request rechecked (October 17)

- Public HTTPS returns200 and serves engine5df1a1d37d43e95fa440c1b5:2,565 items,1,928 current /
  637 provisional Classic, all14 equipment types. HoJ11815 and Blackhand13965 are present;
  sampled raid exclusions remain absent. No new deploy/restart was necessary.
- Four bounded read-only MythicSim snapshot GETs validate against current talent trees and retain
  the imported Fury18/31/2, Arms39/10/2, Shockadin23/0/28 and Survival0/20/31 allocations and
  source engine5af1303. Live response bytes differ from October16; pinned source evidence and
  frozen reference archive were NOT replaced. Cached import replay and10 focused reference/
  talent tests pass. Examples remain attributed LOCAL search seeds, not public defaults; foreign
  gear/enchants/APLs are not installed. See `docs/simulator-reference-builds.md`.

### Archived62fe Arms reviews and admission research (October 17)

- Conservative Arms is COMPLETE on archived native62fe. Feedback6dea2e63d16aba70 gives
  805.8479651 modeled DPS/400k disjoint iterations. Final all450-policy audit91086cea65cefad7
  retains the incumbent. Portable export `reviewed-builds/warrior-arms-a2d3a980b135f4c6.json`
  replays unchanged; no private paths or opaque native request are exported. Final39/10/2,
  overpower-first, Heroic Strike≥90, Slam+Hamstring, Battle. Six provisional historical items
  22340/12927/12555/13098/13965/11815 remain labelled. Conservative means no provisional weapon
  enchant procs, NOT all server availability/behavior verified. Public r15 remains unchanged.
  Final baseline3939cd5c21bb1896, gearf80d4c745a0d8b04, closing talents5af8c8760fecb771,
  browser0e5ebbc83707bb82 (812.9482600/UI812.95 at25/1337). Second gear's apparent808.30 selection
  score was NOT a proven upgrade:805.8471→805.9609 /805.9365→805.8669 on two100k ranges. Kept
  previous gear/pants237825. Do not promote the rejected237819 swap. Old75555/62789/90074/70251,
  audit41345 and exports74249/15372 are TERMINAL; no restart is needed.
- EXPLICIT-PROC ARMS COMPLETE on native62fe/databaseb11f/UI23e8: feedback934449847cdffa59 gives
  826.3643075 modeled DPS/400k disjoint iterations. Final all451-policy audit2d84c16042b49842
  keeps the exact incumbent,39/10/2, overpower-first/HS≥90/Slam+Hamstring/Battle. Portable export
  `reviewed-builds/warrior-arms-daa3c5e00130f01e.json` requires explicit provisional enchant opt-in;
  byte SHA5ffe8a36baa6a9c385077eab68f6854d12f897dd86f233e4b9e26c341bd91f13. Final baseline
  b0f05768fb4f2bbf, gear78d2322132465931, talents2e8d0b1e737f37b5, browser71ccfa1e96cd839f
  (827.6142760/UI827.61 at25/1337). Same six provisional historical items as conservative.
  Exact settings are preserved; no private paths/opaque request exported. Export replay succeeds.
  Compared with conservative, combat context/talents/APL match; gear/enchants differ. Captured UI
  iteration counts10/25 differ, but actual validation explicitly overrides both to100k per range.
  The2.5459% modeled difference is between optimized scenarios, not isolated/server-verified
  Crusader gain. No public promotion and not global BiS or all-class completion.
- Proc feedback session `feedback-sessions/
887efa7dc106c54ff793fe08ff56d5fd68f58390ac555922cea72c20ed821ec7/session.json` is CLOSED-LOOP-REVIEWED.
  Driver4272/exec39407, children4345/15547/33742, workers33754–33759, final audit49689/exec59266
  and export60379 are TERMINAL. Do not restart them. Its37 frozen inputs/algorithm98cfe6d6… stayed
  unchanged throughout review. Initial proc seed39cb… came from final conservative3939…, not
  older75a3…; initial browser proof29a8… was parity only, not the final recommendation.
- Proc initial talent report7fc3b4f9f6e1ec8a completed17,662 jobs /
  6,730,100 iterations. Its apparent213252… talent winner failed both100k holdouts:
  825.8630→825.3907 and825.8928→825.5721. Selection correctly retains303252… /39/10/2, not the
  screening winner printed in the completion log. No unvalidated talent change was promoted.
- Proc gear78d2322132465931 converged after two complete sweeps and PASSED both100k comparisons:
  825.5363→826.2631 /825.4975→826.3064 (mean826.2847237). It changes head enchant1506→2543,
  waist19044→20041 and pants237825→237819; same six provisional historical items and explicit
  Crusader policy. Unlike the rejected conservative-case pants swap, this complete proc-case
  gear change has independent evidence. Closing talents2e8d… completed23,607 real jobs/7,869,300
  iterations and retained the incumbent after both100k checks:826.3356→826.2446 /
  826.5522→826.6223. The screening utility swap303152… is NOT the selected build. Final rotation
  audit checks16 finalists;100k ranges2955053638400000/2955053638500000 retain the incumbent
  at826.6339/826.2004. Its17 new jobs/350k iterations reused452 cached jobs.
- NEXT: the reviewed three mana models and current-item recovery are now integrated locally as
  described above. Preserve all archived binaries/data/exports. Keep unknown
  item effects9394/9419/18760 and unverified D1 cadence gated. New data/models require
  affected-case revalidation; never rewrite old coverage or DB hashes. Then prepare the next
  spec's own blue control/talent/APL policy. Rogue still needs that implementation; the CLI is
  currently Warrior-only. Full23 named DPS cases plus Shockadin/other supported good hybrids
  remain in scope, one reviewed spec at a time. No active optimizer remains from these Arms jobs.
- Staged D1 mana evidence was hardened before integration: exact self-target, effect index,
  radius/class mask and static/dynamic coefficient guards apply to both proc and energize rows.
  New target/scaling regression failed before/pass after. Actual pinned client validation and
  original/fixed Go overlay regression passed; pre-integration receipt1bdb498b89c30906 superseded
  ce343…. That staging phase did not change the active engine. Latest integrated engine,
  162-test result and6.7GiB free space are recorded above; old proofs remain preserved.
- Set548's separate runtime gate is now reviewed for stationary damage: owned
  `infra/simulator/current-prebis-sets_test.go` ran via isolated Go overlay, all seven0–6-piece
  fixtures pass. Current checksummed spell14049 gives40 AP/40 RAP at2pc,14467 gives20 Stamina
  at6pc; actual registered callbacks apply each once and never below threshold. No generated
  override. Receipt `staged-current-prebis/set-runtime-3c01e421bac195c8/review.json` records source/
  table hashes, current candidate23298/23313 class masks/set links and reproduction command.
  Four-piece23048 is unmodeled Gouge cooldown utility, not simulated PvP behavior. Synthetic
  count fixtures prove dispatch/stat callbacks only, not combat or obtainable full gear. No
  items admitted, old stage files changed or active inputs modified. Historical faction/vendor
  access remains a separate admission gate. Full class/spec optimization is still incomplete.
- Historical faction review542b9d68eaddb39b cross-checks installed AtlasLoot Classic PvP faction
  groups/set membership with pinned vendor records:22879/23258 Horde,23298/23313 Alliance.
  This resolves historical source classification only; Forever vendor access remains provisional.
  Eventual imports must preserve current Rogue-only mask8, Horde set0/Alliance548 and raw
  RequiredPVPRank12/14 indices, not invent displayed rank12/14 or restore old set522. Current
  race masks alone must not make these four acquisition sources faction-neutral. No admission.
- CURRENT-ITEM STAGING EXPANDED: `current-prebis-92fe9f39504a09ce.json` now stages26 items and
  blocks9394/9419/18760 only. Silky Spider Cape10776 was resolved from checksummed current
  ItemEffect/ItemXItemEffect/SpellEffect/SpellAuraOptions rows:233785→1293819, passive equip,
  two-7% mechanic-duration modifiers for IDs7/11, no proc/on-use/conditions/dynamic scaling.
  Its10 Stamina/30 armor are normalized; utility stays explicitly unmodeled with a no-root/
  no-snare stationary-scenario disclosure. No damage bonus is fabricated and no active item is
  admitted. Other effects/HealthRegen remain blocked. Both new positive/negative regressions
  failed before/pass after;12 focused staging tests and157 total simulator tests pass.
  Actual CLI use and immutable replay pass. All25 earlier candidate/provenance objects are
  unchanged; independent Python compiler parity15709babc53c4dd5 proves all26 gameplay objects
  equal the existing upstream compiler. Source/table hashes are recorded. All37 live inputs
  and native62fe remain unchanged; old25-item stagef9bdd…/parity9c1… remain archived.
- Baseline sanity check: current70425 Windfury10612 is Effect65/aura42, payload10610, not a
  temporary weapon-enchant effect. Spell10614 describes a party/raid melee-attack aura, and
  maintained engine deliberately models it separately from consumable stones. No Classic-only
  stone exclusion was imposed. Selected2H Agility27837/effect2646 is a historical non-raid
  recipe: installed AtlasLoot Factions lists formula22392 at Friendly Timbermaw; the public
  Classic Timbermaw guide independently agrees. Forever vendor access is not thereby verified.

#### Earlier engine recovery and calculation chronology (status lines below are historical)

- CURRENT ENGINE RECOVERY: Arms gear search exposed Flame Wrath 11809's recursive self-retaliation
  in the inherited engine. It times out when self-inflicted damage occurs while its shield is active.
  Native fix is implemented through `item-effects-adapter.mjs`, shared by native/browser builders.
  Current native SHA62fe851bfa71ae05c499d7efbf8bf08719e06cb4293fb6295380c0c8fca6b05d.
  Regression fails on the old code in BOTH Classic/Forever rulesets, passes fixed; exact formerly
  stalled80-iteration job now completes at676.7153284 DPS, receipt `flame-wrath-fix-7bff86b5475f3f74.json`.
  Original native3dad4336014e… is archived under `optimization/native-engines/`; all old caches/
  reports are preserved. Old proofs are engine-specific, not relabelled as fresh62fe evidence.
  Local browser rebuild91336 / PID13308 COMPLETED: active UI23e8cccb25de7635d64ebdaa,22 pages,
  unchanged2,565-item database b11f7586…. Actual browser80-iteration proof7f16f25ae805173c matches
  native676.7153284 / UI676.72. Unaffected-case parity d65dcda28bd4dd69 shows exact25/1337
  DPS AND stdev equality for the blue Arms control and both completed Fury inputs against the
  archived3dad binary. These are smoke comparisons, not replacement100k optimization evidence.
  Corrected100k Arms feedback is NOW RUNNING in exec75555: driver62789. State `feedback-sessions/
cf635d56e3e8d5df1d5a94d207fca126922226303de84b599b01126ef373db54/session.json`,
  algorithm98cfe6d6f0ddfd07156cd6abbed4401c832092bfdf91e55f82dc09139eb03c08. Initial report
  `warrior-arms-9d9b58b1a93dcf34-talents.json` records18,429 jobs/6,799,800 iterations,
  241 seeds/451 policies and three stable rounds. Same blue gear:39/10/2 improves572.8192→628.1005
  and572.9685→627.9475 on two independent100k ranges. Initial gear searchf67713e0341799fc is now
  COMPLETE and converged in three passes:627.7810→800.6746 /627.8869→800.6847, two independent
  100k A/B ranges (mean800.6796804). It includes all148 eligible two-hand weapons,1,924 set
  proposals and full accessory/enchant coverage. Six historical provisional IDs remain22340,
  12927,12555,13098,13965,11815. Actual-gear talent report1619449f6450e801 is now COMPLETE:
  19,666 jobs/6,984,400 iterations, retained39/10/2 but independently validates Heroic Strike≥90
  instead of never queuing it:800.5882→805.8693 /800.8100→805.8507 on two100k ranges. Child70251
  and workers70263–70268 are terminal. Driver62789/exec75555 has advanced to another gear sweep:
  child90074, checkpointf80d4c745a0d8b04. It has found a tentative pants swap237825→237819; not
  converged or validated yet. This is NOT a completed case or published recommendation.
  Original corrected run81764/driver33085
  and state9fc95d… FAILED at enchant14 after the first slot/set/accessory sweeps; all children are
  terminal. Checkpointb153ec22943d7c59 is incomplete, not converged. Two compatible recipes7745 /
  13503 share effect241; the old exact-one-match guard wrongly rejected both on a two-hand weapon.
  `describePrebisGear` now checks every fitting non-raid recipe, requires identical status/payload,
  chooses a stable canonical key and retains all recipeKeys without double counting. Conflicting
  payload/status, raid-only recipes, wearer/hand restrictions and provisional policy still fail.
  Regression fails before/passes after; actual checkpoint tests all163 valid enchant cases,
  including aliases241/943/1897. New driver reused unchanged talent evidence and cached combat
  measurements, then passed the formerly failing enchant14 step. Do NOT restart or change frozen
  source/data/active UI inputs while alive. Public r15 remains unchanged; no commit/push/deploy.
- ARMS PROVISIONAL-PROC PATH implemented without changing the live37 inputs: `proc-scenario`
  CLI now supports Fury dual wield and Arms two-hand/empty-off-hand, with pure tested helper
  `prebis-proc-scenario.mjs`. It validates actual Crusader compatibility and explicit model policy,
  preserves other settings and removes inherited convergence/rotation links before recapturing.
  Five new tests cover weapon styles, invalid profiles/models/policies and CLI arguments.
  Actual settings checks pass against the real Arms/Fury gear. Real Arms browser capture is
  `baselines/warrior-arms-crusader-75a3bc4ec5ca3f1b.json`, based on initial gearf129… not a final
  reviewed case. Actual native/browser25/1337 proofb2e89afd22e22fd3 matches818.4139441 /818.41
  with explicit provisional opt-in; this is parity only, NOT an optimization gain. No expensive
  second feedback run has started. The conservative APL has now changed, so this proc seed MUST
  be recaptured from the final conservative input after its full rotation audit, before proc feedback.
- D1 MANA DISPATCH FIX STAGED ONLY: `pnpm simulator:prebis:stage-dungeon-mana` verifies current
  snapshot/raw SpellEffect/SpellAuraOptions hashes and the exact existing manual handler source.
  Three five-piece models (Magister181, Devout182, Beaststalker186) have client-supported5%/
  200-mana payloads. Their handlers were skipped by the generated ordinary-set adapter. New
  isolated Go overlay adds only those five-piece callbacks, without changing active engine files.
  Original-source regression fails in all six5/6-piece cases; corrected overlay passes actual
  mana recovery, trigger/miss filtering, four-piece negative controls, and no duplicate flat/MP5
  bonuses. Other unsupported proc/utility thresholds remain gated. Adjacent core set tests pass.
  Current immutable receipt: `staged-dungeon-mana/ce34347abbcc95bb/review.json`; actual completed
  replay verifies source/overlay/log hashes and reuses it without rerunning or replacing timings.
  All37 frozen inputs, original dispatcher638b… and active native62fe/database/UI remain unchanged.
  This is NOT active integration or server proc verification. After the frozen experiment finishes,
  add the overlay to native/browser preparation and fingerprints, verify parity, and rerun affected
  cases before publication. Valor/Shadowcraft/Wildheart/Elements/Lightforge cadence remains
  provisional; client ProcChance100 is a scripted placeholder, not guaranteed every-hit recovery.
- PREVIOUS-ENGINE STATE: both Alliance/Human Fury cases completed feedback, actual browser parity,
  current-build acquisition revalidation and the final ALL-225-policy rotation audit at 100k.
  Conservative: 853.3331938 modeled DPS / 400k disjoint iterations; current recipe-70425 receipt
  `feedback-review-50e934c2c10f5eb1.json`, audit `fury-rotation-audit-a7e4a531dc15fd21.json`, export
  `reviewed-builds/warrior-fury-b2714b7d3ca2e43f.json`. Baseline/gear/talents/browser stay
  28535d990c29a63b / 9e8c9da8747ea24b / f4e4d1f7c13d856d / 148f3d16d4b92fa0.
  Explicit provisional procs: 872.5247783 DPS / 400k; current receipt
  `feedback-review-4f4cc4d9d75fcca4.json`, audit `fury-rotation-audit-d692820be35ccfa8.json`, export
  `reviewed-builds/warrior-fury-a2ca6ee18e6c7ee6.json`. Baseline/gear/talents/browser are
  feae9b0c38fccffa / bf4fc67991a11b6e / e117c60b0f3245f3 / 979bdd158899fc55. Both keep exact
  19/31/1 `30305213002-15053015102110501-1` and incumbent rotation. Provisional proc assumptions
  are NOT server-verified; explicit opt-in remains required. Public r15 remains editorial.
- All former Fury processes are TERMINAL: exec 48315 / driver 88417 / child 25641 / workers
  25653–25658; audit 90009 / PID 42624 / workers 42669/42670/42672/42677/42678/42679; audit 28978. Do not restart them. Final proc talent pass: 12,214 jobs / 4,027,900 iterations;
  challenger did not establish a gain on both independent ranges (872.6318→872.6726 /
  872.3067→872.8465). Browser 25/1337 matches native 883.5919445 / UI 883.59. Final proc audit:
  243 new jobs / 585k iterations; conservative audit reuses all 243 matching measurements.
- ACTIVE ACQUISITION AUDIT IS NOW 70425, after the old driver finished. Archived 70291 exactly
  as `artifacts/forever-simulator/craft-acquisition-70291.json`; active `craft-acquisition.json`
  matches staged `craft-acquisition-70425.json`. Only three unused waist candidates are removed,
  no new candidate admitted. Both real final cases pass current eligibility/coverage. Coverage
  permits a previously tested superset when acquisition tightens; unknown/wrong-slot/duplicate
  IDs, newly admitted untested items and an ineligible selected item still fail. Archived search
  records are unchanged, not edited to pretend a different candidate count was measured.
- ARMS CONTROL CAPTURED AND VERIFIED, not optimized: `baselines/warrior-arms-alliance-blue.json`,
  eight blue Premier Mortarplate pieces + blue fillers + current-client Arcanite Reaper 12784,
  empty off-hand, Human/Alliance, Engineering + Blacksmithing, Battle Stance, zero starting
  rage/manual stats, no free Tier 1/item swap/Recklessness, Dense Sharpening Stone, explicit WF.
  Capture at 10/1337: UI 554.60. Actual 25/1337 parity receipt
  `browser-verification-f56e02bebbb2949c.json`: native 570.277235 / UI 570.28. This is context/
  parity evidence, NOT a long-run performance or recommendation claim. Native stays 3dad4336014e…,
  local UI stays 7eb089633ade2f02ad73c3f9.
- ARMS INITIAL TALENT STAGE COMPLETED in 89228; Node79099 and workers79237/79240/79241/79244/
  79245/79246 are TERMINAL. Report `warrior-arms-379987245a573450-talents.json`: 16,550 new jobs /
  5,409,300 iterations, 241 legal seeds, 451 policies screened on 0/2 Slam controls, 26 retained,
  three stable refinement rounds. Independently validated 39/10/2
  `30325213132515201-0505-2`, overpower-first / no Heroic Strike / Slam + Hamstring / Battle.
  On the SAME blue gear: 573.1161→627.8911 and 572.9106→627.7543, two independent 100k A/B ranges.
  This is talent-stage evidence, NOT final pre-BiS or a published recommendation.
- ARMS FEEDBACK DRIVER FAILED in exec77278: Node96012, gear child96252, workers
  96264/96265/96266/96267/96268/96269. State `feedback-sessions/
d239a781e6a2a592563368c8bc13abf98c665448a143ba980fac217e275e27ab/session.json`;
  algorithm43a0e1426d172e7c1324c84e92bb86827c6cacea22a4e1a164728e128b840ea2. First gear fingerprint
  8a21be07922c371b; native starts628.88 DPS at2k/1337, eligible pools183/41/166/82/240/119/228/
  204/215/245/64/64/41/41/148/0/46, including all148 eligible two-hand weapons and empty off-hand.
  Requested validation100k. All those processes are TERMINAL, lock removed.147/148 two-hand
  weapon trials completed; only Flame Wrath11809 stalled. Checkpoint8a21be… is incomplete, NOT
  accepted gear. Old35-source frozen hash was verified before failure. New fixed native binary
  and adapter fingerprints require a fresh session; never claim the failed run converged.
  Earlier manual77335/PID71475 and workers71487–71492 were deliberately stopped before completion
  to add the fixed-control baseline hash; cached measurements were retained, not discarded.
- Arms-specific policy is implemented, not a renamed Fury APL: MS remains required; five
  ability-priority families, HS thresholds/disabled queue, Slam/Hamstring fillers and three
  stance policies. Fixed control + imported 39/10/2 + legal neighbors compete. Spearing Strike
  is removed when unlearned; absent Bloodthrill conditions explicitly become false even under
  negation. Actual engine ComputeStats + 5-iteration execution probe d5e24d907eaca962 covers all
  1,804 policy/control cases with zero warnings and a positive unavailable-spell negative control.
  Probe replay reuses all1,768 distinct old-engine execution measurements, no new jobs. Its
  native3dad identity is historical now; the engine recovery above takes precedence.
- Completed talent evidence is now immutable and reusable: output identity includes native binary,
  algorithm and baseline; algorithm also fingerprints the complete fixed-control baseline used
  for seeds/screening. Exact completed replay verifies its links, legal finalist/APL evidence,
  seed policy and requested precision before returning the original artifact without rewriting
  measured counters. Actual driver replay now passes without new talent simulations or file
  replacement: original serialized report SHA81d44149a94dcc517639307ae2521da1920ca79ce652995c89e4a9fd8d6730b8
  and counters16,550/5,409,300 stay unchanged.
- Feedback, audit and export adapters now accept the reviewed Arms policy while retaining
  Fury-only compatibility entry points. Final Arms policies are normalized/deduplicated on
  selected talents before full coverage checks. These paths pass regression tests but still
  need the actual Arms gear→talent feedback, browser proof, final audit and export. Both real Fury
  exports replay unchanged as b2714b7d3ca2e43f / a2ca6ee18e6c7ee6 after this adaptation.
- CURRENT-ITEM RECOVERY: read-only `catalog-current-gaps-0902bab96c450e2f.json` records29
  current-stat records with reviewed historical non-raid acquisition missing from the simulator.
  Classic fallback protection is correct; a current-value admission path is needed.26 are
  effect-free,3 need effect review;18760 has unsupported HealthRegen. All29 ItemSparse metadata
  rows are present. Four legacy leather PvP items have class mask8 and must not enter Warrior
  pools;9419 is now main-hand-only. Snapshot effectIds are ItemEffect ROW IDs, not spell IDs.
  `pnpm simulator:prebis:stage-current` now validates current snapshot/raw metadata/rating hashes
  and all839 pinned historical source objects, then stages25 normalized candidates separately.
  Report `staged-current-prebis/current-prebis-f9bdd2cd8fee8a90.json` is NOT active admission.
  All25 gameplay objects exactly match the existing engine Python compiler; parity receipt
  `compiler-parity-9c1bb17eef23b3e7.json` applies to identical item objects in predecessor079198….
  Three linked-effect items and18760 HealthRegen remain explicitly blocked. Current set runtime,
  vendor faction/access and provisional acquisition still require review. Immutable CLI replay
  initially exposed an undefined-vs-omitted optional source field; a red/green regression fixes
  serialization at the source. Both actual CLI runs now preserve the same immutable artifact.
  Staging left all37 original live algorithm/input hashes unchanged; the later enchant fix created
  the new driver identity above only after that run had terminated. Read `docs/simulator-catalog-coverage.md` before
  final admission/revalidation. No active data/binary/public release was changed.
- Verification:155 Node tests, staged mana-proc red/green and adjacent core set regressions pass.
  Classic/Forever self-retaliation Go regressions also passed previously. Existing
  real Arms browser/native parity and Fury revalidation refer to the archived3dad engine.
  Current scoped lint/format/diff checks,22-page local build and actual fixed browser/native
  reproduction pass. Live public engine JSON independently
  confirms 2,565 items, all14 equipment types, HoJ and Blackhand's Breadth present. Four imported
  MythicSim references revalidate against cached source snapshots; no external simulation jobs
  or bulk crawl. No new Git commit/push/deploy. Goal remains
  all supported classes/good specs (including wanted hybrids), one optimized spec at a time;
  only Fury's two current Alliance scenarios are reviewed. Other specs remain incomplete.

#### Earlier calculation chronology (status lines below are historical)

- October 17 continuation: the completed conservative case has an actual portable reviewed
  export, `optimization/reviewed-builds/warrior-fury-523f78e38367229c.json` (853.3332 DPS / 400k).
  `pnpm simulator:prebis:export --feedback-review=<final-review.json>
--rotation-review=<final-audit.json>` reconstructs and checks feedback/browser links, current
  item/enchant coverage, tree/database/native identities, acquisition and consumable legality,
  final all-policy audit and 100k precision before writing a content-addressed local bundle.
  Exact settings, evidence hashes and provisional warnings are retained; local paths and opaque
  requests are not exported. Existing identical exports are verified, not overwritten. This is
  NOT wired to public defaults yet. Native/UI inputs of active 48315 were left unchanged.
  Proc gear bf4fc67991a11b6e has now CONVERGED and independently validated 871.96→872.58 modeled
  DPS. Only neck 22150→15411 changed; weapons, trinkets and double Crusader held. Exact 100k
  ranges: 872.0865→872.6339 / 871.8287→872.5267. Two full passes, 37,660 jobs / 4,137,100
  iterations. Feedback baseline feae9b0c38fccffa is now undergoing talent/APL feedback.
  Driver 88417 / talent child 25641 / workers 25653–25658 remain live in 48315; old gear child
  2372 and workers are terminal. Full suite now 116 passing, including export tampering,
  acquisition staging, incomplete precision, provenance, explicit proc
  opt-in, legal duplicate rings and CLI argument regressions. No other spec started or promoted.
- Fresh build-70425 recipe audit is STAGED, not active: `artifacts/forever-simulator/
craft-acquisition-70425.json`, 1,153 input-reviewed / 45 raid-dependent / 3 unresolved crafts.
  Separate full extraction completed in exec 58692 (terminal, validation passed), using definitions
  996e53f029c0213b223aecb94d754f6b4b9efb49; snapshot under
  `artifacts/local-catalog/70425-simulator-audit/catalog-snapshots/wow_classic_beta/70425/enUS/
8464d7adbd3e6aba33b8c8ccefe6085c7b5c2ac0672685cbfb7e8671b01fffb8/catalog-snapshot-manifest.v4`.
  Build-info and hotfix hashes stayed unchanged during capture. 2,228 normalized recipes / 7,419
  inputs. All 1,198 resolved catalog recipe input lists match 70291, including every selected
  Fury craft. Utility items 260828/260829/260830 become unresolved because ingredient IDs
  238787/238788/238786 lack ItemSparse records (base Item IDs are present). Raw recipe/reagent
  rows still exist, so do NOT claim the
  recipes were removed. Nothing selected by either Fury case is affected. Reconcile staged
  eligibility after active driver finishes; don't mutate its hashed audit mid-run.
  The general normalizer emits zero item-stat/effect records on this snapshot. Use it for this
  recipe audit only; the separate checksummed 70425 mechanics import remains the combat-stat
  authority. No catalog/database publication occurred. Acquisition CLI now supports explicit
  `--snapshot` plus immutable staged `--output`, rejecting replacement of the active audit.
  Real staged-output replay passes; all 34 active driver algorithm/input hashes still match
  its original identity b397c0d7a73b34eba853d8eaad331d1d8472dbbf1daa190d4617512e02e37812.
- CURRENT VERIFIED CASE: Alliance/Human conservative weapon enchants COMPLETED at 100k per range.
  Receipt `optimization/feedback-review-d3ac43f7e5c96d5f.json`: 853.3331938 modeled DPS / 400k
  genuinely disjoint iterations, no known raid-recipe weapon consumes. Final input
  `baselines/warrior-fury-feedback-28535d990c29a63b.json`, gear 9e8c9da8747ea24b, talents
  f4e4d1f7c13d856d, browser 148f3d16d4b92fa0 (native 851.1465489 / UI 851.15 at 25/1337).
  19/31/1 `30305213002-15053015102110501-1`, HS≥30 / no explicit BR / original25 / early Rend.
  Equipment and talents held. Final ALL-225-policy rotation audit at 100k also COMPLETED:
  `fury-rotation-audit-145022ad501d527f.json`, exact incumbent retained, 16 finalists; 2 NEW
  jobs / 200k iterations, 241 matching selections reused. Driver 88372/d9bdcc58… and audit 9602
  are terminal. Previous 20k receipt 2fe6c2e3b56ba5f1 (853.3179 / 80k) remains valid lower-
  precision evidence, not the retired legacy protocol. Neither case is covered by the warning
  below. No public promotion or new deployment; no other spec started.
- ACTIVE PROVISIONAL-ENCHANT CASE: real browser capture with explicit checkbox opt-in completed:
  `baselines/warrior-fury-crusader-2e5a473c71467945.json`. Allows only effects 36/803/1898/1900,
  starts double Crusader; full search may replace it. Browser/native parity passed at 25/1337,
  886.1543805 / UI 886.15, proof `browser-verification-97e797f28495cb4c.json`. This is parity,
  NOT a validated performance estimate or a server-verified proc cadence.
  Actual 100k feedback driver RUNNING in exec session 48315: pnpm PID 88196, driver 88417.
  Initial talent child 88430 and gear child 2372 with their workers are terminal. Current talent
  child 25641 with workers 25653–25658 uses actual-gear baseline feae9b0c38fccffa. State:
  `optimization/feedback-sessions/a884c2c5f9581b9e2d1d8889b3ecb22477bffb43f22cf6d10aabdf02fc5c34c4/session.json`.
  Initial talent pass COMPLETED: eb1c969168e41f5c, 12,157 jobs / 4,009,200 iterations. Tested
  201 legal seeds, 225 rage/stance/Rend policies, 14 retained. Independent 100k checks found
  no proven gain (871.8634→871.8620 / 871.9829→871.9081), so exact incumbent 19/31/1 is retained.
  Gear/enchant search subsequently converged/validated as described above. Final actual-gear
  talent/APL and browser/linked reviews remain pending. Re-poll 48315/process before restart,
  don't modify hashed
  driver/policy code while live. Finish feedback and final 100k all-policy audit before claiming
  Fury's strongest modeled case or advancing to another spec. Provisional status stays visible.
- Validation orchestration now runs independent A/B ranges in ONE worker-pool batch rather than
  sequential batches. `validation-runner.mjs` is used by talent, gear and rotation checks. Job
  field order/cache identities and identical A/B deduplication are preserved. Actual native
  serial-versus-parallel verification passes for all four trials (25 each, DPS/stdev/maxSeed exact).
  Native binary still 3dad4336014e…; no combat code changes. Requested precision is checked on
  talent evidence as well as gear; actual completed 400k session replay passes without any
  recomputation under the stronger guard. Worker watchdog scales to 15 min at 100k (30 min cap),
  avoiding a fixed low-work timeout for higher counts. Full Node suite 108 passing, scoped lint/
  formatting/native checks pass. `--validation-iterations=20000` remains default, 100000 supported.
- Client proc-payload audit completed without changing the live search or combat engine:
  `docs/simulator-proc-enchant-evidence.md`. Checksummed 70425 rows corroborate Crusader's
  100 Strength/15 seconds, Fiery Weapon's 40 damage and Lifestealing's 30-point leech payload.
  They do NOT verify inherited proc cadence. Crusader also links passive 458112 with a
  conditional trigger; its `ProcChance: 100` must not be read as an unconditional swing chance.
  Separate PPM tables were not captured, and some source rows are encrypted. All four proc
  effects remain provisional/opt-in. Session 48315 remains healthy and has advanced to
  actual-gear talent feedback after the completed gear pass described above.
- VALIDATION CORRECTION: older numerical observations below remain archived, but their
  fresh/independent-holdout conclusions are SUPERSEDED until the disjoint-range rerun. Actual
  `sim/core/sim.go` reseeds each iteration with starting seed + iteration. Old talent validation
  61357/20k overlaps finalist selection 77191/10k by 4,166 seeds. The four old 20k final ranges
  had only 71,826 distinct seed values, not 80k independent draws. See actual forensic record
  `optimization/rng-seed-review-20261016.json`. New gates reject the real older talent and linked
  final reports. No old optimizer result was ever published. This is not a game-data/engine change.
- New shared `simulation-seeds.mjs` derives reproducible experiment seed arenas and separate
  100k ranges per stage/check, all exactly representable by JS and Go int64. Both individual
  validation and combined final review audit ranges, not merely distinct starts. Talent/gear
  source fingerprints include this policy; driver identity includes it too. Old selection trials
  remain reusable. Old gear a500ea… must receive the fresh-policy recheck before final review.
  Native large-seed probe repeated exactly at seed 4294967395200000; actual maxSeed returned
  4294967395200023 over 25 iterations. Binary is still 3dad4336014e…; no Go engine changes.
- The earlier catalog delivery deployed the all-slot catalog and imported four reference seeds.
  This continuation is actual local optimization work, not a new production deployment. Goal is
  still every supported class/good spec, one spec completed at a time; no all-spec completion claim.
- Captured a new actual browser request in `artifacts/forever-simulator/optimization/baselines/warrior-fury-blue.json`:
  eight blue Premier Mortarplate pieces + fixed blue fillers, level 60 Orc, Engineering +
  Blacksmithing, zero starting rage, no free Tier 1/item swap/Recklessness; explicit Windfury Totem.
  The older capture had duplicate Engineering and 50 starting rage. Native/browser match exactly
  at ten iterations/1337: 626.597366 versus displayed 626.60 DPS.
- Completed first talent pass: 200 legal seeds, 30 rage policies, 1,913 simulations / 996,400
  iterations. Evidence `optimization/warrior-fury-2606b035ebe91d21-talents.json`, validated true.
  19/32/0 `30305213002-25053005102210501`, HS≥30 / Berserker Rage≤10. Independent seeds 29531/61357,
  20k iterations each: 626.24→637.65 / 626.47→636.98. This is not yet final gear or a promoted preset.
- Original gear run `warrior-fury-b748a888f1ac32dd-gear.json` finished, but final skeptical review
  REJECTED it: two one-time Blackhand's Breadth rewards, Naxx shoulder enchant and AQ glove recipe.
  See its adjacent `-rejection.json`; original numerical output is retained, not promotable.
  `equipment-ownership.mjs` shares conservative quest-only ownership rules with generated browser
  inspection metadata; independent verified drop/craft/vendor paths remain usable.
  `enchant-acquisition.mjs` blocks historical raid rewards/recipe unlocks by spell as well as
  effect (2564 glove is AQ, 2564 weapon is not). Regression tests cover both cases. Feedback
  importer actually rejects the original report. This has NOT changed live r15.
- Corrected gear search COMPLETED (session 8677, Node 55142 terminal):
  `optimization/warrior-fury-e471584151ba6667-gear.json`, converged/accepted true. One full sweep
  on the repaired legal seed: 13,784 measured jobs / 1,642,120 iterations before final validation.
  Ordered weapon pairs 10,432 after quest ownership fix. Final seeds 99173/48211 at 20k each:
  637.3989→854.0746 and 637.6389→853.9925. One Blackhand + HoJ; seven provisional Classic IDs.
  Not yet final talents/gear feedback or a public recommendation. Production remains r15.
- Feedback importer revalidated that result and wrote immutable
  `optimization/baselines/warrior-fury-feedback-f3f20ed90ebc65b9.json`. Next expanded talent run
  must use this actual equipment. `furyRotationCandidates` now takes the fixed original APL
  template separately from exact incumbent, preventing accumulating Berserker Rage actions or
  losing disabled Heroic Strike/stance actions in later feedback runs. Regression coverage added.
- Local UI rebuild session 24301 completed: release `2017b599cb49d5e7280f202e` (NOT production).
  Browser catalog smoke passed Warrior/Warlock/Feral: equip, provenance, saved reload, real combat;
  duplicate Blackhand rejected and duplicate non-unique Tarnished Elven Rings simulated.
  `verify-simulator-baseline.mjs` on the actual gear confirms old controlled request = new browser
  request natively (848.7672714203109 at 25 iterations/1337), browser 848.77. Receipt
  `optimization/browser-verification-60bfa11307da90f2.json`. Latest local rebuild then completed as
  `7eb089633ade2f02ad73c3f9` (session 3957) with user-error prefix and catalog-only quest fallback.
  Repeated three-profile browser smoke/ownership and native/browser parity passed on that release;
  receipt `optimization/browser-verification-870bc72d76f37351.json`. Full 78 Node tests, scoped
  lint, upstream TypeScript, Go focused checks and full UI build pass. No production deployment.
- Expanded talent feedback COMPLETED, Node 78928/session 32516 terminal. Evidence
  `optimization/warrior-fury-d1784fd0d09f51f6-talents.json`, validated true: 225 rotation policies,
  14 retained × 200 seed builds, three stable rounds, 12,887 measured jobs / 3,842,100 iterations.
  Same 19/32/0 `30305213002-25053005102210501`, HS≥30 / Berserker Rage≤10 / original25 / early Rend.
  Independent 20k seeds 29531/61357: 853.9308→857.5562 and 853.5931→857.4550 DPS. This is the
  actual legal equipment feedback pass, not a fresh fixed-blue result or public preset.
- Gear RECHECK completed, Node 3874/session 40918 terminal:
  `optimization/warrior-fury-9f34b51a0b9b8986-gear.json`, converged true, accepted false (kept exact
  baseline, not a failure). Seeds 99173/48211 at 20k each: final gear 858.0900 / 857.5812.
  Derived final input `baselines/warrior-fury-feedback-81f21f085638d54f.json`.
- Final talent check completed, session 5664 terminal:
  `optimization/warrior-fury-ca23ffa4f8c6c60c-talents.json`, three stable rounds, validated false,
  selection `kept-incumbent-no-proven-gain`. All matching measurements were legitimately reused
  (0 NEW jobs, not 0 total evidence). Two independent 20k checks match exact incumbent. Final
  browser proof `browser-verification-59dc1b99d8312ad5.json`: native 856.2245267, browser 856.22,
  at 25/1337. This closes the Horde talent↔gear loop for the ORIGINAL consumable assumptions.
- New `review-simulator-feedback.mjs` actually audits linked final baseline/gear/talents/browser,
  current legality/craft/enchants/trees and native binary. Receipt
  `optimization/feedback-review-c9614722026bc3aa.json` (latest, includes explicit enchant policy;
  earlier scenario receipts `398abf721a2acbb5` / `2c3650189e2cf6bb`), closed-loop verified, 857.6705739 DPS pooled
  across 80k iterations/four distinct validation seeds. It is NOT public approval or global BiS.
  Legacy talent v1 request hashes use JSON-string SHA; gear/browser hashes use raw base64 text.
  New output explicitly labels talent hash encoding; audit checks the correct contract, not OR.
  Maiden's Circle source was incorrectly labelled PvP by an optimizer override; shared
  `prebisSources` now uses its pinned historical pre-raid evidence, without replacing client stats.
  Shared `prebisContext` rejects mismatched race/faction and duplicate/unknown professions.
- Current numeric branch is Horde Orc / Engineering + Blacksmithing with PvP rank/reputation
  access. Do not publish Horde-only Defiler pieces as an Alliance default; verify the
  Alliance/Human branch before claiming Fury complete for the guild, then continue spec-by-spec.
- Verified faction mappings: Defiler 20212/20204/20208 → Highlander 20057/20041/20048, identical
  client stats and 2/3-piece bonus spells (sets 487/467). Premier High Warlord's Blade 272452 is
  NOT Horde-only: current exported tooltip explicitly says Grand Marshal / High Warlord, no race
  restriction. Don't infer availability from names. Alliance search seed is
  `optimization/warrior-fury-alliance-legal-seed-v1.json`, explicitly unmeasured, not a recommendation.
- Alliance/Human blue baseline captured independently:
  `baselines/warrior-fury-alliance-blue.json`, faction-correct Theramore ring 271908.
  Browser/native proof `browser-verification-86efb42c4861a514.json` (614.7713452 / 614.77 at 25/1337).
  `capture-simulator-baseline.mjs --faction=alliance` now supports this; existing blue baselines
  cannot be overwritten without explicit `--replace`, which invalidates dependent evidence.
- Consumable audit found the inherited Elemental Sharpening Stone recipe 18264 is MC boss loot;
  Brilliant oils are Zandalar recipes (20756/20757). Asked one non-blocking policy question:
  all gear/enchants/consumes non-raid (recommended) versus gear-only, not answered yet. Proceeding
  conservatively with a separate non-raid-weapon-consume case; never rewrite old inputs/metrics.
  Pure `prebis-consumes.mjs` + `capture-simulator-consume-scenario.mjs` replace known raid-recipe
  weapon consumes with compatible Dense stones/ordinary oils and capture the real new request.
  Client proto is Staff=8, Sword=9. First draft `nonraid-consumes-0978…` was rejected BEFORE any
  optimization because Mirah's Song got a weightstone; adjacent rejection receipt preserves this.
  Correct Alliance input is `baselines/warrior-fury-nonraid-consumes-f612c5c52511b092.json`, both
  Dense Sharpening Stones. Browser/native proof `browser-verification-bc8722fddfeffeba.json`
  (609.6260037 / 609.63 at 25/1337). These consume guards don't prove all seasonal/release unlocks.
- Alliance non-raid-consume talent pass COMPLETED, Node 12931/session 14098 terminal:
  `optimization/warrior-fury-c23fef868b173150-talents.json`, validated true, 12,086 actual jobs /
  3,667,000 iterations. 19/32/0 `30305213002-15053015102210501`, HS≥45 / BR≤30 / early Rend.
  Independent 20k seeds 29531/61357: 606.0062→620.0920 and 606.3378→620.0669. One utility point
  moves Booming Voice→Blood Craze; check utility equivalence before a public presentation, don't
  claim that a negligible score difference establishes superior DPS from a utility talent.
- Alliance non-raid-consume first GEAR SEARCH COMPLETED: Node 18090/session 9609 terminal.
  Baseline `baselines/warrior-fury-nonraid-consumes-f612c5c52511b092.json`, talent evidence c23fef…,
  `--seed-gear=artifacts/forever-simulator/optimization/warrior-fury-alliance-legal-seed-v1.json`.
  Evidence `optimization/warrior-fury-6723713dc3da793f-gear.json`, accepted/converged true:
  27,109 measured jobs / 3,111,000 iterations before final checks, two stable passes. Independent
  20k seeds 99173/48211: 620.2086→845.1731 / 620.3109→845.3109. Felstriker 12590 main hand,
  Distracting Dagger 18392 off hand, Adaptive Combat Assistant 272437 + Blackhand 13965;
  six provisional Classic IDs. Feedback input `baselines/warrior-fury-feedback-09597f415d90c29a.json`.
  Browser proof `browser-verification-eefb6a658fdd9e33.json`: native 850.2407095 / displayed
  850.24 at 25/1337. This was the older flat-enchant/restricted-candidate policy, not full coverage.
- Alliance actual-gear talent feedback COMPLETED, session 1248 terminal:
  `warrior-fury-a28467480cd0953c-talents.json`, 12,198 jobs / 3,697,100 iterations, validated true.
  19/31/1 `30305213002-15053015102110501-1`: the Protection point is Improved Bloodrage.
  HS≥30 / no explicit Berserker Rage / original25 / early Rend; automatic cooldowns remain active.
  Independent 20k seeds 29531/61357: 844.8721→846.8139 / 845.3099→847.1648.
- Expanded Alliance gear RECHECK COMPLETED: Node 27464/session 31546 terminal.
  Input feedback 09597f… / talent review a2846748…; checkpoint
  `optimization/warrior-fury-a500ea08364f7684-gear.json.checkpoint.json`. Never restart solely from
  a stale checkpoint; re-poll the session/process first. Ordered weapon sweep had 26,753 legal
  proposals after removing the item-level floor. Three passes converged, last pass no accepted
  changes; 75,178 actual jobs / 7,515,860 iterations including validation. Two independent 20k
  seeds 99173/48211: 846.5669→853.6402 / 847.1804→853.7840; mean 846.8737→853.7121, accepted true.
  Item/enchant pools passed the earlier coverage check, including on actual feedback 679eb1….
  Its legacy seed protocol is now rejected by current coverage/admission; fresh recheck required.
  First pass completed at 854.84 exploratory DPS (not independent validation);
  trinkets switch to Blackhand 13965 + HoJ 11815, head/legs to Rapidity 2543, gloves to haste 931,
  boots to Forceful kit 8491. Second pass changed neck 15411→22150; third held the exact loadout.
  Equipment is independently validated, but actual-gear talent feedback is still needed before
  final review or public promotion. Single-target selection and validation means differ normally.
  Kit 8491 applies item 252488, craft 1254965 (build-70291 normalized recipe); inputs 9206×2,
  11176×2, 15564×1, Fel Hide 248824×1 and Pristine Scale 249429×1. No known historical raid mat,
  but new reagent/pattern source still unverified; do not claim launch-day availability.
- Coverage audit removed the item-level-45 floor and accessory EP cutoff. Every eligible admitted
  item now competes, EP controls ordering only; joint set proposals enumerate every subset of
  the per-slot set candidates instead of greedy fixed piece counts. Reviewed deterministic
  scripted enchants (weapon damage, Counterweight, glove haste, Arcanum of Rapidity) also compete.
  The MC Biznicks scope recipe stays blocked. Older flat-only/restricted runs remain valid
  conditional references, not unrestricted maximums. Current recheck uses this expanded policy.
- Explicit provisional-enchant policy supports only reviewed effects 36/803/1898/1900 and retains
  their provisional status. `capture-simulator-proc-scenario.mjs` uses the real browser opt-in;
  no public guard bypass. Earlier Crusader input `baselines/warrior-fury-crusader-5cadbd19fe285f41.json`
  permits only 1900; native/browser proof `browser-verification-946c948651b13594.json` agrees at
  878.5197178 / 878.52. Capture a fresh all-four-policy scenario before a full proc-aware search.
- Crusader sensitivity experiment COMPLETED, session 59882 terminal:
  `optimization/proc-sensitivity-97243a5d4e1b780f.json`. Same final Horde gear/talents/APL/consumes,
  20k each at seeds 104729/130363: static 858.04 / 857.64, MH Crusader 873.72 / 873.60,
  OH 863.23 / 863.47, double 879.33 / 879.84. All three improve independently under the maintained
  PROVISIONAL 1-PPM/100-Strength/15-sec model. This is native-only sensitivity, not verified game
  proc behavior or a completed proc-aware gear/talent optimization. No UI opt-in guard weakened.
  Therefore static-only results must not be called unrestricted maximum; do the explicit
  provisional-enchant feedback branch before claiming the strongest modeled recommendation.
- Closed-loop gates now require four distinct 20k validation seeds, current legal gear/crafts/
  enchants, stable no-gain talent feedback, linked browser/native proof, level 60 vs one level-63
  target for exactly 300 seconds/Forever rules, no free Tier 1/item swap/manual bonus stats/starting
  rage, matching race/faction and two distinct professions. Dense-stone compatibility is checked
  on final weapons; if a swap changes blade↔blunt, normalize and recapture before final review.
  Added package commands `simulator:prebis:scenario` / `simulator:prebis:review`.
  Latest full Node suite: 108 passing; scoped lint and actual browser/native checks pass. No new
  engine or web deployment, commit or push. UI build remains local 7eb089… / live r15 unchanged.
- Added the actual resumable `pnpm simulator:prebis:feedback` driver, Fury-only for now:
  `infra/simulator/feedback-workflow.mjs`, `prebis-search-coverage.mjs` and
  `scripts/run-simulator-feedback.mjs`. It sequences the existing real calculation/capture/audit
  commands, hashes inputs/outputs/algorithm/native binary, atomically saves completed steps,
  serializes drivers with a generated live-PID lock and terminates its active child on interrupt.
  Converged gear + no-gain talents + current full item/enchant coverage + browser parity + linked
  four-seed audit are all required. Older Horde flat/restricted report actually fails the new
  coverage check and would be reoptimized. A feedback-cycle limit remains explicitly incomplete.
  Actual OLD driver session 53634/0b240446… was deliberately interrupted for the seed-range fix;
  its driver 56232, child 56246 and all six workers exited, and its generated lock was removed.
  Corrected 20k driver COMPLETED in exec session 46850, state a8bbdd0e… closed-loop-reviewed:
  pnpm 67364, driver 67585, talent child 67599 and workers 67611–67616 are terminal.
  It adopted a500ea… only as a legal search input
  on baseline 09597f… and reused immutable
  feedback `baselines/warrior-fury-feedback-679eb1eb8747c85c.json`. Driver session state:
  `optimization/feedback-sessions/a8bbdd0e7ad80c5551ede8784ea7ba74172145a76e6131bdca8ee7cf1b9084b3/session.json`;
  its generated lock was removed. 201 legal seeds, 225 rotation policies, 14 retained. Talent
  pass e248c29462575d06 retained incumbent after fresh holdouts. Gear 21f2c3… rechecked full pool
  with cached selection trials and fresh validation, keeping incumbent. Final talent 7213d5…
  also retained incumbent on fresh ranges. Real browser parity and linked audit both passed.
  Current provisional-enchant driver 48315 above, not 46850/88372, owns the generated active lock.
  Source/code edits change session identity; avoid altering driver/policy code while this run is
  active. Documentation updates do not affect identity. No other spec has started.
  Earlier interrupted checkpoint is 805de0fc…; don't resume it.
- Final full-policy rotation audit implemented AND executed at 20k:
  `pnpm simulator:prebis:audit-rotation --baseline=<final> --feedback-review=<fresh final review>`.
  It tests every generated Fury policy on the actual chosen talents, not just on the rotation
  screening seed build, then checks finalists/independent fresh ranges. A proven change captures
  a real new browser baseline requiring another feedback loop; no-gain retains exact incumbent.
  20k audit d3ad4df4… and 100k audit 145022ad… both retained the exact incumbent. Repeat it on
  the new provisional-enchant case once that feedback finishes.
- Set-variant audit on current eligible Fury pool: only set 65 has multiple items in one slot
  (13183/13218 weapons); ordered weapon-pair search already covers it. Armor sets have one
  eligible candidate per set/slot, so all per-slot subset proposals cover those current variants.
- Browser capture/verification now share `browser-capture.mjs`: real worker input, isolated browser
  storage, exact retained gear/talents/APL/race/professions, bounded waits and explicit error handling.
  Rechecked final Horde native/browser parity after extraction; no combat engine change/rebuild.
- Local Mac disk check: only 5.6 GiB available; measurement cache is 809 MiB. Avoid unnecessary full engine rebuilds; reuse the
  bounded measurement cache. No user/local cache/release files were deleted in this continuation.
- Gear search now uses the validated talents/actual APL, all legal armor/weapon/ranged sweeps,
  ordered weapon/accessory pairs (including legal identical non-unique rings), set proposals and
  compatible deterministic enchants. It preserves incumbents through screening, checkpoints each step and validates
  final gear with two fresh 20k seeds. PvP epics/reputation gear are allowed but must be labelled as
  acquisition assumptions, not cheap/instant starters.
- `audit-simulator-craft-acquisition.mjs` checks SHA-pinned Forever 70291 recipe inputs. Generated
  `artifacts/forever-simulator/craft-acquisition.json` records 1,156 reviewed-input crafts / 45 known
  raid-dependent exclusions. Core Marksman, Chromatic Gauntlets, Bloodvine, Primal Batskin, etc.
  cannot enter strict recommendations. AtlasLoot Classic raid material evidence was inspected.
  This does not prove every recipe/new reagent unlock before release; current recipe evidence is
  still 70291, while the simulator item/mechanics capture is 70425. Unknown recipes fail closed.
- Persistent measurement cache uses actual native binary SHA `3dad4336014e…`, full database,
  complete job/gear/talents/APL/seed/count. Runner fingerprint directory starts `bc587b3a7719`.
  No stale low-iteration metrics may overwrite fresh runs; tests enforce this and incumbent retention.
- Current talent policy expands to 225 unique HS/rage/stance/Rend
  APLs. Keeps exact input APL at index zero, retains multiple APL families, meaningful talent
  families rather than utility swaps, and retests neighbors with retained rotations. Hashes all
  policy sources. `selection` retains the incumbent when independent validation finds no gain.
- General feedback action after LEGAL gear completion: `create-simulator-feedback-baseline.mjs --baseline=<input>
--gear-review=<completed gear.json>`, then run the expanded talent policy against that actual
  gear. Recheck gear/enchants after any talent/APL change, then browser parity and broader scenarios.
  Gear optimizer now accepts only independently proven selections OR an explicitly retained exact
  incumbent (`selection`), without claiming an improvement. Compatible optimized enchants carry
  forward across replacement items. No final Fury
  promotion or additional spec optimization has occurred. See `docs/simulator-prebis-optimization.md`.

### All-slot pre-raid catalog deployment and MythicSim references (October 16)

- User explicitly required all equipment types and no raid additions. Shipped 2,565 selectable
  items: 1,928 current Forever items plus 637 explicitly provisional historical Classic references.
  The pinned archive has 839 reviewed records; current IDs take precedence and current-but-unadmitted
  IDs never receive old stats. All 14 equipment types are covered, including weapons/ranged/relics.
- Acquisition checks reject raid zones, raid world bosses, raid vendors/reputation, unknown sources,
  unreviewed crafted items and unresolved suffixes. No phase/quality shortcut. New Classic equipment
  is accepted only with explicit dungeon evidence or a pinned pre-raid preset. Original MIT notice
  retained. Tooltips disclose unverified Forever stats/availability/procs/sets/level requirements.
- No unfinished DPS optimizer results or talent/APL replacements shipped. Corrected editorial caster
  trinkets/rings are starters, not optimized BiS. First-open pre-raid defaults no longer grant free
  Tier 1 bonuses; existing saved experiments remain unchanged.
- Manifest reader now accepts labelled mixed provenance and reconciles counts, while accepting old
  immutable manifests for rollback. This required a scoped Linux rebuild from r13, not publishing
  unrelated local web/market/crawler changes. Directory counts distinguish current and provisional.
- Verification: 51 simulator Node tests, 44 Forever-data tests, 237 web tests, Go legality/enchant/set
  tests, strict TS/lint/Linux build, all 3,488 file hashes. All 15 real-combat profiles, archived
  unenchanted combat parity, full responsive workspace/presets, first-visit/reload/custom preservation
  pass locally. Linux preflight passes picker/equip/provenance/reload/combat and hydration-before-load/
  blocked-asset retry. Public HTTPS passes all-profile defaults and imported-item combat smoke.
- Only Helper web restarted: PID 3094851/restarts 114; ingest PID 1169337, guild PID 2507624,
  publisher/crawler/official updates retained their PIDs. Release receipt has source hashes and
  before/after process evidence; old static assets and r13 rollback retained. No commit/push requested.
- Completed the requested MythicSim inspection and imported four factual, attributed local talent
  references: Fury 18/31/2, Arms 39/10/2, Shockadin 23/0/28, Survival 0/20/31. The site uses the
  separate `sage3648/mythicsim-forever-engine-go` fork, revision 5af1303, not our pinned 9a27c3d.
  Its current ranking builds differ from both its old outside-build file and bundled UI presets.
  Only four individual public snapshots were inspected; no ranking mirror or external sim jobs.
- Owned archive `infra/simulator/reference-builds.json`, guarded adapter `reference-builds.mjs`,
  command `pnpm simulator:import:references`, guide `docs/simulator-reference-builds.md`. Per-field
  mapping, max ranks, 51 points, tiers/prerequisites and tree SHA all validate against our engine.
  Fury-only optimizer now includes its matching reference seed and source evidence. Other examples
  await their individual policies. These are LOCAL search inputs, not new live defaults or BiS.
- The local simulator test command now includes talent/reference regressions: all 59 tests pass;
  import replay, current-tree validation of all four examples, focused lint and formatting pass.
- Every source set has non-admitted items: Fury [272403], Arms [13982], Shockadin
  [272411,16723,2801], Survival [16681,272397]. Keep gear/enchants reference-only; no missing item or
  raid gear is installed. Foreign rotations are not ported, particularly Shockadin Holy Shock and
  Survival weaving/pet/distance assumptions. Source DPS/rankings are not imported as our results.
- Remaining optimization work: freeze the agreed blue-PvP baseline, preserve incumbents through
  noisy screening, then adapt/optimize talents+APL and gear in feedback one spec at a time. Earlier
  mixed-gear prototype results remain exploratory. Active jobs are recorded in the section above.

### Simulation-driven pre-raid DPS presets and talents (October 16, in progress)

- Latest user proposal: **fixed level-60 blue PvP DPS loadout → talent/APL optimization →
  retain distinct strong talent families (including wanted hybrids such as Shockadin) → gear/
  enchant optimization → repeat talent/gear feedback until stable**, one spec at a time.
  The existing runs used supplied crafted/mixed starter gear, NOT this new PvP-blue baseline;
  retain them as exploratory evidence only. Do not label them final/pre-BiS or deploy them.
- Holy Shock exists in `sim/paladin/holy_shock.go` and is registered by the shared Paladin agent.
  This is not proof that a complete Shockadin rotation/talent/model is validated; audit those
  before adding a promoted Shockadin preset. Plan explanation is the current user request.

- User requested actual pre-raid damage optimization and iterative simulations. Historical
  Classic accessories now enter an explicitly provisional pool; current Forever records win.
  No direct raid loot and no silent historical fallback. See `docs/simulator-prebis-optimization.md`.
- Captured all 23 supplied DPS builds with matching talents/APL/options. Native Go search
  compares whole sets, accessory pairs and multi-piece bonuses, with independent-seed A/B checks.
- Found the upstream first-open DPS option granted free Tier 1 bonuses. The native benchmark
  disables them; the new pre-raid UI defaults/preset loaders will also disable them. Existing
  saved experiments are preserved, not silently rewritten.
- User subsequently required **one spec at a time**, then requested maximum-DPS talents too.
  Stopped the broad batch and the fixed-talent Fury sweep. Work on Fury first: legal talents,
  Heroic Strike/Berserker Rage policy, gear/enchants, independent validation and browser checks.
  Other completed batches are preliminary only and must not be presented as final recommendations.
- `scripts/optimize-simulator-talents.mjs --spec=warrior/fury` now tests 30 rage policies,
  seeded legal builds and legal point-transfer neighbors. Current baseline has 4/5 Enrage,
  1/2 Improved Execute and 0/2 Improved Berserker Rage; these must be evaluated with their actual
  encounter/APL use. Two early Fury filler points are needed for the row-3 threshold; do not
  simply delete them or assume every utility-looking point is arbitrary.
- Caught/fixed talent result merging: `{...result,...candidate}` overwrote fresh high-iteration
  metrics with old screening values. `mergeTalentSimulation` only carries candidate talents/
  rotation onto the fresh result; a regression test enforces it. The first talent artifact is
  explicitly INVALID/SUPERSEDED. Stage 2 must finish and validate before any default changes.
- Optimization jobs are stopped for the requested catalog deployment and reference-build import.
  Production is now r15 as described above. The stale r14 accessory-only candidate was never activated.
- The earlier engine `8563438e2a68f0802bc6a190` completed all workspace and inspection browser
  checks successfully; it was not activated in production.

### Simulator first-open defaults, loading recovery and tank talent corrections (October 16)

- Explicitly authorized live Helper deployment. r12 first shipped the shared workspace/tooltips/
  reviewed enchants; r13 supersedes it with default initialization and the requests below. Deployment
  receipts are `simulator-workspace-deployment.json` inside each release. Only PM2 web restarted;
  guild website, ingestion, crawler, publisher and daily updater PIDs stayed unchanged. No DB/env edits.
- Fixed the iframe finishing before React hydration: immediate readiness inspection plus polling and
  load events, exact same-origin/profile checks, 30-second recovery and Reload engine. New individual
  engines also signal when initial gear/talents finish. Raid must not receive that individual-only flag.
- Fresh visits auto-load and persist a complete default. A one-time migration recovers legacy all-empty
  equipment, backing up exact JSON under `<settingsKey>_kfc-starter-initialized-v1_backup`. Shared links
  override defaults afterwards; nonempty custom characters and later deliberate empty builds remain.
- Suggested Protection Warrior is 8/5/38, 3/3 Defiance, 0 Unbridled Wrath. Bear is 0/41/10 with
  3/3 Feral Instinct, no Balance point. Actual tree tiers/prerequisites/51-point totals are build-checked.
  Saved personal talents are not replaced; select the updated talent preset to adopt them.
- Removed Model & tools, promotional/source links and GitHub footer links from simulator screens.
  Functional Options/import/export remain; bundled MIT/OFL notices and provenance files remain intact.
- Replaced Node-to-Web push stream adaptation with bounded pull-based asset streaming. Browser
  cancellation can no longer enqueue/close an already stopped controller. Cancellation stress tests
  pass; Next itself still logs `The destination stream closed early` for deliberately aborted transfers.
  No blanket error suppression or whole-WASM buffering was introduced.
- Verified: 237 web tests, 38 simulator tests, lint/typecheck/Linux production build, all 3,485 asset
  hashes, all 15 real combat profiles and complete workspace suite. Both Linux preflight and public
  HTTPS pass iframe hydration/retry, first-visit defaults, saved/empty recovery and corrected talents.
- Follow-up accessory audit is in progress locally: keep pre-raid starters (user confirmed). All 23
  DPS lists inherited Frozen + Molten. Caster Molten AP is inappropriate; Frozen's equipment hit is
  universal in Forever, not melee-only. Role-specific replacements and improved DPS rings are being
  verified. Classic reference identities live in `infra/simulator/classic-accessory-worklist.json`;
  missing records are not proof of removal and do not authorize silently using old stats/procs.
  Candidate r14 engine `8563438e2a68f0802bc6a190` is built/staged (1,928 items, 3,486 files,
  43 Node tests) but NOT activated. It replaces mismatched DPS trinkets and improves DPS rings.
  The user challenged continued Frozen Heart defaults after the Classic import: the import is
  identity/review records only, not usable Classic stats/procs. Frozen is a limited-catalog starter,
  never validated BiS. Hold accessory activation until resolving whether explicitly labelled
  provisional Classic stats may enter comparisons; the earlier verified-only preference has not
  yet been explicitly replaced. r13 remains live with completed UI/talent fixes.
- Threat audit: default 100-iteration seed-1337 runs gave Warrior 392.21 DPS / 1,001.74 TPS, Bear
  411.74 / 1,404.14. With identical external buffs/debuffs and fixed 300s encounter: Warrior 414.71 /
  1,040.18; Bear 414.22 / 1,411.87. Thus the normalized DPS is effectively equal but modeled TPS +36%.
  Bear direct+bleed Lacerate contributes 497.20 TPS using inherited, unverified 3.33x ability threat;
  Primal Bite uses 3x (unverified 1.5x base doubled), Swipe 2x, Maul 1.75x. Form 1.5x is documented
  in Blizzard notes. Warrior with shield/Defiance uses 1.3x1.15=1.495. Totals reconcile; no demonstrated
  summation bug. Do not market the TPS gap as measured in-game class balance or guess new coefficients.
  No combat formula was changed by this diagnosis.

### Default simulator enchants (2026-10-16; implemented locally)

- Active local release `fba685b35451678279ffa37e`: 22 pages, 1,927 real-source items, 3,485
  SHA-indexed files. It was local at the original receipt; subsequently shipped through r12/r13 above.
- All 28 supplied gear lists across the 15 supported profiles now include reviewed enchants:
  23 DPS lists and five tank/faction variants, 265 applied enhancements. Named builds and raid
  defaults reuse these objects. Equipment IDs and tank accessory priorities are unchanged.
- Build-time adapter `infra/simulator/default-enchants.mjs` validates actual item/slot/wearer
  compatibility against the audited catalog. Static effects plus the implemented ranged-crit
  scope only; no provisional proc assumptions, unsupported effects or wearer-profession locks.
- Role/school/weapon-specific choices, exact IDs, source and static bonus totals are published in
  `kfc-default-enchants.json`. Tank UI separates raw item totals from enchant bonuses. Availability
  still requires in-game confirmation; these are starting choices, not proven simulated BiS.
- Saved characters/custom sets/imports are not migrated. Select Build library → Gear Sets to load
  the updated preset. Removing an enchant remains saved; no runtime default autofill.
- Full implementation and selection policy: `docs/simulator-default-enchants.md`.
- Verification passed: 34 Node tests; Go legality/stat parity for all 28 lists; strict engine
  TS/Vite/WASM build; cached SHA verification of 3,485 assets; complete workspace and inspection
  Playwright suites. All 15 profiles run real combats; twelve unenchanted golden requests/results
  remain exact. Every named gear set, faction starters, saved empty enchants, mobile/iframe bounds,
  Raid, imports/recovery and click-through picker previews are checked. No Next code changed.

### Simulator hover stats and enchants (2026-10-16; implemented locally)

- Previous local release `4a30cdef5ca4a6f1da3935ca`: 22 pages, 1,927 items, 3,484 SHA-indexed
  files. Production r11 is unchanged; no commit/push/deployment. Receipt and source requirements:
  `docs/simulator-item-tooltips-enchants-plan.md`.
- Added local in-game hover/focus inspection, real stat vectors, suffixes, separate enchant
  bonuses, current set counts, viewport/iframe clamping and native touch details. Client effect
  references are distinguished from implemented effects. No external tooltip-script dependency.
- Add/Change enchant controls expose the existing searchable picker, with effect summaries,
  No enchant and support status. Raw build-70425/hotfix/manifest and table checksums are pinned.
  All 182 choices were audited: 134 static, 23 scripted, 9 utility, 5 provisional, 11 unsupported.
  Corrected 39 application/slot entries; effects 247/66 now correctly grant +3, not +1.
- TS/Go compatibility covers normal gear and item swaps; simulation/stat-weight preflight
  rejects unsupported models and requires explicit session consent for provisional procs.
  Saved builds keep their enchant IDs; unknown IDs get an actionable original-JSON backup/download.
  Import validation precedes the inherited event batches which otherwise swallow exceptions.
- All 29 focused Node tests, focused Go tests and upstream strict TS/Vite/WASM build passed.
  Dedicated browser checks cover save/remove/reload, unchanged talents/rotation, disabled and
  provisional choices, exact recovery/download, five widths, native details and iframe/parent
  scrolling. All 15 combat profiles ran, including legal shield/two-hand enchant cases. Existing
  workspace smoke covers twelve unchanged golden profiles plus tank/UI/Raid/recovery regressions.
- User additionally requested small tank AND DPS priority research for future enchant suggestions.
  `docs/simulator-enchant-priorities.md` separates survival/threat and physical/caster DPS, uses
  Classic priorities only as seeds, and documents Forever Feral weapon scaling and conditional caps.
  Current EP sorting is not a simulated best-enchant claim. Existing starter priorities, saved
  characters remained unchanged. The subsequent explicit request added enchants to supplied
  presets only, as documented above; saved characters still do not receive automatic replacements.

### Shared simulator workspace redesign (approach two)

- User approved redesigning the existing shared UI first, retaining the Go/WASM engine and all
  supported profiles. A native React replacement remains a later option after design feedback;
  no new commit, push or production deployment is authorized by this implementation request.
- Owned overlay sources live in `infra/simulator/workspace.ts`, `workspace.css` and
  `workspace-adapter.mjs`. Source patches are idempotent and reject changed upstream constructor
  contracts. Builder identity includes every overlay input; immutable existing releases are kept.
- Reorganized existing controls into a class header, build tabs, labelled equipment cards, build
  library and a sticky simulation/results panel. Character stats are a disclosure, utility tools
  remain available, and the mobile layout switches between Build and Results. KFC fonts are
  self-hosted with integrity pins and OFL notices; equipment quality colours are more readable.
- Controls are moved, not cloned; import/export stay descendants of their owning SimHeader.
  Explicit click triggers avoid the old hover-open/click-close behaviour on those menus. All
  original rotation, encounter, talent, import/export and result-reference logic remains intact.
- The report toolbar stays below the new workspace header and below its stacking layer. Embedded
  “Sim 1 Iteration” now posts to its own simulator window with an explicit same-origin target,
  rather than sending an unhandled command to the enclosing Next page.
- The Next wrapper adds fullscreen focus mode with a visible failure fallback and retains a
  new-tab alternative. No cross-frame CSS injection, model changes or server simulation required.
- Oversized jobs exposed an inherited cancellation limitation. The UI now reports “Stopping…”
  and offers a delayed, explicit restart with a clear result-loss warning; never auto-reload.
  Normal cancellation still uses the engine signal manager. This does not change combat math.
- Captured deterministic requests and results from original release `97542052802008a0112748b0`
  before rebuilding. All 15 profiles have matched request SHA-256 and displayed metrics, with the
  same WASM hash. Reproduction: `pnpm simulator:test`, `pnpm simulator:prepare` and
  `SIMULATOR_TEST_URL=http://localhost:3017 pnpm simulator:smoke:workspace`.
- Golden receipt and review screenshots stay under ignored `artifacts/forever-simulator/`.
  `--capture-baseline` explicitly captures a baseline; `--interactions-only` runs the focused UX
  checks without repeating combat. Local preview remains port 3017; production r11 is unchanged.
- Original UI-only release `47249ed45374259f39bf44ed` contains 3,482 SHA-verified files and the exact
  original WASM. Passed eight overlay regression tests, 230 web tests, lint, strict types and
  Next/engine production builds. All 15 fixed-seed requests/results match the original baseline.
  Playwright passed 1,440/1,024/768/390px gear/settings/talents/rotation/results layouts, item
  modals, import/export menus, actual keyboard focus, Raid and focus mode. The embedded report's
  single-iteration button produced real combat results. Actual JSON export/import and saved result
  references also worked. A dropped-abort transport exercised delayed restart, preserved settings
  and a successful subsequent real run. Settled desktop/mobile screenshots were inspected.

### Simulator threat accessories and outside-picker dismissal (2026-10-16; local only)

- User explicitly chose Forever-verified items only; do not insert Classic-stat Hand of Justice
  or Blackhand's Breadth. Neither has a resolved item in the reviewed snapshot; that is not proof
  of removal from the game. Warrior/Bear accessories now prioritize threat, not extra stamina;
  Paladin remains defensive. The blue PvP armor stays locked as the stamina baseline.
- Warrior/Bear use Adaptive Combat Assistant + Frozen Heart of the Mountain. Five legal offensive
  pairs were compared at seed 1337 / 1,000 iterations on the prior loadout; this pair led the
  tested TPS candidates, not a global BiS proof. Adaptive's use remains unmodeled; no invented
  absorb/explosion damage is credited. Paladin uses Defender's Grip Stabilizer + Guardian Talisman.
- Added client-verified Don Julio's Band and faction-correct Theramore Signet / Insurgent's Band.
  Item stats come from SHA-pinned build-70425 mechanics, not the stale planner (icons only).
  The builder requires the existing immutable checksum file in FOREVER_MECHANICS_ROOT, verifies
  integrity and fails closed on missing/unresolved data. No extracted stats are committed.
- Warrior/Bear offer eligible Alliance/Horde variants; first-load defaults and raid defaults
  choose the correct faction. Disabled saved presets are rejected on activation, not just styled.
  The obsolete combined Warrior Tanky shortcut was removed to avoid bypassing ring eligibility.
- The picker already dismissed on native inside-frame backdrop clicks. Outside website clicks
  never reached it. The Next frame now sends a narrow parent pointerdown message; the workspace
  accepts only its same-origin parent and invokes the existing selector close control. No gear
  rollback, unrelated-modal dismissal, global click cancellation or simulation guard weakening.
- Full evidence, current totals and reproducible checks: `docs/simulator-tank-starters.md`.
  No production/database change, dependency, commit or push is part of this task.
- Verified final local release `41f89cd6f53e404dfe132ee3`: 1,927 real-source items, 939
  projections excluded, 3,483 SHA-verified files. Passed 21 Node + 230 web tests, web/engine
  strict types and production builds, lint/format/diff checks, all 15 real combat runs and
  twelve unchanged-profile golden comparisons. Full browser suite passed both faction variants,
  disabled-preset rejection, saved-build preservation, five viewport sizes, internal/parent-gutter
  dismissal, foreign-origin/source rejection, Raid/focus/embedded rerun and stop recovery.
  Settled mobile starter screenshots were reviewed. Generic AP also populates ranged AP in the
  new ring records, matching the pinned engine's item normalization convention.

### Simulator Build library and original tank starters (2026-10-16; local only)

- Moved the existing Build library above Equipment in both DOM and visual order, including wide
  screens; removed the ≥1,500px side-column override. Original control handlers are retained.
- Added one level-60 blue PvP gear preset for Protection Warrior (Mortarplate), Protection Paladin
  (Chevalier) and Feral Tank (Dragonhide). Each has its six-piece core plus wrists/belt, then legal
  stat-weighted fillers. The exact editorial weights, method, gear-only totals and guide links are
  exposed in the library. These are starting points, not BiS or crit-immunity claims.
- The 24 core armor arrays match the resolved build-70425 client snapshot. Only 16 missing
  Paladin/Druid records are admitted from the pinned broader PvP input; 939 projections remain
  excluded. The equipment pool is now 1,924. Source/vendor access and phase availability remain
  distinct from client stat evidence. Do not assume a set name proves cross-faction purchase access.
- New tank defaults and starter loading disable forced Tier 1; old saved characters are not
  overwritten. Gear loads preserve talents/rotation and propagate their on-load callback through
  both normal gear sets and combined builds. All selected rings/trinkets are distinct; shared
  unique-equipped categories are also checked, avoiding two category-707 engineering trinkets.
- Added scoped current-client Sanctuary/Vindication two-/six-piece stat definitions. Four-piece
  utility stays unmodeled, and legacy Sanctuary healing bonuses must not leak or stack. This is an
  intentional WASM extension, not the byte-identical engine of the earlier UI-only release.
- Detailed calculations, source identity, constraints and verification commands:
  `docs/simulator-tank-starters.md`. Generated data/screenshots stay ignored. No commit, push,
  production deployment, new dependency, database write or dev-server restart is part of this task.
- Original starter release `4a8eae4d6a64c8a7f2859076`: 3,483 SHA-verified files. Passed 16 Node
  regressions, focused Go set tests, engine TypeScript/Vite build and lint/format/diff checks.
  All 15 real combat profiles passed; the other 12 retain exact original requests/results.
  Browser checks passed starter load/save/reload, preserved edits/talents/rotation, Tier 1 reset,
  1,600/1,440/1,024/768/390px layouts, item modals, menus, keyboard, Raid, focus mode, embedded
  reruns and stalled-worker recovery. The starter-data URL returns 200; screenshots were reviewed.

### Simulator release and daily worker deployed

- Feature commit `14f9b5d` is pushed to `origin/main`. Only simulator/update changes were staged;
  unrelated worktree edits and the personal document remain untouched and uncommitted.
- Active web release `kfc-helper-simulator-20261016-r11`, Linux build `8HugevLp4-Lvt8LDnKKT7`,
  is composed from the live r10 baseline plus the feature overlay. Existing catalog observatory,
  navigation/sitemaps, launchers/package scripts and v3 XP readers are preserved. Deployment metadata
  lives in the release's `simulator-deployment.json`; source is not a wholesale dirty-worktree upload.
- Linux passed 41 data tests, 230 web tests, lint/typecheck/webpack build and all 15 browser combat
  profiles, Raid loading and desktop/mobile layout checks. All 3,475 simulator assets and 661 new
  talent icons/backgrounds passed server SHA-256 checks. Public HTTPS tests passed the new nine-class
  selector, class/profile navigation, mobile choices and a genuine combat run without JS errors.
- `kfc-helper-web` is PID 3057652. New PM2 `kfc-helper-official-updates` is PID 3057700, namespace
  `kfc`, saved for startup. Its first run succeeded for both official notes and talents; next check
  is October 17 at 06:00 UTC. Talent source generated October 16/build 70425, checksum
  `02d195f23062210e4f6f4ea1b2b06e32587a18f56f228862148fa68fd9e8ee18`, is published. Source imports
  do not auto-patch the pinned combat engine or change the AH catalog.
- Ingestion PID 1169337, reference publisher PID 3041638 and crawler PID 3041944 were not restarted.
  The existing guild application (PM2 30) and other services were not modified.
- Verified pre-publication backup: `/home/wow-trader-system/shared/backups/simulator-20261016-r11-Qr28yC/wow_trader.dump`
  (216,217,477 bytes; custom dump listing verified). Prior publication pointers and web environment
  backup are retained on the server. Web and updater share the immutable talent-assets root; old
  preview assets remain available. No migration or Docker/Go installation on the server.
- Offline full-workspace install encountered an unrelated missing Electron tarball. This isolated
  release uses copied Linux dependencies from r10 with exact-version, release-local links for the
  already installed `cheerio@1.2.0` and `robots-parser@3.0.1`; all server checks passed afterward.
  The pinned WASM was built locally, verified after transfer and runs on the user's device.
- Only r11's generated build cache (274 MiB) was removed; runtime, source, published assets,
  database backup and rollback release are retained. Private preview and SSH tunnel are stopped.
- Next requested task is research on replacing the dated inner WoWSims interface with modern KFC
  UI. Keep the reviewed Go/WASM engine and typed worker contracts; do not implement that redesign
  merely from the current difficulty/approach question.

### Simulator selector matches the Encyclopedia design

- Replaced the large simulator panels with the Encyclopedia's existing `forever-class-grid` cards:
  circular local icons, class-coloured glow, serif labels, compact descriptions and identical class
  ordering. Class appearance metadata now lives in `apps/web/src/lib/forever-classes.ts` and is
  shared with the existing Encyclopedia directory; no simulator DB dependency was introduced.
- Single-profile classes open directly. Multi-profile cards expose their supported choices at
  `/forever/simulator?class=<slug>#simulator-profiles`; the selection is shareable and works through
  normal links. All 15 individual profiles remain accessible; Raid has its own compact card.
- Profile pages now show a circular class portrait and only that class's profile tabs, with a clear
  return to class selection. Technical/beta details remain accessible in compact disclosures rather
  than occupying the selection grid. Combat code, model release, URLs and market/crawler state are
  unchanged.
- Passed 230 web tests, lint, strict typecheck, and production build. Playwright verified all nine
  loaded local icons, Druid selection/three profiles/Feral Tank navigation, invalid class handling,
  Raid and 1,440/768/390px layouts without overflow or JavaScript errors. Screenshots were inspected;
  the redesigned Warrior class → profile → embedded simulation flow produced a real combat result.
- Local preview remains `http://localhost:3017/forever/simulator`. No commit, push or deployment was
  requested or performed for this design change.

### All class simulator and daily source updates implemented locally

- User authorizes implementing the previous plan and explicitly requires all WoWSims-supported
  classes/specs, not a Warrior-only pilot. No commit/push/deploy request in this turn.
- Official notes contracts/parser, bounded robots-aware Discourse fetching, immutable DB/file
  publication, source cooldowns, daily health/locks and CLI are in `packages/forever-data/src/updates*.ts`.
  DB publication takes precedence over the local archive; a local-only capture can later be imported
  into DB. Failures preserve last-good notes. Changes renders class/system/category summaries with
  original-post links, independently from the existing catalog and preview-source history.
- Reused source is pinned gunba Forever revision `9a27c3d6af91d1ca0dbcf94a124b8869ad522108`, checked
  out at `.cache/forever-sim-upstream`. Read its root AGENTS.md. All 15 launched individual pages
  across nine classes plus raid are in scope; four unlaunched healer agents must not be advertised.
  All 15 individual profiles produced real browser combat results; Raid loaded cleanly. Four
  unlaunched healer agents are excluded. npm dependencies installed with ignore-scripts.
- Native Go 1.27.2, verified against the official SHA, is isolated under
  `.cache/simulator-toolchain/go`; protoc-gen-go is under `.cache/simulator-toolchain/bin`.
  Fork npm protoc wrapper installed protoc 36.2; `make proto` passed. No Docker/system Go install.
- Reproducible preparation uses `scripts/prepare-forever-simulator.mjs` plus the reviewed host overlay.
  Self-hosted versioned WASM/workers/JS/CSS/fonts; no remote website iframe or server-side simulation.
  Retains 1,908 real-source equipment records, excludes 939 projected records/rankings and restricts
  the Classic fallback DB. The clean generated build avoids copying stale hashed bundles, and the
  release identity includes the builder, source/config, overlay and vendor hashes.
- `/forever/simulator` has all supported profile links and a raid builder; navigation and Forever
  home are integrated. `/forever/simulator/data` shows the separate current-client audit. The
  manifest-listed asset route streams WASM, supports conditional/HEAD caching, rejects traversal and
  escaping symlinks, and applies a scoped CSP. Operational assets are not indexed in search.
- The separate .NET `mechanics-snapshot` command succeeds with reviewed WoWDBDefs revision
  `996e53f029c0213b223aecb94d754f6b4b9efb49`: 58 item/Trait/curve/spell tables plus CombatRatings,
  exact build/hotfix capture, checksums and encrypted-record counts. No AH catalog mutation.
  Artifact: `artifacts/forever-mechanics/70425/8464d7adbd3e6aba33b8c8ccefe6085c7b5c2ac0672685cbfb7e8671b01fffb8/mechanics-20261016T084757Z-2aedcf9205934b11898d991d60ee8d1d/manifest.json`.
- Normalized audit checksum `b52b73d2765c00a0569a86f2923843ea1c264fafd5af9d5eec3874db4d7a23aa`:
  12,400 equippable records, 12,328 resolved base-field records, 536 sets, 1,477 set effects and
  469 active talents across all nine classes. Seven layouts and 147 rank-text records need review.
  This audit is not a claim that every item/proc is simulator-ready or server-verified.
- Daily worker `scripts/forever-updates-worker.mjs` and PM2 config check notes plus the structured
  talent feed at 06:00 UTC, with independent failure handling. All-class validation and verified
  immutable assets precede talent DB publication; old URLs/snapshots remain readable. Worker/web
  must share `FOREVER_ASSET_RELEASES_ROOT`; keep legacy asset root for historical releases.
  The October 16/build-70425 live feed validates with 466 complete talents/1,826 spellbook entries.
  No current task has published it to production or activated the PM2 worker.
- Verified 41 forever-data and 226 web tests, strict types, focused script/package/web lints,
  .NET build (zero warnings/errors), selected Go core mechanics tests, all-profile browser runs,
  desktop/mobile layout checks, and production Next build. Tracing boundaries prevent runtime data
  paths from bundling the project; source-scoped web tests avoid discovering generated build copies.
- Preview server is on port 3017, with absolute simulator/notes roots and isolated
  `.next-simulator-dev`. No production changes, commits or pushes were made. Deployment instructions
  and future model gates: `docs/forever-patch-notes-talents-simulator-plan.md`.
- Remaining model work: durable entity reconciliation/save migrations across tree changes,
  individual effect and dungeon-set validation, controlled game evidence and simulation-backed BiS.
  Daily news/talent publication never auto-generates or silently patches combat code.

### Daily Blizzard notes and Forever simulator original research

- User requests a once-daily Blizzard topic import into Changes, evergreen talents/spellbooks,
  and a WoWSims-style combat simulator using actual Forever dungeon sets. Analysis/planning only:
  no schedule, client extraction, simulator installation or production mutation was performed.
- Public topic `631316.json` works. Post 6 is ID 6435321, updated October 16 at 00:16:31 UTC;
  daily polling must handle edits and later posts, not a dated slug. The stream contains six IDs
  despite `posts_count: 4`; content hashing and pagination must establish actual completeness.
- Published preview API still reports October 8/build 70291; the installed client's active build
  is 70425. Keep official announcements, client facts and tested simulator rules independently
  versioned. Patch text can identify changes without supplying all coefficients or tree positions.
- Latest local 70291 catalog has 536 sets, 1,562 members and 1,468 threshold effects, but zero
  normalized item-stat/damage/effect rows. Verified causes: legacy bonusAmount/MinDamage fields
  are absent from modern ItemSparse; raw ItemEffect lacks the ParentItemID required by normalization.
  Budget-based stats, weapon/armor tables and actual effect-link tables must be resolved first.
- Existing MIT WoWSims/Forever engines are candidates for a pinned Go/WASM browser-worker engine
  behind the Next.js interface. gunba's current ranking scenario uses hypothetical gear and is
  not an authoritative dungeon-loot dataset. Evaluate mechanics separately from gear/rankings.
- Plan: daily feed first; current Trait/spell/item extraction and durable ID reconciliation next;
  all-supported-profile beta with real equipment; then validated model updates and simulation-backed BiS.
  Research, source links, exact inspected revisions, acceptance gates and rollback/versioning scope:
  `docs/forever-patch-notes-talents-simulator-plan.md`.

### Quest identity/renderer repair (2026-10-16; deployed, backfill resumed)

- Owner authorized fixing/resuming the October 16 failure. A single permitted, durably paced
  capture proves quest 2866's ID is correct but its primary metadata name has a trailing space:
  `The Ruins of Solarsal `. Normalize surrounding whitespace only for quest metadata/Gatherer
  names, matching the already-trimmed heading. Different names, IDs, editions, duplicate metadata,
  nonliteral expressions and access/redirect failures remain rejected.
- Source now uses core `25318d8a`, full SHA
  `25318d8aafded7f7b7da8385f81a9aaee35fb1470007119d3c31f8d5dee8a1a8`.
  Static AST inspection shows XP rounding and max-player-level function bodies byte-identical
  to the previous reviewed core; the fetched quest renderer's full SHA remains
  `5f36c4ad6b8159cef34450542f3264c877c07f2c1c2079815ade2fd712101bdf`.
  Only this third exact renderer pair is added. Unknown future pairs still hold numeric XP.
- Parser capability `wowhead-quest-xp-20261016-v3`; readers retain v1/v2 compatibility. Fresh
  available facts stay cached; old unknowns get one version-aware retry, not an unbounded loop.
  A minimal numeric/identity-only regression fixture preserves the observed trailing space.
- Web/publisher `kfc-helper-xp-reader-20261016-r10`, Next build `cI5AXKYrvutnEVG7KfJty`, activated
  before any v3 publication. Only four scoped reference-package files overlay actual combat r9;
  no unrelated dirty-worktree feature is included. Worker `crawl-20261016-r9-xp` preserves the full
  recovery → priority → archive → base implementation and all rate/storage/access guards.
- The real captured page was reprocessed offline with original SHA/time, not refetched or edited:
  quest 2866 published at 2,700 XP, parser v3, at 07:05:16 UTC. Capture SHA
  `9375901e3a2dbb971e45f728e73292f0172679e85d1d7edd9814e638e1a4ffa8`, time 06:56:05.660 UTC.
- Backed up staging, queues, checkpoints and all 1,129 validated published records under
  `/home/wow-trader-reference-worker/backups/20261016-xp-repair.QgDGAy/`. Frozen cohort has 127
  unknowns (124 renderer-held). Fresh queue SHA
  `c24804d2afe7a3ce25d37692957d406602920a5eb0654d9eb6108ac48d63d39d`, checkpoint
  `shared/recovery-xp-c24804d2afe7a3ce-status.json`, wrapper
  `shared/queues/reference-crawler-recovery-v3.config.cjs`. Original 317-record recovery is retained.
  Priority cursor 1,133 and base cursor 746 were byte-identical to backup after restart. The new
  backfill runs first, then the original priority/2,535-ID archive/base resume automatically.
- Live verification at 07:11 UTC: recovery advanced to 5/127 without errors. Quest 658 was
  recovered and published as 2,800 XP with no issues; quest 2866 remains published at 2,700 XP.
  Three processed pages genuinely lack scaling payloads and remain unknown rather than zero.
  Five public route smoke checks returned HTTP 200 without catalog/database error screens.
  Removed only the new release's 233 MiB generated Next build cache and stopped the private
  preview/tunnel after testing; production runtime assets and backups remain intact.
- Active PIDs: crawler 3041944, publisher 3041638, web 3041619; ingestion 1169337 unchanged.
  PM2 saved. No database migration/catalog write, player-save mutation, addon installation,
  provider publication, pacing reset or parallel crawler. No commit/push requested/performed.
- Verification: 78 local reference tests, 220 local web tests, 3 queue/recovery CLI integration
  tests, strict types/lint/build/formatting. Linux candidate: 76 reference + 220 web tests and
  optimized webpack build (59 static pages) passed. Private/public Chrome tests passed real XP,
  hand-in levels, unchanged saves, mobile layout and accessibility. More source gaps may remain;
  successful crawling does not certify the full leveling route. Operation/rollback details:
  `docs/forever-leveling-xp-repair-2026-10-16.md`.

### Earlier crawler stop audit (2026-10-16; historical, repaired above)

- Read-only check at 06:36 UTC found the crawler stopped, with no active job lock. The priority
  checkpoint is genuinely blocked at 1,133/1,419 on `forever-quest-2866`, since 05:09:42 UTC:
  `Quest XP metadata identity mismatch`. This is a new active failure, not the October 13 base
  checkpoint discussed below. The guard checks both primary metadata ID and name; the exact
  mismatch has not been diagnosed from source HTML. No staged quest-2866 record was written.
- Validated full-archive publication coverage: 1,002 available, 127 unknown, 1,406 unpublished,
  zero conflicts/expired, out of 2,535. Of the unknowns, 124 report unverified renderer revision;
  a renderer/source-format review is needed, not an assumption that those quests have zero XP.
- Publisher remains online at PID 2871067, with no error-log entries, publishing/validating existing
  artifacts. Disk has approximately 17 GiB free, above the crawl reserve; no storage exhaustion.
  Recovery remains completed at 317/317. Priority did not finish, so the archive phase has not begun.
- No source requests, process restart, validation bypass, code/deployment, queue or checkpoint
  writes were performed for this status request. Only this local context receipt was updated.
  Investigate identity mismatch and unsupported renderer inputs before resuming the crawler.

### General-catalog redirect checkpoint audit (2026-10-15; no live failure)

- Corrected the prior status report: `shared/status.json` is the base queue's saved October 13
  failure at cursor 746, not the active worker's status. Exact quest-260 not-found handling was
  already deployed on October 14 and is present in the current r8-full-archive worker. There is
  no outstanding implementation fix for that known redirect. Do not restart the leveling worker
  or clear an old checkpoint merely to make its historical error disappear.
- Verified compiled source maps against local source, byte-for-byte: crawler SHA
  `801abd1cc340bc531473a019ef314f63b69ad2dce929ef60ee713cb41530c35c`; job SHA
  `17f863e169ca2b5eeb2e36e243ca5a7da26ebea7881900bfab49702b08060764`.
  The base queue still matches its saved SHA/count/current key. Its cursor/counts/queue were not
  edited. No missing-page evidence was fabricated or imported.
- Added an isolated regression recreating the legacy checkpoint without `questXp`: recovery →
  priority → archive → original base resumes, quarantines exact same-edition/id HTTP 301 without
  fetching the listing, continues to the following entity, preserves prior counters/hash, and
  does not refetch completed phases. Existing negative redirect/access tests remain enforced.
- 71 reference-data tests, strict types/lint, focused formatting and diff checks passed. No runtime
  code change/deployment, new source requests, queue/pacing/lock writes or process restart was
  required. New regression/docs remain local; no commit/push requested in this follow-up.
- At 16:34:42 UTC the active priority queue was running at 725/1,419, PID 2874710, error null;
  `.job.lock` identified that priority checkpoint. Recovery completed 317/317 at 14:15:54 UTC.
  The 2,535-ID archive follows priority, then the general catalog resumes automatically. The
  exact known missing redirect will be skipped; genuinely new unsafe redirects still stop.

### Combat XP web deployment (2026-10-15)

- Scoped implementation commit `35137da` pushed to `origin/main`; 33 files. Unrelated local
  catalog/market/ingestion/crawler work remains untouched and uncommitted. Clean Git-index export
  passed 221 leveling + 198 web tests, strict types, lint and focused formatting.
- Active release `kfc-helper-combat-20261015-r9`, Next build `1cFoZCia2MeGyO-m4y_ip`, is the actual
  immutable r8 baseline plus the reviewed combat overlay. Thirty-two complete overlay files were
  SHA-256 matched to the staged export; root package metadata merged only the two new combat
  commands, retaining existing operational scripts. It is not a pristine Git checkout. The r8
  v2 XP parser/contracts were preserved byte-for-byte; no reference/crawler rollout was performed.
- Linux candidate passed 221 leveling + 220 web tests, package lint/types and real-font optimized
  webpack build (59 static pages). Private and public browser tests passed real quest XP, correct
  hand-in level, per-player forecasts, read-only refresh, 320/390px and axe accessibility. Twelve
  public URLs returned 200, including both Traders with no database/catalog-review warning.
- Only `kfc-helper-web` reloaded: PID 2895170, restart count 109. Crawler 2874710, publisher 2871067,
  ingestion 1169337, guild/community PIDs unchanged. Recovery checkpoint remained running at
  165/317 at 11:42:57 UTC; full archive phase is still queued behind recovery/priority. Do not
  interpret that cursor as all quest data collected. PM2 saved; previous r8 remains for rollback.
- Production's non-secret XP-feed path is persisted in PM2, not `web.env`. The private candidate
  explicitly matched it; the web reload preserved existing PM2 environment without `--update-env`.
  No secret/environment file, database, archive, provider data, addon installation or player-save
  change. Combat reference publication remains held; production shows unmeasured combat rather
  than importing the private local provider dataset. The 1–60 route is not certified.
- Deployment details and rollback: `docs/forever-leveling-combat-release-2026-10-15.md`.

### Required combat XP implementation (2026-10-15; code deployed, provider import local)

- Implemented literal-only corrected Static provider import, versioned combat contracts and
  historical XP calculator, typed quest/NPC/quota joins, campaign integration and folded target
  panels in both-faction source readers. Existing party size selects solo or conservative shared
  XP. Quest rewards stay whole; kills precede hand-ins and level-ups affect later rewards.
- Local dataset: 13,391 named NPCs, 5,232 quests, source revision
  `49e7dbca1f18eb3b8e57ee5d9562ac3e5c9adcc4`, payload SHA
  `2bf6ce6b5aa2959b30bf133f7e96b8468725efe3b323b14fdb336f3505090fef`.
  All authored Static layers included; Dynamic corrections/derived passes are not applied.
  Kept `private-reference`; production refuses it until actual source-publication authorization
  is recorded. No private exports committed or deployed.
- Audit reconciles 1,383 variant kill-objective rows across 205 distinct quest IDs, including
  120 Alliance/138 Horde IDs with overlap. One unnamed NPC is omitted and Infernal's inverted
  51–50 range is unknown, not corrected by guess. Name-based credit proxies have unknown XP
  eligibility, not verified zero payouts. Numeric goal text supplies missing guide quotas;
  conflicts stay unresolved. These are reference counts, not playable totals or level-60 proof.
- Shared accepted objectives credit the same kills once; later acceptances need new kills.
  Already-started quests with unknown remaining counts receive no duplicated full quota.
  Dungeon path/quest overlap, current-build measured per-player payouts, hard entry checks and
  conditional optional-filler pruning are covered. Existing actual progress is never rewritten.
- Zero reviewed dungeon paths/calibrated kill contexts are currently imported. Their data entry
  and validation are implemented, but unmeasured clears do not receive guessed populations,
  quest multipliers or flat level bonuses. Full route funding remains unproved.
- Optional `KFCForeverGuides` observer now has `/kfcguide combat`: bounded passive XP messages,
  public context and explicitly unverified target-name candidates. Off by default/until reload;
  `/kfcguide stop` stops it. Secret guards and mocks; no bulk scans, protected actions, trader
  addon changes, installation into WoW or live-client verification.
- Commands: `pnpm leveling:combat:import` and `pnpm leveling:combat:audit`. Existing `pnpm dev`
  discovers the local artifacts automatically. Operation/details: `docs/forever-leveling-combat-xp.md`.
- Verification: 227 leveling and 220 web unit tests passed; both package lints and strict types,
  package build/import, script lint and Lua mocks passed. Real-data browser smoke passed for
  Alliance/Horde, solo/five players, exact estimates/NPC links, 320–1440px, axe accessibility and
  unchanged actual saves. Final audit receipt:
  `artifacts/leveling/audits/2026-10-15/combat-implementation-final-v2/combat-audit.json`.
- Fixed local dev-only hydration: Next's separate React debug WebSocket was blocked; inline debug
  metadata (`experimental.reactDebugChannel: false`) restored hydration. Web dev uses webpack to
  avoid the independent Turbopack Google-font query failure. No allowed-origin/security relaxation.
  Production webpack builds pass with test-only local font transport responses; the default
  Turbopack build and real Google font delivery are not claimed verified by these checks.
- Final optimized webpack build passed (59 static pages). The production-mode browser smoke also
  passed with the owned synthetic dataset: both factions, solo/five, target panels, campaign
  coverage metrics, mobile widths, accessibility and unchanged completion saves. Real provider
  publication stays held. QA screenshots are temporary, not public website assets.
- `scripts/prepare-leveling-combat-fixture.mjs` creates owned synthetic archive/combat fixtures in a
  fresh temporary directory for production-mode QA. It never copies or authorizes provider data.
  Initial implementation checks were local. The subsequent approved code commit/web deployment
  is recorded above; private provider artifacts and the optional addon were not installed.

### Explicit combat-XP feasibility research (2026-10-15; historical input)

- Owner now asks to model required outdoor kills and dungeon clears directly, with conservative
  solo XP / 5 in five-player mode, instead of treating all combat as an unspecified buffer.
  Research/plan: `docs/forever-leveling-combat-xp-research.md`. This section records the earlier
  research-only state; the subsequent local implementation is described above.
- Current extracted world snapshot has zero quest-objective rows and only 179 creature-difficulty
  rows. Found QuestieDB's independent Forever provider as a useful additional candidate source.
  Pinned revision `49e7dbca1f18eb3b8e57ee5d9562ac3e5c9adcc4`; raw-only feasibility pass finds
  2,230/2,535 queued quest IDs, 269 creature-objective quests with all referenced level ranges,
  and 1,373/1,519 guide mob names. These are uncorrected discovery counts, not live validation.
  Effective correction layers, quotas, ID matching and license/provenance review remain necessary.
- Official October 8 notes confirm approximately +20% dungeon kill XP relative to prior Forever
  tuning and per-player ordinary level penalties; they do not publish an absolute XP formula.
  Current player reports are sanity checks, not a calibrated all-dungeon table. Need path-specific
  trash/boss counts and versioned payout estimates; eventual opt-in passive measurements can
  refine these without re-enabling the disabled bulk NPC/quest scanners.
- Preserve full per-player quest XP, apply no quest coefficient to combat, count overlapping kills
  once, never divide observed party XP again, carry real XP bars and level-ups continuously.
  Existing group-combat helper/ledger accept scenarios but default audits still supply no combat.
- Read-only source/local-data research and documentation only; no crawler interruption, production
  change, addon installation, provider publication, commit or deployment. Existing quest-XP
  collection continues independently. Private raw audit receipt under
  `artifacts/leveling/audits/2026-10-15/combat-research/`.
- Verification: 21 existing group-combat/campaign-budget tests passed, plus focused documentation
  formatting and `git diff --check`. These do not validate live-game XP or the planned adapter.

### Simplified dungeon XP planning policy (2026-10-15; preceding baseline)

- Use unscaled base XP × 2.375 once for unconfirmed/future dungeon quest rewards. Known collected
  final amounts still take precedence and are never multiplied again or replaced by the estimate.
- Required outdoor kills and dungeon clears are the assumed buffer if actual quest rewards use
  1.8/2.1 instead. This is a planning assumption, not a measured guarantee or fabricated XP fact.
  Do not build a compensation engine, require kill-by-kill evidence, add multiple coefficient
  scenarios or implement the earlier proposed fixed 0.3-level threshold merely to plan the route.
- Carry the XP balance forward and keep actual level/prerequisite checks. Offer efficient catch-up
  only if the party is actually short at a checkpoint; no preemptive grind detours for small
  estimate differences. Unknown quest identities/lifecycles remain distinct from reward estimates.
- Updated the binding product plan; documentation only, no runtime/deployment changes. This
  supersedes the earlier threshold/scenario proposals below without altering collected facts.

### Natural combat buffer for small quest-only deficits (2026-10-15; earlier discussion)

- Owner wants mandatory quest-objective kills and dungeon clears to cover small quest-only
  differences instead of adding unnecessary quest detours. Current forecast supports explicit
  combat scenarios but its default audit supplies none; quest-only XP is intentionally incomplete
  as a projection of all rewards earned while playing.
- The earlier proposed “0.3 of one level” threshold was not implemented and is now superseded
  by the simpler owner-approved baseline above. Do not add it as a new requirement.
- Carry balances continuously, assess the lagging member and kills available before each gate,
  do not forgive the allowance anew per chapter, and keep actual minimum-level checks. Actual bars
  reconcile the reserve; combat already in those bars is not credited twice. Unknown quest rewards
  and missing prerequisites are separate problems. Details in the binding product plan.
- Documentation only: no runtime/UI edits, deployment, threshold activation or new tests required.
  Collection continues independently under the existing full-archive worker configuration.

### Full RestedXP import and both-faction XP collection (2026-10-15)

- Owner expanded the intended guide to Alliance and Horde. Re-ran the authorized pinned importer
  from `/Users/dimitarjilanov/Desktop/restedxp-analysis` into the isolated
  `artifacts/leveling/audits/2026-10-15/both-factions/archive/`: 157 guides, 22,604 steps,
  2,394 original action quest IDs. All chapter/aggregate/provenance checks passed. Manifest SHA
  `43b8ce0a5286dadbaa89ea9b2d53e6ed328fca613ed5e33429151cf24c226fc5` exactly matches the
  existing production archive. Both factions were already imported/readable; XP collection was
  incomplete. No newer private bundle was silently substituted and no duplicate archive deployed.
- Added complete collection inventory and CLI: all factions, guide families, class/race/season
  branches, source actions and runtime references, plus all known dungeon identities/gates.
  This does not mark conditional work eligible or collection farms desirable in a premade route.
  Runtime argument positions were checked against the installed public addon functions; item IDs,
  objective numbers and reward choices are not mistaken for quest IDs. Optional negative hand-ins,
  daily alternatives and condition-only references are preserved, with per-step provenance.
- Full queue: 2,535 unique IDs, including 2,397 guide-referenced IDs and 299 known dungeon IDs
  (overlapping sets). It contains all 2,394 original archive IDs, all 1,419 previous priority IDs
  and all 106 previously omitted Alliance references. Three extra guide-only references recovered:
  742 (daily alternative), 1522 (condition), 5923 (signed optional hand-in).
- Queue SHA `336bb641f1c6e5a62ad1c91170d609c9bfbc75c32c1948811bbed6c20784f805`;
  new worker `crawl-20261015-r8-full-archive`. Serialized phases are recovery → original priority
  → full archive → original base. Independent archive checkpoint:
  `shared/archive-xp-336bb641f1c6e5a6-status.json`; active configuration:
  `shared/queues/reference-crawler-full-archive.config.cjs`. Recovery resumed at its saved cursor;
  no original queue/checkpoint was reset. PM2 saved. Guards/pacing/one worker unchanged.
- At 09:15 UTC the full queue's publication coverage was 349 available, 296 unknown, 1,890 not
  published, zero conflicts/expired; collection is not complete. A 3–4 day check-in window is
  reasonable at one-minute HTTP pacing with redirects, not a completion guarantee. Source access
  failures still stop safely. `pnpm leveling:xp:status:archive` distinguishes these states and
  validates queue/record checksums; details/commands in `docs/forever-leveling-archive.md`.
- Web/publisher remain r8 at unchanged PIDs 2871046/2871067; ingest PID 1169337 unchanged. Only
  the isolated crawler was replaced. No website build/restart, database, addon or player-save edits.
  Local verification: 192 leveling tests, 70 reference tests, 2 archive CLI integration tests,
  both strict typechecks/lints/builds and focused formatting. No commit/push requested/performed.
- Owner approves parity estimates for Drowned City/Krol'dok/Alcaz, anchored to Hall of Thanes,
  Ruins of Lordaeron and Dalaran. These may fund explicitly conditional planning scenarios; never
  fabricate quest IDs or insert estimated rewards into the verified XP archive. Full package sizes
  differ by anchor/faction; use template scenarios, not one claimed confirmed quest count. This
  policy is recorded in the binding route plan; its route/UI integration remains to implement.
- Verified old-dungeon facts are already scaled, using each page's own coefficient once. Collected
  examples: Stockade 378 = 2,750 × 2.1 → 5,800; Gnomeregan 2922 = 2,650 × 1.8 → 4,750.
  Legacy `estimateDungeonReward`/parity fallback still uses generic 2.375 in some cases and remains
  an estimate, not a universal Forever rule. Added regressions for distinct page factors and for
  the reward resolver preferring final scaled facts without another multiplier. Before route
  certification, replace/reconcile remaining legacy fallbacks against the full collected evidence.

### Repairing the 298 unknown quest rewards (2026-10-15; deployed, backfill running)

- Confirmed root cause with one permitted, durably paced capture: the source changed
  `global-core.js?52d4f803` to `global-core.js?97211824`. All 298 original unknown records have
  primary quest/minimum levels; the old parser incorrectly reported missing primary metadata
  alongside the real renderer-verification failure. The immutable display records do not retain
  scaling inputs, so most old unknowns cannot be repaired offline.
- Independently inspected both public core assets and the unchanged `quest.js?5f36c4ad`.
  `roundQuestXp` and `getMaxPlayerLevel` are byte-identical between core revisions. v2 accepts
  only these two verified renderer pairs, records the actual pair, and distinguishes missing
  edition/metadata from unverified renderer. Unknown future versions remain held, not estimated.
- Backward-compatible readers accept original v1 facts and new v2 facts. Fresh known facts remain
  cached; old unknown facts are refreshed once after the parser capability upgrade. A current-v2
  unknown does not cause an unbounded retry loop. Reuse only the validated same-entity canonical
  URL, avoiding the usual redundant redirect while retaining pacing and redirect/access checks.
- Helper web and publisher: `kfc-helper-xp-repair-20261015-r8`, Next build
  `Gp5T4j4uU0t9I8sWX_Y14`. Built from the actual active r7 with scoped reference-package changes,
  not the dirty monorepo. Compatible readers were activated before producing v2 records.
  Ingestion stays at PID 1169337 / its existing release; no database, player-save, route/UI or addon
  changes. No commit/push requested/performed.
- Worker: `crawl-20261015-r7-xp-repair`. One serialized recovery → original 1,419-ID priority →
  base sequence, with independent hash-bound checkpoints. Original priority checkpoint paused at
  cursor 648 and base at 746, preserved byte-for-byte while recovery runs. Same 60-second durable
  HTTP pacing, robots/429/503/denial/challenge stops, 384 MiB heap and 8 GiB/2 GiB storage guards.
- Frozen recovery queue has 317 IDs: the original 298 unknowns plus 19 newly affected records.
  Queue SHA `d3ba3ad0b531151fa4ec7026b8904cca0a1ea7bb9a90176471b384cffdcce07b`;
  configuration `shared/queues/reference-crawler-recovery.config.cjs`, checkpoint
  `shared/recovery-xp-d3ba3ad0b531151f-status.json`. PM2 configuration saved. At least roughly
  five hours of collection is required; this is not a claim that all 298 are already resolved.
- At 08:53:09 UTC the captured Red Crystal (4811) was repaired offline from its exact verified
  source bytes and published at 490 XP. Coverage increased from 328 to 329 available facts,
  645 total / 316 unknown / no conflicts. Existing known facts are not overwritten by unknowns.
  Updated counts must be read from the recovery status tool, not inferred from crawl cursors.
  At 08:56:10 UTC: 331 available / 314 unknown / no conflicts, with 3/298 original records resolved
  and 295 pending. Frozen post-activation receipt: `artifacts/leveling/audits/2026-10-15/xp-repair/`.
- `scripts/repair-leveling-quest-xp.mjs` prepares immutable deduplicated queues and reports the
  original cohort separately from newly found unknowns. It validates index/record schemas,
  checksums, identities and freshness, refuses output overwrite, and checks the expected cohort.
  See `docs/wowhead-reference-enrichment.md` for exact progress and safe-stop commands.
- Verification: 68 reference-data tests, 5 focused web tests, recovery-tool integration test,
  strict reference types/lint, focused format/lint, all 626 frozen records through the new reader,
  Linux production build/private preview and live real-XP browser/mobile/a11y suite passed.
  Full-route XP funding remains a separate failed content audit and pending route rebuild.

### XP-funded flexible-entry rebuild (2026-10-15; research/plan only)

- Owner returned the route's XP sufficiency for the seventh time and now explicitly permits entry
  flexibility near At-level. r7's preset appointments are not a complete funded route. Do not make
  another label-only or small-selection patch and call this fixed.
- The binding replacement is the new opening section of `docs/forever-leveling-product-plan.md`;
  fresh whole-route evidence and all 21 stops are in the opening follow-up of
  `docs/forever-leveling-full-route-audit.md`. Generate a continuous five-player route from the
  full legal source graph and complete dungeon packages, then derive chapters. Compare nearby
  dungeon windows/order; old requested levels become preferences, not fixed progression inputs.
- Independent arithmetic: Hall at 16 + 0 pays 13,300 reference quest XP, leaving level 16; adding
  the three unpaid map-chain rewards gives 15,940, still under the 16,000 next bar. The 19 target
  is a next-departure requirement, not a Hall exit. At 59, core Stratholme gives 31,500 against a
  209,800 bar; dungeon-only 45–60 and a one-clear finish are not established.
- Re-froze published XP at 08:01:28 UTC: 626 validated records, 328 available, 298 unknown, no
  recorded conflicts. Human/warrior: 294/334 scheduled hand-ins have available typed facts.
  All unknowns share parser-verification errors; existing diagnostics also conflate renderer and
  primary-data failure. More crawling alone has not increased the 328 numeric facts. No worker
  configuration, parser code or collection policy was changed by this research.
- Fresh audit: 33 editions, 132 policy/raid cases, 6,000 independent checks; 912 blocked,
  3,172 incomplete, 1,832 shortfall, 84 reference-covered. `--require-covered` exits 2.
  Evidence: `artifacts/leveling/audits/2026-10-15/entry-plan/`; semantic audit SHA
  `97739d108a29c4050bfbd66dccd437999d572affbc2da5198eb48edc073ec98d`.
- Additional source found read-only: local `questcache.wdb` is no longer empty. 65,220 bytes,
  header build 70374/enUS, 61 bounded records including all five Hall IDs; SHA
  `165882299afc09db14330f221ca0df487eb0df25442c4bb8c930a95d3d8e2889`. Frozen privately with the
  audit. Record envelopes were checked; XP/restriction fields are not decoded or authoritative yet.
  Installed RXP is now v4.11.23; do not replace the frozen authorized guide on that basis.
- Research verified Blizzard's October 8 dungeon-kill XP and mixed-level party rule changes and
  the current dungeon guide's City of Dalaran At-level 31. Keep difficulty, hard quest/access
  minima, per-quest hand-in scaling and per-member combat penalties separate. Solo-XP/5 remains
  a conservative owner-specified scenario, not a measured complete server formula.
- Planned complete-route publication requires a full compiled event artifact, all five per-member
  ledgers, all requested-module inclusion/gap reporting, an independent XP oracle, the full profile
  matrix and browser/RestedXP parity. Drowned City/Krol'dok/Alcaz remain unresolved, never free XP.
  No runtime implementation, addon change, database write, crawler restart, commit/push or new
  deployment this turn. r7 stays live; the substantive correction is still to implement.

### Verified library deployment (2026-10-15)

- Code committed and pushed to `origin/main`: `6429682` (campaign/library integration and previously
  deployed leveling/quest-XP foundation), then `418f25f` (dungeon-fact formatting). Unrelated market,
  ingestion, catalog-guardian, SEO, addon and local-document changes remain untouched in the worktree.
- Live Helper release: `kfc-helper-library-20261015-r7`, copied from the actual r6 baseline and
  overlaid with 30 changed leveling/web source and test files. Existing catalog, dependency,
  environment, native/world data and media baselines were preserved. Linux leveling build/types and
  webpack production build passed; Next build ID `q2Z_3OjlJDvL3BZ9WDNgh`. Standalone static/public
  contents were copied into their correct nested roots. No migration or native-data publication.
- Local verification: 186 leveling, 61 reference-data, 215 web and 6 world-data tests (468 total),
  strict types, focused ESLint/formatting, all 33 source-flow variants and preservation of 26,878
  original action identities passed. Existing unrelated pacing-file formatting was not changed.
- Private three-scenario coverage checks passed for a real inserted library action, underlevel
  departure, unknown XP, read-only refresh, exact-step reload, 390/320 px and WCAG A/AA. Public
  navigation/progress, real published XP and compact-preparation browser suites passed, as did 12
  public HTTP routes. Both Traders remain usable without catalog-review/database warnings.
- The preview initially omitted the reference directory because production supplies it through PM2,
  not `web.env`; corrected the private environment and reran XP checks. Browser fixtures now report
  completed objectives before hand-ins, provide actual party bars through Settings before gated
  pickup, and assert target labels rather than the retired misleading gain ranges. Runtime guards
  were not weakened to make the checks pass. Browser tests only wrote isolated browser-local saves.
- Only `kfc-helper-web` reloaded: PID 2862455, restart count 107. All 21 other PM2 services retained
  their PID/status/restart counts, including ingestion, guild, crawler and publisher. PM2 was saved.
  The private preview/tunnel were stopped and port 19214 closed. Removed only the candidate's
  regenerable 396 MiB Next build cache; production assets and rollback releases remain intact.
  Root disk is 75% used with 19 GiB free.
- Crawler remains on its frozen 1,419-ID queue and existing PID 2857530; at 07:52:53 UTC it had
  completed 260 records (242 cached, 18 fetched), with no job error. These are processed references,
  not 260 verified quest-XP facts. Collection and publication continue without website rebuilds.
- This is a review deployment, not certification of a funded/playtested 1–60 route. The frozen
  full-route coverage gate still fails honestly; missing rewards, prerequisites, travel/combat
  measurements and dungeon bundles must be resolved before certifying/exporting RestedXP.

### Kill-first source-library route integration (2026-10-15; deployed review edition)

- Implemented the owner's request to use the full supplied quest pool, rather than only offering
  extra quests in a suggestion panel. `campaign-library.ts` reads applicable source chapters at
  the selected race/class/1x profile; `campaign-library-route.ts` inserts selected full quest
  lifecycles and source-chain lead-ins into the existing chapter flow. Old release/save identity,
  chapter links, participant ownership and all 26,878 original action IDs remain compatible.
- Selection prefers explicit NPC kill counters/shared-kill instructions and named trophies.
  Collection farms, unsupported/class-specific conditions, incomplete lifecycles, long optional
  courier chains and dungeon quests misidentified as outdoor work are held with reasons. Required
  dungeon chains may retain their necessary collection steps. Nearby short interactions/returns
  require same-map/floor source coordinates within 12 map-percentage points; delivery-only roots
  also need pickup/return within eight steps of the same chapter. This is a spatial authoring
  heuristic, not measured travel time or a global speedrun optimum.
- Human/general gains 28 quests (310 total distinct scheduled hand-ins, 900 actions); Human/warrior
  gains 36 (334 total, 966 actions). Warrior additions include 19 shared-kill roots, 7 named-trophy
  roots, one nearby interaction and 9 prerequisite quests. Example families: Worgen in the Woods,
  Ormer's Revenge, named Redridge targets, Felwood/Timbermaw and Plaguelands kill work. 254 warrior
  collection-farm candidates remain held. These counts are not proof of funding every level.
- Dungeon gains/overflow continue through the per-player ledger. Unstarted optional work is skipped
  once every fresh actual bar meets its target; accepted chains and required unlocks remain.
  Nothing grants actual XP. Named-trophy forecasts explicitly remain unverified until loot/credit
  is established; no guaranteed drop, single-kill completion or respawn time is inferred.
- Expanded XP collection is **running**, using existing `crawl-20261014-r6-xp` code and PM2 worker
  `kfc-helper-reference-crawl` (358), PID 2857530 after scoped reconfiguration. Frozen active queue:
  1,419 unique source-backed quest IDs, including all 614 original IDs; SHA
  `1e25e00fcd345e03cba14f3aa3e3fae78fb1c92cf63ba0db881438989e827e8b`.
  Checkpoint: `/home/wow-trader-reference-worker/shared/priority-xp-1e25e00fcd345e03-status.json`.
  At 07:23:46 UTC: cursor 156, 152 cached, 4 crawled, no job error. One worker, 60-second durable
  pacing, 384 MiB heap, 8 GiB reserve/2 GiB staging cap and source-access stops are unchanged.
  Old priority/base checkpoints and pacing/cache were preserved; PM2 list saved. No concurrent crawl.
- `pnpm leveling:xp:queue --library --destination=<directory>` generates the expanded inventory.
  Default generation intentionally retains the old 614-ID contract. The final local generator
  produces the same 1,419-ID set with refined ordering, SHA
  `84d8b04476efe3997b27817c68507887ae28ea754158af42eaf47d71ef2dec49`.
  Do not overwrite the active frozen queue or reuse its checkpoint with a different hash. Active
  and rollback PM2 configurations are under `shared/queues/reference-crawler-*.config.cjs`.
- Final frozen-input audit: 33 variants, 132 scenarios, 6,000 chapter checks; semantic SHA
  `0e5a3e1a934c7246ea4b87f5d73ac90202142a7f8e66668ab4903b681035f44c`, artifact
  `artifacts/leveling/audits/2026-10-15/library/campaign-xp-audit-0e5a3e1a934c7246.json`.
  Coverage remains false: 908 blocked, 3,176 incomplete, 1,832 shortfall, 84 reference-covered
  independent checks. Extra unknown rewards increase incomplete counts; this is not a zero-XP
  verdict or a sum of real journey deficits. Full reward/lifecycle, new-zone travel and combat
  validation, missing dungeon bundles and playtesting still remain before certification/export.
- 186 leveling and 215 web tests, strict types, scoped lint/format, production webpack build,
  33 source-flow/lifecycle checks and save compatibility passed. Browser coverage includes a real
  inserted library step, underlevel entry, read-only refresh, exact-step reload, mobile and WCAG.
  Workflow: `workflow-20261015-v4`; source selection: `source-backbone-20261015-v1`; XP ledger:
  `checkpoint-ledger-20261015-v3`. Subsequently committed, pushed and deployed in r7; see the
  verification receipt above. No database migration or real-player progress modification.

### Use the full source quest pool to complete the premade route (2026-10-15; research/selection brief)

- Owner challenged the remaining deficits: the supplied solo guides reach 60 without requiring
  dungeon XP, so use their omitted quests rather than treating the current trimmed selection as
  the whole library. Prefer a moving shared-kill route; avoid low-drop personal collections where
  possible. Named-target head/trophy quests are candidates, not automatically collection farms.
- Read-only inventory for Human warrior, 1x, solo/no-dungeon reference view: 44 eligible reference
  chapters contain 951 distinct hand-in IDs. 748 are absent from the current premade campaign.
  This includes alternative chapters and chain deliveries; it is a candidate pool, not 748
  independently eligible efficient quests. The campaign has 298 hand-in IDs including dungeon work.
- In the frozen October 15 04:47 UTC published snapshot, only 6 of those 748 unused source IDs have
  available typed XP facts; 742 do not. The existing crawler queue was built around the trimmed
  route. Missing reward evidence is not evidence that additional source quests do not exist.
- The same source view has 44 steps explicitly mentioning grinding. A solo guide without dungeon
  XP is not a quest-hand-in-only proof: it still receives full solo combat XP, unlike the owner's
  conservative five-player solo-XP/5 planning rule.
- Correct next implementation direction: use full eligible source chains as the quest backbone,
  attach the approved At-level dungeon appointments, carry cumulative incoming XP/overflow, then
  remove unnecessary XP-only batches while preserving future dungeon prerequisites. Do not add
  up independent empty-bar chapter deficits or assume every dungeon grants exactly one level.
- Replace the broad collection exclusion with reviewed objective categories: shared kill counts;
  named targets; bounded/reliable trophies; low-drop multi-item farms; uncertain objectives.
  Verify each trophy's drop/credit behavior and all five personal quotas; never infer guaranteed
  drops or one-kill-for-all merely from the quest title. Prioritize geographically overlapping
  kill batches, necessary unlocks and on-route turn-ins; retain a nearby reserve for actual XP gaps.
- Expand reward collection for the selected additional chains before declaring the rebuilt route
  funded. Phase/access, race/class gates, dependencies and travel remain selection constraints.
  Research only this turn: no new runtime implementation, crawler mutation, commit or deployment.

### Whole-route XP repairs and five-player budget checks (2026-10-15; local, not deployed)

- Implemented the October 14 audit's progression repairs: the early level-16 override no longer
  skips later XP phases; live controls and forecasts share conservative pickup minima and known
  prerequisites; each member stops at an impossible pickup, missing stage or dungeon departure.
  Future dungeon rewards/combat cannot pay for entering that dungeon. All modeled objectives must
  precede their hand-in, already-paid rewards remain paid once, and predictions never award actual XP.
- Owner clarified the intended five-player assumption: combat credits one fifth of solo XP to each
  member, while eligible quest hand-ins retain their full reward. `group-combat.ts` applies this only
  to explicit unique kill activities. Unknown combat is excluded; faster shared camp clear time
  does not multiply XP, kill quotas or quest payouts. This is a conservative planning assumption,
  not a calibrated Forever server formula.
- Chapter cards and the reader now use the same sequential per-player ledger and target resolver.
  Independent authoring budgets explicitly assume prior prerequisites/empty entry bars, distinct
  from the player's actual continuous forecast. Blocked exits/gaps remain unresolved. Authored
  ranges are target/entry labels, not promised level gains; dungeon entry and next departure are
  separate. Compact reader diagnostics do not replace the ordered quest list.
- Complete additional source-backed quest batches can be added/removed in XP phases. Recommendations
  require fresh bars for all five, eligible known rewards/minima, matching source regions and pure
  shared-kill objectives. Conditional, collection, item-use and ambiguous mixed objectives are held.
  Source-chain returns stay prerequisites. Selection, refresh and removal preserve actual bars,
  completed checks, quest history and existing save/release identities.
- Reproducible audit receipt: `docs/forever-leveling-full-route-audit.md`. Frozen published index
  `2026-10-15T04:47:40.237Z` contains 534 records, only 328 available XP facts. All 33 variants,
  132 policy/raid scenarios and 6,000 independent chapter checks ran. Statuses: 1,126 blocked,
  2,300 incomplete, 2,310 shortfall, 264 reference-covered. These are scenario/chapter counts,
  not unique quests or evidence of continuous playable coverage.
- Coverage gate remains **false**.
  `pnpm leveling:xp:verify --destination=<directory> --rewards=<published-root>` exits 2 on missing coverage. It requires every relevant member's
  supported cumulative progress, not just Player 1 or a group average. Final semantic audit SHA
  `34f80f850da3cbc95e96070e2a5f44d87ce5ad27d5069e974ef9e578cdeb290e`;
  artifact/snapshot/queues: `artifacts/leveling/audits/2026-10-15/` (ignored by Git).
- Prepared `leveling:xp:queue --catch-up`: 638 IDs, SHA
  `2cb94970b54f31c642fd41f9d5da5a8483b37b019fac4b31dc8ae263ee596eb8`.
  The existing 614-ID queue/hash is unchanged. No crawler reprioritization or restart was performed.
- Still required: enough evidenced quests/combat to fund every transition, complete server-side
  prerequisite/lifecycle evidence, the three missing dungeon bundles, live curve/combat observations
  and playtesting. The route is not a completed XP-certified 1–60 plan or finished RestedXP export.
  Workflow revision is `workflow-20261015-v3`; ledger revision is
  `checkpoint-ledger-20261015-v2`; existing save identities and 26,878 original action IDs survive.
- Verification: 172 leveling and 215 web tests, strict typechecks, scoped lint/format, all 33
  source-flow projections and r6 save compatibility passed. Browser regressions passed under
  webpack: entry blockers, read-only reward refresh, exact-step reload, compact diagnostics,
  target/entry labels, 390/320 px layouts and automated WCAG A/AA. Default Turbopack preview hit
  an installed `next/font` internal resolution error; no font/config workaround was committed.
  Production webpack build passed compilation/types, 59 static pages and tracing with a process-local
  3072 MiB heap. The temporary local preview is stopped. No commit, push, deployment,
  migration, real-player progress write or production service change was made this turn.

### Whole-route XP and feasibility audit (2026-10-14; analysis only, corrections pending)

- Owner reported the 20–26 Redridge/Duskwood/Wetlands chapter showing just 18,660 XP and requested
  an audit of every section, not one-by-one fixes. Full findings and prioritized correction plan:
  `docs/forever-leveling-full-route-audit.md`. The current campaign is not a certified 1–60 route;
  previous software/UX checks must not be presented as proof that the itinerary supplies its levels.
- Audited all 33 implemented Alliance race/class projections: 1,500 chapter instances, 132
  cumulative Player-1 difficulty/raid scenarios, five-player isolated section diagnostics and
  1,386 independent dungeon-handoff scenarios. Other members' personal starter branches are not
  inferred from Player 1. No Horde premade campaign or full in-game playthrough is certified.
- All 59 code leveling requirements match the extracted build-70205 Total column. 20→26 requires
  170,800 from an empty level-20 bar; 18,660 covers 10.93%, less than the first 23,200-XP level.
  Dark Iron War (303) has published 2,450 XP but requires 25; resolving the entire card at 20
  mislabels this pickup-context failure as an unknown reward. Incoming dungeon XP and combat
  must be modeled separately, not used to assume the remaining gap is filled.
- Confirmed critical shared control bug: `sourceActions` assigns `xpTargetLevel: 16` to later
  source-backed XP bridges. `campaignOptionalXpReady` can then skip still-needed Redridge,
  Duskwood, Searing Gorge, Burning Steppes and final catch-up work. Reproduced 1,780 wrongly
  skippable quest-action instances across 33 projections (54 in Human/general). Not fixed yet.
- Confirmed forecast/live-controller mismatch: Stockade at level 25 + 20,000 XP is blocked by
  actual entry checks, but the simulator credits later dungeon rewards and reports `covered`
  at 26 + 10,900 without reporting the earlier level-26 entry violation. Not fixed yet.
- Default At-level policy conflicts with displayed requested levels: Ruins 19/18, Excavation
  29/27, Dalaran 31/30, LBRS 60/57 and Stratholme 60/59. Three stops still have no usable quest
  bundle; 43 selected dungeon records have unknown lifecycle metadata. There are 11 conflicting
  pickup-minimum claims. No calibrated combat/route-time budget or deficit-closing content solver.
- Frozen published XP index `2026-10-14T19:24:40.309Z`: 256 validated numeric records, covering
  248/584 distinct scheduled hand-in IDs across all branches (235/282 Human/general). The existing
  crawler continues independently; this audit did not reprioritize/restart it or fetch extra quests.
- Full ignored local artifact:
  `artifacts/leveling/audits/2026-10-14/whole-route-audit-2071569f75fe6529.json`, semantic payload SHA
  `2071569f75fe6529eda98fece9956d52efb473ea4c4c08ad9d36e702f626d05e`.
  Frozen evidence is beside it in `reward-snapshot/`. The existing cumulative audit output is
  `campaign-xp-audit-4ecbb41d45441e07.json` in the same directory. Every cumulative final XP remains
  unresolved; this is not evidence that actual combat gives zero XP.
- Six governing local source files match production SHA-256. All 33 real-source flow checks and
  143 leveling tests pass, but the semantic defects above and overall budget gaps remain. Work
  changed documentation/audit artifacts only; active release remains r6. No runtime edits,
  database writes, service restarts, deployment, commit or push. Next work is the correction plan,
  beginning with skip targets and action-time entry feasibility, then the complete evidence/combat
  ledger and named deficit-closing batches for every checkpoint.

### Zone-first chapters and compact preparation (2026-10-14; implemented and deployed)

- Owner requested zone chapters rather than multiple levels labeled as dungeon preparation.
  Active release: `kfc-helper-zones-20261014-r6`, copied from the actual r5 baseline with 11 scoped
  source/test files overlaid. Only Helper web was reloaded after private verification; r5 remains
  the immediate rollback. Crawler, publisher, ingestion and guild services were not restarted.
- The public section model now has geographic titles, `zone` kind and contiguous area subsections.
  Human 13–16 is “Westfall → Dun Morogh”; the Stockade bridge names Redridge, Duskwood and Wetlands.
  Internal phases remain ordered beneath those areas, without extra overlapping level ranges.
- A shared collapsed “Before [dungeon]” checklist shows existing known prerequisite/pickup steps,
  per-player reported states and actual XP readiness. It cannot grant progress or claim an unknown
  bundle verified. Only required states found in the selected section become checklist links.
  The existing source chains and coordinates remain authoritative; geography is display metadata.
- Optional catch-up is collapsed only when the existing execution predicates deem every action
  unnecessary. Required pickups in mixed XP phases remain visible. No new skipping/XP rules.
- 143 leveling + 214 web tests (357), local strict type/lint and Linux production builds passed.
  All 33 real-source projections passed. The new `--presentation-only` compatibility audit
  proves identical executable plans, chapter IDs/brackets/ownership and XP forecasts against r5,
  preserving 26,878 action identities. The build host's inherited 384 MiB runtime heap was too
  small for a cold standalone web typecheck; rerunning that check with a process-local 1536 MiB
  heap passed. Production runtime limits remain unchanged. No core dump was created.
- Five private browser suites passed; consolidation, integration and real-XP checks were rerun
  after the final heading-hierarchy refinement. The extended geography suite also checks the long
  Stockade title at 390/320 px. Automated WCAG A/AA, legacy navigation and save/report checks pass.
  The integration test now awaits the target chapter URL and its streamed title before its audit;
  a nonempty previous-dashboard title did not prove the new reader's metadata was ready. No
  production metadata setting was changed to avoid that timing race.
- No migration, dependency change, native-data write, crawler/publisher/ingestion/guild restart,
  commit or push was part of this refinement. Full 1–60 XP sufficiency and RestedXP export remain
  separate validation work; the geographic labels do not certify either.
- Public geography/consolidation, navigation/integration and real-XP browser checks passed after
  activation, as did 12 public routes and both Traders without catalog/database warnings. Web PID
  2750617, restart count 105. Publisher 2742521 and crawler 2732022 retained their PIDs. PM2 saved;
  the temporary preview and SSH tunnel were stopped and loopback port 19214 was closed. Root disk
  is 74% used / 20 GiB free. Twenty other services retained their PID/status/restart counts.
  Separately, `ai-cv-api` performed a graceful cluster replacement at 13:00 UTC (exit 0/SIGINT),
  is online at PID 2750984/restart 1971, and was not targeted by any task command. Kernel logs show
  no OOM kills in the build/deployment window; available RAM was 4.9 GiB at the final check.

### Priority quest XP pipeline and cumulative forecast (2026-10-14; implemented and deployed)

- Live website release: `kfc-helper-xp-20261014-r5`, built from the actual r4 baseline with only
  scoped reference/leveling changes. Only Helper web and its reference publisher were reloaded.
  The independently pinned ingestion application and guild applications were not changed.
- Literal-only parsing now reads primary quest metadata plus Wowhead's scaling-reward configuration.
  The inspected renderer revisions `quest.js?5f36c4ad` and `global-core.js?52d4f803` establish the
  multiplier, overlevel reduction and rounding order. For example, quest 9 resolves to 1,050 XP
  at level 13; quest 214's 1,250 base becomes 2,950 full reference XP and 2,400 at level 23.
  Already-adjusted Forever rewards are never multiplied by the dungeon scenario coefficient again.
  Missing/changing renderer revisions, absent numeric payloads and conflicting claims stay unknown.
- XP artifacts are separate from display references and native catalogs: `quest-xp-evidence.v1`,
  checksum-addressed files and `shared/published/quest-xp/index.json`. The existing publisher validates
  current-client identities and publishes them continuously without a database migration or writes.
- Isolated crawler release `crawl-20261014-r6-xp` is running a deterministic 614-quest priority queue
  (304 Human IDs first), followed automatically by the unchanged 60,614-record base queue. Priority
  checkpoint: `shared/priority-xp-32bec0be2d118c31-status.json`; queue hash begins `32bec0be2d118c31`.
  The base cursor remains 746 during priority work. One worker, durable 60-second HTTP pacing,
  source-access stops, 384 MiB heap, 8 GiB disk reserve and 2 GiB staging limit remain in force.
  An exact same-edition `301 /quests?notFound=ID` is now quarantined like a 404; all other unrelated
  redirects still stop. At 11:36 UTC, 24 usable XP facts had published; counts continue to increase.
- `forecastCampaignXp` replays each player's saved current action and fresh actual XP, carries
  overflow across chapters, resolves each reward at its predicted hand-in level and pays a quest
  only once per player. Pickup/hand-in level gates, required hand-ins and unverified bundles are
  visible. Leader-only steps do not grant the other four players the leader's rewards. Unknown
  rewards propagate unknown future hand-in levels, endpoints and gaps; stale/invalid bars require
  input. Forecasts and data refresh never write actual progress or unlock completion gates.
- The existing Human route now has published-reward coverage and collapsible per-player XP tables
  with individual reward/source/level breakdowns. XP data refresh requires no site rebuild.
  Reference, historical estimate and unknown are distinct; all default forecasts exclude combat.
  Stratholme's default scope is the four core quests; Of Love and Family (5848) stays optional.
- Maintainer commands: `pnpm leveling:xp:queue -- --destination=<directory>` and
  `pnpm leveling:xp:audit -- --destination=<directory> --rewards=<published-directory>`.
  See the enrichment runbook for full flags and runtime paths. The server audit at 11:36 UTC
  covered all 33 editions with 24 XP facts; receipt `shared/reports/quest-xp/`
  `campaign-xp-audit-a9dcd2e5db11ce20.json`. This quest-only authoring scenario is not a certified run.
- Verification: 61 reference + 140 leveling + 214 web tests (415), strict TypeScript/lint and Linux
  production builds passed. All 33 real-source projections passed; compatibility preserved 26,878
  action identities without retiring any. Five private browser suites passed, including real XP,
  read-only refresh, progress/navigation regressions, 390/320 px layouts and automated WCAG A/AA.
- Public real-XP, consolidation and integration browser checks passed, as did 12 public routes
  and both Traders without catalog-review/database warnings. Corrected the release's nested
  standalone public-assets copy; the logo now returns HTTP 200. Activation now requires that
  exact asset path. A regression also proves an unknown refresh cannot erase a held XP conflict.
- Final 11:51 UTC check: priority cursor 31 / 614, no error, 31 available published XP records,
  zero unknown/conflict records in that snapshot. Continuous publication advanced without a site
  rebuild. Helper web PID 2741457, publisher PID 2742521 and crawler PID 2732022 were online.
  All 20 unrelated services retained their PID/status/restart counts during website activation.
  PM2 was saved; the temporary preview and SSH tunnel were stopped, and port 19214 was closed.
  Root disk: 72% used / 21 GiB free. Local maintainer audit also passed all 33 editions with a
  frozen 29-fact snapshot. Source edits remain local; no commit or push was requested.
- Still required: finish/review the source queue and missing prerequisite/restriction facts; measure
  per-player combat and travel; use proven deficits to select efficient nearby top-up batches;
  compile and import-test the complete RestedXP export. Mixed-race personal starts need their own
  saved bars/history. Full 1–60 sufficiency and optimal time are not certified by this delivery.

### Priority Wowhead XP and proper coverage calculation (2026-10-14; pre-implementation research)

- Owner proposes prioritizing Wowhead quest rewards. The implementation-ready data/queue/simulation
  plan is in `docs/forever-leveling-product-plan.md`, “Priority quest-reward ingestion and cumulative
  XP coverage.” It extends the existing circuit's evidence tiers, rather than replacing them with
  a blanket quest multiplier. Only documentation changed; no crawler/production mutation.
- Source audit generated 304 distinct action quest IDs for Human general; 614 across all 33
  Alliance race/class editions, including 584 distinct hand-in IDs. Of those hand-in identities,
  510 lack a usable reward in at least one current context. Counts precede extra prerequisite closure.
- Production crawler is stopped at cursor 746 / 60,614 on `forever-quest-260`; October 13 12:09:29
  UTC checkpoint error is `Source redirected outside the permitted entity`. It was not restarted.
  Staging has 248 quest records; 86 match the campaign union (72 Human), with zero usable numeric
  XP fields or XP text in their normalized rewards. Existing complete reference status is not XP-ready.
- Prioritize reviewed early Human/gate/reward IDs via a separate hash-bound priority queue and
  checkpoint on the same serialized worker; preserve base cursor, global pacing and access checks.
  Inspect the blocked redirect first. Existing fresh cache records need XP-capability/version checks
  and selective refresh; prioritization alone does not repair the current text-only quest parser.
- Normalize amount/table plus source/hash, before-hand-in level/modifier context, semantic basis
  and effective patch/build claims. Separate XP evidence artifacts avoid breaking strict display
  reference records or altering native catalogs. Actual Forever rewards are not multiplied again;
  unknown/selected-level/page-history amounts must not be mistaken for full neutral rewards.
- Replay the same executable order per player with cumulative XP/overflow, individual prerequisite/
  level/quest eligibility and one-time hand-in identities. Quest-only coverage and combat scenarios
  stay separate; hand-in-level reductions update as the forecast levels change. Shared objectives
  count combat once, while staged objectives/personal loot keep distinct work. Preserve actual save
  values; predictions never grant progress. Choose complete nearby batches to close measured gaps.
- Rechecked official October 1 quest-bonus recalibration and October 8 approximately 20% dungeon
  combat buff/party-level correction. Reward and combat rules need pinned separate revisions;
  source capture dates do not certify an exact client build. The observer needs before/after level
  context, not just its current post-event level. Full 1–60 sufficiency is still unproven.

### XP coverage audit (2026-10-14; pre-implementation diagnosis)

- Owner challenges whether the listed quest/dungeon route actually supplies its advertised levels.
  Recalculation confirms the public ranges are authored targets, not validated earned-XP coverage.
  The source/compatibility/browser tests do not prove the route delivers enough XP.
- Human preparation 13→16 needs 38,700 XP from an empty level-13 bar. All 17 selected hand-in
  rewards are unknown to the current `premadeReward` resolver. Outdoor source archives contain
  quest IDs/instructions, not resolved reward amounts; most outdoor chapters therefore show no
  calculable subtotal, which must not be interpreted as zero real rewards.
- At requested entry levels and before combat/outdoor rewards, the current core estimates are
  Thanes 13,300 versus 33,700 needed for 16→18; Deadmines 15,650 versus 170,800 for 20→26;
  Maraudon 55,000 versus 135,100 for 48→49; the actual four-quest campaign Stratholme scope
  76,700 versus 209,800 for 59→60 (not the older five-quest reference forecast of 92,400).
  These subtotals mix reported/reference and estimated rewards, not guaranteed current-game XP.
- No numeric five-player outdoor/dungeon combat budget or cumulative 1–60 coverage simulation
  currently proves the missing amounts. The 2.375× ordinary dungeon coefficient is explicitly
  a planning estimate, not a verified universal server formula; do not apply it to world quests.
- Next required work is quest-reward resolution, per-player cumulative XP/hand-in-level and
  eligibility simulation, explicit group-combat estimates and deficits/top-up plans at every
  checkpoint. Missing rewards/three unverified dungeon bundles remain unknown. No product change
  or deployment was made by this diagnosis.

### Level-13 chapter consolidation (2026-10-14; deployed and publicly verified r4)

- Owner reports three competing level-13 cards on the integrated Human route. Live browser/source
  inspection confirms `start-125` (Westfall 13–15, 28 actions/13 quest IDs), `early-party-kills`
  (conditional XP 13–16, 10 actions/4 IDs), and `ironforge-rendezvous` (required prep 13–16,
  4 actions/1 ID). They are sequential internal phases, not three route alternatives. The dashboard
  previously promoted every leg to a full chapter. Their displayed bracket XP targets were 24,300,
  38,700 and 38,700 respectively: overlapping requirements, not additive earned quest XP.
- This is not just presentation. Quests 9/12 reappear from Westfall in the party XP phase, 432/433
  reappear from the earlier starter source, and 96391 reappears in rendezvous. Deduplication keys
  distinguish leader and all-five scope; the reward-state ledger avoids a second payout, but the
  reader still repeats tasks. Human source 116 also includes the trogg/map material and an early
  96393 pickup, so moving cards without reconciling source ownership/travel would hide the issue.
- Proposed presentation: one public 13–16 chapter, “Prepare for Hall of Thanes,” with clearly
  marked required unlock/pickup/travel phases and conditional nearby XP work. Keep the level-16
  dungeon as the next major chapter. Resolve the exact geographic order from source waypoints;
  do not require a Westfall→Dun Morogh→Westfall detour or the entire old solo chapter by default.
- Proposed route work: reconcile already-earned quest states per member; maintain a single
  lifecycle/objective identity and distinguish eligible unfinished members from a reported leader
  completion. Finish required preparation and recheck fresh actual XP before prescribing remaining
  filler. Preserve required acquisition/use steps for unlock items such as the Dark Iron Map.
  Unknown bars/eligibility/reward evidence are not zero gaps or assumed completion; existing mixed-
  race membership is not fully modeled and needs explicit personal-branch/manual readiness checks.
- Project public sections/phases and one flattened executable order from the shared route model,
  not a JSX-only group for this one level. Compute one chapter XP gap from actual bars and count
  distinct remaining rewards separately; keep travel/preparation time distinct from XP/hour
  scenarios. Audit similar overlaps across all 33 race/class projections, not only Human.
- Preserve stable action/source anchors and old bookmarks. Any action moves or ownership changes
  need explicit version/migration validation; never automatically transfer a leader completion to
  the whole party. The same conditional order must feed the later RestedXP compiler.
- Acceptance: one 13–16 card, no repeated earned quests/rewards, all-five actual-level/unlock
  gates intact, no filler when ready, no lost future chains, monotonic public progression, and
  regression checks for Next/Done/reload/deep links/partial-party and mixed-race states.
- Implemented shared `campaignSections` and conditional quest/XP helpers. The Human/Dwarf/Gnome
  route now has 46 public chapters, Night Elf 45 and Skyborne 44, all retaining 21 dungeon stops.
  Internal phases remain stable, but related preparation/XP work is one public chapter; dungeons
  are entry-level events, not another repeated bracket budget. Per-player deficits use the fresh
  actual bars (maximum gap, not five-player sum); unknown/stale bars require input.
- Existing action/save identity is retained. Execution revision is `workflow-20261014-v2`.
  Old chapter IDs resolve to their containing public section. Retired early map/Westfall-filler
  bookmarks map to a real preparation/readiness step, without copying a leader completion into
  party progress. Required map source goals moved out of the early Human starter; additional
  Farsen/spy goals have new suffixed IDs so an old check cannot claim them completed.
- Reports target each still-needed participant/stage, preserve already accepted/completed states,
  and never award XP. Automatic Next/Done bypass satisfied quests and unnecessary XP tasks;
  unknown XP does not imply readiness. Required dungeon/preparation quest rows remain active even
  inside XP phases, including explicit skip. Actual Stockade pickups are retained in Redridge/
  Duskwood using their verified quest IDs; personal class-conditioned instructions are kept.
- New repeatable browser regressions cover the one level-13 card, partial-party reports, stale
  XP/readiness gates, source map item-use text, old phase/retired step links, continuation and
  390/320 px accessibility. All 33 real-data projections pass one-time action ownership and
  non-decreasing public level order. No database, addon, commit or push change.
- Verification passed 131 leveling + 211 web unit tests, strict TypeScript/lint, production
  builds and all 33 source projections. The previous-release compatibility audit confirms 26,614
  preserved action identities and 238 valid retired-bookmark aliases across the 33 editions.
  Four browser suites passed against the private production build: consolidation, integration,
  original solo chapter tree and compatible campaign reader. Public consolidation/integration
  checks passed, including partial-player reports, stale XP, conditional Next, bookmarks,
  reload, Back/Forward, 390/320 px layouts and automated WCAG A/AA audits.
- r4 copied the actual live r3 baseline and overlaid 17 checksum-matched scoped source/test/docs
  files. Only Helper web reloaded; configuration, lockfile, credentials, archives, catalogs,
  databases, ingestion and guild stayed unchanged. Twelve existing public routes returned 200;
  the exact Human URL has one `prepare-thanes` card and `workflow-20261014-v2`. Forever Trader
  has no catalog-review/database warning. The initial smoke list incorrectly used a nonexistent
  `/forever/leveling/setup`; the verified setup URL is `/forever/leveling`.
- Live Helper PID 2707925 / restarts 102 after one activation reload (baseline 101). Ingestion
  remains PID 1169337 / zero restarts; guild remains PID 2507624 / 93. Runtime heap remains
  384 MiB and PM2 memory guard 600 MiB. Private preview PM2 app deleted, PM2 saved, SSH tunnel
  and isolated local dev stopped, generated next-env imports restored. r4 is 948 MiB; disk is
  71% with 22 GiB free. No retained releases or user data deleted.
- r3 preserves existing saves but lacks new consolidated chapter URLs. Its old individual-phase
  URLs and `/premade` reader remain the rollback surfaces. Keep browser backups. Gameplay/travel
  validation, mixed-race personal branches, three unverified dungeon bundles and the full
  RestedXP campaign compiler/import remain outstanding; consolidation is not an optimality proof.

## Implemented

### Premade quest route integrated into the existing chapter flow (2026-10-13; deployed r3)

- Owner rejected a separate linked campaign. The existing Alliance race dashboard now projects the
  campaign's ordered 1–60 chapters, and its `chapters/premade-{legId}` pages reuse the fixed-map/
  scrolling reader. It is the same campaign/action/source model, not a copy or redirected directory.
- Bare Alliance race URLs show the revised review route. Setup five-player Alliance groups select
  `?plan=premade`; solo/small-group setups select `?plan=questing`. The in-page edition selector
  retains the original outdoor route. Horde stays unchanged. `/premade` remains compatible for
  existing bookmarks, with `/premade/dungeons` as the detailed evidence reference.
- Class-aware setup and exact Continue links, chapter-local bookmarks, hash/popstate restoration,
  cross-chapter Next/Done, counts/XP/time and per-release completion use the one shared route model.
  Browsing never auto-completes source steps or awards XP. Connecting a saved solo character to
  the five-player route is explicit and preserves old outdoor progress/other characters.
- RestedXP full export remains after approval and runtime/source validation. Three unknown dungeon
  bundles and historical later chains remain visible; this is not a certified/optimal playthrough.
- Further local research traced native fragment entries with null history state: Next 16.3.5's
  Back handler ignores them. Registered same-chapter fragments and normalized a null Back entry
  through a validated race/chapter route, without relying on private router state fields. Browser
  regressions now cover the fast Next → Back → Forward case as well as exact reload/continuation.
- Scoped verification: 126 leveling + 211 web unit tests, local/Linux strict TypeScript and lint,
  all 33 source-data projections, Linux production builds, three browser suites on the private
  candidate (integrated route, preserved original chapter tree, compatibility campaign), actual
  Group/Chill setup completion, 390/320 px layout and automated WCAG A/AA checks. Real map assets
  exposed and verified fixes for a toolbar contrast issue and a keyboard-scrollable figure caption.
- Publication copied the actual r2 baseline and overlaid 17 checksum-matched feature/test/docs
  files. Lockfile, Next configuration and launcher are unchanged. Only Helper web was reloaded;
  credentials, catalogs/markets, world/authorized archives, ingestion and guild processes stayed
  unchanged. No schema migration, addon installation, RestedXP full export, commit or push.
- Public integration browser assertions passed, including same URL/21 embedded dungeon chapters,
  Next/Done, class selection, exact bookmarks, same-chapter hashes, Back/Forward, edition changes,
  mobile/a11y, Horde isolation and invalid chapter 404s. Twelve public routes returned 200. The
  exact Human URL contains the revised tree and Deadmines reader paths, not just the old side link;
  Forever Trader has no catalog-review/database warning.
- The public browser completed all assertions and closed Chrome, but an idle Node test-process
  handle lingered after teardown; that test process was interrupted afterward. All three private
  browser suites exited normally. No browser/test listener or production test write remains.
- Live Helper PID 2643752 / restarts 100 after one activation reload, about 261 MiB RSS. Ingestion
  remains PID 1169337 / zero restarts; guild remains 2507624 / 93. Runtime heap stays at 384 MiB;
  only temporary builds used 1,536 MiB. Candidate PM2 app deleted, PM2 saved, private SSH tunnel
  and isolated local dev stopped. Local generated next-env imports restored to their initial paths.
  r3 is about 934 MiB; disk is 69% with 23 GiB free. No old releases, catalogs or user data removed.
- r2 understands the same campaign saves and is the rollback; after rollback the new chapter URLs
  are unavailable, but the compatible `/forever/leveling/premade?race=…&class=…` reader retains
  the same release/step progress. Keep browser backups; r1 is not a compatible campaign-save reader.

### Continuous premade 1–60 campaign (2026-10-13; deployed and publicly verified r2)

- Owner clarified that a dungeon directory is not the desired product. `/forever/leveling/premade`
  is now one continuous campaign: race-specific start, Ironforge rendezvous, world prerequisite
  and grouped-kill batches, all 21 requested dungeon stops, scoped actual hand-ins and level-60
  finish. The older detailed circuit/individual quest ledger remains at `/premade/dungeons`.
- Five Alliance race families and 28 legal race/class branches plus five generic branches yield
  33 projections from 61 checksum-validated authorized questing chapters. Depending on race/class,
  the plan contains 53–55 chapters and 743–881 source-backed/authored actions. Human generic: 55
  chapters / 803 actions. Generic branches explicitly do not resolve personal class/pet steps;
  choose Player 1's class in Settings. Mixed-race players use their own starts and meet at 16.
- Curated post-start outdoor work keeps required Defias, Letter/Bazil, Greenwarden, Scarlet and
  Onyxia preparation; separates XP-only Thorium Point/Firegut work from the actual unlocks; and
  retains BRD's probe, outside returns, Crumpled Note/Shred/Jail Break and Emperor/Core ordering.
  Native parent chains and objective/hand-in ordering are checked; Temple objectives cannot be
  paid in an earlier world block. Classic Lonebrow preparation is labeled historical/current-game
  verification needed, not inferred from client presence. Source group/solo route hints are manual
  for this explicitly five-player audience; race/class/XP-rate predicates still apply.
- Paid quest ledgers are shared with the earlier reference but chapter bookmarks are not overwritten.
  Starting reports affect Player 1 only; shared path reports require explicit confirmation for all
  five. Multi-objective quests remain accepted until every known selected objective is reported.
  Hand-ins dirty actual XP; a previously rewarded quest never pays twice or dirties refreshed XP.
  Next previews without completion, Done records then advances, and the final checkpoint stays
  at the finish. Hiding an optional raid action selects the next visible action, not level 1.
- Actual entry/pickup checks and required unlock hand-ins block Done, not read-only browsing.
  Skipping an XP-only block checks all five fresh bars, including an immediately following raised
  At-level gate; it never rewards quests or skips a preparation block. Maps use current source
  coordinates, reference pickups are separately labeled, and briefings show their chapter's points.
- Of Love and Family is excluded from this speed campaign's core because its Fordring collection
  prerequisites are not free. The old five-quest reference forecast is not reused for the new
  four-quest Stratholme scope. No guessed world-XP multiplier or arbitrary universal mob-kill XP.
  Drowned City/Krol'dok/Alcaz remain explicitly unverified; Next can reach the real outdoor fallback
  without claiming those dungeons completed or crediting imagined rewards. In-game XP, group
  credit, timing and later lifecycle review still matter; this is not a guaranteed/playtested run.
- Added pure shared campaign model/progression and two repeatable source/browser audits. Scoped
  local and Linux checks: 126 leveling + 207 web tests, strict typechecks, full package lint,
  leveling/Next production builds, all 33 data projections, continuous/legacy browser regressions,
  390/320 px and WCAG A/AA checks. Original full chapter-path browser regressions also pass.
- Release r2 copies the live r1 baseline and overlays exactly 18 checksum-verified feature files;
  lockfile, launcher and Next configuration are unchanged. Production credentials, world/archive,
  market/catalog data and ingestion are unchanged. Only Helper web was reloaded. No migrations,
  source archive publication, addon install, commit or push. The runtime stays at its 384 MiB heap;
  only the temporary build/typecheck used 1,536 MiB after the runtime-sized build check ran out of
  memory. Candidate served successfully around 248 MiB RSS. RestedXP export remains after approval
  and actual route validation; the model carries source anchors for that later compiler phase.
- Public HTTPS browser regression passed for saved exact step, Next/Done, required entry and final
  gates, previewing past the three evidence gaps, all 21 stops/full path, race/class selection,
  mobile 390/320 px and WCAG A/AA checks. No page JavaScript errors or server writes were observed.
  Main/class-specific campaign, old reference, setup, Alliance/Horde dashboards, both Traders,
  talents and data status all returned 200; Forever Trader has no catalog/database-review warning.
  Helper PID 2635888 / restarts 99 after one activation reload, RSS about 266 MiB. Ingestion remains
  1169337 / zero restarts and guild 2507624 / 93. Temporary candidate/tunnel/local server were
  stopped and PM2 saved; no old releases/data were deleted. Disk is around 68% / 24 GiB free.
- Before rollback, export and retain browser backups. r1's strict premade schema cannot read the
  new `campaigns` field; do not erase new progress to make old code parse it. Immediate app rollback
  is the retained r1 release; no database/market/world/archive restore or ingestion restart is needed.

### Premade-five dungeon speed guide (2026-10-13; implemented and deployed)

- New review route: `/forever/leveling/premade`, linked from leveling setup and Alliance dashboards.
  All 21 requested stops have preparation/clear/hand-in/checkpoint stages, shared-kill bridge
  guidance, optional personal collection work, two-stop lookahead, quest/Wowhead links and
  reference-pickup maps in a fixed-map/scrolling-reader layout. Existing chapter bookmarks remain
  separate. Drowned City, Krol'dok and Alcaz have no verified quest bundles and cannot be marked
  as completed runs. Historical later-dungeon plans remain labeled unverified, not playtested.
- Imported installed Journal 1.6.3 with literal-only parsing: 100 unique dungeon quest IDs,
  104 associations, 164 total quest/prerequisite records. Explicit base XP and adjusted reward
  provenance are separate. Empty genuinely blank rows are skipped; malformed identified rows fail.
  Updated Dalaran/Library/Wetlands chains without changing the build-70205 world archive.
- Reported Forever rewards bypass multipliers. Unknown ordinary dungeon rewards use the audited
  2.375× historical scenario with estimated rounding; exceptions, overlevel reductions and absent
  rewards remain unknown. No 20% kill-XP change is applied to quest rewards. Hypothetical extra
  faction quests are per-stop scenarios, never invented quest IDs or actual departure permission.
- All five actual XP bars and quest ledgers persist in the existing local workspace/backups.
  Hand-in changes require fresh actual XP; Next does not tick, Done ticks then advances, and
  checkpoint completion checks all five actual next-entry levels plus known prerequisite/item
  gates. Final Stratholme completion stays at its checkpoint instead of resetting the route.
  Conservative At-level floors remain default; requested lower levels require explicit expert mode.
- Trips accept owner-entered whole-trip timing ranges, not fabricated measured speed. RFK's
  pendant collection/Darnassus return and Stratholme Flesh are optional, not required speed filler.
- RestedXP export remains withheld until browser approval and route/data validation. The shared
  TypeScript route model is implemented, but the complete circuit compiler/pack is not delivered.
- Verification: 116 leveling + 206 web tests, strict typechecks and focused lint pass locally;
  the same tests, full package lint/typechecks, leveling build and production Next build pass on
  Linux. Private/public Chrome regressions cover saved stop/stage, Next vs Done, five hand-ins,
  actual-XP refresh, blocked departure, entry policy, optional collections, per-stop scenarios,
  all 21 nodes, 390/320 px layouts and automated WCAG A/AA checks. Actual native map tiles return
  200 and reference pickup circles render. Ten existing dungeon-itinerary/chapter-tree browser
  regression groups also pass against the private candidate. No page JavaScript errors observed.
- Deployment: copied the actual live October 10 baseline into an isolated release and overlaid
  exactly 21 checksum-verified feature files. Lockfile, Next configuration and production launcher
  match the baseline. Atomically switched `current`, reloaded only Helper web, and confirmed public
  preview, leveling/Alliance/Horde dashboards, both Traders, Encyclopedia/talents and data status
  return 200. Forever Trader retains the published catalog without review/database warnings.
  No migration, catalog publication, addon install, ingestion restart, commit or push was made.
- Runtime handoff: Helper web PID 2619996 / restart count 98 after the one activation reload;
  ingestion remains PID 1169337 / zero restarts and guild PID 2507624 / 93. Temporary candidate,
  SSH tunnel and isolated local dev server were stopped; PM2 saved. The retained candidate release
  is about 915 MiB; disk is 67% used with about 25 GiB free. No previous releases/data were deleted.
- Approval URL: https://helper.kfcguild.online/forever/leveling/premade. Back up browser progress
  before rolling back: the older strict schema cannot read a new `premade` field. Immediate rollback
  is the untouched October 10 talents baseline; do not restart ingestion or restore databases.

### Premade-five circuit research receipt (2026-10-13; historical planning context)

- Owner supplied an Alliance dungeon sequence from Thanes 16 through a Stratholme finish to 60,
  including prerequisite preparation, BRD raid/key stages and two proposed LBRS gem runs. Latest
  refinement prioritizes an ultra-efficient premade of five: shared-kill bridges, necessary chain
  batches, optional collection drops without group waiting, and actual-XP-gated next departures.
  The browser is the review surface; after owner approval, export the same frozen route revision
  as a separate KFC RestedXP guide pack, not a second manually maintained itinerary.
  Research/XP audit and every-stop preparation windows are appended to
  `docs/forever-leveling-dungeon-route-choice-plan.md` under the October 13 circuit section.
- Pinned curve: 20→26 costs 170,800 XP; prepared Deadmines scenario adds 25,086 before kills/world
  preparation. Fresh 58→60 costs 412,100: no evidence supports a guaranteed single-Stratholme finish
  from there. Use prerequisite-rich outdoor bridges and an adaptive final entry, not repeated XP spam.
- Found mixed XP provenance: quest 378's reported Forever fallback 5,750 is multiplied to 13,712
  by the global Crest estimate. Normalize base versus already-adjusted rewards before shipping any
  circuit forecasts. No implementation/fix of that estimator was requested in this planning turn.
- Current native planning data remains 70205 / DungeonJournal 1.4.4. Installed 1.6.3 adds candidate
  Dalaran/Library quests and revised Wetlands gates; old importer fails closed on an empty DM row.
  A literal-only research audit of current Journal declarations found 100 unique dungeon quest IDs
  / 104 associations and one empty row; no addon Lua was executed or live catalog imported.
  Its reader prefers loaded non-secret live rewards, then global/per-quest fallbacks; old reward
  strings are not the active XP source. Importer currently ignores its explicit BASE_XP table.
  Three requested new dungeons have no usable quest bundle in the planner. Later identities alone
  do not provide complete lifecycles, prerequisite graphs or reward totals.
- Added durable research receipt `docs/forever-leveling-premade-xp-audit.json`: 72 late historical
  baseline lookups, 69 numeric / three unknown, eight diagnostic bundles, Journal hashes and the
  requested Deadmines/Stockade/Gnomer comparisons. These are not current Forever server facts.
- Candidate ordinary tier: 2.375× base with proposed nearest-50 display rounding reproduces Crest
  6,200, Red Silk Bandanas 2,950, new Alliance SM Past Due 96800 at 6,750 and Dalaran Starving
  Arcane 92457 at 9,400. The official October 1 rule halves EXTRA XP: `B + (oldXP-B)/2`.
  Old 3.75× becomes 2.375×; Thanes' old ~3.4× becomes ~2.2×. This is a planning fit, not proof
  of one universal server formula. Techbot 2,650→4,750 and Fury's historical 2,750 versus reported
  5,750 are exceptions/context gaps; known adjusted values are never multiplied again.
- New faction-balancing quests are an owner-requested upside scenario, not announced fact or
  invented IDs. Discover/reconcile per-dungeon pages/category/reward items plus Journal updates;
  count the same generic first-visit scope and keep class/deferred/zero-XP stages separate.
- Late-game diagnostic: pinned fresh 45→60 costs 2,424,700 per player. Even the generous RFD
  directory scenario gives 29,308 for a 240,700 gap to 47; new ordinary fit barely changes this.
  "Dungeons only after 45" is not established without kills, new quests and measured preparation.
  Stratholme candidate five-quest scope excluding opportunistic Flesh collection gives 92,760
  under the original Crest scenario, fitting ~59 + 55.8% before kills, not a guaranteed 58→60 clear.
  Recomputed both full and candidate bundles with the new ordinary 2.375× / proposed nearest-50
  fit: RFD directory 29,200, Mara 103,100, ST 96,050; Stratholme selected five 92,400 → ~59 + 56%.
- Official October 8 notes now open Dalaran, revise dungeon kill XP and return Excavation's relic
  for follow-ups. Refresh these build-specific assumptions; do not add a 20% quest-XP multiplier.
  BRD cannot finish the full Alliance Onyxia attunement without its later UBRS tail; two LBRS runs
  do not guarantee personal gem sets. Some Stratholme quest chains need later outside hand-ins.
- Exact proposed levels conflict with the existing At-level floor policy for Ruins/Excavation/
  Dalaran/LBRS and a pre-60 Stratholme finish. Owner confirms the coordinated-five audience;
  plan a separate experienced-premade policy with visible exceptions for web approval, preserve
  actual access/pickup minima and do not change the current public conservative gates yet.
- Installed RestedXP is v4.11.23. Public RegisterGuide supports an installable KFC guide pack;
  the current GUI paste importer uses an encoded account-sensitive format, not raw guide text.
  Existing compiler is still a hardcoded Westfall/Thanes preview with per-chapter lifecycle reset:
  shared circuit model, global validation, conditional XP bridges and full packaging need work.
- Verification: 104 leveling tests and strict typecheck passed; 157 authorized chapter
  checksums/schemas checked, all 60 XP curve rows matched. Independent durable JSON/math checks
  and scoped diff whitespace check passed. Research/docs only; no production code/data, addon, crawler queue,
  migration, deployment, commit or push. Earlier crawler recovery remains live and separate.

### Reference crawler edition-preload repair (2026-10-13; live)

- The full-catalog crawler had stopped on October 8 at cursor 607 / 60,614, on TBC item 818
  (Tigerseye). Its canonical TBC page included an unrelated edition-4 item preload before the
  correct edition-5 target. The parser incorrectly treated any foreign preload as a primary-item
  mismatch. A paced, robots-permitted diagnostic reproduced the failure without changing the
  full-catalog checkpoint.
- The parser ignores foreign item datasets but still requires a matching requested-edition primary
  item whenever foreign datasets occur. Same-ID foreign facts are never merged. Item names,
  canonical/XML identities, literal-only script parsing and numeric-fact allowlists remain checked.
- Deployed only the isolated worker as `crawl-20261013-r5`, resuming the unchanged queue/checkpoint
  with the same 60-second pacing, 384 MiB heap and storage safeguards. At 06:00 UTC it was online,
  advanced to 609, with both item 818 and Forever quest 212 published as complete. The live Tigerseye
  page renders its new attributed reference. No web/publisher/ingestion reload,
  database write, migration, new dependency, commit or push was requested.
- Follow-up at 06:31 UTC confirmed the same worker still running at cursor 621 (14 new records),
  no error, unchanged request limit, and `forever-item-832` in progress. Both newly published item
  and quest detail pages returned HTTP 200 with their current attributed references.
- All 53 reference tests, strict typecheck, lint and an isolated production build passed. Source-map
  comparison proves only `parser.ts` changed in the deployed runtime, excluding unrelated local
  publication edits. Dependency files are identical to the existing runtime, with release-local
  relative links replacing inherited old-release aliases. Backup and verification: `fixes.md`;
  ongoing operation: `docs/wowhead-reference-enrichment.md`.
- Genuine source challenges, incompatible primary data or storage-budget exhaustion still stop
  the worker intentionally. This repair does not exempt records from publication validation.

### Versioned catalog watcher deployed (2026-10-09; live)

- Replaced the Mac LaunchAgent's development-repository execution path with an immutable,
  content-addressed release containing Node, the production-only compiled catalog CLI and a
  self-contained native extractor. Scheduled checks need no development checkout, `tsx`,
  pnpm/Corepack, .NET SDK or externally installed .NET runtime.
- Active Mac release `9fa6db30d08f91cd070be39f99028fa3b0905ec55338550b903f6aa7805b174b`
  lives under `~/Library/Application Support/WowTraderCatalogGuardian/releases/`; its separate
  `work/` directory holds mutable catalog/media artifacts and official definitions caches.
- Server CLI runtime `45970dd4b92c9e37fc8b1d9778ab5ce7079ba3299e2401ab1012a833e70fac6f`
  is deployed under shared catalog tooling. Native startups, local/server checksums and server
  real-catalog audit/validation passed. The installed five-minute job reports 70291 `current`.
- Installer refuses to interrupt a locked run, verifies tools before activation, retains/restores
  the old plist on failure, and records the deployment/rollback paths in `deployment.json`.
  Repo edits intentionally require reinstallation to change the deployed watcher. Exact build,
  hotfix, definitions and economic compatibility guards remain intact.
- Eight runtime/release + four build-cache + 11 catalog tests, focused lint/typecheck/syntax and
  catalog/contracts/db/self-contained extractor builds passed. A fresh standalone restricted-path
  extraction, 102-artifact audit, relationship validation and all 2,953 icon decodes/checksums passed.
  Four live Forever/TBC Trader checks passed; all 22 PM2 service PID/status/restart counters were
  unchanged. No new import, web reload/release switch, migration, commit or push requested.
  Full deployment receipt and caveats: `fixes.md`; workflow: `docs/production-deployment.md`.

### Exact-build 70291 catalog publication repair (2026-10-09; live)

- The scan uploaded correctly, but the guardian could not publish its catalog: the slim October 8
  web release omitted catalog development dependencies and compiled artifacts, while publication
  still invoked `pnpm catalog:*` through dev-only `tsx`. The exact-build guard was correct and remains.
- Guardian publication now builds a portable, production-dependency-only compiled CLI and verifies
  its files/symlinks by SHA-256 on both hosts. Catalog and media validators live independently in
  `shared/catalog-tooling/releases/<fingerprint>`; publication no longer needs the web release's
  dev dependencies. Only dangling links inside a newly generated temporary deployment are pruned.
- Preparing a new snapshot clears stale manifest/assessment/build-ID fields while preserving
  notification de-duplication. Build 70291 can no longer display an old 70245 assessment in its status.
- Published catalog ID `2ce8312f-c061-4dba-bb46-10adf97b299e`: 23,946 named items, 31,849 spells,
  12 professions, 2,239 recipes and 2,953 verified icons. All 102 artifacts and relationships passed;
  comparison with 70245 preserved recipe/profession/transformation economics. Exact definitions:
  `9073201543de7fd0af41ed42042b8d32c3f52938`.
- Existing scan `e544e04f-b8a2-4f19-8f1f-cc33fa738ae8` has 3,106 markets and 11,633 price levels;
  no rescan or invented market data was needed. Public default/explicit Forever crafting pages each
  render 50 opportunity rows, AH item search works, and TBC/guild/community smoke checks pass.
- Only Helper web was reloaded, retaining the October 8 application release. Ingestion and reference
  publisher retained their processes. The existing Mac LaunchAgent was restored to its five-minute
  schedule; an idempotent rerun reports `current` without importing/reloading again.
- Verified six runtime regressions, four build-cache tests, 11 catalog tests, focused lint/typechecks,
  three package production builds, server checksum verification, SQL counts and six public pages.
  No migration, web source rebuild, credential change, commit or push. Full recovery receipt:
  `fixes.md`; ongoing publication process: `docs/production-deployment.md`.

### Server storage audit and approved cleanup (2026-10-05; completed)

- Initial read-only audit found obsolete releases/builds and download caches. User then approved
  cleanup with “clear”. Fresh guards checked exact paths/inodes, mounts, live/saved PM2, process
  working directories, Nginx/systemd/cron references, retained symlinks, open files and package locks.
- Removed 30 obsolete Helper releases, 34 old community builds, npm `_cacache` and 292 APT archive
  entries. Actual recovery was 28.18 GiB: available space increased from 6.6 to 34.8 GiB and root
  usage dropped from 91% to 52%. Seven Helper releases and three community builds remain.
- Preserved `kfc-helper-item-market-20260927-r13`: unmanaged Next.js PID `687835` still uses its
  standalone directory and listens on `127.0.0.1:19212`. Its process was not stopped. The raid staging
  copy also remains pending unique-source/configuration review. Shared game data, installers,
  databases, secrets, backups, rollback copies and unrelated live websites were preserved.
- All 19 PM2 services retained PID/status/restart count; six public Helper/Trader/Leveling/chapter/
  community/guild checks returned HTTP 200 without checked error markers. No service restart,
  migration, deployment, commit or push. Builds were permanently deleted; caches are downloadable.
- Exact removed/retained paths and cleanup receipt: `docs/server-storage-audit-2026-10-05.md`.
  No automated release retention was added.

### Verified dungeon production release (2026-10-05; deployed r6)

- User approved the dungeon experience and requested commit, push and deployment. Only the leveling
  implementation, regression checks and its documentation are in scope; unrelated local catalog,
  market, ingestion and SEO edits remain untouched.
- Code `e2beab6` is committed and pushed to `origin/main`. The immutable r6 candidate was copied
  from the active r5 baseline and overlaid with exactly 73 checksummed committed files, preserving
  the existing live market/catalog changes rather than deploying unrelated local edits.
- Clean-index full `pnpm check` and formatting passed: 400 unit tests and all package builds.
  Linux checks passed 104 leveling + 195 web tests, lint/typechecks, formatting and a production
  build. Server archive audit verified all 157 chapters. Private Chrome passed all 27 dungeon,
  chapter-path, reference and Thanes groups; public HTTPS Chrome passed four more groups, including
  persisted plans, actual-XP/entry gates, 390/320 px layout and WCAG A/AA checks.
- Atomically switched `current`, reloaded only `kfc-helper-web` and saved PM2. Ingestion, guild,
  community and workers retained their processes. This deployment did not mutate the authorized
  archive, world maps or database. No migration, addon or dependency change.
- A broader public crawl exposed the existing 320 MiB heap ceiling. A private 384 MiB replay passed
  two complete route/sitemap rounds (sampled RSS ≤360 MiB; retained heap 97 MiB after each round).
  Backed up the protected web environment, changed only its heap ceiling to 384 and reloaded only
  Helper web, keeping the 600 MiB PM2 guard. Separate catalog-guardian activity also refreshed the
  compatible 70205 hotfix during verification; that was not a data publication by this deployment.
- Final public replay passed two complete 20-route rounds plus the unknown-reward 404, retaining
  PID `1650837` / restart count 77 at 423 MiB warmed RSS. No further restart occurred during the
  replay; same-build reward previews, root sitemap and all four catalog shards remained available.
- Previous local-only entries are historical implementation receipts, now covered by this release.
  Exact release evidence and rollback: `docs/forever-leveling-release-2026-10-05.md`. Back up browser
  progress before an r5 rollback: its older strict parser does not understand the new dungeon fields.
- Temporary candidate, inspector and tunnels are closed. Disk is about 91% used / 6.6 GiB free; no existing
  data or rollback releases were deleted. Travel timing and additional variant adapters remain review
  work, not a deployment blocker or a claim of optimized/playtested routes.

### Scoped dungeon alternatives and reviewed continuations (2026-10-05; deployed r6)

- User asked to plan the other dungeons and implement the Thanes-style alternative experience.
  All 32 visit variants now have geographic/faction fit, preparation, scoped run and hand-in plans.
  The prominent plan shows selected quest XP, checkpoint/gap and full-curve level endpoint; other
  journeys stay collapsed. Ordered quest itineraries use the existing ID/evidence catalog and links.
- Deadmines defaults to six core quests (≈21,867 XP), not an unprepared explosives chain. Alliance
  Ruins estimates ≈22,535 XP. Fresh 19 reaches 20 + 2% / 5% from those quest rewards alone, not 1.5
  levels. Optional chains, prerequisite rewards, kills and measured time remain separate.
- Alliance WC is moved from Redridge to the authored 21–23 Stonetalon/Ashenvale bracket; its itinerary
  requires actual 21+. The unprepared Smart Drinks chain is optional. Horde WC keeps its Barrens
  placement and strict At-level 19 floor. No premade entry-floor exception exists.
- DM and Alliance Ruins have new source/hash-pinned **19→20** adapters for the audited Human Warrior
  at 1× outdoor XP. Both preserve The Price of Shoes→Return to Verner→A Baying of Gnolls for later
  Redridge, The Corruption Abroad for Darkshore, Cooking 50 and class/utility preparation. Actual
  reported level 20+, fresh XP and explicit bridge checks gate the exact next source step.
- New `--alternative` keys and optional strict continuation snapshots preserve old generic trips,
  competing choices, instruction progress, backups and outdoor bookmarks. Rejoin never marks
  source rows done/skipped. Changed evidence/variant blocks reuse with a visible reason and recovery
  link. Unsupported variants remain safe optional trips, not fake chapter replacements.
- Optional trips persist their itinerary mode. Continue/reload and even removal of the URL flag
  preserve Alliance WC's 21+ floor and selected core bundle; the constructor enforces that gate too.
- Hall of Thanes is unchanged. Higher-level/unknown-schedule/unknown-access visits remain labeled
  references under build 70205's reviewed cap 30. More actual source replacement adapters require
  race/class/chain/wing review; having a scoped itinerary is not proof of a legal automatic skip.
- Timing still pending: user offered Alliance travel measurements; requested Stormwind→DM,
  Stormwind→Ruins and Astranaar→WC each-way ranges and transport assumptions. The existing complete
  trip comparison accepts entered bounds; no walking durations or fastest-route claims are invented.
- Full 32-row authoring matrix and implemented contract:
  `docs/forever-leveling-dungeon-route-choice-plan.md`. Maintenance behavior:
  `docs/forever-leveling-dungeon-expansion.md`. Verification receipts are in `fixes.md`.
- Shipped in web-only r6 from `e2beab6`; no database/addon write, dependency addition or dev-server
  restart. The production receipt above supersedes the original local-only implementation status.
- Verified: 104 leveling + 195 web tests, lint/typechecks, leveling and isolated production builds.
  Chrome regressions cover new continuations, WC mode persistence, previous Thanes/optional trips,
  the chapter tree and reference library; desktop/390/320 px overflow and WCAG A/AA checks passed.

### Dungeon option discovery and collapsed cards (2026-10-05; local only)

- Matched new chapter alternatives to the warm gold Hall of Thanes styling: visible dungeon names,
  required levels, quest counts and labeled XP, with each quest plan collapsed by default. Native
  keyboard-accessible accordions open one option at a time within each chapter; selected/saved trips
  link to their existing instructions. No new speed or zone-replacement claims were introduced.
- Added a chapter-path shortcut and a fixed reader-toolbar shortcut so alternatives are reachable
  without scrolling back manually. Opening cards and following discovery links leave the current
  source bookmark, completion and dungeon selections unchanged.
- Collapsed the generic review's XP/time comparison and quest library separately, preserving their
  inputs. Removed the irrelevant future-visits checkbox from single-visit reviews only. The full
  reference library and existing Hall of Thanes route remain available.
- Feature behavior/maintenance: `docs/forever-leveling-dungeon-expansion.md`. Final verification
  receipts are in `fixes.md`. No commit, push or deployment requested for this presentation update.

### Full-path dungeon options and generic trips (2026-10-05; local only)

- Implemented the catalog expansion foundation: all 32 visit variants are discoverable in the
  full chapter path or unknown-schedule references. At level is enforced as a strict floor even
  for premades; selected pickup requirements can raise it. Above-cap/unknown content stays reference.
- Repaired suffixed UBRS parsing and reviewed source section/wing/row coverage. The refreshed guide
  has 228 associations/224 unique IDs, UBRS 12 rows and At level 60; the union has 271 records.
  The 157-chapter audit now contains 242 visit/quest rows. No current runtime reward XP is invented.
- Added a shared six-stage source-pinned trip reader, compatible quest bundles and same-checkpoint
  calibrated XP/catch-up/time comparisons with explicit per-player estimates. Real prerequisites,
  starting items, preparation and reported XP gate actions; Next/Done do not earn rewards.
- v2 clone-once migration preserves legacy Thanes state and the v1 backup. Competing chapter/visit
  trip snapshots, checkpoint assumptions and bookmarks remain separate and reversible.
- Browser regression found and fixed trip activation silently enabling a source `.dungeon` branch
  and hiding the saved outdoor `!DM` row. Generic trips now leave source branch choices untouched;
  return checks use the actual branch and reject hidden/unresolved bookmarks.
- Only Thanes is still an authored XP-segment/zone replacement. Generic trips retain all source
  instructions; additional omitted-step/bridge adapters and later lifecycle/reward data remain
  evidence-gated work, not completed automatic route substitutions.
- Contracts, maintenance and remaining work: `docs/forever-leveling-dungeon-expansion.md`.
- Verified 94 leveling + 194 web unit tests, five importer tests, 21 Chrome regression groups,
  both lint/typechecks, script lint/formatting, the 157-chapter audit and package/isolated production
  builds. Mobile 390/320 px reference/trip layouts have no horizontal overflow or automated A/AA
  violations. Receipts follow in `fixes.md`. No commit/push/deployment, migration, dependency,
  production write, addon change or dev restart was requested or performed.

### Full chapter path and complete dungeon replacement planning (2026-10-05; local only)

- Replaced the three-card nearby preview and collapsed 1–20/21–40/41–60 archive with the complete
  eligible 1–60 path. Source branch links and rejoin links jump within a level-ordered route tree;
  graph gaps/conditions remain explicit and navigation does not select or complete a chapter.
- Every chapter shows unique applicable source quest counts, hand-ins, optional/conditional counts,
  bracket-required XP and modeled time at the player's saved effective per-player XP/hour. Known
  reference reward subtotals/coverage remain separate; unknown rewards and same-level duration are
  not zero. No forecast is credited as earned XP, no party/global bonus is multiplied again.
- Validated/cache-bound activity projections use authorized, checksum-verified chapter files and
  retain existing class/rate/season/dungeon filters without sending full guide prose/maps. Expanded
  the client curve through 60; all 60 entries match the pinned extraction checksum and Total column.
- New `docs/forever-leveling-dungeon-replacement-plan.md` covers all 32 catalog visit variants,
  259 quest/prerequisite records, candidate source segments, generic replacement definitions,
  lifecycle/XP/time rules, persistence migration and staged rollout. Only Thanes is implemented.
  Found UBRS omitted by an importer heading-suffix bug: six primary source row IDs need importing.
- Scheduling policy clarified by the user: **At level is a strict floor, even for premade groups**.
  Selected quest/access requirements may raise it; preparation can happen earlier. Unknown or
  above-beta-cap schedules remain reference-only. Related planning documents now use this rule.
- Chapter-tree unit/browser regression scripts and archive projection checks added. Verification
  and final local status are recorded in `fixes.md`. No commit/push/deployment, new dependency,
  database migration, addon change, production write or dev-server restart in this turn.

### Leveling player-quality improvements (2026-10-04; deployed r5)

- Implemented exact per-character/chapter/version/build reading bookmarks and Continue playing;
  Previous and session-local Undo Done; bounded map zoom/drag/keyboard pan/fit with marker-to-instruction
  navigation; current+next focus mode and larger text; explicit source-only chapter handoffs;
  private validated progress backup/merge; and durable anonymous step reports with a maintainer review CLI.
- Backups preserve existing saved releases in full, including undone steps. Feedback retries are
  idempotent even when PostgreSQL reorders JSONB keys; reports never automatically edit route evidence.
- Code `f81bc5c` committed/pushed; deployed `kfc-helper-leveling-quality-20261004-r5` over the existing
  live baseline, preserving independent catalog work. Migration `0016_white_runaways.sql` applied
  with a verified 83,087,657-byte backup; runtime feedback grants are SELECT/INSERT only.
  Real PostgreSQL and public HTTPS insertion/retry/validation checks passed; staged rate limits passed.
  Local PostgreSQL remains stopped. Discord account sync remains a separate auth/privacy phase.
- Contracts, known source gaps, backup/rollback caveats and operator commands:
  `docs/forever-leveling-player-quality.md`. Unrelated working-tree changes remain preserved.
- Verified strict web/database typechecking and linting, 165 web unit tests, full isolated-feature
  `pnpm check` including production build, formatting, and all 30 Chrome regressions against the
  production-mode build. Additional final mobile/map-size, landscape and keyboard/accessibility
  regressions passed after screenshot review found and corrected wrapped controls shrinking the map.
  Real local feedback requests return an honest 503 while PostgreSQL is unavailable.
- Linux lint/typecheck/build and 165 web tests passed; all 30 staged Chrome cases passed across the
  initial run and corrected bookmark-assertion rerun, plus seven live HTTPS cases. Only Helper web
  reloaded; ingestion stayed PID 1169337/restarts 0, guild and community stayed unchanged. Six exact
  synthetic feedback records were cleaned up; player reports were untouched. r4 is retained for
  web rollback, with the documented private-progress backup caveat. Browser test commits:
  `7f8a1d1`, `68ae79f` in sibling `discord-website`; no community runtime rebuild was needed.

### Next phase: dungeon integration (2026-10-04; research/plan only)

- Plan: `docs/forever-leveling-dungeon-integration-plan.md`. Optional sidecar route preparation,
  typed stateful quest-chain graph, inside/drop starts, correct turn-ins/rejoin, marginal bundle
  versus full-trip XP/time, legal reward choices and conservative role/gear utility.
- Re-indexed authorized archive against existing supplemental audit: 94 dungeon associations,
  92 unique quest IDs, 13 sections. Ruins and Excavation lack accept/turn-in directives; Thanes
  lifecycle is incomplete. Counts include all variants, not proof of individual character coverage.
- Found self/future quest IDs in addon prerequisite lists, accepted-state/item gates, competing
  pickup minima and conflicting offline XP. No reference values were promoted to runtime truth.
  October 1 cap/XP/shareability changes and catalog-only availability are explicit release gates.
- First implementation should normalize/audit evidence, then add Thanes/Deadmines and RFC/WC
  preparation overlays; add missing Ruins/Excavation and measured reward comparisons afterward.
  No dungeon feature, broad quest scanning, payment/auth or addon changes were implemented this turn.

### Explicit chapter Next step / Done (2026-10-04; deployed)

- Owner requested manual advancement, replacing Follow and Resume. Both imported and original readers
  now expose **Next step** (advance without changing progress) and **Done** (complete the selected step,
  then advance). Buttons stay visible in Split, Map and Quest list focus. Advancing scrolls only the
  quest pane; map-only mode queues the scroll until the pane becomes visible again.
- A checkbox-only completion does not advance unless Hide completed removes the selected card. Next
  advances strictly after the current applicable instruction, including when earlier steps remain
  pending. The final step never wraps; Next is disabled there, while Done can still complete it.
  Already completed/unresolved cards and unsaved/mismatched characters cannot use Done. Saved progress
  and character/chapter/version/build-scoped anchors survive refresh; old Follow history stays readable.
- Implementation/plans committed and pushed as `640091a`; sibling browser tests as `4f05376`.
  Passed 138 web unit tests, eight navigation tests included, lint/typecheck and the full clean-index
  `pnpm check`/formatting. Linux candidate passed dependency/web checks, build, formatting and all
  23 staged browser tests, including exact Elwynn step 51, final-step no-wrap, both editions,
  mobile map-focus advancement, unsaved guards, independent checkboxes, storage errors and WCAG.
- Activated `kfc-helper-leveling-workspace-20261004-r4`, overlaying only the eight changed reader
  source/test files onto the verified r3 baseline. Static/public contents were copied into the actual
  standalone root before startup; the staged icon-packaging omission was caught and corrected before
  activation. Archive, world evidence, protected environment and all worker/database state are unchanged.
  All 23 public HTTPS browser regressions and Leveling/Forever Trader/TBC Trader/maps/status/sitemap
  health checks passed. Helper retained PID `1542399`, planned restart count 70, post-check RSS 231 MiB;
  ingestion retained PID `1169337`, zero restarts, and guild/community PIDs were unchanged.

### Leveling publication and feedback release (2026-10-04)

- Committed and pushed Helper implementation `1811348`, bounded-validation fix `b89e0a3`, community
  navigation/tests `b2e8bab` and responsive navigation `7247a02`. Unrelated changes remain unstaged.
- Activated `kfc-helper-leveling-workspace-20261004-r3` after Linux lint/typecheck/tests/build/
  formatting and all 20 Chrome regressions against its private staged listener. The clean committed
  snapshot independently passed `pnpm check` and formatting. Deployment overlays the existing live
  research/catalog baseline; it does not remove those independently deployed features.
- Uploaded only authorized manifest members: 157 chapters, 22,604 steps, target 70205, parser
  `forever-guide-v2`, manifest SHA-256
  `43b8ce0a5286dadbaa89ea9b2d53e6ed328fca613ed5e33429151cf24c226fc5`. Repeated checksum/schema/
  identity/build/count validation on the server before activation. No raw source/account bundle
  was uploaded or committed.
- Provisioned world release `wow-classic-beta-70205-extractor-0.4.0-fb8e9cb7`, including normalized
  records, raw checksummed overlay tables and 3,386 verified PNGs. World snapshot/media now point
  to that exact-build immutable release and prefer artifact evidence; it remains review-only.
  No world database import or confirmed loot/source publication was performed.
- Initial public crawls passed browser assertions but crossed the 600 MiB PM2 guard. Heap limiting
  alone was insufficient: world validation opened all 3,386 tile checksum streams simultaneously.
  Bounded validation to batches of 16, preserving every checksum; its regression fails without the
  fix. Web-only `NODE_OPTIONS=--max-old-space-size=320` complements it; the process guard is unchanged.
  Final r3 passed all 20 public HTTPS tests and two complete sitemap/API crawls at PID `1535399`,
  restart count 69, with warmed RSS 392–413 MiB. Ingestion/guild PIDs and restart counts were unchanged.
- Community build `.next-release-leveling-20261004-r4` is live, with only the navigation/destination
  and 1280px responsive rule changed over its existing source baseline. Linux build and staged/live
  navigation checks at 360/768/1100/1281/1440px passed, plus local typecheck/lint and 312 tests.
- The subsequent Next step / Done follow-up is deployed as r4, recorded in the entry above.
- No database migration, addon/payment change, ingestion restart or guild-process restart.
  Rollback files, release provenance and verification are in
  `docs/forever-leveling-release-2026-10-04.md`.

### Persistent Leveling map/list workspace (2026-10-04; now deployed)

- Implemented section 10 in `docs/forever-leveling-experience-plan.md` for both imported and original
  readers: full-width viewport below the 72px primary header, desktop 60/40 persistent map/quest
  split, fixed quest toolbar and independently scrolling ordered cards. Removed page-to-map jumps.
  Chapter-only frame/footer overrides leave dashboards, reference-only pages and other tools intact.
- Shared workspace/card/selection components preserve instruction rendering, prerequisites, progress
  storage and calculator independence. Titles are real keyboard-operable selection buttons; row
  backgrounds also select, while checkboxes/Skip/details/Wowhead links do not. The native map canvas
  stays mounted when selecting another step in its zone. Missing media/location states remain explicit.
- Compact chapter/progress header and native Settings dialog contain class/XP/dungeon configuration
  and expanded evidence. Persistence errors stay visible; save-character and unresolved instructions
  remain reachable. Phones use a pinned top map with Split/Map/Quest list focus; switching modes
  preserves list scroll. Short wide windows retain side-by-side panes; reader-only overflow containment
  prevents outer-page scroll. Original `#planner` and source dependency anchors scroll the pane.
  Primary navigation now folds at 1050px and compact desktop link styles win the CSS cascade, so
  navigation/branding no longer clips at tablet widths. Accessible selection names include quest text.
- Fixed owner's reported Elwynn `#guide-source-step-0051` Follow bug: the initial implementation
  discarded the selected position and resumed at the first unchecked step. r3 repaired Follow/Resume
  using the current cursor, never completing earlier steps or wrapping back at the end. r4 replaces
  those controls with the explicit Next/Done actions recorded above. Current-step hash plus validated,
  character/chapter/version/build-scoped browser history restores the reading position across refresh.
  This changes no progress schema and adds no persistent account synchronization.
- Added navigation unit tests and sibling `tests/e2e/leveling-workspace.spec.ts`; adjusted existing
  archive regressions for Settings. Passed 136 web tests, Helper lint/strict typecheck/production build,
  community typecheck/targeted test lint, focused Prettier and both repository diff whitespace checks.
  All 20 Chrome/Playwright leveling regressions passed against a stable port-3001 production preview:
  exact Elwynn step 51, follow/finish/undo/hide/refresh, end-of-chapter no-wrap, fixed map bounds,
  row/button/checkbox/link/keyboard separation, focus scroll retention, Settings Escape/WCAG,
  calculator anchors, missing media, storage failures, all races and 360–1440px/short landscape layouts.
  Visually inspected desktop/mobile/landscape; actual 900px/1051px header bounds do not overflow.
  Restarted the local port-3000 development preview with the existing authorized archive and validated
  70205 map snapshot; all seven workspace browser regressions also passed there. The temporary
  port-3001 production preview was stopped. Next.js regenerated its normal dev-only next-env imports.
  Those were local verification results; publication is recorded in the release entry above.

### Leveling Wowhead links, completion checkboxes and zone maps (2026-10-04; now deployed)

- Integrated exact Forever Wowhead quest/item/described-spell links into both chapter readers,
  retaining internal quest/item library links. No external tooltip script, iframe or page scraping.
- Replaced the progress dropdown with a Finish step checkbox and separate Skip instead / Undo skip.
  Existing done/skipped saves, per-character/source/build isolation, hide-completed and calculator
  independence remain intact. Unresolved source-step completion stays disabled.
- Added `leveling-map-data.ts`, `leveling-maps.ts`, `leveling-zone-map.tsx`, shared step/link controls
  and route wiring. Native extracted map art, zone selection and location circles are integrated;
  map follows next pending step, or an explicit Show on map selection. Marker filtering respects
  the selected step's active directive conditions, not all hidden chapter variants.
- Re-extracted the installed build 70205 with world extractor 0.4.0, including WorldMapOverlayTile
  reveal art: 3,386 decoded PNGs, zero unavailable. Immutable 70124/0.3.0 artifacts remain untouched.
  All 157 imports resolve across 49 referenced zones: 37,902 guide positions, zero unprojectable,
  588 base / 871 reveal PNGs, no missing image or zone art; 41 zones have reveal overlays (cities can
  use complete base art). There are 31 step-associated exact-build client POI markers, not 31 quests.
- Verified installed RXP/HBD coordinate semantics: zone/instance is not a floor; swap source world
  axes before DB2 projection and require matching assignment world-map ID. Gold guide waypoints
  are not exact NPC/objective circles; blue client POI shapes/centres require exact-build evidence.
  Missing map configuration/media/data has an explicit state; the quest reader remains available.
- Local port-3000 preview now uses the validated 70205/0.4.0 world snapshot. Normal `pnpm dev` now
  selects extractor 0.4.0, so older unrevealed art is not silently reused. Zone overlays are loaded
  from checksummed raw/art/media records and match product/build; conditional or zero-size records
  are excluded. Native PNG dimensions and clip regions preserve edge padding without stretching.
  Numbered circles have dark contrast outlines; selecting a new step resets the manual zone choice.
  Server-rendered/cached image loading is checked after hydration, including browser refresh.
  Development provisions world/maps; production uses the existing world-snapshot/media environment variables.
  Full behavior and source/projection boundaries: `docs/forever-leveling-archive.md`.
  Verified: 130 web tests, Helper typecheck/lint/production build, .NET Release build and extraction/
  world checksum audit, 2 world-data / 39 leveling package tests, community typecheck/targeted lint,
  and 13 passing Chrome/Playwright regressions
  including real native/reveal PNG loading, coordinate circles,
  completion/undo/skip persistence, disabled unresolved checks, WCAG and 360–1440px layouts.
  Browser error checks caught and verified the fix for React SVG-title hydration (single-string
  title children). All artwork/coordinate coverage counts above are based on a separate full-import audit.
  Subsequently committed, pushed and deployed in the feedback release above; no database migration,
  addon or ingest change.

### Authorized full-source Leveling archive (2026-10-04; now deployed)

- Owner explicitly confirmed redistribution authorization for the decoded RestedXP collection.
  Imported all 157 variants (98 Alliance, 59 Horde): 22,604 source steps and 2,394 distinct quest IDs.
  Each guide and aggregate step count matches the reviewed inventory/verified decode summary.
- New `packages/leveling/src/guide-archive.ts` and `archive-cli.ts` preserve original order, quest
  actions/IDs, class/race/XP conditions, dependencies, controls, source lines and location space
  without executing Lua. Schema 1 / parser `forever-guide-v2`; target build 70205.
- Authorized artifacts are under `artifacts/leveling/archive`, ignored and provisioned separately:
  immutable source/parser-versioned chapter JSON, checksum manifest and detailed coverage audit.
  Import command: `pnpm --filter @wow-trader/leveling archive /Users/dimitarjilanov/Desktop/restedxp-analysis artifacts/leveling/archive --authorized`.
  The existing `pnpm dev` reads this archive automatically; no new runtime service or dependency.
- New server loader verifies authorization, manifest membership, size, checksums, schema, build,
  identity, version and counts. `LEVELING_ARCHIVE_ROOT` overrides the default artifact directory.
  Turbopack tracing is disabled for archive paths to avoid copying private maintainer files into builds.
- Integrated full readers into the existing wizard/dashboard, with bracket/class/rate/family filters,
  local character/version/build progress, quest/item links, inspectable source controls and manual
  game-state checks. Unknown conditions are separated from actionable steps; dungeons default off,
  and selecting one is a source alternative, not an optimized dungeon recommendation.
- All ten faction/race choices, including both Skyborne factions, have readable starters and
  available level-60 chapters. All 56 legal race/class profiles reach label endpoints 1/60; this
  is not continuous playtested coverage. Some Alliance Hunter labels have gaps at 13/14/40 and
  Undead at 11. The two existing dangling targets and Horde Skyborne continuation remain unresolved.
  Content above beta cap 30 carries a future-content warning.
- Original Westfall preview/calculator remains separately accessible with `?edition=kfc`.
  Its 31-step progress and legacy calculator saves are unchanged; old Westfall redirects select
  this edition while preserving the rest of the query/anchor intent. Imported prose does not
  inherit the original preview's Article authorship. Unreviewed variants remain noindex.
- Verification and reproduction/deployment boundaries: `docs/forever-leveling-archive.md`.
  Verified 39 leveling tests, 113 web tests, Helper/package typecheck and lint, clean production
  build, community typecheck/targeted lint/formatting and 11 Chrome/Playwright regressions. All
  157 active chapter checksums match. Browser checks include all ten race starters/endgame access,
  import progress, optional dungeons, WCAG, mobile overflow and old-edition/save isolation.
  Oversized multi-character history is refused before persistence so the prior readable save survives.
  No database migration, payment, addon, ingest restart, commit, push or external deployment.
  Live release references above remain unchanged. The previous UX-only snapshot below is historical.

### Dedicated Leveling experience (implemented locally 2026-10-04; not deployed)

- Owner rejected the Encyclopedia/calculator-first entry: **Forever Leveling** should be a major
  primary-navigation screen at `/forever/leveling`, with faction → race → Speed / Chill / Group →
  small compatible extracted level brackets → current ordered quest list.
- Added a direct community navigation link to the same Helper experience, not a duplicate
  wizard or a destination discoverable only under Addons & tools.
- Inspected navigation, Forever/leveling pages, route/math/state models, racial artwork export,
  world quest contracts and the private 157-guide inventory. Race/class/XP/ruleset conditions and
  overlapping alternatives require a catalog adapter; the extraction is not one complete public
  route. Dwarf/Gnome Westfall labels differ, and the reviewed Skyborne Horde continuation is missing.
- Setup stores pace separately from party size/readiness, explains mixed-starting-zone rendezvous,
  keeps At-level conservative for solo, and only considers earlier premade content with real gates
  and evidence. Zero recruitment delay does not mean zero travel, fivefold XP or automatic red quests.
- Added a read-only sanitized catalog adapter and 157 header records under `packages/leveling`.
  Evaluates faction/race/class/Forever/XP predicates without executing Lua. Unknown/ambiguous/missing
  continuations stop automatic selection; ordinary and Mage AoE families stay separate. The audit
  matches the private inventory, finds two dangling target names and no cycles. Horde Skyborne's
  conditional continuation also remains unknown. Provenance and audit command are in the experience plan.
- Added `apps/web/src/app/forever/leveling` and setup/provider/dashboard/reader components. The wizard
  restores drafts on Back/refresh. Desktop/mobile navigation, Forever's third product card and community
  `discord-website` navigation/tool links point to the new destination. Original Westfall has 31 readable
  steps; other brackets are metadata-only coverage screens, not republished private instructions.
- Step progress is character/chapter/version/build isolated in `kfc-leveling:characters:v1`; pace/party
  edits preserve it, another character does not inherit it. Validated shared profiles exclude progress
  and identity. Denied storage works in memory; corrupt saves are not silently replaced by browsing.
- Legacy directory and Westfall links redirect permanently, retaining query/anchor intent. Existing
  calculator saves remain intact and can be explicitly imported into a per-character comparison.
  Reader checkmarks do not change calculator XP. Canonicals, breadcrumbs, Article data and sitemap
  use the new destinations; unpublished or duplicate variants are noindex.
- First UX phase preserves current quest order. Mode-specific list optimization, ready-premade timing
  evidence, original/authorized full chapter content and runtime playthroughs remain the next phase.
- Local verification: 35 leveling tests and 110 web tests passed, along with Helper typecheck/lint/
  production build, community typecheck/targeted lint and 312 tests. Eight focused Playwright regressions
  passed for the browser flow, draft refresh, profile/save isolation, denied/corrupt storage, sharing,
  WCAG checks, icon decoding, 360–1440px layouts and metadata. No deployment, payment,
  database migration, addon change or ingest restart occurred. Live release references above are unchanged.

### Original leveling preview (2026-10-04)

- Added `packages/leveling` with original Alliance Westfall 13–15 route v0.1.0, selected Hall of
  Thanes branches, reviewed prerequisite graphs, a strict incremental XP/time calculator and a
  RestedXP compiler. No private account-derived guide content is distributed.
- Free Encyclopedia directory and Westfall planner include ordered instructions, coverage/evidence
  labels, local/shared plans, actionable branch steps, metadata and sitemap discovery. Community
  `/addons` links to the free preview without promising a released supporter addon.
- Per owner request, default visits use Wowhead's **At level**, raised by selected unfinished quest
  pickup requirements: Hall 14 → 15/16 for later bundles; Deadmines stays a later visit at 19. The
  calculator checks XP before entry, lost outdoor XP, catch-up, shared/completed work, preparation
  and the full return trip. Out-of-slice and unsupported-faction plans cannot be applied.
- Extracted current build-70205 `gametables/xp.txt`, `QuestV2` and `QuestXP` using the new .NET
  `leveling-evidence` command. Definitions/hash provenance is in the product plan. The XP curve is
  client evidence pending runtime confirmation; individual quest XP remains unknown rather than
  inferred from the difficulty table. Installed Journal pickup conflicts are disclosed.
- `pnpm leveling:addon` produces an ignored maintainer ZIP/manifest. A separate bounded manual
  observer records current curve and turn-in XP without scans or protected UI actions. Preview
  registration is build-locked to 70205 and requires installed RestedXP v4.11.14. It has not been
  installed or playtested in WoW. No payment, entitlement or migration is activated.
- First focused verification: 27 leveling regression tests, 105 web tests, Helper typecheck/lint/
  production build, community typecheck/targeted lint and 312 tests, .NET Release build, Lua
  observer mocks, generated Lua registration/build guards and reproducible ZIP hashes passed.
  Nineteen Playwright browser checks passed on desktop/mobile, covering level-14/15/16 bundles,
  Deadmines at 19, unknown rewards, faction/entry gates, the 50-minute scenario, exact selected steps,
  sharing/restoration and no horizontal overflow.
- Deployed free preview as Helper `kfc-helper-leveling-preview-20261004-r1` after the complete
  clean Linux workspace check, formatting and staged standalone checks. The community link is live
  in `.next-release-leveling-20261004-r1`; only its two listing source files changed and the previous
  copies are backed up under `.data/private/leveling-source-20261004-r1`. Both named web processes
  were reloaded; the ingest PID/restart count remained unchanged. No migration was needed.
- Live directory, guide, Trader, sitemap, community addons and health checks returned 200. Live
  Playwright confirmed level-15/16 bundle gates, canonical/OG metadata, no browser errors and no
  mobile overflow. Mac and Linux maintainer ZIPs have identical SHA-256
  `e819d885263e2d9c361ce1af7186f71033b70e92b3a05ff29cb0bc07c6bd9df7` (4,999 bytes).
- Next product work follows the dedicated Leveling experience plan above; build-70205 playthrough
  and runtime XP observations remain gates for speed claims and reviewed route expansion.
  RestedXP installation/playthrough and protected Revolut configuration/fulfillment are still pending;
  neither a paid guide nor complete beta/1–60 coverage is advertised.

### Developer bootstrap

- `pnpm desktop:dev` deliberately targets the production ingestion API at
  `https://helper.kfcguild.online`, overriding any previously saved localhost endpoint. Maintainer
  development uploads therefore require the separately revocable production collector token; the
  repository `.env` token remains local-only.

- `pnpm dev` is the single local entrypoint. It safely creates `.env`, installs locked dependencies,
  resolves/starts Docker, starts required infrastructure, migrates and builds, identifies the exact
  installed client plus hotfix, bootstraps a missing catalog through every audit gate, and finally
  runs the web server, ingestion API, and SavedVariables companion watcher.
- The same bootstrap queries distinct icon IDs from the exact published catalog, decodes BLP assets
  from CASC into immutable PNGs, records a build-specific manifest, and gives Next.js the media root.
  It is idempotent and does not require a separate image command.
- Bootstrap is idempotent: an exact published product/build/locale/hotfix/definitions tuple skips
  extraction and import. `pnpm dev:setup` performs the same preparation without long-running servers.
- The watcher receives the detected product directory and local ingestion configuration from the
  bootstrap. It discovers every account-wide `WowTraderCollector.lua`, waits for stable file size and
  modification time, uploads unseen scans sequentially, retries transient parse/upload failures, and
  relies on stable scan IDs plus API conflict checks for crash-safe idempotency.

### Catalog extraction and import

- A real `TACTSharp`/`DBCD` extractor opens the installed product, reads 36 recipe and item-library
  DB2 tables, applies `DBCache.bin`, and emits raw base/effective plus normalized gzip NDJSON
  artifacts atomically.
- Manifests pin product/build keys, locale, hotfix hash, definitions revision, extractor version,
  per-artifact counts, and SHA-256 checksums.
- Catalog snapshot schema v4 makes actual item level, item-library relationships, and deterministic
  consumable item transformations mandatory; v1-v3 snapshots must be re-extracted rather than
  silently importing incomplete rows. Snapshot keys,
  output directories, and developer-bootstrap reuse checks include the schema version.
- Normalization covers item scalar facts, ordered stats/damage/resistances/sockets/effects, item sets,
  class/race restrictions, class/subclass labels, unique-equipped categories, gems, enchantments,
  random properties/suffixes, and build-shipped bonus-tree definitions in addition to the recipe and
  profession graph. Raw `ItemDisenchantLoot` rows retain build-specific disenchant eligibility and
  required Enchanting skill brackets.
- Item-use transformations are normalized separately from profession recipes. A consumed single-use
  trigger item is included in the input quantity, so spell 28100 correctly records ten Motes of Air
  to one Primal Air rather than the nine additional spell reagents alone. Reusable/stateful item
  effects are not guessed into the material graph.
- The TypeScript catalog layer rechecks checksums/counts, path safety, duplicates, foreign keys, the
  TBC golden chain, and build-to-build topology changes.
- `catalog:audit` verifies every manifest-tracked raw and normalized artifact, proves source ID
  coverage, re-derives each normalized item field, and checks that the full source records survive in
  `rawRecord`.
- PostgreSQL import is transactional, chunked, idempotent, build-versioned, and gated behind explicit
  review/publish promotion. Initial availability is `client_only`.

### Auction House and market path

- The TBC addon listens to Auctionator `335` full-scan events and groups listing stacks into exact
  market-key price levels. Its slash command delegates scanning to Auctionator's normal permission
  check; no throttle bypass or HTTP exists in Lua.
- `WowTraderCollector` is installed in the local Anniversary client's `Interface/AddOns` directory.
  Its installed `Collector.lua` and TOC hashes match the repository sources. Auctionator is installed,
  declares interface `20506`, and loads the legacy AH full-scan implementation used by this client.
- The TypeScript companion parses SavedVariables without executing Lua, validates the collector
  schema, creates a canonical SHA-256 payload, uses stable retry IDs, requires TLS outside loopback,
  and tracks successful scans locally.
- The authenticated Fastify API stores immutable raw payloads and normalized scans/price levels with
  checksum verification, idempotency, conflict detection, rate limits, upload status, and public data
  status. Database constraints guard positive prices/quantities, valid time ranges, completeness, and
  catalog topology.
- The installed collector has now completed a real EU/Spineshatter Alliance scan on TBC build 69795.
  Companion parsing and upload succeeded for 12,225 market keys. PostgreSQL stored 58,581 aggregated
  price levels covering 7,050 base item IDs, 170,028 listings, and 1,022,041 listed units; the upload
  reached `processed` status and a repeat companion run correctly reported no pending scans.
- The canonical calculation source is the collector's depth-preserving copy of Auctionator's raw
  completed scan. Auctionator's own CBOR-serialized database keeps only last/daily low/high and peak
  availability for 21 days, so it may seed lower-confidence history but must not drive depth-sensitive
  opportunity calculations.
- Market analysis provides actionable depth summaries, rolling median/MAD, EWMA price/supply, an
  explicitly experimental range, and a walk-forward backtest against last-price error.
- Crafting economics consumes complete price levels and uses integer copper/fractions, AH cut,
  deposits, fill rate, cooldown opportunity cost, capital, ROI, and insufficient-depth states.

### Website

- `/` is the KFC Helper game chooser, followed by `/tbc` and `/forever` product choosers. The live
  workbench moved to `/tbc/trader`; the legacy `/opportunities` route follows it. Forever shows
  honest unavailable states until its public client catalog and compatible AH scan exist.
- The Helper shell now reuses the parent KFC site design system: the exact KFC mark, Cinzel/Inter/
  JetBrains Mono fonts, near-black and amber tokens, fixed 72px navigation, square controls,
  restrained guild-card ornaments, responsive mobile menu, and reciprocal guild link. The in-game
  item tooltip intentionally retains WoW styling inside that shell.
- The TBC workbench provides market selection, crafted-product-name search, profession tabs,
  AH/vendor/best-route tabs, profit/ROI sorting, and expandable calculation evidence. The old
  `/opportunities` surface redirects to this single source.
- Each collapsed opportunity summary is one keyboard-accessible link to its recipe detail, so any
  visible price/yield/profile cell can be clicked instead of only the recipe name. Its separate
  calculation disclosure still expands in place without navigating.
- `/tbc/encyclopedia` is a catalog-backed archive with unified item/recipe/profession name and exact
  ID search, type tabs, build/count provenance, item icons, bounded results, a complete profession
  directory, and namespaced item/recipe/profession details. TBC catalog and market queries are pinned
  to client product `wow_anniversary` so a later Forever publication cannot contaminate TBC routes.
- Encyclopedia item results expose an in-game-style stat tooltip on pointer hover and keyboard focus.
  One bounded batch hydration supplies all visible results rather than issuing a detail query per
  hovered item. Desktop placement measures the row, natural tooltip height, and available viewport
  space on hover/focus/scroll/resize, selects above or below, and caps height to the selected side;
  mobile remains a viewport-bounded bottom panel without horizontal overflow.
- Item detail pages render the same semantic tooltip from normalized client facts: quality, binding,
  unique rules, slot/type, damage/speed/derived DPS, armor/resistances, stats, sockets and bonuses,
  gems, durability, class/race/level/skill/ability/reputation requirements, use/equip effects, item
  sets, and flavor text. Unsupported runtime spell formulas remain explicit fallbacks. The former
  profession-role summary is now a `Loot info` phase boundary: source is `Pending verification` and
  drop chance is `Unknown` until the acquisition graph is implemented. A build-specific external
  link opens the matching TBC Wowhead item in a new tab so maintainers can inspect community source
  information without presenting it as locally verified evidence.
- The workbench supports Transmutation, Potion, and Elixir Master profiles for the verified TBC
  build, including specialization-uplift sorting, expected/possible yields, and separate base versus
  mastery profit. The current `1.20×` expected-output assumption is build-locked, versioned, and
  labeled provisional because proc probability is server-side and not present in client tables.
- Crafting profiles now change with the selected profession and cover the TBC Alchemy,
  Blacksmithing, Engineering, Leatherworking, and Tailoring branches. Build-locked recipe access
  rules hide specialist-only crafts unless the matching branch is selected; Tailoring specialty
  cloth uses its guaranteed doubled output, while Alchemy expected procs remain provisional.
- `Use alt-crafted materials` recursively compares AH purchase with deterministic cross-profession
  production and item-use conversion, aggregates shared raw demand before consuming order-book
  depth, always excludes time-gated crafts, and displays the raw purchases, ordered alt steps, batch
  leftovers, transfer count, direct-AH comparison, and savings. It warns when a cash-profitable final
  craft is
  unprofitable at direct intermediate AH values so the player can consider selling the intermediate.
- The account crafting profile is presented as one responsive settings workflow with accessible
  switches, clearly grouped specialization selectors, and a single recalculation action. The former
  mobile rule that hid every profile label/control has been removed.
- The Enchanted Leather golden path now uses Rugged Leather plus Lesser Eternal Essence and can feed
  Leatherworking/Tailoring chains. Its displayed skill requirement is corrected through an audited,
  build-specific override to Enchanting 250; the client `MinSkillLineRank=1` value is not treated as
  authoritative for this trainer recipe.
- Opportunity, item, and recipe views render build-native product icons with quality borders. Of
  3,165 distinct icon IDs referenced by the current catalog, 3,163 decode to PNG; two source assets
  are non-BLP and are explicitly recorded as unavailable placeholders.
- AH output quotes use a quantity-weighted p10 ask backed by at least three listings, while reagent
  cost consumes exact current order-book depth. Vendor exit is valued independently. Disenchant exit
  uses a build-locked static TBC distribution for green/blue/epic weapons and armor, exposes the
  required Enchanting skill, and is withheld unless every possible material has a supported live AH
  quote. Normal-price signals remain gated on history.
- Next.js routes also exist for items, recipes, professions, realm markets, a manual crafting
  calculator, and data status.
- Pages read published catalog builds and accepted scans; no demo/fake market data is used.
- Item pages show current depth, recent price history, and the conservative baseline only when enough
  scans exist. Recipe pages separate the exact direct game formula from a recursive,
  quantity-scaled material-provenance chain. Deterministic alternatives use explicit `OR` branches;
  acquisition leaves, cycles, depth limits, variable output, and time-gated methods have distinct
  states. Cooldown methods remain collapsed informational evidence and never affect profit totals.
- Empty, unavailable, and responsive mobile/desktop states are present.

### Item library and transformations

- Snapshot schema v4 plus migrations 0004-0005 normalize item-library facts and item transformations
  into build-versioned rows.
  The verified build contains 25,544 item stats, 4,518 damage rows, 12,907 armor/resistance rows,
  3,132 sockets, 17,481 item effects, 388 sets, 1,629 set members, 883 set effects, 2,044
  enchantments, 259 gem properties, and 3,162 random-enchantment rows.
- Item 32837 is the golden proof: extraction and rendering recover its 214-398 damage, 2.80 speed,
  +22 Agility, +29 Stamina, +21 Hit, Warrior/Rogue and level restrictions, set ID 699, item level 156,
  and equip-effect spell 15810. Its 109.3 DPS is derived exactly from the normalized damage and delay.
- The supplied in-game screenshot combines client facts with AtlasLoot, GearScore, GearQuipper, and
  AtlasBIStooltips output. The planned renderer keeps game facts, acquisition claims, and analysis
  annotations as separately versioned layers instead of flattening them into item data.
- The installed AtlasLoot source package has 3,952 TBC item keys and proves that Warglaive 32837 maps
  to Black Temple, Illidan Stormrage (NPC 22917), phase 3. Its separate drop-rate data has no
  Warglaive probability, so source and drop chance must remain separate claims. Only 2,514 of the
  catalog's unfiltered 19,244 non-zero-inventory-type rows intersect those AtlasLoot keys, confirming
  that AtlasLoot is a seed rather than a complete acquisition database.
- A direct CASC/DB2 probe of build 69795, including the current `DBCache.bin`, found zero base and
  effective rows in `JournalEncounterItem`, `JournalEncounter`, `JournalEncounterCreature`,
  `JournalInstance`, `JournalTier`, `JournalTierXInstance`, and `AdventureJournalItem`;
  `CollectableSourceEncounter` is not shipped. The client does retain map 564 as Black Temple and
  dungeon encounter 609 as Illidan Stormrage on map 564, but it contains no item-to-encounter edge.
  Therefore the client can validate the encounter/map backbone, not the Warglaive drop claim.
- The installed AtlasLoot source overlay explicitly maps items 32837 and 32838 to tuple `{25,9,1}`:
  Black Temple, the Illidan boss block, and source type `Loot`. The corresponding raid definition
  names Illidan Stormrage, records NPC 22917, and lists both items. Neither Warglaive nor NPC 22917
  has an entry in AtlasLoot's separate `droprate.lua`, so their source can be imported while their
  probability remains unknown.
- Stats alone can produce a labeled candidate ranking, not defensible BiS. Final BiS requires
  build-specific class/spec mechanics, rating caps, talents/rotations, procs, sets, legal whole-loadout
  optimization, encounter assumptions, and phase/acquisition filtering.
- `docs/list.txt` now supplies a reviewed validation corpus of 27 readable Wowhead TBC BiS guides:
  22 Phase 3 guides plus five earlier Warrior guides. Their pages expose item IDs, alternatives,
  source references, rationale, and usually complete gear-planner payloads, but they are not a
  complete or uniform formula source. Some defer mechanics to unlisted stats/gem/rotation guides,
  contain editorial template residue, or omit phase/spec combinations. Treat them as versioned
  comparison fixtures rather than production truth or republished authored content.
- The guide corpus confirms that the BiS input contract must include character race/talents/faction/
  professions, raid buffs and group support, target level/armor/type, encounter duration and attack
  profile, phase/source constraints, and an explicit objective. Results must support multiple goals
  such as threat versus mitigation or healer throughput versus sustain and explain cap/set/proc
  decisions rather than publishing one opaque per-slot score.
- `packages/bis` implements the game-agnostic optimizer foundation: exact build/spec applicability,
  eligibility and phase filtering, interchangeable slots, per-item and shared unique limits,
  two-handed slot blocking, set activation, conditional item effects, piecewise stat curves, hard
  minimums, deterministic exhaustive/beam search, diagnostics, and explanation/confidence output.
  An answer is `definitive` only when the model is validated, candidate/variant coverage is declared
  complete, the search is exhaustive, selected availability is verified, and no effect anywhere in
  the legal candidate frontier is unresolved. This prevents an unknown proc on an unselected item
  from producing a false BiS claim. The package contains no invented TBC or Forever weights;
  class/spec evaluators remain separately versioned inputs.
- The maintained MIT-licensed simulator reference is `wowsims/tbc-new` (HEAD observed during this
  research: `9fa04e0675354c1fa2167b83171bbfce5df492ef`). Its project requests a visible backlink when
  reused. The old `wowsims/tbc` repository explicitly says it is unmaintained. Neither is a runtime
  item-data authority for this product; a pinned simulator may be used as independent TBC model
  validation evidence.

## TBC proof result

Validated against `wow_anniversary` client `2.5.6.69795`, build `69795`, with hotfix SHA-256
`4d0fe6f994b4b2c6a84f9aa12a1bb1bcb1de4a6159d9f262842f8248beb96bb6` and WoWDBDefs revision
`e6828ce1a61ad05e9693e762fcfd39666454cc62`.

The snapshot contains 30,133 items, 28,695 spells, 10 professions, 2,166 recipes, 6,276 inputs,
2,166 outputs, 1,578 teaching links, 200 item transformations, 335 transformation inputs, and 200
transformation outputs. There were no encrypted records/sections. Eight ambiguous
client relationships are retained as warnings. Applying the hotfix changed ItemSparse from 30,132 to
30,133 effective rows.

The item coverage audit verified all 102 schema-v4 artifacts: 36 base/effective DB2 pairs and 30
normalized files, including 74 base/effective `ItemDisenchantLoot` rows. The client contains 30,145 unique structural
`Item` rows; 12 have no name or economic metadata in either `ItemSparse` or `ItemSearchName`. Every
one of the remaining 30,133 source IDs is normalized, with zero unexpected IDs, zero derived-field
mismatches, and zero raw-record preservation mismatches.

The rare chain `13486 -> 17563 -> (12808 x1) -> (7080 x1)` was recovered with Alchemy rank 275,
25-second craft time, and cooldown category 310 / 20-hour shared cooldown. Independent extraction
runs produced identical normalized artifact descriptors, and every gzip artifact passed integrity
testing.

## Verification completed

- Extractor Release build: zero warnings and zero errors.
- .NET snapshot validation: valid.
- TypeScript snapshot validation with `--tbc-golden`: valid.
- TypeScript full artifact and item-source audit: valid.
- Repeat extraction normalized descriptors: identical.
- Contracts, catalog, companion, economics, ingest API, and market unit tests: passing.
- Website strict typecheck, ESLint, and production build: passing.
- Full root `pnpm check` and `pnpm format:check`: passing after final integration.
- All PostgreSQL migrations applied to a disposable PostgreSQL 17 instance. The real TBC snapshot
  imported as `review_required`, promoted idempotently to `published`, and returned the exact expected
  counts and golden recipe row through SQL.
- A disposable AH fixture was accepted by the running Fastify service, an identical retry returned
  `duplicate: true`, and SQL retained one upload, one scan, and three price levels.
- The one-command developer bootstrap completed a clean local setup through real extraction, audit,
  validation, import, and publication. A repeat run skipped extraction/import for the exact matching
  build, and `pnpm dev` served API health, the home page, and recipe 17563 successfully.
- After the local hotfix cache changed, bootstrap detected the new SHA-256 instead of reusing the
  stale catalog, re-extracted and passed all 37 artifact/item audit plus golden validation gates, and
  published the new exact tuple. An immediate repeat reused it and finished without extraction.
- Bootstrap extracted 3,163 valid browser PNGs from 3,165 distinct client icon references, recorded
  both unavailable non-BLP references, and an immediate repeat reused the complete manifest without
  running extraction.
- The deployed addon completed its first live Auctionator scan. Its 6.9 MB SavedVariables file parsed
  successfully, the companion uploaded it, and the real Spineshatter market and opportunity routes
  both returned HTTP 200 against the normalized scan.
- The market workbench was rendered against that live scan and visually checked at desktop and mobile
  breakpoints. Best-route, Alchemy, vendor, disenchant, search, and ROI-filter requests returned HTTP
  200; the legacy opportunity route redirects to `/`. After the static disenchant integration, the
  current live data yields 626 best-route quotes, 617 AH quotes, 11 vendor quotes, and 23 profitable
  craft-to-disenchant quotes before search/profession filtering. The top 50 are rendered after
  filtering to bound response size.
- A fresh TBC extraction parsed all 74 `ItemDisenchantLoot` rows, normalized actual item level for
  30,133 items, and passed the 37-artifact source audit with zero derived-field or raw-record
  mismatches. The static probability model has exact rational expected yields and tests for armor,
  weapon, uncommon, rare, epic, skill, build, and unsupported-gap behavior.
- `pnpm dev:setup` recognized the snapshot-schema upgrade, extracted/audited/validated/imported and
  published v2 alongside the older row, reused the existing icon set, and then skipped extraction and
  import on an immediate repeat.
- The full root lint, strict typecheck, test suite, production build, and formatting check pass after
  the workbench implementation. Market tests cover robust p10 pricing, and workspace tests cover
  AH/vendor comparison, insufficient reagent depth, absent AH output, and thin-listing rejection.
- The full root `pnpm check` and `pnpm format:check` pass after account-network integration. The new
  tests cover recursive cross-profession acquisition, exact shared-leaf depth, buy-versus-craft,
  integer leftovers, missing intermediate listings, cooldown and known-recipe exclusion, reversible
  conversions/self-loops, specialist recipe locks, Tailoring guaranteed yield, prepriced final
  economics, and the audited Enchanted Leather skill requirement.
- The running workbench returned HTTP 200 with all five specialization families and account-network
  mode enabled against the live Spineshatter scan. It rendered Enchanted Leather as Enchanting 250,
  replaced it inside Leatherworking and Tailoring results, showed raw-leaf purchases and one
  cross-profession transfer, and completed the unfiltered live account-network request in about
  three seconds in the development server.
- The running production web build returned HTTP 200 without fallback errors for the home, recipe
  17563, item 7080, Alchemy, market, opportunities, data-status page, and data-status API routes.
- Companion auto-discovery found the real account-wide collector file under `_anniversary_`; inspect
  parsed its 12,225 markets, watch mode detected the single file, and an API replay was accepted as
  the existing stable payload rather than creating another market scan. A second watch start with the
  recorded local state made no upload. Companion lint, strict typecheck, seven tests, and production
  build pass.
- Playwright Chromium verified the account-profile workflow at 1440×1000 and 390×844: both switches
  are discoverable by accessible name, toggle by label and keyboard, all five specialization selects
  are visible, submitted values survive navigation, and neither viewport has horizontal overflow or
  clipped/collapsed profile controls.
- Playwright Chromium verified the KFC Helper root → TBC → Encyclopedia navigation, exact recipe ID
  17563 resolution, all ten profession entries, two explicit Forever readiness states, and zero
  horizontal overflow across the root, both product choosers, TBC Trader, and TBC Encyclopedia at
  390×844. All new routes and namespaced TBC detail pages returned HTTP 200 against the live catalog.
- A new schema-v3 extraction passed the 99-artifact audit and Warglaive golden validation, then
  imported and published 30,133 items plus every item child relation to PostgreSQL. The live
  Encyclopedia returns item 32837 with the exact client facts above. Playwright with Chromium
  verified its search-result tooltip on hover at 1440×1100 and keyboard focus at 390×844; both were
  fully inside the viewport with no horizontal overflow.
- Playwright Chromium verified the KFC-aligned desktop and mobile shell, responsive navigation, item
  16863 loot placeholder, and collision-aware Warglaive placement. At 1440×1100 the preview moved
  below a row at y=79 and above the same row at y=728, remaining fully within the viewport; at
  390×844 the focus preview stayed inside a 12px horizontal and bottom gutter. No browser console,
  hydration, or horizontal-overflow errors remained.
- Playwright Chromium verified that an opportunity ROI cell navigates through the full-row recipe
  link, the row exposes an accessible name and normal keyboard focus, and the adjacent calculation
  disclosure opens without navigation or browser console errors.
- The schema-v3 implementation passes the complete root lint, strict typecheck, 73-test suite,
  production build, and formatting gates. The .NET Release extractor build passes with zero warnings
  and errors, database migration 0004 applies idempotently, and the real snapshot recheck reports 99
  valid artifacts with no missing IDs, field mismatches, raw-record mismatches, or relationship
  issues.
- The schema-v4 extraction and migration add 200 deterministic item-use transformations with 335
  inputs and 200 outputs. The 102-artifact audit and TBC golden validation pass with zero missing
  normalized IDs, unexpected IDs, derived-field mismatches, raw-record mismatches, or relationship
  issues. The .NET extractor build passes with zero warnings and errors.
- The current root lint, strict typecheck, 79-test suite, and production build pass. Formatting also
  passes after the production-chain integration. Regression coverage includes direct/shared cooldown
  rejection, transformation eligibility without learned recipe IDs, integer quantity scaling,
  alternative producers, reversible-conversion cycle termination, and direct-versus-network cost.
- Headless Chromium verified recipe 41163 at desktop and 390px mobile widths. The page distinguishes
  the direct craft formula from recursive material provenance, renders deterministic Mote-to-Primal
  conversions and Heavy Knothide quantities, collapses cooldown and circular alternatives as
  informational evidence, and has no horizontal overflow at 390px.
- The new `@wow-trader/bis` catalog adapter converts published item rows into build-bound base gear
  variants with legal slots, exact static stats/resistances, weapon damage and speed, sockets, class
  and race masks, profession/proficiency/required-ability gates, unique limits, effects, sets, and
  evidence-backed availability. Unknown numeric stat families are preserved under stable keys rather
  than discarded. The current TBC loader declares candidate coverage partial because gems, enchants,
  acquisition phase, and mechanics effects are not yet a complete validated frontier.
- The TBC Encyclopedia home now places a 28-entry class/spec/role BiS directory directly below the
  ten professions. Every entry opens a real catalog-audit workspace showing class/level-filtered base
  candidates by slot and the publication gate; it does not mislabel item-level previews as calculated
  BiS. Client-only rows remain provisional.
- The product chooser now uses local TBC and official Forever logo art, the TBC/Forever tool choosers
  use in-game coin/book icons, and every Encyclopedia profession and BiS class card uses a local
  in-game icon. Asset provenance is recorded in `apps/web/public/wow-assets/README.md`; the UI has no
  runtime dependency on the source image hosts.
- Playwright Chrome screenshots verified the logo/tool chooser at 390px, the complete profession and
  BiS class directories at 390px and 1440px, and the catalog-backed Protection Warrior workspace at
  1440px. Every sampled local visual asset and the root, TBC chooser, Encyclopedia, and BiS workspace
  routes returned HTTP 200. The full root lint, strict typecheck, 95-test suite, production build,
  and formatting checks pass.

### Search discovery and live search

- `kfcguild.online` now presents WoW Forever as the guild's primary next chapter without erasing its
  earlier TBC progression history. The dedicated `/wow-forever` recruitment page uses only
  Blizzard-confirmed launch facts and leaves the final realm/faction undecided until they are
  verified.
- The guild site now has unique Forever-focused page titles and descriptions, apex canonicals,
  Open Graph and Twitter cards, a generated 1200x630 KFC share image, Organization/WebSite/WebPage/
  FAQ/breadcrumb structured data, a manifest, updated `robots.txt`, updated `llms.txt`, and a
  sitemap entry for the Forever landing page. The home H1 also identifies KFC semantically as a WoW
  Forever EU raiding community while retaining its established visual design.
- Nginx now redirects both HTTP hosts and the HTTPS `www.kfcguild.online` duplicate to the canonical
  `https://kfcguild.online` host in one hop. The previous Nginx configuration remains recoverable at
  `/etc/nginx/sites-available/kfcguild.online.before-seo-20260915`.
- Helper now has unique canonical metadata for its product pages and catalog-backed item, recipe,
  profession, BiS-candidate, and market pages. Legacy detail routes canonicalize to their namespaced
  TBC URLs. Filter/search result URLs and operational pages use `noindex, follow` so they do not
  compete with their stable landing pages.
- Helper publishes robots/manifest routes, WebSite/WebApplication and breadcrumb structured data,
  and a generated 1200x630 share image. Its database-backed sitemap currently contains 32,343
  canonical URLs: all 30,133 published TBC items, 2,166 recipes, ten professions, 28 BiS workspaces,
  static product pages, and the observed market route. At 6,044,655 bytes it remains within the
  single-sitemap search-engine limits; split sitemap indexes are required before it reaches 50,000
  URLs.
- Encyclopedia and Trader search are now debounced live searches. They update results and the
  shareable URL without a submit action, expose progress through an accessible live status, support
  Enter and Clear, and avoid the initial-hydration input reset race. Trader uses a 400ms debounce
  because each request evaluates market profitability; it also updates the market selector
  immediately and preserves profession, exit route, sort, specializations, and account
  crafting-network parameters. Trader search matches only crafted output names; recipe names,
  profession names, reagents, and numeric IDs cannot make an opportunity match.
- Automatic Next.js prefetch is disabled for Trader's computational profession/exit filters and its
  global navigation link. A browser request audit reduced an initial Trader view plus one live query
  from roughly 15 speculative profitability requests to one initial request and one requested query.
- Production Chrome verified both live-search flows at 390px with no console errors, missing item
  images, or horizontal overflow. It also parsed the guild Forever structured data at 390px and
  1440px, and public smoke checks confirmed the canonical metadata, 1200x630 PNGs, sitemap counts,
  and all three PM2 processes online. A separate throttled-JavaScript test delayed every Next.js
  bundle by three seconds and proved that text entered before hydration survives and triggers the
  correct live result URL in both tools.

### Trader product audit and target experience

- The `2026-09-16` production review found that Trader is a sound quote calculator but is not yet a
  safe action-ranking product. Production currently has only two complete Spineshatter scans, 38.8
  minutes apart, and the newest scan is roughly one day old. The UI still presents a green live dot,
  assumes a 100% output fill rate, charges no expected deposit loss, and ranks current asks as if
  they were realized sales.
- The first-ranked Dawnsteel Bracers example is supported by four listings at essentially the same
  2,486g ask in both scans, with no observed movement. It must therefore be labeled as a thin,
  speculative quote rather than a high-confidence 1,611g action. Three-listing support protects
  against a single listing but does not establish demand or sell-through.
- One observed public request returned about 501 KB with roughly 1.28 seconds to first byte; the
  alt-network variant returned about 648 KB with roughly 3.77 seconds to first byte. Collapsed rows
  currently ship their complete reagent/output/evidence payload, and every filter request reloads
  and evaluates the whole catalog. These are diagnostic samples, not percentile benchmarks, but
  they identify precomputation, caching, pagination, and lazy detail loading as immediate needs.
- The target flow is: validated fresh scan -> summarized market facts -> trust/eligibility gates ->
  personalized quantity and route -> addon shopping/crafting queue -> observed listing/sale outcome.
  Default results should be `Best for me`, based on known recipes, skills, specializations,
  inventory, capital, current stock, and explicit risk preference. The full speculative catalog
  remains available as a separate exploration mode.
- The ranking must separate freshness, price stability, market depth, sell evidence, and character
  eligibility instead of compressing unknown evidence into a profit number. Auction-House routes
  should rank by expected realized profit and capital time, with configurable conservative/balanced/
  speculative modes; vendor and disenchant exits remain deterministic fallbacks. Daily/shared
  cooldown crafts remain excluded.
- The near-term implementation order is: (1) truthful staleness and opportunity-confidence gates,
  contextual filter counts, product-first rows, lazy details, and scan/profile opportunity caches;
  (2) addon character profession/skill/specialization/known-recipe/inventory snapshots plus a paired
  account profile and an installable background watcher that detects a stable SavedVariables flush
  from any character, uploads unseen scan IDs, waits for processing, refreshes PostgreSQL summaries/
  opportunity caches, and signals the website automatically; (3) craft quantity, restock cap,
  capital budget, shopping list, per-alt steps, and addon queue export; (4) repeated 30-minute scans,
  retention aggregates, own auction sale/expiry observations, conservative sell-through estimates,
  alerts, and only backtest-qualified forecasts; (5) a portfolio optimizer for shared materials,
  leftovers, stock limits, and capital allocation. WoW still requires `/reload` or logout before the
  watcher can observe a completed in-memory scan.

### WoW Forever preview Encyclopedia

- The Talents Forever public evidence is now implemented as its own strict TypeScript package and
  PostgreSQL snapshot boundary. `external_data_source`, `external_data_snapshot`, and
  `external_data_publication` keep exact raw JSON, parsed data, supplemental spellbook-icon data,
  parser version, validation report, checksums, review state, and a single public pointer separate
  from canonical `game_build` facts.
- The reviewed local snapshot is source date `2026-09-15`, source payload SHA-256
  `ca6252f8171e519437c42118d03446585b2430cbdadaca2b84c3ceefe11f84c5`, and composite snapshot
  SHA-256 `f9922e4e878491421d418565ec368032749dafa4d70ca0b4823f50dd7dbcc213`. Validation reports 9
  classes, 27 trees, 470 talents, 71 prerequisites, 401 spellbook entries, 366 tooltip records, 40
  ordinary racials, 37 class abilities, 20 Legacy perks, and 40 changelog entries with no errors.
- `pnpm forever:inspect`, `forever:import`, `forever:publish`, and `forever:sync` provide allowlisted
  fetch, schema/semantic audit, review-first import, exact snapshot publication, and local asset
  synchronization. Browser and server render paths read only the published PostgreSQL snapshot; they
  never fetch or execute third-party source code.
- All 574 referenced icons and tree backgrounds are locally cached with SHA-256/byte manifests and
  zero missing assets. The asset route accepts only constrained icon/background keys, while the
  standalone verifier and production synchronization script reject missing, modified, duplicate, or
  unexpected image files before a shared media pointer changes.
- `/forever/encyclopedia` is live locally with all nine talent calculators, prerequisite connectors,
  level/tier/rank validation, legal removal, local saves, snapshot-bound sharing, uncertainty and
  Classic-comparison modes, responsive in-game-style tooltips, and touch action sheets. Spellbooks
  provide class/tab selection, pagination, training ranks, demo-versus-Classic evidence, page motion,
  and mobile sheets. Separate pages cover racials, class abilities, Legacy perks, source changelog,
  provenance/coverage, and the public `/api/v1/forever/preview.json` export.
- The visual implementation is original KFC React/CSS/SVG work. It uses a three-tree game-inspired
  workspace and responsive leather/parchment spellbook without copying Talents Forever application
  code, markup, analytics, branding, or runtime behavior. The repeated third-party attribution
  paragraph was removed from all feature pages on `2026-09-16`; a compact snapshot/version notice
  remains so users can still distinguish the pre-release evidence from client-verified data.
- Strict package and web lint/typecheck pass, 57 focused tests and the full 110-test root suite pass,
  and the full production build succeeds. Headless Chrome verified a 1440-pixel calculator,
  in-viewport keyboard tooltip, talent
  allocation from 0 to 1 point, a 398-pixel layout with no horizontal overflow, and a touch-emulated
  spell tooltip bottom sheet with its accessible close control.
- Root `pnpm dev` now reuses a matching published preview snapshot/complete manifest or initializes
  them once, then injects the absolute asset root before starting Next.js. Production requires a
  separately verified shared Forever asset release and `FOREVER_ASSET_ROOT`; it never runs this
  development bootstrap.
- Asset reuse now trusts a local file only when its bytes and SHA-256 still match the same-snapshot
  manifest. A regression test corrupts a cached icon and proves the next sync redownloads it instead
  of blessing the altered bytes.

### Production deployment

- The no-Docker Helper is live at `https://helper.kfcguild.online`. The KFC site remains in its
  existing named PM2 process (`kfc-website`, runtime ID 30 when verified). `kfc-helper-web` and
  `kfc-helper-ingest` are isolated named sibling processes in the `kfc` namespace; numeric PM2 IDs
  are not deployment contracts. Release `kfc-helper-product-search-20260916-r9` is active. It keeps
  the compact Forever snapshot notice from `r8` and limits Trader search to crafted output names.
- Nginx redirects HTTP to HTTPS, proxies UI traffic to loopback port 19210 and authenticated
  ingestion to loopback port 19211, keeps `/health` and `/docs` private, and rejects dotfile probes
  before they reach either application. ACME challenges remain explicitly available for certificate
  renewal. Both public KFC hosts reject recognizable non-Google crawlers at the edge; Googlebot
  remains allowed, with a six-request-per-minute per-address limit on the database-backed Helper,
  and normal browser traffic is not throttled. GPTBot had
  saturated the web process at about 91% CPU immediately after discovering the 32k-page sitemap;
  after edge rejection and a clean web restart, both Helper processes measured 0% CPU while public
  browser requests remained healthy. The active release also publishes a
  matching `robots.txt` disallow policy for cooperative non-search crawlers, and the guild site
  publishes the same policy. User-agent matching cannot identify a bot that deliberately impersonates
  a normal browser or Googlebot; server-side limits and dotfile blocking remain the fallback, while
  verified Google IP ranges or an edge bot-management service are later options if disguised or
  volumetric abuse appears. The Let's Encrypt certificate expires on 2026-12-14 and automatic
  renewal is configured.
- PostgreSQL 15 now contains the migrated `wow_trader` database and separate server-generated owner,
  read-only web, and limited ingestion roles. Secrets remain only in mode-0600 server environment
  files. The database has one published build with 30,133 items, two market scans, and 117,310 price
  levels. Game extraction, audits, catalog publication, and icon extraction remain local and use an
  SSH tunnel where direct database access is required.
- The current TBC catalog build and all 3,163 icon PNGs passed checksum validation before publication.
  Two real SavedVariables scans were accepted, and both local and public-HTTPS replays were detected
  as duplicates without adding rows. A custom-format PostgreSQL backup passed a complete disposable
  restore drill with matching counts.
- Migration `0006` and the exact reviewed Forever snapshot are live in production. A 7.8 MiB
  custom-format backup passed `pg_restore --list` before migration. The snapshot was first imported
  as `review_required`, then exact checksum `f9922e4e8784…cc213` was promoted; all 574 visual assets
  passed checksums both locally and on the server. The read-only web role has explicit access and the
  runtime uses only PostgreSQL plus the shared immutable asset release.
- The KFC desktop/mobile navigation now links to the Helper and treats the subdomain as first-party
  analytics traffic. KFC's own production build passed using tunneled server dependencies, only the
  named KFC process was restarted, and its root remained healthy with the Helper link present.
- Public root, chooser, Trader, TBC Encyclopedia search, Warglaive item, BiS workspace, Forever
  overview, every Forever reference surface sampled, all nine class routes, public preview export,
  and both icon families return HTTP 200; an unknown Forever class correctly returns 404 and public
  ingestion health/docs return 404. Headless Chrome verified the live desktop talent allocation and
  in-viewport tooltip plus the mobile spellbook touch sheet, with every sampled image decoded and no
  horizontal overflow. PM2 process 30 kept the same PID and remained online throughout activation.
- Production storage remains a hard scheduling gate. At roughly 16 MiB per full scan and 48 scans per
  day, current raw/full-depth retention would grow by about 0.75 GiB per day. Unattended 30-minute
  uploads are intentionally disabled until summary aggregation, tested coordinated retention,
  recurring backups, and disk/data-freshness alerts are implemented, or storage is expanded beyond
  200 GiB for the original 180-day full-depth goal.

### Trader trust/performance and watcher release (2026-09-16)

- The first trust release is implemented locally. Trader scan health now classifies scans as fresh
  (at most one hour), aging (one to three hours), or stale (over three hours); stale data is visibly
  reference-only instead of showing a green live indicator. AH exits are labeled speculative asks,
  disenchant routes modeled EV, and vendor exits deterministic, with stale-input qualifiers.
- Results are product-first, and profession/route counters now respect the active product query and
  profession. Collapsed result rows no longer embed their complete calculation payload. Opening
  `Show calculation and evidence` fetches the exact recipe/route/profile detail from a dedicated
  endpoint, retaining loading/error/retry states and cutting the initial RSC/HTML payload.
- Collector `0.2.0` adds optional source character name, realm, faction, and GUID without changing
  SavedVariables schema version 1, so queued `0.1.0` scans remain uploadable. Migration
  `0007_cloudy_magus.sql` adds nullable private provenance columns to `raw_upload`; public market
  status and recommendations never expose them.
- The companion now waits for a final `processed` upload status before writing its mode-0600 local
  completed-ID state. Failed parsing, transport, processing, and rejected receipts remain retryable
  under a bounded 5-second-to-5-minute exponential schedule. Status logs name the private source
  character when available.
- `pnpm companion:install:macos` builds and installs a per-user LaunchAgent using a protected API-key
  file, automatic start/restart, durable state, and logs outside the repository;
  `pnpm companion:uninstall:macos` removes the service while preserving identity/state against replay.
  The production installer is intentionally not activated until the documented 30-minute retention
  storage gate is implemented.
- An open Trader page polls a lightweight market-specific status endpoint every five seconds while
  visible/online and calls a server-component refresh when a newer processed scan arrives. If the
  rendered workspace does not catch up within four seconds, the page performs one hard reload; focus,
  page-show, and visibility changes also trigger an immediate check. The addon still cannot force WoW
  to flush: after Auctionator finishes, `/reload` or logout remains required.
- Remaining product phases are imported character professions/skills/specializations/known recipes/
  inventory, execution queues and addon export, retained observation summaries and sale/expiry
  evidence, risk-adjusted demand ranking, alerts/backtests, and portfolio allocation.
- The Electron implementation in `docs/desktop-companion-plan.md` is now working as unsigned
  maintainer-alpha macOS, Windows, and Linux x64 packages. `packages/companion-core` is shared by the
  CLI and Electron utility process and covers serialized multi-product polling, stable-write
  detection, processing receipts, cancellation, bounded retry, v1-to-v2 state migration, and
  restart-safe scan IDs.
- `apps/desktop` provides the local KFC-styled React dashboard, sandboxed custom-protocol renderer,
  validated narrow IPC, async `safeStorage`, automatic/manual upload controls, product/account/file
  health, verified collector `0.4.0` install/update, recent private activity, tray/close-to-tray,
  start-at-login, notifications, power-resume reconciliation, rotating redacted logs, single-instance
  focus, worker crash restart, and legacy LaunchAgent removal. The packaged runtime loaded its full
  renderer and narrow preload API, found the local Anniversary/Auctionator/collector installation,
  completed a manual IPC reconciliation, had zero horizontal overflow at the default viewport,
  remained alive after window close, and enforced one application instance.
- Public/guild distribution remains blocked on per-installation one-time pairing/revocation instead
  of a shared key, branded application/tray assets, macOS signing/notarization, Windows signed-package
  validation, clean-machine install/upgrade drills, and the existing production storage/retention
  gate. `pnpm desktop:dev`, `desktop:package`, and `desktop:make` are the maintained entrypoints.

### Forever world Encyclopedia implementation (2026-09-17)

- `world-snapshot-manifest.v1` and `map-media-manifest.v1` are implemented as separate,
  build-scoped contracts. The .NET extractor now reads maps, areas, UI-map assignments/art,
  overlays, POIs, taxi nodes, static game objects, encounters, LFG rows, structural quest data,
  quest POIs, and appearance source hints; it preserves raw/effective rows and emits deterministic,
  checksummed normalized artifacts.
- The real `wow_classic_beta` build `1.60.1.69893` extraction passed a full artifact and media audit:
  73 maps, 60 UI maps, 1,372 areas, 1,986 POIs, 341 encounters, 169 creature objectives, 60 bosses,
  76 boss locations, 175 boss spell candidates, 802 source candidates, 6,600 quest identities, 54
  quest POI blobs, 1,288 item source hints, and all 1,672 referenced map tiles decoded with zero
  missing tiles. The current immutable local manifest is under
  `artifacts/world-snapshots/wow_classic_beta/69893/enUS/missing-hotfix/world-snapshot-manifest.v1/extractor-0.2.3/`.
- Migration `0008_early_forge.sql` adds typed world snapshot, map/art/tile/assignment, area, POI,
  encounter, LFG, quest/line/POI, and item-source-hint tables. `packages/world-data` validates every
  checksum, imports transactionally against an exact matching catalog build, and refuses publication
  when the hotfix cache or published catalog prerequisite is missing.
- Migration `0009_fresh_tombstone.sql` adds typed creature-objective, boss, boss-location,
  creature-model, boss-spell-candidate, loot-source-candidate, map-difficulty, and content-tuning
  tables. The world importer now writes every enriched artifact transactionally instead of silently
  dropping evidence that was present in the manifest.
- Forever now has Maps, Zones, Instances, Encounters, and Quests navigation and routes. The map
  viewer composes native client tiles, transforms exact client POI/taxi coordinates through the map
  assignment, separates evidence labels, supplies keyboard/scroll/zoom/layer controls, and keeps a
  textual fallback. Instance/encounter/quest pages expose client identity and source hints without
  pretending that appearance provenance is a verified loot table.
- `pnpm dev` now discovers the installed Forever Beta product, reuses or extracts the exact current
  world snapshot, audits every record/tile, and supplies absolute manifest/media paths to Next.js.
  If the beta product is not installed it logs the skip and preserves the TBC development flow.
- Local HTTP and headless-Chrome checks passed for the overview, map directory, Durotar map, instance
  directory, quest index, and a native map-media response. Desktop and emulated-mobile rendering had
  no document-level horizontal overflow. The optimized Next.js build passed with the artifact source.
- Collector `0.4.0` is installed in the Forever Beta client. Diagnostics remain explicitly opt-in
  and local: encounter attempts/actors/loot, a build-pinned 100-ID quest capability sample, NPC
  sightings from target/mouseover/nameplates, loot-slot item/source GUID relationships, and an
  explicit build-pinned boss model resolver. NPC
  records distinguish a subject `unit_position` from an approximate `observer_position`, exclude
  players, deduplicate coordinate cells, and retain at most 5,000 sightings; loot observations are
  independently capped at 5,000 and unknown source types remain unknown. Feature-detected
  `ClosestUnitPosition` results are retained as raw, unverified coordinate evidence and cannot become
  exact pins before an in-game coordinate golden.
- The current companion intentionally ignores `worldDiagnostics`; ingestion, review, aggregation,
  and public promotion contracts are not implemented yet. A runtime observation is evidence that an
  event occurred, not a complete loot table or official drop rate.
- The exact operating procedure and next-build migration steps are in
  `docs/runbooks/forever-world-extraction.md`.

## Known limits and honest boundaries

- The live collector/Auctionator event contract is validated for the installed TBC client and
  Auctionator `335`. Only two real production snapshots exist so far, which is enough for current
  depth and one-craft quotes but not enough for baselines, anomaly signals, liquidity estimates, or
  forecasts.
- Current opportunities evaluate one final craft and deliberately label demand, deposit loss,
  cooldown shadow price, and actual fill probability as unmodeled when they are not observed. The
  account network is a catalog/profile simulation until actual character professions, known recipes,
  skills, inventory, and cooldown state are imported.
- Random-output crafts, Prospecting, and expected disenchant materials are not used as intermediate
  production sources. Time-gated recipes are unconditionally excluded from both ranked final crafts
  and intermediate routes. The current planner optimizes one
  final recipe at a time and does not yet optimize a portfolio that shares leftovers across several
  final crafts.
- The forecast is a baseline, not a promoted predictive model. It needs real scan history and must
  beat naive walk-forward results before stronger claims or alerts are enabled.
- Personalized known recipes/inventory, optional disenchant calibration observations, source/drop
  observations, mastery-proc observations, phase administration, alerts, and production
  auth/credential issuance remain later milestones.
- A WoW addon cannot upload over HTTP, and SavedVariables are current only after logout or `/reload`.
- Client spell text can contain runtime/server formula families the current deterministic resolver
  does not understand. The tooltip shows the client spell name for those cases instead of inventing
  numbers. Random-property, suffix, and bonus definitions are preserved and queryable, but a future
  character/item-instance payload is required to know which variant is actually attached to a
  player's item.
- Classic client files are not assumed to contain complete server loot tables. AtlasLoot is useful
  versioned supplemental evidence, but complete authoritative source/drop data requires an authorized
  feed or separately labeled maintainer/community evidence.
- Talents Forever is now imported through a separate immutable external-evidence pipeline and remains
  visibly labeled. Its own metadata says it was transcribed from BlizzCon demo footage and Blizzard
  slides and can lag the live game; only 187 of 470 talents are marked complete, and most demo spell
  observations have no numeric client ID. It must still be reconciled with the public Forever client
  before any observation becomes canonical. The aggregate `data.json` is the import source; the
  per-class feeds were a day behind and cached as immutable for one year.

### Forever Beta client audit

- The installed `/Applications/World of Warcraft/_classic_beta_/World of Warcraft Beta.app` resolves
  through the shared `/Applications/World of Warcraft/.build.info` to product `wow_classic_beta`,
  version `1.60.1.69893`, build 69893, locale `enUS`, and region `eu`.
- Current WoWDBDefs contains explicit layouts for this exact build. The existing extractor opened 34
  of its 36 TBC catalog tables; only `ItemRandomProperties` and `ItemRandomSuffix` were unavailable.
  Selected readable counts include 19,171 `ItemSparse` rows, 31,767 spells, 7,824 skill-line
  abilities, 3,338 reagent rows, and 42,449 spell-effect rows. The probe reported 4,525 encrypted
  records or encrypted-section records across those tables.
- A diagnostic normalization found 19,171 named items and 2,520 provisional recipes, proving the
  basic catalog graph is present. It is not publishable: the TBC fixed-field parser produced no
  item stats/damage/resistances/effects, 550 reagent/output references were unresolved, one DNT test
  profession surfaced, `ItemEffect` relationships need exact-build decoding, and no local
  `DBCache.bin` hotfix overlay was found.
- The Beta exposes 341 readable `DungeonEncounter` records and 73 maps, including recognizable new
  Forever map groups. Adventure Guide encounter, creature, section, item, and map-location tables
  currently contain zero rows. Static client data therefore supports an evidence-labeled encounter
  directory but not complete boss descriptions, loot tables, or phase availability.
- Creature/model asset tables are populated, including 14,092 creature displays and 1,169 creature
  model rows, but `DungeonEncounter` has no creature/display identifier and the 178 readable
  `Creature` rows are mostly pets/dummies. A deeper static audit found a better identity bridge:
  233 `Achievement`, 1,353 `Criteria`, and 1,951 `CriteriaTree` rows. Criteria type `0` stores an exact
  creature ID in `Asset`, verified by Onyxia -> `10184`. The relevant new/high criteria provide 69
  rows, 39 unique name/ID pairs, and 30 unique creature IDs, including complete Hyjal Summit and
  Barrow Deeps boss groups. Non-zero criterion types must never be interpreted as creature IDs.
- The exact Beta-generated model API exposes `PlayerModel:SetCreature(creatureID, displayID)`,
  `GetDisplayInfo()`, and `GetModelFileID()`. Collector `0.4.0` now contains the diagnostics-only
  capability test using a known creature, Onyxia, one new criteria-derived boss, and an invalid ID
  while standing anywhere in game. The remaining step is to run those controls. If the new boss
  resolves, its reviewed default model can be
  extracted without entering the instance; later encounter observations remain necessary for live
  availability, adds, alternate combat forms, coordinates, and loot. Models must never be guessed
  from names, nearby IDs, or anonymous asset filenames.
- World normalizer `0.2.3` now turns that research into build-scoped artifacts. Build 69893 audits
  cleanly with 169 type-0 creature objectives, 60 criteria-backed bosses (30 IDs at or above
  200,000), 76 evidence-labeled boss locations, 184 statically joined creature/display/model rows,
  175 review-required boss spell candidates, 802 review-required item source candidates, 142 map
  difficulties, and 98 content tunings. The final immutable local snapshot is under
  `artifacts/world-snapshots/wow_classic_beta/69893/enUS/missing-hotfix/world-snapshot-manifest.v1/extractor-0.2.3/`.
- The alias audit caught Blizzard criterion reuse: rows such as `City of Dalaran` and `Blackmaw
Hold` identify the dungeon/area context for the same creature criterion and are not boss aliases.
  They remain available for potential map/area associations but cannot generate boss spell or loot
  matches. Exact `AreaTable` context adds review-required potential zones for seven new/high bosses;
  only Shade of the Archmage, Rath'mael, and Relic Guardian currently have exact encounter-to-map
  edges. None of the 30 new/high bosses has a static creature-model join or an exact client source
  hint for loot in this build.
- The spell candidate graph finds 31 client spell candidates across seven of the 30 new/high bosses,
  including named mechanics for Anara Chillwind, Old Gloomlurker, The Wild King, Elder Minderel,
  Sylvestris Dusksong, and Umbrinoth. Every candidate remains review-required because name/text,
  effect-value, and modifier-tree relationships do not prove that a boss casts the spell live.
- Collector `0.4.0` is installed in the Beta client and packaged by the desktop installer. Its
  explicit `/wowtrader bossmodels controls` experiment tests Mechanical Squirrel, Onyxia, The Wild
  King, and an invalid ID; the build-pinned batch then queries the 30 reviewed IDs three times each.
  Results remain local SavedVariables evidence until the controls are run and the diagnostics upload
  contract exists.
- The migration requires a product-specific table profile, schema v5 availability/encryption
  evidence, budget-derived Forever item stats, decoded DB2 relationships, golden in-game tooltip and
  recipe checks, semantic encounter grouping, and explicit review/publish promotion. The complete
  ordered plan and publication gates are in `docs/forever-beta-extraction-plan.md`.
- The expanded world audit found 60 player-facing UI maps, 1,672 map-art tiles, 61 coordinate
  assignments, 1,081 exploration overlays, 372 client POIs, 100 taxi nodes, 1,514 static game-object
  placements, and 155,868 WMO minimap texture records. All 12 Mount Hyjal art tiles were opened from
  CASC and decoded as 256×256 images, proving the native browser-map pipeline.
- `LFGDungeons` has 71 readable and five encrypted entries, including City of Dalaran, Ruins of
  Lordaeron, Hall of Thanes, and Excavation Site: Wetlands. Classic LFG rows have zero `MapID`, so
  map/instance reconciliation must be reviewed; `DungeonEncounter.MapID` remains the stronger
  relationship.
- `CollectableSourceInfo` supplies 1,288 client-authored appearance source strings. Exactly 1,282
  join to item IDs through `ItemModifiedAppearance`, including 785 item IDs at or above 200,000.
  These become evidence-labeled source hints, not complete loot tables or drop rates.
- The exact Beta Lua API documentation exposes encounter start/end events, end-of-encounter creature
  IDs, exact encounter-to-item `ENCOUNTER_LOOT_RECEIVED` events, quest-to-item loot events, paced quest
  data requests, quest title/objective lookup, and exact map coordinate APIs. Runtime delivery
  semantics still require a controlled Beta dungeon and quest-scan test.

### Forever world UX audit and plan (2026-09-17)

- Desktop and 390 px rendered audits confirmed that the authentic client art and KFC visual language
  are strong, but the world experience remains a set of technical directories. The map and primary
  content sit too far below repeated hero/build/navigation chrome, the flat section navigation is
  crowded on mobile, and maps lack search, hierarchy, thumbnails, synchronized results, shareable
  state, touch-quality panning, and useful selected-feature details.
- Current data is sufficient for an excellent map-first shell: 60 UI maps with complete native art,
  61 assignments, 372 client POIs, 100 taxi nodes, 54 quest POI blobs for 22 quests, and 1,672 decoded
  tiles. The 1,514 static game objects currently have no trustworthy map ID and must not be placed
  until a reviewed coordinate-assignment relationship exists. All 76 boss locations are map-level;
  none is an exact point or UI-map pin.
- Raw world records are not yet user-facing canonical records. The current 341 encounter rows include
  difficulty variants, and the directory incorrectly derives dungeon/raid labels from `MapType`
  instead of `InstanceType` (for example, Blackfathom Deeps appears as a raid). Some criteria creature
  assets also carry dungeon-completion labels rather than a creature name. Correct canonical
  summaries and review overrides are now the first gate before visual aggregation.
- The proposed target plan is a connected World Explorer: grouped global search; two-level Character/
  World/Economy navigation; hierarchical map discovery with a “New in Forever” collection; a
  Leaflet `CRS.Simple` map-first split view; evidence-aware layers and mobile bottom sheet; connected
  instance, boss, quest, spell, item, and profession pages; and targeted cached read models instead
  of loading the complete world snapshot on every route.
- Map-only relationships never become pins. Candidate spells and appearance-source matches never
  become confirmed abilities or loot. Untitled quest IDs remain maintainer coverage until a server
  query or observation provides a verified public record. The detailed delivery order and acceptance
  gates are recorded in `docs/forever-encyclopedia-plan.md`.
- The client exposes 6,600 readable quest IDs plus 90 encrypted records, but static DB2 supplies only
  three named quest lines, 22 line memberships, and 54 POI blobs/99 points covering 22 unique quest
  IDs. Complete quest titles/text/rewards must come from paced server queries, quest observations,
  and build-scoped WDB cache parsing. Full architecture and acceptance gates are in
  `docs/forever-encyclopedia-plan.md`.

### Forever World Explorer implementation (2026-09-17)

- The plan is now implemented as a connected World Explorer. The encyclopedia has two-level
  Overview/Character/World/Changes navigation, a grouped map/instance/boss typeahead on its home
  page, searchable and filtered map/instance/boss directories, native map preview cards, and stable
  routes for boss identities.
- Map pages now use Leaflet `CRS.Simple` over the exact decoded client tiles. They provide zoom,
  reset, full-screen, keyboard/touch panning, place/flight/quest/boss layer controls, quest-region
  polygons, synchronized text results, selected-feature details, and shareable `focus` state. Exact
  coordinate evidence can become a pin; map/area-only boss relationships remain visibly separate
  and unpinned.
- Instance directories now use `Map.InstanceType`, exclude non-instance/deprecated world encounter
  records, and group repeated difficulty rows into 313 canonical encounters across 41 dungeon/raid
  maps. Instance pages expose difficulty/tuning facts, canonical order, all underlying variants,
  criteria-backed creature identities, and a strict separation between review-required appearance
  source matches and observed loot.
- Boss pages expose all 60 criteria-backed creature identities, including 30 Forever-range IDs,
  with identity provenance, encounter and location edges, possible spell evidence, model-resolution
  state, difficulty context, and 802 source-candidate edges across the world archive. Ambiguous
  dungeon-completion criteria render as `Creature <id>` plus context instead of becoming fake boss
  names.
- The sitemap includes the new collection and build-derived map, instance, and boss detail URLs.
  Published database world reads now share a 60-second promise cache; immutable artifact reads still
  use a process-lifetime promise. The current snapshot remains review-only and every page preserves
  that state.
- Browser checks against build 69893 confirmed native Mount Hyjal art, map previews, POIs, flight
  points, quest regions, and The Wild King evidence presentation. Web lint, strict typecheck, 57
  tests, and the Next.js production build pass.

### Forever World Explorer production release (2026-09-17)

- Commits through `3cf6be0` are pushed to `origin/main`. The immutable application release is
  `/home/wow-trader-system/releases/kfc-helper-world-explorer-3cf6be0`, and the server `current`
  symlink resolves to it.
- The audited build `1.60.1.69893` runtime bundle is stored independently at
  `/home/wow-trader-system/shared/world-snapshots/releases/wow-classic-beta-69893-extractor-0.2.3`.
  The snapshot remains visibly `review_required`; it is served through the artifact preference and
  was not inserted or promoted in `world_snapshot` because the exact hotfix is missing.
- Production migrations `0007` through `0009` were applied after a verified mode-0600 PostgreSQL
  custom backup at
  `/home/wow-trader-system/shared/backups/pre-world-explorer-bd1543a.dump` (SHA-256
  `8743e7aa14f57f62be258171e951bd58bf9c2ae3a49695b9800b203d01fa8561`). The migration journal now
  contains all ten entries, and the read-only web role can query the world tables.
- PM2 reloads only `kfc-helper-web` and `kfc-helper-ingest`; both passed loopback health checks and
  the process list was saved. Existing `kfc-website` process 30 was not restarted. The web process
  now runs the generated Next.js standalone server with explicitly packaged public/static assets.
- Public smoke tests passed for the TBC Trader and Encyclopedia, Forever Encyclopedia, Mount Hyjal
  map, The Wild King boss, instance detail, sitemap, a hashed JavaScript chunk, and a real immutable
  256×256 map PNG. `www.kfcguild.online` also remained healthy.

### Forever runtime boss evidence pipeline (2026-09-17)

- Collector `0.5.0` extends the opt-in diagnostics schema to version 4. It records bounded,
  deduplicated `UnitHealth`/`UnitHealthMax` measurements for target, mouseover, nameplate, and boss
  units. Each measurement retains creature ID, build metadata, level/classification, difficulty,
  group size, map context, trigger, current/max health, and timestamp; player units are excluded.
- The existing client model resolver, encounter attempts, encounter loot, loot-window source GUIDs,
  and NPC sightings now travel through a separate authenticated `world-diagnostics.v1` envelope.
  The companion derives a deterministic payload ID, uploads each evidence snapshot once after WoW
  flushes SavedVariables, and migrates local state to schema 3 without replaying prior AH scans.
- The ingestion API now exposes `POST /v1/uploads/world-diagnostics`, verifies the canonical payload
  checksum, archives the immutable raw envelope, and normalizes evidence into model, health,
  encounter/actor, loot, and NPC observation tables. Migration
  `0010_nebulous_tana_nile.sql` creates those additive tables and indexes.
- Forever boss pages query runtime evidence for the exact product/build and creature or connected
  encounter. They show client-resolved display/model file IDs, contextual health measurements,
  observed encounter attempts, exact loot-source/encounter item observations, and NPC location
  evidence. The interface explicitly states that one observed item is neither a complete loot table
  nor a drop-rate claim and that one health sample is not a universal value.
- Unit/parser/service/API regression tests cover deterministic diagnostics payloads and exactly-once
  companion upload behavior. Collector `0.5.0` is installed in the local Forever Beta client with
  matching verified hashes. This implementation is otherwise local only at this point: migration
  `0010` and the API/web release have not been deployed to production in this turn.

### Forever maximum-coverage expansion (2026-09-18)

- The installed Beta advanced to `wow_classic_beta` `1.60.1.69913`. Extractor `0.3.0` produced and
  audited a new immutable review snapshot with 73 maps, 60 UI maps, 1,672 decoded tiles, 341
  encounter rows, 60 criteria-backed boss identities, 6,600 structural quest IDs, 0 static quest
  objectives, and 1,288 appearance source hints. No `DBCache.bin` is available, so the snapshot
  remains `review_required`.
- Raw extraction now also preserves creature-display condition/event/extra/geoset/option tables,
  quest client tasks/objectives/package and reward-curve tables, and the Adventure Guide encounter
  family. Build 69913 confirms that `QuestV2CliTask`, `QuestObjective`, `QuestPackageItem`, and the
  selected Adventure Guide tables contain zero rows; the pipeline records that absence rather than
  manufacturing titles, objectives, models, abilities, or loot.
- Generated addon seeds now cover every audited quest ID and all 60 criteria-backed boss identities.
  Collector `0.6.0` diagnostics schema 5 adds an explicit resumable full quest scanner, a three-pass
  model resolver, observed unit display IDs, aggregated creature combat spells, quest lifecycle and
  dialog/reward evidence, and vendor stock/cost evidence. All collection is bounded, opt-in,
  build-pinned, combat-aware where active queries are involved, and stored in SavedVariables only.
  The checksum-verified six-file bundle is installed in the local `_classic_beta_` client.
- Collector `0.6.6` includes the Beta secret-value and empty-value compatibility hotfix. All unit,
  position, combat-log,
  loot-link, quest-structure, and model scalar values touched by the runtime diagnostics path now
  cross an `issecretvalue`/`canaccessvalue` guard before use. Protected hostile health and protected
  closest-position evidence are omitted instead of compared, transformed, or persisted; readable
  NPC identity, classification, model, and observer-location evidence remains independently usable.
- The first live build-69913 capability run validated the boundary behavior. Ten NPC sightings saved
  without an error while hostile health remained protected. All four `PlayerModel:SetCreature`
  controls timed out, so the no-instance model batch is disabled operationally for this build; models
  must come from observed unit display IDs or reviewed static evidence. The 100-ID quest sample
  produced 31 successful and 69 explicit failed responses with no quest timeout: all 31 successes
  had titles, 21 had objectives (33 rows, 31 non-empty texts), and none exposed quest-tag data. The
  flushed `0.6.1` file also revealed empty optional API strings; the `0.6.2` companion parser now
  normalizes legacy blanks to null and successfully builds a `world-diagnostics.v1` upload from the
  real file, while the addon omits new blanks at capture time.
- Live pause/reload testing exposed ambiguous quest-cursor behavior: a run reported near 660 before
  reload but the next flushed file held a restarted catalog checkpoint at 552. Collector `0.6.3`
  defines the cursor as the last completed request, never advances it for an in-flight request, and
  migrates the one possible legacy in-flight offset. `questscan resume` and `questsample resume` now
  require the exact saved mode/build/locale and preserve the cursor or refuse with an explicit
  reason; only `reset` can clear results and return to zero.
- A second live reload exposed that the legacy active mode could still be saved as `sample`; using
  `start` after the strict refusal then replaced the recovered catalog cursor, leaving a new live
  checkpoint at 202. Collector `0.6.5` now persists independent `catalogCursor` and `sampleCursor`
  values. Catalog resume selects its own checkpoint even if the legacy active-mode marker says
  sample, while build/locale/range validation remains strict. Its one-time legacy migration also
  recognizes any cursor beyond the 100-entry sample as catalog progress, protecting the checkpoint
  even if the previously loaded code writes the stale mode marker during the upgrade reload.
- Repeated reloads then changed the root `installationId` and produced a tiny backup file, proving
  that the failure was earlier than cursor restoration: registered unit/world events could invoke
  `InitializeSavedVariables` while `WOW_TRADER_SAVED` was still unavailable during addon loading,
  replacing the entire root table. Collector `0.6.6` gates every collection event until its own
  `ADDON_LOADED` handler initializes the restored SavedVariables table; `PLAYER_LOGIN` remains the
  later runtime-index and Auctionator registration phase.
- Contracts, companion parsing/deterministic upload, ingestion, and PostgreSQL tables now cover spell,
  quest-query/event, and vendor observations. Boss pages show observed spells; quest directory/detail
  pages combine structural IDs with client-query or observed titles and facts. Migrations `0011` and
  `0012` add the runtime evidence tables and static quest task/objective schema.
- The complete source hierarchy, current coverage, no-instance collection run, separate item/recipe
  catalog track, release gates, and irreducible server-only limits are in
  `docs/forever-max-coverage-plan.md`. Focused contracts, world-data, companion-core, desktop,
  ingestion API, and web tests pass; extractor `0.3.0` builds without warnings and the build-69913
  artifact audit passes. Local migration execution is pending only because PostgreSQL was not
  running on `localhost:5432` during verification.

### Forever Beta addon load audit (2026-09-26)

- The installed Beta is now `wow_classic_beta` `1.60.1.70009`. Collector `0.6.6` loaded and wrote a
  valid build-70009 SavedVariables snapshot on September 25, proving that the current `16001` TOC and
  Lua bundle are accepted by the client. The source and installed six-file bundles remain
  byte-identical to the trusted manifest and parse as Lua 5.1.
- The current load failure is configuration, not code: every Beta character's `AddOns.txt` records
  `WowTraderCollector: disabled`. No matching Lua load error appears in the current client logs.
  Re-enable it through the character-select AddOns panel or Blizzard's built-in `/enableaddons`
  command, which reloads the UI. Do not resume the build-69913 quest/model seeds on build 70009;
  extract/audit the new build and regenerate build-pinned seeds first.

### Market-only collector decision (2026-09-26)

- Collector `0.7.0` disables the unstable world-diagnostics path and keeps only Auctionator market
  scan capture. It registers no encounter, quest, NPC/nameplate, combat, loot, health, vendor, or
  model events. The inactive diagnostics implementation was removed from the runtime `Collector.lua`
  rather than only hidden behind a feature flag; retired diagnostic slash commands explicitly report
  that they are unavailable.
- The packaged addon and desktop install manifest now contain only `Collector.lua` and
  `WowTraderCollector.toc`. The quest/boss seed source files remain in the repository for historical
  extraction work but are not loaded or installed. Existing `worldDiagnostics` SavedVariables are
  preserved and forced off so this change does not destroy previously collected evidence.
- The Beta AddOns folder currently has no Auctionator installation. The market-only collector can
  load there, but capturing a market scan still requires a Beta-compatible, enabled Auctionator; the
  collector deliberately continues to use Auctionator's protected full-scan permission flow.
- The verified two-file `0.7.0` build is installed in the live `_classic_beta_` AddOns directory.
  The previous six-file `0.6.6` install was moved intact to
  `_classic_beta_/WowTraderCollector-pre-0.7.0`, outside `Interface/AddOns`, so it cannot load but can
  be recovered if needed. WoW was running during installation, so `/reload` or a client restart is
  required before the new runtime code takes effect. The active `70` realm character profiles have
  the collector enabled; the older `Classic Beta PvP` profiles still record it as disabled.

### Forever native Auction House scanner research (2026-09-26)

- Auctionator is not the only technical route. Forever `1.60.1` exposes Blizzard's modern
  `C_AuctionHouse.ReplicateItems` surface, a complete-market response event, zero-based result count,
  item-info, and item-link calls. The documented successful-call throttle is approximately 15
  minutes, so the intended 30-minute cadence is compatible while a player is online at an open AH.
- Auctionator `339` is now officially published for the Forever flavor, contrary to the earlier
  assumption that no Forever build exists. It can be used for a short integration check, but the
  recommended product direction is an original Blizzard-API provider so the collector owns its
  quality evidence and does not rely on another addon's internal event contract.
- Do not extract or adapt Auctionator source: the local package is All Rights Reserved and expressly
  forbids use as an implementation reference. The native scanner must be clean-room code based on
  Blizzard's public runtime API, validated against the exact client build.
- The architecture, defensive state machine, chunked cache resolution, quality schema, desktop UX,
  live gates, and remaining Blizzard boundaries are specified in
  `docs/forever-native-ah-scanner-plan.md`. The first implementation step is a read-only runtime
  capability probe; no query signature or market scope is assumed solely from the interface number.
- The companion/ingestion/price-depth pipeline can remain intact. Required extensions are optional
  scan provider and quality counters, incomplete-scan promotion gates, nullable collector item links,
  and product-specific desktop scanner health. Offline AH scanning and automatic SavedVariables
  flushing remain impossible; `/reload` or logout is still required for upload visibility.

### Forever native Auction House scanner implementation (2026-09-26)

- Collector `0.8.0` now has an original native Forever provider built only against Blizzard's
  `C_AuctionHouse` replication surface. It requires no Auctionator on the 1.60 client. TBC retains
  its existing Auctionator integration. The addon's runtime remains a two-file, market-only bundle
  with no quest, NPC, health, combat, loot, vendor, or model event registration.
- `/wowtrader probe`, `scan`, `status`, and `cancel` expose the controlled workflow. Native scans
  require an open Auction House and ready throttle queue, read zero-based rows in bounded per-frame
  chunks, retry uncached rows for up to 60 seconds, reject secret/inaccessible values before using
  them, abort without saving if the Auction House closes, and enforce a 15-minute local cooldown only
  after a successful non-empty snapshot.
- New SavedVariables/upload evidence records provider/API flavor, market-key version, reported,
  visited, priced, bid-only, unresolved, invalid, and secret row counts, total duration, and whether
  the Auction House remained open. Old `auction-scan.v1` payloads remain parseable; their row counts
  are derived from stored price-level listing counts.
- Migration `0013_superb_magneto.sql` adds typed quality evidence and promotion state to
  `market_scan`. Ingestion archives every valid upload but marks scans below 98% complete,
  inconsistent, empty, closed mid-scan, unsupported, missing mandatory native evidence, or below 25%
  of the latest accepted row-count baseline as not promotable. Trader, history, freshness, and public
  status queries now read only accepted scans.
- The desktop companion reports `Native Forever scanner included` independently of Auctionator and
  keeps Auctionator health only for TBC. Its trusted installer manifest is updated to collector
  `0.8.0`; both add-on files are still verified by SHA-256 before the atomic install.
- Automated contract, parser/upload, promotion-policy, installer, lint, typecheck, and build checks
  cover the new path. The remaining proof is one live build-70009 scan with Auctionator absent,
  followed by `/reload`, watcher upload, and comparison of sampled prices with the Blizzard UI.
- The verified `0.8.0` two-file bundle is installed in
  `_classic_beta_/Interface/AddOns/WowTraderCollector`; its source, installer manifest, and installed
  SHA-256 hashes match. The game was not running during replacement. The previous `0.7.0` directory
  is recoverable at `_classic_beta_/WowTraderCollector-pre-0.8.0`.

### In-game market console (2026-09-26)

- Collector `0.9.0` adds a separate `UI.lua` presentation layer over the scanner's existing guarded
  control functions. `/wowtrader` and `/wowtrader ui` toggle the console; an independent `WoW Trader`
  launcher appears beside the Auction House while it is open. Existing `probe`, `scan`, `status`, and
  `cancel` commands remain available.
- The Dungeon Journal-inspired console uses a dark framed layout with provider/build identity,
  provider/Auction House/throttle/queue health, current state, progress, cooldown, market/row/priced/
  bid-only/issue counters, six recent saved scans, and Scan, Cancel, Probe, and Save & Reload actions.
  Disabled states are derived from the same native/Auctionator state machine, so the UI cannot bypass
  combat, cooldown, Auction House, provider, or active-scan guards.
- The interface creates only addon-owned frames and calls public scanner functions; it does not hook
  or replace Blizzard Auction House controls. `UISpecialFrames` provides Escape-to-close, the title
  bar is draggable and clamped to screen, and the Auction House launcher only opens the panel.
- The desktop install manifest now verifies the three runtime files and recognizes collector
  `0.9.0`. Lua 5.1 parsing, installer coverage, and a live build-70009 visual/interaction pass remain
  the release gates before the UI is considered in-game verified.
- The verified three-file `0.9.0` bundle is installed in the live `_classic_beta_` AddOns directory;
  source, manifest, and installed SHA-256 hashes match. The Beta client was running during the
  replacement, so `/reload` is required before the new code appears. The previous `0.8.0` bundle is
  recoverable at `_classic_beta_/WowTraderCollector-pre-0.9.0`.

### Minimap launcher (2026-09-26)

- Collector `0.9.1` adds a conventional `LibDBIcon10_WowTraderCollector` minimap launcher using the
  addon's coin artwork. Left-click toggles the scanner console, drag stores the launcher's angle in
  the existing account-wide SavedVariables, and right-click hides it.
- `/wowtrader minimap` restores a hidden launcher. The button is an addon-owned frame attached to the
  minimap and does not hook or replace Blizzard UI functions.
- The verified `0.9.1` three-file bundle is installed in the live `_classic_beta_` AddOns directory,
  with matching source/install SHA-256 hashes. The running Beta client requires `/reload` before the
  launcher appears. The replaced `0.9.0` bundle is preserved at
  `_classic_beta_/WowTraderCollector-pre-0.9.1`.

### First Forever market upload (2026-09-26)

- The first native Forever scan (`010fb4c8-8bd1-4ca8-ae01-606fd5a05371`) was flushed from build
  `70009`, validated locally, uploaded through the paired desktop companion, and reported as
  processed by production. It contains 68,640 reported/visited rows, 68,635 priced rows, five
  bid-only rows, zero unresolved/invalid/secret rows, and 2,239 compacted markets at 100%
  completeness.
- The live SavedVariables file exposed a parser compatibility edge: WoW serialized the retired empty
  `worldDiagnostics.questQueries` map as `{}`, which the generic Lua decoder represents as an empty
  array. The diagnostics boundary now normalizes only an empty array at that record field to an empty
  object; non-empty or malformed values still pass through strict validation. A regression test
  covers the exact shape.
- Production ingestion is working, but the public product surface is not yet wired to the new data:
  `/forever/trader` returns 404 and the market-status endpoint still filters to the TBC product. The
  next Forever Trader release must add product-aware status/market routes and decide how to present
  prices before a matching published build-70009 item/recipe catalog is available.

### Installed macOS companion (2026-09-26)

- A current x64 maintainer build is installed and running at
  `/Applications/WoW Trader Companion.app`. Its application icon is a centered square crop of the
  same `forever-logo.jpg` used by the Helper game selector; Forge packages the generated native ICNS
  instead of Electron's default artwork.
- The persistent app profile targets `https://helper.kfcguild.online`, has automatic uploads and
  login startup enabled, and watches both `/Applications/World of Warcraft/_anniversary_` and
  `/Applications/World of Warcraft/_classic_beta_`. The private token remains OS-encrypted in the
  existing mode-0600 credential file; prior upload state and activity history were preserved.
- Collector `0.9.1` is installed in both configured clients. The TBC installation retains its
  required Auctionator dependency, and its replaced `0.2.0` collector is recoverable at
  `_anniversary_/WowTraderCollector-pre-0.9.1`.
- This is still an unsigned, non-notarized maintainer-alpha application. Two superseded local app
  bundles were moved to Trash during the icon replacement and remain recoverable there.

### Forever Trader and Collector distribution (2026-09-27)

- Production release `kfc-helper-forever-wowhead-links-20260927-r3` is active at
  `helper.kfcguild.online`. PM2 reports `kfc-helper-web`, `kfc-helper-ingest`, and the independent
  `kfc-website` process online; the guild website process and working directory were not changed.
- `/forever/trader` now uses the same search-first market workspace as TBC while remaining isolated
  to client product `wow_classic_beta`. `/forever/markets/UNKNOWN/ClassicBetaPvP` exposes the raw
  market, and the market-status endpoint accepts an allowlisted product instead of silently using
  TBC. TBC routes remain pinned to `wow_anniversary`.
- Exact Forever build `1.60.1.70009` with hotfix hash `3415e1da5ce1…a4f6` is published as build ID
  `e126ffe7-f1d3-413a-9e16-6da2c698c55e`. The audited snapshot contains 23,578 player-facing items,
  12 professions, 31,703 spells, 2,239 recipes, 7,448 reagent edges, and 2,239 outputs. The hidden
  `Test Profession [DNT]` and its recipe are excluded before normalization.
- Extraction intentionally omits 418 recipes whose encrypted/unavailable reagent or item-output
  records cannot form valid relationships. The rejected diagnostic bundle and the pre-profession-
  filter bundle remain preserved locally beside the published artifact. Audit and relationship
  validation pass; 8,240 source item IDs have no usable localized name and therefore cannot become
  player-facing rows.
- The first Forever scan was backfilled from retained SavedVariables evidence after migration
  `0013`: provider `blizzard_replicate`, API flavor `c_auction_house_replicate`, 68,640 reported and
  visited rows, 68,635 priced rows, five bid-only rows, zero unresolved/invalid/secret rows, 25,330
  ms duration, and accepted quality. Before publication, 405 non-cooldown recipes had both complete
  live reagent pricing and a priced output; the live default workspace currently ranks 164
  profitable quotes and shows 50 at once.
- Forever item icons are a separate immutable release with 2,945 verified PNGs. File-data ID
  `132274` proved that a numeric ID can have different bytes in TBC and Forever, so the icon route is
  explicitly product-aware and the two products do not share a flat media directory.
- `/forever/addon` promotes Companion `0.2.0` and exposes a stable release manifest plus resumable
  byte-range download. The current macOS Intel DMG is 134,722,664 bytes with SHA-256
  `44c6264d5149126dda09e632ed41453a446d9f056aa5db5db83807231f036b16`; server-side size/hash and a
  public 100-byte range response were verified. It opens either Forever or TBC Trader and packages
  collector `0.9.1`.
- At the `0.2.0` release point, distribution was visibly labeled `Maintainer alpha`: the DMG was
  unsigned, macOS Intel-only, and required a private collector token. Public per-installation
  pairing/revocation, signing, notarization, Apple Silicon, and Windows packages were still release
  gates.
- The production backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-forever-trader-20260927.dump` passed
  `pg_restore --list` before migrations `0010`–`0013`. Local and clean server runs of lint,
  typecheck, all tests, build, and formatting passed; the download page also passed a 390px browser
  emulation with no horizontal overflow.
- The published Forever catalog is sufficient for item names, icons, vendor values, and profession
  recipe economics. It still has zero normalized item-stat, damage, resistance, socket, item-effect,
  teaching-item, and transformation rows. Forever specialization behavior is therefore not inferred
  from TBC. Forever Trader product rows, purchased reagents, crafted intermediates, and valued
  outputs link by item ID to Wowhead's dedicated Forever database in a new tab; they do not link to
  unfinished local item/recipe detail pages, and Wowhead remains an external community reference.

### Actionable Trader workspace (2026-09-27)

- Production release `kfc-helper-actionable-trader-20260927-r5` is active. PM2 web and ingestion
  processes are online from the new immutable release; the independent `kfc-website` process was
  not changed.
- Rankings now default to total executable profit rather than one-craft profit. Each quote consumes
  the actual reagent order-book depth, tests up to 100 crafts, stops before deeper reagent prices
  destroy total profit, and shows recommended crafts, priced depth, capital, total profit,
  profit-per-craft, ROI, and the AH break-even unit price. Vendor scaling explicitly applies no AH
  cut; a regression test covers that boundary.
- Results are paginated at 50 rows. Forever rows expand in place and expose explicit item and recipe
  Wowhead links; TBC preserves its internal recipe navigation. Product-name search also provides a
  catalog-backed browser suggestion list. The Forever market selector consistently renders the
  otherwise unknown beta region as `Forever Beta`.
- Historical output-price signals are build-, product-, realm-, faction-, and item-scoped. They use
  accepted scans only, a six-observation activation gate, a maximum 48-scan robust window, and show
  current/reference/range/direction/confidence only after the gate. Production currently reports
  `Collecting 2/6`; no buy/hold/sell claim is invented before four more independent scans arrive.
- Expanded quotes can be saved into a versioned, per-product/per-market browser-local crafting plan.
  The dock combines raw shopping quantities and deterministic alt-crafting steps, preserves the
  exact source scan timestamp, supports removal/clear/copy, and labels capital/profit as combined
  standalone quotes. It does not claim shared-depth portfolio optimization.
- The advanced alt/specialization profile is now collapsed unless custom rules are active, bringing
  ranked results above the fold. It remains visibly simulated because the current collector does
  not upload character profession ranks, known recipes, specialization spells, inventories, or
  capital constraints.
- A bounded 30-second in-process workspace cache deduplicates concurrent and repeated identical
  calculations. Immutable catalog/order-book source rows are also cached by exact build and scan ID
  with a four-snapshot LRU bound; a newly accepted scan necessarily uses a new key. Live verification
  measured repeated TBC searches at about 0.7 seconds to first byte and Forever searches below one
  second, while a brand-new TBC query still spends about 3.7 seconds evaluating the large recipe
  graph and remains the next performance target.
- Clean local and server runs of lint, strict typecheck, every test suite, production build, and
  formatting passed. Live CDP emulation at 390 px verified `clientWidth === scrollWidth === 390`, 50
  expandable rows, detail loading, the `Collecting 2/6` evidence state, and local plan persistence.
- Remaining market-model boundaries are deliberate: output demand, sell-through, deposits, expired
  listing loss, and shared portfolio depth are not modeled; executable sizing is capped at 100; and
  saved plans are browser-local snapshots rather than synced account state.

### Durable market intelligence and in-game signals (2026-09-27)

- Migration `0014_productive_praxagora.sql` adds compact per-scan item observations and the latest
  exact-market signal table. Existing retained price levels are backfilled; accepted uploads refresh
  signals by client product, build, region, realm, Auction House, and item. Half-hour buckets prevent
  repeated scans in one interval from inflating evidence.
- Model `robust-market-signal-v1` waits for six independent observations, uses a median and median
  absolute-deviation price band plus current supply breadth, and distinguishes bargain, normal,
  rising, spike risk, oversupplied, falling, and too-thin conditions. It stores no inferred sales:
  all evidence is explicitly labeled as asking-price history.
- Trader details now chart recent price observations and their normal band, explain output and input
  risk, and label margin quality. Profit subtracts the successful-sale cut from gross output value:
  5% on faction Auction Houses, 15% on neutral Auction Houses, and 0% for vendor exits. Listing
  deposits and expiry loss remain deliberately unmodeled until listing duration and sell-through
  evidence exist.
- Price-history charts now provide unit-ask, net-output, and indicative-profit modes; 30-minute,
  24-hour, 7-day, and 30-day windows; true timestamp spacing; explicit missing-scan gaps; a robust
  normal band; and a separate listed-supply panel. The period summary reports low, median, high,
  movement, current deviation from median, raw direction, supply change, and valued evidence.
- Each observation card shows compact gold values (for example, `0.606g`), gross output, the exact AH
  fee, net output, matching-scan reagent cost, profit, normal-price deviation when unlocked, listed
  quantity, listing count, and UTC timestamp. Points are keyboard-focusable and can be pinned by
  click or mobile tap. `formatCompactGold` uses integer rounding so copper values do not lose
  precision while being converted for display.
- Historical craft economics use same-scan p10 asks and exact recipe quantities. A reagent must have
  enough listed supply for one craft and every output must retain the existing three-listing support
  threshold; otherwise economics are withheld and the chart shows a gap. Profit-positive crossings
  and below-normal asks receive separate markers. The UI explicitly distinguishes listed supply from
  sales and retains the six-observation guidance gate.
- Expanded opportunity details read up to 1,440 accepted scans for the selected client product,
  build, region, realm, and Auction House. Scoping the query before applying that 30-day limit keeps
  activity from other realms from crowding the selected market out of its own history.
- The Trader checks scan status immediately on page load and every five seconds while visible. It
  refreshes the server component after detecting a newer scan and performs one hard reload if the
  rendered timestamp has not caught up within four seconds. Focus, page-show, and visibility changes
  also trigger an immediate check, so an ingestion finishing just after a desktop reconciliation no
  longer leaves the open tab showing the previous scan.
- Companion `0.3.1` downloads the authenticated market pack after reconciliation and atomically
  installs generated `MarketData.lua`. Collector `0.10.0` provides a searchable Market Intel panel,
  exact-market compatibility checks, item-tooltip signals, and an account-wide local watchlist with
  post-scan alerts. Manual reconciliation now exposes a durable `checking` phase before detection,
  upload, processing, or the final up-to-date state, so the desktop button and tray no longer appear
  inert. `/reload` is required after the companion updates the pack.
- Production migration `0014_productive_praxagora.sql` completed from a verified 14,879,415-byte
  pre-migration backup. At migration time it backfilled 40,645 compact observations from five scans
  covering 8,122 items and published 5,521 TBC plus 2,324 Forever signal rows at `Collecting 3/6`
  and `Collecting 2/6` respectively; later accepted scans supersede those initial counts.
- Companion `0.3.4` is synchronized with macOS Intel and Apple Silicon DMGs, Windows x64 portable
  ZIP, and Linux x64 portable ZIP artifacts. All four server-side sizes and SHA-256 values match the
  public manifest, and public download responses report the exact manifest lengths. The locally
  installed macOS app is `0.3.4`, and Collector `0.10.0` is installed in both the Anniversary and
  Classic Beta clients with recoverable backups of their prior versions.
- Production release `kfc-helper-companion-arm64-20260928-r16` is active; compact r15 remains its
  immediate application rollback. Public and loopback health checks passed. Live Chrome validated
  the crafting charts plus arbitrary Auction House item name/ID search, expandable current-price
  evidence, Wowhead references, and responsive item history with no horizontal overflow at both
  1,440 px and 390 px.
- The release workflow now prunes generated desktop packages and build caches after staging checks;
  r13 occupies 964 MiB instead of roughly 3 GiB. Superseded r7 through r11 application releases were
  removed after their successors passed live checks and are not recoverable on the server. Filesystem
  use fell from 90% to 84%, but unattended 30-minute scanning remains prohibited until retention and
  disk alerts are operational.

### Auction House item discovery and scan feedback (2026-09-27)

- Trader now separates `Crafting profits` from `Auction House items`. The latter searches canonical
  item rows from the latest exact product/build/realm/Auction House scan by partial product name or
  exact item ID, then exposes the cheapest ask, quantity-weighted p10 ask, median/p90 ask, listed
  quantity/listings, near-market supply, vendor floor, and the retained scan history.
- Buy/sell language remains evidence-gated. A deterministic vendor-floor arbitrage may be shown from
  the current cheapest listing, while historical `good deal`, normal, rising/falling, spike-risk, and
  thin-market verdicts remain locked until six independent half-hour observations. The UI explicitly
  says asks are listings rather than confirmed sales.
- The fourth accepted Forever scan, `abba18b5-2da7-4300-8ea9-ead6d78e7f46`, completed at
  `2026-09-27T12:22:36Z` with 2,267 canonical markets and 8,277 price levels. The desktop state,
  ingestion row, public scan-status API, and live Trader all agree on that scan; the earlier apparent
  failure was missing immediate desktop feedback rather than a lost upload.
- The fifth accepted Forever scan, `26a8b95b-d96a-41f6-9c97-853ff101f4f0`, completed at
  `2026-09-27T12:58:14Z` with 2,271 canonical markets and 8,347 price levels. The database now holds
  eight scans and 47,490 compact observations, and Forever guidance is at `Collecting 5/6`. The
  companion had uploaded and processed this scan correctly; the stale 36-minute display came from a
  browser check landing before ingestion completed and then waiting too long to poll again. Release
  r14 closes that timing gap with five-second polling and the bounded hard-refresh fallback.
- Companion `0.3.1` remains installed locally. Its manual check shows
  `Checking saved scans and server status…` immediately and stays visibly busy through the real
  reconciliation phases. The prior temporary local application backup was removed after the
  installed version and preserved mode-0600 settings/state were verified.

### Cross-platform Companion downloads (2026-09-28)

- `/forever/addon` now offers Companion `0.3.4` for macOS Intel, macOS Apple Silicon, Windows x64,
  and Linux x64. The hero routes players to four explicit platform cards instead of assuming macOS,
  and the page explains that Windows/Linux are extract-and-run portable ZIPs. Desktop and 390 px
  mobile browser checks show all cards without horizontal overflow.
- The release pipeline builds all four Electron targets, copies immutable artifacts into one
  manifest, records byte size and SHA-256 for each, and publishes `latest.json` only after the server
  verifies every uploaded byte. Public HEAD and 32-byte range requests match the manifest for all
  four downloads.
- The Intel DMG is 136,264,061 bytes (`e90b3e4e59d1…506b`), the Apple Silicon DMG is 132,546,176
  bytes (`4a8dd78ea17b…d2d5`), the Windows ZIP is 160,575,125 bytes (`7f16dc014960…69c2`), and the
  Linux ZIP is 125,034,193 bytes (`33e7e830b721…4c47`). The Apple Silicon app is a native Mach-O
  arm64 executable and its DMG passes `hdiutil verify`; it still needs a runtime smoke on physical
  Apple Silicon. The Windows archive contains an x64 PE executable and the Linux archive an
  executable x64 ELF binary; all packages include the branded resources, utility process, and
  Collector payload.
- Linux discovery checks an explicit `WINEPREFIX` plus common Wine/Lutris-style prefixes and retains
  manual folder selection. Credential saving refuses Electron's insecure `basic_text` fallback and
  requires Secret Service/KWallet-class storage. Windows/Linux packages remain unsigned
  maintainer-alpha builds until native clean-machine runtime and signing/distribution gates pass.

### Windows Companion packaging audit (2026-09-28)

- The published `0.3.3` Windows archive passes a complete ZIP integrity test and contains a PE32+
  x86-64 GUI executable, `app.asar`, the utility-process bundle, artwork, and the Collector at the
  exact `process.resourcesPath` locations consumed by the packaged application. The executable's
  imported DLLs are Windows system libraries or Electron files shipped beside it, and its hardened
  Electron fuses are present.
- The four Collector files embedded in the Windows package match the installer's pinned SHA-256
  checksums byte-for-byte. Native Windows path expansion produces the intended product, addon, and
  SavedVariables paths under `C:\Program Files (x86)\World of Warcraft\_classic_beta_`; the archive
  checksum and length match the public release manifest.
- Settings/state/logs use Electron's per-user `userData` location and the token uses Windows DPAPI
  through asynchronous `safeStorage`, so neither depends on write access beside the portable
  executable. The packaged resource and utility paths are also independent of the current working
  directory.
- The current automatic game discovery checks only `%ProgramFiles(x86)%\World of Warcraft`. A game
  under `%ProgramFiles%` or a custom drive requires manual selection. The folder picker currently
  expects the exact `_anniversary_`, `_forever_`, or `_classic_beta_` product directory and does not
  validate or normalize a selected parent `World of Warcraft` directory before addon installation.
  Its existing Windows discovery unit test also uses the host path implementation when run on macOS,
  so it is not sufficient evidence of real Windows semantics.
- The portable build's `Start at login` entry targets the executable's extracted location; moving or
  deleting that folder afterward leaves the startup entry stale. Before promoting Windows beyond
  maintainer alpha, add multi-root discovery and validated parent-folder normalization, replace the
  host-dependent path test, and run launch, token persistence, addon install, scan upload, tray,
  restart, and login-start smoke tests on a clean Windows 10/11 machine. The unsigned build may also
  trigger SmartScreen until the signed installer phase is complete.

### Extreme-price ingestion incident (2026-09-29)

- Forever scan `a39e53b9-33b3-48c5-81fb-e6b5f4d0dc9f` was detected and uploaded by the local
  Companion, but its ingestion transaction initially rolled back. Item 43, Squire's Boots, moved
  from a roughly 100-copper historical ask to two listings at 99,999,990,000 copper. The valid
  `9,999,998,990,000` basis-point difference exceeded PostgreSQL's 32-bit `integer` range while the
  derived market signals were rebuilt.
- Migration `0015_market_signal_bigint.sql` changes `difference_basis_points` and
  `supply_ratio_basis_points` to `bigint`. It was tested against a disposable restore of the live
  database, then applied from the owner role after verifying the 15,826,451-byte custom-format
  backup at `shared/backups/wow-trader-pre-market-bigint-20260929.dump`.
- Production release `kfc-helper-market-bigint-20260929-r17` is active. The original saved scan was
  retried without editing or recreating it and processed successfully: 2,378 item markets and 8,458
  price levels, completed at `2026-09-29T02:19:14Z`. The database and public scan-status API both
  return that exact scan as the latest Forever `UNKNOWN / ClassicBetaPvP / alliance` observation.
- The signal regression suite now covers the exact extreme-price delta. Automatic Companion checks
  retain the current upload error during a retry cooldown instead of replacing it with a false
  `All saved scans are up to date` state. Ingestion logs also summarize database errors without
  serializing full SQL parameter arrays. Companion `0.3.4` now ships this status correction and is
  installed locally; its OS-encrypted credential and existing settings were preserved.

### Local Forever build-70058 bootstrap (2026-09-29)

- The local PostgreSQL container had exited, causing catalog-backed localhost routes to display the
  generic database-unavailable fallback. `pnpm dev` now runs against the active Forever target via
  the ignored local `WOW_PRODUCT=wow_classic_beta` setting; it starts PostgreSQL, applies all 16
  migrations, validates/publishes the exact catalog, and watches the Beta SavedVariables folder.
- Forever client `1.60.1.70058` requires WoWDBDefs revision
  `c79f208203f8d6ce2a5e2e7dcb34ab6606ae5ab1`. Both catalog and world extractor defaults are pinned
  to that exact upstream build merge. Catalog parsing errors now identify the failing table/build/
  revision, and the revision CLI boundary rejects anything other than a full Git SHA.
- The audited build-70058 catalog contains 23,605 named items, 12 professions, 2,239 recipes, and
  2,948 decoded icons. The new audited world snapshot contains 72 maps, 342 encounter rows, 73
  criteria-backed bosses, 6,605 quest IDs, and 1,288 item-source hints.
- World snapshot storage now includes the definitions revision in its immutable path. This lets a
  corrected definition set coexist with an older snapshot for the same build/hotfix rather than
  deleting, overwriting, or silently reusing evidence.
- The local watcher processed eight saved Forever scans. Latest scan
  `d833de11-c1d2-457b-ad5d-a30f3a79d810` is build 70058 with 2,362 markets and 8,477 price levels;
  localhost Forever Trader renders it without the database fallback. Production was healthy and
  unchanged during the initial local recovery.

### Production Forever build-70058 publication (2026-09-29)

- Production had accepted the build-70058 scan but still published only catalog build 70009, so the
  Trader correctly gated calculations rather than joining prices to stale recipes. The live UI
  reported `Build 70058 · review pending` and no matching published catalog.
- The 70009→70058 review diff adds 27 item IDs, removes or changes no items, and changes no spells,
  professions, recipes, or transformations. Server-side re-audit verified all 102 artifacts and
  relationship validation reported no issues.
- After verifying the 16,063,818-byte custom-format backup at
  `shared/backups/wow_trader-pre-forever-70058-catalog-20260929.dump`, production imported the new
  build as review-required, activated the immutable checksum-verified 2,948-icon media release, and
  then published catalog build ID `457e6227-85f5-4053-ab39-5f6898c0cf17`.
- Live Forever Trader now joins scan `d833de11-c1d2-457b-ad5d-a30f3a79d810` to exact catalog
  `1.60.1.70058`: 2,362 markets, 8,477 price levels, 50 rendered crafting opportunities, working
  Auction House item search/history, and valid build-native icons. The catalog gate and generic
  database fallback are absent.
- Production now retains 13 scans and 59,266 compact item observations. Signals remain build-scoped:
  5,521 TBC rows, 2,295 Forever build-70009 rows, and 2,362 Forever build-70058 rows; new-build
  guidance honestly restarts at `Collecting 1/6`.

### Production Forever build-70124 publication (2026-09-30)

- Scan `41c16940-f286-43e0-ba25-705aca0ccfe8` uploaded correctly, but its new client build had no
  exact published catalog. The Trader's `Build 70124 · review pending` state was the deliberate
  build-integrity gate, not a Companion or ingestion failure.
- The installed client is `1.60.1.70124`. Catalog and world extraction now use exact WoWDBDefs
  revision `005c13a9a101e64014eeb02af3a42ccbeaf8513d` (`Merge 1.60.1.70124`), which has build-70124
  definitions for all 36 required catalog tables.
- Local extraction, the 102-artifact audit, and relationship validation passed with 23,605 named
  items, 12 professions, 2,239 recipes, and 2,948 verified item icons. The 70058→70124 structural
  diff contains no added, removed, or changed player-facing items, spells, professions, recipes, or
  transformations.
- The exact world snapshot also passed audit with 72 maps, 1,672 decoded map tiles, 342 encounter
  rows, 73 criteria-backed bosses, 6,605 quest IDs, and 1,288 item-source hints. It remains local
  evidence; this incident required only the Trader catalog and item media on production.
- Production backup
  `shared/backups/wow_trader-pre-forever-70124-catalog-20260930.dump` was verified at 22,101,567
  bytes. The server repeated catalog audit and validation against immutable release
  `shared/catalog-releases/wow_classic_beta-70124-enUS-3055d2ff-005c13a` before import.
- Media release `wow_classic_beta-70124-enUS-3055d2ff-005c13a` passed local and server verification
  with 2,948 icons before catalog build ID `196c3b07-ca1e-49d3-b919-208401b4887e` was published.
- Live Forever Trader now resolves exact catalog `1.60.1.70124`, renders 50 crafting opportunities,
  returns 30 Auction House item rows for `scroll`, and serves valid Forever PNG media. Neither
  review-gate message is present. PM2 reports both Helper processes online; only the web process was
  reloaded to clear cached catalog selection.
- Production retains 14 scans and 61,632 item observations. Current build-scoped signal counts are
  5,521 for TBC build 69795, 2,295 for Forever build 70009, 2,362 for build 70058, and 2,366 for
  build 70124. Cross-build market history remains intentionally isolated.

### Nginx upload-buffer incident and Companion 0.3.4 (2026-09-30)

- Saved Forever scan `78751705-721a-4873-9339-1532d7e385b7` repeatedly received HTTP 500 before
  reaching Fastify. Nginx error evidence identified `Permission denied` opening
  `/var/lib/nginx/body/*`; proxy temporary-file failures were also occurring across unrelated server
  virtual hosts. Directory modes were correct at inspection time, and a graceful reload replaced
  the affected workers and recovered the pending upload automatically.
- The production Helper config now streams `/v1/` request bodies and disables response proxy
  buffering for both Helper locations. This removes the Helper's dependency on the affected Nginx
  temporary directories. `scripts/deploy-production-nginx.sh` provides validated activation,
  timestamped rollback, and a 1 MiB public edge smoke; the deployed smoke returned HTTP 422 from the
  application rather than an edge 500.
- The recovered build-70124 scan contains 2,357 item markets and 8,112 price levels, completed at
  `2026-09-30T12:21:15Z`. PostgreSQL and the public scan-status endpoint return its exact UUID, and
  the live Forever Trader reports a fresh exact-catalog scan.
- Companion retry state is now tied to each retry key and restored during cooldown. Reconciliation
  stops at the deferred failure so another enabled product cannot mask it with a success message.
  The focused suite contains both single- and multi-product regression coverage.
- Companion `0.3.4` is published as checksum-verified macOS Intel/Apple Silicon DMGs and Windows/
  Linux x64 ZIPs. This Intel Mac now runs `0.3.4`; the old `0.3.1` app is retained as a recoverable
  backup, while Application Support settings, state, logs, and the encrypted credential remain in
  place.
- Production now retains 15 scans and 63,989 compact item observations. Current exact-build signal
  counts are 5,521 TBC, 2,295 Forever build 70009, 2,362 build 70058, and 2,357 build 70124.
- Commit `87f9101` is pushed to `origin/main`. Production release
  `kfc-helper-nginx-streaming-20260930-r18` passed the complete server-side check and formatting
  gates before activation. Both Helper processes and the untouched `kfc-website` process are online;
  PM2 saved the process list. Release r17 is the immediate application rollback.

### Retired Jilanov applications cleanup (2026-09-30)

- The applications previously served under `jilanov.com` were confirmed migrated away from
  `89.167.46.193`. Eleven old Nginx site entries were disabled after a successful configuration test
  and preserved in `/etc/nginx/retired-jilanov-20260930T1424Z`; Nginx remained active after reload.
- Eighteen matching PM2 entries were deleted and the reduced process list was saved. The unrelated
  KFC website, Helper web/ingest, Gigsy API, and `green` processes remained online and passed their
  local/origin HTTP checks.
- Fourteen exact legacy trees were permanently deleted: the Jilanov client/admin/server trees,
  Dimitar website and backup, interview assistant, landing, demo, staging and staging repository,
  BeautyMall, chatbot, and public scanner. `/home/gigsy`, KFC, SEO, and
  `/home/jilanov/green-github` were explicitly retained.
- PostgreSQL databases `public_scanner_dev`, `jilanov_clone`, `dj-jilanov`, `demo_eu`, and
  `beautymall_eu` were permanently dropped. `wow_trader`, `gigsy`, and `dj-kfc-guild` were verified
  present afterward.
- Root filesystem usage fell from 91% (about 6.6 GiB free) to 69% (about 22.3 GiB free), reclaiming
  approximately 15.8 GiB. Public checks for the migrated Jilanov website hosts and origin checks for
  KFC, Helper, Gigsy, and SEO returned HTTP 200 after cleanup; the `apidemo.jilanov.com` root returned
  HTTP 404, which is consistent with an API host having no root route.

### Forever build 70205 catalog publication (2026-10-04)

- Scan `1309b399-ca4b-4c57-a13c-fa34eee3a2c7` had uploaded and processed successfully. It was gated
  only because production did not yet have an exact published catalog for client build 70205.
- Exact WoWDBDefs revision `3e46d21a41a07ce7e63835fd79c561e0d5dce92b` and hotfix hash
  `eba98a15545c5390353d1c3f3b7e55c1a466f098adc390873a3ebaa2ab81f295` produced a snapshot with
  23,740 items, 31,731 spells, 12 professions, and 2,239 recipes. Both local and production audit and
  relationship validation passed.
- Build 70124→70205 adds 138 item records, removes three, and changes 183 normalized item records;
  it also adds 44 spell records, removes 16, and changes 768 normalized spell records. The recipe
  graph is unchanged. Three enchanting recipes gained a three-second cast time; the other changed
  recipe records were raw-evidence-only differences.
- Verified backup `shared/backups/wow_trader-pre-forever-70205-catalog-20261004.dump` is 29,049,471
  bytes. Immutable catalog/media release `wow_classic_beta-70205-enUS-eba98a15-3e46d21` contains
  2,949 verified icons.
- Published database build `ccb5edd9-8494-4352-ac91-7deab04904b1` matches the accepted scan's exact
  build. The live Trader shows 2,940 markets and crafting results with no review gate. Web and ingest
  remain online; only the web process was reloaded to clear cached catalog selection.

### Automatic catalog guardian (2026-10-04)

- Added and installed macOS LaunchAgent `online.kfcguild.wow-trader-catalog-guardian`. File-change
  triggers cover both the WoW build manifest and Forever hotfix cache, with a five-minute retry as a
  fallback. Status and logs live outside the repository under the user's Library directories.
- The guardian resolves exact official WoWDBDefs commits, extracts locally, runs the full audit and
  relationship validation, applies semantic promotion policy, verifies item media, creates a unique
  production backup, stages immutable releases, repeats verification on the server, publishes, and
  reloads only the web process. Production owner credentials never leave the server.
- Automatic policy allows exact item/spell metadata and craft-time updates but stops for missing
  evidence, extractor changes, count drift above 10%, or changes to profession, recipe, or
  transformation economics. Material changes therefore remain review-gated rather than silently
  using stale recipes.
- Its first production run detected a same-build hotfix change to
  `f1e43a579cb88f48a483c01906970335065599cfda6942e3c31dc8d38595c53f`. The compatible snapshot has
  23,819 items, 31,731 spells, 12 professions, 2,239 recipes, and 2,951 verified icons. It was
  published as build ID `3df286a3-8940-4f42-93c0-6ede4ff28076` after verified backup
  `wow_trader-pre-wow_classic_beta-70205-f1e43a57-catalog-20261004.dump` (35,029,084 bytes).
- A subsequent run exited cleanly as already current. Production still renders the accepted
  2,940-market scan and crafting opportunities without the catalog gate; both Helper processes are
  online and ingestion was not restarted.

### Public Forever research contract and catalog routes (2026-10-04)

- The published Forever catalog now has first-class searchable item, recipe, and profession pages
  under `/forever/encyclopedia/catalog`, with product-aware tooltip/detail/crafting links rather than
  TBC hard-coding. Trader results link directly to the corresponding Forever entities. A separate
  nested sitemap publishes the large entity URL set without risking the root sitemap limit.
- Item pages can show extracted loot relationship candidates while preserving their review state.
  They continue to label drop chance unknown and never convert a client hint into a confirmed source.
- The catalog package now provides `semantic-diff`: a tested, field-level comparison of normalized
  items, recipes, and professions. Raw evidence is ignored; item changes are classified by player
  impact and recipe reagent/output/cooldown changes remain economic changes.
- `/forever/data` and versioned public JSON endpoints expose the current build, normalized build
  changes, profession recipe/cooldown/unresolved counts, strict market-trend readiness, discovery
  coverage, world coverage, canonical entity URLs, and the publication rules. Public market reports
  require 24 accepted exact-market/build observations and 50% confidence even though the interactive
  Trader may show earlier collecting states. A scan from another build is never joined to the current
  catalog for a public trend claim.
- `wowforeverdiscord.online/research` consumes that contract for stable player-facing reports and
  owns the anonymous correction/review loop. BiS, class scaling, content availability, confirmed
  sources, and drop rates remain explicit evidence gaps until their independent gates pass.
- Focused catalog tests, Helper typecheck/lint, community-site typecheck/lint, and the recruitment
  census regression test pass. The community migration was applied to the local development
  database and a real feedback submission returned HTTP 201; its verification row was then removed.
- Production Helper release `kfc-helper-forever-research-20261004-r4` is active. Its clean Linux
  release passed lint, strict typecheck, 110 web tests plus the complete workspace suites, production
  build, and formatting checks. Only `kfc-helper-web` was reloaded; `kfc-helper-ingest` remains
  pinned to `kfc-helper-ingest-auction-20261001-r1` and was not restarted.
- Live checks returned HTTP 200 for the observatory, `/forever/data`, catalog, profession page, and
  all four nested sitemap shards against catalog build 70205. The root sitemap has 32,535 URLs and
  the four non-overlapping catalog shards have 8,000, 8,000, 8,000, and 2,075 URLs. A live crawl of
  all five files and the public pages/APIs left `kfc-helper-web` online at the same PID and restart
  count; the warmed process stabilized at about 361 MiB, below its 600 MiB restart guard. The
  community deployment then applied migration
  `034_research_feedback` after a verified isolated backup restore and activated build directory
  `.next-release-research-20261004-r3`. All seven reports, the research index, sitemap, and robots
  returned HTTP 200. A production feedback POST returned HTTP 201 and its exact verification row was
  removed. Article/Dataset JSON-LD and evidence-derived sitemap modification dates are live.

## Next actions

### 2026-10-05: Dungeon companion implemented locally

- Current request: implement `docs/forever-leveling-dungeon-integration-plan.md`. This turn does not
  authorize commit, push or deployment. The previously deployed reader-quality r5 release is
  unchanged. The large unrelated catalog guardian/public API worktree is preserved.
- Added reproducible declaration-only Lua extraction and a factual Wowhead inventory importer.
  Checked-in reference data reconciles 94 supplemental associations / 92 dungeon quest identities
  with 216 guide associations / 212 table identities into 259 quest records and 32 visit variants.
  Raw authorized leveling archives, account data, credentials and game extraction artifacts were
  not copied into tracked source. All current quest reward XP remains unknown.
- `packages/leveling/src/dungeon-{model,catalog,planner}.ts` owns typed gates, prerequisites,
  character eligibility, source attachments, coverage and whole-trip/marginal reference scenarios.
  Fake punch-card IDs, explosives self/future gates, Paladin final rewards, accepted-only transport
  prerequisites, inside starts, outside hand-ins and previous-dungeon work have explicit handling.
  Unknown lifecycle/scope/XP, unresolved alternatives and unavailable visits cannot yield a ranking.
- Dashboard **Optional dungeons** and reader **Dungeon preparation** provide selected bundles,
  independent accepted/objective-complete/rewarded states, starting-item confirmations, mutually
  exclusive reward choices, Undo, reference pickup markers and unchanged-route rejoin. Source tags
  stay enabled for finished visits; declining a visit preserves source progress and bookmarks.
  Nearby map-percent pickup cards are candidates, not a claimed travel optimizer.
- Each saved character stores release-scoped plans under `dungeons-v1-build-70205-oct-01` in the
  existing browser workspace and backup. Scenario inputs persist; backup merge preserves intentional
  removed confirmations. No new account sync, market scan, broad NPC/quest scanner or addon install.
- Lazy `/api/v1/leveling-rewards/:itemId` accepts known reward identities only and validates the
  published Forever build-70205 catalog. It has explicit missing/build-mismatch/unavailable states
  and reuses item stat formatting. Kept items are not also treated as vendor/AH income.
- Audit: 157 checksum-validated chapters, all 216 guide associations accounted for, 230 visit/quest
  rows (39 source-present, 25 overlay-needed, 23 inside-start, 10 later-stage, 25 lifecycle-review,
  108 unavailable/reference). See `docs/forever-leveling-dungeon-coverage.json` and
  `docs/forever-leveling-dungeon-implementation.md` for operation and limits.
- Restored current-release plans validate quest IDs, visit membership and reward choices before
  rendering, so malformed imports cannot crash the reader. Dungeon source tags use the archive's
  exact uppercase names, including STOCKADES, GNOMER and ULDA, verified by the audit.
- Verified: 60 leveling unit tests, 174 web unit tests, leveling/web typechecks and lint, script lint,
  archive audit, isolated production build, 30 existing leveling Playwright regressions and four
  dedicated desktop/mobile dungeon browser groups. Positive item-preview responses use mocks;
  real same-build DB preview smoke testing remains for deployment. Screenshots stay in unique temp
  folders. The user's existing dev server remains running and production is untouched.
- Next dungeon work: obtain current-build turn-in/modifier/XP observations, review the 25 unknown
  playable lifecycle rows, time feasible travel/hearth/exit/rejoin segments and playtest group runs.
  Add the opt-in guide observer/import validation separately before publishing live recommendations;
  do not label reference-only content as optimized or playtested.

### 2026-10-05: Bracket-replacement UX revision (implemented locally)

- User dislikes the detached dungeon checklist/calculator design. Requested direction: estimate
  dungeon quest XP using the Crest of Lordaeron example and offer concrete alternatives such as
  Hall of Thanes replacing the applicable **15–16 Darkshore** bracket. The subsequent explicit
  "do it" requests authorized implementation. It is now implemented locally; no commit, push or
  deployment was requested for this revision.
- Verified current source: Crest 95189 is 2,600 offline XP; the supplied Wowhead page has a player
  comment reporting 6,200 XP at level 20. Raw comment timestamp is `2026-10-01T21:04:13-05:00`;
  the posting date alone cannot prove the observed hotfix/modifiers. Calibrated factor is 31/13,
  approximately 2.384615. The implementation uses this labeled estimate, not a verified universal
  server coefficient. Exact observed hotfix/modifier context remains unconfirmed.
- Applying that factor only to dungeon quest rewards gives Thanes four quests (excluding Treaty)
  4,900 baseline / about 11,685 estimated XP; all five give 6,050 baseline / about 14,427 estimated XP.
  Separate outdoor prerequisite Underground Map 96391 is not dungeon-multiplied. Kills, outdoor
  quests and the level curve also do not receive the dungeon coefficient.
- Current guide pickup minima: two quests 14+, two 15+, Treaty 98423 16+. For a level-15 replacement,
  do not assume Treaty is eligible or use its reward to unlock itself. Town hand-ins after the run
  cannot unlock an earlier in-instance pickup. Check levels chronologically before each pickup.
- Build-70205 extracted `gametables/xp.txt` has 14,400 XP for 15→16; its SHA-256 still matches
  `935253a23756f0ab7a760e8e4ab22184e1aca49285944ea68efc0a8820e459e6`. It is client reference
  evidence, not runtime-confirmed. With that curve and calibration, starting at 15 with zero XP,
  four quest hand-ins leave about 2,715 XP for kills/current progress/other genuinely added work.
- Source chapter 126 (`chapter-126-14-16-darkshore`) has race-dependent labels 11–16, 13–16 and
  15–16. A replacement must target the actual profile/remaining segment, not universally delete
  this chapter. Chapter 127's applicable source still references quests introduced earlier; the
  static human-warrior/1× audit found carryover IDs 4762, 948, 963, 1138, 2138, 1002, 965, 986. These
  are conditional source expectations, not automatically proven mandatory server gates.
- Proposed UX: chapter-local alternative card with estimated quest XP, separate kill XP, XP gap to
  the next level/checkpoint, readiness, all-in time when available, kept preparations and exact
  rejoin. Primary choices **Use dungeon route** / **Keep questing**; detailed quest state/calibration
  sits behind **View plan**. Keep the fixed map + scrollable instructions and Next/Done/Undo.
- The level-coverage decision needs current level/XP plus the extracted curve and next checkpoint,
  not exact reward XP for every outdoor quest. Analyze outdoor dependencies separately. If a full
  skip is unsafe, retain a small preparation/continuation bridge or offer partial replacement.
  XP coverage is not a speed claim: speed still accounts for travel, recruiting, clear, hand-ins and
  rejoin and compares the player's actual party alternative.
- Preserve baseline data and expose explicit observed/calibrated/reference evidence. Prefer current
  matched observations over estimates; show estimates as estimates without requiring the player to
  fill a disconnected calculator. Date/build-scope calibration: Blizzard's October 1 notes halve
  the EXTRA bonus, not total XP. If an observation predates the change, conditional adjustment is
  base + (oldReward − base)/2 (Crest 4,400, not 3,100); do not apply that reduction a second time to
  a post-change observation. Some individual quests were also recalibrated.
- Implementation order proposed: calibration + curve adapter, reviewed Thanes/chapter-126 replacement
  with dependency bridge and chronological gates, chapter-first cards, reversible branch selection,
  then expand to other route/dungeon pairs. Branch choices must never mark omitted source steps done
  or destroy existing bookmarks/backups. Missing XP/time facts may label an estimated/conditional
  alternative, but unfulfilled hard quest/entry/rejoin gates cannot be passed by an estimate.

- Implemented `dungeon-alternatives.ts` and the chapter-local alternative card. Crest applies only
  to dungeon rewards, with per-quest rounding; already rewarded/retained rewards are excluded.
  Current XP and per-player kill XP reduce the checkpoint gap without multiplying the curve or
  outdoor prerequisite. Full-trip time differences require both inputs and estimated XP coverage.
- The approved Thanes choice opens a seven-stage fixed-map reader on the original chapter URL.
  Next/Done/Undo, bookmarks and progress are separate from source progress. Keep questing restores
  the outdoor bookmark; `?outdoor=1` preserves the choice while inspecting an original preparation.
  Dashboard Continue follows the selected branch. Missing/different-build source pairs cannot activate it.
- The chapter-126/127 dependency bridge filters class/race/rate directives, keeps unknown conditions,
  respects accept/turn-in order and required-versus-conditional uses. Continuation requires actual
  return level 16+, a resolved class/outdoor rate and explicitly reviewed applicable carried quests.
  Forecast XP and instruction ticks cannot satisfy these checks. Ironforge/Darkshore map backgrounds
  switch by stage; unverified dungeon coordinates remain unpinned. Mobile Review chapter has a real
  checkpoint anchor. Other dungeon/chapter pairs remain reference plans pending reviewed adapters.
- No dependency, migration, addon change, scan, production mutation or dev-server restart. Docs and
  `fixes.md` are updated; isolated build and dedicated browser checks are part of the verification.
- Verified: 79 leveling and 176 web unit tests; both packages' lint/typechecks; leveling build;
  isolated Next.js production build; all 30 existing leveling Chrome regressions; four reference-
  dungeon and four replacement browser groups. Replacement checks cover invalid XP, independent
  Next/Done/Undo, dashboard Continue, reload, original bookmark restoration, actual-level/quest-chain
  gates and mobile Review chapter. Screenshot review also replaced stretched neighboring chapter
  cards with a full-width outdoor/dungeon comparison row. XP remains estimated, not live observed.

### 2026-10-05: Leveling UX review (research/plan only)

- Reviewed the local chapter dashboard, outdoor reader and selected Thanes replacement in isolated
  Chrome sessions at desktop and 390×844 mobile widths. No application implementation, deployment,
  commit, production mutation or change to the user's browser profile was performed.
- The mobile instruction pane begins about 371 px down the 844 px viewport, and the repeated route
  comparison delays the first instruction further. The dungeon reader contains 22 quest-state
  selects across its stages. Current + next focus exists but is hidden in Settings; the selected
  route repeats both its large comparison card and Keep questing action.
- Prioritize a planning/play split: full comparison before selection, compact route summary while
  playing, visible current + next focus, compact mobile chrome with separate Next/Done actions,
  and a persistent desktop map with an adjustable map/instruction split.
- Surface source-derived outdoor carryover preparation before dungeon entry, distinguishing
  required, conditional and unresolved evidence. At return, show only outstanding checks and
  direct links to resolve them. Keep actual-level and explicitly reviewed quest-state gates.
- Replace repeated six-state dropdowns with stage-appropriate explicit quest actions and a status
  correction menu. Generic instruction Done must never infer quest acceptance or a reward.
- Separate original estimated trip XP, remaining estimated rewards and reported current XP.
  Prompt for an actual level/XP update after reported hand-ins; never credit calibrated rewards as
  observed XP or imply that XP coverage proves the dungeon is faster.
- Make the dashboard Continue-first with nearby chapters and a collapsed full archive. Preserve
  source bookmarks, separate dungeon progress, backups, Next/Done/Undo and evidence labels.
- Suggested order: reader density/mobile/focus; preflight and explicit quest actions; XP feedback
  and dashboard hierarchy. Verification this turn was browser inspection only, not a new unit or
  build run. Implementation needs regression checks for resume, gate enforcement and mobile focus.

### 2026-10-05: Leveling UX revision implemented locally

- Implemented the reviewed plan: default current + next, visible All steps, persistent mobile
  map/list preference, accessible 35–60% desktop map width, compact mobile header and bottom
  independent Previous/Next/Done/Undo/Review controls. Existing explicit preferences are preserved.
- Removed the repeated comparison from active dungeon instructions. Route & XP holds stage links
  and Keep questing; full inputs are in Settings. Outdoor alternatives are expandable, and the
  dashboard Review preparation link reveals the source carryovers before route selection.
- Explicit acceptance/objective/hand-in actions share quest state, with correction/undo. Generic
  Done still marks only an instruction. Preparation is shown before entry; the bridge/rejoin show
  outstanding checks and corrective links without weakening actual-level/build/carryover gates.
- Original estimated XP is saved separately from remaining rewards. Any reported reward-state
  transition marks XP stale; an explicit actual-level/XP update clears that flag and the earlier
  kill estimate. Neither forecasts nor instruction ticks credit earned XP or unlock continuation.
  Older replacements default the new forecast/staleness fields and retain bookmarks and checks.
- Continue-first dashboard shows nearby connected chapters/reference alternatives and a collapsed
  archive. Class/rate settings remain discoverable. Save feedback follows successful persistence;
  failed writes remain visibly memory-only and storage recovery clears its outdated warning.
- Screenshot review also fixed map-toggle/resize scrolling away from the selected instruction and
  long return-action labels clipping at 320 px. The 390×844 dungeon pane is now 596.5 px (~71%).
- Verified: 80 leveling + 180 web unit tests, lint/typechecks, leveling/isolated production builds,
  22 compatible existing Chrome regressions with explicit All steps, four reference-dungeon and
  six updated replacement browser groups, preparation deep-link and mobile Continue checks, and
  desktop/mobile reader/dashboard accessibility with no A/AA violations. Superseded old mobile
  toolbar selectors were not counted as unchanged passes. Docs and fixes are updated.
- No commit/push/deployment, dependency, migration, production write, addon change or dev restart.

1. Add structural snapshot-to-snapshot diff presentation and reviewed source corrections before
   consuming a later Talents Forever export; never auto-publish changed upstream evidence.
2. Implement and verify the market summary/compaction/retention jobs, recurring backup schedule, and
   disk/API/process/data-freshness alerts in `docs/production-deployment.md`; then enable unattended
   30-minute production uploads. The controlled PM2 startup drill is complete.
3. Import the installed AtlasLoot TBC modules into the versioned acquisition graph, publish a
   player-facing coverage report, and obtain the authorized Blizzard source/loot feed needed to close
   server-only gaps.
4. Add the first build-locked spec evaluator to the catalog-backed BiS workspace, then validate its
   whole-loadout mechanics before promoting its candidates to a ranked list. Do not publish
   phase-specific BiS until source/availability filtering exists.
5. Collect at least four more accepted scans for the same Forever market/build through the automatic
   watcher, then validate the newly unlocked normal-price bands and direction signals against the
   Blizzard UI before treating them as player guidance.
6. Extend scan-quality diagnostics with the Auctionator version, skipped-row counts, and separate
   in-game completion/file-flush times before accepting community collectors.
7. Extend addon snapshots with character profession skill, specialization spell IDs, and known
   recipe IDs so the account network can replace its visible simulation with actual eligibility;
   then add inventory/capital constraints and mastery-proc observations. Disenchant observations can
   audit the static table but are not required to calculate its expected value.
8. Extend the published build-70205 catalog with item stats, damage, resistances, sockets, item
   effects, teaching items, transformations, and in-game golden tooltip/recipe checks. Keep the old
   build-69893 world snapshot review-only; it is separate from the published build-70205 Trader
   catalog and must never be presented as exact current-client evidence.
9. Replace the Companion maintainer token with per-installation pairing/revocation, then sign and
   notarize macOS Intel/Apple Silicon packages, produce a signed Windows installer, and validate the
   Linux desktop/keyring matrix before promoting the download from maintainer alpha to public.
10. Keep the old world-diagnostics workflow paused while collector `0.9.1` remains market-only. If it
    is revisited, first extract the current build and regenerate all build-pinned seeds; do not restore
    or run the archived build-69913 quest/model catalogs on build 70124. The review-only
    boss/spell/location/source pages must remain provenance-labeled until a replacement evidence path
    passes review.
11. Submit the updated community and Helper sitemap URLs in the verified Google Search Console
    properties, request one inspection of the newly published research index/data report, and monitor
    index coverage, structured-data reports, Core Web Vitals, and queries. Account-side submission is
    the remaining external step; the crawlable pages and evidence-backed metadata are live.

## Working rules

- Update this file whenever state, decisions, verified evidence, or blockers materially change.
- Never commit extracted game data, raw uploads, companion state, credentials, or authorization files.
- Preserve raw evidence and build provenance; never overwrite snapshots in place.
- Do not equate client presence with a live drop source, drop probability, or phase availability.
- Do not create commits, branches, or pull requests unless explicitly requested.
