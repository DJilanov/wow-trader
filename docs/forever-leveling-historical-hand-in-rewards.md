# Historical rewards at the actual hand-in level

The guide needs the reward at the level reached before each hand-in, rather than the
quest's full reward at its intended level. Missing reduced rewards previously stopped
several later chapter forecasts even when their full reward was already known.
This preparation adds explicit historical level tables. It does not establish Forever's
current reward rules or override published or observed Forever rewards.

## Source and matching

The source is the same pinned [ClassicDB snapshot](https://github.com/cmangos/classic-db/tree/603ece109099ce44a5447a1b1cffd65c7272d71c)
and [Quest::XPValue implementation](https://github.com/cmangos/mangos-classic/blob/5731249195520323cb5fb9aa29761d4f033272ce/src/game/Quests/QuestDef.cpp)
used by the [explicit zero-reward preparation](forever-leveling-historical-zero-rewards.md).
The command verifies the clean checkout, database Git blob and rule-source checksum,
then reads SQL literals without executing SQL.

Only an existing available historical full reward is eligible. The current catalog's
quest level must match that reward's quest level. The historical row must also match
the title, quest level and exact full reward. Existing level-specific values must agree.
Start/completion scripts and reward spells require separate review. No title guessing,
near-match reward rounding or current-server coefficient is used to pass these checks.

The JavaScript implementation preserves the pinned C++ method's float32 operations
and upward rounding. It was compared against that actual method, extracted from the
checksummed source and compiled in an isolated harness: **94,530 cases matched**.
These include 43,200 cases across all quest/player levels 1–60 and twelve money values,
plus all 51,330 prepared level rows for the 870 matched quests. This verifies implementation
parity with the reference, not parity with the Forever server. For example, its float
rounding gives 1,651 for a 2,750-XP level-35 quest at player level 42.

The typed import supplies tables for player levels 1–59. The guide handles the level-60
cap separately. Existing pickup eligibility remains unchanged. Dungeon-table rewards
retain their separate planning coefficient; this preparation never applies that
coefficient to an outdoor reward.

## Current prepared output

Of 1,315 eligible existing historical facts, **870** pass all source comparisons.
The other **445** remain unchanged: 290 have a different full reward, 152 have a script
or spell reward requiring review, and three have a different title. A matching full
reward is required even when two values differ by only one XP.

`artifacts/leveling/authorized-hand-in-xp-references` contains the typed supplemental
tables, original source license/copyright files and the report with accepted IDs, held
reasons and all input/output hashes. The combined guide import remains at 1,400 records:
530 records are unchanged; 870 gain tables and source provenance. Their full rewards
and eligibility are unchanged. The companion review retains every replaced import
record and the original import's checksum.

The deployed reward reader accepted the combined import in an isolated process.
The normalized snapshot remains at 1,621 facts: 751 are unchanged and 870 gain tables.
No live environment or import pointer changed. Current whole-route status and exact
input hashes are in the [full no-grinding audit](forever-leveling-no-grind-audit-2026-10-31.md).

## Reproduction

Use the clean source checkout from the
[historical loot runbook](forever-leveling-classic-loot-reference.md), the pinned
`QuestDef.cpp`, the frozen facts and an explicit guide-scoped queue. Only existing
historical facts with matching catalog levels belong in this queue; published or
observed rewards cause validation to fail rather than being replaced.

```sh
pnpm leveling:xp:hand-in:prepare \
  --provider-root=.cache/leveling-no-grind-20261031/classic-db-reference \
  --revision=603ece109099ce44a5447a1b1cffd65c7272d71c \
  --catalog=artifacts/leveling/authorized-guide-references \
  --facts=.cache/leveling-no-grind-20261031/guide-required-reward-facts-with-zero.json \
  --queue=.cache/leveling-no-grind-20261031/hand-in-level-all-reference-queue.json \
  --rule-source=.cache/leveling-no-grind-20261031/QuestDef-5731249195520323cb5fb9aa29761d4f033272ce.cpp \
  --destination=artifacts/leveling/authorized-hand-in-xp-references \
  --imported-at=2026-10-31T23:24:15.915Z
```

This reads local inputs and creates a supplemental import; it does not merge over an
existing import, crawl, run SQL or deploy. Combining it with the existing guide import
requires checking matching IDs, full rewards, quest levels and any existing table rows.
The prior source records must remain available in the companion review. Repeating the
command with identical inputs and timestamp reproduces the supplemental content hash.

Regression tests cover all overlevel branches, exact full-reward matching, identity and
level conflicts, partial-table conflicts, malformed/source-script holds and the guide's
use of a reduced historical reward without inferring an unavailable published reward.
