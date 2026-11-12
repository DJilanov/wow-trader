import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { campaignSourceDeliveries } from "./campaign-source-deliveries.js";
import { campaignSourcePrerequisites } from "./campaign-source-prerequisites.js";

interface CampaignSourceQuestProgram {
  readonly quest: QuestCatalogEntry;
  readonly actions: readonly CampaignAction[];
  readonly generatedKillObjectives?: true;
}

export interface CampaignResolvedSources {
  readonly plan: CampaignPlan;
  readonly catalog: QuestCatalog;
}

/** Replace only unsourced generic tasks when a complete captured method proves their work. */
export function resolveCampaignFallbackSources(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
): CampaignResolvedSources {
  const unchanged = { plan, catalog };
  if (!plan.sharedQuestsOnly || plan.race !== "human") return unchanged;
  const ids = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  const candidates = new Map<number, readonly CampaignAction[]>();
  for (const id of ids) {
    const actions = plan.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === id),
    );
    const changes = actions.flatMap((action) => action.questChanges);
    if (
      actions.some(
        (action) =>
          action.source !== null ||
          action.kind !== "quests" ||
          action.leaderOnly ||
          action.raidOnly ||
          action.dungeonFinishOnly ||
          action.questChanges.some((change) => change.questId !== id) ||
          action.itemCollections?.length ||
          action.auctionSupplies?.length ||
          action.nativeUtilityTags?.length ||
          action.optionalForQuestIds?.length ||
          action.sourceGateConflictQuestIds?.length,
      ) ||
      new Set(actions.map((action) => action.legId)).size !== 1 ||
      changes.filter((change) => change.state === "accepted").length !== 1 ||
      changes.filter((change) => change.state === "rewarded").length !== 1
    )
      continue;
    candidates.set(id, actions);
  }
  if (!candidates.size) return unchanged;
  const unselected = {
    ...plan,
    actions: plan.actions.filter(
      (action) => !action.questChanges.some((change) => candidates.has(change.questId)),
    ),
  };
  const programs = new Map<number, CampaignSourceQuestProgram>([
    ...campaignSourceDeliveries(unselected, sources, combat, catalog),
  ]);
  for (const [id, parents] of campaignSourcePrerequisites(plan, sources, combat, catalog)) {
    const old = candidates.get(id),
      quest = catalog.quests.find((entry) => entry.questId === id);
    if (!old || !quest) continue;
    const phases = old.flatMap((action) => action.questChanges);
    const counters = phases.filter((change) => change.state === "objectives-complete");
    if (
      phases[0]?.state !== "accepted" ||
      phases.at(-1)?.state !== "rewarded" ||
      counters.length !== quest.objectives.length ||
      quest.objectives.some(
        (objective) =>
          counters.filter((change) => change.objectiveIndex === objective.index).length !== 1,
      )
    )
      continue;
    programs.set(id, {
      quest: {
        ...quest,
        unsupportedRequirements: [],
        prerequisites: { ...quest.prerequisites, allOf: [...parents] },
      },
      actions: old.map((action) =>
        action.questChanges.some((change) => change.state === "accepted")
          ? { ...action, requiredQuestIds: parents }
          : action,
      ),
      generatedKillObjectives: true,
    });
  }
  const replacements = new Map<number, readonly CampaignAction[]>(),
    aliases = { ...plan.bookmarkAliases };
  const resolved = new Map<number, CampaignSourceQuestProgram>();
  const samePhase = (left: CampaignAction, right: CampaignAction): boolean =>
    left.questChanges.some((a) =>
      right.questChanges.some(
        (b) =>
          a.questId === b.questId && a.state === b.state && a.objectiveIndex === b.objectiveIndex,
      ),
    );
  for (const [id, old] of candidates) {
    const program = programs.get(id);
    if (
      !program ||
      (!program.generatedKillObjectives &&
        program.actions.some((action) => !action.source || action.questChanges.length !== 1))
    )
      continue;
    const parents = new Set([
      ...program.quest.prerequisites.allOf,
      ...program.quest.prerequisites.anyOf,
      ...(program.actions.find((action) => action.questChanges[0]!.state === "accepted")
        ?.requiredQuestIds ?? []),
    ]);
    if (old.some((action) => action.requiredQuestIds?.some((parent) => !parents.has(parent))))
      continue;
    const used = new Set<string>();
    const actions = program.actions.map((action): CampaignAction => {
      const previous = old.find((entry) => !used.has(entry.id) && samePhase(entry, action));
      const actionId = previous?.id ?? action.id;
      used.add(actionId);
      return {
        ...(previous ?? old[0]!),
        ...action,
        id: actionId,
        legId: old[0]!.legId,
        libraryQuestId: id,
      };
    });
    if (
      new Set(actions.map((action) => action.id)).size !== actions.length ||
      actions.some((action) =>
        plan.actions.some((entry) => entry.id === action.id && !old.includes(entry)),
      )
    )
      continue;
    for (const action of old) {
      const destination =
        actions.find((entry) => samePhase(action, entry)) ??
        actions.find((entry) => entry.questChanges[0]!.state === "rewarded");
      if (destination && destination.id !== action.id) aliases[action.id] = destination.id;
    }
    replacements.set(id, actions);
    resolved.set(id, program);
  }
  if (!replacements.size) return unchanged;
  const emitted = new Set<number>();
  const actions = plan.actions.flatMap((action): readonly CampaignAction[] => {
    const id = action.questChanges.find((change) => replacements.has(change.questId))?.questId;
    if (id === undefined) return [action];
    if (emitted.has(id)) return [];
    emitted.add(id);
    return replacements.get(id)!;
  });
  return {
    plan: {
      ...plan,
      actions,
      bookmarkAliases: aliases,
      legs: plan.legs.map((leg) => ({
        ...leg,
        actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      })),
    },
    catalog: {
      ...catalog,
      quests: catalog.quests.map((quest) => resolved.get(quest.questId)?.quest ?? quest),
    },
  };
}
