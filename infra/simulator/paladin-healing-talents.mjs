import assert from "node:assert/strict";
import {
  decodeTalents,
  talentNeighbors,
  talentProblem,
  talentsFromFields,
} from "./talent-search.mjs";

const healingFields = [
  "divineIntellect",
  "healingLight",
  "reverence",
  "infusionOfLight",
  "illumination",
  "divineFavor",
  "holyShock",
  "holyPower",
  "lightsVigil",
  "benediction",
];
const utilityFields = {
  divineStrength: "strength changes; no melee or Strength-to-healing conversion in this assignment",
  spiritualFocus: "pushback protection; caster damage is excluded",
  unyieldingFaith: "fear/disorient protection; control effects are excluded",
  voiceOfTruth: "interrupt immunity; interrupts are excluded",
  purifyingPower: "dispel and damage-spell costs; those casts are excluded",
  toughness: "equipment armor; incoming damage to other players is already post-mitigation",
  precision: "offensive hit chance; friendly heals cannot miss",
  guardiansFavor: "Protection/Freedom cooldown utility; those casts are excluded",
  anticipation: "defense; caster damage is excluded",
  sacredDuty: "stamina and defensive cooldowns; caster damage is excluded",
  deflection: "parry; caster melee damage is excluded",
  improvedJudgement: "Judgement cooldown; Judgement casts are excluded",
  pursuitOfJustice: "movement utility; this assignment is stationary",
};

/** Match current client nodes before admitting a field or using its tier gates.
 * @param {object} evidence @returns {object}
 */
export function extractPaladinHealingTalentDomain(evidence) {
  assert.equal(evidence.schema, "kfc-paladin-healing-talent-source.v1");
  assert.equal(evidence.className, "Paladin");
  assert.equal(evidence.trees.length, 3);
  assert.equal(evidence.clientTalents.length, 50);
  const offsetNodes = new Map([
    [1314103, { row: 2, column: 0 }],
    [1310994, { row: 3, column: 0 }],
  ]);
  const nodes = evidence.clientTalents.map((row) => {
    if (row.layoutResolved) return row;
    const expected = offsetNodes.get(row.spellId);
    assert(expected, "Unclassified talent layout gap");
    assert.deepEqual(row.rawPosition, { x: 5030, y: 2130 + expected.row * 600 });
    assert(
      evidence.clientTalents.some(
        (peer) =>
          peer.layoutResolved &&
          peer.treeIndex === 1 &&
          peer.column === 0 &&
          peer.rawPosition.x === 5020,
      ),
    );
    return {
      ...row,
      treeIndex: 1,
      ...expected,
      layoutResolution: "captured-first-column-plus-10-horizontal-units",
    };
  });
  const seen = new Set();
  const fields = evidence.trees.flatMap((tree, treeIndex) =>
    tree.talents.map((talent, index) => {
      const rows = nodes.filter(
        (row) =>
          row.treeIndex === treeIndex &&
          row.row === talent.location.rowIdx &&
          row.column === talent.location.colIdx,
      );
      assert.equal(rows.length, 1, talent.fieldName);
      const row = rows[0];
      assert(!seen.has(row.nodeId));
      seen.add(row.nodeId);
      assert.equal(row.name, talent.name);
      assert.equal(row.maxRanks, talent.maxPoints);
      const prerequisites = row.prerequisiteNodeIds.map((id) => {
        const parent = nodes.find((candidate) => candidate.nodeId === id);
        assert(parent && parent.treeIndex === treeIndex);
        return { rowIdx: parent.row, colIdx: parent.column };
      });
      assert.deepEqual(prerequisites, talent.prereqLocation ? [talent.prereqLocation] : []);
      const protoField = talent.fieldName.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
      const type = talent.maxPoints === 1 ? "bool" : "int32";
      assert(new RegExp(`\\b${type} ${protoField} = \\d+;`).test(evidence.proto), talent.fieldName);
      return {
        field: talent.fieldName,
        protoField,
        treeIndex,
        index,
        maximum: talent.maxPoints,
        row: row.row,
        column: row.column,
        prerequisiteIndex: talent.prereqLocation
          ? tree.talents.findIndex(
              (candidate) =>
                candidate.location.rowIdx === talent.prereqLocation.rowIdx &&
                candidate.location.colIdx === talent.prereqLocation.colIdx,
            )
          : -1,
        spellId: row.spellId,
        classification: healingFields.includes(talent.fieldName)
          ? "modeled-healing"
          : Object.hasOwn(utilityFields, talent.fieldName)
            ? "scoped-utility"
            : "outside-study-domain",
        scopeReason: utilityFields[talent.fieldName] ?? null,
      };
    }),
  );
  assert.equal(fields.length, 50);
  assert.equal(seen.size, 50);
  assert.equal(fields.filter((row) => row.classification === "modeled-healing").length, 10);
  assert.equal(fields.filter((row) => row.classification === "scoped-utility").length, 13);
  return {
    schema: "kfc-paladin-healing-talent-domain.v1",
    sourceBuild: evidence.source.build.buildNumber,
    trees: structuredClone(evidence.trees),
    fields,
    layoutOffsetSpellIds: [...offsetNodes.keys()],
    scope:
      "stationary player-only healing; no caster damage, interrupts, dispels, movement, melee, seals or offensive casts; utility effects are not healing throughput",
    classMechanicsAdmission: false,
    startsNewClassClock: false,
    publicationAllowed: false,
  };
}

/** @param {object} domain @param {string} value @returns {Record<string,number>} */
export function assertPaladinHealingTalentBuild(domain, value) {
  assert.equal(domain.schema, "kfc-paladin-healing-talent-domain.v1");
  const points = decodeTalents(domain.trees, value);
  const problem = talentProblem(domain.trees, points);
  assert.equal(problem, "", problem);
  const result = {};
  for (const row of domain.fields) {
    const rank = points[row.treeIndex][row.index];
    assert(
      !rank || row.classification !== "outside-study-domain",
      `Unsupported healing-study talent: ${row.field}`,
    );
    if (rank) result[row.field] = rank;
  }
  return result;
}

/** Legal seeds for measured feedback, not optimized results.
 * @param {object} domain @returns {object[]}
 */
export function paladinHealingTalentSeeds(domain) {
  const common = {
    divineIntellect: 5,
    healingLight: 3,
    spiritualFocus: 2,
    voiceOfTruth: 1,
    reverence: 3,
    purifyingPower: 2,
    infusionOfLight: 2,
    illumination: 5,
    divineFavor: 1,
    holyShock: 1,
    holyPower: 5,
    lightsVigil: 1,
    benediction: 5,
  };
  return [
    {
      id: "vigil-support",
      fields: {
        ...common,
        toughness: 5,
        precision: 3,
        guardiansFavor: 2,
        anticipation: 3,
        sacredDuty: 2,
      },
    },
    {
      id: "vigil-mobility",
      fields: {
        ...common,
        toughness: 5,
        guardiansFavor: 2,
        deflection: 5,
        improvedJudgement: 1,
        pursuitOfJustice: 2,
      },
    },
    {
      id: "direct-healing-support",
      fields: {
        ...common,
        lightsVigil: 0,
        unyieldingFaith: 1,
        toughness: 5,
        precision: 3,
        guardiansFavor: 2,
        anticipation: 3,
        sacredDuty: 2,
      },
    },
  ].map((seed) => {
    const talentsString = talentsFromFields(domain.trees, seed.fields);
    return {
      id: seed.id,
      talentsString,
      fields: assertPaladinHealingTalentBuild(domain, talentsString),
      optimized: false,
    };
  });
}

/** @param {object} domain @param {string} value @returns {object[]} */
export function paladinHealingTalentNeighbors(domain, value) {
  assertPaladinHealingTalentBuild(domain, value);
  return talentNeighbors(domain.trees, value).flatMap((talentsString) => {
    const points = decodeTalents(domain.trees, talentsString);
    if (
      domain.fields.some(
        (row) => row.classification === "outside-study-domain" && points[row.treeIndex][row.index],
      )
    )
      return [];
    return [{ talentsString, fields: assertPaladinHealingTalentBuild(domain, talentsString) }];
  });
}

/** @param {{implementation:string,domain:object}} input @returns {string} */
export function renderPaladinHealingTalentDomain({ implementation, domain }) {
  assert.equal(domain.schema, "kfc-paladin-healing-talent-domain.v1");
  assert.equal(implementation.split("// KFC_PALADIN_TALENT_DOMAIN_VALUES").length, 2);
  const slots = domain.trees
    .map(
      (_, index) =>
        "{" +
        domain.fields
          .filter((row) => row.treeIndex === index)
          .map(
            (row) =>
              `{${row.maximum},${row.row},${row.prerequisiteIndex},${row.classification !== "outside-study-domain"}}`,
          )
          .join(",") +
        "}",
    )
    .join(",");
  const utility = domain.fields
    .filter((row) => row.classification === "scoped-utility")
    .map((row) => `"${row.protoField}":${row.maximum}`)
    .join(",");
  return implementation.replace(
    "// KFC_PALADIN_TALENT_DOMAIN_VALUES",
    `var kfcPaladinHealingTalentSlots = [][]kfcPaladinTalentSlot{${slots}}\nvar kfcPaladinHealingUtilityFields = map[string]int32{${utility}}`,
  );
}

/** Keep partial component controls explicit while requiring full legal builds for study requests.
 * @param {{baseline:string,workload:string}} source @returns {{baseline:string,workload:string}}
 */
export function integratePaladinHealingTalentDomain(source) {
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  const baseline = once(
    source.baseline,
    "holy.validateKFCInstantCostTalents()",
    "holy.validateKFCHealingTalentDomain()",
  );
  let workload = once(
    source.workload,
    "type KFCPaladinHealingWorkload struct {",
    'type KFCPaladinHealingWorkload struct {\n\tRequireFullTalentBuild bool `json:"requireFullTalentBuild,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCPaladinHealingWorkloadResult struct {",
    'type KFCPaladinHealingWorkloadResult struct {\n\tLegalTalentBuild bool `json:"legalTalentBuild,omitempty"`',
  );
  workload = once(
    workload,
    "\tif err = validateKFCPaladinWorkloadRequest(player); err != nil { return nil, err }",
    "\tif frame.RequireFullTalentBuild {\n\t\tif err = validateKFCPaladinFullTalentBuild(player.TalentsString); err != nil { return nil, err }\n\t}\n\tif err = validateKFCPaladinWorkloadRequest(player); err != nil { return nil, err }",
  );
  workload = once(
    workload,
    "BlessingOfLight: frame.BlessingOfLight}",
    "BlessingOfLight: frame.BlessingOfLight, LegalTalentBuild: frame.RequireFullTalentBuild}",
  );
  return { baseline, workload };
}
