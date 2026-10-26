import assert from "node:assert/strict";
import { extractShamanHealingRelicSource } from "./shaman-healing-relic-source.mjs";

function once(source, before, after) {
  assert.equal(
    source.split(before).length,
    2,
    "Missing or duplicate Shaman relic integration: " + before,
  );
  return source.replace(before, after);
}

/** Integrate current owned relic effects while retaining the unflagged DPS path.
 * @param {{implementation:string,actor:string,sharedItems:string,resources:string,coreSpell:string,evidence:object}} input
 * @returns {{implementation:string,actor:string,sharedItems:string,resources:string,coreSpell:string,rules:object}}
 */
export function renderShamanHealingRelics(input) {
  const rules = extractShamanHealingRelicSource(input.evidence);
  assert(!input.actor.includes("kfcRelics *"));
  assert(!input.sharedItems.includes("KFCControlsShamanHealingRelics"));
  assert(!input.resources.includes("kfcShamanShieldMaximumCharges()"));
  assert(!input.coreSpell.includes("kfcShamanRelicCostFactor"));
  const specs =
    "var kfcShamanHealingRelicSpecs = map[int32]kfcShamanHealingRelicSpec{\n" +
    rules.items
      .map(
        (row) =>
          `${row.itemId}:{Kind:${JSON.stringify(row.kind)},Amount:${row.effects[0].amount},Actions:map[int32]bool{${row.affectedActions.map((id) => `${id}:true`).join(",")}}},`,
      )
      .join("\n") +
    "\n}";
  const implementation = once(input.implementation, "// KFC_SHAMAN_HEALING_RELIC_VALUES", specs);
  let actor = once(
    input.actor,
    "type RestorationShaman struct {",
    "type RestorationShaman struct {\n\tkfcRelics *kfcShamanHealingRelics",
  );
  actor = once(
    actor,
    "\tresto.registerKFCShamanWaterTotems()",
    "\tresto.prepareKFCShamanHealingRelics()\n\tresto.registerKFCShamanWaterTotems()",
  );
  const sharedItems = once(
    input.sharedItems,
    "core.NewItemEffect(249398, func(agent core.Agent) {",
    "core.NewItemEffect(249398, func(agent core.Agent) {\n\t\tif provider,owned:=agent.(interface{KFCControlsShamanHealingRelics() bool});owned && provider.KFCControlsShamanHealingRelics(){return}",
  );
  let resources = once(
    input.resources,
    "MaxStacks: kfcShamanShieldCharges",
    "MaxStacks: resto.kfcShamanShieldMaximumCharges()",
  );
  resources = once(
    resources,
    "resto.WaterShieldAura.SetStacks(sim, kfcShamanShieldCharges)",
    "resto.WaterShieldAura.SetStacks(sim, resto.kfcShamanShieldMaximumCharges())",
  );
  let coreSpell = once(
    input.coreSpell,
    "\tspell        *Spell\n",
    "\tkfcShamanRelicCostFactor float64 // Zero retains the legacy cost path.\n\tspell        *Spell\n",
  );
  coreSpell = once(
    coreSpell,
    "\treturn max(0, cost*float64(sc.Multiplier)/100)\n",
    "\tcost = max(0, cost*float64(sc.Multiplier)/100)\n\tif sc.kfcShamanRelicCostFactor != 0 { cost *= sc.kfcShamanRelicCostFactor }\n\treturn cost\n",
  );
  coreSpell = once(
    coreSpell,
    "// Get power cost after all modifiers.",
    `// SetKFCShamanRelicCostFactor preserves original base costs for the owned multiplicative reference.
func (sc *SpellCost) SetKFCShamanRelicCostFactor(factor float64) {
  if !(factor > 0 && factor <= 1) || sc.kfcShamanRelicCostFactor != 0 { panic("invalid or duplicate owned Shaman relic cost factor") }
  sc.kfcShamanRelicCostFactor = factor
}
func (sc *SpellCost) KFCShamanRelicCostFactor() float64 { return sc.kfcShamanRelicCostFactor }

// Get power cost after all modifiers.`,
  );
  return { implementation, actor, sharedItems, resources, coreSpell, rules };
}
