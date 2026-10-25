import assert from "node:assert/strict";
import { decodeTalents, talentsFromFields, talentProblem } from "./talent-search.mjs";

/** @param {object[]} trees @param {object[]} clientTalents @returns {void} */
export function assertPriestHealingTalentLayout(trees, clientTalents) {
  assert.equal(trees.length, 3);
  const resolved = clientTalents.filter((row) => row.layoutResolved);
  assert.equal(resolved.length, 52);
  let count = 0;
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
      count++;
    }
  }
  assert.equal(count, 52);
}

/** Legal editorial seeds for the measured feedback loop; neither is an optimized result.
 * @param {object[]} trees @returns {Array<{spec:string,talentsString:string,fields:Record<string,number>}>}
 */
export function priestHealingTalentSeeds(trees) {
  const discipline = {
    twinDisciplines: 5,
    mentalStrength: 5,
    mentalAgility: 3,
    innerFocus: 1,
    improvedPowerWordShield: 3,
    meditation: 3,
    soulWarding: 1,
    penance: 1,
    renewedHope: 5,
    divineAegis: 3,
    powerInfusion: 1,
  };
  const holy = {
    holySpecialization: 5,
    improvedRenew: 2,
    divineFury: 5,
    holyNova: 1,
    inspiration: 3,
    improvedHealing: 3,
    bindingHeal: 1,
    litanyOfLight: 1,
    spiritOfRedemption: 1,
    spiritualGuidance: 5,
    spiritualHealing: 3,
    prayerOfMending: 1,
  };
  const seeds = [
    {
      spec: "holy",
      fields: {
        twinDisciplines: 5,
        mentalStrength: 5,
        mentalAgility: 3,
        innerFocus: 1,
        improvedPowerWordShield: 3,
        meditation: 3,
        ...holy,
      },
    },
    {
      spec: "discipline",
      fields: {
        ...discipline,
        holySpecialization: 5,
        improvedRenew: 3,
        divineFury: 5,
        inspiration: 3,
        improvedHealing: 3,
        bindingHeal: 1,
      },
    },
  ];
  return seeds.map((seed) => {
    const talentsString = talentsFromFields(trees, seed.fields);
    assert.equal(talentProblem(trees, decodeTalents(trees, talentsString)), "");
    return { ...seed, talentsString };
  });
}

/** Stationary, post-mitigation synthetic assignments; damage is never presented as a boss measurement.
 * @param {{kind:'tank'|'group'|'burst',durationSeconds:number,damagePerSecond:number}} options
 * @returns {object}
 */
export function createPriestHealingAssignment({ kind, durationSeconds, damagePerSecond }) {
  assert(["tank", "group", "burst"].includes(kind));
  assert(Number.isSafeInteger(durationSeconds) && durationSeconds >= 30 && durationSeconds <= 300);
  assert(Number.isFinite(damagePerSecond) && damagePerSecond > 0 && damagePerSecond <= 2000);
  const damage = [];
  for (let second = 1; second < durationSeconds; second++) {
    if (kind === "tank")
      damage.push({ atMs: second * 1000, raidIndex: 1, amount: damagePerSecond });
    else if (kind === "group") {
      for (let target = 1; target <= 4; target++)
        damage.push({
          atMs: second * 1000 + target * 100,
          raidIndex: target,
          amount: damagePerSecond / 4,
        });
    } else if (second % 15 === 0) {
      for (let target = 1; target <= 4; target++)
        damage.push({ atMs: second * 1000, raidIndex: target, amount: (damagePerSecond * 15) / 4 });
    }
  }
  return {
    schema: "kfc-healing-workload.v1",
    name: `synthetic-${kind}-${durationSeconds}s-${damagePerSecond}dps`,
    targets: [
      { raidIndex: 0, maximumHealth: 0, x: 0, y: 0 },
      ...Array.from({ length: 4 }, (_, index) => ({
        raidIndex: index + 1,
        maximumHealth: kind === "tank" ? 18000 : 10000,
        x: (index + 1) * 2,
        y: 0,
      })),
    ],
    damage,
    priorities: [],
    decisionIntervalMs: 50,
    useInnerFocus: true,
    innerFocusMinimumCost: 300,
    usePowerInfusion: false,
  };
}

/** @param {object} assignment @param {Record<string,number>} fields
 * @param {{directSpellId?:number,shield?:boolean,renew?:boolean,groupHeal?:boolean}} options @returns {object}
 */
export function createPriestHealingPriorities(assignment, fields, options = {}) {
  assert.equal(assignment.schema, "kfc-healing-workload.v1");
  const { directSpellId = 10917, shield = false, renew = false, groupHeal = false } = options;
  assert(Number.isSafeInteger(directSpellId) && directSpellId > 0);
  for (const flag of [shield, renew, groupHeal]) assert.equal(typeof flag, "boolean");
  const result = globalThis.structuredClone(assignment),
    target = result.name.startsWith("synthetic-tank-") ? 1 : -1;
  result.priorities = [];
  const add = (spellId, minimumMissingHealth, keepRenew = false) =>
    result.priorities.push({ spellId, raidIndex: target, minimumMissingHealth, keepRenew });
  if (fields.prayerOfMending) add(1240827, 1);
  if (shield) add(10901, 0);
  if (renew) add(10929, 300, true);
  if (groupHeal) add(10961, 900);
  if (fields.penance) add(1316995, 1000);
  add(directSpellId, 400);
  result.usePowerInfusion = Boolean(fields.powerInfusion);
  result.useInnerFocus = Boolean(fields.innerFocus);
  assert(result.priorities.length <= 32);
  return result;
}

/** Compare only feasible assignments; overhealing never contributes to their objective.
 * @param {object} result @returns {{feasible:boolean,meanMissingHealth:number,manaRemainingMean:number}}
 */
export function summarizePriestHealingAssignment(result) {
  assert.equal(result.schema, "kfc-healing-workload-result.v1");
  assert.equal(result.classQualified, false);
  assert.equal(result.publicationAllowed, false);
  const duration = Number(result.name.match(/-(\d+)s-/)?.[1]);
  assert(Number.isSafeInteger(duration) && duration >= 30 && duration <= 300);
  for (const key of [
    "survivalRate",
    "missingHealthSecondsMean",
    "manaRemainingMean",
    "plannedIncomingPostMitigationDamage",
    "deliveredIncomingDamageMean",
  ])
    assert(
      typeof result[key] === "number" && Number.isFinite(result[key]) && result[key] >= 0,
      key,
    );
  assert(result.survivalRate <= 1);
  const tolerance = Math.max(1, result.plannedIncomingPostMitigationDamage) * 1e-7;
  assert(
    result.deliveredIncomingDamageMean <= result.plannedIncomingPostMitigationDamage + tolerance,
  );
  return {
    feasible:
      result.survivalRate === 1 &&
      Math.abs(result.deliveredIncomingDamageMean - result.plannedIncomingPostMitigationDamage) <=
        tolerance,
    meanMissingHealth: result.missingHealthSecondsMean / duration,
    manaRemainingMean: result.manaRemainingMean,
  };
}
