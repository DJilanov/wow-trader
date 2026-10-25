import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createPaladinHealingOptionWorkload } from "./paladin-healing-option-workload.mjs";
import { paladinHealingFeedbackHypotheses } from "./paladin-healing-feedback.mjs";
import {
  paladinHealingResourceOrders,
  orderPaladinHealingResources,
} from "./paladin-healing-resource-order.mjs";
import { assertPaladinHealingPriorityEligibility } from "./paladin-healing-eligibility.mjs";

/** Recover a measured canonical controller without discarding its actual ranks or resource ordering.
 * The caller validates the full talent string and then verifies the reconstructed packet/frame.
 * @param {{player:object,workload:object,fields:Record<string,number>,spellPolicy:object,items:Map<number,object>}} input
 * @returns {object}
 */
export function recoverPaladinHealingPlan({ player, workload, fields, spellPolicy, items }) {
  assert.equal(player.class, 4);
  assert.equal(player.spec?.oneofKind, "holyPaladin");
  assert.equal(player.bonusStats, undefined, "Evidence cannot invent bonus statistics");
  assert.equal(workload.schema, "kfc-paladin-healing-workload.v1");
  assert.equal(workload.assignmentScoring, "external-demand-v1");
  assert.equal(workload.requireFullTalentBuild, true);
  assert.equal(
    Object.values(fields).reduce((sum, rank) => sum + rank, 0),
    51,
  );
  const matched = /^synthetic-(tank|group|burst)-(180|300)s-([0-9]+)dps$/.exec(workload.name);
  assert(matched, "Unsupported measured assignment");
  const kind = matched[1],
    durationSeconds = Number(matched[2]),
    damagePerSecond = Number(matched[3]);
  assert(Array.isArray(player.equipment?.items) && player.equipment.items.length === 17);
  const gear = {
    items: player.equipment.items.map((item) => {
      for (const [key, value] of Object.entries(item))
        if (!["id", "enchant"].includes(key))
          assert(
            value === 0 ||
              value === false ||
              value === "" ||
              value === undefined ||
              (Array.isArray(value) && value.length === 0),
            "Unsupported measured equipment property: " + key,
          );
      return { id: item.id ?? 0, ...(item.enchant ? { enchant: item.enchant } : {}) };
    }),
  };
  assertPaladinHealingPriorityEligibility(
    spellPolicy,
    workload.priorities.map((entry) => entry.spellId),
    {
      level: 60,
      talents: { holyShock: Boolean(fields.holyShock), lightsVigil: Boolean(fields.lightsVigil) },
      allowConditionalCandidates: true,
    },
  );
  const priorities = workload.priorities.map((entry) => ({
      ...entry,
      family: spellPolicy.ranks.find((rank) => rank.spellId === entry.spellId)?.family,
    })),
    direct = priorities.filter((entry) => ["holy-light", "flash-of-light"].includes(entry.family)),
    shocks = priorities.filter((entry) => entry.family === "holy-shock"),
    vigils = priorities.filter((entry) => entry.family === "lights-vigil");
  assert.equal(direct.length, 1, "Measured plan must have one direct fallback");
  assert(shocks.length <= 1 && vigils.length <= 1);
  assert.equal(direct[0].spellId, priorities.at(-1).spellId);
  assert.equal(priorities.length, direct.length + shocks.length + vigils.length);
  assert(priorities.every((entry) => entry.raidIndex === (kind === "tank" ? 1 : -1)));
  const shock = shocks[0],
    vigil = vigils[0],
    rawConsumes = player.consumes;
  assert(rawConsumes, "Missing measured consumables");
  const consumes = Object.fromEntries(
      ["flask", "food", "mainHandImbue", "defaultPotion", "defaultConjured"].map((field) => [
        field,
        rawConsumes[field] ?? 0,
      ]),
    ),
    manaRegenElixir = rawConsumes.manaRegenElixir ?? 0,
    alcohol = rawConsumes.alcohol ?? 0,
    utilityItems = [4381, 18637, 4262, 8346, 11808],
    ownsUtility = gear.items.some((item) => utilityItems.includes(item.id)),
    usesUtility = workload.cooldowns.some((entry) => utilityItems.includes(entry.itemId)),
    option = {
      state: {
        id: "recovered-training-plan",
        talentsString: player.talentsString,
        fields: structuredClone(fields),
      },
      policy: {
        directSpellId: direct[0].spellId,
        directMinimumMissingHealth: direct[0].minimumMissingHealth,
        holyShock: Boolean(shock),
        lightsVigil: Boolean(vigil),
        maintainVigil: Boolean(vigil?.maintainVigil),
        ranks: Object.fromEntries(
          [...shocks, ...vigils].map((entry) => [entry.family, entry.spellId]),
        ),
      },
      gear,
      consumes,
      manaRegenElixir,
      alcohol,
      useUtilities: usesUtility || !ownsUtility,
      requireVigil: Boolean(shock?.requireVigil),
      favorMinimumBaseCost: workload.useDivineFavor ? workload.divineFavorMinimumBaseCost : 0,
      minimumPartyTargets: vigil?.minimumPartyTargets ?? 0,
      minimumPartyMissingHealth: vigil?.minimumPartyMissingHealth ?? 0,
      resourceOrder: "as-declared",
    },
    base = createPaladinHealingOptionWorkload({
      option,
      kind,
      durationSeconds,
      damagePerSecond,
      spellPolicy,
      hypothesis: paladinHealingFeedbackHypotheses()[0],
      items,
    }),
    resourceOrder = paladinHealingResourceOrders.find((policy) =>
      isDeepStrictEqual(orderPaladinHealingResources(base.cooldowns, policy), workload.cooldowns),
    );
  assert(resourceOrder, "Measured resource actions cannot be reconstructed");
  option.resourceOrder = resourceOrder;
  return { option, kind, durationSeconds, damagePerSecond };
}
