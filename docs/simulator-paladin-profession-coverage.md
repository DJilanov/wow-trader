# Paladin profession coverage

The original 3,024 confirmed cases cover twelve profession profiles. The current
equipment adapter admits thirty pairs from Alchemy, Blacksmithing, Enchanting,
Engineering, Leatherworking and Tailoring. This work checks the other eighteen
without repeating the complete gear search.

## Transfer conditions

The source audit authenticates all 666 compiler inputs of the existing Paladin
model and reviews all eleven non-generated-protobuf source files that reference
professions. Each target's seventeen item pools must be contained in a measured
representative's pools. Hand restrictions, duplicate ownership, unique categories,
quest choices, faction, class, race and enchant predicates remain the same.

Pool containment alone is insufficient. The checker also requires equivalent
profession behavior for every target-reachable set gate. In particular, it
preserves Blacksmithing's Darksoul gate. An extra Engineering profession can be
ignored only if neither owned Recombobulator is reachable in the target domain
and none of the retained consumable plans activates Engineering explosives or a
Minor Recombobulator. The current enchant rules have no profession requirement.
Unknown professions, new profession branches and newly reachable gated effects
require a new review; this is not a generic exemption from profession checks.

For each target case, choose the first compatible, legal source in a deterministic
ordering. The source build was selected from its original training. No validation
score ranks the representatives, no target metric is invented, and no old seed or
sample count is relabeled.

## Executed checks

The static audit finds compatible mappings for all 4,536 missing cases. A new
paired control changes only the two profession fields and the declared diagnostic
seed/iteration fields. Gear, enchants, talents, consumables, cooldown schedules,
damage, healing priorities and workload assumptions remain identical. Restoring
those four changed fields must reproduce the source protobuf bytes exactly.

Every pair runs four fights at seed 190910001 with detailed output. All 4,536
pairs have identical complete returned metrics and zero observed deaths. The
stage executes 5,505 distinct requests and reuses 3,567 exact duplicates. A
separate read-only replay reconstructs all 9,072 request origins and the entire
result using the executed, pinned comparison code. It starts no simulations.

Eighteen actual Chromium/WASM controls cover every newly mapped profile and all
nine style/assignment combinations on both factions. Each uses the exact saved
native request and workload. All complete metric payloads agree within 1e-7;
there are no page errors. These are engine/worker controls, not website preset
delivery checks.

The first checker failed because it requested summary-only output and then tried
to compare detailed metrics. Its 496 completed records and terminal failed owner
remain intact. The successor independently verifies all 252 available summary
pairs, then requests detailed output under distinct request identities. Three
regression tests cover absent detail, valid compact Go serialization, and metric
changes that must remain observable.

## Evidence and limits

Artifacts below are relative to
`artifacts/forever-simulator/optimization/healer-model-admission-v1/`:

| Evidence | Artifact | Byte SHA-256 |
| --- | --- | --- |
| Static domain/branch audit | `paladin-profession-transfer-audit-v1/audit-77oUqP/report.json` | `8af6fd7f6fa111d1557ca93eb85ee8d85a3feb4ac45b35037b51fa6701911dc2` |
| Detailed native controls | `paladin-profession-transfer-controls-v2/1fec12485ffe29db9c7526b6c8e4787115f690d609e1a26f6af7eca5f96b78fd/report.json` | `649f0f9b95fcd93b8eff4c1e7966b1c016b6b6094719aec12e4f49a12281cc08` |
| Independent request replay | `paladin-profession-origin-review-v2/1fec12485ffe29db9c7526b6c8e4787115f690d609e1a26f6af7eca5f96b78fd/review-2pq7DY/report.json` | `38c7a5c2177982e8f82ea8f495cbe9d5ee7a9c4096d0d40c634d1f6f1291a9a1` |
| Actual Chromium controls | `paladin-profession-browser-controls-v1/controls-lBiiJU/report.json` | `7806da1ed57630e8374d14436e33ee0ac71753d3ae30a457d7a57b5f2fd2db58` |
| Independent evidence merge | `paladin-profession-evidence-merge-v1/review-ru5YdE/report.json` | `b91be4d3082472048b142ddd51ca61834cb334f3eb5ea37c7c84d290007e163f` |

The merge revalidates each newly mapped whole loadout and independently binds
every browser capture to its saved native origin. It exposes 7,560 case records
across thirty profiles, with measured and equivalence evidence explicitly
distinguished. It retains all original source references and sample counts.

The scope is the pinned 180-second model, current catalog and six reviewed
crafting professions. Existing availability and server-formula limitations remain.
The diagnostic four-fight samples do not replace the source builds' training,
independent 2% comparisons, separate 1% assessments or historical-failure checks.
Their original references and actual sample counts must remain attached to any
transferred recommendation. Gathering-profession passives are outside this scope.

Five-minute and spread assignments, complete Paladin presets, library/guidance,
website/browser delivery and production release remain required. These artifacts
do not publish or completely qualify the class.

Focused regression checks:

```sh
node --test artifacts/forever-simulator/optimization/review-tools/paladin-profession-transfer-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/paladin-profession-request-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/paladin-profession-metrics-v1.test.mjs infra/simulator/healing-compact-action-metrics-comparison.test.mjs
```

Do not edit the successful source versions or rerun completed numerical stages.
The read-only origin reviewer can verify the completed controls by passing the
exact artifact path and byte hash above to
`review-paladin-profession-origins-v2.mjs`. The original Paladin deadline remains
October 25 at 23:58:06.787 UTC; none of this work resets it.
