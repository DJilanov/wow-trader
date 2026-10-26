import assert from "node:assert/strict";
import {
  eligiblePaladinHealingRanks,
  assertPaladinHealingPriorityEligibility,
} from "./paladin-healing-eligibility.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

const directFamilies = new Set(["holy-light", "flash-of-light"]);
const fractions = [0.15, 0.3, 0.6];
const sustainThresholds = [0, 400];

function contextFor({ frame, spellPolicy, talents }) {
  assert.equal(frame.schema, "kfc-paladin-healing-workload.v1");
  assert.equal(frame.assignmentScoring, "external-demand-v1");
  assert.equal(frame.requireFullTalentBuild, true);
  assert.equal(frame.allowConditionalSpellCandidates, true);
  assert(Array.isArray(frame.priorities) && frame.priorities.length > 0);
  const eligibility = {
    level: 60,
    talents: { holyShock: Boolean(talents.holyShock), lightsVigil: Boolean(talents.lightsVigil) },
    allowConditionalCandidates: true,
  };
  const ranks = eligiblePaladinHealingRanks(spellPolicy, eligibility),
    byId = new Map(ranks.map((rank) => [rank.spellId, rank]));
  assertPaladinHealingPriorityEligibility(
    spellPolicy,
    frame.priorities.map((row) => row.spellId),
    eligibility,
  );
  const direct = frame.priorities.filter((row) => directFamilies.has(byId.get(row.spellId).family)),
    active = frame.priorities.filter((row) => !directFamilies.has(byId.get(row.spellId).family));
  assert(direct.length > 0);
  const template = direct.at(-1);
  for (const row of direct) {
    assert.equal(row.raidIndex, template.raidIndex);
    assert(
      Object.keys(row).every((key) =>
        ["spellId", "raidIndex", "minimumMissingHealth"].includes(key),
      ),
      "Conditional direct priorities need a separate reviewed policy",
    );
  }
  const damagedIds = new Set(frame.damage.map((row) => row.raidIndex)),
    recipients = frame.targets.filter((row) => damagedIds.has(row.raidIndex));
  assert(recipients.length > 0 && recipients.length === damagedIds.size);
  assert.equal(new Set(recipients.map((row) => row.raidIndex)).size, recipients.length);
  const maximumHealth = recipients[0].maximumHealth;
  assert(Number.isFinite(maximumHealth) && maximumHealth > 0);
  assert(
    recipients.every((row) => row.maximumHealth === maximumHealth),
    "Adaptive fractions require equal recipient health pools",
  );
  assert(template.raidIndex === -1 || damagedIds.has(template.raidIndex));
  const targetIds = new Set(frame.targets.map((row) => row.raidIndex));
  assert(active.every((row) => row.raidIndex === -1 || targetIds.has(row.raidIndex)));
  return { eligibility, ranks, byId, template, active, maximumHealth };
}

function rankPairs(context) {
  const pairs = new Map();
  function add(sustain, recovery) {
    assert(sustain && recovery);
    if (sustain.spellId !== recovery.spellId)
      pairs.set(sustain.spellId + ":" + recovery.spellId, [sustain.spellId, recovery.spellId]);
  }
  const families = [...directFamilies].map((family) =>
    context.ranks.filter((rank) => rank.family === family).toSorted((a, b) => a.rank - b.rank),
  );
  assert(families.every((ranks) => ranks.length > 0));
  for (const ranks of families)
    for (let index = 0; index < ranks.length - 1; index++) {
      add(ranks[index], ranks[index + 1]);
      add(ranks[index], ranks.at(-1));
    }
  for (const sustain of families[0]) add(sustain, families[1].at(-1));
  for (const sustain of families[1]) add(sustain, families[0].at(-1));
  return pairs;
}

/** Adjacent ranks, each lower rank against its family's maximum, and cross-family rescue pairs.
 * This is a declared finite feedback domain, not all possible adaptive rotations.
 * @param {{frame:object,spellPolicy:object,talents:object}} input
 * @returns {Generator<{policyId:string,policy:object}>}
 */
export function* paladinHealingAdaptiveRankPolicies(input) {
  const context = contextFor(input),
    pairs = rankPairs(context);
  for (const [sustainSpellId, recoverySpellId] of pairs.values())
    for (const recoveryHealthFraction of fractions)
      for (const sustainMinimumMissingHealth of sustainThresholds)
        for (const activeOrder of context.active.length
          ? ["active-first", "recovery-first"]
          : ["active-first"]) {
          if (context.maximumHealth * recoveryHealthFraction <= sustainMinimumMissingHealth)
            continue;
          const policy = {
            schema: "kfc-paladin-adaptive-rank-policy.v1",
            sustainSpellId,
            recoverySpellId,
            recoveryHealthFraction,
            sustainMinimumMissingHealth,
            activeOrder,
          };
          yield { policyId: simulationHash(policy), policy };
        }
}

/** Replace only direct-heal priorities while preserving owned active spells and every other input.
 * @param {{frame:object,spellPolicy:object,talents:object,policy:object}} input
 * @returns {object}
 */
export function applyPaladinHealingAdaptiveRankPolicy({ frame, spellPolicy, talents, policy }) {
  const context = contextFor({ frame, spellPolicy, talents });
  assert.deepEqual(Object.keys(policy).sort(), [
    "activeOrder",
    "recoveryHealthFraction",
    "recoverySpellId",
    "schema",
    "sustainMinimumMissingHealth",
    "sustainSpellId",
  ]);
  assert.equal(policy.schema, "kfc-paladin-adaptive-rank-policy.v1");
  for (const id of [policy.sustainSpellId, policy.recoverySpellId])
    assert(
      directFamilies.has(context.byId.get(id)?.family),
      "Adaptive direct rank is not eligible",
    );
  assert.notEqual(policy.sustainSpellId, policy.recoverySpellId);
  assert(
    rankPairs(context).has(policy.sustainSpellId + ":" + policy.recoverySpellId),
    "Rank pair is outside the finite adaptive domain",
  );
  assert(fractions.includes(policy.recoveryHealthFraction));
  assert(sustainThresholds.includes(policy.sustainMinimumMissingHealth));
  assert(["active-first", "recovery-first"].includes(policy.activeOrder));
  assert(context.active.length > 0 || policy.activeOrder === "active-first");
  const recovery = {
      ...context.template,
      spellId: policy.recoverySpellId,
      minimumMissingHealth: context.maximumHealth * policy.recoveryHealthFraction,
    },
    sustain = {
      ...context.template,
      spellId: policy.sustainSpellId,
      minimumMissingHealth: policy.sustainMinimumMissingHealth,
    },
    active = structuredClone(context.active),
    result = structuredClone(frame);
  assert(recovery.minimumMissingHealth > sustain.minimumMissingHealth);
  result.priorities =
    policy.activeOrder === "active-first"
      ? [...active, recovery, sustain]
      : [recovery, ...active, sustain];
  assert(result.priorities.length <= 32);
  assertPaladinHealingPriorityEligibility(
    spellPolicy,
    result.priorities.map((row) => row.spellId),
    context.eligibility,
  );
  return result;
}
