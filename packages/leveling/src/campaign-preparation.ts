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
import { questCatalogRewardFacts, type QuestCatalog } from "./quest-catalog.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { alignCampaignPickupChecks, deferUnfundedStarterPickups } from "./campaign-pickup-order.js";
import { compileCampaignFinish } from "./campaign-finish.js";
import { refreshCampaignFundingReview } from "./campaign-funding-review.js";
import { batchCampaignLocalDeliveries } from "./campaign-local-deliveries.js";
import { batchCampaignChainVisits } from "./campaign-chain-visits.js";
import { batchFundedCampaignVisits } from "./campaign-funded-visits.js";
import { attachCampaignSourceBookmarkAliases } from "./campaign-source-bookmarks.js";
import { expandCampaignDungeonObjectives } from "./campaign-dungeon-objectives.js";
import { deferCampaignStarterVisits } from "./campaign-starter-visits.js";
import { offerCampaignGroundVisits } from "./campaign-ground-visits.js";

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
  readonly questCatalog?: QuestCatalog | null;
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
  if (evidence.questCatalog && evidence.questCatalog.targetBuild !== plan.targetBuild)
    throw new Error("Quest funding catalog belongs to a different route build.");
  if (
    evidence.questCatalog &&
    plan.sourceArchiveSha256 &&
    evidence.questCatalog.sourceArchiveSha256 !== plan.sourceArchiveSha256
  )
    throw new Error("Quest funding catalog belongs to a different source archive.");
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
  const objectives = data ? expandCampaignDungeonObjectives(described, data) : described;
  const enriched =
    combat && data ? attachCampaignCombat(objectives, sources, data, combat.revision) : objectives;
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
  const wanted = new Set([
    ...campaignRewardQuestIds({ ...routed, starters: evidence.starters }),
    ...(evidence.questCatalog?.quests.map((quest) => quest.questId) ?? []),
  ]);
  const funded = compileCampaignFunding(
    compileCampaignPickupGates({
      ...routed,
      starters: evidence.starters,
      catchUpBatches: (plan.catchUpBatches ?? []).filter(isSupportedCatchUpBatch),
      rewardFacts: questCatalogRewardFacts(
        evidence.rewardFacts.filter((fact) => wanted.has(fact.questId)),
        evidence.questCatalog ?? null,
      ),
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
  const orderedPickups = deferUnfundedStarterPickups(funded);
  const questFunded =
    evidence.questCatalog && data
      ? fundCampaignQuestGaps(orderedPickups, sources, data, evidence.questCatalog)
      : orderedPickups;
  const localDeliveries =
    evidence.questCatalog && data
      ? batchCampaignLocalDeliveries(questFunded, data, evidence.questCatalog)
      : questFunded;
  const chainVisits =
    evidence.questCatalog && data
      ? batchCampaignChainVisits(localDeliveries, data, evidence.questCatalog)
      : localDeliveries;
  const fundedVisits =
    evidence.questCatalog && data
      ? batchFundedCampaignVisits(chainVisits, sources, data, evidence.questCatalog)
      : chainVisits;
  const starterVisits = evidence.questCatalog
    ? deferCampaignStarterVisits(fundedVisits, sources, evidence.questCatalog)
    : fundedVisits;
  const renewedFunding =
    starterVisits !== fundedVisits && evidence.questCatalog && data
      ? batchFundedCampaignVisits(
          fundCampaignQuestGaps(starterVisits, sources, data, evidence.questCatalog),
          sources,
          data,
          evidence.questCatalog,
        )
      : starterVisits;
  const groundVisits =
    evidence.questCatalog && data
      ? offerCampaignGroundVisits(renewedFunding, sources, data, evidence.questCatalog)
      : renewedFunding;
  const settledFunding =
    groundVisits !== renewedFunding && evidence.questCatalog && data
      ? batchFundedCampaignVisits(
          fundCampaignQuestGaps(groundVisits, sources, data, evidence.questCatalog),
          sources,
          data,
          evidence.questCatalog,
        )
      : groundVisits;
  const finish = evidence.questCatalog
    ? compileCampaignFinish(settledFunding, evidence.questCatalog)
    : settledFunding;
  const finishedObjectives = data ? expandCampaignDungeonObjectives(finish, data) : finish;
  const completed =
    combat && data && finishedObjectives !== questFunded
      ? attachCampaignCombat(finishedObjectives, sources, data, combat.revision)
      : finishedObjectives;
  const orderedChecks = alignCampaignPickupChecks(completed);
  const reviewed =
    orderedChecks !== questFunded ? refreshCampaignFundingReview(orderedChecks) : orderedChecks;
  return attachCampaignSourceBookmarkAliases(
    attachCampaignSourceHints(
      attachCampaignMovements(attachCampaignLocations(reviewed, sources), sources),
      sources,
    ),
    sources,
  );
}
