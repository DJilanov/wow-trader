import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultEnchantFits,
  defaultEnchantProfiles,
  enchantDefaultGear,
  patchDefaultEnchantPresetSource,
} from "../infra/simulator/default-enchants.mjs";

function rule(effectId, type, extra = {}) {
  return {
    effectId,
    spellId: effectId * 100 + type,
    type,
    extraTypes: [],
    status: "static",
    name: "Reviewed fixture",
    minLevel: 0,
    maxLevel: 0,
    itemLevelMin: 0,
    itemLevelMax: 0,
    requiredProfession: 0,
    requiredSkill: 0,
    condition: 0,
    classAllowlist: [],
    armorTypes: [],
    enchantType: 0,
    stats: Array.from({ length: 44 }, (_, i) => (i === 2 ? 3 : 0)),
    ...extra,
  };
}

function fixture(profile, variant) {
  const definition = defaultEnchantProfiles[profile];
  const types = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14];
  const shield = ["tank_warrior", "protection_paladin", "elemental_shaman"].includes(profile);
  const items = types.map((type, slot) => ({
    id: slot + 1,
    type,
    ilvl: 60,
    armorType: 2,
    ...(slot === 14 ? { handType: definition.twoHand ? 4 : 2, weaponType: 4 } : {}),
    ...(slot === 15 ? { handType: 3, weaponType: shield ? 7 : 5 } : {}),
    ...(slot === 16
      ? {
          rangedWeaponType:
            profile === "hunter" ||
            profile === "warrior" ||
            profile === "tank_warrior" ||
            profile === "rogue"
              ? 3
              : 8,
        }
      : {}),
  }));
  const enchants = {};
  for (const [type, effectId] of Object.entries({
    ...definition.armor,
    ...(definition.gloves?.[variant] ? { 7: definition.gloves[variant] } : {}),
  })) {
    const e = rule(effectId, Number(type));
    enchants[`${effectId}:${e.type}`] = e;
  }
  const weapon = rule(definition.twoHand ?? definition.weapon, 13, {
    enchantType: definition.twoHand ? 1 : 0,
  });
  enchants.weapon = weapon;
  if (definition.shield) enchants.shield = rule(definition.shield, 13, { enchantType: 2 });
  if (definition.scope)
    enchants.scope = rule(definition.scope, 14, { status: "scripted", stats: [] });
  return {
    gear: { items: items.map((item) => ({ id: item.id })) },
    db: { items },
    inspection: { enchants },
  };
}

test("all 28 supplied lists have deterministic reviewed enchants without changing equipment", () => {
  let count = 0;
  for (const [profile, definition] of Object.entries(defaultEnchantProfiles)) {
    const variants =
      definition.variants ??
      (profile === "protection_paladin" ? ["alliance"] : ["alliance", "horde"]);
    for (const variant of variants) {
      const input = fixture(profile, variant);
      const before = globalThis.structuredClone(input);
      const result = enchantDefaultGear(input.gear, profile, variant, input.db, input.inspection);
      assert(result.choices.length >= 9);
      assert.deepEqual(
        result.gear.items.map((item) => item.id),
        input.gear.items.map((item) => item.id),
      );
      assert.deepEqual(
        enchantDefaultGear(result.gear, profile, variant, input.db, input.inspection),
        result,
      );
      assert.deepEqual(input, before, "pure transformation must not mutate caller data");
      for (const slot of [1, 7, 10, 11, 12, 13])
        assert.equal(result.gear.items[slot].enchant, undefined);
      assert.equal(result.gear.items[16].enchant, profile === "hunter" ? 8720 : undefined);
      count++;
    }
  }
  assert.equal(count, 28);
});

test("school, weapon and tank defaults are role-specific", () => {
  for (const [profile, variant, slot, want] of [
    ["mage", "fire", 6, 2616],
    ["mage", "frost", 6, 2615],
    ["mage", "arcane", 6, 2617],
    ["warlock", "destruction", 6, 2616],
    ["shadow_priest", "shadow", 6, 2614],
    ["warrior", "fury", 5, 1885],
    ["warrior", "fury", 8, 1506],
    ["feral_tank_druid", "alliance", 14, 2646],
    ["protection_paladin", "alliance", 4, 8719],
    ["protection_paladin", "alliance", 15, 929],
    ["tank_warrior", "alliance", 14, 2563],
  ]) {
    const { gear, db, inspection } = fixture(profile, variant);
    assert.equal(
      enchantDefaultGear(gear, profile, variant, db, inspection).gear.items[slot].enchant,
      want,
    );
  }
});

test("eligibility rejects unsupported models and all incompatible wearer/item requirements", () => {
  const item = { type: 13, ilvl: 60, armorType: 2, handType: 2, weaponType: 4 };
  const base = rule(2563, 13);
  assert(defaultEnchantFits(base, item, 9, 14));
  for (const extra of [
    { status: "unsupported" },
    { status: "provisional" },
    { status: "scripted" },
    { classAllowlist: [1] },
    { requiredProfession: 4 },
    { requiredSkill: 333 },
    { minLevel: 61 },
    { maxLevel: 59 },
    { itemLevelMin: 61 },
    { itemLevelMax: 59 },
    { armorTypes: [4] },
    { enchantType: 1 },
    { enchantType: 2 },
    { enchantType: 4 },
    { condition: 1 },
    { type: 5 },
  ])
    assert(!defaultEnchantFits({ ...base, ...extra }, item, 9, 14), JSON.stringify(extra));
  assert(!defaultEnchantFits(base, { ...item, weaponType: 5 }, 9, 15));
  assert(!defaultEnchantFits(base, { ...item, weaponType: 7 }, 9, 15));
  assert(!defaultEnchantFits(base, { ...item, handType: 3 }, 9, 14));
  assert(!defaultEnchantFits(base, { ...item, handType: 4 }, 9, 15));
  assert(!defaultEnchantFits(base, item, 9, 1));
  for (const rangedWeaponType of [4, 5, 6, 7, 8])
    assert(
      !defaultEnchantFits(
        rule(8720, 14, { status: "scripted" }),
        { type: 14, ilvl: 60, rangedWeaponType },
        2,
        16,
      ),
    );
});

test("missing, ambiguous or changed evidence fails the build instead of silently leaving blank defaults", () => {
  for (const mutate of [
    ({ db }) => {
      db.items.shift();
    },
    ({ inspection }) => {
      inspection.enchants.weapon.status = "provisional";
    },
    ({ inspection }) => {
      inspection.enchants.duplicate = inspection.enchants.weapon;
    },
    ({ inspection }) => {
      inspection.enchants.weapon.stats[0] = Number.NaN;
    },
    ({ gear }) => {
      gear.items.pop();
    },
  ]) {
    const input = fixture("warrior", "fury");
    mutate(input);
    assert.throws(
      () => enchantDefaultGear(input.gear, "warrior", "fury", input.db, input.inspection),
      /missing|unique|stats|Invalid/,
    );
  }
});

test("preset tooltip overlay is idempotent and does not install runtime autofill", () => {
  const source = "makePresetGear('Fury', Gear, { tooltip: 'Level 60 Forever equipment.' });";
  const patched = patchDefaultEnchantPresetSource(source);
  assert.match(patched, /not simulated BiS/);
  assert.equal(patchDefaultEnchantPresetSource(patched), patched);
  assert.throws(() => patchDefaultEnchantPresetSource("upstream changed"), /changed/);
});
