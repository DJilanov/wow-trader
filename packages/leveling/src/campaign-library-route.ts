import type { CampaignAction, CampaignLeg, CampaignPlan } from "./campaign.js";
import type { CampaignLibraryQuest, LibraryObjective } from "./campaign-library.js";
import { CAMPAIGN_BRIDGES } from "./campaign-route.js";
import { getPremadeQuest } from "./premade.js";

export interface CampaignLibraryChoice {
  readonly questId: number;
  readonly title: string;
  readonly objective: LibraryObjective;
  readonly sourceId: number;
  readonly referenceLevel: number;
  readonly prerequisiteIds: readonly number[];
  readonly legId: string | null;
  readonly role: "kill-loop" | "nearby-quest" | "prerequisite" | "held";
  readonly reason: string | null;
}

export interface CampaignLibrarySelection {
  readonly revision: "source-backbone-20261015-v1";
  readonly choices: readonly CampaignLibraryChoice[];
}

interface Placement {
  readonly quest: CampaignLibraryQuest;
  readonly legId: string;
  readonly anchor: number;
  readonly required: boolean;
  readonly raidOnly: boolean;
}

export function integrateCampaignQuestLibrary(
  plan: CampaignPlan,
  library: readonly CampaignLibraryQuest[],
  mandatoryQuestIds: ReadonlySet<number>,
): CampaignPlan {
  const byId = new Map(library.map((quest) => [quest.questId, quest]));
  const owned = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  const paidAt = new Map<number, number>();
  plan.legs.forEach((leg, index) => {
    for (const action of plan.actions.filter((entry) => entry.legId === leg.id))
      for (const change of action.questChanges)
        if (change.state === "rewarded")
          paidAt.set(change.questId, Math.min(paidAt.get(change.questId) ?? index, index));
  });
  const selected = new Map<number, Placement>();
  const held = new Map<number, string>();
  const roots = new Set<number>();
  const extraLegs = new Map<string, { readonly leg: CampaignLeg; readonly before: number }>();

  function location(quest: CampaignLibraryQuest): {
    readonly legId: string;
    readonly anchor: number;
  } {
    const matching = plan.legs
      .map((leg, index) => ({ leg, index }))
      .filter(
        ({ leg }) =>
          leg.kind !== "starter" &&
          leg.kind !== "dungeon" &&
          leg.kind !== "finish" &&
          quest.referenceLevel >= leg.from - 3 &&
          quest.referenceLevel <= leg.to + 1 &&
          CAMPAIGN_BRIDGES.some(
            (block) => block.id === leg.id && block.sourceIds.includes(quest.sourceId),
          ),
      )
      .sort(
        (left, right) =>
          Math.abs(left.leg.from - quest.referenceLevel) -
            Math.abs(right.leg.from - quest.referenceLevel) || left.index - right.index,
      )[0];
    if (matching) return { legId: matching.leg.id, anchor: matching.index };
    let before = plan.legs.findIndex(
      (leg) => leg.kind === "dungeon" && leg.from > quest.referenceLevel,
    );
    if (before < 0) before = plan.legs.length - 1;
    const next = plan.legs[before]!;
    const legId = `library-${quest.sourceId}-before-${next.id}`;
    if (!extraLegs.has(legId))
      extraLegs.set(legId, {
        before,
        leg: {
          id: legId,
          title: quest.zone,
          from: plan.legs[before - 1]?.from ?? quest.referenceLevel,
          to: next.from,
          kind: "xp-bridge",
          stopId: null,
          actionIds: [],
          questIds: [],
          unresolvedQuestIds: [],
        },
      });
    return { legId, anchor: before };
  }

  function closure(
    questId: number,
    anchor: number,
    required: boolean,
    visiting = new Set<number>(),
  ): { readonly quests: readonly CampaignLibraryQuest[]; readonly reason: string | null } {
    if (owned.has(questId))
      return {
        quests: [],
        reason:
          (paidAt.get(questId) ?? Infinity) > anchor
            ? `Prerequisite ${questId} is not returned before this checkpoint.`
            : null,
      };
    if (visiting.has(questId))
      return { quests: [], reason: "The source prerequisite chain is cyclic or ambiguous." };
    const quest = byId.get(questId);
    if (!quest || !quest.complete || quest.held)
      return { quests: [], reason: `Quest ${questId} lacks a complete shared-party source chain.` };
    if (quest.objective === "unclassified" || (!required && quest.objective === "collection"))
      return {
        quests: [],
        reason: `Quest ${questId} needs ${quest.objective === "collection" ? "collection farming" : "objective review"}.`,
      };
    const next = new Set(visiting).add(questId);
    const result: CampaignLibraryQuest[] = [];
    for (const parent of quest.prerequisiteIds) {
      const branch = closure(parent, anchor, required, next);
      if (branch.reason) return branch;
      result.push(...branch.quests);
    }
    result.push(quest);
    const unique = [...new Map(result.map((entry) => [entry.questId, entry])).values()];
    if (!required && unique.filter((entry) => entry.objective === "delivery").length > 6)
      return {
        quests: [],
        reason: "More than six non-combat lead-ins; held instead of forcing a long courier chain.",
      };
    return { quests: unique, reason: null };
  }

  // Required dungeon unlocks are retained even if they include an unavoidable collection stage.
  for (const questId of mandatoryQuestIds) {
    const quest = byId.get(questId);
    const action = plan.actions.find((entry) =>
      entry.questChanges.some((change) => change.questId === questId),
    );
    if (!quest || !action) continue;
    const anchor = plan.legs.findIndex((leg) => leg.id === action.legId);
    for (const parent of quest.prerequisiteIds) {
      const branch = closure(parent, anchor, true);
      if (branch.reason) {
        held.set(parent, branch.reason);
        continue;
      }
      for (const entry of branch.quests) {
        const previous = selected.get(entry.questId);
        selected.set(entry.questId, {
          quest: entry,
          legId: previous && previous.anchor < anchor ? previous.legId : action.legId,
          anchor: Math.min(previous?.anchor ?? anchor, anchor),
          required: true,
          raidOnly: (previous?.raidOnly ?? true) && action.raidOnly,
        });
      }
    }
  }
  for (const quest of library) {
    if (
      owned.has(quest.questId) ||
      selected.has(quest.questId) ||
      quest.referenceLevel < 13 ||
      quest.referenceLevel >= 60
    )
      continue;
    if (!["shared-kills", "named-trophy", "delivery", "interaction"].includes(quest.objective))
      continue;
    const short = quest.objective === "delivery" || quest.objective === "interaction";
    if (
      short &&
      !nearbyLibraryQuest(
        quest,
        plan.actions.filter((action) =>
          action.questChanges.some((change) => change.state === "objectives-complete"),
        ),
      )
    )
      continue;
    if (getPremadeQuest(quest.questId)) {
      held.set(
        quest.questId,
        "Dungeon quest: review its dungeon bundle, not an outdoor kill loop.",
      );
      continue;
    }
    const target = location(quest);
    const branch = closure(quest.questId, target.anchor, false);
    if (branch.reason) {
      held.set(quest.questId, branch.reason);
      continue;
    }
    const late = branch.quests
      .map((entry) => selected.get(entry.questId))
      .find((entry) => entry && entry.anchor > target.anchor);
    const placement = late ?? target;
    if (short && branch.quests.some((entry) => !nearbyLibraryQuest(entry, quest.actions))) {
      held.set(quest.questId, "The lead-ins leave this nearby quest cluster.");
      continue;
    }
    roots.add(quest.questId);
    for (const entry of branch.quests) {
      if (!selected.has(entry.questId))
        selected.set(entry.questId, {
          quest: entry,
          legId: placement.legId,
          anchor: placement.anchor,
          required: false,
          raidOnly: false,
        });
      else {
        const existing = selected.get(entry.questId)!;
        if (existing.raidOnly) selected.set(entry.questId, { ...existing, raidOnly: false });
      }
    }
  }
  const additions = new Map<string, CampaignAction[]>();
  for (const { quest, legId, anchor, required, raidOnly } of selected.values()) {
    const target = plan.legs.slice(anchor).find((leg) => leg.kind === "dungeon")?.from ?? 60;
    const entries = additions.get(legId) ?? [];
    for (const action of quest.actions)
      entries.push({
        ...action,
        legId,
        raidOnly,
        libraryQuestId: quest.questId,
        libraryObjective: quest.objective,
        libraryRequired: required,
        xpOptional: !required,
        xpTargetLevel: target,
        instructions: [
          ...action.instructions,
          ...(quest.objective === "named-trophy"
            ? [
                "Named-target trophy: verify loot/credit for all five players. No guaranteed drop rate, single-kill completion or respawn time is assumed.",
              ]
            : []),
          ...(required && quest.objective === "collection"
            ? [
                "Required dungeon prerequisite: this collection is retained for access, not recommended as XP farming.",
              ]
            : []),
        ],
      });
    additions.set(legId, entries);
  }
  const stages: CampaignLeg[] = [];
  const actions: CampaignAction[] = [];
  const usedExtra = [...extraLegs.values()].filter((entry) => additions.has(entry.leg.id));
  for (const [index, baseLeg] of plan.legs.entries()) {
    for (const entry of usedExtra.filter((extra) => extra.before === index)) emit(entry.leg);
    emit(baseLeg);
  }
  function emit(leg: CampaignLeg): void {
    const original = plan.actions.filter((action) => action.legId === leg.id);
    const extra = additions.get(leg.id) ?? [];
    const entries = orderLibraryActions([...original, ...extra]);
    actions.push(...entries);
    stages.push({
      ...leg,
      actionIds: entries.map((action) => action.id),
      questIds: [
        ...new Set(
          entries.flatMap((action) => action.questChanges.map((change) => change.questId)),
        ),
      ],
    });
  }
  const choices = library
    .filter((quest) => !owned.has(quest.questId))
    .map((quest): CampaignLibraryChoice => {
      const placement = selected.get(quest.questId);
      return {
        questId: quest.questId,
        title: quest.title,
        objective: quest.objective,
        sourceId: quest.sourceId,
        referenceLevel: quest.referenceLevel,
        prerequisiteIds: quest.prerequisiteIds,
        legId: placement?.legId ?? null,
        role: placement
          ? !roots.has(quest.questId)
            ? "prerequisite"
            : ["delivery", "interaction"].includes(quest.objective)
              ? "nearby-quest"
              : "kill-loop"
          : "held",
        reason: placement
          ? null
          : (held.get(quest.questId) ??
            (quest.held
              ? "Personal or unsupported runtime condition."
              : !quest.complete
                ? "Incomplete source lifecycle."
                : quest.objective === "collection"
                  ? "Personal collection farm excluded."
                  : quest.objective === "unclassified"
                    ? "Objective needs review."
                    : "Outside the shared outdoor selection.")),
      };
    });
  const inserted = new Set(selected.keys());
  return {
    ...plan,
    executionRevision: "workflow-20261015-v4",
    legs: stages,
    actions,
    catchUpBatches: plan.catchUpBatches?.filter((batch) => !inserted.has(batch.questId)) ?? [],
    library: { revision: "source-backbone-20261015-v1", choices },
  };
}

export function nearbyLibraryQuest(
  quest: CampaignLibraryQuest,
  camp: readonly CampaignAction[],
): boolean {
  if (quest.objective === "delivery") {
    const pickup = quest.actions.find(
      (action) => action.questChanges[0]?.state === "accepted",
    )?.source;
    const handIn = quest.actions.find(
      (action) => action.questChanges[0]?.state === "rewarded",
    )?.source;
    const span =
      Number(handIn?.stepId.split("-").at(-1)) - Number(pickup?.stepId.split("-").at(-1));
    if (
      !pickup ||
      !handIn ||
      pickup.chapterId !== handIn.chapterId ||
      !Number.isFinite(span) ||
      span < 0 ||
      span > 8
    )
      return false;
  }
  const points = quest.actions.flatMap((action) => action.positions.map((entry) => entry.position));
  const campPoints = camp.flatMap((action) => action.positions.map((entry) => entry.position));
  if (!points.length || quest.actions.some((action) => !action.positions.length)) return false;
  const origin = points[0]!;
  const close = (left: (typeof points)[number], right: (typeof points)[number]): boolean =>
    left.space === "map-percent" &&
    right.space === left.space &&
    left.zone === right.zone &&
    left.floor === right.floor &&
    Math.hypot(left.x - right.x, left.y - right.y) <= 12;
  return (
    points.every((point) => close(point, origin)) &&
    points.some((point) => campPoints.some((candidate) => close(point, candidate)))
  );
}

function orderLibraryActions(entries: readonly CampaignAction[]): readonly CampaignAction[] {
  if (!entries.some((action) => action.libraryQuestId)) return entries;
  const phase = { accepted: 0, "objectives-complete": 1, rewarded: 2 };
  const pending = [...entries].sort((left, right) => {
    const ending = (action: CampaignAction): boolean =>
      action.kind === "xp-check" || action.id.endsWith("-deliveries");
    if (ending(left) !== ending(right)) return Number(ending(left)) - Number(ending(right));
    if (left.questChanges.length === 0 || right.questChanges.length === 0)
      return Number(left.questChanges.length > 0) - Number(right.questChanges.length > 0);
    const source = (action: CampaignAction): number =>
      Number(/^chapter-\d+-(\d+)-/.exec(action.source?.chapterId ?? "")?.[1] ?? 99) * 10000000 +
      Number(action.source?.chapterId.split("-")[1] ?? 9999) * 10000 +
      Number(action.source?.stepId.split("-").at(-1) ?? 9999);
    return source(left) - source(right);
  });
  const result: CampaignAction[] = [];
  while (pending.length) {
    const index = pending.findIndex(
      (action) =>
        !pending.some(
          (other) =>
            other !== action &&
            ((action.kind === "checkpoint" &&
              other.questChanges.some(
                (change) =>
                  change.state === "rewarded" && action.requiredQuestIds?.includes(change.questId),
              )) ||
              action.questChanges.some((change) =>
                other.questChanges.some(
                  (parent) =>
                    (parent.questId === change.questId &&
                      phase[parent.state] < phase[change.state]) ||
                    (change.state === "accepted" &&
                      parent.state === "rewarded" &&
                      action.requiredQuestIds?.includes(parent.questId)),
                ),
              )),
        ),
    );
    if (index < 0) throw new Error(`Cyclic source library stages in ${pending[0]?.legId}.`);
    result.push(pending.splice(index, 1)[0]!);
  }
  return result;
}
