import { buildCampaignPlan, type CampaignPlan, type CampaignSource } from "./campaign.js";
import { applyCampaignPartyQuestPolicy } from "./campaign-party-policy.js";
import { attachCampaignFlightPaths } from "./campaign-travel.js";
import type { CampaignQuestBatch } from "./campaign-catchup.js";
import type { CampaignLibraryChoice } from "./campaign-library-route.js";
import type { CampaignStarterCatalog } from "./campaign-starters.js";
import type { CombatDataset } from "./combat-model.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { compileCampaignFunding } from "./campaign-catchup-planner.js";
import { compileCampaignPickupGates } from "./campaign-pickup-gates.js";
import { DUNGEON_FINISH_OPTIONS } from "./dungeon-finish.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { attachCampaignMovements } from "./campaign-flow.js";
import { batchCampaignDungeonFlow } from "./campaign-dungeon-flow.js";
import { attachCampaignSourceHints } from "./campaign-source-hints.js";
import { batchCampaignVisits } from "./campaign-visit-flow.js";
import { attachCampaignDungeonSources } from "./campaign-dungeon-sources.js";

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

export function campaignRewardQuestIds(
  plan: CampaignRewardInventory,
  options: { readonly includeHeldLibrary?: boolean } = {},
): readonly number[] {
  return [
    ...new Set([
      ...(plan.dungeonFinish ? DUNGEON_FINISH_OPTIONS.flatMap((option) => option.questIds) : []),
      ...plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
      ...(plan.starters?.entries ?? []).flatMap((entry) =>
        entry.action.questChanges.map((change) => change.questId),
      ),
      ...(plan.catchUpBatches ?? []).filter(isSupportedCatchUpBatch).map((batch) => batch.questId),
      ...(plan.library?.choices ?? [])
        .filter((choice) => options.includeHeldLibrary || choice.role !== "held")
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
  const data = combat?.data.targetBuild === plan.targetBuild ? combat.data : undefined;
  const candidate =
    data && plan.sourceArchiveSha256 && data.quests.some((quest) => quest.prerequisites)
      ? buildCampaignPlan(plan.race, plan.sourceArchiveSha256, sources, plan.leaderClass, {
          includeLibrary: plan.sourceLibraryEnabled !== false,
          questReferences: data.quests,
        })
      : plan;
  const described = sources.length ? attachCampaignDungeonSources(candidate, sources) : candidate;
  const enriched =
    combat && data ? attachCampaignCombat(described, sources, data, combat.revision) : described;
  const selected = sources.length
    ? applyCampaignPartyQuestPolicy(enriched, sources, data)
    : enriched;
  const visits = batchCampaignVisits(
    batchCampaignDungeonFlow(attachCampaignLocations(selected, sources)),
    sources,
  );
  const routed = batchCampaignDungeonFlow(
    attachCampaignLocations(attachCampaignFlightPaths(visits, sources), sources),
  );
  const wanted = new Set(campaignRewardQuestIds({ ...routed, starters: evidence.starters }));
  const funded = compileCampaignFunding(
    compileCampaignPickupGates({
      ...routed,
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
  return attachCampaignSourceHints(
    attachCampaignMovements(attachCampaignLocations(funded, sources), sources),
    sources,
  );
}
