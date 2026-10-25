import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  extractDruidWildheartRules,
  druidWildheartEquipmentPolicies,
  renderDruidWildheartModel,
} from "./druid-wildheart-model.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-healing-set-effects-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "c91382654f70c5f6eae98a623df607855fed0a15019697e90ac84ab10cb821d9",
);
const source = JSON.parse(gunzipSync(bytes));

test("Wildheart binds exact thresholds and recovered resources without asserting a server proc rate", () => {
  const rules = extractDruidWildheartRules(source);
  assert.deepEqual([rules.setId, rules.threshold, rules.mana, rules.rage], [185, 5, 200, 10]);
  assert.deepEqual(rules.energy, { perTick: 4, tickMs: 1000, durationMs: 5000 });
  assert.equal(rules.referenceManaChance, 0.02);
  assert.equal(rules.clientDummyChance, 1);
  assert.equal(rules.serverProcRateVerified, false);
  assert.equal(rules.publicationAllowed, false);
});
test("changed thresholds, rates, resources, durations and missing tooltip links are rejected", () => {
  for (const mutate of [
    (value) => {
      value.tables.ItemSetSpell.find((row) => row.SpellID === 450608).Threshold = 4;
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 450608).ProcChance = 2;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 27782).EffectBasePointsF = 300;
    },
    (value) => {
      value.tables.SpellDuration.find((row) => row.id === 28).Duration = 6000;
    },
    (value) => {
      value.summary.tooltipEdges = value.summary.tooltipEdges.filter(
        ([, child]) => child !== 27782,
      );
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => extractDruidWildheartRules(changed));
  }
});
test("equipment research has explicit immutable zero, reference and literal-metadata alternatives", () => {
  const policies = druidWildheartEquipmentPolicies();
  assert.equal(policies.length, 6);
  assert.equal(policies[0].wildheartManaProcChance, 0.02);
  assert(policies.some((row) => row.wildheartManaProcChance === 0));
  assert(policies.some((row) => row.wildheartManaProcChance === 1));
  assert(policies.some((row) => row.wildheartHealingEvents === "direct-heals"));
  assert(Object.isFrozen(policies) && policies.every(Object.isFrozen));
});
test("dispatch and transport derive one exact new handler and reject repeated application", () => {
  const input = {
    dispatch: '\t{186, "Beaststalker Armor"},',
    bounty:
      '\tcore.MakeProcTriggerAura(&c.Unit, core.ProcTrigger{\n\t\tActionID: actionID, Name: "Nature\'s Bounty (Mana)", ProcChance: 0.02, Handler: c.AddMana(sim, 200, manaMetrics)\n\t})\n\tcore.MakeProcTriggerAura energy-untouched',
    baseline: "research *kfcDruidHealingResearchState",
    workload:
      "type KFCDruidHealingWorkload struct {\n}\ntype KFCDruidHealingWorkloadResult struct {\n}\n\tpositions := map[int32]KFCDruidFriendlyPosition{}\n\tfor iteration := int32(0);",
  };
  const result = renderDruidWildheartModel(input);
  assert(result.dispatch.includes('{185, "Wildheart Raiment"}'));
  assert(result.bounty.includes("applyKFCWildheartMana(agent, actionID, manaMetrics)"));
  assert(result.bounty.endsWith("energy-untouched"));
  assert(result.workload.includes('json:"equipmentPolicy,omitempty"'));
  assert(result.workload.includes("output.EquipmentPolicy = &policy"));
  assert.throws(() => renderDruidWildheartModel(result));
});
test("missing current source or duplicate effect records cannot pass validation", () => {
  for (const mutate of [
    (value) => {
      value.source.build.clientVersion = "other";
    },
    (value) => {
      value.tables.SpellEffect.push(value.tables.SpellEffect.find((row) => row.SpellID === 27782));
    },
    (value) => {
      value.tables.ItemSet = value.tables.ItemSet.filter((row) => row.id !== 185);
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => extractDruidWildheartRules(changed));
  }
});
