import type { PremadeMember } from "./premade-model.js";
import type { CampaignItemRequirement, CampaignItemTarget } from "./campaign-items.js";

type QuestStates = Readonly<PremadeMember["questStates"]>;

export interface CampaignItemIndex {
  readonly byQuest: ReadonlyMap<number, readonly CampaignItemRequirement[]>;
}

export function indexCampaignItems(
  requirements: readonly CampaignItemRequirement[],
): CampaignItemIndex {
  const byQuest = new Map<number, CampaignItemRequirement[]>();
  for (const row of requirements) {
    const own = byQuest.get(row.questId) ?? [];
    own.push(row);
    byQuest.set(row.questId, own);
  }
  return { byQuest };
}

/** Local minimum holdings. Zero means no proved minimum, never an observed empty bag. */
export class CampaignItemLedger {
  private readonly minimums = new Map<number, number>();

  constructor(
    private readonly index: CampaignItemIndex,
    completedStates: QuestStates = {},
    minimums: Readonly<Record<string, number>> = {},
  ) {
    for (const [id, quantity] of Object.entries(minimums)) this.minimums.set(Number(id), quantity);
    this.seedCompleted(completedStates);
  }

  private seedCompleted(completedStates: QuestStates): void {
    for (const [id, state] of Object.entries(completedStates))
      if (state === "objectives-complete") this.establish(this.index.byQuest.get(Number(id)) ?? []);
  }

  get lowerBounds(): ReadonlyMap<number, number> {
    return this.minimums;
  }

  snapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries([...this.minimums].filter(([, value]) => value > 0));
  }

  private establish(requirements: readonly CampaignItemRequirement[]): void {
    const totals = new Map<number, number>();
    for (const row of requirements)
      if (row.quantity !== null && !row.conflict)
        totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.quantity);
    for (const [id, quantity] of totals)
      this.minimums.set(id, Math.max(this.minimums.get(id) ?? 0, quantity));
  }

  collect(target: CampaignItemTarget, states: QuestStates): boolean {
    const state = states[String(target.questId)];
    // Stock collect can auto-complete from quest state, without a physical item observation.
    if (
      state === "rewarded" ||
      state === "objectives-complete" ||
      (target.objectiveBitmask === 0 && state === "accepted")
    )
      return false;
    this.minimums.set(
      target.itemId,
      Math.max(this.minimums.get(target.itemId) ?? 0, target.quantity),
    );
    return true;
  }

  completeObjective(questId: number, objectiveIndex: number): void {
    this.establish(
      (this.index.byQuest.get(questId) ?? []).filter(
        (row) => row.objectiveIndex === objectiveIndex,
      ),
    );
  }

  readyObjectives(questId: number): readonly number[] {
    const requirements = this.index.byQuest.get(questId) ?? [];
    const totals = new Map<number, number | null>();
    for (const row of requirements) {
      const previous = totals.get(row.itemId);
      totals.set(
        row.itemId,
        row.quantity === null || row.conflict || previous === null
          ? null
          : (previous ?? 0) + row.quantity,
      );
    }
    const indices = new Set(requirements.map((row) => row.objectiveIndex));
    return [...indices].filter((index) =>
      requirements
        .filter((row) => row.objectiveIndex === index)
        .every((row) => {
          const required = totals.get(row.itemId);
          return required != null && (this.minimums.get(row.itemId) ?? 0) >= required;
        }),
    );
  }

  consume(questId: number): ReadonlySet<number> {
    const unknown = new Set<number>();
    const totals = new Map<number, number>();
    for (const row of this.index.byQuest.get(questId) ?? []) {
      if (row.quantity === null || row.conflict) unknown.add(row.itemId);
      else totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.quantity);
    }
    for (const id of unknown) this.minimums.delete(id);
    for (const [id, quantity] of totals)
      if (!unknown.has(id))
        this.minimums.set(id, Math.max(0, (this.minimums.get(id) ?? 0) - quantity));
    return new Set([...unknown, ...totals.keys()]);
  }
}
