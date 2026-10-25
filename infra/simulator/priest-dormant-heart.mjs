import assert from "node:assert/strict";
import { extractDormantHeartFamily } from "./dormant-heart-family.mjs";

/** @param {{implementation:string,actor:string,workload:string,evidence:object}} source
 * @returns {{implementation:string,actor:string,workload:string,rules:object}}
 */
export function renderPriestDormantHeart(source) {
  const rules = extractDormantHeartFamily(source.evidence);
  assert.equal(rules.families.priest, "greater-heal");
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  const implementation = once(
    source.implementation,
    "// KFC_PRIEST_HEART_VALUES",
    [
      `const kfcPriestHeartItemID = ${rules.itemId}`,
      `const kfcPriestHeartHealingPower = ${rules.healingPower}`,
      `const kfcPriestHeartSpellDamage = ${rules.spellDamage}`,
      `const kfcPriestHeartDurationMs = ${rules.durationMs}`,
    ].join("\n"),
  );
  let actor = once(
    source.actor,
    "Options *proto.HealingPriest_Options",
    "Options *proto.HealingPriest_Options\n\titemEffects *kfcPriestItemEffects",
  );
  actor = once(
    actor,
    "hpriest.Priest.RegisterHealingSpells()",
    "hpriest.Priest.RegisterHealingSpells()\n\thpriest.registerKFCHealingItemEffects()",
  );
  let workload = once(
    source.workload,
    "type KFCHealingWorkload struct {",
    'type KFCHealingWorkload struct {\n\tItemEffectsPolicy *KFCHealingItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCHealingWorkloadResult struct {",
    'type KFCHealingWorkloadResult struct {\n\tItemEffectsPolicy *KFCHealingItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "\tif frame.RankScaling != nil {\n\t\tif err = healer.ConfigureKFCHealingRankScaling",
    "\tif frame.ItemEffectsPolicy != nil {\n\t\tif err = healer.ConfigureKFCHealingItemEffects(*frame.ItemEffectsPolicy); err != nil { return nil, err }\n\t}\n\tif frame.RankScaling != nil {\n\t\tif err = healer.ConfigureKFCHealingRankScaling",
  );
  workload = once(
    workload,
    "output = &KFCHealingWorkloadResult{",
    "output = &KFCHealingWorkloadResult{ItemEffectsPolicy: healer.kfcItemEffectsPolicyEcho(), ",
  );
  return { implementation, actor, workload, rules };
}

/** @returns {ReadonlyArray<Readonly<object>>} */
export function priestDormantHeartPolicies() {
  return Object.freeze(
    [1, 0, 0.02, 0.05, 0.1]
      .map((chance) =>
        Object.freeze({
          schema: "kfc-priest-item-effects-policy.v1",
          id: chance === 1 ? "heart-client-literal" : "heart-rate-" + chance,
          dormantHeartProcChance: chance,
          dormantHeartHealingEvents: "completed-casts",
        }),
      )
      .concat([
        Object.freeze({
          schema: "kfc-priest-item-effects-policy.v1",
          id: "heart-direct-heals",
          dormantHeartProcChance: 1,
          dormantHeartHealingEvents: "direct-heals",
        }),
      ]),
  );
}
