import assert from "node:assert/strict";
import { extractDruidDragonMark } from "./druid-dragon-mark.mjs";

/** Derive Priest ownership and cooldown admission from the shared captured item payload.
 * @param {{actor:string,cooldowns:string,implementation:string,evidence:object}} input
 * @returns {{actor:string,cooldowns:string,implementation:string,rules:object}}
 */
export function renderPriestDragonMark(input) {
  const shared = extractDruidDragonMark(input.evidence);
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  assert(input.implementation.startsWith("package healing\n"));
  for (const fragment of [
    "func (healer *HealingPriest) registerKFCPriestDragonMark()",
    "item.ID == 13143",
    "healer.AddMana(sim, 22, mana)",
    "spell.SelfShield().Apply(sim, 500)",
    "if !shield.IsActive()",
    "pending.Cancel(sim)",
  ])
    assert(input.implementation.includes(fragment), fragment);
  return {
    actor: once(
      input.actor,
      "hpriest.registerKFCPriestItemResources()",
      "hpriest.registerKFCPriestItemResources()\n\thpriest.registerKFCPriestDragonMark()",
    ),
    cooldowns: once(
      input.cooldowns,
      "policy.SpellID == 1302205",
      "policy.SpellID == 1302205 || policy.SpellID == 17252",
    ),
    implementation: input.implementation,
    rules: {
      ...shared,
      schema: "kfc-priest-dragon-mark-rules.v1",
      scope: "healing-priest-only",
      startsNewClassClock: false,
    },
  };
}
