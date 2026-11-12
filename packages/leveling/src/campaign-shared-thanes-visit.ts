import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";

const unlocks = new Set([96392, 96390, 96391]);

/** Complete the existing level-nine Thanes lead-ins on the first Dun Morogh visit. */
export function batchSharedThanesVisit(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    !plan.sharedQuestsOnly ||
    plan.race !== "human" ||
    plan.targetBuild !== catalog.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256
  )
    return plan;
  const target = plan.legs.find((leg) => leg.id === "start-116");
  const visit = plan.legs.find((leg) => leg.id === "ironforge-rendezvous");
  if (!target || !visit || visit.unresolvedQuestIds.length) return plan;
  for (const questId of unlocks) {
    const quest = catalog.quests.find((entry) => entry.questId === questId);
    if (
      quest?.minimumLevel !== 9 ||
      quest.requiredClasses !== 0 ||
      !quest.ends.some(
        (npc) => npc.npcId === 264936 && npc.positions.some((point) => point.zone === "1426"),
      )
    )
      return plan;
  }
  const own = plan.actions.filter((action) => action.legId === visit.id);
  const brief = own.find((entry) => entry.id.endsWith("-brief"));
  const moved = own.filter((action) => action.kind === "quests");
  if (
    !brief ||
    !moved.length ||
    own.some((action) => action.kind !== "quests" && !action.id.endsWith("-brief")) ||
    moved.some(
      (action) =>
        action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        action.requiredQuestIds?.some((id) => !unlocks.has(id)) ||
        action.questChanges.some((change) => !unlocks.has(change.questId)) ||
        (action.source !== null &&
          !sources.some(
            ({ reference, guide }) =>
              reference.sourceId === 116 &&
              guide.targetBuild === plan.targetBuild &&
              guide.chapterId === action.source!.chapterId &&
              guide.version === action.source!.version,
          )),
    ) ||
    [...unlocks].some((id) =>
      ["accepted", "objectives-complete", "rewarded"].some(
        (state) =>
          !moved.some((action) =>
            action.questChanges.some((change) => change.questId === id && change.state === state),
          ),
      ),
    )
  )
    return plan;
  const last = plan.actions.filter((action) => action.legId === target.id).at(-1);
  if (!last || plan.actions.indexOf(last) >= plan.actions.indexOf(moved[0]!)) return plan;
  const actions = plan.actions.flatMap((action): CampaignAction[] => {
    if (action.legId === visit.id) return [];
    if (action !== last) return [action];
    return [
      action,
      {
        ...brief,
        id: `${target.id}-thanes-unlocks-brief`,
        legId: target.id,
        title: "Dun Morogh: finish the Thanes lead-ins",
        instructions: [
          "After the eastern trogg hand-ins, return to Earthseer Farsen in Dun Morogh.",
          "Borrow his farsight, complete the Dark Iron Spy quest and collect a Dark Iron Map for every player. Start Underground Map at the spy camp before returning to Farsen.",
          "Finish both hand-ins, then continue to Loch Modan. These quests will not need repeating before Hall of Thanes.",
        ],
      },
      ...moved.map((entry) => ({ ...entry, legId: target.id })),
    ];
  });
  return {
    ...plan,
    actions,
    legs: plan.legs
      .filter((leg) => leg.id !== visit.id)
      .map((leg) => {
        const entries = actions.filter((action) => action.legId === leg.id);
        return {
          ...leg,
          actionIds: entries.map((action) => action.id),
          questIds: [
            ...new Set(
              entries.flatMap((action) => action.questChanges.map((change) => change.questId)),
            ),
          ],
        };
      }),
  };
}
