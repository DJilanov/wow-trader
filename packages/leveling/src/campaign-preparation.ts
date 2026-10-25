import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CampaignQuestBatch } from "./campaign-catchup.js";
import type { CampaignLibraryChoice } from "./campaign-library-route.js";
import type { CampaignStarterCatalog } from "./campaign-starters.js";
import type { CombatDataset } from "./combat-model.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { compileCampaignFunding } from "./campaign-catchup-planner.js";
import { compileCampaignPickupGates } from "./campaign-pickup-gates.js";
import { DUNGEON_FINISH_OPTIONS } from "./dungeon-finish.js";

interface CampaignRewardInventory {
  readonly dungeonFinish?: boolean;
  readonly actions: readonly {
    readonly questChanges: readonly { readonly questId: number }[];
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
      ...(plan.dungeonFinish ? DUNGEON_FINISH_OPTIONS.flatMap((option) => option.questIds) : []),
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

export interface CampaignPreparationEvidence {
  readonly starters: CampaignStarterCatalog;
  readonly rewardFacts: NonNullable<CampaignPlan["rewardFacts"]>;
  readonly rewardRevision: string;
  readonly rewardBuild: number | null;
  readonly rewardNotice: string | null;
  readonly combat: { readonly data: CombatDataset; readonly revision: string } | null;
  readonly questValidation?: {
    readonly data: NonNullable<CampaignPlan["questValidationCoverage"]>;
    readonly runtimeBuild: number;
  };
}

// Evidence readers keep their own publication/identity checks. Both the website and
// offline builder use this exact transformation after those checks have succeeded.
export function prepareCampaignPlan(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  evidence: CampaignPreparationEvidence,
): CampaignPlan {
  const combat = evidence.combat;
  const enriched =
    combat?.data.targetBuild === plan.targetBuild
      ? attachCampaignCombat(plan, sources, combat.data, combat.revision)
      : plan;
  const wanted = new Set(campaignRewardQuestIds({ ...plan, starters: evidence.starters }));
  return compileCampaignFunding(
    compileCampaignPickupGates({
      ...enriched,
      starters: evidence.starters,
      catchUpBatches: (plan.catchUpBatches ?? []).filter(isSupportedCatchUpBatch),
      rewardFacts: evidence.rewardFacts.filter((fact) => wanted.has(fact.questId)),
      rewardRevision: evidence.rewardRevision,
      rewardBuild: evidence.rewardBuild,
      rewardNotice: evidence.rewardNotice,
      ...(evidence.questValidation
        ? {
            questValidationCoverage: evidence.questValidation.data,
            questValidationRuntimeBuild: evidence.questValidation.runtimeBuild,
          }
        : {}),
    }),
  );
}
