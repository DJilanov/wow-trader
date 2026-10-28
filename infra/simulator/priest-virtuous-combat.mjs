import assert from "node:assert/strict";
import { priestVirtuousModelReference } from "./priest-virtuous-model.mjs";
import { renderPriestVirtuousReference } from "./priest-virtuous-reference.mjs";
import { preparePriestVirtuousCatalog } from "./priest-virtuous-drafts.mjs";

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, "Missing or ambiguous DPS Virtuous anchor");
  return source.replace(before, after);
}

/** Bind the item shield to the captured modifiers without importing the owned healer runtime.
 * @param {object} evidence @param {object} healingEvidence @returns {object}
 */
export function priestVirtuousCombatReference(evidence, healingEvidence) {
  const reference = priestVirtuousModelReference(evidence, healingEvidence);
  assert.deepEqual(reference.modifiers[0].values, [0, 7, 14, 20]);
  return {
    ...reference,
    schema: "kfc-priest-virtuous-combat-reference.v1",
    actors: ["shadowPriest", "smitePriest"],
    shieldCapacityMultipliers: reference.modifiers[0].values.map((value) => (100 + value) / 100),
    familyPolicy: "captured-item-shield-mask; free-passive; separate-proc-ICD",
    generalHealingModifiers: false,
    ownedHealerRuntimeChanged: false,
    nativePowerWordShieldImplemented: false,
  };
}

/** Derive exact-ID dispatch and the actual native Priest bridge; every parent input stays immutable.
 * @param {{itemSets:string,foreverSets:string,priest:string,talents:string,modelImplementation:string,referenceImplementation:string,familyImplementation:string,evidence:object,healingEvidence:object}} input
 * @returns {object}
 */
export function renderPriestVirtuousCombat(input) {
  const reference = priestVirtuousCombatReference(input.evidence, input.healingEvidence);
  assert(!input.itemSets.includes("kfcForeverVirtuousBonuses"), "Virtuous already dispatched");
  assert(!input.foreverSets.includes("kfcVirtuousBonusSupported"));
  assert(!input.priest.includes("KFCVirtuousShieldMultiplier"));
  assert(
    !input.priest.includes("kfcClientHealingSpells") && !input.priest.includes("KFCOwned"),
    "Owned healer source requires separate reconciliation",
  );
  assert(
    !input.priest.includes("stats.BonusArmor, stats.Armor") &&
      !input.talents.includes("stats.BonusArmor, stats.Armor"),
    "Armor dependency already exists",
  );
  assert(/SpellFlagPriest\s*= core\.SpellFlagAgentReserved1/.test(input.priest));
  let modelImplementation = replaceOnce(
    input.modelImplementation,
    "\t\tRegisterForeverVirtuousShieldReference(agent.GetCharacter(), ForeverVirtuousShieldReferencePolicy{",
    `\t\tprovider, ok := agent.(interface { KFCVirtuousShieldMultiplier() float64 })
\t\tif !ok { panic("Virtuous combat reference requires the native Priest family provider") }
\t\tRegisterForeverVirtuousShieldReference(agent.GetCharacter(), ForeverVirtuousShieldReferencePolicy{`,
  );
  modelImplementation = replaceOnce(
    modelImplementation,
    "EligibleIncoming: ForeverVirtuousIncomingReference, FamilyMultiplier: 1,",
    "EligibleIncoming: ForeverVirtuousIncomingReference, FamilyMultiplier: provider.KFCVirtuousShieldMultiplier(),",
  );
  modelImplementation += `
func kfcVirtuousBonusSupported(id, pieces int32) bool {
  return id == ${reference.setId} && (pieces == 2 || pieces == 4 || pieces == 6 || pieces == 8)
}
`;
  const mana = "activeBonuses = append(activeBonuses, character.kfcForeverDungeonManaBonuses()...)",
    itemSets = replaceOnce(
      input.itemSets,
      mana,
      mana +
        "\n\t\tactiveBonuses = append(activeBonuses, character.kfcForeverVirtuousBonuses()...)",
    );
  let foreverSets = replaceOnce(
    input.foreverSets,
    "func ForeverEquipmentBonusSupported(id, pieces int32) bool {",
    "func ForeverEquipmentBonusSupported(id, pieces int32) bool {\n\tif id == 514 { return kfcVirtuousBonusSupported(id, pieces) }",
  );
  foreverSets = replaceOnce(
    foreverSets,
    "func overridesForeverEquipmentSet(id int32) bool {",
    "func overridesForeverEquipmentSet(id int32) bool {\n\tif id == 514 { return true }",
  );
  foreverSets = replaceOnce(
    foreverSets,
    "for _, id := range ids {",
    "for _, id := range ids {\n\t\tif id == 514 { continue }",
  );
  const talents = replaceOnce(
    input.talents,
    "func (priest *Priest) ApplyTalents() {",
    `func (priest *Priest) ApplyTalents() {
  if priest.Env.IsForever() {
    priest.AddStatDependency(stats.BonusArmor, stats.Armor, 1)
  }`,
  );
  const curves = [
    ...input.familyImplementation.matchAll(/multipliers := \[\.\.\.\]float64\{([^}]+)\}/g),
  ];
  assert.equal(curves.length, 1, "Missing or duplicate native Priest shield curve");
  assert.deepEqual(
    curves[0][1].split(",").map((value) => Number(value.trim())),
    reference.shieldCapacityMultipliers,
    "Native Priest shield curve differs from captured modifiers",
  );
  assert(
    input.familyImplementation.includes(
      "func (priest *Priest) KFCVirtuousShieldMultiplier() float64",
    ),
  );
  return {
    itemSets,
    foreverSets,
    priest: input.priest,
    talents,
    modelImplementation,
    familyImplementation: input.familyImplementation,
    referenceImplementation: renderPriestVirtuousReference({
      implementation: input.referenceImplementation,
      evidence: input.evidence,
    }),
    reference,
  };
}

/** Reuse current-stat and conditional class-quest admission without inferring live availability.
 * @param {object} parent @param {object} evidence @param {object} healingEvidence @returns {object}
 */
export function preparePriestVirtuousCombatCatalog(parent, evidence, healingEvidence) {
  const reference = priestVirtuousCombatReference(evidence, healingEvidence);
  return { ...preparePriestVirtuousCatalog(parent, evidence), reference };
}
