import assert from "node:assert/strict";
import { reviewPriestVirtuousSource } from "./priest-virtuous-source.mjs";

/** Render the isolated payload reference without admitting either pending policy.
 * @param {{implementation:string,evidence:object}} input
 * @returns {string}
 */
export function renderPriestVirtuousReference({ implementation, evidence }) {
  const source = reviewPriestVirtuousSource(evidence),
    marker = "// KFC_VIRTUOUS_CLIENT_CONSTANTS";
  assert.equal(implementation.split(marker).length, 2, "Missing or duplicate Virtuous marker");
  assert.equal(source.runtimeComponentAdmitted, false);
  assert.equal(source.shield.requiresPriestFamilyInteractionAdmission, true);
  assert.equal(source.shield.requiresIncomingEventAdmission, true);
  const constants = {
    kfcVirtuousSetID: source.baseSetId,
    kfcVirtuousResistance: source.flatBonuses.resistancesAtTwo,
    kfcVirtuousSpellPower: source.flatBonuses.spellPowerAtSix,
    kfcVirtuousBonusArmor: source.flatBonuses.bonusArmorAtEight,
    kfcVirtuousProcID: source.shield.procSpellId,
    kfcVirtuousShieldID: source.shield.spellId,
    kfcVirtuousShieldAmount: source.shield.amount,
    kfcVirtuousShieldDurationMs: source.shield.durationMs,
    kfcVirtuousICDMs: source.shield.icdMs,
    kfcVirtuousProcChance: source.shield.chance,
  };
  return implementation.replace(
    marker,
    "const (\n" +
      Object.entries(constants)
        .map(([name, value]) => {
          assert(Number.isFinite(value) && value > 0, name);
          return name + " = " + value;
        })
        .join("\n") +
      "\n)",
  );
}
