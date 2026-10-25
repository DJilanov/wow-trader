import assert from "node:assert/strict";
import {
  decodeTalents,
  talentNeighbors,
  talentProblem,
  talentsFromFields,
} from "./talent-search.mjs";
import {
  eligiblePriestHealingRanks,
  assertPriestHealingPriorityEligibility,
} from "./healer-spell-eligibility.mjs";
import { createPriestHealingPriorities } from "./priest-healing-study.mjs";

/** @param {object[]} trees @param {string} talentsString @returns {Record<string,number>} */
export function priestHealingTalentFields(trees, talentsString) {
  const points = decodeTalents(trees, talentsString);
  assert.equal(talentProblem(trees, points), "");
  return Object.fromEntries(
    trees.flatMap((tree, ti) => tree.talents.map((t, i) => [t.fieldName, points[ti][i]])),
  );
}

/** Counterexamples to assuming the two capstones cover all useful healing builds.
 * @param {object[]} trees @param {object[]} seeds @returns {object[]}
 */
export function priestHealingHybridSeeds(trees, seeds) {
  const holy = seeds.find((s) => s.spec === "holy"),
    disc = seeds.find((s) => s.spec === "discipline");
  assert(holy && disc);
  const penanceHoly = {
    ...holy.fields,
    prayerOfMending: 0,
    spiritOfRedemption: 0,
    litanyOfLight: 0,
    soulWarding: 1,
    penance: 1,
    renewedHope: 1,
  };
  const aegisGuidance = { ...disc.fields, powerInfusion: 0, renewedHope: 3, spiritualGuidance: 3 };
  return [
    { spec: "penance-holy", fields: penanceHoly },
    { spec: "aegis-guidance", fields: aegisGuidance },
  ].map((s) => ({ ...s, talentsString: talentsFromFields(trees, s.fields) }));
}

/** @param {object[]} trees @param {{spec:string,talentsString:string}} state @returns {object[]} */
export function priestHealingTalentNeighbors(trees, state) {
  const anchors = {
    holy: { prayerOfMending: 1 },
    discipline: { powerInfusion: 1 },
    "penance-holy": { penance: 1, spiritualGuidance: 5, spiritualHealing: 3 },
    "aegis-guidance": { divineAegis: 3, spiritualGuidance: 3 },
  }[state.spec];
  assert(anchors, "Unknown Priest healing archetype");
  return [state.talentsString, ...talentNeighbors(trees, state.talentsString, anchors)].map(
    (talentsString) => ({
      spec: state.spec,
      talentsString,
      fields: priestHealingTalentFields(trees, talentsString),
    }),
  );
}

/** @param {object} spellPolicy @param {Record<string,number>} fields @returns {object[]} */
export function priestHealingFeedbackRanks(spellPolicy, fields) {
  const talents = {};
  for (const key of ["bindingHeal", "penance", "prayerOfMending", "holyNova"])
    talents[key] = Boolean(fields[key]);
  return eligiblePriestHealingRanks(spellPolicy, {
    level: 60,
    talents,
    allowConditionalCandidates: true,
  });
}

/** @param {object} assignment @param {Record<string,number>} fields @param {object} policy @param {object} spellPolicy @returns {object} */
export function createPriestHealingFeedbackWorkload(assignment, fields, policy, spellPolicy) {
  const frame = createPriestHealingPriorities(assignment, fields, policy),
    eligible = priestHealingFeedbackRanks(spellPolicy, fields),
    byId = new Map(eligible.map((r) => [r.spellId, r]));
  const direct = byId.get(policy.directSpellId);
  assert(direct, "Ineligible direct healing rank");
  assert(policy.ranks && typeof policy.ranks === "object" && !Array.isArray(policy.ranks));
  for (const [family, id] of Object.entries(policy.ranks))
    assert.equal(byId.get(id)?.family, family, "Rank override family or acquisition mismatch");
  assert(
    Number.isFinite(policy.directMinimumMissingHealth) &&
      policy.directMinimumMissingHealth >= 0 &&
      policy.directMinimumMissingHealth <= 5000,
  );
  const directIndex = frame.priorities.length - 1;
  for (const [index, priority] of frame.priorities.entries()) {
    const rank = byId.get(priority.spellId);
    assert(rank);
    if (index === directIndex) priority.minimumMissingHealth = policy.directMinimumMissingHealth;
    else if (policy.ranks[rank.family]) priority.spellId = policy.ranks[rank.family];
  }
  const flags = Object.fromEntries(
    ["bindingHeal", "penance", "prayerOfMending", "holyNova"].map((key) => [
      key,
      Boolean(fields[key]),
    ]),
  );
  assertPriestHealingPriorityEligibility(spellPolicy, frame, {
    level: 60,
    talents: flags,
    allowConditionalCandidates: true,
  });
  return frame;
}

/** Coarse cast thresholds and rank choices; no fine timing search.
 * @param {object} spellPolicy @param {Record<string,number>} fields @param {'tank'|'group'|'burst'} kind @returns {object[]}
 */
export function priestHealingPriorityCandidates(spellPolicy, fields, kind) {
  assert(["tank", "group", "burst"].includes(kind));
  const families = new Set([
    "lesser-heal",
    "heal",
    "greater-heal",
    "flash-heal",
    "binding-heal",
    ...(kind !== "tank" ? ["prayer-of-healing", "holy-nova"] : []),
  ]);
  const direct = priestHealingFeedbackRanks(spellPolicy, fields).filter((r) =>
    families.has(r.family),
  );
  const results = [];
  for (const rank of direct)
    for (const shield of [false, true])
      for (const renew of [false, true])
        for (const missing of [0, 400, 1200, 2400]) {
          results.push({
            directSpellId: rank.spellId,
            shield,
            renew,
            groupHeal: false,
            directMinimumMissingHealth: missing,
            ranks: {},
          });
        }
  return results;
}

/** Change one present support rank at a time, retaining every acquisition-eligible downrank.
 * @param {object} spellPolicy @param {Record<string,number>} fields @param {object} frame @param {object} policy @returns {object[]}
 */
export function priestHealingSupportRankNeighbors(spellPolicy, fields, frame, policy) {
  const eligible = priestHealingFeedbackRanks(spellPolicy, fields),
    byId = new Map(eligible.map((r) => [r.spellId, r]));
  const families = new Set(
    frame.priorities.slice(0, -1).map((row) => byId.get(row.spellId)?.family),
  );
  const results = [globalThis.structuredClone(policy)];
  for (const family of families) {
    assert(family);
    for (const rank of eligible.filter((r) => r.family === family))
      results.push({
        ...globalThis.structuredClone(policy),
        ranks: { ...policy.ranks, [family]: rank.spellId },
      });
  }
  return results;
}
