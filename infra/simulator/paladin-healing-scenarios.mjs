import assert from "node:assert/strict";
import { paladinHealingFeedbackHypotheses } from "./paladin-healing-feedback.mjs";
import { createPaladinHealingOptionWorkload } from "./paladin-healing-option-workload.mjs";

const scenarios = [
  {
    id: "reference",
    label: "Reference assumptions",
    base: "reference",
    kind: "comparison",
    overrides: {},
  },
  {
    id: "mana-stress",
    label: "Conservative mana and scaling",
    base: "mana-stress",
    kind: "comparison",
    overrides: {},
  },
  {
    id: "rank-ten-level-window",
    label: "Downranks · ten-level window",
    base: "reference",
    kind: "comparison",
    overrides: { rankGap: 10, rankLoss: 0.04, classProcMode: "coefficient-factor" },
  },
  {
    id: "rank-five-level-window",
    label: "Downranks · five-level window",
    base: "reference",
    kind: "comparison",
    overrides: { rankGap: 5, rankLoss: 0.04, classProcMode: "coefficient-factor" },
  },
  {
    id: "rank-five-level-unscaled-procs",
    label: "Downranks · unchanged class procs",
    base: "reference",
    kind: "comparison",
    overrides: { rankGap: 5, rankLoss: 0.04, classProcMode: "unchanged" },
  },
  {
    id: "light-full-after",
    label: "Full Light bonus after Healing Light",
    base: "reference",
    kind: "comparison",
    overrides: { lightScaling: "full-tooltip-reference", lightOrder: "after-healing-light" },
  },
  {
    id: "light-scaled-before",
    label: "Coefficient Light bonus before Healing Light",
    base: "reference",
    kind: "comparison",
    overrides: { lightScaling: "coefficient-factor", lightOrder: "before-healing-light" },
  },
  {
    id: "light-scaled-after",
    label: "Coefficient Light bonus after Healing Light",
    base: "reference",
    kind: "comparison",
    overrides: { lightScaling: "coefficient-factor", lightOrder: "after-healing-light" },
  },
  {
    id: "vigil-no-refund",
    label: "Vigil · no Illumination refund",
    base: "reference",
    kind: "comparison",
    overrides: { vigilRefundMode: "none" },
  },
  {
    id: "heart-off",
    label: "Dormant Heart · no proc",
    base: "reference",
    kind: "comparison",
    overrides: { heartChance: 0 },
  },
  {
    id: "heart-two-percent",
    label: "Dormant Heart · 2% reference",
    base: "reference",
    kind: "comparison",
    overrides: { heartChance: 0.02 },
  },
  {
    id: "heart-five-percent",
    label: "Dormant Heart · 5% reference",
    base: "reference",
    kind: "comparison",
    overrides: { heartChance: 0.05 },
  },
  {
    id: "heart-ten-percent",
    label: "Dormant Heart · 10% reference",
    base: "reference",
    kind: "comparison",
    overrides: { heartChance: 0.1 },
  },
  {
    id: "cast-procs-low",
    label: "Cast sets · low mana and power procs",
    base: "reference",
    kind: "comparison",
    overrides: { wildheartChance: 0, spellPowerChance: 0.05, dreadmistCrits: false },
  },
  {
    id: "cast-procs-high",
    label: "Cast sets · higher mana and critical self-heals",
    base: "reference",
    kind: "comparison",
    overrides: { wildheartChance: 0.05, spellPowerChance: 1, dreadmistCrits: true },
  },
  {
    id: "self-before-no-trigger",
    label: "Self sets · before-hit thresholds, no self-cost triggers",
    base: "reference",
    kind: "comparison",
    overrides: {
      thresholdTiming: "before-hit",
      selfDamageTriggers: false,
      devoutChance: 0,
      regenerationTickMs: 5000,
    },
  },
  {
    id: "self-after-with-trigger",
    label: "Self sets · after-hit thresholds and self-cost triggers",
    base: "reference",
    kind: "comparison",
    overrides: {
      thresholdTiming: "after-hit",
      selfDamageTriggers: true,
      devoutChance: 0.02,
      regenerationTickMs: 2000,
    },
  },
  {
    id: "regeneration-five-seconds",
    label: "Regeneration · five-second cadence",
    base: "reference",
    kind: "comparison",
    overrides: { regenerationTickMs: 5000 },
  },
  {
    id: "item-critical-off",
    label: "Item uses · noncritical healing, fixed channel",
    base: "reference",
    kind: "comparison",
    overrides: { utilityCrits: false, recombobulatorCrits: false, circleScales: false },
  },
  {
    id: "item-critical-on",
    label: "Item uses · critical healing, scaled channel",
    base: "reference",
    kind: "comparison",
    overrides: { utilityCrits: true, recombobulatorCrits: true, circleScales: true },
  },
  {
    id: "combined-conservative",
    label: "Combined conservative reference",
    base: "mana-stress",
    kind: "comparison",
    overrides: {
      heartChance: 0,
      wildheartChance: 0,
      spellPowerChance: 0.05,
      dreadmistCrits: false,
      thresholdTiming: "before-hit",
      selfDamageTriggers: false,
      devoutChance: 0,
      regenerationTickMs: 5000,
      utilityCrits: false,
      recombobulatorCrits: false,
      circleScales: false,
    },
  },
  {
    id: "vigil-per-critical-recipient",
    label: "Conditional · Vigil refunds per critical recipient",
    base: "reference",
    kind: "conditional",
    overrides: { vigilRefundMode: "per-critical-recipient" },
  },
  {
    id: "haunted-area",
    label: "Conditional · Haunted area",
    base: "reference",
    kind: "conditional",
    overrides: { itemArea: "haunted" },
  },
  {
    id: "wasteland-area",
    label: "Conditional · Wasteland area",
    base: "reference",
    kind: "conditional",
    overrides: { itemArea: "wasteland" },
  },
];

/** Declared model comparisons and separately labelled conditional environments.
 * @returns {object[]}
 */
export function paladinHealingScenarios() {
  return structuredClone(scenarios);
}

/** Apply uncertainty references only to their actual item/set owners.
 * @param {{scenarioId:string,option:object,kind:'tank'|'group'|'burst',durationSeconds:number,damagePerSecond:number,spellPolicy:object,items:Map<number,object>}} input
 * @returns {object}
 */
export function createPaladinHealingScenarioWorkload({ scenarioId, ...input }) {
  const scenario = scenarios.find((entry) => entry.id === scenarioId);
  assert(scenario, "Unknown Paladin healing scenario");
  const hypothesis = paladinHealingFeedbackHypotheses().find((entry) => entry.id === scenario.base),
    frame = createPaladinHealingOptionWorkload({ ...input, hypothesis }),
    rules = scenario.overrides,
    ids = new Set(input.option.gear.items.map((entry) => entry.id).filter(Boolean)),
    sets = new Map();
  for (const entry of input.option.gear.items) {
    const setId = input.items.get(entry.id)?.setId;
    if (setId) sets.set(setId, (sets.get(setId) ?? 0) + 1);
  }
  const owns = (setId, count) => (sets.get(setId) ?? 0) >= count;
  if (rules.rankGap !== undefined)
    frame.rankScaling = {
      schema: "kfc-paladin-rank-sensitivity.v1",
      id: scenario.id,
      kind: "level-distance-sensitivity",
      fullScalingGap: rules.rankGap,
      coefficientLossPerLevel: rules.rankLoss,
      classProcMode: rules.classProcMode,
    };
  if (rules.lightScaling !== undefined) frame.blessingOfLight.scaling = rules.lightScaling;
  if (rules.lightOrder !== undefined) frame.blessingOfLight.multiplierOrder = rules.lightOrder;
  if (rules.vigilRefundMode !== undefined) frame.vigilRefundMode = rules.vigilRefundMode;
  if (ids.has(249473) && rules.heartChance !== undefined)
    frame.itemEffectsPolicy = {
      schema: "kfc-paladin-item-effects-policy.v1",
      id: scenario.id,
      dormantHeartProcChance: rules.heartChance,
      dormantHeartHealingEvents: "completed-casts",
    };
  const cast = { ...frame.castSetPolicy };
  if (owns(185, 5) && rules.wildheartChance !== undefined)
    cast.wildheartManaChance = rules.wildheartChance;
  if ((owns(187, 5) || owns(188, 5)) && rules.spellPowerChance !== undefined)
    cast.spellPowerChance = rules.spellPowerChance;
  if (owns(183, 5) && rules.dreadmistCrits !== undefined)
    cast.dreadmistCanCrit = rules.dreadmistCrits;
  if (Object.keys(cast).length) frame.castSetPolicy = cast;
  const self = { ...frame.selfSetPolicy },
    thresholdOwner = owns(162, 4) || owns(163, 6),
    regenerationOwner = owns(184, 6) || owns(189, 6) || owns(1968, 4);
  if (thresholdOwner && rules.thresholdTiming !== undefined)
    self.thresholdTiming = rules.thresholdTiming;
  if ((thresholdOwner || owns(182, 4)) && rules.selfDamageTriggers !== undefined)
    self.selfDamageTriggers = rules.selfDamageTriggers;
  if (owns(182, 4) && rules.devoutChance !== undefined) self.devoutProcChance = rules.devoutChance;
  if (regenerationOwner && rules.regenerationTickMs !== undefined)
    self.regenerationTickMs = rules.regenerationTickMs;
  if (Object.keys(self).length) frame.selfSetPolicy = self;
  if (
    [2816, 6320, 6459, 6461, 6910, 7684, 14149, 16731].some((id) => ids.has(id)) &&
    rules.regenerationTickMs !== undefined
  )
    frame.itemHealthRegenTickMs = rules.regenerationTickMs;
  if ([4262, 8346, 7939].some((id) => ids.has(id)) && rules.utilityCrits !== undefined)
    frame.utilityHealingCanCrit = rules.utilityCrits;
  if ([4381, 18637].some((id) => ids.has(id)) && rules.recombobulatorCrits !== undefined)
    frame.recombobulatorCanCrit = rules.recombobulatorCrits;
  if (ids.has(11808) && rules.circleScales !== undefined)
    frame.circleChannelScales = rules.circleScales;
  if ([18472, 20512].some((id) => ids.has(id)) && rules.itemArea !== undefined) {
    frame.itemArea = rules.itemArea;
    if (frame.orbArea !== undefined) frame.orbArea = rules.itemArea;
  }
  return frame;
}
