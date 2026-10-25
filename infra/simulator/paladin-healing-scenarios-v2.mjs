import assert from "node:assert/strict";
import {
  createPaladinHealingScenarioWorkload,
  paladinHealingScenarios,
} from "./paladin-healing-scenarios.mjs";
import { assertPaladinLegacyItemPolicy } from "./paladin-legacy-policy.mjs";

const scenarios = [
  ...paladinHealingScenarios().map((entry) => ({ ...entry, legacyBase: entry.id })),
  {
    id: "legacy-historical-briarwood",
    label: "Briarwood · historical compiled power",
    kind: "comparison",
    legacyBase: "reference",
    briarwoodSpellPower: 29,
  },
  {
    id: "legacy-no-retained-seal-healing",
    label: "Royal Seal · historical healing not retained",
    kind: "comparison",
    legacyBase: "reference",
    royalSealHealingPower: 0,
  },
  {
    id: "combined-conservative-no-retained-seal-healing",
    label: "Combined conservative · historical Seal healing not retained",
    kind: "comparison",
    legacyBase: "combined-conservative",
    royalSealHealingPower: 0,
  },
  {
    id: "briarwood-marsh-area",
    label: "Conditional · Briarwood in Marsh/Swamp",
    kind: "conditional",
    legacyBase: "reference",
    briarwoodSpellPower: 30,
  },
];

/** Current equip references and separately identified historical/area hypotheses.
 * @returns {object[]}
 */
export function paladinHealingLegacyScenarios() {
  return structuredClone(scenarios);
}

/** Add explicit item-owned references without editing the catalog or old frames.
 * @param {{scenarioId:string,option:object,kind:'tank'|'group'|'burst',durationSeconds:number,damagePerSecond:number,spellPolicy:object,items:Map<number,object>}} input
 * @returns {object}
 */
export function createPaladinHealingLegacyScenarioWorkload({ scenarioId, ...input }) {
  const scenario = scenarios.find((entry) => entry.id === scenarioId);
  assert(scenario, "Unknown Paladin legacy healing scenario");
  const frame = createPaladinHealingScenarioWorkload({
      ...input,
      scenarioId: scenario.legacyBase,
    }),
    ids = new Set(input.option.gear.items.map((entry) => entry.id));
  if (ids.has(12930) || ids.has(18472)) {
    const policy = {
      schema: "kfc-paladin-legacy-item-policy.v1",
      id: scenarioId,
      ...(ids.has(12930) ? { briarwoodSpellPower: scenario.briarwoodSpellPower ?? 15 } : {}),
      ...(ids.has(18472) ? { royalSealHealingPower: scenario.royalSealHealingPower ?? 22 } : {}),
    };
    assertPaladinLegacyItemPolicy(policy);
    frame.legacyItemsPolicy = policy;
  }
  return frame;
}
