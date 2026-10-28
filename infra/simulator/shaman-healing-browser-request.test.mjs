import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createShamanHealingBrowserJob } from "./shaman-healing-browser-request.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "../../packages/forever-data/src/fixtures/shaman-healer-library.v2.json.gz",
        import.meta.url,
      ),
    ),
  ),
);
const source = fixture.payload.configurations[0];
function setup() {
  const player = {
    class: 7,
    level: 60,
    spec: { oneofKind: "restorationShaman" },
    talentsString: source.talentsString,
    race: source.race,
    consumes: structuredClone(source.consumes),
    buffs: { blessingOfKings: true },
    equipment: { items: source.gear },
  };
  const template = {
    raid: { parties: [{ players: [player] }], buffs: { improvedTotems: true } },
    encounter: { duration: 180, targets: [{}] },
    simOptions: { ruleset: 1, iterations: 256, randomSeed: 1n },
  };
  let encoded;
  const api = {
    eligibleRaces: [1, 5, 6, 7, 10],
    shamanClass: 7,
    foreverRuleset: 1,
    RaidSimRequest: {
      fromBinary: (bytes) => {
        assert(bytes.length > 0);
        return structuredClone(template);
      },
      toBinary: (request) => {
        encoded = request;
        return new Uint8Array([1, 2, 3]);
      },
    },
    EquipmentSpec: { fromJson: (value) => structuredClone(value) },
  };
  const input = {
    id: "shaman-browser-test",
    sourceRequestBase64: source.job.requestBase64,
    gear: structuredClone(source.gear),
    talentsString: source.talentsString,
    race: source.race,
    consumes: structuredClone(source.consumes),
    workload: structuredClone(source.job.workload),
    iterations: 64,
    seed: 109743,
  };
  return { api, input, template, player, encoded: () => encoded };
}
test("encodes personal settings while preserving the reviewed encounter and raid support", () => {
  const s = setup();
  s.input.race = 7;
  s.input.gear[0] = { id: source.gear[0].id };
  s.input.consumes.defaultPotion = 0;
  const before = structuredClone(s.template),
    job = createShamanHealingBrowserJob(s.api, s.input),
    encoded = s.encoded(),
    player = encoded.raid.parties[0].players[0];
  assert.equal(job.requestBase64, "AQID");
  assert.equal(job.id, s.input.id);
  assert.equal(job.detail, false);
  assert.deepEqual(job.workload, s.input.workload);
  assert.equal(encoded.simOptions.iterations, 64);
  assert.equal(encoded.simOptions.randomSeed, 109743n);
  assert.equal(player.race, 7);
  assert.equal(player.consumes.defaultPotion, 0);
  assert.deepEqual(player.equipment.items, s.input.gear);
  assert.deepEqual(encoded.raid.buffs, before.raid.buffs);
  assert.deepEqual(encoded.encounter, before.encounter);
  assert.deepEqual(s.template, before);
});
test("ignores zero-padding differences without changing the original protobuf talent text", () => {
  const s = setup();
  s.input.talentsString = s.input.talentsString
    .split("-")
    .map((part) => part + "00")
    .join("-");
  createShamanHealingBrowserJob(s.api, s.input);
  assert.equal(s.encoded().raid.parties[0].players[0].talentsString, source.talentsString);
});
test("rejects unsupported races, invalid jobs and altered encounter templates", () => {
  for (const patch of [
    { race: 99 },
    { iterations: 0 },
    { iterations: 10001 },
    { seed: -1 },
    { id: "../bad" },
    { talentsString: "invalid" },
    { gear: [] },
    { workload: {} },
    { sourceRequestBase64: "a".repeat(500001) },
  ]) {
    const s = setup();
    assert.throws(() => createShamanHealingBrowserJob(s.api, { ...s.input, ...patch }));
  }
  for (const change of [
    "class",
    "spec",
    "level",
    "actors",
    "duration",
    "ruleset",
    "bonus",
    "healing",
    "swap",
  ]) {
    const s = setup();
    if (change === "class") s.player.class = 5;
    if (change === "spec") s.player.spec.oneofKind = "elementalShaman";
    if (change === "level") s.player.level = 59;
    if (change === "actors") s.template.raid.parties[0].players.push(structuredClone(s.player));
    if (change === "duration") s.template.encounter.duration = 300;
    if (change === "ruleset") s.template.simOptions.ruleset = 0;
    if (change === "bonus") s.player.bonusStats = {};
    if (change === "healing") s.player.healingModel = {};
    if (change === "swap") s.player.enableItemSwap = true;
    assert.throws(() => createShamanHealingBrowserJob(s.api, s.input), change);
  }
});
