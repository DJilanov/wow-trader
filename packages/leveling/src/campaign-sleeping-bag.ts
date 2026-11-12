import type { CampaignAction, CampaignPlan, CampaignQuestChange } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { campaignZoneId } from "./campaign-geography.js";
import { campaignTimedQuestMethodIssues } from "./campaign-quest-timing.js";
import {
  SLEEPING_BAG_QUESTS,
  SLEEPING_BAG_ROUTE_SOURCE,
  SLEEPING_BAG_STOPS,
  type SleepingBagStop,
} from "./sleeping-bag-reference.js";

function inZone(entry: CampaignAction, zone: string): boolean {
  if (entry.location) return entry.location.zone === zone && !entry.location.insideDungeon;
  const zones = new Set(entry.positions.map(({ position }) => campaignZoneId(position.zone)));
  return zones.size === 1 && zones.has(zone);
}

/** Funding may add a Hillsbrad visit before the original Dalaran approach. */
function placeWallOnFirstVisit(plan: CampaignPlan, catalog: QuestCatalog): CampaignPlan {
  const dam = plan.actions.findIndex((entry) => entry.id === "sleeping-bag-dam");
  const wall = plan.actions.findIndex((entry) => entry.id === "sleeping-bag-wall");
  const handoff = plan.actions[wall];
  if (
    dam < 0 ||
    wall <= dam ||
    !handoff ||
    handoff.source !== null ||
    JSON.stringify(handoff.questChanges.map((change) => [change.questId, change.state])) !==
      JSON.stringify([
        [79975, "rewarded"],
        [79976, "accepted"],
        [79976, "rewarded"],
      ]) ||
    !plan.actions[dam]!.questChanges.some(
      (change) => change.questId === 79975 && change.state === "accepted",
    )
  )
    return plan;
  const candidates = plan.actions.filter(
    (entry, index) =>
      index > dam &&
      index < wall &&
      entry.questChanges.length > 0 &&
      !entry.leaderOnly &&
      !entry.raidOnly &&
      !entry.xpOptional &&
      !entry.optionalForQuestIds?.length &&
      !entry.dungeonFinishOnly &&
      !entry.bundleId &&
      inZone(entry, "1424") &&
      plan.legs.find((leg) => leg.id === entry.legId)?.kind !== "dungeon",
  );
  const timings = catalog.quests.flatMap((quest) =>
    quest.timeLimitSeconds === undefined
      ? []
      : [{ questId: quest.questId, title: quest.title, timeLimitSeconds: quest.timeLimitSeconds }],
  );
  for (const target of candidates)
    for (const after of [false, true]) {
      const moved = { ...handoff, legId: target.legId };
      const actions = plan.actions.flatMap((entry) =>
        entry === handoff
          ? []
          : entry === target
            ? after
              ? [entry, moved]
              : [moved, entry]
            : [entry],
      );
      if (campaignTimedQuestMethodIssues(actions, timings).size) continue;
      if (after && plan.actions.indexOf(target) === wall - 1 && handoff.legId === target.legId)
        return plan;
      return {
        ...plan,
        actions,
        legs: plan.legs.map((leg) => ({
          ...leg,
          actionIds: actions.filter((entry) => entry.legId === leg.id).map((entry) => entry.id),
          questIds: [
            ...new Set(
              actions
                .filter((entry) => entry.legId === leg.id)
                .flatMap((entry) => entry.questChanges.map((change) => change.questId)),
            ),
          ],
        })),
      };
    }
  return plan;
}

function action(
  legId: string,
  id: string,
  title: string,
  stop: SleepingBagStop,
  changes: readonly [number, CampaignQuestChange["state"]][],
  instructions: readonly string[],
): CampaignAction {
  return {
    id: `sleeping-bag-${id}`,
    legId,
    title,
    instructions: [
      ...instructions,
      ...(changes.length ? ["Each player must interact; these quests cannot be shared."] : []),
    ],
    questChanges: changes.map(([questId, state]) => ({
      questId,
      state,
      title: SLEEPING_BAG_QUESTS.find((quest) => quest.questId === questId)!.title,
      objectiveIndex: null,
    })),
    positions: [
      {
        sourceLine: 0,
        position: { zone: stop.zone, x: stop.x, y: stop.y, space: "map-percent", floor: null },
      },
    ],
    source: null,
    kind: changes.length ? "quests" : "instructions",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    xpOptional: false,
    libraryBackbone: true,
    requiredQuestIds: [
      ...new Set(
        changes.flatMap(([questId, state]) => {
          const parent = SLEEPING_BAG_QUESTS.find(
            (quest) => quest.questId === questId,
          )!.previousQuestId;
          return state === "accepted" && parent !== null ? [parent] : [];
        }),
      ),
    ],
    location: { zone: stop.zone },
  };
}

/** Keep the six object handoffs on the primary party's existing regional visits. */
export function attachSleepingBagRoute(plan: CampaignPlan, catalog: QuestCatalog): CampaignPlan {
  if (!plan.sharedQuestsOnly || plan.race !== "human" || plan.partyPolicy?.partySize !== 5)
    return plan;
  if (
    plan.targetBuild !== catalog.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256
  )
    throw new Error("Sleeping-bag route and quest references differ.");
  if (plan.actions.some((entry) => entry.id.startsWith("sleeping-bag-")))
    return placeWallOnFirstVisit(plan, catalog);
  const questIds = new Set(SLEEPING_BAG_QUESTS.map((quest) => quest.questId));
  if (
    plan.actions.some((entry) => entry.questChanges.some((change) => questIds.has(change.questId)))
  )
    return plan;
  for (const quest of SLEEPING_BAG_QUESTS) {
    const definition = catalog.quests.find((entry) => entry.questId === quest.questId);
    const reward = plan.rewardFacts?.find((entry) => entry.questId === quest.questId);
    if (!definition || !reward) return plan;
    if (
      definition.title !== quest.title ||
      definition.questLevel !== quest.questLevel ||
      definition.minimumLevel !== 14 ||
      definition.requiredClasses !== 0 ||
      (definition.requiredRaces !== 0 && !(BigInt(definition.requiredRaces) & 1n)) ||
      definition.prerequisites.allOf.join() !==
        (quest.previousQuestId === null ? "" : String(quest.previousQuestId)) ||
      definition.prerequisites.anyOf.length ||
      definition.objectives.length ||
      definition.unsupportedRequirements.some(
        (flag) => flag !== "reviewed-sleeping-bag-object-route",
      ) ||
      reward.status !== "available" ||
      reward.minimumLevel !== 14 ||
      reward.questLevel !== quest.questLevel ||
      reward.evidenceKind !== "client-table-reference"
    )
      return plan;
  }
  const regional = (legId: string, zone: string): readonly CampaignAction[] =>
    plan.actions.filter((entry) => {
      if (entry.legId !== legId) return false;
      return inZone(entry, zone);
    });
  const westfall = regional("eastern-deadmines-preparation", "1436").at(-1);
  const stonetalon = regional("ashenvale-crossing", "1442");
  const wetlands = regional("excavation-approach", "1437")[0];
  const hillsbrad = regional("dalaran-approach", "1424")[0];
  if (!westfall || !stonetalon.length || !wetlands || !hillsbrad) return plan;
  const sequence = [westfall, stonetalon[0]!, stonetalon.at(-1)!, wetlands, hillsbrad].map(
    (entry) => plan.actions.indexOf(entry),
  );
  if (sequence.some((index, at) => at > 0 && index < sequence[at - 1]!)) return plan;

  const before = new Map<string, readonly CampaignAction[]>(),
    after = new Map<string, readonly CampaignAction[]>();
  const add = (
    map: Map<string, readonly CampaignAction[]>,
    anchor: CampaignAction,
    entries: readonly CampaignAction[],
  ): void => {
    map.set(anchor.id, [...(map.get(anchor.id) ?? []), ...entries]);
  };
  add(after, westfall, [
    action(
      westfall.legId,
      "westfall",
      "Pick up the sleeping-bag trail",
      SLEEPING_BAG_STOPS["westfall"]!,
      [[79008, "accepted"]],
      [
        "At Alexston Farmstead, investigate the cart wreckage and accept the note quest. Keep it for our next Barrens visit.",
      ],
    ),
  ]);
  add(before, stonetalon[0]!, [
    action(
      "ashenvale-crossing",
      "barrens",
      "Follow the note to the southern Barrens",
      SLEEPING_BAG_STOPS["barrens"]!,
      [
        [79008, "rewarded"],
        [79192, "accepted"],
      ],
      [
        "Use the main road past Camp Taurajo. At the ruined tower, finish the note quest and take Stepping Stones; return north toward Stonetalon.",
      ],
    ),
  ]);
  add(after, stonetalon.at(-1)!, [
    action(
      "ashenvale-crossing",
      "camp-trail",
      "Take the trail to the hidden camp",
      SLEEPING_BAG_STOPS["trail"]!,
      [],
      [
        "Follow the hillside trail to the camp. This is an object visit; no additional mob farming is required.",
      ],
    ),
    action(
      "ashenvale-crossing",
      "camp",
      "Read the camp's Pocket Litter",
      SLEEPING_BAG_STOPS["camp"]!,
      [
        [79192, "rewarded"],
        [79980, "accepted"],
      ],
      [
        "Check the litter beside the tent, hand in Stepping Stones and accept Scramble. Rekindle is a separate optional quest.",
      ],
    ),
    action(
      "ashenvale-crossing",
      "dirt",
      "Find the Mound of Dirt",
      SLEEPING_BAG_STOPS["dirt"]!,
      [
        [79980, "rewarded"],
        [79974, "accepted"],
      ],
      [
        "Go north to the ridge and descend carefully to the mound. Turn in Scramble and carry Wet Job to our eastern return.",
      ],
    ),
  ]);
  add(before, wetlands, [
    action(
      wetlands.legId,
      "dam",
      "Inspect the figurine at Stonewrought Dam",
      SLEEPING_BAG_STOPS["dam"]!,
      [
        [79974, "rewarded"],
        [79975, "accepted"],
      ],
      [
        "On the Loch Modan approach to Wetlands, reach the narrow ledge above the dam's carved heads carefully. Use the figurine, then keep Eagle's Fist for our Hillsbrad journey.",
      ],
    ),
  ]);
  add(before, hillsbrad, [
    action(
      hillsbrad.legId,
      "wall",
      "Finish the sleeping-bag trail at Thoradin's Wall",
      SLEEPING_BAG_STOPS["wall"]!,
      [
        [79975, "rewarded"],
        [79976, "accepted"],
        [79976, "rewarded"],
      ],
      [
        "Climb from the overturned cart on the Hillsbrad side. Follow the wall passage to the hanging Messenger Bag, then open the satchel below it to finish the last quest.",
        "Confirm all five have finished before leaving. Sleeping-bag buffs and Student Fodder are not assumed in this forecast.",
        `Reference route: ${SLEEPING_BAG_ROUTE_SOURCE}`,
      ],
    ),
  ]);
  const actions = plan.actions.flatMap((entry) => [
    ...(before.get(entry.id) ?? []),
    entry,
    ...(after.get(entry.id) ?? []),
  ]);
  return placeWallOnFirstVisit(
    {
      ...plan,
      actions,
      legs: plan.legs.map((leg) => ({
        ...leg,
        actionIds: actions.filter((entry) => entry.legId === leg.id).map((entry) => entry.id),
        questIds: [
          ...new Set(
            actions
              .filter((entry) => entry.legId === leg.id)
              .flatMap((entry) => entry.questChanges.map((change) => change.questId)),
          ),
        ],
      })),
    },
    catalog,
  );
}
