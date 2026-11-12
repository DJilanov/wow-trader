import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { campaignActionZones } from "./campaign-geography.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP } from "./campaign-combat-policy.js";

const questId = 6626;
const visitId = "razorfen-outdoor-entrance";
const targets = [7873, 7874, 7872];

/** Complete the selected outdoor entrance quest on the actual journey into Desolace. */
export function stageRazorfenEntrance(
  plan: CampaignPlan,
  catalog: QuestCatalog,
  combat: CombatDataset,
): CampaignPlan {
  if (!plan.sharedQuestsOnly || plan.targetBuild !== 70205 ||
    catalog.targetBuild !== plan.targetBuild || combat.targetBuild !== plan.targetBuild ||
    catalog.sourceArchiveSha256 !== plan.sourceArchiveSha256 ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256 ||
    plan.actions.some((action) => action.id === `${visitId}-entry`)) return plan;

  const quest = catalog.quests.find((entry) => entry.questId === questId);
  const reference = combat.quests.find((entry) => entry.questId === questId);
  const npcs = targets.map((id) => combat.npcs.find((npc) => npc.id === id));
  // The journal category is Razorfen Downs; its giver and all three death counters are outside.
  if (!quest || quest.requiredClasses !== 0 || quest.requiredRaces !== 0 || quest.minimumLevel !== 28 ||
    quest.prerequisites.allOf.length || quest.prerequisites.anyOf.length || quest.exclusiveWith.length ||
    quest.category !== "shared-kills" || quest.unsupportedRequirements.some((value) => value !== "non-outdoor-zone") ||
    ![quest.starts, quest.ends].every((entries) => entries.length === 1 && entries[0]!.npcId === 12866 &&
      entries[0]!.friendlyToAlliance && entries[0]!.positions.length > 0 && entries[0]!.positions.every((position) => position.zone === "1413")) ||
    quest.objectives.length !== 3 || reference?.onlyCreatureObjectives !== true || reference.killQuotas?.length !== 3 ||
    !targets.every((id, index) => quest.objectives.some((objective) => objective.index === index + 1 &&
      objective.npcId === id && objective.count === 8 && objective.positions.length > 0 &&
      objective.positions.every((position) => ["1413", "1441"].includes(position.zone))) &&
      reference.killQuotas!.some((quota) => quota.objectiveIndex === index + 1 && quota.npcId === id && quota.kills === 8)) ||
    npcs.some((npc) => !npc || npc.minimumLevel !== 33 || npc.maximumLevel !== 34 || npc.rank !== 1 ||
      !npc.zoneIds.length || npc.zoneIds.some((id) => ![17, 400].includes(id)))) return plan;

  const handoff = plan.actions.find((action) => action.questChanges.some((change) => change.questId === 1267 && change.state === "rewarded"));
  const leg = plan.legs.find((entry) => entry.id === handoff?.legId);
  const handoffIndex = handoff ? plan.actions.indexOf(handoff) : -1;
  const at = plan.actions.findIndex((action, index) => index > handoffIndex &&
    action.legId === leg?.id && campaignActionZones(action).length === 1 &&
    campaignActionZones(action).includes("1443"));
  if (!handoff || !leg || leg.kind !== "preparation" ||
    !campaignActionZones(handoff).includes("1445") || at <= handoffIndex ||
    plan.actions.slice(handoffIndex, at).some((action) => action.legId !== leg.id)) return plan;
  const departure = plan.actions.slice(handoffIndex, at).reverse().find((action) =>
    !action.leaderOnly && !action.movement && !["checkpoint", "xp-check"].includes(action.kind) &&
    action.positions.length > 0);
  const origins = departure ? campaignActionZones(departure) : [];
  const origin = origins.length === 1 ? origins[0] : undefined;
  const phases = plan.actions.filter((action) => action.questChanges.some((change) => change.questId === questId));
  if (phases.length !== 3 || phases.some((action) => action.source || action.leaderOnly || action.raidOnly ||
    action.dungeonFinishOnly || action.bundleId || plan.actions.indexOf(action) < at ||
    action.questChanges.some((change) => change.questId !== questId))) return plan;
  const pickup = phases.find((action) => action.questChanges.length === 1 && action.questChanges[0]!.state === "accepted");
  const work = phases.find((action) => action.questChanges.length === 3 && targets.every((_, index) =>
    action.questChanges.some((change) => change.state === "objectives-complete" && change.objectiveIndex === index + 1)));
  const reward = phases.find((action) => action.questChanges.length === 1 && action.questChanges[0]!.state === "rewarded");
  const outward = origin ? campaignGroundJourney(origin, "1413") : null;
  const onward = campaignGroundJourney("1413", "1443");
  if (!pickup || !work || !reward || !outward || !onward) return plan;

  const entryLevel = Math.max(quest.minimumLevel, ...npcs.map((npc) => npc!.maximumLevel! - MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP));
  const utility = (suffix: string, zone: string, title: string, instructions: readonly string[]): CampaignAction => ({
    id: `${visitId}-${suffix}`, legId: leg.id, kind: "instructions", title, instructions, source: null,
    positions: [], questChanges: [], leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    optionalForQuestIds: [questId], location: { zone, visitOverride: true },
  });
  const moved = (action: CampaignAction): CampaignAction => ({
    ...action, legId: leg.id, location: { zone: "1413", visitOverride: true }, combatEnvironment: "outdoor",
  });
  const trip = [
    utility("travel", "1413", "Clear the Razorfen entrance on the way to Desolace", outward.map((link) => link.instruction)),
    { ...utility("entry", "1413", `Razorfen entrance: level ${entryLevel} or higher`,
      ["Stay outside the instance portal. Clear the entrance together: eight Battleguards, eight Thornweavers and eight Death's Head Cultists. The five players share each kill's quest credit."]),
      kind: "checkpoint" as const, targetLevel: entryLevel },
    moved(pickup), moved(work), moved(reward),
    utility("onward", "1443", "Continue to Brother Anton in Desolace", onward.map((link) => link.instruction)),
  ];
  const removed = new Set(phases.map((action) => action.id));
  const actions = plan.actions.flatMap((action, index): readonly CampaignAction[] => [
    ...(index === at ? trip : []), ...(removed.has(action.id) ? [] : [action]),
  ]);
  const changedLegs = new Set([leg.id, ...phases.map((action) => action.legId)]);
  return { ...plan, actions, legs: plan.legs.map((entry) => {
    if (!changedLegs.has(entry.id)) return entry;
    const entries = actions.filter((action) => action.legId === entry.id);
    return { ...entry, actionIds: entries.map((action) => action.id),
      questIds: [...new Set([...entry.questIds.filter((id) => id !== questId),
        ...entries.flatMap((action) => action.questChanges.map((change) => change.questId))])] };
  }) };
}
