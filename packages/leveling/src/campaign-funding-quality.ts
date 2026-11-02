import type { CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import type { CampaignFundingCollection } from "./campaign-funding-collections.js";
import {
  campaignFundingCheckpoints,
  campaignFundingScenarioKey,
  type CampaignFundingState,
} from "./campaign-funding-scenarios.js";

interface FundingFrontier {
  readonly index: number;
  readonly actionId: string;
  readonly missingXp: number | null;
}

/** New or rescheduled party combat must fit every configuration that reaches the task. */
export function unsafePartyFundingScenarios(
  baseline: CampaignPlan,
  proposed: readonly CampaignFundingState[],
  catalog: QuestCatalog,
  combat: CombatDataset,
  collections?: ReadonlyMap<number, CampaignFundingCollection>,
  rescheduledActionIds: ReadonlySet<string> = new Set(),
): readonly string[] {
  const originalIds = new Set(baseline.actions.map((action) => action.id));
  const quests = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const npcs = new Map(combat.npcs.map((npc) => [npc.id, npc]));
  return proposed.flatMap((state) => {
    const unsafe = state.actions.some((action) => {
      if ((originalIds.has(action.id) && !rescheduledActionIds.has(action.id)) || action.leaderOnly)
        return false;
      return action.questChanges.some((change) => {
        const quest = quests.get(change.questId);
        const collection = collections?.get(change.questId);
        if (
          change.state !== "objectives-complete" ||
          (quest?.category !== "shared-kills" && !collection)
        )
          return false;
        const steps = state.forecast.flatMap((section) =>
          section.members.flatMap((member) =>
            member.steps.filter(
              (step) =>
                step.actionId === action.id &&
                step.questId === change.questId &&
                step.phase === change.state &&
                step.objectiveIndex === change.objectiveIndex &&
                step.status === "projected",
            ),
          ),
        );
        if (!steps.length) return false;
        if (steps.length !== 5 || steps.some((step) => step.before === null)) return true;
        const ceiling = Math.min(...steps.map((step) => step.before!.level)) + 3;
        const objectives = collection
          ? collection.objectiveIndex === change.objectiveIndex
            ? [{ npcId: collection.npcId }]
            : []
          : quest!.objectives.filter((objective) => objective.index === change.objectiveIndex);
        return (
          !objectives.length ||
          objectives.some((objective) => {
            const npc = npcs.get(objective.npcId);
            return (
              !npc ||
              (npc.rank !== 0 && npc.rank !== 1) ||
              npc.maximumLevel === null ||
              npc.maximumLevel > ceiling
            );
          })
        );
      });
    });
    return unsafe ? [campaignFundingScenarioKey(state)] : [];
  });
}

/** Compare the first unsupported task on the same source itinerary, not chapter labels. */
export function regressedFundingScenarios(
  initial: CampaignPlan,
  baseline: readonly CampaignFundingState[],
  proposed: readonly CampaignFundingState[],
  options: { readonly allowLargerDeficitAtSameAction?: boolean } = {},
): readonly string[] {
  const order = new Map(initial.actions.map((action, index) => [action.id, index]));
  function frontier(state: CampaignFundingState, player: number): FundingFrontier | null {
    const checkpoints = campaignFundingCheckpoints(state, player).filter((row) => !row.ready);
    const blocked = state.forecast.flatMap((section) =>
      section.members[player]!.steps.filter((step) => step.status === "blocked"),
    );
    const rows = [
      ...checkpoints.map((row) => ({ actionId: row.actionId, missingXp: row.missingXp })),
      ...blocked.map((row) => ({ actionId: row.actionId, missingXp: row.shortfallXp || null })),
    ].map((row) => {
      const action = state.actions.find((entry) => entry.id === row.actionId);
      const sourceIndex = action?.source
        ? initial.actions.findIndex(
            (original) =>
              original.source?.chapterId === action.source!.chapterId &&
              original.source.version === action.source!.version &&
              original.source.stepId === action.source!.stepId &&
              original.questChanges.some((change) =>
                action.questChanges.some(
                  (next) =>
                    change.questId === next.questId &&
                    change.state === next.state &&
                    change.objectiveIndex === next.objectiveIndex,
                ),
              ),
          )
        : -1;
      const pickupIndex = action?.pickupQuestId
        ? initial.actions.findIndex(
            (original) =>
              original.legId === action.legId &&
              original.questChanges.some(
                (change) => change.questId === action.pickupQuestId && change.state === "accepted",
              ),
          )
        : -1;
      const index =
        order.get(row.actionId) ??
        order.get(action?.fundingCheckpointId ?? "") ??
        (sourceIndex >= 0 ? sourceIndex : pickupIndex >= 0 ? pickupIndex : undefined);
      return { ...row, index: index ?? -1 };
    });
    return rows.sort((left, right) => left.index - right.index)[0] ?? null;
  }
  const before = new Map(baseline.map((state) => [campaignFundingScenarioKey(state), state]));
  return proposed.flatMap((state) => {
    const key = campaignFundingScenarioKey(state);
    const old = before.get(key);
    if (!old) throw new Error("Funding quality comparison is missing a party configuration.");
    const regressed = state.progress.members.some((_member, player) => {
      const a = frontier(old, player);
      const b = frontier(state, player);
      if (!b) return false;
      if (!a || b.index < a.index) return true;
      return (
        !options.allowLargerDeficitAtSameAction &&
        b.index === a.index &&
        b.actionId === a.actionId &&
        a.missingXp !== null &&
        (b.missingXp === null || b.missingXp > a.missingXp)
      );
    });
    return regressed ? [key] : [];
  });
}
