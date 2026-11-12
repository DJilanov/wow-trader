import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { starterScoutingSource } from "./campaign-starter-scouting-source.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { refreshFundedCampaignPartyPolicy } from "./campaign-funding-policy.js";
import { campaignZoneId, campaignZoneInText } from "./campaign-geography.js";

/** Complete scouting on the existing Elwynn crossing and group the later Westfall work. */
export function connectCampaignStarterScouting(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    !plan.questFunding ||
    !plan.partyPolicy ||
    plan.actions.some((action) =>
      action.questChanges.some((change) => [76, 239].includes(change.questId)),
    )
  )
    return plan;
  const captured = starterScoutingSource(plan, sources, combat, catalog);
  if (!captured) return plan;
  const anchors = [
    "start-116-116-source-step-0086",
    "start-116-116-source-step-0089",
    "start-116-116-source-step-0139",
    "start-116-116-source-step-0186",
    "start-116-116-source-step-0193",
    "start-116-116-source-step-0218",
  ].map((id) => plan.actions.find((action) => action.id === id));
  if (
    anchors.some(
      (action) => !action || action.legId !== "start-116" || action.leaderOnly || action.raidOnly,
    ) ||
    anchors.some(
      (action, index) =>
        index > 0 && plan.actions.indexOf(action!) <= plan.actions.indexOf(anchors[index - 1]!),
    ) ||
    !anchors[0]!.questChanges.some(
      (change) => change.questId === 62 && change.state === "rewarded",
    ) ||
    !anchors[5]!.questChanges.some(
      (change) => change.questId === 176 && change.state === "accepted",
    )
  )
    return plan;
  const hearth = anchors[3]!;
  const hearthSource = sources.find(
    (source) =>
      source.guide.chapterId === hearth.source?.chapterId &&
      source.guide.version === hearth.source.version &&
      source.guide.targetBuild === plan.targetBuild,
  );
  const hearthStep = hearthSource?.guide.steps.find((step) => step.id === hearth.source?.stepId);
  const transfers = hearthStep?.directives.filter((row) => row.tag === ".hs");
  const transfer =
    !hearthStep?.condition.trim() && transfers?.length === 1 && !transfers[0]!.condition.trim()
      ? transfers[0]!
      : null;
  const returnZone = hearth.movement
    ? hearth.movement.kind === "hearth"
      ? hearth.movement.destination
      : null
    : transfer
      ? (campaignZoneId(transfer.arguments) ?? campaignZoneInText(transfer.text))
      : null;
  if (returnZone !== "1429") return plan;
  const east = plan.actions.filter((action) => action.legId === "eastern-deadmines-preparation");
  const coast = east.filter((action) =>
    action.questChanges.some((change) => change.questId === 152),
  );
  const militia = east.filter((action) =>
    action.questChanges.some(
      (change) => change.questId === 14 || (change.questId === 65 && change.state === "accepted"),
    ),
  );
  const militiaPhases = militia.flatMap((action) => action.questChanges);
  const batchWestfall =
    coast.length === 6 &&
    militia.length === 6 &&
    !coast.some(
      (action, index) =>
        action.questChanges.length !== 1 ||
        action.questChanges[0]!.state !==
          (index === 0 ? "accepted" : index === 5 ? "rewarded" : "objectives-complete") ||
        action.questChanges[0]!.objectiveIndex !== (index > 0 && index < 5 ? index : null),
    ) &&
    militiaPhases.length === 6 &&
    !militiaPhases.some(
      (change, index) =>
        change.questId !== (index === 5 ? 65 : 14) ||
        change.state !==
          (index === 0 || index === 5
            ? "accepted"
            : index === 4
              ? "rewarded"
              : "objectives-complete") ||
        change.objectiveIndex !== (index > 0 && index < 4 ? index : null),
    );
  // Funding may already have scheduled Westfall elsewhere. That must not discard
  // independent scouting on the proven Elwynn crossing.
  const requested = batchWestfall ? [militia[0]!, militia[5]!, ...coast, ...militia.slice(1, 5)] : [];
  const requestedIds = new Set(requested.map((action) => action.id));
  const easternAnchor = east.find((action) => !requestedIds.has(action.id));
  const moved = easternAnchor ? requested : [];
  const movedIds = new Set(moved.map((action) => action.id));
  const scheduled = (action: CampaignAction): CampaignAction => ({
    ...action,
    legId: "start-116",
    libraryBackbone: true,
    xpOptional: false,
  });
  const insertions = new Map<string, readonly CampaignAction[]>([
    [anchors[1]!.id, [captured.pickup].map(scheduled)],
    [anchors[2]!.id, [captured.entrance, captured.objective].map(scheduled)],
    [anchors[4]!.id, [captured.handIn, captured.courierPickup].map(scheduled)],
    [anchors[5]!.id, [captured.courierHandIn].map(scheduled)],
    ...(easternAnchor && moved.length ? [[easternAnchor.id, moved] as const] : []),
  ]);
  const actions = plan.actions.flatMap((action) => {
    if (movedIds.has(action.id)) return [];
    const current =
      moved.length && action.id === "wailing-caverns-catchup-return"
        ? {
            ...action,
            instructions: [
              ...action.instructions.slice(0, -1),
              "Follow Elwynn's western road into Westfall. Pick up the listed quests at Sentinel Hill before continuing south to Captain Grayson at the lighthouse. Finish this Westfall circuit before the Redridge preparation.",
            ],
          }
        : action;
    return [...(insertions.get(action.id) ?? []), current];
  });
  if (
    actions.length !== plan.actions.length + 6 ||
    new Set(actions.map((action) => action.id)).size !== actions.length
  )
    return plan;
  const decisions = new Map(
    plan.partyPolicy.decisions.map((decision) => [decision.questId, decision]),
  );
  for (const questId of [76, 239])
    decisions.set(questId, {
      questId,
      objective: questId === 76 ? "interaction" : "delivery",
      included: true,
      requiredFor: [],
      lootCost: null,
      reason:
        "Captured exploration on the existing eastbound crossing and courier at the planned Goldshire/Westbrook visits; retain all five players' prerequisites and hand-ins.",
    });
  const candidate: CampaignPlan = {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      questIds: leg.id === "start-116" ? [...leg.questIds, 76, 239] : leg.questIds,
    })),
    partyPolicy: { ...plan.partyPolicy, decisions: [...decisions.values()] },
    questFunding: {
      ...plan.questFunding,
      addedQuestIds: [...new Set([...plan.questFunding.addedQuestIds, 76, 239])],
    },
    ...(plan.sharedSourceQuestIds
      ? { sharedSourceQuestIds: [...new Set([...plan.sharedSourceQuestIds, 76, 239])] }
      : {}),
  };
  const attached = attachCampaignCombat(
    candidate,
    sources,
    combat,
    plan.combat?.revision ?? "starter-scouting",
  );
  const partyPolicy = refreshFundedCampaignPartyPolicy(attached, sources, combat, catalog);
  return { ...attached, ...(partyPolicy ? { partyPolicy } : {}) };
}
