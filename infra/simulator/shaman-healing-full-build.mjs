import assert from "node:assert/strict";
import {
  createShamanHealingTalentDomain,
  shamanHealingTalentSeeds,
} from "./shaman-healing-talents.mjs";

/** Render source-owned engine legality without admitting unmodeled offensive effects.
 * @param {{implementation:string,evidence:object,adapter:object}} input @returns {object}
 */
export function renderShamanHealingFullBuild({ implementation, evidence, adapter }) {
  const domain = createShamanHealingTalentDomain({ evidence, adapter });
  assert.equal(domain.fields.length, 50);
  assert.equal(
    domain.fields.filter((field) => field.classification === "healing-source").length,
    15,
  );
  assert.equal(
    domain.fields.filter((field) => field.classification === "scoped-utility").length,
    10,
  );
  assert.equal(implementation.split("// KFC_SHAMAN_HEALING_STUDY_FIELDS").length, 2);
  const fields = domain.fields.map(
    (field) =>
      `{Field:${JSON.stringify(field.field)},ProtoField:${JSON.stringify(field.protoField)},Tree:${field.treeIndex},Index:${field.index},Row:${field.row},Maximum:${field.maximum},Prerequisite:${field.prerequisiteIndex},Classification:${JSON.stringify(field.classification)}}`,
  );
  return {
    implementation: implementation.replace(
      "// KFC_SHAMAN_HEALING_STUDY_FIELDS",
      "var kfcShamanHealingStudyFields = []kfcShamanHealingStudyField{" +
        fields.join(",\n") +
        ",\n}",
    ),
    source: {
      schema: "kfc-shaman-healing-full-build-source.v1",
      domain,
      seeds: shamanHealingTalentSeeds(domain),
      requiredLevel: 60,
      requiredPoints: 51,
      partialControlsRetained: true,
      workloadMustValidateFullBuild: true,
      fullClassAdmission: false,
      numericalQualification: false,
      startsNewClassClock: false,
      publicationAllowed: false,
    },
  };
}

/** Extend the derived factory, keeping its original partial component controls.
 * @param {string} implementation @returns {string}
 */
export function integrateShamanHealingFullBuild(implementation) {
  const boundaries = [
    [
      "validateKFCShamanComponentTalentEncoding(player.TalentsString)",
      "validateKFCShamanComponentTalentEncoding(player.TalentsString)\n\tvalidateKFCShamanHealingStudyFactory(player)",
    ],
    [
      "if kfcShamanResourceTalentAllowed(field) { return true }",
      "if kfcShamanResourceTalentAllowed(field) { return true }\n\t\tif kfcShamanScopedUtilityAllowed(field) { return true }",
    ],
  ];
  for (const [before, after] of boundaries) {
    assert.equal(implementation.split(before).length, 2, "Unknown full-build factory boundary");
    implementation = implementation.replace(before, after);
  }
  return implementation;
}

/** Bind native controls to the same three source-legal seeds and rejected neighbors.
 * @param {{implementation:string,source:object}} input @returns {string}
 */
export function renderShamanHealingFullBuildTests({ implementation, source }) {
  assert.equal(source.schema, "kfc-shaman-healing-full-build-source.v1");
  assert.equal(implementation.split("// KFC_SHAMAN_HEALING_STUDY_SEEDS").length, 2);
  assert.equal(source.seeds.length, 3);
  return implementation.replace(
    "// KFC_SHAMAN_HEALING_STUDY_SEEDS",
    "var kfcShamanHealingStudySeeds = []string{" +
      source.seeds.map((seed) => JSON.stringify(seed.talentsString)).join(",") +
      "}",
  );
}
