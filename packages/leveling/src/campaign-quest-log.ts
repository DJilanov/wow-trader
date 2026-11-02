import { activeCampaignActions, type CampaignPlan } from "./campaign.js";
import type { PremadeProgress } from "./premade-model.js";
import { getDungeonBundle } from "./dungeon-bundles.js";
import { dungeonBundleSlotKey, GUARANTEED_DUNGEON_IDS } from "./dungeon-bundle-model.js";
import { QUEST_LOG_CAPACITY, usesQuestLogSlot, type QuestLogSlotKey } from "./quest-log.js";
import { campaignQuestObjectiveIndexes } from "./campaign-quest-objectives.js";
import { createCampaignQuestLogConditions } from "./campaign-quest-log-conditions.js";

export interface CampaignQuestLogMemberAudit {
  readonly player: number;
  readonly capacity: typeof QUEST_LOG_CAPACITY;
  readonly initialUsed: number;
  readonly peakUpperBound: number;
  readonly peakActionId: string | null;
  readonly firstPotentialOverflowActionId: string | null;
  readonly withinCapacity: boolean;
  readonly carriedAtEnd: readonly QuestLogSlotKey[];
  readonly inferredCarriedQuestIds: readonly number[];
}

interface Moment {
  readonly order: number;
  readonly actionId: string | null;
}
interface Lifetime {
  start: Moment | null;
  lastActive: number;
  lastHandIn: Moment | null;
  firstHandIn: number | null;
  firstPickup: number | null;
  firstWork: number | null;
}

/** Bounds the complete selected itinerary even when its XP forecast stops at an earlier gate. */
export function auditCampaignQuestLog(
  plan: CampaignPlan,
  progress: PremadeProgress,
  options: { readonly personalActionPlayers?: Readonly<Record<string, number>> } = {},
): readonly CampaignQuestLogMemberAudit[] {
  const actions = activeCampaignActions(plan, progress);
  const objectiveIndices = campaignQuestObjectiveIndexes(plan);
  for (const [id, player] of Object.entries(options.personalActionPlayers ?? {}))
    if (
      !Number.isInteger(player) ||
      player < 1 ||
      player > progress.members.length ||
      !plan.actions.some((action) => action.id === id && action.leaderOnly)
    )
      throw new Error("Invalid personal quest-log action owner.");

  return progress.members.map((member, index): CampaignQuestLogMemberAudit => {
    const recordedTurnIns = new Set<number>();
    for (const id of GUARANTEED_DUNGEON_IDS) {
      const bundle = getDungeonBundle(id, "alliance", progress.guaranteedBundles)!;
      for (const slot of bundle.slots)
        if (
          slot.questId !== null &&
          member.bundleSlotStates[dungeonBundleSlotKey(bundle, slot.index)] === "rewarded"
        )
          recordedTurnIns.add(slot.questId);
    }
    const lifetimes = new Map<QuestLogSlotKey, Lifetime>();
    const inferred = new Set<number>();
    const lifetime = (key: QuestLogSlotKey): Lifetime => {
      let entry = lifetimes.get(key);
      if (!entry) {
        entry = {
          start: null,
          lastActive: 0,
          lastHandIn: null,
          firstHandIn: null,
          firstPickup: null,
          firstWork: null,
        };
        lifetimes.set(key, entry);
      }
      return entry;
    };
    const knownRewarded = (key: QuestLogSlotKey): boolean =>
      key.startsWith("quest:") &&
      (member.questStates[key.slice(6)] === "rewarded" ||
        (recordedTurnIns.has(Number(key.slice(6))) &&
          !usesQuestLogSlot(member.questStates[key.slice(6)])));
    const occupy = (key: QuestLogSlotKey, moment: Moment, pickup: boolean): void => {
      if (knownRewarded(key)) return;
      const entry = lifetime(key);
      entry.start ??= moment;
      entry.lastActive = moment.order;
      entry.firstWork ??= moment.order;
      if (pickup) entry.firstPickup ??= moment.order;
    };
    const handIn = (key: QuestLogSlotKey, moment: Moment): void => {
      if (knownRewarded(key)) return;
      const entry = lifetime(key);
      entry.lastHandIn = moment;
      entry.firstHandIn ??= moment.order;
    };

    for (const [id, state] of Object.entries(member.questStates))
      if (usesQuestLogSlot(state))
        occupy(`quest:${Number(id)}`, { order: 0, actionId: null }, true);
    const initialUsed = lifetimes.size;
    const memberActions = actions.filter(
      (action) =>
        !action.leaderOnly || (options.personalActionPlayers?.[action.id] ?? 1) === index + 1,
    );
    const conditions = createCampaignQuestLogConditions(memberActions, member, objectiveIndices, [
      ...recordedTurnIns,
    ]);
    for (const id of conditions.inferredCarriedQuestIds) {
      inferred.add(id);
      occupy(`quest:${id}`, { order: 0, actionId: null }, false);
    }
    let order = 0;
    for (const action of memberActions) {
      const decision = conditions.decision(action);
      const moment = (): Moment => ({ order: ++order, actionId: action.id });
      if (action.kind === "checkpoint" && action.targetStopId) {
        const bundle = getDungeonBundle(
          action.targetStopId,
          "alliance",
          progress.guaranteedBundles,
        );
        if (bundle?.included) {
          const entry = moment();
          for (const slot of bundle.slots) {
            const slotKey = dungeonBundleSlotKey(bundle, slot.index);
            if (!slot.selected || member.bundleSlotStates[slotKey]) continue;
            occupy(
              slot.questId === null ? `bundle:${slotKey}` : `quest:${slot.questId}`,
              entry,
              true,
            );
            if (slot.questId !== null)
              conditions.advance(
                {
                  questId: slot.questId,
                  state: "accepted",
                  objectiveIndex: null,
                  title: "Dungeon quest",
                },
                "execute",
              );
          }
        }
      }
      for (const change of action.questChanges) {
        const point = moment(),
          key = `quest:${change.questId}` as const;
        if (decision !== "skip" && usesQuestLogSlot(change.state))
          occupy(key, point, change.state === "accepted");
        else if (decision === "execute" && change.state === "rewarded") handIn(key, point);
        conditions.advance(change, decision);
      }
      if (action.bundleId) {
        const bundle = getDungeonBundle(action.bundleId, "alliance", progress.guaranteedBundles)!;
        if (!bundle.included) continue;
        const point = moment();
        for (const slot of bundle.slots) {
          const slotKey = dungeonBundleSlotKey(bundle, slot.index);
          if (!slot.selected || member.bundleSlotStates[slotKey]) continue;
          handIn(slot.questId === null ? `bundle:${slotKey}` : `quest:${slot.questId}`, point);
          if (slot.questId !== null)
            conditions.advance(
              {
                questId: slot.questId,
                state: "rewarded",
                objectiveIndex: null,
                title: "Dungeon quest",
              },
              "execute",
            );
        }
      }
    }

    const events = new Map<
      number,
      {
        readonly moment: Moment;
        readonly add: QuestLogSlotKey[];
        readonly remove: QuestLogSlotKey[];
      }
    >();
    const event = (
      moment: Moment,
    ): { readonly add: QuestLogSlotKey[]; readonly remove: QuestLogSlotKey[] } => {
      let entry = events.get(moment.order);
      if (!entry) {
        entry = { moment, add: [], remove: [] };
        events.set(moment.order, entry);
      }
      return entry;
    };
    for (const [key, entry] of lifetimes) {
      // Missing pickups are conservatively treated as carried from the start, never as free hand-ins.
      if (
        key.startsWith("quest:") &&
        (entry.firstPickup === null ||
          (entry.firstWork !== null && entry.firstWork < entry.firstPickup) ||
          (entry.firstHandIn !== null && entry.firstHandIn < entry.firstPickup))
      ) {
        inferred.add(Number(key.slice(6)));
        entry.start = { order: 0, actionId: null };
      }
      if (!entry.start) entry.start = { order: 0, actionId: null };
      event(entry.start).add.push(key);
      // Widen duplicate/optional lifetimes to the final hand-in. This is an upper bound, not an XP forecast.
      if (entry.lastHandIn && entry.lastHandIn.order >= entry.lastActive)
        event(entry.lastHandIn).remove.push(key);
    }
    const active = new Set<QuestLogSlotKey>();
    let peakUpperBound = 0,
      peakActionId: string | null = null;
    let firstPotentialOverflowActionId: string | null = null;
    let overflowFound = false;
    for (const { moment, add, remove } of [...events.values()].sort(
      (a, b) => a.moment.order - b.moment.order,
    )) {
      for (const key of remove) active.delete(key);
      for (const key of add) active.add(key);
      if (active.size > peakUpperBound) {
        peakUpperBound = active.size;
        peakActionId = moment.actionId;
      }
      if (active.size > QUEST_LOG_CAPACITY && !overflowFound) {
        firstPotentialOverflowActionId = moment.actionId;
        overflowFound = true;
      }
    }
    return {
      player: index + 1,
      capacity: QUEST_LOG_CAPACITY,
      initialUsed,
      peakUpperBound,
      peakActionId,
      firstPotentialOverflowActionId,
      withinCapacity: peakUpperBound <= QUEST_LOG_CAPACITY,
      carriedAtEnd: [...active].sort(),
      inferredCarriedQuestIds: [...inferred].sort((a, b) => a - b),
    };
  });
}
