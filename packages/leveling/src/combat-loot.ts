import type { CampaignCombatPlan, CombatObjective } from "./combat-model.js";
import {
  estimateLootKills,
  plannedLootKills,
  type LootKillEstimate,
  type LootScenario,
} from "./quest-loot.js";

export interface CombatQuota {
  readonly kills: number | null;
  readonly reason: string | null;
  readonly lootEstimate?: Extract<LootKillEstimate, { status: "estimated" }>;
}

export function resolveCombatQuota(
  objective: CombatObjective,
  combat: CampaignCombatPlan,
  partySize: number,
  scenario: LootScenario,
): CombatQuota {
  if (objective.credit === "shared-kills" && objective.npcIds.length === 1)
    return { kills: objective.requiredKills, reason: objective.reason };
  if (objective.credit !== "personal-loot" || !objective.loot)
    return {
      kills: null,
      reason: objective.reason ?? "Quest item identity or quantity is missing.",
    };
  if (objective.loot.quantity === null)
    return { kills: null, reason: "The quest item's required quantity is missing." };
  if (objective.npcIds.length !== 1)
    return {
      kills: null,
      reason: "Choose a unique on-route creature before estimating its drop kills.",
    };
  const drops =
    combat.lootDrops?.filter(
      (drop) =>
        drop.itemId === objective.loot!.itemId &&
        drop.npcId === objective.npcIds[0] &&
        drop.targetBuild === combat.targetBuild,
    ) ?? [];
  if (drops.length !== 1)
    return { kills: null, reason: "A unique compatible drop probability is missing." };
  const drop = drops[0]!;
  const singleItemDrops = drop.quantityDistribution
    ? drop.quantityDistribution.every((entry) => entry.percent === 0 || entry.quantity === 1)
    : drop.minimumQuantity === 1 && drop.maximumQuantity === 1;
  if (drop.probabilityBasis === "sample-ratio" && !singleItemDrops)
    return {
      kills: null,
      reason:
        "Sample item counts do not establish a per-kill probability for unknown or multi-item drops.",
    };
  if (drop.sourceBuild != null && drop.sourceBuild !== combat.targetBuild)
    return { kills: null, reason: "The drop reference was captured for a different client build." };
  const estimate = estimateLootKills({
    ...drop,
    quantity: objective.loot.quantity,
    sharing: objective.loot.sharing,
    partySize,
  });
  return estimate.status === "unknown"
    ? { kills: null, reason: estimate.reason }
    : { kills: plannedLootKills(estimate, scenario), reason: null, lootEstimate: estimate };
}
