import assert from "node:assert/strict";
import { prepareShamanFiveThundersCatalog } from "./shaman-five-thunders.mjs";
import { reviewShamanFiveThundersSource } from "./shaman-five-thunders-source.mjs";

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, "Missing or ambiguous combat Five Thunders anchor");
  return source.replace(before, after);
}

/** Prepare an explicit cast-routing reference without replacing the qualified healer model.
 * @param {object} evidence @param {string} routing @returns {object}
 */
export function shamanFiveThundersCombatReference(evidence, routing) {
  assert.equal(
    routing,
    "completed-owner-magic-casts-reference",
    "Explicit combat routing required",
  );
  const source = reviewShamanFiveThundersSource(evidence);
  assert.equal(
    evidence.source.hotfixSha256,
    "3bf7ea17e509bf087124d457492e49234b3bff8c7af01d9c68ee98d5a92909a7",
  );
  return {
    schema: "kfc-shaman-five-thunders-combat-reference.v1",
    setId: source.baseSetId,
    excludedVariantSetId: source.excludedVariantSetId,
    itemIds: [...source.itemIds],
    resistance: 8,
    staticPower: 23,
    bonusArmor: 200,
    proc: {
      ...source.baseProc,
      routing,
      eligibility: "completed-owner-nonpassive-spell-damage-or-healing-casts-reference",
      excludedEvents: ["white-melee", "special-melee", "periodic-ticks", "pet-casts", "item-procs"],
      checksHitOutcome: false,
      attemptsPerCompletedCast: 1,
      serverRoutingVerified: false,
    },
    rawWearClassMask: source.rawWearClassMask,
    acquisitionClassMask: source.referenceAcquisitionClassMask,
    acquisitionFaction: source.referenceAcquisitionFaction,
    acquisitionAdmitted: false,
    serverMechanicsVerified: false,
    healingModelUnchanged: true,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}

/** Add an exact base-ID Shaman reference to a DPS/tank parent only.
 * @param {{itemSets:string,implementation:string,evidence:object,routing:string}} input
 * @returns {object}
 */
export function renderShamanFiveThundersCombat({ itemSets, implementation, evidence, routing }) {
  const reference = shamanFiveThundersCombatReference(evidence, routing);
  assert(
    !itemSets.includes("KFCOwnedShamanHealingSet"),
    "Owned healer dispatch requires reconciliation",
  );
  assert(!itemSets.includes("kfcCombatFiveThundersBonuses"), "Combat set already integrated");
  const anchor = "activeBonuses = append(activeBonuses, character.kfcForeverSoulforgeBonuses()...)";
  const integrated = replaceOnce(
    itemSets,
    anchor,
    anchor +
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcCombatFiveThundersBonuses()...)",
  );
  const dispatched = replaceOnce(
    integrated,
    "|| item.SetID == kfcSoulforgeSetID)",
    "|| item.SetID == kfcSoulforgeSetID || item.SetID == kfcCombatFiveThundersSetID)",
  );
  const constants = `const (
    kfcCombatFiveThundersSetID = ${reference.setId}
    kfcCombatFiveThundersResistance = ${reference.resistance}
    kfcCombatFiveThundersStaticPower = ${reference.staticPower}
    kfcCombatFiveThundersBonusArmor = ${reference.bonusArmor}
    kfcCombatFiveThundersProcID = ${reference.proc.parentSpellId}
    kfcCombatFiveThundersBuffID = ${reference.proc.childSpellId}
    kfcCombatFiveThundersProcPower = ${reference.proc.damageAndHealing}
    kfcCombatFiveThundersChance = ${reference.proc.chancePercent / 100}
    kfcCombatFiveThundersDurationMs = ${reference.proc.durationMs}
  )`;
  return {
    itemSets: dispatched,
    implementation: replaceOnce(implementation, "// KFC_COMBAT_FIVE_THUNDERS_CONSTANTS", constants),
    reference,
  };
}

/** Preserve unrestricted raw wear and unadmitted acquisition in the shared component catalog.
 * @param {object} parent @param {object[]} sources @param {object} evidence @returns {object}
 */
export function prepareShamanFiveThundersCombatCatalog(parent, sources, evidence) {
  shamanFiveThundersCombatReference(evidence, "completed-owner-magic-casts-reference");
  return prepareShamanFiveThundersCatalog(parent, sources, evidence);
}
