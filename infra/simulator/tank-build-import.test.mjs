import assert from "node:assert/strict";
import test from "node:test";
import {
  tankBuildSettings,
  combineTankValidation,
  normalizeTankImportRequest,
} from "./tank-build-import.mjs";

test("tank imports use every measured combat field and keep UI preferences", () => {
  const source = {
    settings: { language: "en", faction: "Alliance" },
    player: { race: "RaceHuman" },
    epRatios: [1, 0],
  };
  const player = {
    race: "RaceTauren",
    profession1: "Engineering",
    profession2: "Enchanting",
    database: { items: [] },
    equipment: { items: [] },
    rotation: { priorityList: [1] },
  };
  const request = {
    raid: {
      parties: [{ players: [player], buffs: { windfuryTotem: true } }],
      buffs: { thorns: 1 },
      debuffs: { faerieFire: true },
      tanks: [{ type: "Player" }],
    },
    encounter: { duration: 300, targets: [{ level: 63 }] },
    simOptions: { ruleset: "RulesetForever" },
  };
  const gear = { items: Array.from({ length: 17 }, (_, id) => ({ id })) };
  const result = tankBuildSettings(source, request, gear, "Horde", 100, 12345);
  assert.equal(result.settings.faction, "Horde");
  assert.equal(result.settings.language, "en");
  assert.equal(result.settings.fixedRngSeed, "12345");
  assert.equal(result.settings.iterations, 100);
  assert.deepEqual(result.player.equipment, gear);
  assert.equal(result.player.profession2, "Enchanting");
  assert.equal(result.player.race, "RaceTauren");
  assert.equal(result.player.database, undefined);
  assert.deepEqual(result.raidBuffs, request.raid.buffs);
  assert.deepEqual(result.partyBuffs, request.raid.parties[0].buffs);
  assert.deepEqual(result.debuffs, request.raid.debuffs);
  assert.deepEqual(result.tanks, request.raid.tanks);
  assert.deepEqual(result.encounter, request.encounter);
  result.player.rotation.priorityList.push(2);
  assert.deepEqual(player.rotation.priorityList, [1]);
  assert.equal(source.settings.faction, "Alliance");
  assert.deepEqual(result.epRatios, [1, 0]);
  assert.throws(() => tankBuildSettings(source, request, gear, "Unknown", 100, 1));
  assert.throws(() => tankBuildSettings(source, request, gear, "Horde", 0, 1));
  assert.throws(() =>
    tankBuildSettings(source, { ...request, simOptions: { ruleset: 2 } }, gear, "Horde", 100, 1),
  );
});

test("tank validation pooling includes between-range variation", () => {
  const measured = (avg) => ({
    accepted: true,
    candidate: {
      iterations: 20000,
      health: 6000,
      armor: 7000,
      metrics: Object.fromEntries(["dps", "threat", "dtps"].map((key) => [key, { avg, stdev: 3 }])),
    },
  });
  const validation = [
    { ...measured(8), seed: 1 },
    { ...measured(12), seed: 2 },
  ];
  const result = combineTankValidation(validation);
  assert.equal(result.iterations, 40000);
  assert.equal(result.health, 6000);
  assert.equal(result.metrics.threat.avg, 10);
  assert.equal(result.metrics.threat.stdev, Math.sqrt(13));
  assert.throws(() =>
    combineTankValidation([{ ...validation[0], accepted: false }, validation[1]]),
  );
  assert.throws(() => combineTankValidation([validation[0]]));
  assert.throws(() => combineTankValidation([validation[0], validation[0]]));
});

test("import normalization accepts only empty UI padding and cap-level spelling", () => {
  const request = {
    raid: {
      numActiveParties: 5,
      parties: [
        {
          players: [{ class: "ClassWarrior", name: "Tank", equipment: { items: [] } }, {}],
          buffs: { windfuryTotem: true },
        },
        { players: [{}, {}], buffs: {} },
      ],
    },
    encounter: { duration: 300 },
  };
  const normalized = normalizeTankImportRequest(request);
  assert.equal(normalized.raid.parties.length, 1);
  assert.equal(normalized.raid.parties[0].players.length, 1);
  assert.equal(normalized.raid.parties[0].players[0].level, 60);
  assert.equal(normalized.raid.numActiveParties, 1);
  assert.deepEqual(normalized.raid.parties[0].buffs, { windfuryTotem: true });
  assert.equal(request.raid.parties.length, 2);
  for (const edit of [
    (value) => {
      value.raid.parties[0].players[0].level = 59;
    },
    (value) => {
      value.raid.parties[0].players[1] = { class: "ClassWarrior" };
    },
    (value) => {
      value.raid.parties[1].players[0] = { class: "ClassDruid" };
    },
    (value) => {
      value.raid.parties[1].buffs = { windfuryTotem: true };
    },
    (value) => {
      value.raid.parties[1].hiddenBonus = true;
    },
  ]) {
    const invalid = globalThis.structuredClone(request);
    edit(invalid);
    assert.throws(() => normalizeTankImportRequest(invalid));
  }
});
