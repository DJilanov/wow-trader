import assert from "node:assert/strict";
import { eligibleShamanHealingActions } from "./shaman-healing-eligibility.mjs";
import { createShamanHealingPriorities } from "./shaman-healing-study.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

function ranksFor(spellPolicy, fields) {
  return eligibleShamanHealingActions(spellPolicy, {
    level: 60,
    talents: Object.fromEntries(
      ["riptide", "waterShield", "manaTideTotem", "naturesSwiftness"].map((field) => [
        field,
        Boolean(fields[field]),
      ]),
    ),
    allowConditionalCandidates: true,
  });
}

/** Finite group/burst rank and triage bank. Low-level direct ranks remain in the source domain.
 * @param {object} spellPolicy @param {Record<string,number>} fields @returns {object[]}
 */
export function shamanGroupPriorityCandidates(spellPolicy, fields) {
  const eligible = ranksFor(spellPolicy, fields);
  const direct = eligible.filter(
    (rank) =>
      rank.requiredLevel >= 20 && ["healing-wave", "lesser-healing-wave"].includes(rank.family),
  );
  const chain = eligible.filter((rank) => rank.family === "chain-heal");
  assert.equal(direct.length, 11);
  assert.equal(chain.length, 3);
  const highest = (family) => {
    const rank = eligible.filter((row) => row.family === family).sort((a, b) => b.rank - a.rank)[0];
    assert(rank);
    return rank.spellId;
  };
  const candidates = new Map();
  const add = (config, incumbent = false) => {
    const id = simulationHash(config);
    if (!candidates.has(id))
      candidates.set(id, {
        schema: "kfc-shaman-group-priority.v1",
        id,
        ...config,
        incumbent,
      });
  };
  add(
    {
      directSpellId: highest("healing-wave"),
      directMinimumMissingHealth: 500,
      chainSpellId: highest("chain-heal"),
      chainMinimumMissingHealth: 300,
      chainMinimumInjuredTargets: 2,
      chainMinimumGroupMissingHealth: 1200,
      riptide: Boolean(fields.riptide),
      stream: true,
      tideMinimumMissingMana: 2000,
    },
    true,
  );
  const chains = [
    { chainSpellId: 0, chainMinimumInjuredTargets: 0, chainMinimumGroupMissingHealth: 0 },
    ...chain.flatMap((rank) =>
      [1, 2, 3].flatMap((injured) =>
        [600, 2400].map((missing) => ({
          chainSpellId: rank.spellId,
          chainMinimumInjuredTargets: injured,
          chainMinimumGroupMissingHealth: missing,
        })),
      ),
    ),
  ];
  for (const rank of direct)
    for (const choice of chains)
      for (const minimum of [200, 600])
        for (const riptide of fields.riptide ? [false, true] : [false])
          for (const stream of [false, true])
            for (const tideMinimumMissingMana of [1000, 2500])
              add({
                directSpellId: rank.spellId,
                directMinimumMissingHealth: minimum,
                ...choice,
                chainMinimumMissingHealth: choice.chainSpellId ? 300 : 0,
                riptide,
                stream,
                tideMinimumMissingMana,
              });
  return [...candidates.values()];
}

/** Keep the actual incoming assignment and source-owned utility gates while changing priorities.
 * @param {{assignment:object,fields:Record<string,number>,spellPolicy:object,policy:object}} input
 * @returns {object}
 */
export function createShamanGroupPriorityWorkload({ assignment, fields, spellPolicy, policy }) {
  assert.equal(policy.schema, "kfc-shaman-group-priority.v1");
  assert(
    assignment.name.startsWith("synthetic-group-") ||
      assignment.name.startsWith("synthetic-burst-"),
    "Group/burst-only priority bank",
  );
  const eligible = ranksFor(spellPolicy, fields);
  assert(
    eligible.some(
      (rank) =>
        rank.spellId === policy.directSpellId &&
        rank.requiredLevel >= 20 &&
        ["healing-wave", "lesser-healing-wave"].includes(rank.family),
    ),
    "Direct rank needs a separate low-level scaling review",
  );
  return createShamanHealingPriorities(assignment, fields, spellPolicy, {
    directSpellId: policy.directSpellId,
    directMinimumMissingHealth: policy.directMinimumMissingHealth,
    chainSpellId: policy.chainSpellId,
    chainMinimumMissingHealth: policy.chainMinimumMissingHealth,
    chainMinimumInjuredTargets: policy.chainMinimumInjuredTargets,
    chainMinimumGroupMissingHealth: policy.chainMinimumGroupMissingHealth,
    riptide: policy.riptide,
    stream: policy.stream,
    tideMinimumMissingMana: policy.tideMinimumMissingMana,
  });
}
