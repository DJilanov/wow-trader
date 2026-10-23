import assert from "node:assert/strict";

/** Preserve presentation preferences while importing the exact measured combat setup. */
export function tankBuildSettings(sourceSettings, request, gear, faction, iterations, seed) {
  assert(["Alliance", "Horde"].includes(faction));
  assert(Number.isSafeInteger(iterations) && iterations > 0);
  assert(Number.isSafeInteger(seed) && seed > 0);
  assert.equal(request.raid.parties.length, 1);
  assert.equal(request.raid.parties[0].players.length, 1);
  assert.equal(gear.items.length, 17);
  assert(["RulesetForever", 1].includes(request.simOptions.ruleset));
  const settings = globalThis.structuredClone(sourceSettings);
  const party = request.raid.parties[0];
  settings.player = globalThis.structuredClone(party.players[0]);
  delete settings.player.database;
  settings.player.equipment = globalThis.structuredClone(gear);
  settings.raidBuffs = globalThis.structuredClone(request.raid.buffs ?? {});
  settings.partyBuffs = globalThis.structuredClone(party.buffs ?? {});
  settings.debuffs = globalThis.structuredClone(request.raid.debuffs ?? {});
  settings.tanks = globalThis.structuredClone(request.raid.tanks ?? []);
  settings.encounter = globalThis.structuredClone(request.encounter);
  Object.assign(settings.settings, {
    faction,
    ruleset: "RulesetForever",
    iterations,
    fixedRngSeed: String(seed),
    showDamageMetrics: true,
    showThreatMetrics: true,
  });
  return settings;
}

/** The pinned UI pads eight parties; the level-cap engine treats omitted level as 60. */
export function normalizeTankImportRequest(request) {
  const normalized = globalThis.structuredClone(request);
  const parties = normalized.raid.parties;
  assert(parties.length >= 1 && parties.length <= 8);
  assert(parties[0].players.length >= 1 && parties[0].players.length <= 5);
  const first = parties[0].players[0];
  assert(first.class && first.class !== "ClassUnknown");
  for (const player of parties[0].players.slice(1)) assert.deepEqual(player, {});
  for (const party of parties.slice(1)) {
    assert.deepEqual(
      Object.keys(party).filter((key) => key !== "players" && key !== "buffs"),
      [],
    );
    assert.deepEqual(party.buffs ?? {}, {});
    assert(party.players.length <= 5);
    for (const player of party.players) assert.deepEqual(player, {});
  }
  assert([undefined, 0, 60].includes(first.level), "Import changed effective character level");
  assert(
    Number.isInteger(normalized.raid.numActiveParties) &&
      normalized.raid.numActiveParties >= 1 &&
      normalized.raid.numActiveParties <= 8,
  );
  first.level = 60;
  delete first.database;
  parties[0].players = [first];
  normalized.raid.parties = [parties[0]];
  normalized.raid.numActiveParties = 1;
  return normalized;
}

/** Pool independent equal-weight observations without discarding between-range variation. */
export function combineTankValidation(validation) {
  assert.equal(validation.length, 2);
  assert(validation.every((entry) => Number.isSafeInteger(entry.seed) && entry.seed > 0));
  assert.equal(
    new Set(validation.map((entry) => entry.seed)).size,
    2,
    "Validation ranges must be distinct",
  );
  const measurements = validation.map((entry) => entry.candidate);
  assert(validation.every((entry) => entry.accepted));
  assert(measurements.every((entry) => entry.iterations === 20000));
  assert.equal(measurements[0].health, measurements[1].health);
  assert.equal(measurements[0].armor, measurements[1].armor);
  const iterations = measurements.reduce((sum, entry) => sum + entry.iterations, 0);
  const metrics = Object.fromEntries(
    ["dps", "threat", "dtps"].map((name) => {
      const avg =
        measurements.reduce((sum, entry) => sum + entry.metrics[name].avg * entry.iterations, 0) /
        iterations;
      const variance =
        measurements.reduce((sum, entry) => {
          const metric = entry.metrics[name];
          assert(Number.isFinite(metric.avg) && metric.avg > 0);
          assert(Number.isFinite(metric.stdev) && metric.stdev >= 0);
          return sum + entry.iterations * (metric.stdev ** 2 + (metric.avg - avg) ** 2);
        }, 0) / iterations;
      return [name, { avg, stdev: Math.sqrt(variance) }];
    }),
  );
  return { iterations, metrics, health: measurements[0].health, armor: measurements[0].armor };
}
