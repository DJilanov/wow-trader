import assert from "node:assert/strict";
import { extractShamanUtilityItemRules } from "./shaman-utility-items.mjs";

/** Integrate the utility controller into the owned actor and ordered damage receiver.
 * @param {{evidence:object,actor:string,damage:string,implementation:string}} input
 * @returns {{rules:object,actor:string,damage:string,implementation:string}}
 */
export function renderShamanUtilityRuntime(input) {
  const rules = extractShamanUtilityItemRules(input.evidence);
  const once = (text, before, after) => {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  };
  assert(
    input.implementation.includes(
      "func (resto *RestorationShaman) UsesKFCOwnedRecombobulators() bool",
    ),
  );
  assert(!input.actor.includes("kfcUtilityItems"));
  let actor = once(
    input.actor,
    "type RestorationShaman struct {",
    "type RestorationShaman struct {\n kfcUtilityItems *kfcShamanUtilityItems",
  );
  actor = once(
    actor,
    "\tresto.registerKFCShamanReactiveSets()",
    "\tresto.registerKFCShamanReactiveSets()\n resto.registerKFCShamanUtilityItems()",
  );
  const damage = once(
    input.damage,
    "\t\t\t\tunit.InterruptCast(sim)",
    "\t\t\t\tunit.InterruptCast(sim)\n if unit == &resto.Unit { resto.kfcShamanUtilityDeath(sim) }",
  );
  return { rules, actor, damage, implementation: input.implementation };
}
