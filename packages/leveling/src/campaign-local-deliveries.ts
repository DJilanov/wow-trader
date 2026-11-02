import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { isUnrestrictedFundingQuest } from "./quest-catalog.js";
import { npcDeliveryRecipients } from "./quest-catalog-delivery.js";
import {
  campaignFundingProgressBefore,
  campaignFundingStates,
  campaignFundingCheckpoints,
  type CampaignFundingState,
} from "./campaign-funding-scenarios.js";
import { regressedFundingScenarios } from "./campaign-funding-quality.js";
import { campaignZoneId } from "./campaign-geography.js";

// These are authored settlement visits, not a rule that any two NPCs in a zone are nearby.
const placements = [{ questId: 4761, legId: "early-darkshore-kills", afterQuestId: 985 }] as const;

function partyZoneVisits(state: CampaignFundingState): number {
  const projected = new Set(
    state.forecast.flatMap((section) =>
      section.members.flatMap((member) =>
        member.steps.filter((step) => step.status === "projected").map((step) => step.actionId),
      ),
    ),
  );
  const order = new Map(state.actions.map((action, index) => [action.id, index]));
  const firstBlock = Math.min(
    state.actions.length,
    ...state.progress.members.flatMap((_member, player) =>
      campaignFundingCheckpoints(state, player)
        .filter((checkpoint) => !checkpoint.ready)
        .map((checkpoint) => order.get(checkpoint.actionId) ?? Infinity),
    ),
    ...state.forecast.flatMap((section) =>
      section.members.flatMap((member) =>
        member.steps
          .filter((step) => step.status === "blocked")
          .map((step) => order.get(step.actionId) ?? Infinity),
      ),
    ),
  );
  let previous: string | null = null;
  let visits = 0;
  for (const action of state.actions.slice(0, firstBlock)) {
    if (
      action.leaderOnly ||
      (action.kind !== "instructions" && !projected.has(action.id)) ||
      ["checkpoint", "xp-check"].includes(action.kind) ||
      action.movement ||
      action.nativeUtilityTags?.some((tag) => [".fly", ".hs", ".zone"].includes(tag))
    )
      continue;
    const zones = new Set(
      action.positions.flatMap(({ position }) => campaignZoneId(position.zone) ?? []),
    );
    if (zones.size !== 1) continue;
    const zone = [...zones][0]!;
    if (zone !== previous) visits++;
    previous = zone;
  }
  return visits;
}

function canAccept(
  quest: QuestCatalogEntry,
  member: ReturnType<typeof campaignFundingProgressBefore>["members"][number],
  additionalPrerequisites: readonly number[],
): boolean {
  const states = member.questStates;
  return (
    member.level !== null &&
    member.level >= quest.minimumLevel! &&
    (!states[String(quest.questId)] || states[String(quest.questId)] === "not-started") &&
    quest.prerequisites.allOf.every((id) => states[String(id)] === "rewarded") &&
    additionalPrerequisites.every((id) => states[String(id)] === "rewarded") &&
    (!quest.prerequisites.anyOf.length ||
      quest.prerequisites.anyOf.some((id) => states[String(id)] === "rewarded")) &&
    quest.exclusiveWith.every((id) => !states[String(id)] || states[String(id)] === "not-started")
  );
}

/** Finish selected settlement deliveries during an earlier, already-required NPC visit. */
export function batchCampaignLocalDeliveries(
  initial: CampaignPlan,
  combat: CombatDataset,
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    initial.targetBuild !== catalog.targetBuild ||
    catalog.targetBuild !== combat.targetBuild ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256
  )
    return initial;
  let plan = initial;
  const quests = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  for (const placement of placements) {
    const quest = quests.get(placement.questId);
    const recipients =
      quest &&
      npcDeliveryRecipients(
        quest,
        combat.quests.find((reference) => reference.questId === placement.questId),
      );
    if (
      !quest ||
      !recipients?.length ||
      !isUnrestrictedFundingQuest({ ...quest, unsupportedRequirements: [] })
    )
      continue;
    const moved = plan.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === placement.questId),
    );
    if (
      moved.length !== 2 ||
      moved[0]!.questChanges[0]?.state !== "accepted" ||
      moved[1]!.questChanges[0]?.state !== "rewarded" ||
      moved[0]!.fundingCheckpointId !== moved[1]!.fundingCheckpointId ||
      moved[0]!.legId !== moved[1]!.legId ||
      moved.some(
        (action) =>
          action.questChanges.length !== 1 ||
          action.kind !== "quests" ||
          action.source !== null ||
          action.leaderOnly ||
          action.raidOnly ||
          action.dungeonFinishOnly ||
          !action.xpOptional ||
          !action.fundingCheckpointId ||
          action.nativeUtilityTags?.length,
      )
    )
      continue;
    const anchorIndex = plan.actions.findIndex(
      (action) =>
        action.legId === placement.legId &&
        !action.leaderOnly &&
        action.kind === "quests" &&
        !action.raidOnly &&
        !action.dungeonFinishOnly &&
        !action.fundingCheckpointId &&
        action.questChanges.some(
          (change) => change.questId === placement.afterQuestId && change.state === "rewarded",
        ),
    );
    const anchor = plan.actions[anchorIndex];
    const earlier = quests.get(placement.afterQuestId);
    if (
      !anchor ||
      !earlier ||
      plan.actions.indexOf(moved[0]!) <= anchorIndex ||
      (plan.actions[anchorIndex + 1]?.id === moved[0]!.id &&
        moved.every((action) => action.legId === anchor.legId)) ||
      !earlier.ends.some((giver) => quest.starts.some((start) => start.npcId === giver.npcId))
    )
      continue;
    const zones = anchor.positions.flatMap(({ position }) => campaignZoneId(position.zone) ?? []);
    const oldIndex = plan.actions.indexOf(moved[0]!);
    const previousZone = [...plan.actions.slice(0, oldIndex)]
      .reverse()
      .filter((action) => !["checkpoint", "xp-check"].includes(action.kind))
      .flatMap((action) => action.positions)
      .map(({ position }) => campaignZoneId(position.zone))
      .find((zone) => zone !== null);
    if (!previousZone || zones.includes(previousZone)) continue;
    if (
      !zones.length ||
      quest.starts.some((giver) =>
        giver.positions.some((position) => !zones.includes(position.zone)),
      ) ||
      recipients.some((giver) => giver.positions.some((position) => !zones.includes(position.zone)))
    )
      continue;
    const before = campaignFundingStates(plan);
    let reachable = false;
    let eligible = true;
    for (const state of before) {
      const index = state.actions.findIndex((action) => action.id === anchor.id);
      const next = state.actions[index + 1];
      if (index < 0 || !next) continue;
      const progress = campaignFundingProgressBefore(state, next.id);
      // An earlier blocked route stays blocked; it cannot prove a new available visit.
      const known = progress.members.filter(
        (member) => member.level !== null && member.currentXp !== null,
      );
      if (!known.length) continue;
      reachable = true;
      if (known.some((member) => !canAccept(quest, member, moved[0]!.requiredQuestIds ?? [])))
        eligible = false;
    }
    if (!reachable || !eligible) continue;
    const ids = new Set(moved.map((action) => action.id));
    const actions: CampaignAction[] = plan.actions.flatMap((action) => {
      if (ids.has(action.id)) return [];
      return action.id === anchor.id
        ? [action, ...moved.map((entry) => ({ ...entry, legId: anchor.legId }))]
        : [action];
    });
    const proposed: CampaignPlan = {
      ...plan,
      actions,
      legs: plan.legs.map((leg) => ({
        ...leg,
        actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
        questIds: [
          ...new Set(
            actions
              .filter((action) => action.legId === leg.id)
              .flatMap((action) => action.questChanges.map((change) => change.questId)),
          ),
        ],
      })),
    };
    const after = campaignFundingStates(proposed);
    const savedVisits = before.map(
      (state, index) => partyZoneVisits(state) - partyZoneVisits(after[index]!),
    );
    const addsOptionalWork = before.some((state, index) => {
      const skippedBefore = new Set(
        state.forecast.flatMap((section) => section.skippedOptionalActionIds),
      );
      const skippedAfter = new Set(
        after[index]!.forecast.flatMap((section) => section.skippedOptionalActionIds),
      );
      return [...skippedBefore].some((id) => !skippedAfter.has(id));
    });
    // Earlier XP can reduce later kill rewards. Shorter travel must still preserve
    // every configuration's reached requirements and its actual reward amounts.
    if (
      savedVisits.some((saved) => saved > 0) &&
      savedVisits.every((saved) => saved >= 0) &&
      !addsOptionalWork &&
      !regressedFundingScenarios(plan, before, after, { allowLargerDeficitAtSameAction: true })
        .length
    )
      plan = proposed;
  }
  return plan;
}
