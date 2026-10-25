import assert from "node:assert/strict";
import { extractDruidItemResources } from "./druid-item-resources.mjs";
import { extractDruidStudyCooldownRules } from "./druid-study-cooldowns.mjs";

/** Reuse the authenticated resource payloads while deriving a separate Priest implementation.
 * @param {{source:string,actor:string,cooldowns:string,evidence:object,serenityEvidence:object,common:string}} input
 * @returns {{implementation:string,actor:string,cooldowns:string,rules:object}}
 */
export function renderPriestItemResources(input) {
  const shared = extractDruidItemResources(input.evidence);
  const serenity = extractDruidStudyCooldownRules(input.serenityEvidence, input.common);
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  const anchor = "\tif !owned[18371] {";
  assert.equal(input.source.split(anchor).length, 2);
  let tail = input.source
    .slice(input.source.indexOf(anchor))
    .replaceAll("resto", "healer")
    .replaceAll("*RestorationDruid", "*HealingPriest")
    .replaceAll("Druid Tapped Mind", "Priest Tapped Mind")
    .replaceAll("healer.kfcSelfEffectsAlive()", "(healer.CurrentHealth() > 0)");
  tail = once(tail, "\tstate.hasAny = true\n", "");
  assert(!tail.includes("resto.") && !tail.includes("RestorationDruid"));
  const implementation = `package healing

import (
 "time"
 "github.com/wowsims/classic/sim/core"
 "github.com/wowsims/classic/sim/core/stats"
)

func (healer *HealingPriest) registerKFCPriestItemResources() {
 state := healer.itemEffects
 owned := map[int32]bool{}
 for _, item := range healer.Equipment { owned[item.ID] = true }
${tail}`;
  const actor = once(
    input.actor,
    "hpriest.registerKFCHealingItemEffects()",
    "hpriest.registerKFCHealingItemEffects()\n\thpriest.registerKFCPriestItemResources()",
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
    implementation,
    actor,
    cooldowns,
    rules: {
      ...shared,
      schema: "kfc-priest-item-resources-rules.v1",
      scope: "healing-priest-only",
      serenity,
      startsNewClassClock: false,
    },
  };
}
