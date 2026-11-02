# Explicit historical zero-XP rewards

The guide distinguishes a sourced zero reward from a missing reward. This reference
resolves four historical values without treating missing custom quests as zero or
changing any published Forever reward. It does not establish current-server payouts.

## Source and selection

The database is the pinned [CMaNGOS ClassicDB snapshot](https://github.com/cmangos/classic-db/tree/603ece109099ce44a5447a1b1cffd65c7272d71c),
`Full_DB/ClassicDB_1_12_1_z2815.sql.gz`, SHA-256
`4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0`.
The [reviewed Quest::XPValue implementation](https://github.com/cmangos/mangos-classic/blob/5731249195520323cb5fb9aa29761d4f033272ce/src/game/Quests/QuestDef.cpp)
returns zero when `RewMoneyMaxLevel` is zero. Its file SHA-256 is
`e4f868e95421c2be5b90bd046178b6f4413dc5203e945cf5735b9bac26104cfb`.
This is a historical reference calculation, not execution of the Forever server.

The preparation reads SQL literals without executing SQL. It accepts only requested
guide-catalog IDs whose titles match and whose database rows explicitly contain
`RewMoneyMaxLevel = 0`. Start/completion scripts and reward spells must also be zero;
other reward mechanisms require separate review. Missing rows, changed titles and
nonzero values remain unresolved. Duplicate identities, incomplete schemas, changed
Git blobs and a different rule-source checksum fail validation.

The November 1 preparation resolves quests **657, 1641, 1645 and 1779**. The last
three are _The Tome of Divinity_ variants. Their imports contain explicit zero values
for player levels 1–60. Current catalog eligibility is retained independently.
Custom quests **91723, 91724, 98013, 98291, 98386, 98418 and 99160** have no row in
this historical source and receive no inferred reward.

Existing available or conflicting reward facts are excluded from the supplement.
The web reader continues to prefer published Forever rewards and rejects known
current-client identity conflicts. Historical facts retain their source kind,
database/rule revisions and checksum, and remain labeled estimates.

## Prepared output and verification

`artifacts/leveling/authorized-zero-xp-references` contains the four-record typed
import, the source license/copyright files and a report with input/output hashes,
accepted IDs and held reasons. The guide-scoped combined import under
`artifacts/leveling/authorized-guide-references/reward-import` preserves all 1,396
earlier records and adds only these four records.

At the zero-supplement stage, the deployed reward reader accepted the combined import
in an isolated process. All 1,617 earlier normalized facts were unchanged; that snapshot
has 1,621 facts. The subsequent [hand-in table enrichment](forever-leveling-historical-hand-in-rewards.md)
preserves those full rewards and adds separate source-matched level tables.
No live environment/import pointer changed. The current overall route funding
result and remaining work are recorded in the [full audit](forever-leveling-no-grind-audit-2026-10-31.md).

## Reproduction

Use the clean database checkout described in the
[historical loot runbook](forever-leveling-classic-loot-reference.md). Save the pinned
`QuestDef.cpp` locally and retain the private frozen reward snapshot and requested-ID
queue. The command reads local files; it does not crawl or activate production.

```sh
pnpm leveling:xp:zero:prepare \
  --provider-root=.cache/leveling-no-grind-20261031/classic-db-reference \
  --revision=603ece109099ce44a5447a1b1cffd65c7272d71c \
  --catalog=artifacts/leveling/authorized-guide-references \
  --facts=.cache/leveling-no-grind-20261031/guide-required-reward-facts-supplemented.json \
  --queue=.cache/leveling-no-grind-20261031/missing-funding-rewards-fallback.json \
  --rule-source=.cache/leveling-no-grind-20261031/QuestDef-5731249195520323cb5fb9aa29761d4f033272ce.cpp \
  --destination=artifacts/leveling/authorized-zero-xp-references
```

For identical output bytes, pass `--imported-at` with the timestamp stored in the
prepared import. Changing a source or timestamp creates a new content-addressed file.
The preparation never overwrites a different file with the same content-addressed
name. The SQL parser and zero-versus-unknown behavior have regression tests in
`scripts/classic-zero-xp.test.mjs`; the web adapter also tests a zero historical
reward and identity-conflict handling.
