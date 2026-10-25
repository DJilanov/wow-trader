import assert from "node:assert/strict";
import { createPaladinHealingFeedbackWorkload } from "./paladin-healing-feedback-v2.mjs";

const allowed = {
  flask: [0, 1, 2, 3, 4],
  food: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11],
  mainHandImbue: [0, 16, 20],
  defaultPotion: [0, 5],
  defaultConjured: [0, 2],
};

/** Supported pre-raid references; raid-reward food and raid-reputation oils stay excluded.
 * @returns {Generator<{consumes:Record<string,number>,manaRegenElixir:number}>}
 */
export function* paladinHealingConsumeCandidates() {
  for (const flask of allowed.flask)
    for (const food of allowed.food)
      for (const mainHandImbue of allowed.mainHandImbue)
        for (const defaultPotion of allowed.defaultPotion)
          for (const defaultConjured of allowed.defaultConjured)
            for (const manaRegenElixir of [0, 2])
              yield {
                consumes: { flask, food, mainHandImbue, defaultPotion, defaultConjured },
                manaRegenElixir,
              };
}

/** Match explicit resource actions to the selected consumables without altering item ownership.
 * @param {object} input @param {{consumes:Record<string,number>,manaRegenElixir:number}} choice
 * @returns {object}
 */
export function createPaladinHealingConsumeWorkload(input, choice) {
  assert(choice && typeof choice === "object");
  assert([0, 2].includes(choice.manaRegenElixir));
  assert(choice.consumes && typeof choice.consumes === "object");
  assert.deepEqual(Object.keys(choice.consumes).sort(), Object.keys(allowed).sort());
  for (const [field, values] of Object.entries(allowed))
    assert(values.includes(choice.consumes[field]), "Unreviewed Paladin consume: " + field);
  const workload = createPaladinHealingFeedbackWorkload(input);
  workload.cooldowns = workload.cooldowns.filter(
    (row) =>
      (row.itemId !== 13444 || choice.consumes.defaultPotion === 5) &&
      (row.itemId !== 12662 || choice.consumes.defaultConjured === 2),
  );
  return workload;
}
