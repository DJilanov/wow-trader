import type { PremadeMember } from "./premade-model.js";

export const QUEST_LOG_CAPACITY = 40;

type QuestStates = Readonly<PremadeMember["questStates"]>;

export function usesQuestLogSlot(state: QuestStates[string] | undefined): boolean {
  return state === "accepted" || state === "objectives-complete";
}

export function questLogUsage(states: QuestStates): {
  readonly used: number;
  readonly free: number;
} {
  const used = Object.values(states).filter(usesQuestLogSlot).length;
  return { used, free: Math.max(0, QUEST_LOG_CAPACITY - used) };
}

export function canOccupyQuestLogSlot(states: QuestStates, questId: number): boolean {
  return usesQuestLogSlot(states[String(questId)]) || questLogUsage(states).free > 0;
}

export type QuestLogSlotKey = `quest:${number}` | `bundle:${string}`;

/** Local forecast state; reservations include selected dungeon quests whose IDs are pending. */
export class QuestLogLedger {
  private active = new Set<QuestLogSlotKey>();
  private readonly reserved = new Set<QuestLogSlotKey>();
  private peakUsed = 0;

  constructor(states: QuestStates) {
    this.sync(states);
  }

  get used(): number {
    return this.active.size + this.reserved.size;
  }
  get peak(): number {
    return this.peakUsed;
  }

  canReserve(keys: readonly QuestLogSlotKey[]): boolean {
    const added = new Set(keys.filter((key) => !this.active.has(key) && !this.reserved.has(key)));
    return added.size === 0 || this.used + added.size <= QUEST_LOG_CAPACITY;
  }

  reserve(keys: readonly QuestLogSlotKey[]): boolean {
    if (!this.canReserve(keys)) return false;
    for (const key of keys) if (!this.active.has(key)) this.reserved.add(key);
    this.peakUsed = Math.max(this.peakUsed, this.used);
    return true;
  }

  accept(questId: number): boolean {
    const key = `quest:${questId}` as const;
    if (!this.canReserve([key])) return false;
    this.reserved.delete(key);
    this.active.add(key);
    this.peakUsed = Math.max(this.peakUsed, this.used);
    return true;
  }

  handIn(questId: number): void {
    const key = `quest:${questId}` as const;
    this.active.delete(key);
    this.reserved.delete(key);
  }

  releaseReservation(key: QuestLogSlotKey): void {
    this.reserved.delete(key);
  }

  sync(states: QuestStates): void {
    this.active = new Set(
      Object.entries(states).flatMap(([id, state]) =>
        usesQuestLogSlot(state) ? [`quest:${Number(id)}` as const] : [],
      ),
    );
    for (const key of this.reserved)
      if (this.active.has(key) || (key.startsWith("quest:") && states[key.slice(6)] === "rewarded"))
        this.reserved.delete(key);
    this.peakUsed = Math.max(this.peakUsed, this.used);
  }
}
