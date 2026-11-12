# Zul'Farrak entry reference and remaining summon requirement

## Latest download and continuation — November 5, V1249

The source-qualified Deadmines approach revision is deployed at **15:24:11 UTC**: **levels 1–41 / 1,511 tasks / 60 documents**. It preserves the existing suppression policy and ZF tool rules, adds Collecting Memories with full personal quotas, and keeps both side-tunnel quests outside before instance entry. All 4,035 tests, 1,840 saved player continuations, 320 native exports and both public browser imports pass. The full fast continuation still needs **9,680 XP before Krol'dok 42**; unconfirmed-mallet expected/slow need **140,132 / 102,903 before Maraudon 46**. Full 1–60 and original wider-group qualification remain unfinished. [Current source and release evidence](forever-leveling-download-deployment-2026-11-04.md); receipt: `.cache/leveling-no-grind-20261031/source-flow-progress-v1249.json`. Older figures and publication counts below describe historical checkpoints.

## Current continuation — V1206–V1225

The separately validated early dungeon revision retains the qualified ZF entry floor and manual one-per-party mallet condition. An explicitly selected conservative reference model now encloses possible suppression without supplying a threshold or positive lower payout. Strict/default behavior and old regression tests remain unchanged. Full checks pass 4,023 tests, 1,750 saved player continuations, 160 native exports and all 13,005 pins.

With no mallet confirmation, expected/slow endpoints improve to **44 + 87,116 / 45 + 12,165**; confirmed-tool inputs reach **44 + 104,218 / 45 + 29,246**. Both still stop before Maraudon 46. Fast remains before Krol'dok 42 at **41 + 83,373**, with 12,427 XP missing. The current 1–41 download now includes the qualified earlier BFD/RFK collections, published at 14:29:29 UTC; later ZF actions remain outside it. [Release evidence](forever-leveling-download-deployment-2026-11-04.md); receipt: `.cache/leveling-no-grind-20261031/source-flow-progress-v1225.json`.

Earlier endpoints and rejected-trial statuses below are historical.

## Current party-tool implementation — V1189–V1198

The isolated **V1193 plan / frozen V1195 engine** now requires a persisted manual party-readiness confirmation for **one party copy** of item 9240 before selecting quest 2770. Quest selection and the full optional package cannot grant that confirmation. Revoking it removes the summon from the fresh selected route. A forced encounter without confirmation blocks before adding XP. This is a readiness input, not a bag observation; no inventory is created. It is not yet exposed as a deployed settings control.

The actual 2770 pickup moves to the existing Shimmering Flats visit immediately after returning 1194, before dungeon entry. It remains required even if the optional catch-up target is already met. Compiler 99 asks the party to confirm one mallet before summoning and never requires five personal copies. Selection export/import preserves this separate readiness input.

Independent V1196/V1197 checks pass **six fresh / six restored forecasts**, **314 handoffs / 1,570 player continuations**, **160 native exports / 320 roles**, **30 source cases** and **11,797 input pins**. Full isolated checks pass **4,016 tests / 234 files**, strict typecheck, lint and build. No current-server possession, payout or clear is claimed. Default unconfirmed expected/slow endpoints remain **44 + 76,756 / 45 + 2,931**; explicitly confirmed endpoints are **44 + 93,870 / 45 + 20,012**. Fast still stops at **41 + 72,060** before Krol'dok 42. Full continuation funding is unfinished.

The subsequent early BFD/RFK insertion trial is rejected: a slow-case party range crossing levels 34–35 exposes an unresolved overlevel/boost-suppression case at Dark Iron War. Its new rewards are not adopted or published. V1198 verifies identical clipped actions and all 120 native documents for the existing live 1–41 cutoff; V1204 independently rechecks the live browser downloads. No deployment was needed.

Current receipts: `party-tool-delivery-audit-v1196/summary.json`, `clipped-prefix-compatibility-v1198.json`, `early-dungeon-diagnostic-v1202.json`, `gray-boundary-v1203.json` and `source-flow-progress-v1205.json`, under `.cache/leveling-no-grind-20261031/`. The following sections preserve the earlier entry-only qualification and its then-unimplemented tool requirement.

## Earlier entry qualification — V1168–V1187

The isolated V1182 plan / frozen V1184 engine supports **experienced entry at 43**, with **44 retained for conservative play**. This establishes the reference enemy-level floor. It does not establish an observed clear, measured payout or a complete executable continuation.

## Evidence

The pinned authored-static Questie NPC file has 35 rows associated with area 1176. The previous prepared combat input contained only quest-referenced NPCs and missed level-47 Sul'lithuz enemies. Thirteen normal-instance actors are normalized from that same file; no existing NPC record changes.

The local build-70205 client encounter table binds map 209 to Zul'Farrak. It identifies level-48 Chief Ukorz Sandscalp and Antu'sul as bosses; unique exact encounter names also qualify the missing Witch Doctor Zum'rah and Shadowpriest Sezz'ziz identities. The latter two do not raise the encounter ceiling.

The raw list also includes Gahz'ranka, whose client encounter belongs to map 309, and the friendly seasonal Elder Wildmane. They do not establish normal ZF combat. Weegli is not required enemy combat; including his recorded level 43 as an ordinary actor would still leave the maximum at 47. His demolition role is separately corroborated by the [historical open-source instance script](https://github.com/azerothcore/azerothcore-wotlk/blob/master/src/server/scripts/Kalimdor/ZulFarrak/zulfarrak.cpp), saved with a checksum in the private audit cache. That script is not evidence of current Forever scripting or XP.

Consequently, ordinary +4 requires 47 − 4 = 43, and qualified boss +5 requires 48 − 5 = 43. Level 42 fails both limits. The default conservative recommendation remains 44.

Primary input hashes:

| Input | SHA-256 |
| --- | --- |
| Authored-static NPC file | `9ef0d0c232ccfc58f8caeb28094e3332e8cf01e2c035ea5b2502c55301b81232` |
| Client manifest | `a506f715b1403dfb7d9f425fddea0f65d209ec9cf533a11c3f61eae879df639f` |
| Client encounters | `4b6478cda9ccbf26c00c3398c0bd2414bc8adc6a13bea0373848063c8943c7af` |
| Selected entry-only plan | `3cdb5de1019d29643de692459f3176839e9584d803f380f221cc99220a3bdc0b` |
| Frozen engine | `f99f8126c93cb12b748397d544870475ec9311a9545d2b87410bbb14f43c90e4` |

## Implementation and checks

`campaign-zulfarrak-entry.ts` attaches 32 possible-combat identities to the actual dungeon entry. It requires the matching build and provider hash. It does not copy these boss identities into the outdoor preparation checkpoint, assign deaths or add XP. Combat attachment retains the NPC records needed by those guards.

The readiness helper previously returned unresolved explicit identities/levels without forcing its consumers to stop. Forecast and native export now reject those unresolved explicit requirements. Existing acquisition-XP omission behavior remains unchanged; its prior tests are byte-identical. The initial broader correction failed 14 tests and is retained as failed evidence. The final scoped correction passes the unchanged suite plus the new regressions.

Verification completed:

- 4,002 tests in 233 files, strict typecheck, lint and ESM/declaration build.
- Six fresh and six restored forecasts for the actual Warrior/Priest/Mage/Rogue/Warlock party: three loot workloads, with the optional summon selected and deselected.
- 308 saved handoffs and 1,540 player continuations, preserving events and lower/upper XP bounds.
- 80 native/Lua exports across class, difficulty and optional-quest controls; 160 compiled roles.
- 15 independent source cases and all 10,598 frozen input pins.
- Unchanged first 832 approved tasks, 22 canonical source pins and canonical index.
- Identical clipped actions and all 120 leader/party documents for the published 1–41 cutoff.

The earlier `hasMallet` field in the private audit scenarios means “select Gahz'rilla,” not an observed inventory. The aggregate report names that dimension `gahzrillaSelected` and explicitly leaves ownership unconfirmed.

## Remaining work

Quest 2770 requires **one party member** to have item 9240, the Mallet of Zul'Farrak. The current source warns about it but does not model ownership or its acquisition. Selecting a quest cannot supply the item. Requiring five copies would also be incorrect.

The explicit no-summon sensitivity excludes the objective and reward for all five players. It reaches expected 44 + 76,756 and slow 45 + 2,931 before the existing Maraudon-46 gate. The fast case remains 41 + 72,060 before Krol'dok 42. The selected-summon projections are conditional until an actual party-tool condition is implemented and validated.

Next, implement that condition, review the remote 2770 pickup before departure, then restore Twilight Falls and Mortality Wanes through a separately validated early-segment revision. Preserve the previous segment payloads and certificates. Full 1–60 funding, final travel, observed server behavior and the original wider-group scope remain unfinished.

Receipts live under `.cache/leveling-no-grind-20261031/`: `zulfarrak-reference-v1175.json`, `zulfarrak-entry-delivery-audit-v1185/summary.json`, `clipped-prefix-compatibility-v1187.json` and `source-flow-progress-v1188.json`. The live download still uses the separately published V1159/V1161 1–41 source; this entry prototype has not been adopted or deployed.
