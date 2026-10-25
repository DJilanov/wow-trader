import assert from "node:assert/strict";
import { createPaladinHealingFeedbackWorkload as createParentWorkload } from "./paladin-healing-feedback.mjs";
import {
  eligiblePaladinHealingRanks,
  assertPaladinHealingPriorityEligibility,
} from "./paladin-healing-eligibility.mjs";

export {
  paladinHealingFeedbackHypotheses,
  paladinHealingPriorityCandidates,
} from "./paladin-healing-feedback.mjs";

function ranksFor(spellPolicy, fields) {
  return eligiblePaladinHealingRanks(spellPolicy, {
    level: 60,
    talents: { holyShock: Boolean(fields.holyShock), lightsVigil: Boolean(fields.lightsVigil) },
    allowConditionalCandidates: true,
  });
}

/** Preserve basic feedback while supporting legal no-Favor talents and active-heal downranks.
 * @param {object} input @returns {object}
 */
export function createPaladinHealingFeedbackWorkload(input) {
  const frame = createParentWorkload(input);
  if (!frame.useDivineFavor) frame.divineFavorMinimumBaseCost = 0;
  const overrides = input.policy.ranks ?? {};
  assert(overrides && typeof overrides === "object" && !Array.isArray(overrides));
  const byId = new Map(ranksFor(input.spellPolicy, input.fields).map((row) => [row.spellId, row])),
    used = new Set(frame.priorities.slice(0, -1).map((row) => byId.get(row.spellId)?.family));
  for (const [family, spellId] of Object.entries(overrides)) {
    assert(
      ["holy-shock", "lights-vigil"].includes(family) && used.has(family),
      "Unused active healing rank override",
    );
    assert.equal(
      byId.get(spellId)?.family,
      family,
      "Active healing rank is ineligible or from the wrong family",
    );
  }
  for (const row of frame.priorities.slice(0, -1)) {
    const replacement = overrides[byId.get(row.spellId).family];
    if (replacement !== undefined) row.spellId = replacement;
  }
  assertPaladinHealingPriorityEligibility(
    input.spellPolicy,
    frame.priorities.map((row) => row.spellId),
    {
      level: 60,
      talents: {
        holyShock: Boolean(input.fields.holyShock),
        lightsVigil: Boolean(input.fields.lightsVigil),
      },
      allowConditionalCandidates: true,
    },
  );
  return frame;
}

/** Retain the current active ranks and every eligible single-family downrank alternative.
 * @param {object} spellPolicy @param {Record<string,number>} fields @param {object} policy
 * @returns {object[]}
 */
export function paladinHealingSupportRankNeighbors(spellPolicy, fields, policy) {
  const active = new Set([
    ...(policy.holyShock ? ["holy-shock"] : []),
    ...(policy.lightsVigil ? ["lights-vigil"] : []),
  ]);
  return [
    structuredClone(policy),
    ...ranksFor(spellPolicy, fields)
      .filter((row) => active.has(row.family))
      .map((row) => ({
        ...structuredClone(policy),
        ranks: { ...policy.ranks, [row.family]: row.spellId },
      })),
  ];
}

/** Remove unavailable active priorities when a legal talent neighbor changes ownership.
 * @param {object} spellPolicy @param {Record<string,number>} fields @param {object} policy
 * @returns {object}
 */
export function paladinHealingCompatiblePriority(spellPolicy, fields, policy) {
  const next = structuredClone(policy);
  next.holyShock = Boolean(next.holyShock && fields.holyShock);
  next.lightsVigil = Boolean(next.lightsVigil && next.holyShock && fields.lightsVigil);
  next.maintainVigil = Boolean(next.maintainVigil && next.lightsVigil);
  const eligible = new Map(ranksFor(spellPolicy, fields).map((row) => [row.spellId, row.family]));
  next.ranks = Object.fromEntries(
    Object.entries(next.ranks ?? {}).filter(
      ([family, id]) =>
        eligible.get(id) === family &&
        ((family === "holy-shock" && next.holyShock) ||
          (family === "lights-vigil" && next.lightsVigil)),
    ),
  );
  return next;
}
