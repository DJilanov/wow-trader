import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { recoverPaladinHealingPlan } from "./paladin-healing-plan-recovery.mjs";
import {
  createPaladinHealingLegacyScenarioWorkload,
  paladinHealingLegacyScenarios,
} from "./paladin-healing-scenarios-v2.mjs";
import { paladinHealingResourceOrders } from "./paladin-healing-resource-order.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

const bytes = readFileSync(
  new URL("./fixtures/paladin-plan-recovery-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "1b448e8c16b8c75eef5c6f924e3c5d85f09c64e743ceef98135644b570dece25",
);
const source = JSON.parse(gunzipSync(bytes)),
  items = new Map(source.items.map((item) => [item.id, item])),
  spellPolicy = source.spellPolicy;

function recover(fixture, workload = fixture.workload) {
  return recoverPaladinHealingPlan({
    player: fixture.player,
    fields: fixture.fields,
    workload,
    spellPolicy,
    items,
  });
}

function rebuild(recovered, scenarioId) {
  return createPaladinHealingLegacyScenarioWorkload({
    ...recovered,
    scenarioId,
    spellPolicy,
    items,
  });
}

test("measured Paladin training plans retain exact workload identity after recovery", () => {
  assert.equal(source.fixtures.length, 4);
  assert.equal(source.source.training.iterations, 64);
  assert.equal(source.source.training.seed, 3862819);
  assert(source.source.path.includes("/paladin-practical-feedback-v1/90bcb9"));
  assert.deepEqual(
    new Set(source.fixtures.map((row) => row.kind)),
    new Set(["tank", "group", "burst"]),
  );
  for (const fixture of source.fixtures) {
    const before = structuredClone(fixture),
      restored = recover(fixture),
      workload = rebuild(restored, fixture.scenarioId);
    assert.deepEqual(workload, fixture.workload);
    assert.equal(simulationHash(workload), fixture.identity.workloadSha256);
    assert.equal(simulationHash(fixture.identity), fixture.key);
    assert.deepEqual(restored.option.gear, fixture.expectedOption.gear);
    assert.deepEqual(restored.option.consumes, fixture.expectedOption.consumes);
    assert.equal(restored.option.alcohol, fixture.expectedOption.alcohol);
    assert.equal(restored.option.state.talentsString, fixture.expectedOption.state.talentsString);
    assert.deepEqual(fixture, before);
  }
});

test("recovery keeps active ranks and coarse controls under every declared mechanics scenario", () => {
  const fixture = source.fixtures.find((row) => row.expectedOption.policy.lightsVigil);
  assert(fixture);
  for (const scenario of paladinHealingLegacyScenarios()) {
    const workload = rebuild(
        {
          option: fixture.expectedOption,
          kind: fixture.kind,
          durationSeconds: 180,
          damagePerSecond: Number(fixture.workload.name.match(/-([0-9]+)dps$/)[1]),
        },
        scenario.id,
      ),
      restored = recover(fixture, workload);
    assert.deepEqual(rebuild(restored, scenario.id), workload);
    assert.deepEqual(restored.option.policy.ranks, fixture.expectedOption.policy.ranks);
    assert.equal(restored.option.requireVigil, fixture.expectedOption.requireVigil);
    assert.equal(restored.option.minimumPartyTargets, fixture.expectedOption.minimumPartyTargets);
    assert.equal(
      restored.option.minimumPartyMissingHealth,
      fixture.expectedOption.minimumPartyMissingHealth,
    );
  }
});

test("resource ordering is recovered from actual actions rather than a default label", () => {
  const fixture = source.fixtures[0],
    recovered = recover(fixture);
  for (const resourceOrder of paladinHealingResourceOrders) {
    const workload = rebuild(
        { ...recovered, option: { ...recovered.option, resourceOrder } },
        fixture.scenarioId,
      ),
      restored = recover(fixture, workload);
    assert.deepEqual(rebuild(restored, fixture.scenarioId).cooldowns, workload.cooldowns);
  }
});

test("recovery rejects unmodeled equipment, actors, priorities and resource actions", () => {
  const mutations = [
    (row) => {
      row.player.class = 5;
    },
    (row) => {
      row.player.bonusStats = { stats: [1] };
    },
    (row) => {
      row.player.equipment.items[0].randomSuffix = 1;
    },
    (row) => {
      row.fields.holyShock += 1;
    },
    (row) => {
      row.workload.assignmentScoring = undefined;
    },
    (row) => {
      row.workload.requireFullTalentBuild = false;
    },
    (row) => {
      row.workload.priorities.push({ ...row.workload.priorities.at(-1) });
    },
    (row) => {
      row.workload.priorities[0].raidIndex = 0;
    },
    (row) => {
      row.workload.priorities[0].spellId = 1;
    },
    (row) => {
      row.workload.cooldowns.push({ itemId: 999999, minimumManaMissing: 0 });
    },
  ];
  for (const mutate of mutations) {
    const fixture = structuredClone(source.fixtures[0]);
    mutate(fixture);
    assert.throws(() => recover(fixture));
  }
});
