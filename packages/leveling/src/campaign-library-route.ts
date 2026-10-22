import type { CampaignAction, CampaignLeg, CampaignPlan } from "./campaign.js";
import type {
  CampaignLibraryQuest,
  CampaignSourceLevelGate,
  LibraryObjective,
} from "./campaign-library.js";
import { CAMPAIGN_BRIDGES } from "./campaign-route.js";
import { getPremadeQuest } from "./premade.js";

// These chapters are solo collection-heavy. Party filler must pass the kill-first closure;
// the separate mandatory-unlock pass below can still retain a necessary collection.
const killFirstSources = new Set([7, 9, 10, 11, 128]);

export interface CampaignLibraryChoice {
  readonly questId: number;
  readonly title: string;
  readonly objective: LibraryObjective;
  readonly sourceId: number;
  readonly referenceLevel: number;
  readonly prerequisiteIds: readonly number[];
  readonly legId: string | null;
  readonly role: "questing-backbone" | "kill-loop" | "nearby-quest" | "prerequisite" | "held";
  readonly reason: string | null;
}

export interface CampaignLibrarySelection {
  readonly revision: "source-backbone-20261021-v3";
  readonly choices: readonly CampaignLibraryChoice[];
}

interface Placement {
  readonly quest: CampaignLibraryQuest;
  readonly legId: string;
  readonly anchor: number;
  readonly required: boolean;
  readonly raidOnly: boolean;
  readonly backbone: boolean;
}

export function integrateCampaignQuestLibrary(
  plan: CampaignPlan,
  library: readonly CampaignLibraryQuest[],
  mandatoryQuestIds: ReadonlySet<number>,
  levelGates: readonly CampaignSourceLevelGate[] = [],
): CampaignPlan {
  const byId = new Map(library.map((quest) => [quest.questId, quest]));
  const owned = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  const sharedOwned = new Set(
    plan.actions.flatMap((action) =>
      action.leaderOnly ? [] : action.questChanges.map((change) => change.questId),
    ),
  );
  const paidAt = new Map<number, number>();
  plan.legs.forEach((leg, index) => {
    for (const action of plan.actions.filter((entry) => entry.legId === leg.id))
      for (const change of action.questChanges)
        if (change.state === "rewarded")
          if (!action.leaderOnly)
            paidAt.set(change.questId, Math.min(paidAt.get(change.questId) ?? index, index));
  });
  const selected = new Map<number, Placement>();
  const held = new Map<number, string>();
  const roots = new Set<number>();
  const extraLegs = new Map<string, { readonly leg: CampaignLeg; readonly before: number }>();

  function locationFor(
    sourceId: number,
    referenceLevel: number,
    zone: string,
  ): {
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
          referenceLevel >= leg.from - 3 &&
          referenceLevel <= leg.to + 1 &&
          CAMPAIGN_BRIDGES.some(
            (block) => block.id === leg.id && block.sourceIds.includes(sourceId),
          ),
      )
      .sort(
        (left, right) =>
          Math.abs(left.leg.from - referenceLevel) - Math.abs(right.leg.from - referenceLevel) ||
          left.index - right.index,
      )[0];
    if (matching) return { legId: matching.leg.id, anchor: matching.index };
    let before = plan.legs.findIndex((leg) => leg.kind === "dungeon" && leg.from > referenceLevel);
    if (before < 0) before = plan.legs.length - 1;
    const next = plan.legs[before]!;
    const legId = `library-${sourceId}-before-${next.id}`;
    if (!extraLegs.has(legId))
      extraLegs.set(legId, {
        before,
        leg: {
          id: legId,
          title: zone,
          from: referenceLevel,
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
  const location = (
    quest: CampaignLibraryQuest,
  ): { readonly legId: string; readonly anchor: number } =>
    locationFor(quest.sourceId, quest.referenceLevel, quest.zone);
  const locationForGate = (
    gate: CampaignSourceLevelGate,
  ): { readonly legId: string; readonly anchor: number } => {
    const source = gate.action.source;
    if (source) {
      const ordinal = sourceStepOrdinal(gate.action);
      const candidates = plan.actions
        .filter((action) => action.source?.chapterId === source.chapterId)
        .sort(
          (left, right) =>
            Math.abs(sourceStepOrdinal(left) - ordinal) -
            Math.abs(sourceStepOrdinal(right) - ordinal),
        );
      const match = candidates[0];
      if (match) {
        const anchor = plan.legs.findIndex((leg) => leg.id === match.legId);
        if (anchor >= 0) return { legId: match.legId, anchor };
      }
    }
    return locationFor(gate.sourceId, gate.referenceLevel, gate.zone);
  };
  const lifecycleClosures = [...owned].flatMap((questId) => {
    const existing = plan.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === questId),
    );
    const phases = new Set(
      existing.flatMap((action) =>
        action.questChanges
          .filter((change) => change.questId === questId)
          .map((change) => `${change.state}-${change.objectiveIndex ?? 0}`),
      ),
    );
    if (!phases.has("accepted-0") || phases.has("rewarded-0")) return [];
    const quest = byId.get(questId);
    if (!quest?.complete || quest.held || quest.abandoned) return [];
    const existingAnchor = Math.max(
      ...existing.map((action) => plan.legs.findIndex((leg) => leg.id === action.legId)),
    );
    if (existingAnchor < 0) throw new Error(`Owned quest ${questId} has no campaign leg.`);
    const sourceTarget = location(quest);
    const anchor = Math.max(existingAnchor, sourceTarget.anchor);
    const legId =
      sourceTarget.anchor >= existingAnchor ? sourceTarget.legId : plan.legs[anchor]!.id;
    const actions = quest.actions.flatMap((action) => {
      const retained = action.questChanges.filter((change) => {
        const key = `${change.state}-${change.objectiveIndex ?? 0}`;
        if (change.state === "accepted" || phases.has(key)) return false;
        phases.add(key);
        return true;
      });
      if (!retained.length) return [];
      return [
        {
          ...action,
          id: `library-close-${questId}-${action.id}`,
          legId,
          questChanges: retained,
          leaderOnly: existing.every((entry) => entry.leaderOnly),
          raidOnly: existing.every((entry) => entry.raidOnly),
          requiredQuestIds: [],
          libraryQuestId: questId,
          libraryBackbone: quest.backbone,
          libraryObjective: quest.objective,
          libraryRequired: true,
          xpOptional: false,
        },
      ];
    });
    if (
      actions.some(
        (action) =>
          !action.leaderOnly && action.questChanges.some((change) => change.state === "rewarded"),
      )
    )
      paidAt.set(questId, anchor);
    return actions.length ? [{ questId, legId, actions }] : [];
  });

  function closure(
    questId: number,
    anchor: number,
    required: boolean,
    allowCollection = false,
    visiting = new Set<number>(),
  ): { readonly quests: readonly CampaignLibraryQuest[]; readonly reason: string | null } {
    if (sharedOwned.has(questId))
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
    const allowSourceCollection = allowCollection && !killFirstSources.has(quest.sourceId);
    if (
      (!allowSourceCollection && quest.objective === "unclassified") ||
      (!required && !allowSourceCollection && quest.objective === "collection")
    )
      return {
        quests: [],
        reason: `Quest ${questId} needs ${quest.objective === "collection" ? "collection farming" : "objective review"}.`,
      };
    const next = new Set(visiting).add(questId);
    const result: CampaignLibraryQuest[] = [];
    for (const parent of quest.prerequisiteIds) {
      const branch = closure(parent, anchor, required, allowCollection, next);
      if (branch.reason) return branch;
      result.push(...branch.quests);
    }
    result.push(quest);
    const unique = [...new Map(result.map((entry) => [entry.questId, entry])).values()];
    if (
      !required &&
      !allowSourceCollection &&
      unique.filter((entry) => entry.objective === "delivery").length > 6
    )
      return {
        quests: [],
        reason: "More than six non-combat lead-ins; held instead of forcing a long courier chain.",
      };
    return { quests: unique, reason: null };
  }

  for (const quest of library.filter((entry) => entry.backbone)) {
    if (sharedOwned.has(quest.questId) || selected.has(quest.questId)) continue;
    if (getPremadeQuest(quest.questId)) {
      held.set(
        quest.questId,
        "Dungeon quest: review its dungeon bundle, not the outdoor source backbone.",
      );
      continue;
    }
    const target = location(quest);
    const branch = closure(quest.questId, target.anchor, false, true);
    if (branch.reason) {
      held.set(quest.questId, branch.reason);
      continue;
    }
    roots.add(quest.questId);
    for (const entry of branch.quests) {
      if (sharedOwned.has(entry.questId) || selected.has(entry.questId)) continue;
      selected.set(entry.questId, {
        quest: entry,
        legId: target.legId,
        anchor: target.anchor,
        required: false,
        raidOnly: false,
        backbone: true,
      });
    }
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
          backbone: previous?.backbone ?? false,
        });
      }
    }
  }
  for (const quest of library) {
    if (
      sharedOwned.has(quest.questId) ||
      selected.has(quest.questId) ||
      quest.backbone ||
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
          backbone: false,
        });
      else {
        const existing = selected.get(entry.questId)!;
        if (existing.raidOnly) selected.set(entry.questId, { ...existing, raidOnly: false });
      }
    }
  }
  let moved = true;
  while (moved) {
    moved = false;
    for (const [questId, placement] of selected) {
      const parent = placement.quest.prerequisiteIds
        .map((id) => selected.get(id))
        .filter((entry): entry is Placement => entry !== undefined)
        .sort((left, right) => right.anchor - left.anchor)[0];
      if (!parent || parent.anchor <= placement.anchor) continue;
      selected.set(questId, {
        ...placement,
        legId: parent.legId,
        anchor: parent.anchor,
      });
      moved = true;
    }
  }
  const ownedRaidOnly = new Set(
    [...sharedOwned].filter((questId) => {
      const questActions = plan.actions.filter((action) =>
        action.questChanges.some((change) => change.questId === questId),
      );
      return questActions.length > 0 && questActions.every((action) => action.raidOnly);
    }),
  );
  let raidChanged = true;
  while (raidChanged) {
    raidChanged = false;
    for (const [questId, placement] of selected) {
      if (
        placement.raidOnly ||
        !placement.quest.prerequisiteIds.some(
          (id) => ownedRaidOnly.has(id) || selected.get(id)?.raidOnly,
        )
      )
        continue;
      selected.set(questId, { ...placement, raidOnly: true });
      raidChanged = true;
    }
  }
  const promotedToShared = new Set(
    [...selected.keys()].filter((questId) => owned.has(questId) && !sharedOwned.has(questId)),
  );
  const additions = new Map<string, CampaignAction[]>();
  for (const { quest, legId, anchor, required, raidOnly, backbone } of selected.values()) {
    const target = plan.legs.slice(anchor).find((leg) => leg.kind === "dungeon")?.from ?? 60;
    const entries = additions.get(legId) ?? [];
    for (const action of quest.actions)
      entries.push({
        ...action,
        legId,
        raidOnly,
        libraryQuestId: quest.questId,
        libraryBackbone: backbone,
        libraryObjective: quest.objective,
        libraryRequired: required,
        xpOptional: !required && !backbone,
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
  for (const closure of lifecycleClosures) {
    if (promotedToShared.has(closure.questId)) continue;
    const entries = additions.get(closure.legId) ?? [];
    entries.push(...closure.actions);
    additions.set(closure.legId, entries);
  }
  for (const gate of levelGates) {
    if (plan.actions.some((action) => action.id === gate.action.id)) continue;
    const target = locationForGate(gate);
    const entries = additions.get(target.legId) ?? [];
    const routedSourceActions = gate.action.source
      ? plan.actions.filter(
          (action) =>
            action.legId === target.legId &&
            action.source?.chapterId === gate.action.source!.chapterId,
        )
      : [];
    entries.push({
      ...gate.action,
      legId: target.legId,
      leaderOnly:
        routedSourceActions.length > 0
          ? routedSourceActions.every((action) => action.leaderOnly)
          : gate.action.leaderOnly,
      raidOnly:
        routedSourceActions.length > 0
          ? routedSourceActions.every((action) => action.raidOnly)
          : gate.action.raidOnly,
    });
    additions.set(target.legId, entries);
  }
  const stages: CampaignLeg[] = [];
  const actions: CampaignAction[] = [];
  const usedExtra = [...extraLegs.values()].filter((entry) => additions.has(entry.leg.id));
  for (const [index, baseLeg] of plan.legs.entries()) {
    for (const entry of usedExtra.filter((extra) => extra.before === index)) emit(entry.leg);
    emit(baseLeg);
  }
  function emit(leg: CampaignLeg): void {
    const original = plan.actions
      .filter((action) => action.legId === leg.id)
      .flatMap((action): readonly CampaignAction[] => {
        if (!action.leaderOnly) return [action];
        const retained = action.questChanges.filter(
          (change) => !promotedToShared.has(change.questId),
        );
        if (retained.length === action.questChanges.length) return [action];
        if (!retained.length) return [];
        const description = (change: CampaignAction["questChanges"][number]): string =>
          `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Hand in" : `Complete objective ${change.objectiveIndex ?? 1} of`} ${change.title}.`;
        return [
          {
            ...action,
            title: retained.map(description).join(" · "),
            instructions: retained.map(description),
            questChanges: retained,
          },
        ];
      });
    const extra = [...(additions.get(leg.id) ?? [])].sort(sourceActionOrder);
    const entries = orderLibraryActions(mergeSourceActions(original, extra));
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
    .filter((quest) => !sharedOwned.has(quest.questId))
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
          ? quest.backbone
            ? "questing-backbone"
            : !roots.has(quest.questId)
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
    library: { revision: "source-backbone-20261021-v3", choices },
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

function sourceStepOrdinal(action: CampaignAction): number {
  const value = Number(action.source?.stepId.split("-").at(-1));
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER;
}

function mergeSourceActions(
  original: readonly CampaignAction[],
  extra: readonly CampaignAction[],
): readonly CampaignAction[] {
  const result = [...original];
  for (const action of extra) {
    if (!action.source) {
      result.push(action);
      continue;
    }
    const ordinal = sourceStepOrdinal(action);
    const before = result.findIndex(
      (candidate) =>
        candidate.source?.chapterId === action.source!.chapterId &&
        sourceStepOrdinal(candidate) > ordinal,
    );
    if (before >= 0) {
      result.splice(before, 0, action);
      continue;
    }
    let after = -1;
    for (const [index, candidate] of result.entries())
      if (candidate.source?.chapterId === action.source.chapterId) after = index;
    result.splice(after >= 0 ? after + 1 : result.length, 0, action);
  }
  return result;
}

function orderLibraryActions(entries: readonly CampaignAction[]): readonly CampaignAction[] {
  if (!entries.some((action) => action.libraryQuestId)) return entries;
  const phase = { accepted: 0, "objectives-complete": 1, rewarded: 2 };
  const pending = [...entries];
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

function sourceActionOrder(left: CampaignAction, right: CampaignAction): number {
  const source = (action: CampaignAction): number =>
    Number(/^chapter-\d+-(\d+)-/.exec(action.source?.chapterId ?? "")?.[1] ?? 99) * 10000000 +
    Number(action.source?.chapterId.split("-")[1] ?? 9999) * 10000 +
    Number(action.source?.stepId.split("-").at(-1) ?? 9999);
  return source(left) - source(right);
}
