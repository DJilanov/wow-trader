import assert from "node:assert/strict";

const fields = [
  "improvedHealingWave",
  "tidalFocus",
  "mindfulness",
  "tidalMastery",
  "healingWay",
  "purification",
  "ancestralKnowledge",
  "thunderingStrikes",
  "mentalQuickness",
];

/** Render only the nine direct-healing/stat passives; totem and active handlers remain separate.
 * @param {{implementation:string,domain:object,passives:object}} input @returns {string}
 */
export function renderShamanHealingPassives({ implementation, domain, passives }) {
  assert.equal(domain.schema, "kfc-shaman-healing-talent-domain-source.v1");
  assert.equal(passives.schema, "kfc-shaman-healing-passive-source.v1");
  assert.equal(domain.sourceBuild, passives.sourceBuild);
  assert.equal(implementation.split("// KFC_SHAMAN_HEALING_PASSIVE_VALUES").length, 2);
  const values = fields.map((field) => {
    const source = passives.talents.find((row) => row.field === field),
      slot = domain.fields.find((row) => row.field === field);
    assert(source && slot && source.maximum === slot.maximum);
    const curves = source.effects.map((effect) => {
      assert.equal(effect.operation, 0);
      assert.equal(effect.byRank.length, source.maximum + 1);
      assert.equal(effect.byRank[0], 0);
      assert(effect.byRank.every(Number.isFinite));
      return "{" + effect.byRank.join(",") + "}";
    });
    return `${JSON.stringify(slot.protoField)}:{Tree:${slot.treeIndex},Index:${slot.index},Maximum:${slot.maximum},Effects:[][]float64{${curves.join(",")}}}`;
  });
  return implementation.replace(
    "// KFC_SHAMAN_HEALING_PASSIVE_VALUES",
    `var kfcShamanPassiveDefinitions = map[string]kfcShamanPassiveDefinition{${values.join(",\n")},\n}`,
  );
}

/** Replace the zero-talent factory guard in a derived workspace without touching the frozen parent.
 * @param {string} source @returns {string}
 */
export function integrateShamanHealingPassives(source) {
  const before =
    'if player.TalentsString != "" {\n\t\t\t\tpanic("Shaman basic controls do not admit unverified talents")\n\t\t\t}\n\t\t\treturn &RestorationShaman{Shaman: shaman.NewShaman(character, "", proto.ShamanWeaponImbue(0), proto.ShamanWeaponImbue(0))}';
  assert.equal(source.split(before).length, 2, "Unknown Shaman baseline factory");
  return source.replace(before, "return newKFCShamanPassiveAgent(character, player)");
}
