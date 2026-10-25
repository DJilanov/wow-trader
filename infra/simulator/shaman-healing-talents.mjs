import assert from "node:assert/strict";
import {
  decodeTalents,
  talentNeighbors,
  talentProblem,
  talentsFromFields,
} from "./talent-search.mjs";
import { extractShamanHealingTalentSource } from "./shaman-healing-talents-source.mjs";

const utilityFields = {
  naturalGrace: "healing threat is outside the declared missing-health objective",
  improvedReincarnation: "caster damage, death and resurrection are outside the assignment",
  ancestralHealing: "target damage is supplied after mitigation; armor cannot reduce it again",
  healingFocus: "caster damage and cast pushback are outside the assignment",
  earthsGrasp: "hostile crowd control is outside the assignment",
  guardianTotems:
    "external improved raid buffs are supplied explicitly without stacking a second copy",
  mentalDexterity: "attack power has no source without melee or offensive casts in this assignment",
  improvedGhostWolf: "movement and shapeshifting are outside the stationary assignment",
  anticipation: "caster melee damage and avoidance are outside the assignment",
  toughness: "caster incoming damage is outside the assignment",
};

/** Build source-bound talent legality for stationary, post-mitigation healing studies.
 * This prepares the search domain; it does not admit the corresponding engine effects.
 * @param {{evidence:object,adapter:object}} input @returns {object}
 */
export function createShamanHealingTalentDomain(input) {
  const source = extractShamanHealingTalentSource(input),
    fields = source.fields.map((field) => {
      const talent = source.trees[field.treeIndex].talents[field.index],
        prerequisiteIndex = talent.prereqLocation
          ? source.trees[field.treeIndex].talents.findIndex(
              (row) =>
                row.location.rowIdx === talent.prereqLocation.rowIdx &&
                row.location.colIdx === talent.prereqLocation.colIdx,
            )
          : -1;
      assert(!talent.prereqLocation || prerequisiteIndex >= 0);
      return {
        ...field,
        prerequisiteIndex,
        classification: field.affectsHealingStudy
          ? "healing-source"
          : Object.hasOwn(utilityFields, field.field)
            ? "scoped-utility"
            : "outside-study-domain",
        scopeReason: utilityFields[field.field] ?? null,
      };
    });
  return {
    schema: "kfc-shaman-healing-talent-domain.v1",
    sourceBuild: source.sourceBuild,
    trees: structuredClone(source.trees),
    fields,
    scope:
      "stationary player-only healing; post-mitigation incoming damage; no caster damage, movement, pushback, offensive casts, melee or active pets",
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Require a complete legal build and reject effects outside the declared study.
 * @param {object} domain @param {string} value @returns {Record<string,number>}
 */
export function assertShamanHealingTalentBuild(domain, value) {
  assert.equal(domain.schema, "kfc-shaman-healing-talent-domain.v1");
  const points = decodeTalents(domain.trees, value),
    problem = talentProblem(domain.trees, points);
  assert.equal(problem, "", problem);
  const result = {};
  for (const field of domain.fields) {
    const rank = points[field.treeIndex][field.index];
    assert(
      !rank || field.classification !== "outside-study-domain",
      "Unsupported healing-study talent: " + field.field,
    );
    if (rank) result[field.field] = rank;
  }
  return result;
}

/** Complete source-legal starting points for later measurement, never optimized defaults.
 * @param {object} domain @returns {object[]}
 */
export function shamanHealingTalentSeeds(domain) {
  const common = {
    thunderingStrikes: 5,
    ancestralKnowledge: 5,
    improvedHealingWave: 5,
    tidalFocus: 5,
    mindfulness: 3,
    waterShield: 1,
    tidalMastery: 5,
    manaTideTotem: 1,
    naturesSwiftness: 1,
  };
  return [
    {
      id: "riptide-support",
      fields: {
        ...common,
        totemicFocus: 5,
        restorativeTotems: 5,
        healingWay: 3,
        purification: 5,
        riptide: 1,
        naturalGrace: 1,
      },
    },
    {
      id: "riptide-mobility",
      fields: {
        ...common,
        improvedGhostWolf: 2,
        totemicFocus: 3,
        restorativeTotems: 5,
        healingWay: 3,
        purification: 5,
        riptide: 1,
        naturalGrace: 1,
      },
    },
    {
      id: "mental-quickness-wave",
      fields: {
        ...common,
        earthsGrasp: 2,
        guardianTotems: 2,
        mentalDexterity: 3,
        anticipation: 3,
        mentalQuickness: 2,
        totemicFocus: 1,
        healingWay: 3,
        purification: 4,
      },
    },
  ].map((seed) => {
    const talentsString = talentsFromFields(domain.trees, seed.fields);
    return {
      id: seed.id,
      talentsString,
      fields: assertShamanHealingTalentBuild(domain, talentsString),
      optimized: false,
      engineEffectsAdmitted: false,
    };
  });
}

/** Preserve actual tier and prerequisite gates while exploring one-point feedback.
 * @param {object} domain @param {string} value @param {Record<string,number>} requiredFields
 * @returns {object[]}
 */
export function shamanHealingTalentNeighbors(domain, value, requiredFields = {}) {
  assertShamanHealingTalentBuild(domain, value);
  return talentNeighbors(domain.trees, value, requiredFields).flatMap((talentsString) => {
    const points = decodeTalents(domain.trees, talentsString);
    if (
      domain.fields.some(
        (field) =>
          field.classification === "outside-study-domain" && points[field.treeIndex][field.index],
      )
    )
      return [];
    return [{ talentsString, fields: assertShamanHealingTalentBuild(domain, talentsString) }];
  });
}
