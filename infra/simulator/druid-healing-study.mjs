import assert from "node:assert/strict";
import { decodeTalents, talentsFromFields, talentProblem } from "./talent-search.mjs";
import {
  createPriestHealingAssignment,
  summarizePriestHealingAssignment,
} from "./priest-healing-study.mjs";
import {
  assertDruidHealingSpellEligibility,
  eligibleDruidHealingRanks,
} from "./druid-healing-spell-policy.mjs";

/** @param {object[]} trees @param {object[]} clientTalents @returns {void} */
export function assertDruidHealingTalentLayout(trees, clientTalents) {
  assert.equal(trees.length, 3);
  const resolved = clientTalents.filter((row) => row.layoutResolved);
  assert.equal(resolved.length, 52);
  assert.equal(
    trees.reduce((sum, tree) => sum + tree.talents.length, 0),
    52,
  );
  for (const [treeIndex, tree] of trees.entries()) {
    for (const talent of tree.talents) {
      const matches = resolved.filter(
        (row) =>
          row.treeIndex === treeIndex &&
          row.row === talent.location.rowIdx &&
          row.column === talent.location.colIdx,
      );
      assert.equal(matches.length, 1, talent.fieldName);
      const row = matches[0];
      assert.equal(talent.name, row.name);
      assert.equal(talent.maxPoints, row.maxRanks);
      const prerequisites = row.prerequisiteNodeIds.map((id) => {
        const parent = resolved.find((candidate) => candidate.nodeId === id);
        assert(parent && parent.treeIndex === treeIndex);
        return { rowIdx: parent.row, colIdx: parent.column };
      });
      assert.deepEqual(prerequisites, talent.prereqLocation ? [talent.prereqLocation] : []);
    }
  }
}

/** Legal starting points, not optimized or published builds.
 * @param {object[]} trees @returns {object[]}
 */
export function druidHealingTalentSeeds(trees) {
  const restoration = {
    naturesFocus: 5,
    naturalist: 5,
    reflection: 3,
    giftOfNature: 5,
    giftOfTheEarthmother: 1,
    tranquilSpirit: 3,
    improvedRejuvenation: 3,
    swiftmend: 1,
    naturesSwiftness: 1,
    livingSpirit: 3,
    improvedTranquility: 2,
    improvedRegrowth: 5,
    wildGrowth: 1,
  };
  const seeds = [
    {
      spec: "wild-growth",
      fields: { genesis: 5, moonglow: 3, heartOfTheWild: 5, ...restoration },
    },
    {
      spec: "splendor-wild-growth",
      fields: {
        genesis: 5,
        moonglow: 3,
        naturesMajesty: 2,
        naturesSplendor: 1,
        heartOfTheWild: 5,
        ...restoration,
        tranquilSpirit: 0,
      },
    },
    {
      spec: "natures-grace",
      fields: {
        genesis: 5,
        moonglow: 3,
        improvedMoonfire: 2,
        naturesMajesty: 2,
        naturesReach: 2,
        improvedEntanglingRoots: 3,
        naturesSplendor: 1,
        insectSwarm: 1,
        improvedStarfire: 1,
        naturesGrace: 1,
        heartOfTheWild: 5,
        naturesFocus: 5,
        naturalist: 5,
        reflection: 3,
        giftOfNature: 5,
        giftOfTheEarthmother: 1,
        improvedRejuvenation: 3,
        swiftmend: 1,
        naturesSwiftness: 1,
        livingSpirit: 1,
      },
    },
  ];
  return seeds.map((seed) => {
    const talentsString = talentsFromFields(trees, seed.fields);
    assert.equal(talentProblem(trees, decodeTalents(trees, talentsString)), "");
    return { ...seed, talentsString };
  });
}

/** Use the same stationary damage schedules as Priest so comparisons retain their meaning.
 * @param {{kind:'tank'|'group'|'burst',durationSeconds:number,damagePerSecond:number,spread?:boolean}} options
 * @returns {object}
 */
export function createDruidHealingAssignment({ spread = false, ...options }) {
  assert.equal(typeof spread, "boolean");
  const frame = createPriestHealingAssignment(options);
  frame.schema = "kfc-druid-healing-workload.v1";
  delete frame.useInnerFocus;
  delete frame.innerFocusMinimumCost;
  delete frame.usePowerInfusion;
  if (spread) {
    frame.name += "-spread";
    for (const target of frame.targets) target.x = target.raidIndex * 12;
  }
  frame.healingPolicy = { WildGrowthDecay: 0.1, SwiftmendSelection: "shortest" };
  frame.innervateMinimumMissingMana = 2500;
  frame.innervateRequireHealingDemand = true;
  frame.useNaturesSwiftness = false;
  frame.naturesSwiftnessMinimumMissingHealth = 1500;
  return frame;
}

/** @param {object} assignment @param {Record<string,number>} fields @param {object} spellPolicy
 * @param {{directSpellId?:number,directMinimumMissingHealth?:number,rejuvenation?:boolean,regrowth?:boolean,wildGrowth?:boolean,tranquility?:boolean}} options
 * @returns {object}
 */
export function createDruidHealingPriorities(assignment, fields, spellPolicy, options = {}) {
  assert.equal(assignment.schema, "kfc-druid-healing-workload.v1");
  const {
    directSpellId = 9889,
    directMinimumMissingHealth = 400,
    rejuvenation = true,
    regrowth = false,
    wildGrowth = Boolean(fields.wildGrowth),
    tranquility = false,
  } = options;
  for (const flag of [rejuvenation, regrowth, wildGrowth, tranquility])
    assert.equal(typeof flag, "boolean");
  assert(
    Number.isFinite(directMinimumMissingHealth) &&
      directMinimumMissingHealth >= 0 &&
      directMinimumMissingHealth <= 5000,
  );
  const eligibility = {
    level: 60,
    talents: { swiftmend: Boolean(fields.swiftmend), wildGrowth: Boolean(fields.wildGrowth) },
    allowConditionalCandidates: true,
  };
  const ranks = eligibleDruidHealingRanks(spellPolicy, eligibility),
    direct = ranks.find((row) => row.spellId === directSpellId);
  assert(direct && ["healing-touch", "regrowth"].includes(direct.family));
  const highest = (family) => {
    const candidates = ranks.filter((row) => row.family === family).sort((a, b) => b.rank - a.rank);
    assert(candidates.length, "Missing eligible healing family: " + family);
    return candidates[0].spellId;
  };
  const result = structuredClone(assignment),
    target = result.name.startsWith("synthetic-tank-") ? 1 : -1;
  result.priorities = [];
  const add = (spellId, minimumMissingHealth, keepHot = false) =>
    result.priorities.push({ spellId, raidIndex: target, minimumMissingHealth, keepHot });
  if (wildGrowth) add(highest("wild-growth"), 700, true);
  if (tranquility) add(highest("tranquility"), 1000);
  if (fields.swiftmend && (rejuvenation || regrowth || direct.family === "regrowth"))
    add(highest("swiftmend"), 1500);
  if (rejuvenation) add(highest("rejuvenation"), 300, true);
  if (regrowth && direct.family !== "regrowth") add(highest("regrowth"), 1000, true);
  add(directSpellId, directMinimumMissingHealth);
  result.useNaturesSwiftness = Boolean(fields.naturesSwiftness);
  assertDruidHealingSpellEligibility(
    spellPolicy,
    result.priorities.map((row) => row.spellId),
    eligibility,
  );
  return result;
}

/** Survival and complete damage delivery precede missing health; overhealing is not a benefit.
 * @param {object} result @returns {{feasible:boolean,meanMissingHealth:number,manaRemainingMean:number}}
 */
export function summarizeDruidHealingAssignment(result) {
  assert.equal(result.schema, "kfc-druid-healing-workload-result.v1");
  return summarizePriestHealingAssignment({ ...result, schema: "kfc-healing-workload-result.v1" });
}
