import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  druidLegacyItemPolicies,
  extractDruidLegacyItemRules,
  renderDruidLegacyItems,
} from "./druid-legacy-items.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-legacy-items-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "067283032e78312cc44f8d0f9cc793496f4e13a077b6f45196c08d789f2f45cb",
);
const fixture = JSON.parse(gunzipSync(bytes));

test("legacy sensitivity preserves the distinction between current effects and unknown base stats", () => {
  const rules = extractDruidLegacyItemRules(fixture);
  assert.equal(rules.briarwoodNeutralEquipSpellPower, 15);
  assert.equal(rules.briarwoodMarshEquipSpellPower, 30);
  assert.equal(rules.royalForestSpirit, 16);
  assert.equal(rules.currentBaseStatsVerified, false);
  assert.equal(rules.zeroRoyalHealingIsSensitivityOnly, true);
  for (const change of [
    (value) => {
      value.currentBaseStatsVerified = true;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 1318478).EffectBasePointsF = 44;
    },
    (value) => {
      value.tables.ItemEffect[0].TriggerType = 0;
    },
    (value) => {
      value.tables.Spell.find((row) => row.id === 1318478).Description_lang = "Always active";
    },
  ]) {
    const changed = structuredClone(fixture);
    change(changed);
    assert.throws(() => extractDruidLegacyItemRules(changed));
  }
});

test("six explicit alternatives retain historical reference, neutral/area and missing-healing hypotheses", () => {
  const policies = druidLegacyItemPolicies();
  assert.equal(new Set(policies.map((row) => row.id)).size, 6);
  assert.deepEqual(
    [
      policies[0].royalSealHealingPower,
      policies[0].briarwoodSpellPower,
      policies[0].royalSealForestSpirit,
    ],
    [44, 29, false],
  );
  assert(policies.some((row) => row.royalSealHealingPower === 0 && row.briarwoodSpellPower === 15));
  assert(policies.some((row) => row.royalSealForestSpirit));
  assert(policies.some((row) => row.briarwoodSpellPower === 30));
  assert(Object.isFrozen(policies) && policies.every(Object.isFrozen));
});

test("rendering adds class-scoped state, one configuration and one echo without changing other rules", () => {
  const source = {
    baseline: "\titemEffects *kfcDruidItemEffects\n\tresto.registerKFCDragonMark()",
    workload:
      '\tItemEffectsPolicy *KFCDruidItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`\n\tItemEffectsPolicy *KFCDruidItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`\n\tif frame.ItemEffectsPolicy != nil { if err = healer.ConfigureKFCDruidItemEffects(*frame.ItemEffectsPolicy); err != nil { return nil,err } }\n\tif frame.Research != nil { policy := *frame.Research; output.Research = &policy }',
  };
  const result = renderDruidLegacyItems(source);
  assert(result.baseline.includes("registerKFCLegacyItems"));
  assert.equal(result.workload.split('json:"legacyItemsPolicy,omitempty"').length, 3);
  assert.equal(result.workload.split("ConfigureKFCDruidLegacyItems").length, 2);
  assert.equal(result.workload.split("output.LegacyItemsPolicy").length, 2);
  assert.throws(() => renderDruidLegacyItems(result));
  assert.throws(() => renderDruidLegacyItems({ ...source, baseline: "" }));
});
