import assert from "node:assert/strict";

/** Restore the Hunter's missing bonus-armor contribution without changing other classes.
 * @param {string} source @returns {string}
 */
export function applyHunterBonusArmorDependency(source) {
  const anchor = "hunter.EnableManaBar()";
  assert.equal(source.split(anchor).length, 2, "Missing or ambiguous Hunter constructor");
  assert(
    !source.includes("AddStatDependency(stats.BonusArmor, stats.Armor"),
    "Hunter bonus armor is already modeled",
  );
  return source.replace(
    anchor,
    anchor + "\n\thunter.AddStatDependency(stats.BonusArmor, stats.Armor, 1)",
  );
}

/** Isolate base set 515 from legacy and generated set handlers in a derived workspace.
 * @param {{itemSets: string, foreverSets: string}} source
 * @returns {{itemSets: string, foreverSets: string}}
 */
export function applyHunterBeastmasterDispatch(source) {
  const replace = (text, anchor, value) => {
    assert.equal(text.split(anchor).length, 2, "Missing or ambiguous Beastmaster dispatch anchor");
    return text.replace(anchor, value);
  };
  assert(!source.itemSets.includes("kfcBeastmasterBonuses"));
  assert(!source.foreverSets.includes("kfcBeastmasterBonusSupported"));
  return {
    itemSets: replace(
      source.itemSets,
      "activeBonuses = append(activeBonuses, character.kfcValorBonuses()...)",
      "activeBonuses = append(activeBonuses, character.kfcValorBonuses()...)\n\t\tactiveBonuses = append(activeBonuses, character.kfcBeastmasterBonuses()...)",
    ),
    foreverSets: replace(
      replace(
        replace(
          source.foreverSets,
          "func ForeverEquipmentBonusSupported(id, pieces int32) bool {",
          "func ForeverEquipmentBonusSupported(id, pieces int32) bool {\n\tif id == 515 { return kfcBeastmasterBonusSupported(id, pieces) }",
        ),
        "for _, id := range ids {",
        "for _, id := range ids {\n\t\tif id == 515 { continue }",
      ),
      "func overridesForeverEquipmentSet(id int32) bool {",
      "func overridesForeverEquipmentSet(id int32) bool {\n\tif id == 515 { return true }",
    ),
  };
}
