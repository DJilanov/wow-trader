import assert from "node:assert/strict";
import test from "node:test";
import { extractClassicZeroXpRows } from "./classic-zero-xp.mjs";
import { buildQuestXpImport } from "../packages/reference-data/dist/index.js";

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
const fixture = (rows = "(1641,'The Tome of Divinity',12,0,0,0,0,0)", fields = columns) =>
  `CREATE TABLE \`quest_template\` (\n${fields.map((field) => `  \`${field}\` text,`).join("\n")}\n) ENGINE=MyISAM;\nINSERT INTO \`quest_template\` VALUES ${rows};\n`;
const wanted = [{ questId: 1641, title: "The Tome of Divinity" }];

test("imports an explicit zero at all hand-in levels instead of treating it as missing XP", async () => {
  const result = extractClassicZeroXpRows(fixture(), wanted);
  assert.equal(result.records[0].xp, 0);
  assert.equal(result.records[0].xpByLevel.length, 60);
  assert.deepEqual(result.held, []);
  const imported = await buildQuestXpImport({
    input: JSON.stringify(result.records),
    format: "json",
    game: "forever",
    sourceKind: "server-database",
    sourceRef: "Synthetic historical zero-XP reference",
    revision: "test",
    importedAt: "2026-11-01T00:00:00.000Z",
    knownIds: new Set([1641]),
  });
  assert.equal(imported.set.counts.available, 1);
  assert.equal(imported.set.records[0].fullXp, 0);
  assert.equal(imported.set.records[0].status, "available");
});
test("never infers zero from absent rows, nonzero rewards or a different title", () => {
  for (const rows of [
    "(1642,'The Tome of Divinity',12,0,0,0,0,0)",
    "(1641,'The Tome of Divinity',12,100,0,0,0,0)",
    "(1641,'Changed Quest',12,0,0,0,0,0)",
  ]) {
    const result = extractClassicZeroXpRows(fixture(rows), wanted);
    assert.equal(result.records.length, 0);
    assert.equal(result.held.length, 1);
  }
});
test("holds script/spell rewards and unclassified levels", () => {
  for (const rows of [
    "(1641,'The Tome of Divinity',12,0,1,0,0,0)",
    "(1641,'The Tome of Divinity',12,0,0,1,0,0)",
    "(1641,'The Tome of Divinity',12,0,0,0,1,0)",
    "(1641,'The Tome of Divinity',12,0,0,0,0,1)",
    "(1641,'The Tome of Divinity',-1,0,0,0,0,0)",
  ])
    assert.equal(extractClassicZeroXpRows(fixture(rows), wanted).records.length, 0);
});
test("rejects duplicate identities, incomplete schemas and malformed literal rows", () => {
  assert.throws(
    () => extractClassicZeroXpRows(fixture(), [...wanted, ...wanted]),
    /Duplicate requested/,
  );
  assert.throws(
    () =>
      extractClassicZeroXpRows(
        fixture(
          "(1641,'The Tome of Divinity',12,0,0,0,0,0),(1641,'The Tome of Divinity',12,0,0,0,0,0)",
        ),
        wanted,
      ),
    /Duplicate historical/,
  );
  assert.throws(
    () =>
      extractClassicZeroXpRows(
        fixture("(1641,'The Tome of Divinity',12,0,0,0,0)", columns.slice(0, -1)),
        wanted,
      ),
    /Missing historical quest field/,
  );
  assert.throws(() => extractClassicZeroXpRows("", wanted), /schema is missing/);
});
