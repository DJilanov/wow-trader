import type { CampaignCombatPlan, CombatObjective } from "./combat-model.js";
import { resolveCombatQuota } from "./combat-loot.js";
import {
  estimateJointLootKills,
  type EstimatedJointLootKills,
  type JointLootComponent,
} from "./loot-joint-distribution.js";
import { plannedLootKills, type LootScenario } from "./quest-loot.js";

export type JointCombatQuota =
  | {
      readonly status: "estimated";
      readonly npcId: number;
      readonly kills: number;
      readonly estimate: EstimatedJointLootKills;
      readonly source: string;
    }
  | { readonly status: "unknown"; readonly reason: string };

/** Same-creature, fixed-stack objectives completed together from a fresh inventory. */
export function resolveJointCombatQuota(
  objectives: readonly CombatObjective[],
  combat: CampaignCombatPlan,
  partySize: number,
  scenario: LootScenario,
  requiredKills = 0,
): JointCombatQuota {
  if (!Number.isSafeInteger(requiredKills) || requiredKills < 0 || requiredKills > 10000)
    throw new Error("Invalid required kill floor for joint collection.");
  const unknown = (reason: string): JointCombatQuota => ({ status: "unknown", reason });
  const npcId = objectives[0]?.npcIds[0];
  if (
    !npcId ||
    objectives.some((objective) => objective.npcIds.length !== 1 || objective.npcIds[0] !== npcId)
  )
    return unknown("Joint collection requires one shared on-route creature.");
  const components: JointLootComponent[] = [],
    sources = new Set<string>(),
    itemIds = new Set<number>();
  const randomSources: string[] = [];
  let minimumKills = requiredKills;
  for (const objective of objectives) {
    const quota = resolveCombatQuota(objective, combat, partySize, scenario);
    if (quota.kills === null)
      return unknown(quota.reason ?? "A joint objective quota is unresolved.");
    if (objective.credit === "shared-kills") {
      minimumKills = Math.max(minimumKills, quota.kills);
      continue;
    }
    if (!quota.collection) return unknown("A joint objective has no compatible collection model.");
    const { input, drop } = quota.collection;
    if (itemIds.has(drop.itemId))
      return unknown("Two quests consuming the same item require separate inventory handling.");
    itemIds.add(drop.itemId);
    const required = input.quantity * (input.sharing === "pooled" ? partySize : 1);
    const weights = input.quantityDistribution?.filter((entry) => entry.percent > 0);
    const fixed =
      weights?.length === 1
        ? weights[0]!.quantity
        : input.minimumQuantity !== null && input.minimumQuantity === input.maximumQuantity
          ? input.minimumQuantity
          : null;
    const oneDrop =
      required === 1 ||
      (input.minimumQuantity !== null && input.minimumQuantity >= required) ||
      (weights?.length && weights.every((entry) => entry.quantity >= required));
    if (!oneDrop && fixed === null) return unknown("Joint variable-stack inventory is unresolved.");
    const component: JointLootComponent = {
      successes: oneDrop ? 1 : Math.ceil(required / fixed!),
      probability: input.probability,
      independentPlayers: input.sharing === "independent" ? partySize : 1,
    };
    components.push(component);
    sources.add(quota.source ?? objective.source);
    if (component.probability < 1) {
      const reference = drop.probabilityReference;
      randomSources.push(
        reference
          ? `${reference.repository}:${reference.revision}:${reference.file}:${reference.sha256}:${reference.lootEntry}`
          : "",
      );
    }
  }
  if (!components.length) return unknown("There is no collection in this joint objective group.");
  if (
    randomSources.length > 1 &&
    (randomSources.some((source) => !source) || new Set(randomSources).size !== 1)
  )
    return unknown("Separate drop probabilities do not establish independent joint rolls.");
  const estimate = estimateJointLootKills(components, minimumKills);
  if (estimate.status === "unknown") return estimate;
  if (
    scenario === "expected" &&
    Math.ceil(estimate.expectedKillsLowerBound) !== Math.ceil(estimate.expectedKillsUpperBound)
  )
    return unknown("Joint mean crosses an unresolved integer kill-budget boundary.");
  return {
    status: "estimated",
    npcId,
    kills: plannedLootKills(estimate, scenario),
    estimate,
    source: [
      ...sources,
      "Joint completion of these objectives; independent ungrouped historical rolls where required, not verified Forever joint behavior.",
    ].join("; "),
  };
}
