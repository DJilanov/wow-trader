import assert from "node:assert/strict";
import {
  extractPaladinSoulforgeRules,
  extendPaladinSoulforgeCatalog,
} from "./paladin-soulforge.mjs";

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, "Missing or ambiguous combat Soulforge integration");
  return source.replace(before, after);
}

/** Bind the full melee-capable reference to the actual captured proc and duration.
 * Client chance does not establish server cadence. The one-PPM mode is an explicit
 * reference, not an inferred server rate or an amendment to the healing-only model.
 * @param {object} evidence @param {string} cadence @returns {object}
 */
export function paladinSoulforgeCombatReference(evidence, cadence) {
  assert.equal(cadence, "one-ppm-reference", "Explicit Soulforge cadence required");
  const rules = extractPaladinSoulforgeRules(evidence);
  assert.equal(
    evidence.source.hotfixSha256,
    "3bf7ea17e509bf087124d457492e49234b3bff8c7af01d9c68ee98d5a92909a7",
  );
  const options = evidence.tables.SpellAuraOptions.filter(
    (row) => row.SpellID === rules.fourPiece.spellId,
  );
  assert.equal(options.length, 1);
  assert.deepEqual(options[0], {
    id: options[0].id,
    DifficultyID: 0,
    CumulativeAura: 0,
    ProcCategoryRecovery: 0,
    ProcChance: 100,
    ProcCharges: 0,
    SpellProcsPerMinuteID: 0,
    ProcTypeMask: [4, 0],
    SpellID: 27498,
  });
  const children = evidence.tables.SpellMisc.filter(
    (row) => row.SpellID === rules.fourPiece.triggerSpellId,
  );
  assert.equal(children.length, 1);
  assert.equal(children[0].DifficultyID, 0);
  assert.equal(children[0].DurationIndex, 1);
  assert.equal(children[0].PvPDurationIndex, 0);
  assert.equal(children[0].SchoolMask, 2);
  assert.equal(children[0].RangeIndex, 1);
  const durations = evidence.tables.SpellDuration.filter(
    (row) => row.id === children[0].DurationIndex,
  );
  assert.deepEqual(durations, [
    { id: 1, Duration: 10000, MaxDuration: 10000, DurationPerResource: 0 },
  ]);
  return {
    schema: "kfc-paladin-soulforge-combat-reference.v1",
    setId: rules.setId,
    excludedVariant: rules.excludedVariant,
    itemIds: Array.from({ length: 8 }, (_, index) => 22086 + index),
    resistance: rules.resistancesAtTwo,
    attackPower: rules.attackPowerAtSix,
    rangedAttackPower: rules.rangedAttackPowerAtSix,
    bonusArmor: rules.bonusArmorAtEight,
    proc: {
      parentSpellId: rules.fourPiece.spellId,
      childSpellId: rules.fourPiece.triggerSpellId,
      spellPower: rules.fourPiece.spellPower,
      durationMs: durations[0].Duration,
      clientChancePercent: options[0].ProcChance,
      clientListedInternalCooldownMs: 0,
      clientListedPPMId: 0,
      cadence,
      referencePPM: 1,
      eligibility: "landed-owner-white-melee-against-opponent-reference",
      serverCadenceVerified: false,
    },
    acquisition: "all-four-captured-alliance-paladin-quest-phases-reference",
    acquisitionQuestIds: evidence.acquisition.relations
      .map((row) => row.questId)
      .sort((a, b) => a - b),
    acquisitionFaction: "Alliance",
    obtainableClass: 4,
    parentScope: "existing-dps-and-tank-runtime-without-healing-owned-set-dispatch",
    healingModelUnchanged: true,
    serverMechanicsVerified: false,
    serverAcquisitionVerified: false,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}

/** Derive full base-ID combat dispatch while preserving every unrelated parent byte.
 * @param {{itemSets:string,implementation:string,evidence:object,cadence:string}} input
 * @returns {object}
 */
export function renderPaladinSoulforgeCombat({ itemSets, implementation, evidence, cadence }) {
  const reference = paladinSoulforgeCombatReference(evidence, cadence);
  assert(
    !itemSets.includes("KFCOwnedPaladinHealing"),
    "Owned healing sets require separate reconciliation",
  );
  const anchor = "activeBonuses = append(activeBonuses, character.kfcForeverDeathmistBonuses()...)";
  const derived = replaceOnce(
    itemSets,
    anchor,
    anchor +
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcForeverSoulforgeBonuses()...)",
  );
  const dispatched = replaceOnce(
    derived,
    "(overridesForeverEquipmentSet(item.SetID) || item.SetID == kfcDeathmistSetID)",
    "(overridesForeverEquipmentSet(item.SetID) || item.SetID == kfcDeathmistSetID || item.SetID == kfcSoulforgeSetID)",
  );
  const constants = `const (
    kfcSoulforgeSetID = ${reference.setId}
    kfcSoulforgeResistance = ${reference.resistance}
    kfcSoulforgeAttackPower = ${reference.attackPower}
    kfcSoulforgeRangedAttackPower = ${reference.rangedAttackPower}
    kfcSoulforgeBonusArmor = ${reference.bonusArmor}
    kfcSoulforgeProcID = ${reference.proc.parentSpellId}
    kfcSoulforgeBuffID = ${reference.proc.childSpellId}
    kfcSoulforgeProcPower = ${reference.proc.spellPower}
    kfcSoulforgeDurationMs = ${reference.proc.durationMs}
    kfcSoulforgeReferencePPM = ${reference.proc.referencePPM}
  )`;
  return {
    itemSets: dispatched,
    implementation: replaceOnce(implementation, "// KFC_SOULFORGE_COMBAT_CONSTANTS", constants),
    reference,
  };
}

/** Reuse the existing reviewed current-stat/acquisition adapter for this combat reference.
 * @param {object} parent @param {object} evidence @returns {object}
 */
export function preparePaladinSoulforgeCombatCatalog(parent, evidence) {
  paladinSoulforgeCombatReference(evidence, "one-ppm-reference");
  return extendPaladinSoulforgeCatalog(parent, evidence);
}
