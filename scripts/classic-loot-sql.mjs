import assert from "node:assert/strict";

// The dump is parsed as literals. No SQL is executed and expressions are rejected.
export function* classicSqlRows(text) {
  let at = 0;
  const whitespace = () => {
    while (at < text.length && /\s/.test(text[at])) at++;
  };
  while (at < text.length) {
    whitespace();
    if (text[at] === ";") {
      at++;
      whitespace();
      assert.equal(at, text.length, "Unexpected SQL after literal rows.");
      return;
    }
    assert.equal(text[at++], "(", "Expected SQL row.");
    const fields = [];
    while (true) {
      whitespace();
      if (text[at] === "'") {
        at++;
        let value = "";
        let closed = false;
        while (at < text.length) {
          const character = text[at++];
          if (character === "\\") {
            assert.ok(at < text.length, "Truncated SQL escape.");
            const escaped = text[at++];
            value += { n: "\n", r: "\r", t: "\t", 0: "\0", Z: "\x1a" }[escaped] ?? escaped;
          } else if (character === "'") {
            if (text[at] === "'") {
              value += "'";
              at++;
            } else {
              closed = true;
              break;
            }
          } else value += character;
        }
        assert.ok(closed, "Unterminated SQL string.");
        fields.push(value);
      } else {
        const start = at;
        while (at < text.length && ![",", ")"].includes(text[at])) at++;
        const value = text.slice(start, at).trim();
        assert.ok(
          /^(?:NULL|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(value),
          "Unsupported SQL literal.",
        );
        fields.push(value === "NULL" ? null : value);
      }
      whitespace();
      assert.ok(at < text.length, "Truncated SQL row.");
      const delimiter = text[at++];
      if (delimiter === ")") break;
      assert.equal(delimiter, ",", "Expected SQL field separator.");
    }
    yield fields;
    whitespace();
    if (text[at] === ",") {
      at++;
      whitespace();
      assert.equal(text[at], "(", "Truncated SQL row list.");
    } else assert.ok(at === text.length || text[at] === ";", "Expected SQL row separator.");
  }
}

const tableNames = new Set([
  "creature_template",
  "item_template",
  "creature_loot_template",
  "reference_loot_template",
]);
const integer = (value) => {
  assert.ok(typeof value === "string" && /^-?\d+$/.test(value), "Expected SQL integer.");
  const number = Number(value);
  assert.ok(Number.isSafeInteger(number), "SQL integer is outside the safe range.");
  return number;
};

export function extractClassicLootTables(sql, npcIds, itemIds) {
  const columns = new Map();
  const npcs = new Map();
  const items = new Map();
  const loot = new Map();
  const references = new Map();
  const counts = {};
  let current = null;
  for (const line of sql.split(/\r?\n/)) {
    const create = /^CREATE TABLE `([^`]+)`/.exec(line);
    if (create) {
      current = tableNames.has(create[1]) ? create[1] : null;
      if (current) {
        assert.ok(!columns.has(current), "Duplicate SQL table schema.");
        columns.set(current, []);
      }
    } else if (current) {
      const field = /^\s*`([^`]+)`/.exec(line);
      if (field) columns.get(current).push(field[1]);
      else if (line.startsWith(")")) current = null;
    }
    const insert = /^INSERT INTO `([^`]+)` VALUES /.exec(line);
    if (!insert || !tableNames.has(insert[1])) continue;
    const table = insert[1];
    const fields = columns.get(table);
    assert.ok(fields?.length, "SQL rows precede their schema.");
    const index = new Map(fields.map((field, offset) => [field.toLowerCase(), offset]));
    for (const row of classicSqlRows(line.slice(insert[0].length))) {
      assert.equal(row.length, fields.length, `${table}: SQL field count mismatch.`);
      counts[table] = (counts[table] ?? 0) + 1;
      const value = (field) => {
        assert.ok(index.has(field), `${table}: missing field ${field}.`);
        return row[index.get(field)];
      };
      const entry = integer(value("entry"));
      if (table === "creature_template" && npcIds.has(entry)) {
        assert.ok(!npcs.has(entry), "Duplicate SQL creature identity.");
        npcs.set(entry, { npcId: entry, name: value("name"), lootEntry: integer(value("lootid")) });
      } else if (table === "item_template" && itemIds.has(entry)) {
        assert.ok(!items.has(entry), "Duplicate SQL item identity.");
        items.set(entry, { itemId: entry, name: value("name"), flags: integer(value("flags")) });
      } else if (table === "creature_loot_template" || table === "reference_loot_template") {
        const target = table === "creature_loot_template" ? loot : references;
        const group = target.get(entry) ?? new Map();
        const itemId = integer(value("item"));
        assert.ok(!group.has(itemId), "Duplicate SQL loot row.");
        const chance = Number(value("chanceorquestchance"));
        assert.ok(Number.isFinite(chance), "Invalid SQL drop chance.");
        group.set(itemId, {
          itemId,
          chance,
          group: integer(value("groupid")),
          minimum: integer(value("mincountorref")),
          maximum: integer(value("maxcount")),
          condition: integer(value("condition_id")),
        });
        target.set(entry, group);
      }
    }
  }
  assert.ok(
    [...tableNames].every((table) => columns.has(table)),
    "Incomplete SQL source tables.",
  );
  return { npcs, items, loot, references, counts };
}

const sameName = (left, right) =>
  typeof left === "string" &&
  typeof right === "string" &&
  left.normalize("NFKC").toLowerCase() === right.normalize("NFKC").toLowerCase();

export function selectClassicLootReferences(tables, combat, options = {}) {
  const names = new Map();
  for (const quest of combat.quests)
    for (const item of quest.itemObjectives ?? []) {
      if (!item.itemName) continue;
      const values = names.get(item.itemId) ?? new Set();
      values.add(item.itemName.normalize("NFKC").toLowerCase());
      names.set(item.itemId, values);
    }
  const items = [...tables.items.values()].filter(
    (item) =>
      typeof item.name === "string" &&
      names.get(item.itemId)?.size === 1 &&
      names.get(item.itemId).has(item.name.normalize("NFKC").toLowerCase()),
  );
  const selectedItems = new Map(items.map((item) => [item.itemId, item]));
  const selectedPairs = new Set(
    (combat.lootDrops ?? []).map((drop) => `${drop.npcId}:${drop.itemId}`),
  );
  if (options.includeUncapturedQuestDrops)
    for (const quest of combat.quests)
      for (const item of quest.itemObjectives ?? []) {
        if (item.provided || item.groundPickup) continue;
        for (const npcId of item.npcIds ?? []) selectedPairs.add(`${npcId}:${item.itemId}`);
      }
  const referenceCache = new Map();
  let referenceSteps = 0;
  const referencedItems = (entry, visiting = new Set()) => {
    if (++referenceSteps > 1_000_000) return null;
    if (referenceCache.has(entry)) return referenceCache.get(entry);
    if (visiting.has(entry) || visiting.size > 100) return null;
    const rows = tables.references.get(entry);
    if (!rows) return null;
    const result = new Set();
    for (const row of rows.values()) {
      if (row.minimum < 0) {
        const child = referencedItems(-row.minimum, new Set([...visiting, entry]));
        if (!child) return null;
        for (const item of child) result.add(item);
      } else result.add(row.itemId);
    }
    referenceCache.set(entry, result);
    return result;
  };
  const drops = [];
  let ambiguousReferences = 0;
  for (const npc of combat.npcs) {
    const old = tables.npcs.get(npc.id);
    if (!old || !sameName(old.name, npc.name)) continue;
    const rows = tables.loot.get(old.lootEntry);
    if (!rows) continue;
    const additionalItems = new Set();
    let unresolved = false;
    for (const row of rows.values()) {
      if (row.minimum >= 0) continue;
      const referenced = referencedItems(-row.minimum);
      if (!referenced) {
        unresolved = true;
        break;
      }
      for (const item of referenced) additionalItems.add(item);
    }
    for (const row of rows.values()) {
      const item = selectedItems.get(row.itemId);
      if (!item || !selectedPairs.has(`${npc.id}:${item.itemId}`)) continue;
      if (unresolved || additionalItems.has(item.itemId)) {
        ambiguousReferences++;
        continue;
      }
      if (
        row.group !== 0 ||
        row.condition !== 0 ||
        row.minimum !== 1 ||
        row.maximum !== 1 ||
        !(Math.abs(row.chance) > 0 && Math.abs(row.chance) <= 100)
      )
        continue;
      drops.push({
        itemId: item.itemId,
        itemName: item.name,
        npcId: npc.id,
        npcName: old.name,
        lootEntry: old.lootEntry,
        minimumQuantity: 1,
        maximumQuantity: 1,
        probability: Math.abs(row.chance) / 100,
        questOnly: row.chance < 0,
      });
    }
  }
  return { items, drops, ambiguousReferences };
}
