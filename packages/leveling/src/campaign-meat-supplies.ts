import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignCombatPlan, CombatObjective, CombatQuestReference } from "./combat-model.js";
import { resolveCombatQuota } from "./combat-loot.js";

// Unbound, non-quest item identities from ClassicDB item_template at this pinned revision.
// This establishes a historical trading option, not current AH stock or a price.
export const MEAT_TRADE_REFERENCE = {
  repository: "https://github.com/cmangos/classic-db",
  revision: "603ece109099ce44a5447a1b1cffd65c7272d71c",
  file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
  sha256: "4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0",
} as const;

const ordinaryIngredientNames: ReadonlyMap<number, string> = new Map([
  [723, "Goretusk Liver"],
  [729, "Stringy Vulture Meat"],
  [769, "Chunk of Boar Meat"],
  [1015, "Lean Wolf Flank"],
  [1080, "Tough Condor Meat"],
  [1081, "Crisp Spider Meat"],
  [2886, "Crag Boar Rib"],
  [3172, "Boar Intestines"],
  [3173, "Bear Meat"],
  [3174, "Spider Ichor"],
  [3712, "Turtle Meat"],
  [5469, "Strider Meat"],
]);

export const MINIMUM_ROUTE_MEAT_DROP_CHANCE = 0.3;
export const MAXIMUM_ROUTE_MEAT_ITEMS_PER_PLAYER = 20;

export interface CampaignAuctionSupply {
  readonly questId: number;
  readonly itemId: number;
  readonly name: string;
  readonly quantityPerPlayer: number;
  readonly tradeReference: typeof MEAT_TRADE_REFERENCE;
}

export function isReferencedCampaignMeatSupply(supply: CampaignAuctionSupply): boolean {
  return (
    supply.name === ordinaryIngredientNames.get(supply.itemId) &&
    supply.tradeReference.sha256 === MEAT_TRADE_REFERENCE.sha256
  );
}

export function canConfirmCampaignMeatStock(action: CampaignAction): boolean {
  return Boolean(
    action.itemCollections?.length &&
    action.questChanges.length === 0 &&
    action.itemCollections.every((target) =>
      action.auctionSupplies?.some(
        (supply) =>
          supply.questId === target.questId &&
          supply.itemId === target.itemId &&
          isReferencedCampaignMeatSupply(supply) &&
          supply.quantityPerPlayer >= target.quantity,
      ),
    ),
  );
}

/** Qualify the whole on-route collection; one cheap ingredient cannot hide another rare one. */
export function campaignAuctionMeatSupplies(
  objectives: readonly CombatObjective[],
  combat: CampaignCombatPlan,
  reference: CombatQuestReference | undefined,
): readonly CampaignAuctionSupply[] | null {
  const items = reference?.itemObjectives?.filter((item) => !item.provided) ?? [];
  if (!items.length || items.length !== objectives.length) return null;
  const supplies = new Map<number, CampaignAuctionSupply>();
  for (const objective of objectives) {
    const matches = items.filter(
      (item) =>
        item.itemId === objective.loot?.itemId && item.objectiveIndex === objective.objectiveIndex,
    );
    const item = matches.length === 1 ? matches[0] : undefined;
    const name = item && ordinaryIngredientNames.get(item.itemId);
    const quota = resolveCombatQuota(objective, combat, 1, "expected");
    if (
      !item ||
      !name ||
      item.groundPickup ||
      item.itemName?.normalize("NFKC").toLowerCase() !== name.toLowerCase() ||
      item.quantity === null ||
      item.quantity < 1 ||
      item.quantity !== objective.loot?.quantity ||
      quota.kills === null ||
      !quota.collection ||
      quota.collection.input.probability < MINIMUM_ROUTE_MEAT_DROP_CHANCE ||
      quota.collection.drop.probabilityReference?.questOnly === true
    )
      return null;
    const previous = supplies.get(item.itemId);
    supplies.set(item.itemId, {
      questId: objective.questId,
      itemId: item.itemId,
      name,
      quantityPerPlayer: (previous?.quantityPerPlayer ?? 0) + item.quantity,
      tradeReference: MEAT_TRADE_REFERENCE,
    });
  }
  return [...supplies.values()];
}

/** Keep the acquisition choice visible in both browser instructions and native guide exports. */
export function attachCampaignMeatSupplyHints(plan: CampaignPlan): CampaignPlan {
  const supplies = new Map(
    plan.partyPolicy?.decisions.flatMap((decision) =>
      decision.included && decision.lootCost?.auctionItems
        ? [[decision.questId, decision.lootCost.auctionItems] as const]
        : [],
    ),
  );
  if (!supplies.size) return plan;
  return {
    ...plan,
    actions: plan.actions.map((action) => {
      const targets =
        action.itemCollections?.flatMap((target) =>
          (supplies.get(target.questId) ?? []).filter((item) => item.itemId === target.itemId),
        ) ?? [];
      const rows = targets.length
        ? targets
        : action.questChanges.flatMap((change) =>
            change.state === "objectives-complete" ? (supplies.get(change.questId) ?? []) : [],
          );
      if (!rows.length) return action;
      const labels = [...new Map(rows.map((row) => [row.itemId, row])).values()]
        .map((row) => `${row.quantityPerPlayer} ${row.name}`)
        .join(", ");
      const note = `Supplies: ${labels} per character. Use what you already have, buy the missing ingredients from the Auction House if affordable, or loot them on this route. Check this task only after you have the items; purchased supplies earn no kill XP. Extra gathering XP is not included in the estimate.`;
      const described = { ...action, instructions: [...new Set([...action.instructions, note])] };
      return { ...described, auctionSupplies: rows };
    }),
  };
}
