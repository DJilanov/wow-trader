import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { campaignZoneId, campaignZoneInText } from "./campaign-geography.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { regressedFundingScenarios } from "./campaign-funding-quality.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { isGroundPickupFundingQuest, type QuestCatalog } from "./quest-catalog.js";

const anchors = [
  { id: "start-117-117-source-step-0076", zone: "1453" },
  { id: "start-117-117-source-step-0084", zone: "1436" },
  { id: "start-116-116-source-step-0242", zone: "1453" },
] as const;
const checkpointId = "early-party-kills-departure-level-14-before-thanes";

/** Offer the compass during an existing town/chest/return journey, retaining the later fallback. */
export function offerCampaignGroundVisits(
  initial: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    initial.race !== "human" ||
    initial.targetBuild !== catalog.targetBuild ||
    catalog.targetBuild !== combat.targetBuild ||
    initial.sourceArchiveSha256 !== catalog.sourceArchiveSha256 ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256 ||
    !catalog.itemSha256 ||
    catalog.itemSha256 !== combat.provider.itemSha256 ||
    !catalog.objectSha256 ||
    catalog.objectSha256 !== combat.provider.objectSha256 ||
    combat.questCatalogReference?.sourceArchiveSha256 !== initial.sourceArchiveSha256 ||
    combat.questCatalogReference.providerRevision !== catalog.providerRevision
  )
    return initial;
  const quest = catalog.quests.find((entry) => entry.questId === 399);
  const ground = quest?.groundPickup;
  const reference = combat.quests.find((entry) => entry.questId === 399);
  const item = reference?.itemObjectives?.[0];
  if (
    !quest ||
    !ground ||
    !isGroundPickupFundingQuest(quest) ||
    ground.sourceArchiveSha256 !== initial.sourceArchiveSha256 ||
    ground.questId !== quest.questId ||
    reference?.itemObjectives?.length !== 1 ||
    reference.creatureIds.length ||
    reference.itemCreatureIds.length ||
    reference.killQuotas?.length ||
    reference.killQuotaConflicts?.length ||
    !item ||
    item.quantity !== 1 ||
    item.provided ||
    item.npcIds.length ||
    item.itemId !== ground.itemId ||
    item.objectiveIndex !== ground.objectiveIndex ||
    JSON.stringify(item.groundPickup) !== JSON.stringify(ground)
  )
    return initial;
  const native = campaignNativeInstructions(initial, sources);
  const visits = anchors.map((anchor) => initial.actions.find((action) => action.id === anchor.id));
  if (
    visits.some(
      (action) =>
        !action ||
        !action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        initial.legs.find((leg) => leg.id === action.legId)?.kind !== "starter",
    )
  )
    return initial;
  const reached = visits.filter((action): action is CampaignAction => action !== undefined);
  const indices = reached.map((action) => initial.actions.indexOf(action));
  if (!(indices[0]! < indices[1]! && indices[1]! < indices[2]!)) return initial;
  for (const [index, action] of reached.entries()) {
    const transfer = native(action)?.directives.find((row) =>
      [".fly", ".hs", ".zone"].includes(row.tag),
    );
    const zones = new Set(action.positions.map(({ position }) => campaignZoneId(position.zone)));
    const arrival =
      action.movement?.destination ??
      (transfer
        ? (campaignZoneId(transfer.arguments.split(",")[0]!) ?? campaignZoneInText(transfer.text))
        : zones.size === 1
          ? [...zones][0]
          : null);
    if (arrival !== anchors[index]!.zone) return initial;
  }
  const later = initial.actions.filter((action) =>
    action.questChanges.some((change) => change.questId === quest.questId),
  );
  const states = ["accepted", "objectives-complete", "rewarded"] as const;
  const locations = [
    quest.starts.filter((giver) => giver.friendlyToAlliance).flatMap((giver) => giver.positions),
    ground.positions,
    quest.ends.filter((giver) => giver.friendlyToAlliance).flatMap((giver) => giver.positions),
  ];
  if (
    later.length !== 3 ||
    new Set(later.map((action) => action.fundingCheckpointId)).size !== 1 ||
    later.some(
      (action, index) =>
        action.source !== null ||
        action.kind !== "quests" ||
        action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        action.bundleId ||
        action.libraryRequired ||
        action.libraryBackbone ||
        !action.xpOptional ||
        !action.fundingCheckpointId ||
        action.libraryQuestId !== quest.questId ||
        action.libraryObjective !== "interaction" ||
        action.itemCollections?.length ||
        action.questChanges.length !== 1 ||
        action.questChanges[0]!.state !== states[index] ||
        action.questChanges[0]!.objectiveIndex !== (index === 1 ? ground.objectiveIndex : null) ||
        initial.actions.indexOf(action) <= indices[2]! ||
        !action.positions.length ||
        action.positions.some(
          ({ position }) =>
            position.space !== "map-percent" ||
            position.zone !== anchors[index]!.zone ||
            !locations[index]!.some(
              (point) =>
                point.zone === position.zone && point.x === position.x && point.y === position.y,
            ),
        ),
    ) ||
    !initial.actions.some(
      (action) =>
        action.id === checkpointId && action.targetLevel === 14 && action.kind === "xp-check",
    )
  )
    return initial;
  const early = later.map((action, index): CampaignAction => ({
    ...action,
    id: `quest-funding-starter-ground-399-${states[index]}-${index === 1 ? ground.objectiveIndex : 0}`,
    legId: reached[index]!.legId,
    leaderOnly: true,
    xpTargetLevel: 14,
    fundingCheckpointId: checkpointId,
    fundingGroundPickup: ground,
  }));
  if (early.some((action) => initial.actions.some((existing) => existing.id === action.id)))
    return initial;
  const byAnchor = new Map(reached.map((action, index) => [action.id, early[index]!]));
  const laterIds = new Set(later.map((action) => action.id));
  const actions = initial.actions.flatMap((action) => {
    const copy = laterIds.has(action.id) ? { ...action, fundingGroundPickup: ground } : action;
    const addition = byAnchor.get(action.id);
    return addition ? [copy, addition] : [copy];
  });
  const proposed = attachCampaignCombat(
    {
      ...initial,
      actions,
      legs: initial.legs.map((leg) => ({
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
    },
    sources,
    combat,
    initial.combat?.revision ?? "ground-visit-review",
  );
  const before = campaignFundingStates(initial);
  const after = campaignFundingStates(proposed);
  if (
    regressedFundingScenarios(initial, before, after).length ||
    after.some((state) => {
      const party = guidePartyScenario(proposed, state.progress, state.starterMode);
      return (
        auditCampaignQuestLog(party.plan, party.progress, party).some(
          (member) => !member.withinCapacity,
        ) ||
        state.progress.members.some(
          (_member, player) =>
            !state.forecast.some((section) =>
              section.members[player]!.steps.some(
                (step) =>
                  step.actionId.replace(/^guide-player-[2-5]-/, "") === early[0]!.id &&
                  step.questId === quest.questId &&
                  step.phase === "accepted" &&
                  step.status === "projected" &&
                  step.before !== null &&
                  step.before.level >= quest.minimumLevel!,
              ),
            ),
        )
      );
    })
  )
    return initial;
  return proposed;
}
