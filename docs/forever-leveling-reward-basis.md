# Explicit reward basis for historical dungeon XP

The guide's 2.375× dungeon-quest policy applies to an unscaled reference reward. An observed or already-scaled Forever reward retains its amount. Neither policy applies to creature kill XP.

## Corrected failure

The previous resolver could recognize a historical base only when a second journal/premade row repeated the same number. Dungeon references added without that duplicate XP row, including several Dire Maul and Scholomance quests, therefore retained their historical raw XP. A historical level-specific table did not resolve the missing scale information.

For example, an explicitly unscaled 6,600-XP reference for Barov Family Fortune (5343) now produces a rounded **15,700-XP planning estimate**, subject to the actual pickup minimum and hand-in level. That is an estimate under the existing policy, not a measured Forever payout.

## Import contract

Both normalized import records and leveling reward facts accept the optional field:

```ts
rewardBasis?: "unscaled-reference" | "final-reward";
```

An available `unscaled-reference` record must include its full reward. Known ClassicDB and Questie base-XP producers retain this marker through the import and website adapter. Generic imports omit it unless their caller explicitly supplies source semantics; old files continue to parse without a marker.

The resolver uses an explicitly unscaled historical full reward even when a duplicate journal XP row is absent. It still requires a known dungeon association. Outdoor rewards stay unchanged. A `final-reward` marker prevents the planning multiplier, including when its number happens to equal a journal base. Observed Forever evidence always keeps priority. Conflicting records, pickup requirements, overlevel rules and the level-60 cap retain their checks. Legacy imports with unknown scale retain their previous handling; a filename or convenient numeric ratio does not resolve their provenance.

## Prepared evidence

The original 1,400-record import and 1,621-fact snapshot remain unchanged. The replacement is under `artifacts/leveling/authorized-unscaled-reward-references`; its `review.json` identifies the exact immutable import and corresponding reward snapshot.

The preparation reproduces **870** historical records from the pinned ClassicDB source and reviewed `Quest::XPValue` rule. Removing their new basis marker reproduces every prior record, including amounts, level tables, minimums and source provenance. The other **530** import records remain unchanged. Published/observed reward facts are preserved.

The exhaustive resolution comparison checks **97,260 quest/hand-in-level combinations**: **265** amounts change across **31 dungeon quests**. All other amounts, including outdoor and level-60 rewards, are unchanged. The comparison report is `.cache/leveling-no-grind-20261031/reward-basis-resolution-review.json`.

The eight configured first-clear wings have an optimistic known-quest ceiling of **819,350 XP**, up from 669,300 under the previous handling. Starting at level 55 with an empty bar requires **975,800 XP** to reach 60. This ceiling deliberately includes conditional tasks without proving prerequisites, route order, class eligibility, earlier completions or one-clear availability; it is not an executable finish budget. Two class quests require level 60 and add no pre-cap leveling reward. Dungeon path combat, other valid lead-ins and the actual incoming bar still need their own evidence. The local campaign now compiles 21 prepared post-BRD quest lifecycles; 22 conditional or unprepared quests remain deferred. Its isolated level-56 start credits 328,300 XP, not this optimistic ceiling. See the [finish-task contract](forever-leveling-dungeon-finish-tasks.md); the complete no-grind route remains unfunded.

## Reported combat reference

The owner supplied a **24–30 XP per player** range for a level-20 elite with five level-20 players inside a dungeon, compared with 145 solo outdoor XP and approximately 101 Classic dungeon XP including the group bonus. The creature ID, dungeon, build, rested state and sample count were not provided. The report is retained in `.cache/leveling-no-grind-20261031/reported-level20-dungeon-range.json`; it is not inserted into verified kill observations.

Do not divide that per-player range by five again, add another group bonus or patch increase, infer a full-clear population, or apply a flat 24–30 XP to every mob level. Blizzard's [October 8 update](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-26/2360696/5) establishes a relative dungeon-XP increase and a party-level correction, not an absolute all-dungeon payout table.

## Release status

This replacement requires the matching reader/schema/resolver code. Old deployed readers do not understand the new field. No production import pointer, crawler, installation or addon package was changed. See the [current no-grinding audit](forever-leveling-no-grind-audit-2026-10-31.md) for the numerical revision and remaining route gaps.
