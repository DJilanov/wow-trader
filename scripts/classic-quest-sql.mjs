import assert from "node:assert/strict";
import { classicSqlRows } from "./classic-loot-sql.mjs";

export function classicQuestRows(sql, questIds) {
  const wanted = new Set(questIds);
  assert.equal(wanted.size, questIds.length, "Duplicate requested quest identity.");
  const rows = new Map();
  let columns = null;
  let active = false;
  for (const line of sql.split(/\r?\n/)) {
    if (line.startsWith("CREATE TABLE `quest_template`")) {
      assert.equal(columns, null, "Duplicate quest schema.");
      columns = [];
      active = true;
      continue;
    }
    if (active) {
      const field = /^\s*`([^`]+)`/.exec(line);
      if (field) columns.push(field[1]);
      else if (line.startsWith(")")) active = false;
    }
    const prefix = "INSERT INTO `quest_template` VALUES ";
    if (!line.startsWith(prefix)) continue;
    assert.ok(columns?.length, "Quest rows precede their schema.");
    const index = new Map(columns.map((field, offset) => [field, offset]));
    assert.equal(index.size, columns.length, "Duplicate historical quest field.");
    for (const field of [
      "entry",
      "Title",
      "QuestLevel",
      "RewMoneyMaxLevel",
      "StartScript",
      "CompleteScript",
      "RewSpell",
      "RewSpellCast",
    ])
      assert.ok(index.has(field), `Missing historical quest field ${field}.`);
    for (const row of classicSqlRows(line.slice(prefix.length))) {
      assert.equal(row.length, columns.length, "Quest SQL field count mismatch.");
      const rawId = row[index.get("entry")];
      assert.match(rawId ?? "", /^\d+$/);
      const questId = Number(rawId);
      if (!wanted.has(questId)) continue;
      assert.ok(!rows.has(questId), "Duplicate historical quest row.");
      rows.set(
        questId,
        Object.fromEntries([...index].map(([field, offset]) => [field, row[offset]])),
      );
    }
  }
  assert.ok(columns?.length, "Historical quest schema is missing.");
  return rows;
}

export function classicQuestTitleMatches(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.normalize("NFKC").toLowerCase() === right.normalize("NFKC").toLowerCase()
  );
}

export function classicQuestHasRewardScript(row) {
  return ["StartScript", "CompleteScript", "RewSpell", "RewSpellCast"].some(
    (field) => row[field] !== "0",
  );
}
