import type { CampaignCombatPlan, CombatObjective } from "./combat-model.js";
import type { CombatQuota } from "./combat-loot.js";
import { classicLootSourceUrl } from "./loot-classic-source.js";
import { estimateLootKills, plannedLootKills, type LootScenario } from "./quest-loot.js";

/** Missing captures can use a separately labeled reference, never a fabricated captured rate. */
export function resolveHistoricalCombatQuota(
  objective: CombatObjective,
  combat: CampaignCombatPlan,
  partySize: number,
  scenario: LootScenario,
): CombatQuota {
  const historical = combat.historicalLoot;
  const quantity = objective.loot?.quantity;
  const unknown = (reason: string): CombatQuota => ({ kills: null, reason });
  if (
    !historical ||
    historical.targetBuild !== combat.targetBuild ||
    objective.credit !== "personal-loot" ||
    objective.npcIds.length !== 1 ||
    !objective.loot ||
    quantity == null
  )
    return unknown("A compatible historical collection context is missing.");
  const item = objective.loot;
  const matches = historical.drops.filter(
    (drop) => drop.npcId === objective.npcIds[0] && drop.itemId === item.itemId,
  );
  if (matches.length !== 1)
    return unknown("A unique compatible historical drop reference is missing.");
  const drop = matches[0]!;
  const npc = combat.npcs.find((entry) => entry.id === drop.npcId);
  if (
    !npc ||
    npc.name.normalize("NFKC").toLowerCase() !== drop.npcName.normalize("NFKC").toLowerCase() ||
    drop.probability === undefined ||
    drop.questOnly === undefined
  )
    return unknown("Historical creature identity or drop probability is unresolved.");
  const input = {
    probability: drop.probability,
    minimumQuantity: 1,
    maximumQuantity: 1,
    quantity,
    sharing: item.sharing,
    partySize,
  };
  const estimate = estimateLootKills(input);
  if (estimate.status === "unknown") return unknown(estimate.reason);
  const source = [
    objective.source,
    `Historical Classic fixed-one ${drop.questOnly ? "quest-only" : "ordinary"} drop probability ${drop.probability}; base rate multiplier 1, source build 5875, not a measured Forever rate: ${classicLootSourceUrl(historical.source)}`,
    ...(item.sharingReference
      ? [`Historical Classic sharing assumption: ${classicLootSourceUrl(item.sharingReference)}`]
      : []),
  ].join("; ");
  return {
    kills: plannedLootKills(estimate, scenario),
    reason: null,
    lootEstimate: estimate,
    source,
    collection: {
      input,
      drop: {
        itemId: item.itemId,
        probabilityReference: {
          ...historical.source,
          itemId: item.itemId,
          npcId: drop.npcId,
          lootEntry: drop.lootEntry,
          probability: drop.probability,
          questOnly: drop.questOnly,
          rateMultiplier: 1,
        },
      },
    },
  };
}
