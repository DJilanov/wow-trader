import assert from "node:assert/strict";
import { createPriestHealingAssignment } from "./priest-healing-study.mjs";
import {
  assertPaladinHealingPriorityEligibility,
  eligiblePaladinHealingRanks,
} from "./paladin-healing-eligibility.mjs";
import { paladinHealingAssignmentMetrics } from "./paladin-healing-assignment.mjs";

/** Use shared, explicitly synthetic damage schedules and externally scored support.
 * @param {{kind:'tank'|'group'|'burst',durationSeconds:number,damagePerSecond:number}} options
 * @returns {object}
 */
export function createPaladinHealingAssignment(options) {
  const frame = createPriestHealingAssignment(options);
  delete frame.useInnerFocus;
  delete frame.innerFocusMinimumCost;
  delete frame.usePowerInfusion;
  return {
    ...frame,
    schema: "kfc-paladin-healing-workload.v1",
    assignmentScoring: "external-demand-v1",
    requireFullTalentBuild: true,
    allowConditionalSpellCandidates: true,
    rankScaling: {
      schema: "kfc-paladin-rank-sensitivity.v1",
      id: "unscaled-reference",
      kind: "unscaled-reference",
      fullScalingGap: 0,
      coefficientLossPerLevel: 0,
      classProcMode: "unchanged",
    },
    vigilRefundMode: "once-per-cast",
    useDivineFavor: false,
    divineFavorMinimumBaseCost: 300,
    blessingOfLight: {
      schema: "kfc-paladin-blessing-of-light-policy.v1",
      scaling: "full-tooltip-reference",
      multiplierOrder: "before-healing-light",
      assignments: frame.targets.map((target) => ({ raidIndex: target.raidIndex, spellId: 19979 })),
    },
  };
}

/** @param {object} assignment @param {Record<string,number>} fields @param {object} spellPolicy
 * @param {{directSpellId?:number,directMinimumMissingHealth?:number,holyShock?:boolean,lightsVigil?:boolean}} options
 * @returns {object}
 */
export function createPaladinHealingPriorities(assignment, fields, spellPolicy, options = {}) {
  assert.equal(assignment.schema, "kfc-paladin-healing-workload.v1");
  assert.equal(assignment.assignmentScoring, "external-demand-v1");
  assert.equal(assignment.requireFullTalentBuild, true);
  const {
    directSpellId = 10329,
    directMinimumMissingHealth = 400,
    holyShock = Boolean(fields.holyShock),
    lightsVigil = Boolean(fields.lightsVigil),
  } = options;
  for (const flag of [holyShock, lightsVigil]) assert.equal(typeof flag, "boolean");
  assert(!holyShock || fields.holyShock > 0, "Holy Shock talent required");
  assert(
    !lightsVigil || (holyShock && fields.lightsVigil > 0),
    "Light's Vigil requires Holy Shock",
  );
  assert(
    Number.isFinite(directMinimumMissingHealth) &&
      directMinimumMissingHealth >= 0 &&
      directMinimumMissingHealth <= 5000,
  );
  const eligibility = {
    level: 60,
    talents: { holyShock: Boolean(fields.holyShock), lightsVigil: Boolean(fields.lightsVigil) },
    allowConditionalCandidates: true,
  };
  const ranks = eligiblePaladinHealingRanks(spellPolicy, eligibility),
    direct = ranks.find((row) => row.spellId === directSpellId);
  assert(direct && ["holy-light", "flash-of-light"].includes(direct.family));
  const highest = (family) => {
    const candidates = ranks.filter((row) => row.family === family).sort((a, b) => b.rank - a.rank);
    assert(candidates.length > 0, "Missing eligible Paladin healing family");
    return candidates[0].spellId;
  };
  const result = structuredClone(assignment),
    target = result.name.startsWith("synthetic-tank-") ? 1 : -1;
  result.priorities = [];
  const add = (spellId, minimumMissingHealth) =>
    result.priorities.push({ spellId, raidIndex: target, minimumMissingHealth });
  if (lightsVigil) add(highest("lights-vigil"), 600);
  if (holyShock) add(highest("holy-shock"), 600);
  add(directSpellId, directMinimumMissingHealth);
  result.useDivineFavor = Boolean(fields.divineFavor);
  assertPaladinHealingPriorityEligibility(
    spellPolicy,
    result.priorities.map((row) => row.spellId),
    eligibility,
  );
  return result;
}

/** Survival and complete external demand delivery precede support or mana comparisons.
 * @param {object} result @returns {object}
 */
export function summarizePaladinHealingAssignment(result) {
  assert.equal(result.schema, "kfc-paladin-healing-workload-result.v1");
  assert.equal(result.classQualified, false);
  assert.equal(result.publicationAllowed, false);
  const value = paladinHealingAssignmentMetrics(result),
    duration = Number(result.name?.match(/-(\d+)s-/)?.[1]),
    planned = result.plannedIncomingPostMitigationDamage;
  assert(Number.isSafeInteger(duration) && duration >= 30 && duration <= 300);
  assert(typeof planned === "number" && Number.isFinite(planned) && planned >= 0);
  const tolerance = Math.max(1, planned) * 1e-7;
  assert(value.deliveredIncomingDamageMean <= planned + tolerance);
  return {
    ...value,
    feasible:
      value.survivalRate === 1 &&
      Math.abs(value.deliveredIncomingDamageMean - planned) <= tolerance,
    meanMissingHealth: value.missingHealthSecondsMean / duration,
  };
}
