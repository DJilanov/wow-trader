import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createPaladinHealingEquipmentPolicies } from "./paladin-healing-equipment-policy.mjs";

const digest = (body) => createHash("sha256").update(body).digest("hex");
const bytes = readFileSync(
  new URL("./fixtures/paladin-personal-equipment-policy.v1.json.gz", import.meta.url),
);
assert.equal(digest(bytes), "86027adf785226e713db6b1443bff1e51331885bc75e695fd219a3e4fdcc0788");
const fixture = JSON.parse(gunzipSync(bytes));
const expected = {
  modelIdentity: "f0ff281981e5d576fe3cf8161071bd5b636cc83dc676e3954c85af7ff8a1fdb1",
  catalogSha256: "f897b695fed785e3c3dcade0f1079807c4b62a585f6079b9a6067d6e333da011",
};
assert.equal(fixture.schema, "kfc-paladin-equipment-policy-source.v1");
assert.equal(fixture.performanceQualification, false);
assert.equal(fixture.newNumericalJobs, 0);
const policies = createPaladinHealingEquipmentPolicies(fixture.domain, expected);
const sources = new Map(fixture.sources.map((row) => [row.scenarioId, row.workload]));
const probes = new Map(fixture.probes.map((row) => [row.name, row.gear.items]));

test("matches every owned policy and exact constructor field order across 896 genuine legal-gear controls", () => {
  assert.equal(fixture.controls.length, 896);
  assert.equal(probes.size, 32);
  assert.equal(sources.size, 28);
  for (const control of fixture.controls) {
    const input = structuredClone(sources.get(control.scenarioId));
    input.cooldowns = structuredClone(control.workload.cooldowns);
    const before = structuredClone(input);
    const result = policies.apply(input, probes.get(control.probe), control.scenarioId);
    assert.deepEqual(result, control.workload, control.scenarioId + "/" + control.probe);
    assert.equal(
      digest(JSON.stringify(result)),
      digest(JSON.stringify(control.workload)),
      control.scenarioId + "/" + control.probe + " byte order",
    );
    assert.deepEqual(input, before);
  }
});

test("adding and removing Dormant Heart, Briarwood, Seal and set thresholds never retain stale ownership", () => {
  for (const scenarioId of policies.scenarioIds) {
    for (const name of [
      "item-249473",
      "item-12930",
      "item-18472",
      "set-185-5",
      "set-183-5",
      "set-1968-4",
      "set-182-4",
    ]) {
      const source = sources.get(scenarioId);
      const changed = policies.apply(source, probes.get(name), scenarioId);
      const restored = policies.apply(changed, fixture.originalGear.items, scenarioId);
      assert.deepEqual(restored, source, scenarioId + "/" + name);
    }
  }
});

test("preserves personal casting, resource disable choices, encounter data and all non-equipment assumptions", () => {
  const source = structuredClone(sources.get("combined-conservative"));
  source.cooldowns = [];
  source.priorities[0].minimumMissingHealth += 321;
  source.useDivineFavor = false;
  source.divineFavorMinimumBaseCost = 0;
  const result = policies.apply(source, probes.get("item-249473"), "combined-conservative");
  const fixed = (value) =>
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          ![
            "itemEffectsPolicy",
            "castSetPolicy",
            "selfSetPolicy",
            "itemHealthRegenTickMs",
            "legacyItemsPolicy",
            "utilityHealingCanCrit",
            "recombobulatorCanCrit",
            "circleChannelScales",
            "itemArea",
            "orbArea",
          ].includes(key),
      ),
    );
  assert.deepEqual(fixed(result), fixed(source));
  assert.deepEqual(result.cooldowns, []);
});

test("rejects another model/catalog and malformed or incomplete source policy domains", () => {
  assert.throws(() =>
    createPaladinHealingEquipmentPolicies(fixture.domain, {
      ...expected,
      modelIdentity: "0".repeat(64),
    }),
  );
  assert.throws(() =>
    createPaladinHealingEquipmentPolicies(fixture.domain, {
      ...expected,
      catalogSha256: "0".repeat(64),
    }),
  );
  for (const change of [
    (domain) => domain.scenarios.pop(),
    (domain) => {
      domain.scenarios[1] = structuredClone(domain.scenarios[0]);
    },
    (domain) => {
      delete domain.scenarios[0].id;
    },
    (domain) => {
      delete domain.scenarios[0].heartPolicyId;
    },
    (domain) => {
      domain.scenarios[0].heartChance = Infinity;
    },
    (domain) => {
      domain.scenarios[0].devoutProcChance = -1;
    },
    (domain) => {
      domain.scenarios[0].itemArea = "unknown";
    },
    (domain) => {
      domain.items.push(structuredClone(domain.items[0]));
    },
    (domain) => {
      domain.items[0].setId = -1;
    },
    (domain) => {
      domain.scenarios[0].unreviewedField = true;
    },
  ]) {
    const domain = structuredClone(fixture.domain);
    change(domain);
    assert.throws(() => createPaladinHealingEquipmentPolicies(domain, expected));
  }
});

test("rejects unknown item IDs, incomplete gear and unreviewed scenarios", () => {
  const source = sources.get("reference");
  assert.throws(() => policies.apply(source, fixture.originalGear.items.slice(1), "reference"));
  const gear = structuredClone(fixture.originalGear.items);
  gear[0] = { id: 999999999 };
  assert.throws(() => policies.apply(source, gear, "reference"));
  assert.throws(() => policies.apply(source, fixture.originalGear.items, "unknown"));
});

test("copies source rules at initialization so later caller mutations cannot change their model", () => {
  const domain = structuredClone(fixture.domain);
  const frozen = createPaladinHealingEquipmentPolicies(domain, expected);
  const source = sources.get("heart-five-percent");
  const gear = probes.get("item-249473");
  const before = frozen.apply(source, gear, "heart-five-percent");
  domain.scenarios.find((row) => row.id === "heart-five-percent").heartChance = 0.9;
  domain.items[0].setId = 999;
  assert.deepEqual(frozen.apply(source, gear, "heart-five-percent"), before);
});
