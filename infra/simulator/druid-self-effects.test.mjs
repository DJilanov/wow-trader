import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  extractDruidSelfEffects,
  druidSelfEffectsPolicies,
  renderDruidSelfEffects,
} from "./druid-self-effects.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-healing-set-effects-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "c91382654f70c5f6eae98a623df607855fed0a15019697e90ac84ab10cb821d9",
);
const source = JSON.parse(gunzipSync(bytes));

test("current self-effects retain exact source payloads and scoped assumptions", () => {
  const rules = extractDruidSelfEffects(source);
  assert.deepEqual(
    [
      rules.dreadmist.chance,
      rules.dreadmist.minimum,
      rules.dreadmist.maximum,
      rules.dreadmist.healingCoefficient,
    ],
    [0.05, 270, 330, 0],
  );
  assert.deepEqual(
    [rules.viper.pieces, rules.viper.healthThreshold, rules.viper.cooldownMs, rules.viper.ticks],
    [4, 0.25, 300000, 5],
  );
  assert.equal(rules.vitality.combatAura, 161);
  assert.equal(rules.vitality.healthPerFive, 15);
  assert.equal(rules.serverMechanicsVerified, false);
  assert.equal(rules.publicationAllowed, false);
});
test("changed proc rates, coefficients, resource payloads and set thresholds are rejected", () => {
  for (const mutate of [
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 450585).ProcChance = 100;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 450583).EffectBonusCoefficient = 1;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 1291797).EffectBasePointsF = 40;
    },
    (value) => {
      value.tables.ItemSetSpell.find((row) => row.SpellID === 1291796).Threshold = 3;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 21347).EffectAura = 84;
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => extractDruidSelfEffects(changed));
  }
});
test("bounded self-effects alternatives keep timing, regeneration cadence and proc crits explicit", () => {
  const policies = druidSelfEffectsPolicies();
  assert.equal(policies.length, 4);
  assert.equal(policies[0].viperThresholdTiming, "after-hit");
  assert(policies.some((row) => row.viperThresholdTiming === "before-hit"));
  assert(policies.some((row) => row.vitalityTickMs === 5000));
  assert(policies.some((row) => row.dreadmistCrits));
  assert(Object.isFrozen(policies) && policies.every(Object.isFrozen));
});
test("derived receiver deducts health once before invoking self-effects and retains caster opt-in", () => {
  const input = {
    baseline: "familySpells map[string][]*core.Spell\n\tresto.registerKFCAdvancedHealing()",
    policies:
      "\t\t\tunit.RemoveHealth(sim, result.Damage)\n\t\t\tif dead {\n\t\t\t\tunit.InterruptCast(sim)\n\t\t\t}",
    workload:
      "type KFCDruidHealingWorkload struct {\n}\ntype KFCDruidHealingWorkloadResult struct {\n}\n\tpositions := map[int32]KFCDruidFriendlyPosition{}\n|| units[event.RaidIndex] == &healer.Unit ||\ninvalid post-mitigation damage event; caster-damage workloads need separate admission\n\tfor iteration := int32(0);\n\t\toutput.ManaRemainingMean += healer.CurrentMana()\n\toutput.SurvivalRate /= countFloat",
  };
  const output = renderDruidSelfEffects(input);
  assert.equal(output.policies.split("unit.RemoveHealth(sim, result.Damage)").length, 2);
  assert(
    output.policies.indexOf("unit.RemoveHealth") <
      output.policies.indexOf("kfcSelfEffectsAfterDamage"),
  );
  assert(output.workload.includes("!frame.AllowCasterDamage"));
  assert(output.workload.includes("output.SelfEffectsPolicy = &policy"));
  assert.throws(() => renderDruidSelfEffects(output));
});
