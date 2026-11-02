import assert from "node:assert/strict";
import test from "node:test";
import {
  classicSqlRows,
  extractClassicLootTables,
  selectClassicLootReferences,
} from "./classic-loot-sql.mjs";

const lootColumns = [
  "entry",
  "item",
  "ChanceOrQuestChance",
  "groupid",
  "mincountOrRef",
  "maxcount",
  "condition_id",
  "comments",
];
const table = (name, columns, rows) =>
  `CREATE TABLE \`${name}\` (\n${columns.map((c) => `  \`${c}\` text,`).join("\n")}\n) ENGINE=MyISAM;\n${rows ? `INSERT INTO \`${name}\` VALUES ${rows};\n` : ""}`;
const fixture = ({
  loot = "(400,3,-80,0,1,1,0,'Tooth')",
  references = "",
  name = "Forest Wolf",
  item = "Wolf Tooth",
} = {}) =>
  table("creature_template", ["Entry", "Name", "LootId"], `(1,'${name}',400)`) +
  table("item_template", ["entry", "name", "Flags"], `(3,'${item}',0)`) +
  table("creature_loot_template", lootColumns, loot) +
  table("reference_loot_template", lootColumns, references);
const combat = {
  npcs: [{ id: 1, name: "Forest Wolf" }],
  quests: [{ itemObjectives: [{ itemId: 3, itemName: "Wolf Tooth" }] }],
  lootDrops: [{ itemId: 3, npcId: 1 }],
};
const parse = (sql) => extractClassicLootTables(sql, new Set([1]), new Set([3]));

test("missing pairs require opt-in and corrected, non-provided creature/item relations", () => {
  const source = {
    ...combat,
    lootDrops: [],
    quests: [{ itemObjectives: [{ itemId: 3, itemName: "Wolf Tooth", npcIds: [1] }] }],
  };
  const tables = parse(fixture());
  assert.equal(selectClassicLootReferences(tables, source).drops.length, 0);
  assert.equal(
    selectClassicLootReferences(tables, source, { includeUncapturedQuestDrops: true }).drops.length,
    1,
  );
  for (const change of [{ npcIds: [] }, { provided: true }, { groundPickup: {} }]) {
    const variant = {
      ...source,
      quests: [{ itemObjectives: [{ ...source.quests[0].itemObjectives[0], ...change }] }],
    };
    assert.equal(
      selectClassicLootReferences(tables, variant, { includeUncapturedQuestDrops: true }).drops
        .length,
      0,
    );
  }
});

test("reference-only candidates retain grouped, conditional and duplicate-template ambiguity holds", () => {
  const source = {
    ...combat,
    lootDrops: [],
    quests: [{ itemObjectives: [{ itemId: 3, itemName: "Wolf Tooth", npcIds: [1] }] }],
  };
  for (const loot of [
    "(400,3,-80,1,1,1,0,'group')",
    "(400,3,-80,0,1,1,9,'condition')",
    "(400,3,-80,0,1,2,0,'stack')",
  ])
    assert.equal(
      selectClassicLootReferences(parse(fixture({ loot })), source, {
        includeUncapturedQuestDrops: true,
      }).drops.length,
      0,
    );
});

test("parses SQL literals, quoted separators, doubled quotes and MySQL escapes without execution", () => {
  assert.deepEqual(
    [
      ...classicSqlRows(
        "(1,'Wolf, (old); \\'name\\'',NULL,-2.5),(2,'Doubled ''quote''',3e-2,4);\n",
      ),
    ],
    [
      ["1", "Wolf, (old); 'name'", null, "-2.5"],
      ["2", "Doubled 'quote'", "3e-2", "4"],
    ],
  );
});
test("rejects expressions, statements and truncated literal rows", () => {
  for (const text of ["(1+2)", "(1); DROP TABLE x;", "(1),", "('open)", "(1,NULL"])
    assert.throws(() => [...classicSqlRows(text)]);
});
test("joins a creature's actual loot template and retains only scoped exact-name pairs", () => {
  const result = selectClassicLootReferences(parse(fixture()), combat);
  assert.deepEqual(result.items, [{ itemId: 3, name: "Wolf Tooth", flags: 0 }]);
  assert.deepEqual(result.drops, [
    {
      itemId: 3,
      itemName: "Wolf Tooth",
      npcId: 1,
      npcName: "Forest Wolf",
      lootEntry: 400,
      minimumQuantity: 1,
      maximumQuantity: 1,
      probability: 0.8,
      questOnly: true,
    },
  ]);
  assert.equal(
    selectClassicLootReferences(parse(fixture({ name: "Renamed Wolf" })), combat).drops.length,
    0,
  );
  assert.equal(
    selectClassicLootReferences(parse(fixture({ item: "Other Tooth" })), combat).items.length,
    0,
  );
});
test("distinguishes an ordinary drop from the quest-only sign without relabeling a captured rate", () => {
  const result = selectClassicLootReferences(
    parse(fixture({ loot: "(400,3,25,0,1,1,0,'Tooth')" })),
    combat,
  );
  assert.equal(result.drops[0].probability, 0.25);
  assert.equal(result.drops[0].questOnly, false);
});
test("rejects grouped, conditional, variable-stack and zero-chance entries", () => {
  for (const loot of [
    "(400,3,-80,1,1,1,0,'x')",
    "(400,3,-80,0,1,1,9,'x')",
    "(400,3,-80,0,1,2,0,'x')",
    "(400,3,0,0,1,1,0,'x')",
  ])
    assert.equal(selectClassicLootReferences(parse(fixture({ loot })), combat).drops.length, 0);
});
test("checks reference-loot expansion before accepting a fixed-one direct row", () => {
  const loot = "(400,3,-80,0,1,1,0,'Tooth'),(400,0,100,0,-10,1,0,'Reference')";
  const duplicate = selectClassicLootReferences(
    parse(fixture({ loot, references: "(10,3,1,0,1,1,0,'Extra tooth')" })),
    combat,
  );
  assert.equal(duplicate.drops.length, 0);
  assert.equal(duplicate.ambiguousReferences, 1);
  const unrelated = selectClassicLootReferences(
    parse(fixture({ loot, references: "(10,4,1,0,1,1,0,'Other item')" })),
    combat,
  );
  assert.equal(unrelated.drops.length, 1);
  for (const references of ["", "(10,0,100,0,-11,1,0,'Ref'),(11,0,100,0,-10,1,0,'Cycle')"])
    assert.equal(
      selectClassicLootReferences(parse(fixture({ loot, references })), combat).drops.length,
      0,
    );
});
test("rejects incomplete schemas, duplicate identities and mismatched row widths", () => {
  assert.throws(
    () => parse(table("item_template", ["entry", "name", "Flags"], "(3,'Tooth',0)")),
    /Incomplete SQL/,
  );
  assert.throws(
    () => parse(fixture() + "INSERT INTO `item_template` VALUES (3,'Duplicate',0);\n"),
    /Duplicate SQL item/,
  );
  assert.throws(
    () => parse(fixture().replace("(1,'Forest Wolf',400)", "(1,'Forest Wolf')")),
    /field count mismatch/,
  );
});
