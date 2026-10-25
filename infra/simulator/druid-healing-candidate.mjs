import assert from "node:assert/strict";
import { createDruidHealingAssignment } from "./druid-healing-study.mjs";
import { createDruidHealingFeedbackWorkload } from "./druid-healing-feedback.mjs";

/** Build the declared assignment and owned cooldown policy used for finalist checks.
 * @param {{kind:'tank'|'group'|'burst',pressure:number,durationSeconds:number,spread?:boolean,state:object,policy:object,gear:object,consumes:object,hypothesis:object,spellPolicy:object}} input
 * @returns {object}
 */
export function createDruidHealingCandidateWorkload({
  kind,
  pressure,
  durationSeconds,
  spread = false,
  state,
  policy,
  gear,
  consumes,
  hypothesis,
  spellPolicy,
}) {
  assert(Array.isArray(gear.items) && gear.items.length === 17);
  const frame = createDruidHealingFeedbackWorkload(
    createDruidHealingAssignment({ kind, durationSeconds, damagePerSecond: pressure, spread }),
    state.fields,
    policy,
    spellPolicy,
  );
  for (const key of ["research", "equipmentPolicy", "itemEffectsPolicy", "legacyItemsPolicy"]) {
    assert(hypothesis[key] && typeof hypothesis[key] === "object", "Missing declared " + key);
    frame[key] = structuredClone(hypothesis[key]);
  }
  if (hypothesis.healingPolicy) frame.healingPolicy = structuredClone(hypothesis.healingPolicy);
  frame.cooldowns = [{ itemId: 13444, minimumMissingMana: 3000, requireHealingDemand: true }];
  for (const [itemId, selector, action, missing] of [
    [11819, "spellId", 15604, 630],
    [18371, "spellId", 1302205, 1250],
    [272439, "itemId", 272439, 0],
    [13143, "spellId", 17252, 22],
  ]) {
    if (!gear.items.some((row) => row.id === itemId)) continue;
    frame.cooldowns.push({
      [selector]: action,
      ...(missing ? { minimumMissingMana: missing } : {}),
      requireHealingDemand: true,
    });
  }
  if (consumes.defaultConjured === 2)
    frame.cooldowns.push({
      itemId: 12662,
      minimumMissingMana: 1500,
      requireHealingDemand: true,
    });
  return frame;
}
