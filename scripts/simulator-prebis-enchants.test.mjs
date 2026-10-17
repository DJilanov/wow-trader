import assert from "node:assert/strict";
import { test } from "node:test";
import {
  carryCompatibleEnchants,
  prebisEnchantPolicy,
  prebisEnchantFits,
  describePrebisGear,
} from "../infra/simulator/prebis-enchants.mjs";
import { prebisEnchantProblem } from "../infra/simulator/enchant-acquisition.mjs";
import { prebisSlotTypes } from "../infra/simulator/prebis-pool.mjs";

test("equipment comparisons retain compatible optimized enchants on replacement items", () => {
  const proposal = { items: [{ id: 2 }] };
  const current = { items: [{ id: 1, enchant: 1506 }] };
  const db = { items: [{ id: 2, type: 1, ilvl: 60, armorType: 4 }] };
  const enchant = {
    effectId: 1506,
    type: 1,
    extraTypes: [],
    status: "static",
    classAllowlist: [],
    armorTypes: [],
    minLevel: 0,
    maxLevel: 0,
    itemLevelMin: 0,
    itemLevelMax: 0,
    enchantType: 0,
  };
  const inspection = { enchants: { head: enchant } };
  assert.equal(
    carryCompatibleEnchants(proposal, current, 9, db, inspection).items[0].enchant,
    1506,
  );
  assert.deepEqual(proposal, { items: [{ id: 2 }] });
  assert.equal(
    carryCompatibleEnchants({ items: [{ id: 2, enchant: 999 }] }, current, 9, db, inspection)
      .items[0].enchant,
    999,
  );
  db.items[0].type = 2;
  assert.equal(
    carryCompatibleEnchants(proposal, current, 9, db, inspection).items[0].enchant,
    undefined,
  );
  db.items[0].type = 1;
  enchant.status = "provisional";
  assert.equal(
    carryCompatibleEnchants(proposal, current, 9, db, inspection).items[0].enchant,
    undefined,
  );
});

test("only an explicit reviewed Crusader policy allows the provisional model", () => {
  const policy = prebisEnchantPolicy({
    enchantPolicy: { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: [1900] },
  });
  const item = { type: 13, weaponType: 9, handType: 2, ilvl: 60 };
  const common = {
    type: 13,
    extraTypes: [],
    status: "provisional",
    effectId: 1900,
    classAllowlist: [],
    armorTypes: [],
    minLevel: 0,
    maxLevel: 0,
    itemLevelMin: 0,
    itemLevelMax: 0,
    enchantType: 0,
  };
  assert.equal(prebisEnchantFits(common, item, 9, 14), false);
  assert.equal(prebisEnchantFits(common, item, 9, 14, policy), true);
  assert.equal(common.status, "provisional");
  assert.equal(prebisEnchantFits({ ...common, effectId: 803 }, item, 9, 14, policy), false);
  assert.equal(prebisEnchantFits({ ...common, classAllowlist: [3] }, item, 9, 14, policy), false);
  for (const ids of [[8217], [1900, 1900], ["1900"]])
    assert.throws(
      () =>
        prebisEnchantPolicy({
          enchantPolicy: { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: ids },
        }),
      /Unreviewed/,
    );
  assert.deepEqual(prebisEnchantPolicy({}).provisionalEffectIds, []);
});

function enchantFixture() {
  const effects = new Map([
    [0, 1506],
    [2, 2488],
    [3, 247],
    [4, 1891],
    [5, 1885],
    [6, 927],
    [8, 1506],
    [9, 1887],
    [14, 1900],
    [15, 1900],
  ]);
  const db = {
    items: prebisSlotTypes.map((type, slot) => ({
      id: slot + 1,
      type,
      ilvl: 60,
      armorType: 4,
      ...(type === 13 ? { weaponType: 9, handType: 2 } : {}),
    })),
  };
  const gear = {
    items: db.items.map((item, slot) => ({
      id: item.id,
      ...(effects.has(slot) ? { enchant: effects.get(slot) } : {}),
    })),
  };
  const enchants = {};
  for (const [slot, effectId] of effects)
    enchants[effectId] = {
      effectId,
      spellId: effectId,
      type: effectId === 1506 ? 1 : prebisSlotTypes[slot],
      extraTypes: effectId === 1506 ? [9] : [],
      status: effectId === 1900 ? "provisional" : "static",
      name: "Fixture",
      stats: effectId === 1900 ? [] : Array(44).fill(0),
      classAllowlist: [],
      armorTypes: [],
      minLevel: 0,
      maxLevel: 0,
      itemLevelMin: 0,
      itemLevelMax: 0,
      enchantType: 0,
    };
  return { gear, db, enchants };
}

test("proc-aware gear evidence preserves provisional status and never adds a permanent Strength bonus", () => {
  const policy = prebisEnchantPolicy({
    enchantPolicy: { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: [1900] },
  });
  const { gear, db, enchants } = enchantFixture();
  assert.throws(
    () => describePrebisGear(gear, "warrior", "fury", 9, db, { enchants }),
    /Unreviewed/,
  );
  const result = describePrebisGear(gear, "warrior", "fury", 9, db, { enchants }, policy);
  assert.equal(result.choices.filter((choice) => choice.status === "provisional").length, 2);
  assert.equal(result.enchantTotals[0], 0);
  enchants[1900].stats = [100, ...Array(43).fill(0)];
  assert.throws(
    () => describePrebisGear(gear, "warrior", "fury", 9, db, { enchants }, policy),
    /static stats/,
  );
});

test("two compatible recipes for one weapon enchant effect resolve deterministically without double counting", () => {
  const { gear, db, enchants } = enchantFixture();
  gear.items[14].enchant = 241;
  gear.items[15] = {};
  db.items[14].handType = 4;
  const common = {
    ...enchants[1900],
    effectId: 241,
    status: "scripted",
    stats: Array(44).fill(0),
  };
  const twoHand = { ...common, spellId: 7745, enchantType: 1, name: "Minor Impact" };
  const generic = { ...common, spellId: 13503, name: "Lesser Striking" };
  enchants.twoHand = twoHand;
  enchants.generic = generic;
  const describe = (values = enchants) =>
    describePrebisGear(gear, "warrior", "arms", 9, db, { enchants: values });
  const result = describe();
  const weapon = result.choices.find((choice) => choice.gearIndex === 14);
  assert.equal(weapon.key, "241:7745:13");
  assert.deepEqual(weapon.recipeKeys, ["241:7745:13", "241:13503:13"]);
  assert.equal(result.choices.length, 9);
  assert.deepEqual(result.enchantTotals, Array(44).fill(0));
  assert.deepEqual(describe(Object.fromEntries(Object.entries(enchants).reverse())), result);
  db.items[14].handType = 2;
  const singleHand = describe().choices.find((choice) => choice.gearIndex === 14);
  assert.equal(singleHand.key, "241:13503:13");
  assert.equal(singleHand.recipeKeys, undefined);
  db.items[14].handType = 4;
  generic.spellId = 22749;
  assert.equal(describe().choices.find((choice) => choice.gearIndex === 14).key, "241:7745:13");
});

test("conflicting payloads or confidence for a shared enchant effect still fail closed", () => {
  for (const change of [
    (enchant) => (enchant.stats = [1, ...Array(43).fill(0)]),
    (enchant) => (enchant.status = "static"),
  ]) {
    const { gear, db, enchants } = enchantFixture();
    gear.items[14].enchant = 241;
    gear.items[15] = {};
    db.items[14].handType = 4;
    const common = {
      ...enchants[1900],
      effectId: 241,
      status: "scripted",
      stats: Array(44).fill(0),
    };
    enchants.twoHand = { ...common, spellId: 7745, enchantType: 1 };
    enchants.generic = { ...common, spellId: 13503 };
    change(enchants.generic);
    assert.throws(
      () => describePrebisGear(gear, "warrior", "arms", 9, db, { enchants }),
      /Conflicting optimized enchant recipes/,
    );
  }
});

test("pre-raid enchant search excludes raid rewards and recipe unlocks without conflating effect IDs", () => {
  assert.match(prebisEnchantProblem({ effectId: 2523, spellId: 22779 }), /raid-only/);
  assert.match(prebisEnchantProblem({ effectId: 2717, spellId: 29483 }), /raid-only/);
  assert.match(prebisEnchantProblem({ effectId: 2588, spellId: 24164 }), /raid-only/);
  assert.match(prebisEnchantProblem({ effectId: 2564, spellId: 25080 }), /raid-only/);
  assert.match(prebisEnchantProblem({ effectId: 2504, spellId: 22749 }), /raid-only/);
  assert.equal(prebisEnchantProblem({ effectId: 2564, spellId: 23800 }), "");
  assert.equal(prebisEnchantProblem({ effectId: 1506, spellId: 15397 }), "");
  assert.equal(prebisEnchantProblem({ effectId: 2488, spellId: 22599 }), "");
  assert.equal(prebisEnchantProblem({ effectId: 2563, spellId: 23799 }), "");
});

test("modeled haste and weapon damage enter the search without enabling provisional procs", () => {
  const item = { type: 13, weaponType: 9, handType: 2, ilvl: 60 };
  const enchant = {
    effectId: 1897,
    spellId: 20031,
    type: 13,
    extraTypes: [],
    status: "scripted",
    classAllowlist: [],
    armorTypes: [],
    minLevel: 0,
    maxLevel: 0,
    itemLevelMin: 0,
    itemLevelMax: 0,
    enchantType: 0,
  };
  assert.equal(prebisEnchantFits(enchant, item, 9, 14), true);
  assert.equal(
    prebisEnchantFits(
      { ...enchant, effectId: 2543, type: 1, extraTypes: [9] },
      { type: 1, ilvl: 60 },
      9,
      0,
    ),
    true,
  );
  assert.equal(
    prebisEnchantFits({ ...enchant, effectId: 1900, status: "provisional" }, item, 9, 14),
    false,
  );
  const policy = prebisEnchantPolicy({
    enchantPolicy: {
      schema: "kfc-enchant-model-policy.v1",
      provisionalEffectIds: [36, 803, 1898, 1900],
    },
  });
  for (const effectId of policy.provisionalEffectIds)
    assert.equal(
      prebisEnchantFits({ ...enchant, effectId, status: "provisional" }, item, 9, 14, policy),
      true,
    );
});
