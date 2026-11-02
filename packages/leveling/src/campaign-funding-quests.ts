import type { CampaignAction } from "./campaign.js";
import type { QuestCatalog, QuestCatalogEntry, QuestCatalogPosition } from "./quest-catalog.js";
import { isSharedFundingQuest, isGroundPickupFundingQuest } from "./quest-catalog.js";
import type { PremadeProgress } from "./premade-model.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { campaignZoneName, campaignZoneId } from "./campaign-geography.js";
import type { CombatDataset } from "./combat-model.js";
import { getPremadeQuest } from "./premade.js";
import {
  existingFundingPickup,
  existingFundingPrerequisite,
} from "./campaign-funding-prerequisites.js";
import { npcDeliveryRecipients } from "./quest-catalog-delivery.js";
import type { CampaignFundingCollection } from "./campaign-funding-collections.js";
import { FIVE_PLAYER_LOOT_BUDGET } from "./party-quest-cost.js";

export interface CampaignFundingPosition extends QuestCatalogPosition {
  readonly space?: "map-percent" | "world";
  readonly floor?: number | null;
}

export interface CampaignFundingBatch {
  readonly questIds: readonly number[];
  readonly actions: readonly CampaignAction[];
  readonly travelCost: number;
  readonly returnTravelCost: number;
  readonly requiredKills: number;
}

function positionCost(
  position: CampaignFundingPosition,
  previous: CampaignFundingPosition | null,
  originZone: string | null = null,
): number {
  const zone = previous?.zone ?? originZone;
  if (!zone) return 0;
  if (position.zone === zone) {
    if (position.space === "world" || previous?.space === "world") {
      if (
        previous &&
        position.space === previous.space &&
        position.floor === previous.floor &&
        position.x === previous.x &&
        position.y === previous.y
      )
        return 0;
      // No map dimensions are pinned for world coordinates. Use the largest
      // normalized map displacement as a score penalty, never guessed geometry.
      return Math.SQRT2;
    }
    return previous ? Math.hypot(position.x - previous.x, position.y - previous.y) / 100 : 0;
  }
  const journey = campaignGroundJourney(zone, position.zone);
  return journey ? journey.length + 1 : Infinity;
}

function closestPosition(
  positions: readonly CampaignFundingPosition[],
  previous: CampaignFundingPosition | null,
  originZone: string | null = null,
): CampaignFundingPosition | null {
  return (
    [...positions].sort(
      (left, right) =>
        positionCost(left, previous, originZone) - positionCost(right, previous, originZone),
    )[0] ?? null
  );
}

export function campaignFundingBatch(
  root: QuestCatalogEntry,
  catalog: QuestCatalog,
  combat: CombatDataset,
  progress: PremadeProgress,
  options: {
    readonly legId: string;
    readonly checkpointId: string;
    readonly targetLevel: number;
    readonly previous: CampaignFundingPosition | null;
    readonly previousZone?: string | null;
    readonly resumePosition?: CampaignFundingPosition | null;
    readonly resumeZone?: string | null;
    readonly forbiddenQuestIds: ReadonlySet<number>;
    readonly maximumQuestLevel: number;
    readonly leaderOnly: boolean;
    readonly additionalPrerequisites?: ReadonlyMap<number, readonly number[]>;
    readonly existingActions?: readonly CampaignAction[];
    readonly includeGroundPickups?: boolean;
    readonly includeNpcDeliveries?: boolean;
    readonly includePartyElites?: boolean;
    readonly sourceCollections?: ReadonlyMap<number, CampaignFundingCollection>;
  },
): CampaignFundingBatch | null {
  const eligible = (quest: QuestCatalogEntry): boolean =>
    isSharedFundingQuest(quest) ||
    (options.includeGroundPickups === true && isGroundPickupFundingQuest(quest)) ||
    options.sourceCollections?.has(quest.questId) === true;
  if (!eligible(root)) return null;
  const byId = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const npcs = new Map(combat.npcs.map((npc) => [npc.id, npc]));
  const members = options.leaderOnly ? progress.members.slice(0, 1) : progress.members;
  const rewarded = (id: number): boolean =>
    members.every((member) => member.questStates[String(id)] === "rewarded");
  const existing = new Map<number, readonly CampaignAction[]>();

  function extraPrerequisites(id: number): readonly number[] {
    return [
      ...new Set([
        ...(options.additionalPrerequisites?.get(id) ?? []),
        ...(options.sourceCollections
          ?.get(id)
          ?.actions.flatMap((action) =>
            action.questChanges.some((change) => change.state === "accepted")
              ? (action.requiredQuestIds ?? [])
              : [],
          ) ?? []),
      ]),
    ];
  }

  function withinDifficulty(quest: QuestCatalogEntry): boolean {
    if (quest.questLevel === null) return false;
    const collection = options.sourceCollections?.get(quest.questId);
    if (collection)
      return (
        !options.leaderOnly &&
        members.length === 5 &&
        collection.maximumEnemyLevel <= options.maximumQuestLevel
      );
    const partyElites = options.includePartyElites === true && !options.leaderOnly;
    const enemyLevelsFit = (): boolean =>
      quest.category === "shared-kills" &&
      isSharedFundingQuest(quest) &&
      quest.objectives.every((objective) => {
        const npc = npcs.get(objective.npcId);
        return (
          (npc?.rank === 0 || (partyElites && members.length === 5 && npc?.rank === 1)) &&
          npc.maximumLevel !== null &&
          npc.maximumLevel <= options.maximumQuestLevel
        );
      });
    if (partyElites && quest.category === "shared-kills")
      return members.length === 5 && enemyLevelsFit();
    if (quest.questLevel <= options.maximumQuestLevel) return true;
    if (
      options.includeNpcDeliveries &&
      npcDeliveryRecipients(
        quest,
        combat.quests.find((reference) => reference.questId === quest.questId),
      ).length > 0
    )
      return true;
    // Reward level is not combat difficulty. A full party can consider ordinary
    // elites in the same enemy-level band; rares and bosses need their own route.
    return enemyLevelsFit();
  }

  function closure(id: number, visiting: ReadonlySet<number>): readonly QuestCatalogEntry[] | null {
    if (rewarded(id)) return [];
    if (
      visiting.has(id) ||
      visiting.size > 100 ||
      options.forbiddenQuestIds.has(id) ||
      getPremadeQuest(id)
    )
      return null;
    const quest = byId.get(id);
    const source =
      options.sourceCollections?.get(id)?.actions ??
      (quest ? existingFundingPrerequisite(quest, byId, options.existingActions ?? []) : null);
    const capturedRoot =
      id === root.questId &&
      options.existingActions?.filter(
        (action) => action.source && action.questChanges.some((change) => change.questId === id),
      );
    if (
      !quest ||
      (capturedRoot && capturedRoot.length > 1 && !source) ||
      (!eligible(quest) && !source) ||
      !withinDifficulty(quest) ||
      (options.sourceCollections &&
        quest.category === "unsupported" &&
        !options.sourceCollections.has(id) &&
        !isGroundPickupFundingQuest(quest)) ||
      (options.sourceCollections?.has(id) &&
        members.some((member) => {
          const state = member.questStates[String(id)];
          return state !== undefined && state !== "not-started";
        })) ||
      members.some((member) => member.level === null || member.level < quest.minimumLevel!) ||
      quest.exclusiveWith.some((exclusive) =>
        members.some(
          (member) =>
            member.questStates[String(exclusive)] &&
            member.questStates[String(exclusive)] !== "not-started",
        ),
      )
    )
      return null;
    if (source) existing.set(id, source);
    const next = new Set(visiting).add(id);
    const chain: QuestCatalogEntry[] = [];
    for (const parent of new Set([...quest.prerequisites.allOf, ...extraPrerequisites(id)])) {
      const branch = closure(parent, next);
      if (branch === null) return null;
      chain.push(...branch);
    }
    if (quest.prerequisites.anyOf.length && !quest.prerequisites.anyOf.some(rewarded)) {
      const alternative = quest.prerequisites.anyOf
        .map((parent) => closure(parent, next))
        .filter((branch): branch is readonly QuestCatalogEntry[] => branch !== null)
        .sort((left, right) => left.length - right.length)[0];
      if (!alternative) return null;
      chain.push(...alternative);
    }
    return [...new Map([...chain, quest].map((entry) => [entry.questId, entry])).values()];
  }

  const ordered = closure(root.questId, new Set());
  if (!ordered?.length) return null;
  const collections = ordered.flatMap(
    (quest) => options.sourceCollections?.get(quest.questId) ?? [],
  );
  if (
    collections.reduce((sum, collection) => sum + collection.expectedKills, 0) >
      FIVE_PLAYER_LOOT_BUDGET.maximumExpectedKills ||
    collections.reduce((sum, collection) => sum + collection.slowKills, 0) >
      FIVE_PLAYER_LOOT_BUDGET.maximumSlowKills
  )
    return null;
  const selected = new Set(ordered.map((quest) => quest.questId));
  if (ordered.some((quest) => quest.exclusiveWith.some((id) => selected.has(id)))) return null;
  const actions: CampaignAction[] = [];
  let previous = options.previous;
  let travelCost = 0;
  for (const quest of ordered) {
    const parents = [
      ...new Set([
        ...quest.prerequisites.allOf,
        ...extraPrerequisites(quest.questId),
        ...quest.prerequisites.anyOf.filter((id) => selected.has(id) || rewarded(id)).slice(0, 1),
      ]),
    ];
    const source = existing.get(quest.questId);
    if (source) {
      if (source.some((action) => action.leaderOnly !== options.leaderOnly)) return null;
      const collection = options.sourceCollections?.get(quest.questId);
      for (const action of source) {
        const positions = action.positions.flatMap(({ position }) => {
          const zone = campaignZoneId(position.zone);
          return zone && (position.space === "map-percent" || position.space === "world")
            ? [{ ...position, zone }]
            : [];
        });
        const point = closestPosition(positions, previous, options.previousZone);
        if (!point) return null;
        travelCost += positionCost(point, previous, options.previousZone);
        previous = point;
        actions.push({
          ...action,
          id: collection
            ? `quest-funding-${options.checkpointId}-${quest.questId}-${action.questChanges[0]!.state}-${action.questChanges[0]!.objectiveIndex ?? 0}`
            : `quest-funding-${options.checkpointId}-${quest.questId}-${action.id}`,
          legId: options.legId,
          fundingCheckpointId: options.checkpointId,
          ...(collection
            ? {
                xpOptional: true,
                xpTargetLevel: options.targetLevel,
                instructions:
                  action.questChanges[0]!.state === "objectives-complete"
                    ? [
                        ...action.instructions,
                        "Everyone must finish their quest item objective before moving on.",
                      ]
                    : action.instructions,
              }
            : {}),
          ...(action.questChanges.some((change) => change.state === "accepted") && parents.length
            ? { requiredQuestIds: [...new Set([...(action.requiredQuestIds ?? []), ...parents])] }
            : {}),
        });
      }
      continue;
    }
    const capturedPickup = existingFundingPickup(
      quest,
      byId,
      options.existingActions ?? [],
      parents,
    );
    if (
      (options.existingActions?.some(
        (action) =>
          action.source && action.questChanges.some((change) => change.questId === quest.questId),
      ) &&
        !capturedPickup) ||
      (capturedPickup && capturedPickup.leaderOnly !== options.leaderOnly)
    )
      return null;
    const start = [...quest.starts]
      .filter((giver) => giver.friendlyToAlliance && giver.positions.length)
      .sort(
        (left, right) =>
          positionCost(
            closestPosition(left.positions, previous, options.previousZone)!,
            previous,
            options.previousZone,
          ) -
          positionCost(
            closestPosition(right.positions, previous, options.previousZone)!,
            previous,
            options.previousZone,
          ),
      )[0];
    const startPosition = start && closestPosition(start.positions, previous, options.previousZone);
    if (!start || !startPosition) return null;
    const stages: {
      readonly state: "accepted" | "objectives-complete" | "rewarded";
      readonly index: number | null;
      readonly instructions: readonly string[];
      readonly position: QuestCatalogPosition;
      readonly positions?: readonly QuestCatalogPosition[];
    }[] = [
      {
        state: "accepted",
        index: null,
        instructions: [
          `Talk to ${start.name} in ${campaignZoneName(startPosition.zone)}. Accept ${quest.title}.`,
        ],
        position: startPosition,
      },
    ];
    let last = startPosition;
    if (quest.groundPickup && options.includeGroundPickups) {
      const ground = quest.groundPickup;
      const reference = combat.quests.find((entry) => entry.questId === quest.questId);
      const item = reference?.itemObjectives?.[0];
      if (!item?.groundPickup || JSON.stringify(item.groundPickup) !== JSON.stringify(ground))
        return null;
      const point = closestPosition(ground.positions, last);
      if (!point) return null;
      stages.push({
        state: "objectives-complete",
        index: ground.objectiveIndex,
        position: point,
        positions: [point, ...ground.positions.filter((candidate) => candidate !== point)],
        instructions: [
          `Open ${ground.objectName}. Each player must loot one ${item.itemName ?? `item ${item.itemId}`}.`,
          ground.positions.length > 1
            ? "Search the marked possible locations until everyone's quest objective is complete. If one location is empty, check the others."
            : "Wait until everyone's quest objective is complete. If the object disappears, wait for it to return.",
        ],
      });
      last = point;
    }
    for (const objective of quest.objectives) {
      const npc = npcs.get(objective.npcId);
      const position = closestPosition(objective.positions, last);
      if (!npc || objective.count === null || !position) return null;
      stages.push({
        state: "objectives-complete",
        index: objective.index,
        instructions: [
          `Kill ${objective.count} ${npc.name}. All party members need the shared quest credit.`,
        ],
        position,
      });
      last = position;
    }
    const end = [...quest.ends]
      .filter((giver) => giver.friendlyToAlliance && giver.positions.length)
      .sort(
        (left, right) =>
          positionCost(closestPosition(left.positions, last)!, last) -
          positionCost(closestPosition(right.positions, last)!, last),
      )[0];
    const endPosition = end && closestPosition(end.positions, last);
    if (!end || !endPosition) return null;
    stages.push({
      state: "rewarded",
      index: null,
      instructions: [
        ...(quest.category === "delivery" && quest.providedItem
          ? [
              `Deliver ${quest.providedItem.name}, supplied when you accepted the quest, to ${end.name}.`,
            ]
          : []),
        `Talk to ${end.name} in ${campaignZoneName(endPosition.zone)}. Turn in ${quest.title}.`,
      ],
      position: endPosition,
    });
    for (const stage of stages) {
      if (stage.state === "accepted" && capturedPickup) {
        const positions = capturedPickup.positions.flatMap(({ position }) => {
          const zone = campaignZoneId(position.zone);
          return zone ? [{ ...position, zone }] : [];
        });
        const point = closestPosition(positions, previous, options.previousZone);
        if (!point) return null;
        travelCost += positionCost(point, previous, options.previousZone);
        previous = point;
        actions.push({
          ...capturedPickup,
          id: `quest-funding-${options.checkpointId}-${quest.questId}-${capturedPickup.id}`,
          legId: options.legId,
          requiredQuestIds: [...new Set([...(capturedPickup.requiredQuestIds ?? []), ...parents])],
          fundingCheckpointId: options.checkpointId,
        });
        continue;
      }
      travelCost += positionCost(stage.position, previous, options.previousZone);
      previous = stage.position;
      const verb =
        stage.state === "accepted" ? "Accept" : stage.state === "rewarded" ? "Turn in" : "Complete";
      actions.push({
        id: `quest-funding-${options.checkpointId}-${quest.questId}-${stage.state}-${stage.index ?? 0}`,
        legId: options.legId,
        title: `${verb} ${quest.title}`,
        instructions: stage.instructions,
        questChanges: [
          {
            questId: quest.questId,
            title: quest.title,
            state: stage.state,
            objectiveIndex: stage.index,
          },
        ],
        positions: (stage.positions ?? [stage.position]).map((position) => ({
          sourceLine: 0,
          position: { ...position, floor: null, space: "map-percent" },
        })),
        source: null,
        kind: "quests",
        leaderOnly: options.leaderOnly,
        targetLevel: null,
        targetStopId: null,
        raidOnly: false,
        ...(stage.state === "accepted" && parents.length ? { requiredQuestIds: parents } : {}),
        libraryQuestId: quest.questId,
        libraryObjective: quest.groundPickup
          ? "interaction"
          : quest.category === "shared-kills"
            ? "shared-kills"
            : "delivery",
        xpOptional: true,
        xpTargetLevel: options.targetLevel,
        fundingCheckpointId: options.checkpointId,
        ...(quest.groundPickup && options.includeGroundPickups
          ? { fundingGroundPickup: quest.groundPickup }
          : {}),
      });
    }
  }
  let returnTravelCost = 0;
  if (options.resumePosition)
    returnTravelCost = positionCost(options.resumePosition, previous, options.previousZone);
  else if (options.resumeZone && previous?.zone !== options.resumeZone) {
    const from = previous?.zone ?? options.previousZone;
    const journey = from ? campaignGroundJourney(from, options.resumeZone) : null;
    returnTravelCost = journey ? journey.length + 1 : Infinity;
  }
  if (!Number.isFinite(returnTravelCost)) return null;
  return {
    questIds: ordered.map((quest) => quest.questId),
    actions,
    travelCost: travelCost + returnTravelCost,
    returnTravelCost,
    requiredKills:
      collections.reduce((sum, collection) => sum + collection.expectedKills, 0) +
      ordered.reduce(
        (sum, quest) =>
          sum + quest.objectives.reduce((count, objective) => count + (objective.count ?? 0), 0),
        0,
      ),
  };
}
