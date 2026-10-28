import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createPaladinHealingFrameBrowserJob } from "./paladin-healing-browser-request-v2.mjs";

const bytes = readFileSync(
  new URL(
    "../../packages/forever-data/src/fixtures/paladin-healer-frames.v2.json.gz",
    import.meta.url,
  ),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "dd2136408c0c62d2e8513527f8942cea2becacff9254e72862e6033941c3b7d8",
);
const frames = JSON.parse(gunzipSync(bytes)).assets.map((entry) => entry.payload);
function setup(position = 1, scenarioId = "reference") {
  const frame = frames[position],
    source = frame.configurations.find((entry) => entry.scenarioId === scenarioId);
  assert(source);
  const workload = frame.workloads.find((entry) => entry.id === source.workloadId).frame;
  const consumes = {
    ...source.option.consumes,
    manaRegenElixir: source.option.manaRegenElixir,
    alcohol: source.option.alcohol,
  };
  const player = {
    class: 4,
    level: 60,
    spec: { oneofKind: "holyPaladin" },
    race: frame.frame.context.raceId,
    profession1: 4,
    profession2: 11,
    talentsString: source.option.state.talentsString,
    consumes: structuredClone(consumes),
    equipment: structuredClone(source.option.gear),
    buffs: { blessingOfKings: true },
    cooldowns: { timings: [10, 130, 250] },
  };
  const template = {
    raid: {
      parties: [{ players: [player], buffs: { windfuryTotem: true } }],
      buffs: { strengthOfEarthTotem: 2, graceOfAirTotem: 2, trueshotAura: true },
    },
    encounter: { duration: frame.frame.variant.durationSeconds, targets: [{}] },
    simOptions: { ruleset: 1, iterations: 128, randomSeed: 206270001n },
  };
  let encoded;
  const api = {
    paladinClass: 4,
    foreverRuleset: 1,
    eligibleRaces: [3, 8],
    RaidSimRequest: {
      fromBinary: (bytes) => {
        assert.deepEqual(bytes, Uint8Array.from(Buffer.from(source.job.requestBase64, "base64")));
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
    id: "paladin-frame-test",
    sourceRequestBase64: source.job.requestBase64,
    sourceContext: structuredClone(frame.frame.context),
    frame: structuredClone(frame.frame.variant),
    gear: structuredClone(source.option.gear.items),
    talentsString: source.option.state.talentsString,
    fields: structuredClone(source.option.state.fields),
    race: player.race,
    consumes: structuredClone(consumes),
    workload: structuredClone(workload),
    iterations: 128,
    seed: 206270001,
  };
  return { api, input, template, player, encoded: () => encoded };
}

test("preserves both actual encounter durations, positioning, raid buffs and source resource timings", () => {
  for (const position of [0, 1]) {
    const state = setup(position),
      before = structuredClone(state.template);
    const job = createPaladinHealingFrameBrowserJob(state.api, state.input);
    assert.equal(job.schema, "kfc-paladin-healing-job.v1");
    assert.deepEqual(job.workload, state.input.workload);
    assert.notEqual(job.workload, state.input.workload);
    assert.deepEqual(state.encoded().encounter, before.encounter);
    assert.deepEqual(state.encoded().raid, before.raid);
    assert.deepEqual(state.template, before);
  }
});

test("preserves unused source cooldown declarations when the measured equipment and consumes are unchanged", () => {
  const state = setup();
  state.input.workload.cooldowns.push({ itemId: 18637, minimumMissingMana: 1000 });
  state.input.gear = state.input.gear.map((item) => ({ ...item }));
  assert(!state.input.gear.some((item) => item.id === 18637));
  const job = createPaladinHealingFrameBrowserJob(state.api, state.input);
  assert.deepEqual(job.workload.cooldowns, state.input.workload.cooldowns);
});

test("removes unavailable uses for personally changed equipment and consumes", () => {
  const state = setup();
  state.input.gear[0] = { id: 1 };
  state.input.consumes.defaultPotion = 0;
  state.input.consumes.defaultConjured = 0;
  state.input.workload.cooldowns.push({ itemId: 18637, minimumMissingMana: 1000 });
  const job = createPaladinHealingFrameBrowserJob(state.api, state.input);
  assert(!job.workload.cooldowns.some((entry) => [18637, 13444, 12662].includes(entry.itemId)));
  assert.equal(state.encoded().raid.parties[0].players[0].equipment.items[0].id, 1);
  assert.equal(state.encoded().raid.parties[0].players[0].consumes.defaultPotion, 0);
});

test("removes the actual Weakness Analyzer use when its selected trinket is replaced", () => {
  const state = setup(1, "briarwood-marsh-area");
  const slot = state.input.gear.findIndex((item) => item.id === 272438);
  assert(slot >= 0);
  assert(state.input.workload.cooldowns.some((entry) => entry.itemId === 272438));
  state.input.gear[slot] = { id: 11819 };
  const job = createPaladinHealingFrameBrowserJob(state.api, state.input);
  assert(!job.workload.cooldowns.some((entry) => entry.itemId === 272438));
  assert(state.input.workload.cooldowns.some((entry) => entry.itemId === 272438));
});

test("rejects mismatched source race, professions, encounter, class and ruleset", () => {
  for (const mutation of [
    (state) => {
      state.player.race = 8;
    },
    (state) => {
      state.player.profession1 = 1;
    },
    (state) => {
      state.player.profession2 = 2;
    },
    (state) => {
      state.template.encounter.duration = 180;
    },
    (state) => {
      state.player.class = 5;
    },
    (state) => {
      state.player.spec.oneofKind = "protectionPaladin";
    },
    (state) => {
      state.player.level = 59;
    },
    (state) => {
      state.template.simOptions.ruleset = 0;
    },
    (state) => {
      state.player.enableItemSwap = true;
    },
    (state) => {
      state.player.bonusStats = {};
    },
    (state) => {
      state.player.healingModel = {};
    },
    (state) => {
      state.template.raid.parties[0].players.push(structuredClone(state.player));
    },
  ]) {
    const state = setup();
    mutation(state);
    assert.throws(() => createPaladinHealingFrameBrowserJob(state.api, state.input));
  }
});

test("rejects invalid job options, partial talents, profile metadata, gear and consumables", () => {
  for (const patch of [
    { id: "../bad" },
    { iterations: 0 },
    { iterations: 10001 },
    { seed: -1 },
    { talentsString: "1--" },
    { race: 8 },
    { gear: [] },
    { sourceContext: null },
    { sourceContext: { playerClass: 4, faction: 1, professions: [11, 4], raceId: 3 } },
    { frame: { kind: "tank", durationSeconds: 300, layout: "spread" } },
    { sourceRequestBase64: "" },
    { sourceRequestBase64: "a".repeat(128001) },
    { consumes: {} },
    { workload: {} },
  ]) {
    const state = setup();
    assert.throws(() =>
      createPaladinHealingFrameBrowserJob(state.api, { ...state.input, ...patch }),
    );
  }
});

test("rejects changed assignment labels, durations, positions and events outside the encounter", () => {
  for (const mutation of [
    (input) => {
      input.workload.name = input.workload.name.replace("300s", "180s");
    },
    (input) => {
      input.frame.layout = "stacked";
    },
    (input) => {
      input.frame.kind = "group";
    },
    (input) => {
      input.workload.targets[1].x = 2;
    },
    (input) => {
      input.workload.damage[0].atMs = 300000;
    },
    (input) => {
      input.workload.damage[0].atMs = -1;
    },
    (input) => {
      input.workload.damage[0].raidIndex = 0;
    },
  ]) {
    const state = setup();
    mutation(state.input);
    assert.throws(() => createPaladinHealingFrameBrowserJob(state.api, state.input));
  }
});
