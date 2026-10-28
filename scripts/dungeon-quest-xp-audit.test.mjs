import assert from "node:assert/strict";
import { test } from "node:test";
import { auditDungeonQuestRewards } from "./dungeon-quest-xp-audit.mjs";

test("audits every catalog visit and hand-in level, keeping missing evidence explicit", () => {
  const audit = auditDungeonQuestRewards([
    {
      questId: 1050,
      fullXp: 8900,
      referenceBaseXp: 3550,
      pageMultiplier: 2.5,
      questLevel: 38,
      minimumLevel: 28,
      xpByLevel: [{ level: 45, xp: 5350 }],
      sourceUrl: "https://www.wowhead.com/forever/quest=1050",
      capturedAt: "2026-10-19T00:00:00.000Z",
      status: "available",
      evidenceKind: "published-forever",
    },
  ]);
  assert.equal(audit.summary.dungeonVisits, 32);
  assert.ok(audit.summary.distinctQuestIds > 200);
  assert.equal(audit.summary.availableRecords, 1);
  assert.ok(audit.summary.missingOrHeldQuestIds.includes(3446));
  const mythology = audit.quests.find((quest) => quest.questId === 1050);
  assert.equal(mythology.rewards.length, 60);
  assert.equal(mythology.rewards.find((row) => row.level === 38).xp, 8900);
  assert.equal(mythology.rewards.find((row) => row.level === 45).xp, 5350);
  assert.equal(mythology.rewards.find((row) => row.level === 60).xp, 0);
  assert.deepEqual(audit.issues, []);
});

test("checks all three four-quest estimates for each faction at the dungeon's maximum level", () => {
  const audit = auditDungeonQuestRewards([]);
  assert.equal(audit.bundles.length, 6);
  for (const faction of ["alliance", "horde"]) {
    const alcaz = audit.bundles.find(
      (bundle) => bundle.dungeonId === "alcaz" && bundle.faction === faction,
    );
    assert.equal(alcaz.planningQuestLevel, 53);
    assert.deepEqual(alcaz.perSlotXp, [18750, 18750, 18750, 18750]);
    assert.equal(alcaz.estimatedQuestXp, 75000);
    assert.equal(alcaz.questIdsKnown, false);
  }
});

test("reports contradictory historical sources separately from arithmetic checks", () => {
  const audit = auditDungeonQuestRewards([
    {
      questId: 5125,
      fullXp: 8300,
      questLevel: 60,
      minimumLevel: 55,
      xpByLevel: [],
      status: "available",
      evidenceKind: "historical-reference",
      sourceUrl: "addon-database: QuestieDB/support/Forever/QuestXP/xpDB-classic.lua",
      capturedAt: "2026-10-17T09:09:38.634Z",
    },
  ]);
  assert.equal(audit.summary.historicalReferenceDisagreements, 1);
  assert.equal(audit.historicalReferenceDisagreements[0].questId, 5125);
  assert.equal(audit.historicalReferenceDisagreements[0].importedXp, 8300);
  assert.equal(audit.historicalReferenceDisagreements[0].otherReferenceXp, 9950);
  assert.deepEqual(audit.issues, []);
});

test("detects a page reward that disagrees with its own raw base and coefficient", () => {
  const audit = auditDungeonQuestRewards([
    {
      questId: 1050,
      fullXp: 9000,
      referenceBaseXp: 3550,
      pageMultiplier: 2.5,
      questLevel: 38,
      minimumLevel: 28,
      xpByLevel: [],
      sourceUrl: "https://www.wowhead.com/forever/quest=1050",
      capturedAt: "2026-10-19T00:00:00.000Z",
      status: "available",
      evidenceKind: "published-forever",
    },
  ]);
  assert.equal(audit.summary.checkedCapturedFullRewards, 1);
  assert.deepEqual(audit.issues, [
    { questId: 1050, kind: "captured-full-xp", expected: 8900, actual: 9000 },
  ]);
});
