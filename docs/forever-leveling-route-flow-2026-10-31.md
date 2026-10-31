# Five-player route flow review — October 31, 2026

## Status

Implementation and review are complete; commit, push and deployment are authorized. The production activation receipt will be recorded below after the candidate passes its production checks. No new in-game review ZIP is included. This review covers route continuity and execution instructions, not a measured fastest-time claim.

The original report was correct: the Human Loch Modan starter retained its solo “Fly to Westfall” ending while the next selected chapter began in Darkshore. Earlier release checks did not catch this disconnected travel. The correction now follows the selected party itinerary in both the browser and the native RestedXP compiler.

## Travel policy

- The owner confirmed the **Stormwind ↔ Auberdine ship in both directions**. Use it for the Darkshore crossing and return; Ironforge connects through the Deeprun Tram. The early shared bear/furbolg circuit and the later northern Darkshore visit remain separate because their quest levels differ. A second visit is not a reason to move quests into an unsuitable level band.
- Keep original step IDs for rewritten source transfers and relocated dungeon pickups. Browser bookmarks for relocated tasks resolve to their current chapter.
- Give an explicit road, boat, tram or portal connection when the next task changes zone. Learned flights and a ready, correctly bound Hearthstone are optional shortcuts, never fresh-character prerequisites. Long fallback directions are collapsed in the browser.
- Do not cross the ocean twice to shorten an entirely mainland journey by graph-edge count. Ground routing stays on the same continent when both endpoints are there.
- Preserve actual on-route flight-master visits. An XP-only marker does not establish a zone visit, and a shared map ID does not justify a distant flight-master detour.
- Region batching uses public-transport connections and quest dependencies. It has no measured boat waits, flight times, camp competition, or walking-time model. It does not prove a global minimum travel time.

## Changes to quest flow

1. Optional library quests must fit a real selected zone visit at the applicable level. Source chapter membership and a similar level alone cannot create an extra visit. Mandatory selected unlocks retain their prerequisite treatment.
2. Independent outdoor tasks are batched by zone after dungeon-return ordering is established. Accepted quests precede objectives, all required counters precede rewards, and prerequisite hand-ins precede child pickups. Unknown instruction context remains a barrier; dependency cycles fail the review.
3. Outside dungeon pickups are moved onto existing preparation visits when their level and recorded prerequisites permit. Inside continuations finish before city returns. Outside rewards are grouped by hub, including the following route destination. BRD retains its authored multiple-visit sequence.
4. Thaelrid’s BFD continuation is accepted before later boss work, and Celebras’ Maraudon scepter ritual precedes Princess Theradras. Item-start quests wait for the inside objectives, and escorts start after the clear objectives. Excavation’s Ardin hand-in stays inside; the relic then goes to Whelgar before its Ironforge continuation.
5. Screecher Spirits is combined with the earlier Tanaris/Feralas crossing. Mosh’aru is accepted after its return. The Ancient Egg and the Hakkar pickup finish before the Desolace work, rather than interrupting it with another world circuit.
6. The Temple route retains its actual early Brohann → Hinterlands → Rhapsody lead-ins. Required Rhapsody collections use the already selected Feralas/Tanaris visits. Reviewed prerequisite links prevent unrelated adjacent hand-ins, such as Gahz’ridian, becoming invented requirements for The Stone Circle.
7. Green Hills page collections are held from the default five-player route. Class protection requires class-specific pickup evidence; a class-conditioned loot/objective hint alone cannot turn an ordinary farm into a mandatory class unlock.
8. Missing manual dungeon instructions and objective counters use the matching eligible archive phases. Curated historical execution details supplement missing lifecycle descriptions; they add no reward XP or current-server observation. An existing first objective no longer hides a second required source counter.
9. Item hints use the native adapter’s quest filtering in both views. Unselected bound collections and their item-use commands cannot leak back into a retained kill task. Rewritten transfers suppress the stale native travel commands while retaining relevant training utilities.
10. Researching the Corruption accepts Gershala’s direct pickup; The Corruption Abroad is an optional breadcrumb, as corrected by [Dungeon Quest Atlas v2.14](https://www.curseforge.com/wow/addons/dungeon-quest-atlas/files/9270999/dependencies). An optional dungeon extra is held if its catalog prerequisite is absent or excluded, including Highland Hides after the crocolisk farm is removed. Reviewed continuation gates are enforced when reporting task completion as well as when ordering tasks.

## Evidence and review boundaries

The executable sources are the existing checksummed, authorized archive: 61 Alliance questing chapters at source build 70205. The matrix deliberately runs **without private combat data or reward imports**, reproducing the public fallback that previously missed continuity issues. Published reward evidence continues through its existing identity and publication checks. No evidence gate was loosened.

The historical execution supplement is `packages/leveling/src/campaign-dungeon-reference.ts`; it describes locations, quest phases and dependencies, not XP. Relevant checks include the authorized Maraudon and Temple chapters, [Uldaman’s entrance-cave treasure distinction](https://www.wowhead.com/classic-ptr/it/guide/classic-wow-uldaman-dungeon-quests), [Excavation’s inside and outside quest handoffs](https://www.wowhead.com/forever/guide/excavation-site-wetlands-dungeon-overview-location-rewards), and [Divino-matic Rod’s quest record](https://www.wowhead.com/classic/quest=2768/divino-matic-rod). Current Forever client details can still differ from historical instructions.

The Drowned City, Krol’dok and Alcaz retain the previously accepted four-slot planning bundles. Unknown quest IDs and entrance details are not invented. The audit checks selecting and skipping those stops; it does not certify their unrecorded in-game entrances. No unverified Southshore boat-loop direction or hypothetical travel duration is introduced.

## Verification

- Leveling package: 631 tests, strict typecheck, lint and production package build.
- Web: route and campaign component tests, typecheck and scoped lint.
- Checksummed archive matrix: 33 race/class editions × 2 finish strategies × optional stops/raid goals enabled or disabled = **132 route variants**. Exact-class variants also compile their leader/party native exports for RestedXP v4.11.27. Checks include unresolved prerequisites, unique task IDs, chapter ownership, orphan steps and stale terminal transfers. A staged quest-state walkthrough verifies pickups before objectives/returns and the actual completion gates. Levels are set high for that dependency check; XP and pickup-level forecasting remain covered by the separate package tests.
- Browser: desktop/mobile regression for the reported step. The action displays Stormwind Harbor → Darkshore, retains its old bookmark, has no obsolete Westfall instruction, and has no horizontal overflow or client exception.
- Focused browser checks confirm BFD’s Thaelrid/Kelris sequence, Maraudon’s ritual before Princess, Temple’s inside Essence return before city deliveries, and a relocated BFD pickup’s bookmark redirect.
- The Human/Warrior chapter navigation walkthrough checks all 42 public chapters, including each next-chapter destination and the finish-page wrapper. Receipts are under `.cache/leveling-travel-20261031/`; see `browser-chapters.json` for the completed result.

Re-run the archive matrix with:

```sh
pnpm --filter @wow-trader/leveling build
node scripts/review-leveling-route-flow.mjs \
  --archive=artifacts/leveling/archive \
  --report=.cache/leveling-route-flow/report.json
```

This command performs local parsing and compilation only. It does not crawl, upload, install an AddOn, or change saved player progress. The report records source identity, every edition/scenario, chapter endpoints and failures. It exits unsuccessfully when any edition fails.

## Delivery follow-up

Review the local change as one coherent route update. A release must use a frozen committed snapshot and repeat the production candidate checks with its exact published rewards and client data. Keep unrelated concurrent Trader changes outside this route review. A new review ZIP requires the new compiler revision, `campaign-addon-20261031-v27`; existing ZIPs are not silently refreshed by this code change.
