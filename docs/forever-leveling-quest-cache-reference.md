# Published client quest records: evidence and qualification

**Current local component (V207):** Baron level 17 is owner-confirmed; Data Rescue uses its captured punch-card puzzle. All 3,078 relevant tests, 48 workload forecasts and 20 native/Lua exports pass. The expected minimum still needs **2,821 XP/player for level 29**. Fresh production preparation, full 1–60 and every original other-group edition remain unfinished and undeployed. [Current results and remaining work](forever-leveling-product-plan.md#current-local-component--punch-card-and-baron-v207).

## Source and provenance

Efficient Games publishes aggregated server-described quest caches and addon observations at repository revision `9c3f82fc7c8ce60760e933db529fd629c2f682d7`. Normal read-only public downloads were saved without using the custom crawler, browser profiles or provider Lua execution.

Data from Efficient Games (https://efficient.games), licensed under CC BY 4.0.

- [Dataset definitions](https://raw.githubusercontent.com/JIVESCORP/eg-link-output-wowf/9c3f82fc7c8ce60760e933db529fd629c2f682d7/DATASETS.md)
- [Archive-build 70205 quest records](https://raw.githubusercontent.com/JIVESCORP/eg-link-output-wowf/9c3f82fc7c8ce60760e933db529fd629c2f682d7/data/wow_classic_beta/1.60.1.70205/quests.enUS.json)
- [Later build 70450 quest records](https://raw.githubusercontent.com/JIVESCORP/eg-link-output-wowf/9c3f82fc7c8ce60760e933db529fd629c2f682d7/data/wow_classic_beta/1.60.1.70450/quests.enUS.json)

The local download metadata records exact URLs, builds, collection dates, byte counts, attribution and SHA-256 hashes. Source data describes October beta observations; it is not a November live-server survey. A source count is not a count of independent controlled trials, and contributors can overlap across builds.

## Counter cross-check

The initial V177 audit matches literal quest IDs and objective type/target IDs against its combat reference. In that matched subset, **571 scalar counters agree, 35 held counters have new leads, and none of the compared non-null scalars conflicts**. Missing records, ambiguous target matches and unknown objective types are not agreements. This does not validate every quest, every UI objective index or the entire group matrix.

For **1057, Reclaiming the Charred Vale**, both builds list exactly four monster objectives: 4022, 4025, 4024 and 4023, each requiring six kills, with storage indices 0–3. V179 reconciled the scalar fields but incorrectly left seven-kill provider prose active. The runtime therefore still rejected the conflict; its initial test used generic names and did not exercise that comparison. V180’s real-target regression reproduces that defect. The corrected normalization validates both clients’ title/levels, every literal target/type/index, and prose counts using the shared pure runtime parser. The active matching-build text now agrees with six kills per type. Earlier seven-kill text and complete prior records remain in immutable input files and the full resolution provenance; no conflict rule is weakened. The corrected data selects 24 shared kills before BFD. No reward, access, position or drop fact changes.

Other leads include Young Crocolisk Skins, Blueleaf Tubers and several class/Horde quests. A counter lead does not make a quest suitable for the shared Human route. Class restrictions, actual access, source methods, geography, drop workload and prerequisites remain independent gates.

General normalization must preserve objective IDs, types and storage indices. Do not assume every storage index is the guide's one-based UI index, or that an absent field proves unrestricted access. Distinguish items provided at pickup from items that start quests; the name `startItemId` alone is insufficient to establish that relationship.

## Reward comparison

Thirteen public turn-in datasets contain 908 records across builds, with duplicates between builds. Eighteen observations match selected Alliance quests and a usable level/context subset. Ten match current reference rewards; eight differ by 5–10 XP. All eight differing values fall between 500 and 1,000 XP and fit a nearest-25 rounding hypothesis, while the other observations remain unchanged.

This is **not** sufficient to blanket-round rewards. The observations omit full XP bonus/talent context, and most are from builds different from the archive. The next step is to inspect the matching client's `QuestXP` values and establish the difficulty, multiplier and rounding rules. Do not turn aggregated observations into controlled payout claims or change saved player XP.

## Matching client tables and complete-record audits — V181

Local 70205 and 70450 evidence includes both `QuestXP.db2` and decoded level/difficulty rows. The binaries share SHA-256 `d21523c8a47d0a236ba38860698a2334dbecb2221d18f394308c935adfd00aa1`; all decoded rows agree. Quest-cache records now supply the missing individual difficulty and multiplier bindings for part of the route.

A read-only join finds 294 matching reward bindings among the 461 V179 selected quests; 167 remain missing or inconsistent. It flags 110 stored full-value differences and 95 differences in comparable reached reward contexts. These are review leads: stored fields may represent a dungeon base rather than a final reward, and source revisions, float/reduction order and XP buffs still matter. The calculation changes no production or frozen-run reward inputs.

A [pinned TrinityCore rounding reference](https://raw.githubusercontent.com/TrinityCore/TrinityCore/9180ccb818605d573e05eae76f1989b78754b4d2/src/server/game/Quests/QuestDef.cpp) uses progressively larger rounding steps, including 25 in the 500–1,000 range. Applying that candidate rule to the matching table/bindings reproduces all eighteen available turn-in observations. This is an inference from independent kinds of evidence, not proof that Forever runs that implementation. Low-XP behavior and full buff context remain unverified; for example, 18’s stored 355 would become 360 under the candidate. Do not blanket-round facts or select only increases to fund a route.

A separate complete-objective audit covers 462 V180 selected quests: 235 have represented logical membership, 60 need method/item review and 167 lack a comparable pair. Most flags are supplied parcels or separately modeled ground tasks, so the 60 are not automatically bugs. One concrete supplied-item discrepancy is 98824: the provider’s objective encodes 270865, whereas both client objective records require 287959 and both clients provide that item at pickup. The item export names both IDs Titan Relic. Preserve the real boss-starter delivery and distinguish the follow-up inventory identity.

Five level-field differences are recorded separately: 472’s quest level, both Thandol minima, Willix’s minimum and Faldrim’s missing provider minimum. Apply no broad access relaxation; reconcile the exact records and re-run the route after any change.

Alther’s Mill 98386 remains unselected. The two clients list twelve spiders and six egg-destruction credits; the provider omits the latter. Its DNT credit NPC has no combat levels, and the two named egg objects lack reciprocal quest/spawn bindings. First-hand [quest comments](https://www.wowhead.com/forever/mx/quest=98386/althers-mill) describe egg interactions, a build-70205 reward and a possible Everstill Bridge prerequisite. Treat these as qualification leads. Do not price the DNT credit as a creature, add guaranteed spawned spiders or substitute a solo total for a five-player kill profile.

The latest inspected public revision is `98c45ccbe9ca5cbdc48fd25d37173bc47bbcdf34`. Its GitHub comparison changes no previously inspected `wow_classic_beta` data files. New inspected 70532 creature files provide no Baron level. Other `wowf` changes need their own semantic review; a small line diff is not proof of unchanged data.

## Applied parcel/minimum corrections and complete-set holds — V182–V184

`reconcileClientProvidedItems` validates the matching build and later corroboration, exact sole supplied-item record, source metadata, item-export identity and complete friendly-recipient delivery text. For 98824 it changes normalized 270865 to 287959 and removes only the stale aggregate guardian projection. All original records remain in the qualification proof. The catalog's supplied item was already correct. No rewards or physical drop counts change.

`reconcileClientMinimumLevels` updates only 631/632 to 26, 1144 to 22 and 96395 to 10 after both client records agree on title, quest level and minimum. Existing access, prerequisites and reward curves remain unchanged. Quest 472's level conflict is held because correcting its label without correcting its reduction table would be inconsistent.

The early 472 → 631 → 632 sequence is now part of the real prepared route. Its actual reward precedes its next pickup. The fresh funding pass exposed incomplete 98418 membership: client NPC 3754 is missing from the provider/catalog. V184 holds it and 98386's missing egg credit 271912, preserving complete prior/client records. No native index or physical death is inferred from these logical records. A full matching-set comparison still does not qualify a scripted fight, source method or missing record.

## Client-table calculation contract — V185–V186

`deriveClientRewardEstimates` joins explicit ordinary quest IDs to a matching client cache, later corroboration and identical decoded QuestXP tables. It retains stronger or conflicted rewards and rejects identity/minimum/binding disagreement. An explicitly scoped quest-level correction regenerates its entire reward curve; only 472 is corrected here. Old facts and source identities remain in the qualification record.

`client-table-reference` includes the exact difficulty value, client multiplier, table/query hashes and calculation version. The reference multiplies before integer truncation, applies the stated level-reduction rule and tiered rounding, and caps XP at level sixty. It is an estimate with unverified server/buff/low-XP details, not a published or observed payout. Calculated final rows receive no generic dungeon multiplier. The schema rejects missing provenance, mismatched base values, incorrect full/reduced values, incomplete curves and evidence-kind promotion.

641 estimates now cover the explicitly inventoried ordinary catalog, including 255 from the prior primary selection. Published/observed/conflicted facts remain untouched. The initial primary-only artifact is preserved separately. Eighteen turn-in comparisons match; 25 of 26 comparable explicitly scaled published values match, with the five-XP disagreement retained as published evidence. Fresh independent .NET decoding was not run; original hotfix-effective rows and raw metadata/binary hashes were checked.

## Local evidence and next steps

Evidence is under `.cache/leveling-no-grind-20261031/`:

- `client-counters-v180/qualification.json`, preserving the old active-prose defect and its correction
- `verification-primary-xp-v180-final-hold.json` and `verification-primary-xp-v181-final-hold.json`
- `client-questxp-audit-v180.json` and `public-source-check-v180/rounding-source.json`
- `selected-client-levels-audit-v181.json` and `selected-client-objectives-audit-v181.json`
- `althers-mill-method-lead-v181.json`
- `visit-batching-primary-comparison-v181.json` and `scroll-mauren-batching-diagnosis-v181.json`
- `public-source-check-v180/latest-build-downloads.json` and `since-reviewed-revision.json`
- `client-corrections-v182/qualification.json`, `client-objectives-v184/qualification.json` and `unrestricted-kill-membership-audit-v184.json`
- `client-rewards-v185-expanded/qualification.json` and `published-client-reward-comparison-v185.json`
- `verification-primary-xp-v186-final-hold.json` and `next-work-evidence-v186.json`

Qualify the reward, level and item bindings, correct actual source-visit batching without detaching guarded pickups, then finish primary 1–60 and the immutable original edition/roster/settings/native-starter scope. Prior V177–V179 audits and all source hashes remain preserved. No game execution or deployment occurred.
