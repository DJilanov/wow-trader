import assert from "node:assert/strict";
import { test } from "node:test";
import { createTankTierSettings, tankTierPolicy } from "./tank-tier-policy.mjs";

const settings = {
  player: {
    equipment: { items: Array.from({ length: 17 }, (_, id) => ({ id: id + 1 })) },
    consumes: { mainHandImbue: "ElementalSharpeningStone" },
    rotation: { priorityList: [{ action: "tank" }] },
  },
  encounter: { targets: [{ stats: Array(44).fill(100), id: 10, parryHaste: true }] },
};
const support = {
  version: "full-v2",
  raid: { battleShout: 2 },
  party: { windfuryTotem: true },
  individual: { blessingOfKings: true },
};
const debuffs = { exposeArmor: 2, faerieFire: true };

test("dungeon and raid comparisons receive physical attacks and the same explicit healing", () => {
  const before = globalThis.structuredClone(settings);
  for (const scenario of ["solo", "raid"]) {
    const result = createTankTierSettings(settings, scenario, "tank_warrior", support, debuffs);
    const policy = tankTierPolicy(scenario);
    assert.equal(result.encounter.targets.length, scenario === "solo" ? 3 : 1);
    assert.equal(result.encounter.duration, scenario === "solo" ? 60 : 300);
    for (const target of result.encounter.targets) {
      assert.equal(target.stats[26], 3731);
      assert.equal(target.stats[21], 0);
      assert.equal(target.tankIndex, 0);
      assert.equal(target.level, scenario === "solo" ? 62 : 63);
      assert.equal(target.minBaseDamage, policy.minBaseDamage);
      assert.equal(target.parryHaste, false);
    }
    assert.deepEqual(result.tanks, [{ type: "Player", index: 0 }]);
    assert.equal(result.player.inFrontOfTarget, true);
    assert.deepEqual(result.player.healingModel, policy.healing);
    assert.equal(result.settings.iterations, 5000);
    assert.equal(result.settings.fixedRngSeed, "61723001");
    assert.deepEqual(result.player.equipment, settings.player.equipment);
    assert.deepEqual(result.player.rotation, settings.player.rotation);
  }
  assert.deepEqual(settings, before);
});

test("self support and raid support do not stack conflicting class effects or Windfury coatings", () => {
  const solo = createTankTierSettings(settings, "solo", "feral_tank_druid", support, debuffs);
  assert.deepEqual(solo.partyBuffs, {});
  assert.deepEqual(solo.player.buffs, {});
  assert.deepEqual(solo.debuffs, {});
  assert.deepEqual(solo.raidBuffs, { giftOfTheWild: 1, thorns: 1 });
  const warrior = createTankTierSettings(settings, "raid", "tank_warrior", support, debuffs);
  assert.equal(warrior.player.consumes.mainHandImbue, undefined);
  assert.equal(warrior.debuffs.exposeArmor, 0);
  assert.equal(warrior.raidBuffs.battleShout, 0);
  const bear = createTankTierSettings(settings, "raid", "feral_tank_druid", support, debuffs);
  assert.equal(bear.debuffs.faerieFire, false);
  assert.equal(bear.player.buffs.blessingOfKings, true);
});

test("rejects unsupported or incomplete characters instead of publishing a guessed tank tier", () => {
  assert.throws(() => tankTierPolicy("dps"));
  assert.throws(() => createTankTierSettings(settings, "raid", "rogue", support, debuffs));
  for (const patch of [
    { level: 30 },
    { rotation: {} },
    { foreverTier1Bonuses: true },
    { enableItemSwap: true },
    { equipment: { items: [] } },
  ]) {
    assert.throws(() =>
      createTankTierSettings(
        { ...settings, player: { ...settings.player, ...patch } },
        "raid",
        "tank_warrior",
        support,
        debuffs,
      ),
    );
  }
});

test("Paladin has Righteous Fury, its own aura and only one self blessing; no Druid buffs leak in", () => {
  const paladin = {
    ...settings,
    player: {
      ...settings.player,
      protectionPaladin: { options: { righteousFury: true, primarySeal: "Righteousness" } },
    },
  };
  const solo = createTankTierSettings(paladin, "solo", "protection_paladin", support, debuffs);
  assert.deepEqual(solo.raidBuffs, { devotionAura: 1 });
  assert.deepEqual(solo.player.buffs, { blessingOfWisdom: 1 });
  assert.equal(solo.player.protectionPaladin.options.righteousFury, true);
  const raid = createTankTierSettings(paladin, "raid", "protection_paladin", support, debuffs);
  assert.equal(raid.debuffs.faerieFire, true);
  assert.equal(raid.debuffs.exposeArmor, 2);
  assert.equal(raid.player.consumes.mainHandImbue, undefined);
  paladin.player.protectionPaladin.options.righteousFury = false;
  assert.throws(
    () => createTankTierSettings(paladin, "solo", "protection_paladin", support, debuffs),
    /Righteous Fury/,
  );
});
