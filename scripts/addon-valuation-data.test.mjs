import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareClientValuation } from "./addon-valuation-data.mjs";

function evidence() {
  return {
    schema: "item-valuation-client.v1",
    build: { product: "wowf", clientVersion: "1.60.1.70755", buildNumber: 70755 },
    definitionsRevision: "a".repeat(40),
    hotfixSha256: "b".repeat(64),
    tables: {
      Item: {
        encryptedRecords: 0,
        rows: [
          { id: 1, ClassID: 4, SubclassID: 1 },
          { id: 2, ClassID: 4, SubclassID: 1 },
        ],
      },
      ItemSparse: {
        encryptedRecords: 0,
        rows: [
          { id: 1, OverallQualityID: 2, ItemLevel: 70, Flags: [0, 0], ExpansionID: 0, Bonding: 2 },
          {
            id: 2,
            OverallQualityID: 2,
            ItemLevel: 70,
            Flags: [32768, 0],
            ExpansionID: 0,
            Bonding: 2,
          },
        ],
      },
      ItemDisenchantLoot: {
        encryptedRecords: 0,
        rows: [
          {
            id: 1,
            Class: 4,
            Quality: 2,
            MinLevel: 61,
            MaxLevel: 99,
            Subclass: -1,
            ExpansionID: -2,
            SkillRequired: 0,
          },
        ],
      },
      SpellCooldowns: {
        encryptedRecords: 0,
        rows: [{ id: 1, SpellID: 18560, RecoveryTime: 342000000, CategoryRecoveryTime: 0 }],
      },
    },
  };
}

test("exports exact client scope, no-disenchant flags, Classic high-level brackets and long cooldowns", () => {
  const value = prepareClientValuation(JSON.stringify(evidence()));
  assert.equal(value.summary.items, 2);
  assert.equal(value.summary.eligible, 1);
  assert.match(value.lua, /\[1\] = \{4,2,70,true,0,65,false\}/u);
  assert.match(value.lua, /\[2\] = \{4,2,70,false,0,65,false\}/u);
  assert.match(value.lua, /\[18560\]=true/u);
  assert.match(value.lua, /clientBuild = 70755/u);
});

test("special disenchant loot tables and signed item flags are preserved explicitly", () => {
  const value = evidence();
  value.tables.ItemSparse.rows[0].Flags[1] = 0x40000000;
  const result = prepareClientValuation(JSON.stringify(value));
  assert.equal(result.summary.specialLoot, 1);
  assert.match(result.lua, /\[1\] = \{4,2,70,true,0,65,true\}/u);
  value.tables.ItemSparse.rows[0].Flags[1] = -2147483648;
  assert.equal(prepareClientValuation(JSON.stringify(value)).summary.specialLoot, 0);
});

test("rejects foreign products, inconsistent builds, missing provenance and encrypted rules", () => {
  for (const mutate of [
    (value) => {
      value.build.product = "wow_anniversary";
    },
    (value) => {
      value.build.buildNumber = 70756;
    },
    (value) => {
      value.hotfixSha256 = "unknown";
    },
    (value) => {
      value.tables.ItemDisenchantLoot.encryptedRecords = 1;
    },
  ]) {
    const value = evidence();
    mutate(value);
    assert.throws(() => prepareClientValuation(JSON.stringify(value)));
  }
});

test("retains explicit partial item and cooldown provenance without inventing missing records", () => {
  const value = evidence();
  value.tables.ItemSparse.encryptedRecords = 89;
  value.tables.SpellCooldowns.encryptedRecords = 77;
  const prepared = prepareClientValuation(JSON.stringify(value));
  assert.match(prepared.lua, /encryptedItems = 89/u);
  assert.match(prepared.lua, /encryptedCooldowns = 77/u);
  assert.equal(prepared.summary.items, 2);
});

test("does not silently accept missing flags, duplicate items, ambiguous brackets or executable values", () => {
  for (const mutate of [
    (value) => {
      delete value.tables.ItemSparse.rows[0].Flags;
    },
    (value) => {
      value.tables.Item.rows.push(value.tables.Item.rows[0]);
    },
    (value) => {
      value.tables.ItemDisenchantLoot.rows.push({
        ...value.tables.ItemDisenchantLoot.rows[0],
        id: 2,
      });
    },
    (value) => {
      value.tables.ItemSparse.rows[0].ItemLevel = "70}; error('injected')";
    },
  ]) {
    const value = evidence();
    mutate(value);
    assert.throws(() => prepareClientValuation(JSON.stringify(value)));
  }
});
