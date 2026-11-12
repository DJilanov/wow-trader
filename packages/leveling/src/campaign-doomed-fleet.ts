import type { CampaignAction, CampaignPlan, CampaignQuestChange } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { campaignZoneId } from "./campaign-geography.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import reviewed from "./fixtures/doomed-fleet-70205-70450.json" with { type: "json" };

type Phase = readonly [number, CampaignQuestChange["state"], number | null];

function task(
  legId: string,
  id: string,
  title: string,
  zone: string,
  point: readonly [number, number],
  phases: readonly Phase[],
  instructions: readonly string[],
): CampaignAction {
  return {
    id: `doomed-fleet-${id}`,
    legId,
    title,
    instructions,
    questChanges: phases.map(([questId, state, objectiveIndex]) => ({
      questId,
      state,
      objectiveIndex,
      title: reviewed.quests.find((quest) => quest.questId === questId)!.title,
    })),
    positions: [
      {
        sourceLine: 0,
        position: {
          zone,
          x: point[0],
          y: point[1],
          space: "map-percent",
          floor: null,
        },
      },
    ],
    source: null,
    combatEnvironment: "outdoor",
    kind: "quests",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    xpOptional: false,
    libraryBackbone: true,
    location: { zone },
    requiredQuestIds: [
      ...new Set(
        phases.flatMap(([questId, state]) => {
          const quest = reviewed.quests.find((entry) => entry.questId === questId)!;
          return state === "accepted"
            ? [...quest.prerequisites.allOf, ...quest.prerequisites.anyOf]
            : [];
        }),
      ),
    ],
  };
}

function zoneOf(action: CampaignAction): string | null {
  if (action.location) return action.location.insideDungeon ? null : action.location.zone;
  const zones = new Set(action.positions.map(({ position }) => campaignZoneId(position.zone)));
  return zones.size === 1 ? [...zones][0]! : null;
}

/** Add the independently reviewed five-stage fleet chain without rewriting archived source guards. */
export function attachDoomedFleetRoute(
  plan: CampaignPlan,
  catalog: QuestCatalog,
  data: CombatDataset,
): CampaignPlan {
  if (!plan.sharedQuestsOnly || plan.race !== "human" || plan.partyPolicy?.partySize !== 5)
    return plan;
  if (
    plan.targetBuild !== catalog.targetBuild ||
    data.targetBuild !== plan.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256
  )
    throw new Error("Doomed Fleet route and references differ.");
  if (
    plan.targetBuild !== reviewed.targetBuild ||
    plan.sourceArchiveSha256 !== reviewed.sourceArchiveSha256 ||
    catalog.providerRevision !== reviewed.provider.revision ||
    data.provider.revision !== reviewed.provider.revision ||
    catalog.questSha256 !== reviewed.provider.questSha256 ||
    catalog.npcSha256 !== reviewed.provider.npcSha256 ||
    catalog.itemSha256 !== reviewed.provider.itemSha256 ||
    catalog.objectSha256 !== reviewed.provider.objectSha256 ||
    data.provider.questSha256 !== reviewed.provider.questSha256 ||
    data.provider.npcSha256 !== reviewed.provider.npcSha256 ||
    data.provider.itemSha256 !== reviewed.provider.itemSha256 ||
    data.provider.objectSha256 !== reviewed.provider.objectSha256
  )
    return plan;
  const ids = new Set(reviewed.quests.map((quest) => quest.questId));
  if (
    plan.actions.some(
      (action) =>
        action.id.startsWith("doomed-fleet-") ||
        action.questChanges.some((change) => ids.has(change.questId)),
    )
  )
    return plan;
  // These exact records include object handoffs, vendor relation and all mixed counters.
  if (
    reviewed.quests.some(
      (quest) =>
        JSON.stringify(catalog.quests.find((row) => row.questId === quest.questId)) !==
        JSON.stringify(quest),
    ) ||
    reviewed.references.some(
      (quest) =>
        JSON.stringify(data.quests.find((row) => row.questId === quest.questId)) !==
        JSON.stringify(quest),
    ) ||
    reviewed.npcs.some(
      (npc) => JSON.stringify(data.npcs.find((row) => row.id === npc.id)) !== JSON.stringify(npc),
    ) ||
    reviewed.quests.some(
      (quest) =>
        !plan.rewardFacts?.some(
          (fact) =>
            fact.questId === quest.questId &&
            fact.status === "available" &&
            fact.minimumLevel === quest.minimumLevel &&
            fact.questLevel === quest.questLevel,
        ),
    )
  )
    return plan;
  const laterAnchor = plan.actions.find((action) => action.id === "lonebrow-rfk-preparation-brief");
  if (
    !laterAnchor ||
    !plan.actions.some(
      (action) =>
        action.id === "dungeon-excavation-deliveries" &&
        plan.actions.indexOf(action) < plan.actions.indexOf(laterAnchor),
    )
  )
    return plan;
  const excavation = plan.legs.find((leg) => leg.kind === "dungeon" && leg.stopId === "excavation");
  const visit = excavation ? plan.actions.filter((action) => action.legId === excavation.id) : [];
  const remote = visit.find((action) => {
    const zone = zoneOf(action);
    return action.kind === "quests" && zone !== null && zone !== "1437";
  });
  const remoteIndex = remote ? visit.indexOf(remote) : -1;
  const beforeCity =
    remote !== undefined &&
    remoteIndex > 0 &&
    visit.slice(0, remoteIndex).some((action) => action.location?.insideDungeon === "excavation") &&
    visit.slice(remoteIndex).every((action) => {
      const zone = zoneOf(action);
      return (
        !action.location?.insideDungeon &&
        (zone === null ? action.questChanges.length === 0 : zone !== "1437")
      );
    });
  const anchor = beforeCity ? remote : laterAnchor;
  const insertion = plan.actions.indexOf(anchor) + (beforeCity ? 0 : 1);
  let previousZone = "1437";
  let onward: CampaignAction | undefined;
  let transit = false;
  for (const action of plan.actions.slice(insertion)) {
    const zone = zoneOf(action);
    if (!zone) continue;
    const journey = campaignGroundJourney(previousZone, zone);
    if (zone === "1453" || journey?.some((leg) => leg.from === "1453" || leg.to === "1453")) {
      onward = action;
      transit = zone !== "1453";
      break;
    }
    previousZone = zone;
  }
  if (!onward) return plan;
  const leg = anchor.legId;
  const atMate: readonly [number, number] = [10.9, 59.64];
  const entries: CampaignAction[] = [
    {
      ...task(
        leg,
        "readiness",
        "Prepare for the shipwreck crews",
        "1437",
        atMate,
        [],
        [
          beforeCity
            ? "While we are still in Wetlands, regroup at Menethil and finish the wreck visits before leaving for the city hand-ins. The enemies reach level 30; stay together and watch your breath inside the wrecks."
            : "Return to Menethil Harbor before the next Kalimdor crossing. The shipwreck enemies reach level 30; stay together and watch your breath inside the wrecks.",
        ],
      ),
      kind: "instructions",
    },
    task(
      leg,
      "accept-288",
      "Accept The Third Fleet",
      "1437",
      atMate,
      [[288, "accepted", null]],
      ["Talk to First Mate Fitzsimmons outside the Menethil inn. Each player takes the quest."],
    ),
    task(
      leg,
      "buy-mead",
      "Buy a drink for Fitzsimmons",
      "1437",
      [10.7, 60.95],
      [[288, "objectives-complete", 1]],
      [
        "Buy 1 [Flagon of Mead] from Innkeeper Helbrek.",
        "Each player buys one. The vendor may label it Flagon of Dwarven Honeymead; item 2594 is the required drink. Keep it for Fitzsimmons.",
      ],
    ),
    task(
      leg,
      "crew-pickup",
      "Return the drink and accept The Cursed Crew",
      "1437",
      atMate,
      [
        [288, "rewarded", null],
        [289, "accepted", null],
      ],
      ["Return to Fitzsimmons and take The Cursed Crew on all five characters."],
    ),
    task(
      leg,
      "crew",
      "Free the Cursed Crew",
      "1437",
      [13.79, 30.18],
      [
        [289, "objectives-complete", 1],
        [289, "objectives-complete", 2],
        [289, "objectives-complete", 3],
      ],
      [
        "Clear 13 Cursed Sailors and 5 Cursed Marines around the wrecks north of Menethil. These kills count for everyone nearby.",
        "Kill First Mate Snellig in the southern wreck and have each player loot Snellig's Snuffbox. One successful shared drop supplies the party; do not plan five separate kills.",
        "Use the breach on the shore-facing side to reach the lower hull. Surface for air and regroup before the next pull.",
      ],
    ),
    task(
      leg,
      "curse-pickup",
      "Return to Fitzsimmons for Lifting the Curse",
      "1437",
      atMate,
      [
        [289, "rewarded", null],
        [290, "accepted", null],
      ],
      [
        "Return to Menethil and take Lifting the Curse together before visiting the northern wreck.",
      ],
    ),
    task(
      leg,
      "halyndor",
      "Recover the Intrepid Strongbox Key",
      "1437",
      [15.45, 23.61],
      [[290, "objectives-complete", 1]],
      [
        "Approach the northern wreck along its rudder and defeat Captain Halyndor. Each player loots an Intrepid Strongbox Key.",
        "Pause damaging spells while Ward of the Eye reflects them. One successful shared key drop supplies the party.",
      ],
    ),
    task(
      leg,
      "strongbox",
      "Open the Intrepid's Locked Strongbox",
      "1437",
      [14.38, 24.04],
      [
        [290, "rewarded", null],
        [292, "accepted", null],
      ],
      [
        "Enter the hole in the hull and use each player's key at the strongbox. Finish Lifting the Curse, take The Eye of Paleth, and keep the Cursed Eye.",
      ],
    ),
    task(
      leg,
      "glorin",
      "Bring the Cursed Eye to Glorin",
      "1437",
      [10.58, 60.59],
      [
        [292, "rewarded", null],
        [293, "accepted", null],
      ],
      [
        "Return to Glorin Steelbrow in Menethil. Finish The Eye of Paleth, take Cleansing the Eye and keep the Cursed Eye for our next Stormwind visit.",
        "Continue to the next listed tasks; do not make a separate Stormwind journey for this delivery.",
      ],
    ),
  ];
  const recipient = reviewed.quests.find((quest) => quest.questId === 293)!.ends[0]!.positions[0]!;
  const returnEye = task(
    onward.legId,
    "benedictus",
    "Have Benedictus cleanse the Eye",
    recipient.zone,
    [recipient.x, recipient.y],
    [[293, "rewarded", null]],
    [
      transit
        ? "The journey to the next listed destination passes through Stormwind. Stop at the Cathedral of Light and bring the Cursed Eye to Archbishop Benedictus before continuing. Each player completes the hand-in."
        : "During this Stormwind visit, bring the Cursed Eye to Archbishop Benedictus in the Cathedral of Light. Each player completes the hand-in.",
    ],
  );
  const actions = plan.actions.flatMap((action) => [
    ...(beforeCity && action === anchor ? entries : []),
    ...(action === onward ? [returnEye] : []),
    action,
    ...(!beforeCity && action === anchor ? entries : []),
  ]);
  return {
    ...plan,
    actions,
    legs: plan.legs.map((entry) => ({
      ...entry,
      actionIds: actions.filter((action) => action.legId === entry.id).map((action) => action.id),
      questIds: [
        ...new Set(
          actions
            .filter((action) => action.legId === entry.id)
            .flatMap((action) => action.questChanges.map((change) => change.questId)),
        ),
      ],
    })),
  };
}
