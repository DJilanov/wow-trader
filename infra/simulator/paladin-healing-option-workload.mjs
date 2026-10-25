import assert from "node:assert/strict";
import { createPaladinHealingConsumeWorkload } from "./paladin-healing-consume-feedback.mjs";
import { orderPaladinHealingResources } from "./paladin-healing-resource-order.mjs";

/** Reconstruct one selected healing plan at another declared pressure or duration.
 * @param {{option:object,kind:'tank'|'group'|'burst',durationSeconds:number,damagePerSecond:number,spellPolicy:object,hypothesis:object,items:Map<number,object>}} input
 * @returns {object}
 */
export function createPaladinHealingOptionWorkload({
  option,
  kind,
  durationSeconds,
  damagePerSecond,
  spellPolicy,
  hypothesis,
  items,
}) {
  assert(option && typeof option === "object");
  assert.equal(typeof option.useUtilities, "boolean");
  assert.equal(typeof option.requireVigil, "boolean");
  assert(
    !option.requireVigil || (option.policy.holyShock && option.policy.lightsVigil),
    "Marked Shock requires an active Vigil plan",
  );
  assert(
    Number.isFinite(option.favorMinimumBaseCost) &&
      option.favorMinimumBaseCost >= 0 &&
      option.favorMinimumBaseCost <= 10000,
  );
  assert(
    Number.isInteger(option.minimumPartyTargets) &&
      option.minimumPartyTargets >= 0 &&
      option.minimumPartyTargets <= 5,
  );
  assert(
    Number.isFinite(option.minimumPartyMissingHealth) && option.minimumPartyMissingHealth >= 0,
  );
  const frame = createPaladinHealingConsumeWorkload(
    {
      kind,
      durationSeconds,
      damagePerSecond,
      fields: option.state.fields,
      spellPolicy,
      policy: option.policy,
      hypothesis,
      gear: option.gear,
      items,
      useUtilities: option.useUtilities,
    },
    { consumes: option.consumes, manaRegenElixir: option.manaRegenElixir },
  );
  frame.divineFavorMinimumBaseCost = frame.useDivineFavor ? option.favorMinimumBaseCost : 0;
  for (const priority of frame.priorities) {
    const rank = spellPolicy.ranks.find((row) => row.spellId === priority.spellId);
    assert(rank, "Unknown selected healing rank");
    if (rank.family === "holy-shock") priority.requireVigil = option.requireVigil;
    if (rank.family === "lights-vigil") {
      priority.minimumPartyTargets = option.minimumPartyTargets;
      priority.minimumPartyMissingHealth = option.minimumPartyMissingHealth;
    }
  }
  frame.cooldowns = orderPaladinHealingResources(frame.cooldowns, option.resourceOrder);
  return frame;
}
