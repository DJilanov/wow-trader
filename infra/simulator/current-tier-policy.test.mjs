import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  currentDpsTierPolicy,
  currentDpsTierSettings,
  currentTankTierPolicy,
  healerTierDemand,
  poolHealingMeasurements,
} from "./current-tier-policy.mjs";

const support = JSON.parse(
  await readFile(new URL("./raid-buff-defaults.v2.json", import.meta.url)),
);
const encounter = { targets: [{ level: 63 }], duration: 300 };
const settings = {
  player: {
    equipment: { items: Array.from({ length: 17 }, () => ({ id: 1 })) },
    rotation: { priorityList: [{}] },
  },
  encounter,
};
test("all current DPS receive improved raid support while solo Paladins use one own blessing", () => {
  for (const profile of ["warrior", "mage", "retribution_paladin"]) {
    const result = currentDpsTierSettings(settings, encounter, support, "raid", profile);
    assert.equal(result.raidBuffs.strengthOfEarthTotem, 2);
    assert.equal(result.raidBuffs.graceOfAirTotem, 2);
    assert.equal(result.partyBuffs.windfuryTotem, true);
    assert.equal(result.raidBuffs.trueshotAura, true);
    assert.equal(result.player.buffs.blessingOfKings, true);
  }
  const ret = currentDpsTierSettings(
    settings,
    encounter,
    support,
    "solo",
    "retribution_paladin",
    "paladin-retribution-static",
  );
  const shock = currentDpsTierSettings(
    settings,
    encounter,
    support,
    "solo",
    "retribution_paladin",
    "paladin-shockadin-static",
  );
  assert.deepEqual(ret.player.buffs, { blessingOfMight: 1 });
  assert.deepEqual(shock.player.buffs, { blessingOfWisdom: 1 });
  assert.equal(ret.partyBuffs.windfuryTotem, undefined);
  assert.equal(
    currentDpsTierPolicy("solo", support, encounter).selfSupport.elemental_shaman.party
      .windfuryTotem,
    true,
  );
});
test("healing assignments share targets, positions and exact deterministic damage", () => {
  const tank = healerTierDemand("tank"),
    group = healerTierDemand("group"),
    burst = healerTierDemand("burst");
  assert.deepEqual(tank.targets, group.targets);
  assert.deepEqual(group.targets, burst.targets);
  assert.equal(
    tank.damage.reduce((sum, row) => sum + row.amount, 0),
    143200,
  );
  assert.equal(
    group.damage.reduce((sum, row) => sum + row.amount, 0),
    143200,
  );
  assert.equal(
    burst.damage.reduce((sum, row) => sum + row.amount, 0),
    110000,
  );
  assert.equal(
    burst.damage.every((row) => row.atMs % 15000 === 0),
    true,
  );
  assert.throws(() => healerTierDemand("damage"));
});
test("pooled healing margins account for both within-seed and between-seed variance", () => {
  const fields = {
    effectiveHealingHps: 90,
    absorbedHps: 10,
    overhealingHps: 900,
    survivalRate: 1,
    manaRemainingMean: 100,
    missingHealthSecondsMean: 100,
    finalMissingHealthMean: 0,
    manaBlockedSecondsMean: 0,
    plannedIncomingPostMitigationDamage: 1000,
    deliveredIncomingDamageMean: 1000,
  };
  const result = poolHealingMeasurements([
    { ...fields, iterations: 256, hps: 100, hpsStdev: 10 },
    { ...fields, effectiveHealingHps: 110, iterations: 256, hps: 120, hpsStdev: 10 },
  ]);
  assert.equal(result.iterations, 512);
  assert.equal(result.hps, 110);
  assert.ok(result.hpsStdev > 14);
  assert.ok(result.hpsStdev < 15);
  assert.equal(result.overhealingHps, 900);
});
test("tank comparisons declare their actual new sample count independently from gear-search holdouts", () => {
  for (const scenario of ["solo", "raid"]) {
    const policy = currentTankTierPolicy(scenario);
    assert.equal(policy.iterations, 5000);
    assert.deepEqual(policy.seeds, [61723001]);
    assert.equal(policy.durationSeconds, scenario === "solo" ? 60 : 300);
  }
});
