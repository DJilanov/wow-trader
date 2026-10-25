import assert from "node:assert/strict";
import { decodeTalents, talentNeighbors, talentProblem } from "./talent-search.mjs";
import {
  eligibleDruidHealingRanks,
  assertDruidHealingSpellEligibility,
} from "./druid-healing-spell-policy.mjs";
import { createDruidHealingPriorities } from "./druid-healing-study.mjs";

/** @param {object[]} trees @param {string} talentsString @returns {Record<string,number>} */
export function druidHealingTalentFields(trees, talentsString) {
  const points = decodeTalents(trees, talentsString);
  assert.equal(talentProblem(trees, points), "");
  return Object.fromEntries(
    trees.flatMap((tree, ti) => tree.talents.map((talent, i) => [talent.fieldName, points[ti][i]])),
  );
}

/** @param {object[]} trees @param {{spec:string,talentsString:string}} state @returns {object[]} */
export function druidHealingTalentNeighbors(trees, state) {
  const anchors = {
    "wild-growth": { wildGrowth: 1 },
    "splendor-wild-growth": { wildGrowth: 1, naturesSplendor: 1 },
    "natures-grace": { naturesGrace: 1 },
  }[state.spec];
  assert(anchors, "Unknown Druid healing archetype");
  return [state.talentsString, ...talentNeighbors(trees, state.talentsString, anchors)].map(
    (talentsString) => ({
      spec: state.spec,
      talentsString,
      fields: druidHealingTalentFields(trees, talentsString),
    }),
  );
}

/** @param {object} policy @param {Record<string,number>} fields @returns {object[]} */
export function druidHealingFeedbackRanks(policy, fields) {
  return eligibleDruidHealingRanks(policy, {
    level: 60,
    talents: { swiftmend: Boolean(fields.swiftmend), wildGrowth: Boolean(fields.wildGrowth) },
    allowConditionalCandidates: true,
  });
}

/** @param {object} assignment @param {Record<string,number>} fields @param {object} policy @param {object} spellPolicy @returns {object} */
export function createDruidHealingFeedbackWorkload(assignment, fields, policy, spellPolicy) {
  assert(policy.ranks && typeof policy.ranks === "object" && !Array.isArray(policy.ranks));
  const result = createDruidHealingPriorities(assignment, fields, spellPolicy, policy),
    eligible = druidHealingFeedbackRanks(spellPolicy, fields),
    byId = new Map(eligible.map((row) => [row.spellId, row])),
    support = new Set(result.priorities.slice(0, -1).map((row) => byId.get(row.spellId).family));
  for (const [family, id] of Object.entries(policy.ranks)) {
    assert(support.has(family), "Unused or unavailable support-rank family");
    assert.equal(byId.get(id)?.family, family, "Support rank family or acquisition mismatch");
  }
  for (const row of result.priorities.slice(0, -1)) {
    const family = byId.get(row.spellId).family;
    if (policy.ranks[family]) row.spellId = policy.ranks[family];
  }
  assertDruidHealingSpellEligibility(
    spellPolicy,
    result.priorities.map((row) => row.spellId),
    {
      level: 60,
      talents: { swiftmend: Boolean(fields.swiftmend), wildGrowth: Boolean(fields.wildGrowth) },
      allowConditionalCandidates: true,
    },
  );
  return result;
}

/** Coarse priorities retain every direct downrank; no fine timing search.
 * @param {object} spellPolicy @param {Record<string,number>} fields @param {'tank'|'group'|'burst'} kind @returns {object[]}
 */
export function druidHealingPriorityCandidates(spellPolicy, fields, kind) {
  assert(["tank", "group", "burst"].includes(kind));
  const policies = [];
  for (const rank of druidHealingFeedbackRanks(spellPolicy, fields).filter((row) =>
    ["healing-touch", "regrowth"].includes(row.family),
  ))
    for (const rejuvenation of [false, true])
      for (const special of [false, true])
        for (const directMinimumMissingHealth of [0, 400, 1200, 2400])
          policies.push({
            directSpellId: rank.spellId,
            directMinimumMissingHealth,
            rejuvenation,
            wildGrowth: special && Boolean(fields.wildGrowth),
            tranquility: special && kind === "burst",
            ranks: {},
          });
  return [...new Map(policies.map((policy) => [JSON.stringify(policy), policy])).values()];
}

/** @param {object} spellPolicy @param {Record<string,number>} fields @param {object} frame @param {object} policy @returns {object[]} */
export function druidHealingSupportRankNeighbors(spellPolicy, fields, frame, policy) {
  const eligible = druidHealingFeedbackRanks(spellPolicy, fields),
    byId = new Map(eligible.map((row) => [row.spellId, row])),
    families = new Set(frame.priorities.slice(0, -1).map((row) => byId.get(row.spellId)?.family)),
    results = [structuredClone(policy)];
  for (const family of families) {
    assert(family);
    for (const rank of eligible.filter((row) => row.family === family))
      results.push({
        ...structuredClone(policy),
        ranks: { ...policy.ranks, [family]: rank.spellId },
      });
  }
  return results;
}
