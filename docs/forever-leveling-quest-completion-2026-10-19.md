# Forever guide: completed quest collection, October 19, 2026

Status: reconciled and verified locally. This receipt does not describe a production deployment,
an in-game playtest or a completed Horde campaign.

A later authorized [browser test release](forever-leveling-test-deployment-2026-10-19.md) is now live.
The local snapshot and earlier verification receipts below remain historical evidence, not addon
playtest or measured-route certification.

The subsequent [quest-validation consumer receipt](forever-leveling-quest-validation-consumer.md)
documents the newer review.3 package, observation consumption and fresh browser checks. Earlier
review.2 ZIP and audit identities below are historical receipts, not the latest recorder.

## Collection and reward result

The quest crawler finished normally at approximately 20:20 EEST. Its final batch reports 76 newly
crawled pages and 278 cached tasks. The merged queue contains 354 identities:

- 353 captured quest pages, each with a schema-valid, available XP record;
- quest 3343 remains the previously reviewed unavailable Wowhead page, not a numeric zero or proof
  that the quest does not exist in game;
- all 83 pages requested by the route-evidence plan are captured, including the final quest 7848;
- all 26 previously historical route rewards now have captured Forever reward evidence.

The local validated reward root is
`artifacts/reference/questie/completion-20261019/published`.
It was seeded from the unchanged October 18 server snapshot, then processed with the existing
`publishQuestXpCycle` and the publisher's current-client identity/leveling-allowlist checks. No new
Wowhead requests, validation bypasses, database writes or production mutations were needed.
The publication cycle checked 353 pairs, updated 76 records and held none. It preserves 1,652 total
reference-feed identities: 1,505 available, 147 unknown and zero conflicts. Those 147 unknown rows
are not missing hand-in rewards in the supported guide.

`artifacts/reference/questie/completion-20261019/reconciliation.json` records the input/output hashes:

| Input or output                  | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| Normalized 354-task queue        | `49049cf3e9f29246005f87275a129b466af0017c55970e980db82c6eb7780372` |
| Previous published XP index file | `83541e3483fe9580101dd09d69766c3d0b26526491cbc63745583210cb2944bc` |
| Completed local XP index file    | `3c86986a7072ad6a584c6638937de22000d7696290719e192b2ec84aa5272205` |
| Build-70205 identity manifest    | `a506f715b1403dfb7d9f425fddea0f65d209ec9cf533a11c3f61eae879df639f` |

## Guide audit and addon

The rebuilt matrix covers 33 Alliance browser editions, 132 scenarios and 6,000 chapter checks.
All 1,161 distinct real hand-in IDs have available Forever rewards; there are zero historical
hand-in fallbacks and zero unresolved numeric hand-in rewards. Audience-relevant forecasts have
no blockers or shortfalls. Off-audience starter diagnostics are not party-route failures.
The route retains 18 sourced dungeon stops and three separately labeled guaranteed-bundle planning
stops. Their 12 unidentified Alliance quest slots are not fabricated numeric quest IDs.

Audit:
`artifacts/leveling/audits/2026-10-19/quest-completion/campaign-xp-audit-b52ac9b6d8c290dc.json`,
SHA-256 `b52ac9b6d8c290dc430ad27f0023ce844efcde8b6de3dac8f8b02cdd9a7e2033`.

Backlog:
`artifacts/leveling/audits/2026-10-19/quest-completion/campaign-evidence-backlog-280bd799ba725de0.json`,
SHA-256 `280bd799ba725de0a4e48daf9a8f7d7d9eb97706da8be4a97be4a8249de2cf8b`.
Validation tasks decrease from 147 to 121 after the 26 reward estimates are resolved; 106 measurement
tasks remain. The certification gate correctly remains false. Source reward coverage does not prove
party eligibility, quest credit, clear timing, observed combat XP or a timed optimal route.

All 28 exact addon editions compile against these rewards. A new Human/Warrior review package is:

`artifacts/leveling/campaign-addon-review/kfc-premade5-human-warrior-aeaf87d7cab25c8c/`

- ZIP: `kfc-premade5-human-warrior-aeaf87d7cab25c8c.zip`
- ZIP SHA-256: `329c3c6100c3d3f86d01bfec7ccdcd8213678bf1ee81a1f1ffd7c91d576bb94f`
- Version: `0.2.0-review.2`; source curve/archive build 70205; runtime guard 70450;
  RestedXP target v4.11.26, interface 16001.
- 2,445 actions, 852 distinct hand-ins and no historical route-reward fallback.

This ZIP is for the [bounded in-game review](forever-leveling-addon-review.md#bounded-in-game-review),
not a public or playtested release. No addon files were installed or replaced on the owner's client.

## Reconciled source differences

The refreshed source report is
`artifacts/leveling/evidence/campaign-quest-source-evidence.json`.
All 83 current pages are present. After the final pickup-parser correction, its states are 66
source-ready, zero pending-current-page, three manual-review and 14 conflict. A conflict remains
visible instead of being silently marked resolved by the successful fetch.

Thirteen minimum-level differences are retained below. "Curated" is the prior route/reference
claim; a planning quest level or desired dungeon entry level is not a pickup minimum.

| Quest | Captured Wowhead minimum | Historical QuestieDB minimum | Curated minimum |
| ----- | ------------------------ | ---------------------------- | --------------- |
| 153   | 10                       | 10                           | 9               |
| 378   | 22                       | 22                           | 25              |
| 1100  | 29                       | 29                           | 23              |
| 1139  | 35                       | 35                           | 30              |
| 1144  | 22                       | 23                           | 23              |
| 1475  | 38                       | 41                           | 38              |
| 4136  | 48                       | 48                           | 50              |
| 92458 | 24                       | —                            | 30              |
| 96393 | 9                        | —                            | 15              |
| 96394 | 10                       | —                            | 15              |
| 96395 | 10                       | —                            | 14              |
| 96403 | 10                       | —                            | 14              |
| 98423 | 9                        | —                            | 16              |

Quest 5214 has a title disagreement: the captured page says "The Great Fras Siabi", while the
historical QuestieDB row says "The Great Ezra Grimm". Keep both source identities rather than
rewriting the historical data. The existing route uses conservative catalog/current-reward gates;
these captures do not globally lower its pickup requirements or certify disputed boundaries.

The three manual-review rows are item-start quests 3373 and 5089 and prerequisite-gate context for 92744. Quest 4126's explicit zone is now retained even when spawn coordinates decode as an array,
resolving its source-only pickup-location gap. Quest 92744 has its current page: a missing prerequisite
statement is now correctly manual review, not a request to fetch the same page again.
Razorfen Kraul area 491 is now recognized when classifying Willix's inside-dungeon pickup.
These corrections have regression tests. Direct starter-item sources from the existing Questie
artifact are now retained for 3373 and 5089, while their absent current-page starter relations stay
unverified. No additional crawl requests were made. See the
[consumer receipt](forever-leveling-quest-validation-consumer.md) for current report hashes and checks.

The refreshed `artifacts/leveling/evidence/campaign-quest-validation-plan.json` contains exact
recording commands for 112 task/code pairs across 65 quests. Eight named-target checks intentionally
lack current-page metadata because their party-credit behavior requires an in-game observation,
not another page fetch. See [quest validation](forever-leveling-quest-validation.md).

## Repeat verification

From the repository root, with the already built packages:

```sh
node --test scripts/leveling-quest-evidence.test.mjs \
  scripts/leveling-evidence-crawl-queue.test.mjs \
  scripts/leveling-quest-validation-plan.test.mjs

node scripts/audit-leveling-quest-xp.mjs \
  --destination=artifacts/leveling/audits/2026-10-19/quest-completion \
  --rewards=artifacts/reference/questie/completion-20261019/published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --runtime-build=70450

node scripts/build-leveling-campaign-addon.mjs \
  --archive=artifacts/leveling/archive \
  --rewards=artifacts/reference/questie/completion-20261019/published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --runtime-build=70450 --restedxp-version=v4.11.26 --verify-all
```

Verification passed: 292 leveling tests; 47 focused reference/XP tests; eight source/queue/checklist
script tests; modified-script lint; the complete browser audit and addon edition matrix.

## Remaining release work

The fetch prerequisite for the identified Alliance route is complete. No additional crawl of this
queue is needed to replace its old XP estimates. Unidentified future dungeon IDs, exact disputed
pickup boundaries, personal eligibility/party credit, full lifecycle observations, measured timing,
the full Horde itinerary and explicit source approval remain distinct follow-ups. The observation
consumer has since been implemented; its receipt does not replace actual in-game evidence.

The later browser test release uses a reviewed, pushed source revision. For further releases,
merge these normalized quest pairs through the existing publisher, preserve conflicting/newer
public records, and verify the web guide reads the same XP snapshot as the audit. Do not activate
the review ZIP as a public download before its bounded install/parser/tracking/reload checks pass.

The pre-deployment read-only server check found the web `current` symlink at
`/home/wow-trader-system/releases/kfc-helper-item-skills-source-20261019-4d043d3` and the world snapshot
at `wow-classic-beta-70205-extractor-0.4.0-fb8e9cb7`. These are observed deployment path identities,
not proof that the local leveling changes were deployed. Preserve that newer web baseline when
preparing an authorized release; do not activate the older leveling-test release over it. No new
reviewed quest observations or KFC guide SavedVariables were present during the check.
