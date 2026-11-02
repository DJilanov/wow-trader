import assert from "node:assert/strict";
import test from "node:test";
import { classicQuestXpValue, extractClassicHandInXpRows } from "./classic-hand-in-xp.mjs";

const columns = [
  "entry",
  "Title",
  "QuestLevel",
  "RewMoneyMaxLevel",
  "StartScript",
  "CompleteScript",
  "RewSpell",
  "RewSpellCast",
];
const fixture = (rows = "(244,'Encroaching Gnolls',16,174,0,0,0,0)") =>
  `CREATE TABLE \`quest_template\` (\n${columns.map((field) => `  \`${field}\` text,`).join("\n")}\n) ENGINE=MyISAM;\nINSERT INTO \`quest_template\` VALUES ${rows};\n`;
const wanted = {
  questId: 244,
  title: "Encroaching Gnolls",
  questLevel: 16,
  fullXp: 290,
  xpByLevel: [],
};

test("mirrors every overlevel branch without applying a dungeon coefficient", () => {
  assert.deepEqual(
    [21, 22, 23, 24, 25, 26, 59].map((level) => classicQuestXpValue(174, 16, level)),
    [290, 232, 174, 116, 58, 29, 29],
  );
  assert.equal(classicQuestXpValue(0, 12, 59), 0);
  // ceilf operates on float expressions, not an already-rounded integer full reward.
  assert.equal(classicQuestXpValue(1, 1, 7), 2);
  assert.equal(classicQuestXpValue(1, 1, 10), 1);
  assert.equal(classicQuestXpValue(1650, 35, 42), 1651);
  assert.equal(classicQuestXpValue(1620, 43, 50), 1621);
});
test("produces level-specific references only when the existing full reward and identity match", () => {
  const result = extractClassicHandInXpRows(fixture(), [wanted]);
  assert.equal(result.records[0].xp, 290);
  assert.equal(result.records[0].xpByLevel.length, 59);
  assert.deepEqual(
    result.records[0].xpByLevel.find((row) => row.level === 25),
    { level: 25, xp: 58 },
  );
  assert.deepEqual(result.held, []);
  for (const override of [
    { title: "Different quest" },
    { questLevel: 15 },
    { fullXp: 291 },
    { xpByLevel: [{ level: 25, xp: 100 }] },
  ]) {
    const held = extractClassicHandInXpRows(fixture(), [{ ...wanted, ...override }]);
    assert.equal(held.records.length, 0);
    assert.equal(held.held.length, 1);
  }
});
test("preserves a compatible partial table and holds missing, malformed or scripted source rewards", () => {
  assert.equal(
    extractClassicHandInXpRows(fixture(), [{ ...wanted, xpByLevel: [{ level: 25, xp: 58 }] }])
      .records.length,
    1,
  );
  for (const rows of [
    "(245,'Encroaching Gnolls',16,174,0,0,0,0)",
    "(244,'Encroaching Gnolls',16,NULL,0,0,0,0)",
    "(244,'Encroaching Gnolls',16,174,1,0,0,0)",
    "(244,'Encroaching Gnolls',16,174,0,0,1,0)",
  ])
    assert.equal(extractClassicHandInXpRows(fixture(rows), [wanted]).records.length, 0);
});
test("rejects unsupported numeric rule inputs and duplicate quest identities", () => {
  for (const args of [
    [-1, 16, 25],
    [174, 0, 25],
    [174, 16, 61],
    [174, 16, 1.5],
    [0x100000000, 16, 25],
  ])
    assert.throws(() => classicQuestXpValue(...args));
  assert.throws(
    () => extractClassicHandInXpRows(fixture(), [wanted, wanted]),
    /Duplicate requested/,
  );
});
