import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createPaladinHealingEquipmentBrowserJob } from "./paladin-healing-browser-request-v3.mjs";
import { createPaladinHealingEquipmentPolicies } from "./paladin-healing-equipment-policy.mjs";

const domain = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/paladin-personal-equipment-policy.v1.json.gz", import.meta.url),
    ),
  ),
).domain;
const frames = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "../../packages/forever-data/src/fixtures/paladin-healer-frames.v2.json.gz",
        import.meta.url,
      ),
    ),
  ),
).assets.map((asset) => asset.payload);
const policies = createPaladinHealingEquipmentPolicies(domain, {
  modelIdentity: domain.modelIdentity,
  catalogSha256: domain.catalogSha256,
});
function setup() {
  let frame, source, workload;
  for (const candidate of frames) {
    const found = candidate.configurations.find(
      (config) =>
        candidate.workloads.find((row) => row.id === config.workloadId).frame.itemEffectsPolicy,
    );
    if (found) {
      frame = candidate;
      source = found;
      workload = candidate.workloads.find((row) => row.id === source.workloadId).frame;
      break;
    }
  }
  assert(source && source.option.gear.items.some((item) => item.id === 249473));
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
    profession1: frame.frame.context.professions[0],
    profession2: frame.frame.context.professions[1],
    talentsString: source.option.state.talentsString,
    consumes: structuredClone(consumes),
    equipment: structuredClone(source.option.gear),
    buffs: { blessingOfKings: true },
  };
  const template = {
    raid: { parties: [{ players: [player] }] },
    encounter: { duration: frame.frame.variant.durationSeconds, targets: [{}] },
    simOptions: { ruleset: 1, iterations: 128, randomSeed: 206270001n },
  };
  const api = {
    paladinClass: 4,
    foreverRuleset: 1,
    eligibleRaces: [3, 8],
    modelIdentity: domain.modelIdentity,
    catalogSha256: domain.catalogSha256,
    equipmentPolicies: policies,
    EquipmentSpec: { fromJson: (input) => structuredClone(input) },
    RaidSimRequest: {
      fromBinary: () => structuredClone(template),
      toBinary: () => new Uint8Array([1, 2, 3]),
    },
  };
  const input = {
    id: "paladin-owned-effects-test",
    scenarioId: source.scenarioId,
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
  return { api, input, player };
}

test("unchanged gear preserves the complete source workload without regenerating its policies", () => {
  const { api, input } = setup();
  const before = structuredClone(input);
  api.equipmentPolicies = {
    ...policies,
    apply: () => {
      throw new Error("Unchanged source policies must not be rebuilt");
    },
  };
  const job = createPaladinHealingEquipmentBrowserJob(api, input);
  assert.deepEqual(job.workload, input.workload);
  assert.notEqual(job.workload, input.workload);
  assert.deepEqual(input, before);
});

test("replacing the real Dormant Heart removes its proc and applies the newly owned legacy trinket rule", () => {
  const { api, input } = setup();
  assert(!input.gear.some((item) => item.id === 12930));
  const slot = input.gear.findIndex((item) => item.id === 249473);
  input.gear[slot] = { id: 12930 };
  input.workload.cooldowns = [];
  const job = createPaladinHealingEquipmentBrowserJob(api, input);
  assert.equal(job.workload.itemEffectsPolicy, undefined);
  assert.equal(
    job.workload.legacyItemsPolicy.briarwoodSpellPower,
    input.scenarioId === "briarwood-marsh-area" ? 30 : 15,
  );
  assert.deepEqual(job.workload.cooldowns, []);
  assert(input.workload.itemEffectsPolicy);
});

test("an enchant-only edit retains the same item/set policy declarations", () => {
  const { api, input } = setup();
  input.gear[0].enchant = (input.gear[0].enchant ?? 0) + 1;
  api.equipmentPolicies = {
    ...policies,
    apply: () => {
      throw new Error("Enchant changes do not change item ownership");
    },
  };
  const job = createPaladinHealingEquipmentBrowserJob(api, input);
  assert.deepEqual(job.workload.itemEffectsPolicy, input.workload.itemEffectsPolicy);
});

test("rejects another model/catalog, unknown scenario or invalid source profession binding", () => {
  for (const change of [
    (state) => {
      state.api.modelIdentity = "0".repeat(64);
    },
    (state) => {
      state.api.catalogSha256 = "0".repeat(64);
    },
    (state) => {
      state.input.scenarioId = "unknown";
    },
    (state) => {
      state.api.equipmentPolicies = { ...policies, scenarioIds: undefined };
    },
    (state) => {
      state.input.sourceContext.professions = [1, 2];
    },
  ]) {
    const state = setup();
    change(state);
    assert.throws(() => createPaladinHealingEquipmentBrowserJob(state.api, state.input));
  }
});

test("rejects a source actor whose original equipment template is incomplete", () => {
  const { api, input, player } = setup();
  player.equipment.items.pop();
  assert.throws(
    () => createPaladinHealingEquipmentBrowserJob(api, input),
    /original Paladin equipment template is incomplete/,
  );
});
