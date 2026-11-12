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
import { assertCampaignRouteLock, type CampaignRouteLockContext } from "./campaign-route-lock.js";
import { reuseCampaignRoutePrefix, type CampaignRoutePrefix } from "./campaign-route-prefix.js";
import { compileCampaignFinish } from "./campaign-finish.js";
import { refreshCampaignFundingReview } from "./campaign-funding-review.js";
import { batchCampaignLocalDeliveries } from "./campaign-local-deliveries.js";
import { batchCampaignChainVisits } from "./campaign-chain-visits.js";
import { batchFundedCampaignVisits } from "./campaign-funded-visits.js";
import { attachCampaignSourceBookmarkAliases } from "./campaign-source-bookmarks.js";
import { expandCampaignDungeonObjectives } from "./campaign-dungeon-objectives.js";
import { deferCampaignStarterVisits } from "./campaign-starter-visits.js";
import { offerCampaignGroundVisits } from "./campaign-ground-visits.js";
import { selectSharedCampaignQuests } from "./campaign-shared-quests.js";
import { sharedCampaignQuestSources } from "./campaign-shared-source.js";
import { batchSharedStarterPickupVisit } from "./campaign-shared-pickup-visits.js";
import { batchSharedThanesVisit } from "./campaign-shared-thanes-visit.js";
import { retainCampaignBridgeQuests } from "./campaign-required-quests.js";
import {
  DEFAULT_INCIDENTAL_KILL_XP_PERCENT,
  DEFAULT_OUTDOOR_INCIDENTAL_KILL_XP_PERCENT,
} from "./campaign-incidental-combat.js";
import { offerWailingCavernsCatchUp } from "./campaign-wailing-caverns.js";
import { attachWailingCavernsAlternative } from "./campaign-wailing-caverns-alternative.js";
import { connectEarlyCampaignPreparation } from "./campaign-early-preparation.js";
import { connectCampaignStarterScouting } from "./campaign-starter-scouting.js";
import { resolveCampaignFallbackSources } from "./campaign-fallback-sources.js";
import { attachCampaignNpcWaits } from "./campaign-npc-waits.js";
import { attachCampaignQuestTiming } from "./campaign-quest-timing.js";
import { attachSleepingBagRoute } from "./campaign-sleeping-bag.js";
import { attachDoomedFleetRoute } from "./campaign-doomed-fleet.js";
import { stageEarlyScarletLibrary } from "./campaign-scarlet-library.js";
import { stageRazorfenEntrance } from "./campaign-razorfen-entrance.js";
import { carryCampaignBindingKeys } from "./campaign-binding-keys.js";
import { attachRivergladesXpPlaceholder } from "./campaign-xp-placeholder.js";
import { attachReviewedCampaignBossReferences } from "./campaign-boss-references.js";
import { batchCampaignSourceObjectives } from "./campaign-source-objectives.js";
import { attachDungeonPreparationCheckpoints } from "./campaign-dungeon-preparation.js";
import { campaignFundingStates, type CampaignFundingExecutor } from "./campaign-funding-scenarios.js";

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
  inputSources: readonly CampaignSource[],
  evidence: CampaignPreparationEvidence,
  options: {
    readonly sharedQuestsOnly?: true;
    readonly routeLock?: CampaignRouteLockContext;
    readonly routePrefix?: CampaignRoutePrefix;
    readonly fundingExecutor?: CampaignFundingExecutor;
  } = {},
): CampaignPlan {
  const statesForPlan = options.fundingExecutor ?? campaignFundingStates;
  const lockedActionIds = new Set(options.routeLock?.lock.actions.map((action) => action.id));
  const assertStage = (stage: string, candidate: CampaignPlan): void => {
    if (!options.routeLock) return;
    try {
      assertCampaignRouteLock(candidate, options.routeLock);
    } catch (error) {
      throw new Error(`Route preparation failed during ${stage}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  };
  if (options.routePrefix && !options.routeLock)
    throw new Error("Reusing a route prefix requires its current validation context.");
  const sharedQuestsOnly = options.sharedQuestsOnly ?? plan.sharedQuestsOnly;
  if (sharedQuestsOnly && !evidence.questCatalog)
    throw new Error("Shared ordinary quests require a matching quest catalog.");
  if (evidence.questCatalog && evidence.questCatalog.targetBuild !== plan.targetBuild)
    throw new Error("Quest funding catalog belongs to a different route build.");
  if (
    evidence.questCatalog &&
    plan.sourceArchiveSha256 &&
    evidence.questCatalog.sourceArchiveSha256 !== plan.sourceArchiveSha256
  )
    throw new Error("Quest funding catalog belongs to a different source archive.");
  const combat = evidence.combat;
  const data = combat?.data.targetBuild === plan.targetBuild
    ? attachReviewedCampaignBossReferences(combat.data) : undefined;
  if (options.routePrefix && !data)
    throw new Error("A validated route prefix requires matching combat references before preparation.");
  if (
    sharedQuestsOnly &&
    data &&
    evidence.questCatalog &&
    (evidence.questCatalog.providerRevision !== data.provider.revision ||
      evidence.questCatalog.questSha256 !== data.provider.questSha256 ||
      evidence.questCatalog.npcSha256 !== data.provider.npcSha256)
  )
    throw new Error("Shared quest catalog and combat provider references differ.");
  const sources =
    sharedQuestsOnly && evidence.questCatalog
      ? sharedCampaignQuestSources(
          inputSources,
          plan.race,
          new Set(
            evidence.questCatalog.quests
              .filter((quest) => quest.requiredClasses === 0)
              .map((quest) => quest.questId),
          ),
        )
      : inputSources;
  const rebuilt =
    plan.sourceArchiveSha256 &&
    ((sharedQuestsOnly && sources.length > 0) || data?.quests.some((quest) => quest.prerequisites))
      ? buildCampaignPlan(plan.race, plan.sourceArchiveSha256, sources, plan.leaderClass, {
          includeLibrary: plan.sourceLibraryEnabled !== false,
          ...(data ? { questReferences: data.quests } : {}),
          ...(sharedQuestsOnly ? { sharedQuestsOnly: true as const } : {}),
          ...(sharedQuestsOnly && plan.legs.every((leg) => leg.kind === "starter")
            ? { starterOnly: true }
            : {}),
        })
      : plan;
  const candidate =
    sharedQuestsOnly && evidence.questCatalog
      ? selectSharedCampaignQuests(rebuilt, evidence.questCatalog)
      : rebuilt;
  const combatPlanning: CampaignPlan = {
    ...candidate,
    ...(sharedQuestsOnly ? {
      incidentalKillXpPercent: plan.incidentalKillXpPercent ?? DEFAULT_INCIDENTAL_KILL_XP_PERCENT,
    } : {}),
    outdoorIncidentalKillXpPercent:
      plan.outdoorIncidentalKillXpPercent ?? DEFAULT_OUTDOOR_INCIDENTAL_KILL_XP_PERCENT,
  };
  const described = sources.length ? attachCampaignDungeonSources(combatPlanning, sources) : combatPlanning;
  const objectives = data ? expandCampaignDungeonObjectives(described, data) : described;
  const enriched =
    combat && data ? attachCampaignCombat(objectives, sources, data, combat.revision) : objectives;
  const resolved = evidence.questCatalog && data
    ? resolveCampaignFallbackSources(enriched, sources, data, evidence.questCatalog)
    : null;
  const catalog = resolved?.catalog ?? evidence.questCatalog;
  const sourced = resolved && resolved.plan !== enriched && combat && data
    ? attachCampaignCombat(resolved.plan, sources, data, combat.revision)
    : enriched;
  const selected = sources.length
    ? applyCampaignPartyQuestPolicy(sourced, sources, data, catalog)
    : sourced;
  const visits = batchCampaignVisits(
    batchCampaignDungeonFlow(attachCampaignLocations(selected, sources)),
    sources,
  );
  const located = batchCampaignDungeonFlow(
    attachCampaignLocations(attachCampaignFlightPaths(visits, sources), sources),
  );
  const routed = catalog
    ? batchSharedThanesVisit(
        batchSharedStarterPickupVisit(located, catalog),
        sources,
        catalog,
      )
    : located;
  const wanted = new Set([
    ...campaignRewardQuestIds({ ...routed, starters: evidence.starters }),
    ...(catalog?.quests.map((quest) => quest.questId) ?? []),
  ]);
  const funded = compileCampaignFunding(
    retainCampaignBridgeQuests(compileCampaignPickupGates({
      ...routed,
      starters: sharedQuestsOnly ? { entries: [], routes: [] } : evidence.starters,
      catchUpBatches: ((sharedQuestsOnly ? routed : plan).catchUpBatches ?? []).filter(
        isSupportedCatchUpBatch,
      ),
      rewardFacts: questCatalogRewardFacts(
        evidence.rewardFacts.filter((fact) => wanted.has(fact.questId)),
        catalog ?? null,
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
    })),
  );
  const orderedPickups = options.routePrefix && options.routeLock
    ? reuseCampaignRoutePrefix(funded, options.routePrefix, options.routeLock)
    : deferUnfundedStarterPickups(funded);
  assertStage("ordered pickups", orderedPickups);
  const outsideCheckpoints = attachDungeonPreparationCheckpoints(orderedPickups, options.routeLock?.lock.actions.length ?? 0);
  const sourceObjectives = batchCampaignSourceObjectives(outsideCheckpoints, options.routeLock?.lock.actions.length ?? 0);
  const retainedPrefix = combat && data && (options.routePrefix || sourceObjectives !== orderedPickups)
    ? attachCampaignCombat(sourceObjectives, sources, data, combat.revision)
    : sourceObjectives;
  assertStage("retained prefix combat", retainedPrefix);
  const questFunded =
    catalog && data
      ? fundCampaignQuestGaps(retainedPrefix, sources, data, catalog, { fundingExecutor: statesForPlan, minimumInsertionIndex: options.routeLock?.lock.actions.length ?? 0 })
      : retainedPrefix;
  assertStage("quest funded", questFunded);
  const libraryVisit = catalog && data
    ? stageEarlyScarletLibrary(questFunded, catalog, data)
    : questFunded;
  assertStage("library visit", libraryVisit);
  const localDeliveries =
    catalog && data
      ? batchCampaignLocalDeliveries(libraryVisit, data, catalog, statesForPlan)
      : libraryVisit;
  assertStage("local deliveries", localDeliveries);
  const chainVisits =
    catalog && data
      ? batchCampaignChainVisits(localDeliveries, data, catalog, statesForPlan)
      : localDeliveries;
  assertStage("chain visits", chainVisits);
  const fundedVisits =
    catalog && data
      ? batchFundedCampaignVisits(chainVisits, sources, data, catalog, statesForPlan, lockedActionIds)
      : chainVisits;
  assertStage("funded visits", fundedVisits);
  const starterVisits = catalog
    ? deferCampaignStarterVisits(fundedVisits, sources, catalog, statesForPlan)
    : fundedVisits;
  assertStage("starter visits", starterVisits);
  const renewedFunding =
    starterVisits !== fundedVisits && catalog && data
      ? batchFundedCampaignVisits(
          fundCampaignQuestGaps(starterVisits, sources, data, catalog, { fundingExecutor: statesForPlan, minimumInsertionIndex: options.routeLock?.lock.actions.length ?? 0 }),
          sources,
          data,
          catalog,
          statesForPlan,
          lockedActionIds,
        )
      : starterVisits;
  assertStage("renewed funding", renewedFunding);
  const groundVisits =
    catalog && data
      ? offerCampaignGroundVisits(renewedFunding, sources, data, catalog, statesForPlan)
      : renewedFunding;
  assertStage("ground visits", groundVisits);
  const settledFunding =
    groundVisits !== renewedFunding && catalog && data
      ? batchFundedCampaignVisits(
          fundCampaignQuestGaps(groundVisits, sources, data, catalog, { fundingExecutor: statesForPlan, minimumInsertionIndex: options.routeLock?.lock.actions.length ?? 0 }),
          sources,
          data,
          catalog,
          statesForPlan,
          lockedActionIds,
        )
      : groundVisits;
  assertStage("settled funding", settledFunding);
  const dungeonCatchUp =
    catalog && data
      ? offerWailingCavernsCatchUp(settledFunding, sources, data, catalog)
      : settledFunding;
  assertStage("dungeon catch up", dungeonCatchUp);
  const connectedPreparation = catalog && data
    ? connectEarlyCampaignPreparation(dungeonCatchUp, sources, data, catalog, statesForPlan)
    : dungeonCatchUp;
  assertStage("connected preparation", connectedPreparation);
  const scouted = catalog && data
    ? connectCampaignStarterScouting(connectedPreparation, sources, data, catalog)
    : connectedPreparation;
  assertStage("scouted", scouted);
  const settledPreparation = sharedQuestsOnly && catalog && data
    ? fundCampaignQuestGaps(scouted, sources, data, catalog, { includeCatalogApproaches: true, includeSourceDeliveries: true, fundingExecutor: statesForPlan, minimumInsertionIndex: options.routeLock?.lock.actions.length ?? 0 })
    : scouted;
  assertStage("settled preparation", settledPreparation);
  const connectedFunding = catalog && data
    ? connectEarlyCampaignPreparation(settledPreparation, sources, data, catalog, statesForPlan)
    : settledPreparation;
  assertStage("connected funding", connectedFunding);
  const sleepingBag = catalog ? attachSleepingBagRoute(connectedFunding, catalog) : connectedFunding;
  assertStage("sleeping bag", sleepingBag);
  const doomedFleet = catalog && data ? attachDoomedFleetRoute(sleepingBag, catalog, data) : sleepingBag;
  assertStage("doomed fleet", doomedFleet);
  const entranceVisit = catalog && data ? stageRazorfenEntrance(doomedFleet, catalog, data) : doomedFleet;
  assertStage("entrance visit", entranceVisit);
  const outdoorVisit = entranceVisit !== doomedFleet && combat && data
    ? attachCampaignCombat(entranceVisit, sources, data, combat.revision)
    : entranceVisit;
  assertStage("outdoor visit", outdoorVisit);
  const preparedFunding = outdoorVisit !== settledPreparation && catalog && data
    ? fundCampaignQuestGaps(outdoorVisit, sources, data, catalog, { includeCatalogApproaches: true, includeSourceDeliveries: true, fundingExecutor: statesForPlan, minimumInsertionIndex: options.routeLock?.lock.actions.length ?? 0 })
    : outdoorVisit;
  assertStage("prepared funding", preparedFunding);
  const connectedBag = catalog ? attachSleepingBagRoute(preparedFunding, catalog) : preparedFunding;
  assertStage("connected bag", connectedBag);
  const finalVisits = sharedQuestsOnly && catalog && data
    ? batchFundedCampaignVisits(connectedBag, sources, data, catalog, statesForPlan, lockedActionIds)
    : connectedBag;
  assertStage("final visits", finalVisits);
  const carriedKeys = sharedQuestsOnly && catalog
    ? carryCampaignBindingKeys(finalVisits, sources, catalog, statesForPlan, lockedActionIds)
    : finalVisits;
  assertStage("carried binding keys", carriedKeys);
  const plannedPlaceholder = attachRivergladesXpPlaceholder(carriedKeys);
  assertStage("planned XP placeholder", plannedPlaceholder);
  const placeholderFunding = plannedPlaceholder !== carriedKeys && catalog && data
    ? fundCampaignQuestGaps(plannedPlaceholder, sources, data, catalog, {
        includeCatalogApproaches: true, includeSourceDeliveries: true,
        fundingExecutor: statesForPlan, minimumInsertionIndex: options.routeLock?.lock.actions.length ?? 0,
      })
    : plannedPlaceholder;
  assertStage("placeholder continuation funding", placeholderFunding);
  const finish = catalog
    ? compileCampaignFinish(placeholderFunding, catalog)
    : placeholderFunding;
  assertStage("finish", finish);
  const finishedObjectives = data ? expandCampaignDungeonObjectives(finish, data) : finish;
  const completed =
    combat && data && finishedObjectives !== questFunded
      ? attachCampaignCombat(finishedObjectives, sources, data, combat.revision)
      : finishedObjectives;
  assertStage("completed", completed);
  const orderedChecks = alignCampaignPickupChecks(completed);
  assertStage("ordered checks", orderedChecks);
  const alternatives = catalog
    ? attachWailingCavernsAlternative(orderedChecks, catalog)
    : orderedChecks;
  assertStage("alternatives", alternatives);
  const reviewed =
    alternatives !== questFunded ? refreshCampaignFundingReview(alternatives, statesForPlan) : alternatives;
  assertStage("reviewed", reviewed);
  const result = attachCampaignSourceBookmarkAliases(
    attachCampaignSourceHints(
      attachCampaignMovements(attachCampaignLocations(reviewed, sources), sources),
      sources,
    ),
    sources,
  );
  assertStage("result", result);
  const explained = catalog ? attachCampaignNpcWaits(result, sources, catalog) : result;
  assertStage("explained", explained);
  const shared = sharedQuestsOnly && catalog
    ? selectSharedCampaignQuests(explained, catalog)
    : explained;
  assertStage("shared", shared);
  const prepared = catalog ? attachCampaignQuestTiming(shared, catalog) : shared;
  if (options.routeLock) assertCampaignRouteLock(prepared, options.routeLock);
  return prepared;
}
