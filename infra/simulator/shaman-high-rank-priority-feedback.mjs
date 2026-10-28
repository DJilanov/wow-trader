import assert from "node:assert/strict";
import { eligibleShamanHealingActions } from "./shaman-healing-eligibility.mjs";
import { createShamanHealingPriorities } from "./shaman-healing-study.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

function eligibleDirectRanks(spellPolicy, fields) {
  return eligibleShamanHealingActions(spellPolicy, {
    level: 60,
    talents: Object.fromEntries(
      ["riptide", "waterShield", "manaTideTotem", "naturesSwiftness"].map((field) => [
        field,
        Boolean(fields[field]),
      ]),
    ),
    allowConditionalCandidates: true,
  }).filter((rank) => ["healing-wave", "lesser-healing-wave"].includes(rank.family));
}

/** Finite tank-healing rank/triage feedback, with lower-level scaling retained for a separate pass.
 * @param {object} spellPolicy @param {Record<string,number>} fields @returns {object[]}
 */
export function shamanHighRankPriorityCandidates(spellPolicy, fields) {
  const ranks = eligibleDirectRanks(spellPolicy, fields).filter((rank) => rank.requiredLevel >= 20);
  assert.equal(ranks.length, 11);
  const highest = (family) => {
    const rank = ranks.filter((rank) => rank.family === family).sort((a, b) => b.rank - a.rank)[0];
    assert(rank);
    return rank.spellId;
  };
  const candidates = new Map();
  function add(config, incumbent = false) {
    const id = simulationHash(config);
    if (!candidates.has(id))
      candidates.set(id, {
        schema: "kfc-shaman-high-rank-priority.v1",
        id,
        ...config,
        incumbent,
      });
  }
  add(
    {
      directSpellId: highest("healing-wave"),
      directMinimumMissingHealth: 500,
      emergencySpellId: 0,
      emergencyMinimumMissingHealth: 0,
      riptide: Boolean(fields.riptide),
      stream: true,
      tideMinimumMissingMana: 2000,
    },
    true,
  );
  for (const rank of ranks)
    for (const minimum of [200, 600, 1200])
      for (const emergency of [0, highest("healing-wave"), highest("lesser-healing-wave")])
        for (const riptide of fields.riptide ? [false, true] : [false])
          for (const stream of [false, true])
            for (const tideMinimumMissingMana of [1000, 2500])
              add({
                directSpellId: rank.spellId,
                directMinimumMissingHealth: minimum,
                emergencySpellId: emergency,
                emergencyMinimumMissingHealth: emergency ? 3000 : 0,
                riptide,
                stream,
                tideMinimumMissingMana,
              });
  return [...candidates.values()];
}

/** Apply an explicit early emergency heal while retaining the ordinary utility and mana gates.
 * @param {{assignment:object,fields:Record<string,number>,spellPolicy:object,policy:object}} input
 * @returns {object}
 */
export function createShamanHighRankPriorityWorkload({ assignment, fields, spellPolicy, policy }) {
  assert.equal(policy.schema, "kfc-shaman-high-rank-priority.v1");
  assert(assignment.name.startsWith("synthetic-tank-"), "Tank-only priority reference");
  const highRanks = new Set(
    eligibleDirectRanks(spellPolicy, fields)
      .filter((rank) => rank.requiredLevel >= 20)
      .map((rank) => rank.spellId),
  );
  assert(highRanks.has(policy.directSpellId));
  assert(
    Number.isFinite(policy.emergencyMinimumMissingHealth) &&
      policy.emergencyMinimumMissingHealth >= 0 &&
      policy.emergencyMinimumMissingHealth <= 1000000,
  );
  assert(
    policy.emergencySpellId
      ? highRanks.has(policy.emergencySpellId) && policy.emergencyMinimumMissingHealth > 0
      : policy.emergencyMinimumMissingHealth === 0,
  );
  const result = createShamanHealingPriorities(assignment, fields, spellPolicy, {
    directSpellId: policy.directSpellId,
    directMinimumMissingHealth: policy.directMinimumMissingHealth,
    riptide: policy.riptide,
    stream: policy.stream,
    tideMinimumMissingMana: policy.tideMinimumMissingMana,
  });
  if (policy.emergencySpellId)
    result.priorities.unshift({
      spellId: policy.emergencySpellId,
      raidIndex: 1,
      minimumMissingHealth: policy.emergencyMinimumMissingHealth,
    });
  return result;
}
