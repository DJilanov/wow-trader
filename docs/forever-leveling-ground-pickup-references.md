# Source-backed ground pickup references

The local compiler can plan an exact one-item world-object pickup without treating it as a mob-drop farm. This adds supported quest hand-ins to the no-grinding forecast. It does not establish acquisition time, object respawns, incidental combat, or current-server XP tuning. The complete route remains unreleased; see the [current audit](forever-leveling-no-grind-audit-2026-10-31.md).

## Evidence and eligibility

The November 1 location-text correction admits the archive's exact sentence about alternate
spawn locations in the lake. It does not admit creature spawns, summons, guards or mixed
objectives. Hilary's Necklace now has a corroborated one-item Glinting Mud proof. Generated
instructions and both native guide roles retain all possible markers and tell the player to
search the others if one is empty; no active-object count, respawn time or five-copy opening
is inferred. The other five object proofs and all original source fields are unchanged.

Preparation corroborates three independently identified records from the same pinned provider/archive inputs:

1. The quest has one named item objective requiring one item, objective index 1, no creature targets, no NPC drop sources and no pickup-provided item.
2. A source step explicitly names the same item in its completion counter and says to open a named object and loot that item. It includes a location and no mixed objective, item use, spell, combat trigger, foreign quest predicate, timer or skill check. An own-quest `.isOnQuest` guard is satisfied by the generated pickup. Skipped objectives do not qualify.
3. The provider item lists that exact object ID as an item source; the object name matches the source instruction and its map coordinates resolve through the pinned AreaID-to-UiMapID table. Ambiguous objects, conflicting proofs, missing coordinates and unmatched zones stay unresolved.

The first evidence row's source chapter/version/step remains on each normalized record. The source is evidence for the acquisition, not a class ability or copied route branch. Actual class/race access, pickup minimum, exclusive quests, prerequisites and other restrictions remain in the catalog. For example, MacGrann's quest is available to the Alliance even though its reference opening instruction comes from a class-specific Dun Morogh guide branch. The generated task uses the actual giver, object and return; it inherits no unrelated class commands. Alther's Mill, quest 2282, does not qualify for generic preparation.

The coordinates used for planning come from the provider's object spawns. Original RestedXP world coordinates are retained in the source archive; they are not converted using guessed map bounds. A one-item quota means each player must obtain their own quest item, not that one chest opening supplies five copies. The player instructions wait for everyone's actual objective to complete. Unlisted encounters award no predicted kill XP.

## Current normalized records

| Quest                                | Item                          | Object                        | Map coordinates         |
| ------------------------------------ | ----------------------------- | ----------------------------- | ----------------------- |
| 125 · The Lost Tools                 | 1309 · Oslow's Toolbox        | 32 · Sunken Chest             | Redridge 36.43, 54.66   |
| 312 · Tundra MacGrann's Stolen Stash | 2667 · MacGrann's Dried Meats | 272 · MacGrann's Meat Locker  | Dun Morogh 38.51, 53.93 |
| 399 · Humble Beginnings              | 2998 · A Simple Compass       | 1166 · Alexston's Chest       | Westfall 36.24, 54.52   |
| 3524 · Washed Ashore                 | 12242 · Sea Creature Bones    | 175207 · Beached Sea Creature | Darkshore 36.37, 50.92  |
| 3741 · Hilary's Necklace             | 10958 · Hilary's Necklace     | 154357 · Glinting Mud         | 12 possible Redridge locations |
| 4681 · Washed Ashore                 | 12289 · Sea Turtle Remains    | 176189 · Skeletal Sea Turtle  | Darkshore 31.82, 46.31  |

Source provider: Questie/QuestieDB `e9a67d1a2753a0e64c4c96bf7864788fac7b765f`, authored corrections included. Object export SHA-256: `055fc798c1ee9b38b507617923c4a08780568853e42e4ef06b7d766c871b469c`. Source archive/build: `af3fec7909e0b5a1dd8659f87e67171f8984af40a22b997e630a0052a11c871e`, build 70205.

Prepared catalog: `149b415d7a20c8ab493322586301d2827f3180e67d419ebd2054083dc8280cf1`. Prepared combat: `5f3aec010cded693a95a2f47d3492540289bccb8790456075df7e589ee27c7fc`. Both live under `artifacts/leveling/authorized-ground-location-references`, with combat in its `combat` subdirectory. The combat record links the exact catalog checksum. The preceding five-proof pair is preserved under `authorized-ground-pickup-references` (catalog `25b1dc3e438f1a6213a717e9a2a866791039e5961ccfd71ff7a6b74cc0824800`, combat `6794b0cd20eab80b60f27a9c875fcc9a49aeaf85fc48b5da5838e248631b396e`).

Removing only the new ground-reference fields, object-export checksum and updated catalog link reproduces the previous catalog/combat data exactly. Existing quest flags, NPCs, rewards, item quantities, sharing references, captured probabilities, conflicts and source citations are preserved. Existing Classic loot license/copyright notices accompany the new artifact; provider attribution and source hashes remain in its metadata. No recordings or dungeon-clear profiles were added.

## Compiler and reader contract

- `quest-ground-pickup.ts` defines the optional normalized reference. Catalog/combat schemas require item/object export provenance, the matching quest/item/archive and a one-item objective with no conflicting acquisition method.
- `leveling-ground-pickups.mjs` derives records from data literals and source instructions. `prepare-leveling-ground-pickups.mjs` owns bounded I/O, source/hash/build checks, publication checks and immutable artifact output. Provider Lua is parsed, never executed.
- The new `ground-pickups` funding pass runs after the accepted plain, NPC-dialogue and provided-delivery passes. It is omitted when there are no eligible ground records. Existing general shared-kill/delivery eligibility is unchanged.
- A ground batch requires matching catalog and combat references. It emits pickup → actual collection → return, includes the trip back to the route in its score and retains real prerequisite closure, pickup minimum and difficulty limits. Completed rewards cannot be reused.
- Generated native actions use `.accept`, `.complete` and `.turnin` with map coordinates. A ground objective adds zero kill XP. It is not replaced by an immediate hand-in.
- The existing all-configuration stage guard rejects a proposed allocation that worsens another supported configuration. This protects the funded prefix; the relative travel score is not measured minutes or proof of global optimality.

Both reference formats remain backward compatible with existing inputs. New artifacts require the matching reader code because earlier strict readers do not understand the optional object fields. Regenerate these proofs after changing the provider exports or source archive; never copy them across mismatched revisions.

## Reproduce

Use the previously authorized inputs and a clean provider checkout with its authored exports generated:

```sh
pnpm leveling:ground:prepare \
  --catalog=artifacts/leveling/authorized-ground-pickup-references \
  --combat=artifacts/leveling/authorized-ground-pickup-references/combat \
  --provider-root=.cache/questiedb-professions \
  --revision=e9a67d1a2753a0e64c4c96bf7864788fac7b765f \
  --destination=artifacts/leveling/authorized-ground-location-references
```

The command requires authorized inputs, preserves their authorization text and rejects source/build/checksum mismatches. It writes a new linked catalog/combat pair plus `review.json`; it does not crawl, modify the game, change live environment pointers, install an addon or deploy the website.

The offline route audit uses the new catalog root and its combat subdirectory. Test results and configuration comparisons are recorded in the current audit. Browser, travel-time and in-game verification remain separate; compilation and a balanced XP ledger do not establish them.
