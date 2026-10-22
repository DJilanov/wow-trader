import type {
  CampaignQuestBatch,
  CampaignLibraryChoice,
  CampaignQuestChange,
} from "@wow-trader/leveling";

interface CampaignRewardInventory {
  readonly actions: readonly {
    readonly questChanges: readonly Pick<CampaignQuestChange, "questId">[];
  }[];
  readonly catchUpBatches?: readonly Pick<
    CampaignQuestBatch,
    "questId" | "objectiveType" | "conditional"
  >[];
  readonly library?: {
    readonly choices: readonly Pick<CampaignLibraryChoice, "questId" | "role">[];
  };
  readonly starters?: {
    readonly entries: readonly { readonly action: CampaignRewardInventory["actions"][number] }[];
  };
}

export function isSupportedCatchUpBatch(
  batch: Pick<CampaignQuestBatch, "objectiveType" | "conditional">,
): boolean {
  return batch.objectiveType === "shared-kills" && !batch.conditional;
}

export function campaignRewardQuestIds(plan: CampaignRewardInventory): readonly number[] {
  return [
    ...new Set([
      ...plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
      ...(plan.starters?.entries ?? []).flatMap((entry) =>
        entry.action.questChanges.map((change) => change.questId),
      ),
      ...(plan.catchUpBatches ?? []).filter(isSupportedCatchUpBatch).map((batch) => batch.questId),
      ...(plan.library?.choices ?? [])
        .filter((choice) => choice.role !== "held")
        .map((choice) => choice.questId),
    ]),
  ];
}
