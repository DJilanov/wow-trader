import assert from "node:assert/strict";
import { test } from "node:test";
import { createTierBenchmarkSettings, tierBenchmarkPolicy } from "./tier-benchmark.mjs";

const support = {
  version: "full-v2",
  raid: { moonkinAura: true },
  party: { windfuryTotem: true },
  individual: { blessingOfKings: true },
};
const encounter = { duration: 120, targets: [{ level: 63, stats: [1, 2, 3] }] };
const settings = {
  player: {
    level: 60,
    equipment: { items: Array.from({ length: 17 }, (_, id) => ({ id })) },
    rotation: { priorityList: [{ action: "example" }] },
    talentsString: "123",
    consumes: { flask: 1 },
    race: "RaceHuman",
    buffs: { powerInfusions: 10 },
  },
  raidBuffs: {},
  partyBuffs: {},
  debuffs: { shadowWeaving: true },
};

test("uses identical support, duration and external-debuff policy without changing gear or rotation", () => {
  const before = structuredClone(settings);
  const value = createTierBenchmarkSettings(settings, encounter, support);
  assert.deepEqual(settings, before);
  for (const key of ["equipment", "rotation", "talentsString", "consumes", "race"])
    assert.deepEqual(value.player[key], settings.player[key]);
  assert.deepEqual(value.player.buffs, support.individual);
  assert.deepEqual(value.debuffs, {});
  assert.deepEqual(value.raidBuffs, support.raid);
  assert.deepEqual(value.partyBuffs, support.party);
  assert.equal(value.encounter.duration, 300);
  assert.equal(value.encounter.durationVariation, 0);
  assert.equal(value.encounter.useHealth, false);
  value.encounter.targets[0].stats[0] = 50;
  assert.equal(encounter.targets[0].stats[0], 1);
  assert.equal(tierBenchmarkPolicy.iterations, 5000);
});

test("rejects unsupported levels, incomplete gear, implicit rotations and free bonuses", () => {
  for (const patch of [
    { level: 30 },
    { equipment: { items: [] } },
    { rotation: {} },
    { enableItemSwap: true },
    { foreverTier1Bonuses: true },
  ])
    assert.throws(() =>
      createTierBenchmarkSettings(
        { ...settings, player: { ...settings.player, ...patch } },
        encounter,
        support,
      ),
    );
  assert.throws(() =>
    createTierBenchmarkSettings(settings, { ...encounter, targets: [] }, support),
  );
  assert.throws(() =>
    createTierBenchmarkSettings(settings, encounter, { ...support, version: "unknown" }),
  );
});
