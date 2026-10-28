import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  assertSimulationStatsContext,
  createSimulationStatsRequest,
} from "./simulation-stats-context.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/simulation-stats-context.v1.json.gz", import.meta.url)),
  ),
);

test("reconstructs all 18 captured Mage, Priest and Warlock stat requests", () => {
  assert.equal(fixture.schema, "kfc-simulation-stats-context.v1");
  assert.equal(fixture.cases.length, 18);
  assert.equal(
    new Set(fixture.cases.map((entry) => entry.id.split("/").slice(0, 2).join("/"))).size,
    9,
  );
  for (const entry of fixture.cases) {
    assert.deepEqual(
      createSimulationStatsRequest(entry.simulation, entry.equipment),
      entry.stats,
      entry.id,
    );
    assertSimulationStatsContext(entry.simulation, entry.stats, entry.equipment);
  }
});

test("rejects all 18 former native/browser checks with a different simulation context", () => {
  for (const entry of fixture.cases) {
    assert.equal(entry.legacyStats.raid.numActiveParties ?? 0, 0);
    assert.throws(
      () => assertSimulationStatsContext(entry.simulation, entry.legacyStats, entry.equipment),
      /Stat request differs/,
      entry.id,
    );
  }
});

test("rejects a missing or incorrect active-party count", () => {
  const entry = fixture.cases[0];
  for (const count of [undefined, 0, 2]) {
    const actual = structuredClone(entry.stats);
    if (count === undefined) delete actual.raid.numActiveParties;
    else actual.raid.numActiveParties = count;
    assert.throws(
      () => assertSimulationStatsContext(entry.simulation, actual, entry.equipment),
      /Stat request differs/,
    );
  }
});

test("preserves improved totems, raid auras and Kings", () => {
  const entry = fixture.cases[0];
  const mutations = [
    (raid) => {
      raid.buffs.strengthOfEarthTotem = "TristateEffectRegular";
    },
    (raid) => {
      raid.buffs.graceOfAirTotem = "TristateEffectRegular";
    },
    (raid) => {
      raid.buffs.trueshotAura = false;
    },
    (raid) => {
      raid.buffs.moonkinAura = false;
    },
    (raid) => {
      raid.buffs.leaderOfThePack = false;
    },
    (raid) => {
      raid.parties[0].buffs.windfuryTotem = false;
    },
    (raid) => {
      raid.parties[0].players[0].buffs.blessingOfKings = false;
    },
  ];
  for (const mutate of mutations) {
    const actual = structuredClone(entry.stats);
    mutate(actual.raid);
    assert.throws(
      () => assertSimulationStatsContext(entry.simulation, actual, entry.equipment),
      /Stat request differs/,
    );
  }
});

test("rejects changed encounter, debuff, talent, consume and profession settings", () => {
  const entry = fixture.cases[0];
  const mutations = [
    (request) => {
      request.encounter.targets[0].level = 60;
    },
    (request) => {
      request.encounter.duration += 1;
    },
    (request) => {
      request.raid.debuffs.sunderArmor = false;
    },
    (request) => {
      request.raid.parties[0].players[0].talentsString += "1";
    },
    (request) => {
      request.raid.parties[0].players[0].consumes = {};
    },
    (request) => {
      request.raid.parties[0].players[0].profession1 = "Alchemy";
    },
  ];
  for (const mutate of mutations) {
    const actual = structuredClone(entry.stats);
    mutate(actual);
    assert.throws(
      () => assertSimulationStatsContext(entry.simulation, actual, entry.equipment),
      /Stat request differs/,
    );
  }
});

test("requires the selected full-set equipment and its enchants", () => {
  for (const entry of fixture.cases.filter((entry) => entry.id.endsWith("/full-set"))) {
    assert.throws(
      () => assertSimulationStatsContext(entry.simulation, entry.stats),
      /Stat request differs/,
    );
    const actual = structuredClone(entry.stats);
    const equipped = actual.raid.parties[0].players[0].equipment.items;
    const enchanted = equipped.find((item) => item.enchant);
    assert(enchanted);
    delete enchanted.enchant;
    assert.throws(
      () => assertSimulationStatsContext(entry.simulation, actual, entry.equipment),
      /Stat request differs/,
    );
  }
});

test("copies the context and gear without sharing mutable state", () => {
  const entry = structuredClone(fixture.cases[0]);
  const before = structuredClone(entry);
  const result = createSimulationStatsRequest(entry.simulation, entry.equipment);
  assert.deepEqual(entry, before);
  result.raid.buffs.trueshotAura = false;
  result.encounter.targets[0].level = 1;
  result.raid.parties[0].players[0].equipment.items[0].id = 1;
  assert.deepEqual(entry, before);
});

test("sampling options do not alter a stat request", () => {
  const entry = fixture.cases[0];
  const simulation = structuredClone(entry.simulation);
  simulation.simOptions.iterations = 1234;
  simulation.simOptions.randomSeed = "5678";
  assert.deepEqual(createSimulationStatsRequest(simulation, entry.equipment), entry.stats);
});

test("rejects Classic, implicit rulesets and incomplete source contexts", () => {
  const entry = fixture.cases[0];
  for (const ruleset of [0, "RulesetClassic", undefined]) {
    const simulation = structuredClone(entry.simulation);
    simulation.simOptions.ruleset = ruleset;
    assert.throws(() => createSimulationStatsRequest(simulation), /explicit Forever ruleset/);
  }
  for (const mutate of [
    (simulation) => {
      delete simulation.raid.numActiveParties;
    },
    (simulation) => {
      simulation.raid.parties = [];
    },
    (simulation) => {
      simulation.raid.parties[0].players = [];
    },
    (simulation) => {
      simulation.encounter.targets = [];
    },
  ]) {
    const simulation = structuredClone(entry.simulation);
    mutate(simulation);
    assert.throws(() => createSimulationStatsRequest(simulation));
  }
});

test("supports canonical numeric Forever enums and rejects malformed gear overrides", () => {
  const simulation = structuredClone(fixture.cases[0].simulation);
  simulation.simOptions.ruleset = 1;
  assert.equal(createSimulationStatsRequest(simulation).ruleset, 1);
  for (const equipment of [null, {}, { items: [] }, { items: Array(17).fill(null) }])
    assert.throws(() => createSimulationStatsRequest(simulation, equipment));
});
