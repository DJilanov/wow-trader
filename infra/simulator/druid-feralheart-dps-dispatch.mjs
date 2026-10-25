import assert from "node:assert/strict";

function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, "Missing or ambiguous DPS Feralheart anchor");
  return source.replace(anchor, replacement);
}

/** Extend the current DPS lineage without rewriting any other class's exact-ID overrides.
 * @param {{itemSets:string,foreverSets:string}} source @returns {{itemSets:string,foreverSets:string}}
 */
export function applyDruidFeralheartDpsDispatch(source) {
  assert(!source.itemSets.includes("kfcFeralheartBonuses"));
  assert(!source.foreverSets.includes("kfcFeralheartBonusSupported"));
  return {
    itemSets: replaceOnce(
      source.itemSets,
      "activeBonuses = append(activeBonuses, character.kfcSorcererBonuses()...)",
      "activeBonuses = append(activeBonuses, character.kfcSorcererBonuses()...)\n\t\tactiveBonuses = append(activeBonuses, character.kfcFeralheartBonuses()...)",
    ),
    foreverSets: replaceOnce(
      replaceOnce(
        replaceOnce(
          source.foreverSets,
          "func ForeverEquipmentBonusSupported(id, pieces int32) bool {",
          "func ForeverEquipmentBonusSupported(id, pieces int32) bool {\n\tif id == 513 { return kfcFeralheartBonusSupported(id, pieces) }",
        ),
        "for _, id := range ids {",
        "for _, id := range ids {\n\t\tif id == 513 { continue }",
      ),
      "func overridesForeverEquipmentSet(id int32) bool {",
      "func overridesForeverEquipmentSet(id int32) bool {\n\tif id == 513 { return true }",
    ),
  };
}
