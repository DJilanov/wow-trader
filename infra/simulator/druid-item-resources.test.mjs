import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  extractDruidItemResources,
  druidItemResourcePolicies,
  renderDruidItemResources,
} from "./druid-item-resources.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-item-resources-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "6584c040ee55d1ddcc5f514e937beb9a5558518e9c2bc816e519081b87d84211",
);
const source = JSON.parse(gunzipSync(bytes));

test("current mana items retain their penalties, durations, shared category and separate healing stats", () => {
  const rules = extractDruidItemResources(source);
  assert.deepEqual(
    [
      rules.mindtap.manaPerTick,
      rules.mindtap.ticks,
      rules.mindtap.intellectPenalty,
      rules.mindtap.cooldownMs,
      rules.mindtap.penaltyDurationMs,
    ],
    [125, 10, 60, 420000, 120000],
  );
  assert.deepEqual(
    [
      rules.dormantHeart.healingPower,
      rules.dormantHeart.spellDamage,
      rules.dormantHeart.durationMs,
    ],
    [40, 13, 15000],
  );
  assert.equal(rules.dormantHeart.serverChanceVerified, false);
  assert.equal(rules.energeticRod.offensiveWeavingAdmitted, false);
  assert.equal(rules.publicationAllowed, false);
});

test("changed costs, proc masks, timers and healing payloads reject admission", () => {
  for (const mutate of [
    (row) => {
      row.tables.ItemEffect.find((row) => row.SpellID === 1302205).CoolDownMSec = 120000;
    },
    (row) => {
      row.tables.ItemEffect.find((row) => row.SpellID === 1302205).SpellCategoryID = 0;
    },
    (row) => {
      row.tables.SpellEffect.find((row) => row.SpellID === 1302206).EffectBasePointsF = 0;
    },
    (row) => {
      row.tables.SpellEffect.find((row) => row.SpellID === 1249119).EffectBasePointsF = 13;
    },
    (row) => {
      row.tables.SpellAuraOptions.find((row) => row.SpellID === 1249118).ProcTypeMask = [65536, 0];
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => extractDruidItemResources(changed));
  }
});

test("item policies expose disabled, bounded probability and direct-heal alternatives", () => {
  const policies = druidItemResourcePolicies();
  assert.equal(policies.length, 6);
  assert.deepEqual(
    policies.map((row) => row.dormantHeartProcChance),
    [1, 0, 0.02, 0.05, 0.1, 1],
  );
  assert(policies.some((row) => row.dormantHeartHealingEvents === "direct-heals"));
  assert(Object.isFrozen(policies) && policies.every(Object.isFrozen));
});

test("derived item policies require explicit owned cooldowns and travel through the worker contract", () => {
  const source = {
    baseline: "selfEffects *kfcDruidSelfEffects\n\tresto.registerKFCSelfEffects()",
    workload:
      "type KFCDruidHealingWorkload struct {\n}\ntype KFCDruidHealingWorkloadResult struct {\n}\n\tpositions := map[int32]KFCDruidFriendlyPosition{}\n\toutput.CasterDamageEnabled = frame.AllowCasterDamage",
    cooldowns: "reviewed := policy.SpellID == 15604 || policy.SpellID == 20554",
  };
  const output = renderDruidItemResources(source);
  assert(output.baseline.includes("resto.registerKFCItemResources()"));
  assert(output.workload.includes("ConfigureKFCDruidItemEffects"));
  assert(output.workload.includes("output.ItemEffectsPolicy = &policy"));
  assert(output.cooldowns.includes("policy.SpellID == 1302205"));
  assert.throws(() => renderDruidItemResources(output));
});
