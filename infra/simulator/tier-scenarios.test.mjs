import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTierScenarioSettings,
  tierScenarioPolicy,
  soloBenchmarkSupport,
  raidBenchmarkDebuffs,
} from "./tier-scenarios.mjs";

const support = {
  version: "full-v2",
  raid: { trueshotAura: true },
  party: { windfuryTotem: true },
  individual: { blessingOfKings: true },
};
const encounter = { targets: [{ level: 63, stats: [3731] }], duration: 120 };
const character = {
  player: {
    level: 60,
    equipment: { items: Array.from({ length: 17 }, (_, id) => ({ id })) },
    rotation: { priorityList: [{ action: { castSpell: { spellId: 1 } } }] },
    buffs: { powerInfusions: 10, innervates: 10 },
    consumes: { flask: 1 },
    professions: [1, 2],
    race: 1,
    talentsString: "123",
    warrior: { options: { startingRage: 0 } },
  },
  raidBuffs: { rallyingCryOfTheDragonslayer: true },
  partyBuffs: {},
  debuffs: { faerieFire: true },
};

test("solo removes outside support without deleting the character, pet options or authored rotation", () => {
  const before = globalThis.structuredClone(character);
  for (const profile of Object.keys(soloBenchmarkSupport)) {
    const next = createTierScenarioSettings(character, encounter, support, "solo", profile);
    assert.deepEqual({ ...next.player, buffs: {} }, { ...before.player, buffs: {} });
    assert.deepEqual(next.debuffs, {});
    assert.deepEqual(next.player.buffs, {});
    assert.equal(next.raidBuffs.rallyingCryOfTheDragonslayer, undefined);
    assert.equal(next.raidBuffs.trueshotAura, undefined);
    assert.equal(next.encounter.duration, 300);
    assert.equal(next.encounter.durationVariation, 0);
    assert.deepEqual(next.tanks, []);
    assert.equal(next.targetDummies, 0);
  }
  assert.deepEqual(character, before);
});
test("baseline self buffs are class-owned and solo Shaman does not stack air totems", () => {
  const warrior = createTierScenarioSettings(character, encounter, support, "solo", "warrior");
  assert.deepEqual(warrior.raidBuffs, { battleShout: 1 });
  assert.deepEqual(warrior.partyBuffs, {});
  const shaman = createTierScenarioSettings(
    character,
    encounter,
    support,
    "solo",
    "elemental_shaman",
  );
  assert.equal(shaman.partyBuffs.windfuryTotem, true);
  assert.equal(shaman.raidBuffs.graceOfAirTotem, undefined);
  assert.equal(shaman.raidBuffs.strengthOfEarthTotem, 1);
  const mage = createTierScenarioSettings(character, encounter, support, "solo", "mage");
  assert.deepEqual(mage.raidBuffs, { arcaneBrilliance: true });
});
test("raid supplies one common buff/debuff policy, never inherits world buffs or outside mana grants", () => {
  const next = createTierScenarioSettings(character, encounter, support, "raid", "warrior");
  assert.deepEqual(next.raidBuffs, support.raid);
  assert.deepEqual(next.partyBuffs, support.party);
  assert.deepEqual(next.player.buffs, support.individual);
  assert.deepEqual(next.debuffs, raidBenchmarkDebuffs);
  next.debuffs.faerieFire = false;
  assert.equal(raidBenchmarkDebuffs.faerieFire, true);
  assert.deepEqual({ ...next.player, buffs: {} }, { ...character.player, buffs: {} });
});
test("versions and serialized policies are separate, and invalid or unpublished profiles fail closed", () => {
  const solo = tierScenarioPolicy("solo", support),
    raid = tierScenarioPolicy("raid", support);
  assert.notEqual(solo.version, raid.version);
  assert.notDeepEqual(solo, raid);
  assert.equal(solo.iterations, 5000);
  assert.equal(raid.seed, 58723001);
  solo.selfSupport.warrior.raid.battleShout = 0;
  assert.equal(soloBenchmarkSupport.warrior.raid.battleShout, 1);
  assert.throws(() => tierScenarioPolicy("hybrid", support));
  assert.throws(() => tierScenarioPolicy("raid", { ...support, version: "unknown" }));
  assert.throws(() =>
    createTierScenarioSettings(character, encounter, support, "solo", "retribution_paladin"),
  );
});
