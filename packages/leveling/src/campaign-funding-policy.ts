import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { LibraryObjective } from "./campaign-library.js";
import {
  applyCampaignPartyQuestPolicy,
  type CampaignPartyPolicy,
  type CampaignPartyQuestDecision,
} from "./campaign-party-policy.js";
import { CAMPAIGN_DEFERRED_PARTY_QUESTS } from "./campaign-route.js";
import { partyQuestLootCost } from "./party-quest-cost.js";
import {
  isGroundPickupFundingQuest,
  isSharedFundingQuest,
  questGroundPickups,
  type QuestCatalog,
} from "./quest-catalog.js";
import { npcDeliveryRecipients, providedItemDeliveryRecipients } from "./quest-catalog-delivery.js";
import type { CampaignSourceDelivery } from "./campaign-source-deliveries.js";

function generatedDecision(
  questId: number,
  catalog: QuestCatalog,
  combat: CombatDataset,
): CampaignPartyQuestDecision {
  const quest = catalog.quests.find((entry) => entry.questId === questId);
  const reference = combat.quests.find((entry) => entry.questId === questId);
  let objective: LibraryObjective;
  if (quest && isSharedFundingQuest(quest))
    objective = quest.category === "shared-kills" ? "shared-kills" : "delivery";
  else if (quest && isGroundPickupFundingQuest(quest)) objective = "interaction";
  else if (
    quest &&
    (providedItemDeliveryRecipients(quest, reference).length > 0 ||
      npcDeliveryRecipients(quest, reference).length > 0)
  )
    objective = "delivery";
  else throw new Error(`Funded quest ${questId} has no qualified party-policy classification.`);
  return {
    questId,
    objective,
    included: true,
    requiredFor: [],
    lootCost: null,
    ...((quest && questGroundPickups(quest).length > 0) || quest?.objectStarts?.length
      ? { worldObjectPickup: true as const }
      : {}),
    reason: "Selected as qualified quest preparation; retain its complete source lifecycle.",
  };
}

/** Add missing funding decisions without reapplying route filtering to the accepted allocation. */
export function refreshFundedCampaignPartyPolicy(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
  sourceDeliveries?: ReadonlyMap<number, CampaignSourceDelivery>,
): CampaignPartyPolicy | undefined {
  const policy = plan.sharedQuestsOnly ? plan.partyPolicy : undefined;
  if (!policy) return undefined;
  const active = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  const funded = new Set((plan.questFunding?.addedQuestIds ?? []).filter((id) => active.has(id)));
  const decisions = new Map(policy.decisions.map((decision) => [decision.questId, decision]));
  const missing = [...funded].filter((id) => !decisions.has(id));
  if (missing.length) {
    const reviewed = applyCampaignPartyQuestPolicy(plan, sources, combat, catalog).partyPolicy;
    const reviewedDecisions = new Map(
      reviewed?.decisions.map((decision) => [decision.questId, decision]),
    );
    for (const id of missing)
      decisions.set(id, reviewedDecisions.get(id) ?? generatedDecision(id, catalog, combat));
  }
  return {
    ...policy,
    decisions: [...decisions.values()].map((decision): CampaignPartyQuestDecision => {
      if (!funded.has(decision.questId)) return decision;
      if (CAMPAIGN_DEFERRED_PARTY_QUESTS[decision.questId])
        throw new Error(
          `Funded quest ${decision.questId} is explicitly deferred from the party route.`,
        );
      const method = sourceDeliveries?.get(decision.questId);
      if (method?.quest.questId === decision.questId && method.actions.length > 0 &&
        method.actions.every((action) => action.libraryObjective === "interaction" &&
          action.libraryQuestId === decision.questId &&
          action.questChanges.every((change) => change.questId === decision.questId)))
        return {
          ...decision,
          objective: "interaction",
          included: true,
          lootCost: null,
          reason: "Selected with its complete qualified source program; retain all personal counters and encounter requirements.",
        };
      const collection = ["collection", "named-trophy"].includes(decision.objective);
      const lootCost = collection
        ? partyQuestLootCost(decision.questId, plan, combat, 5, sources)
        : decision.lootCost;
      if (collection && !lootCost?.eligible)
        throw new Error(
          `Selected collection ${decision.questId} lost its five-player loot qualification.`,
        );
      return {
        ...decision,
        included: true,
        lootCost,
        reason:
          lootCost?.reason ??
          "Selected as qualified quest preparation; retain its complete source lifecycle.",
      };
    }),
  };
}
