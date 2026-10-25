import assert from "node:assert/strict";
import { extractDormantHeartFamily } from "./dormant-heart-family.mjs";
import { extractDruidItemResources } from "./druid-item-resources.mjs";
import { extractDruidStudyCooldownRules } from "./druid-study-cooldowns.mjs";
import { extractPaladinHealingBaseline } from "./paladin-healing-model.mjs";
import { priestDormantHeartPolicies } from "./priest-dormant-heart.mjs";

/** Derive Paladin-owned effects from captured shared payloads and registered class ranks.
 * @param {{heartSource:string,resourceSource:string,actor:string,workload:string,cooldowns:string,common:string,familyEvidence:object,resourceEvidence:object,serenityEvidence:object,rankEvidence:object}} input
 * @returns {{heart:string,resources:string,actor:string,workload:string,cooldowns:string,rules:object}}
 */
export function renderPaladinHealingItems(input) {
  const family = extractDormantHeartFamily(input.familyEvidence),
    resources = extractDruidItemResources(input.resourceEvidence),
    serenity = extractDruidStudyCooldownRules(input.serenityEvidence, input.common),
    ranks = extractPaladinHealingBaseline(input.rankEvidence),
    lightIds = ranks.ranks
      .filter((rank) => rank.family === family.families.paladin)
      .map((rank) => rank.id);
  assert.equal(ranks.sourceBuild, 70532);
  assert.equal(lightIds.length, 9);
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  let heart = once(input.heartSource, "package healing", "package holy");
  heart = once(
    heart,
    "// KFC_PRIEST_HEART_VALUES",
    [
      `const kfcPaladinHeartItemID = ${family.itemId}`,
      `const kfcPaladinHeartHealingPower = ${family.healingPower}`,
      `const kfcPaladinHeartSpellDamage = ${family.spellDamage}`,
      `const kfcPaladinHeartDurationMs = ${family.durationMs}`,
      `var kfcPaladinHeartLightIDs = map[int32]bool{${lightIds.map((id) => `${id}:true`).join(",")}}`,
    ].join("\n"),
  );
  heart = heart
    .replaceAll("*HealingPriest", "*HolyPaladin")
    .replaceAll("KFCHealingItemEffectsPolicy", "KFCPaladinHealingItemEffectsPolicy")
    .replaceAll("ConfigureKFCHealingItemEffects", "ConfigureKFCPaladinHealingItemEffects")
    .replaceAll("Priest", "Paladin")
    .replaceAll("priest", "paladin");
  heart = once(
    heart,
    "for _, candidate := range healer.GreaterHeal {",
    "for id := range kfcPaladinHeartLightIDs {\n\t\t\tcandidate := healer.GetSpell(core.ActionID{SpellID:id})",
  );
  assert(!heart.includes("Priest") && !heart.includes("GreaterHeal"));
  const anchor = "\tif !owned[18371] {";
  assert.equal(input.resourceSource.split(anchor).length, 2);
  let tail = input.resourceSource
    .slice(input.resourceSource.indexOf(anchor))
    .replaceAll("resto", "healer")
    .replaceAll("*RestorationDruid", "*HolyPaladin")
    .replaceAll("Druid Tapped Mind", "Paladin Tapped Mind")
    .replaceAll("healer.kfcSelfEffectsAlive()", "(healer.CurrentHealth() > 0)");
  tail = once(tail, "\tstate.hasAny = true\n", "");
  const implementation = `package holy
import (
 "time"
 "github.com/wowsims/classic/sim/core"
 "github.com/wowsims/classic/sim/core/stats"
)
func (healer *HolyPaladin) registerKFCPaladinItemResources() {
 state := healer.itemEffects
 owned := map[int32]bool{}
 for _, item := range healer.Equipment { owned[item.ID] = true }
${tail}`;
  let actor = once(
    input.actor,
    "KFCBlessingOfLight *kfcPaladinBlessingOfLightState }",
    "KFCBlessingOfLight *kfcPaladinBlessingOfLightState; itemEffects *kfcPaladinItemEffects }",
  );
  actor = once(
    actor,
    "holy.registerKFCActiveHealing()",
    "holy.registerKFCActiveHealing()\n\tholy.registerKFCHealingItemEffects()\n\tholy.registerKFCPaladinItemResources()",
  );
  let workload = once(
    input.workload,
    "type KFCPaladinHealingWorkload struct {",
    'type KFCPaladinHealingWorkload struct {\n\tItemEffectsPolicy *KFCPaladinHealingItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCPaladinHealingWorkloadResult struct {",
    'type KFCPaladinHealingWorkloadResult struct {\n\tItemEffectsPolicy *KFCPaladinHealingItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "\tif frame.RankScaling != nil {\n\t\tif err = healer.ConfigureKFCPaladinHealingRankScaling",
    "\tif frame.ItemEffectsPolicy != nil {\n\t\tif err = healer.ConfigureKFCPaladinHealingItemEffects(*frame.ItemEffectsPolicy); err != nil { return nil,err }\n\t}\n\tif frame.RankScaling != nil {\n\t\tif err = healer.ConfigureKFCPaladinHealingRankScaling",
  );
  workload = once(
    workload,
    "output = &KFCPaladinHealingWorkloadResult{",
    "output = &KFCPaladinHealingWorkloadResult{ItemEffectsPolicy: healer.kfcItemEffectsPolicyEcho(), ",
  );
  let cooldowns = once(
    input.cooldowns,
    "reviewed := policy.SpellID == 15604 || policy.SpellID == 20554",
    "reviewed := policy.SpellID == 15604 || policy.SpellID == 20554 || policy.SpellID == 1302205",
  );
  cooldowns = once(
    cooldowns,
    "case 3827, 6149, 4381, 12662, 13443, 13444:",
    "case 3827, 6149, 4381, 12662, 13443, 13444, 272439:",
  );
  return {
    heart,
    resources: implementation,
    actor,
    workload,
    cooldowns,
    rules: {
      schema: "kfc-paladin-healing-items-rules.v1",
      family,
      holyLightIds: lightIds,
      resources,
      serenity,
      scope:
        "Paladin-owned healing effects; historical base stats and server proc behavior remain unverified",
      publicationAllowed: false,
    },
  };
}

/** @returns {ReadonlyArray<Readonly<object>>} */
export function paladinDormantHeartPolicies() {
  return Object.freeze(
    priestDormantHeartPolicies().map((policy) =>
      Object.freeze({ ...policy, schema: "kfc-paladin-item-effects-policy.v1" }),
    ),
  );
}
