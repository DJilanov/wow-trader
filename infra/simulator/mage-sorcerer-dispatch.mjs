import assert from "node:assert/strict";

function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, "Missing or ambiguous Sorcerer dispatch anchor");
  return source.replace(anchor, replacement);
}

/** Route base set 517 by ID while retaining the inherited alternate and Classic handlers.
 * @param {{itemSets:string,foreverSets:string}} source @returns {{itemSets:string,foreverSets:string}}
 */
export function applyMageSorcererDispatch(source) {
  assert(!source.itemSets.includes("kfcSorcererBonuses"));
  assert(!source.foreverSets.includes("kfcSorcererBonusSupported"));
  return {
    itemSets: replaceOnce(
      source.itemSets,
      "activeBonuses = append(activeBonuses, character.kfcBeastmasterBonuses()...)",
      "activeBonuses = append(activeBonuses, character.kfcBeastmasterBonuses()...)\n\t\tactiveBonuses = append(activeBonuses, character.kfcSorcererBonuses()...)",
    ),
    foreverSets: replaceOnce(
      replaceOnce(
        replaceOnce(
          source.foreverSets,
          "func ForeverEquipmentBonusSupported(id, pieces int32) bool {",
          "func ForeverEquipmentBonusSupported(id, pieces int32) bool {\n\tif id == 517 { return kfcSorcererBonusSupported(id, pieces) }",
        ),
        "for _, id := range ids {",
        "for _, id := range ids {\n\t\tif id == 517 { continue }",
      ),
      "func overridesForeverEquipmentSet(id int32) bool {",
      "func overridesForeverEquipmentSet(id int32) bool {\n\tif id == 517 { return true }",
    ),
  };
}

/** Restore Forever Mage bonus armor after the environment exists and before finalizing stats.
 * @param {string} source @returns {string}
 */
export function applyMageSorcererArmorDependency(source) {
  assert(!source.includes("AddStatDependency(stats.BonusArmor, stats.Armor"));
  return replaceOnce(
    source,
    "func (mage *Mage) Initialize() {",
    "func (mage *Mage) Initialize() {\n\tif mage.Env.IsForever() {\n\t\tmage.AddStatDependency(stats.BonusArmor, stats.Armor, 1)\n\t}",
  );
}

/** Current 70532 spell27868 mask4 selects SpellDiminish row3, distinct from root row1.
 * The existing explicit DR opt-in/reset-anchor assumptions are preserved.
 * @param {string} source @returns {string}
 */
export function applyMageSorcererDiminishingReturns(source) {
  assert(!source.includes("CrowdControlDRStun     int32 = 3"));
  return replaceOnce(
    replaceOnce(
      source,
      "CrowdControlDRRoot     int32 = 1",
      "CrowdControlDRRoot     int32 = 1\n\tCrowdControlDRStun     int32 = 3",
    ),
    "if group != CrowdControlDRRoot && group != CrowdControlDRStunProc {",
    "if group != CrowdControlDRRoot && group != CrowdControlDRStun && group != CrowdControlDRStunProc {",
  );
}
