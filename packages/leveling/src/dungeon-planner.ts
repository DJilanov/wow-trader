import type { CharacterProfile } from "./profile.js";
import { compareBranches } from "./calculator.js";
import type { ImportedChapter, GuideStepView } from "./guide-archive.js";
import { DUNGEON_QUESTS, DUNGEON_VISITS } from "./dungeon-catalog.js";
import { DUNGEON_FACTS } from "./dungeon-catalog.js";
import { scheduleDungeonVisit } from "./dungeon-scheduling.js";
import {
  evaluateDungeonGate,
  gateQuestIds,
  type DungeonGate,
  type DungeonQuest,
  type DungeonVisit,
  type PersonalDungeonPlan,
} from "./dungeon-model.js";

const questsById = new Map(DUNGEON_QUESTS.map((quest) => [quest.id, quest]));
const pickupMapNames: Readonly<Record<number, string>> = {
  1413: "the barrens",
  1420: "tirisfal glades",
  1421: "silverpine forest",
  1426: "dun morogh",
  1431: "duskwood",
  1433: "redridge mountains",
  1434: "stranglethorn vale",
  1436: "westfall",
  1437: "wetlands",
  1439: "darkshore",
  1440: "ashenvale",
  1441: "thousand needles",
  1442: "stonetalon mountains",
  1444: "feralas",
  1453: "stormwind city",
  1454: "orgrimmar",
  1455: "ironforge",
  1456: "thunder bluff",
  1457: "darnassus",
  1458: "undercity",
};
export function getDungeonQuest(id: number): DungeonQuest | null {
  return questsById.get(id) ?? null;
}
export function dungeonSourceTags(plan: PersonalDungeonPlan): readonly string[] {
  return DUNGEON_VISITS.flatMap((visit) =>
    visit.sourceTag && ["planned", "finished"].includes(plan.visits[visit.id] ?? "")
      ? [visit.sourceTag]
      : [],
  );
}
export function dungeonQuestCompatibility(
  quest: DungeonQuest,
  profile: CharacterProfile,
): "match" | "exclude" | "unknown" {
  if (quest.faction !== "both" && quest.faction !== profile.faction) return "exclude";
  if (quest.raceIds.length && !quest.raceIds.includes(profile.raceId)) return "exclude";
  if (!quest.restrictionsKnown) return "unknown";
  if (quest.classSlug !== null && profile.classSlug === null) return "unknown";
  return quest.classSlug !== null && quest.classSlug !== profile.classSlug ? "exclude" : "match";
}
export function dungeonPrerequisiteClosure(
  ids: readonly number[],
  plan?: PersonalDungeonPlan,
): readonly DungeonQuest[] {
  const ordered: DungeonQuest[] = [],
    seen = new Set<number>();
  function include(id: number): void {
    if (seen.has(id)) return;
    const quest = getDungeonQuest(id);
    if (!quest) throw new Error(`Unknown dungeon quest ${id}`);
    seen.add(id);
    for (const prerequisite of plan
      ? questStateRequirements(quest.gate, plan).map((requirement) => requirement.questId)
      : gateQuestIds(quest.gate))
      include(prerequisite);
    ordered.push(quest);
  }
  ids.forEach(include);
  return ordered;
}
function questStateRequirements(
  gate: DungeonGate,
  plan?: PersonalDungeonPlan,
): readonly Extract<DungeonGate, { kind: "quest" }>[] {
  if (gate.kind === "quest") return [gate];
  if (gate.kind !== "all" && gate.kind !== "any") return [];
  const chosen =
    gate.kind === "any" && plan
      ? gate.gates.find((child) => evaluateDungeonGate(child, plan) === "ready")
      : undefined;
  return (chosen ? [chosen] : gate.gates).flatMap((child) => questStateRequirements(child, plan));
}
function unresolvedAlternative(gate: DungeonGate, plan: PersonalDungeonPlan): boolean {
  if (gate.kind !== "all" && gate.kind !== "any") return false;
  if (gate.kind === "any")
    return !gate.gates.some((child) => evaluateDungeonGate(child, plan) === "ready");
  return gate.gates.some((child) => unresolvedAlternative(child, plan));
}
export function dungeonRewardQuestIds(
  ids: readonly number[],
  plan: PersonalDungeonPlan,
): readonly number[] {
  const rewards = new Set(ids);
  for (const quest of dungeonPrerequisiteClosure(ids, plan))
    for (const requirement of questStateRequirements(quest.gate, plan))
      if (requirement.state === "rewarded") rewards.add(requirement.questId);
  return [...rewards];
}
export function dungeonQuestReadiness(
  quest: DungeonQuest,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
): string {
  if (dungeonQuestCompatibility(quest, profile) !== "match")
    return "Character restrictions need review";
  const state = plan.questStates[String(quest.id)] ?? "unknown";
  if (state === "rewarded") return "Already rewarded";
  if (quest.pickupStage === "unknown" || quest.objectiveStage === "unknown")
    return "Lifecycle review needed — see source quest details";
  if (quest.pickupStage === "inside") return "Starts inside — do not collect before entry";
  if (quest.pickupStage === "after" || quest.objectiveStage === "multiple-visits")
    return "Later stage / multiple locations";
  if (quest.minimumLevel === null || profile.level === null) return "Confirm pickup level";
  if (profile.level < quest.minimumLevel) return `Pickup needs level ${quest.minimumLevel}`;
  if (state === "accepted" || state === "objectives-complete")
    return "Quest held — confirm required starting items";
  const gate = evaluateDungeonGate(quest.gate, plan);
  return gate === "ready"
    ? "Eligible by reference — accept in game"
    : gate === "blocked"
      ? "Prerequisite not ready"
      : "Confirm prerequisite state";
}
export function describeDungeonGate(gate: DungeonGate): string {
  if (gate.kind === "quest")
    return `${getDungeonQuest(gate.questId)?.title ?? "Quest"} (${gate.questId}) ${gate.state === "rewarded" ? "turned in" : gate.state}`;
  if (gate.kind === "item") return `Item ${gate.itemId} required`;
  if (gate.kind === "confirmation") return gate.label;
  if (!gate.gates.length)
    return "No prerequisite recorded (reference, not a live eligibility check)";
  return gate.gates.map(describeDungeonGate).join(gate.kind === "all" ? " AND " : " OR ");
}
export function dungeonGateConfirmations(
  gate: DungeonGate,
): readonly { readonly id: string; readonly label: string }[] {
  if (gate.kind === "confirmation") return [{ id: gate.id, label: gate.label }];
  if (gate.kind === "item")
    return [{ id: `item-${gate.itemId}`, label: `Required item ${gate.itemId} held` }];
  return gate.kind === "all" || gate.kind === "any"
    ? gate.gates.flatMap(dungeonGateConfirmations)
    : [];
}
export interface DungeonAttachment {
  readonly id: string;
  readonly visitId: string;
  readonly questId: number;
  readonly stepId: string;
  readonly sourceLine: number;
  readonly action: "source-present" | "nearby-pickup";
  readonly requiresReview: boolean;
}
export function attachDungeonPreparation(
  guide: ImportedChapter,
  views: readonly GuideStepView[],
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
): readonly DungeonAttachment[] {
  if (guide.targetBuild !== DUNGEON_FACTS.targetBuild) return [];
  const attachments: DungeonAttachment[] = [];
  for (const visit of DUNGEON_VISITS) {
    if (plan.visits[visit.id] !== "planned" || visit.availability !== "beta") continue;
    const ids =
      plan.selectedQuests[visit.id] ??
      visit.questIds.filter((id) => {
        const quest = getDungeonQuest(id);
        return quest !== null && dungeonQuestCompatibility(quest, profile) === "match";
      });
    for (const quest of dungeonPrerequisiteClosure(ids, plan)) {
      if (
        dungeonQuestCompatibility(quest, profile) !== "match" ||
        quest.pickupStage !== "before" ||
        plan.questStates[String(quest.id)] === "rewarded" ||
        quest.pickup === null
      )
        continue;
      const existing = views.find(
        (view) =>
          view.condition === "match" &&
          view.directives.some(
            (directive) => directive.tag === ".accept" && directive.questId === quest.id,
          ),
      );
      let step = existing,
        sourceLine = existing?.step.sourceLine,
        action: DungeonAttachment["action"] = "source-present";
      if (!step && quest.position) {
        let nearest = Infinity;
        for (const view of views) {
          if (view.condition !== "match") continue;
          for (const directive of view.directives) {
            const position = directive.position;
            const zoneName =
              position?.zone === "StormwindClassic"
                ? "stormwind city"
                : position?.zone.trim().toLowerCase();
            if (
              !position ||
              position.space !== "map-percent" ||
              position.floor !== null ||
              (position.zone !== String(quest.position.mapId) &&
                zoneName !== pickupMapNames[quest.position.mapId])
            )
              continue;
            const distance = Math.hypot(
              position.x - quest.position.x,
              position.y - quest.position.y,
            );
            if (distance <= 4 && distance < nearest) {
              nearest = distance;
              step = view;
              sourceLine = directive.sourceLine;
            }
          }
        }
        action = "nearby-pickup";
      }
      if (!step || sourceLine === undefined) continue;
      attachments.push({
        id: `prepare-${visit.id}-${quest.id}-${guide.version}-${step.step.id}`,
        visitId: visit.id,
        questId: quest.id,
        stepId: step.step.id,
        sourceLine,
        action,
        requiresReview:
          action === "nearby-pickup" ||
          evaluateDungeonGate(quest.gate, plan) !== "ready" ||
          profile.level === null ||
          quest.minimumLevel === null ||
          profile.level < quest.minimumLevel,
      });
    }
  }
  return attachments;
}
export interface DungeonCoverageRow {
  readonly visitId: string;
  readonly questId: number;
  readonly accept: number;
  readonly objective: number;
  readonly turnin: number;
  readonly status:
    | "source-present"
    | "overlay-needed"
    | "inside-start"
    | "later-stage"
    | "unavailable"
    | "lifecycle-review";
}
export function auditDungeonCoverage(
  chapters: readonly ImportedChapter[],
): readonly DungeonCoverageRow[] {
  const counts = new Map<number, { accept: number; objective: number; turnin: number }>();
  for (const chapter of chapters)
    for (const step of chapter.steps)
      for (const directive of step.directives) {
        if (directive.questId === null) continue;
        const kind =
          directive.tag === ".accept"
            ? "accept"
            : directive.tag === ".complete"
              ? "objective"
              : directive.tag === ".turnin"
                ? "turnin"
                : null;
        if (!kind) continue;
        const count = counts.get(directive.questId) ?? { accept: 0, objective: 0, turnin: 0 };
        count[kind] += 1;
        counts.set(directive.questId, count);
      }
  return DUNGEON_VISITS.flatMap((visit) =>
    visit.questIds.map((questId) => {
      const quest = getDungeonQuest(questId)!;
      const count = counts.get(questId) ?? { accept: 0, objective: 0, turnin: 0 };
      return {
        visitId: visit.id,
        questId,
        ...count,
        status:
          visit.availability !== "beta"
            ? "unavailable"
            : quest.pickupStage === "unknown" || quest.objectiveStage === "unknown"
              ? "lifecycle-review"
              : quest.pickupStage === "inside"
                ? "inside-start"
                : quest.pickupStage === "after" || quest.objectiveStage === "multiple-visits"
                  ? "later-stage"
                  : count.accept && count.turnin
                    ? "source-present"
                    : "overlay-needed",
      };
    }),
  );
}

export interface TimeInterval {
  readonly minimum: number;
  readonly maximum: number;
}
export interface DungeonTimeSegment {
  readonly id: string;
  readonly minutes: TimeInterval;
  readonly retained: boolean;
}
export interface DungeonComparisonInput {
  readonly visit: DungeonVisit;
  readonly profile: CharacterProfile;
  readonly plan: PersonalDungeonPlan;
  readonly questIds: readonly number[];
  readonly mode: "whole-trip" | "extra-chain";
  readonly segments: readonly DungeonTimeSegment[];
  readonly useReferenceXp: boolean;
  readonly killXp: number | null;
  readonly outdoorXpPerHour: TimeInterval | null;
  readonly omittedOutdoorXp: number | null;
  readonly omittedOutdoorMinutes: TimeInterval | null;
}
export interface DungeonComparison {
  readonly state: "incomplete" | "blocked" | "scenario";
  readonly reasons: readonly string[];
  readonly addedXp: number | null;
  readonly minutes: TimeInterval;
  readonly gainXp: TimeInterval | null;
  readonly timeSaved: TimeInterval | null;
  readonly breakEvenMinutes: TimeInterval | null;
  readonly decision: "worthwhile" | "not-for-speed" | "conditional" | "unknown";
}
function intervalValid(interval: TimeInterval): boolean {
  return (
    Number.isFinite(interval.minimum) &&
    Number.isFinite(interval.maximum) &&
    interval.minimum >= 0 &&
    interval.maximum >= interval.minimum
  );
}
export function compareDungeonPlan(input: DungeonComparisonInput): DungeonComparison {
  const reasons: string[] = [];
  if (new Set(input.segments.map((segment) => segment.id)).size !== input.segments.length)
    throw new Error("Shared travel/activity segment counted twice");
  if (
    input.segments.some((segment) => !intervalValid(segment.minutes)) ||
    (input.outdoorXpPerHour &&
      (!intervalValid(input.outdoorXpPerHour) || input.outdoorXpPerHour.minimum <= 0)) ||
    (input.omittedOutdoorMinutes && !intervalValid(input.omittedOutdoorMinutes))
  )
    throw new Error("Invalid dungeon time/rate interval");
  for (const value of [input.killXp, input.omittedOutdoorXp])
    if (value !== null && (!Number.isSafeInteger(value) || value < 0))
      throw new Error("Invalid XP amount");
  const segments = input.segments.filter((segment) => !segment.retained);
  const minutes = {
    minimum: segments.reduce((sum, segment) => sum + segment.minutes.minimum, 0),
    maximum: segments.reduce((sum, segment) => sum + segment.minutes.maximum, 0),
  };
  const remaining = dungeonPrerequisiteClosure(input.questIds, input.plan).filter(
    (quest) =>
      input.plan.questStates[String(quest.id)] !== "rewarded" &&
      !input.plan.retainedQuestIds.includes(quest.id),
  );
  const rewardIds = new Set(dungeonRewardQuestIds(input.questIds, input.plan));
  const rewardWork = remaining.filter((quest) => rewardIds.has(quest.id));
  let blocked =
    input.visit.availability !== "beta" ||
    input.visit.groupSize !== 5 ||
    input.questIds.length === 0;
  if (blocked) reasons.push("This visit has no runnable reviewed quest bundle for this setup.");
  const schedule = scheduleDungeonVisit(input.visit, input.profile, remaining);
  if (schedule.state !== "ready") {
    reasons.push(...schedule.reasons);
    if (schedule.state !== "unknown-level") blocked = true;
  }
  for (const quest of remaining) {
    if (unresolvedAlternative(quest.gate, input.plan)) {
      blocked = true;
      reasons.push(
        `Quest ${quest.id}: confirm one legal prerequisite branch before pricing its work.`,
      );
    }
    for (const requirement of questStateRequirements(quest.gate, input.plan)) {
      const predecessor = getDungeonQuest(requirement.questId);
      if (
        requirement.state === "rewarded" &&
        input.plan.questStates[String(requirement.questId)] !== "rewarded" &&
        predecessor?.objectiveStage === "inside" &&
        !/inside|corpse/i.test(predecessor.turnin ?? "")
      ) {
        blocked = true;
        reasons.push(
          `Quest ${quest.id}: ${requirement.questId} must be turned in outside its dungeon first; plan a return/later visit, not a single-run reward.`,
        );
      }
    }
    if (
      rewardIds.has(quest.id) &&
      quest.objectiveStage === "inside" &&
      !input.visit.questIds.includes(quest.id)
    ) {
      blocked = true;
      reasons.push(`Quest ${quest.id}: a different dungeon visit is required before this bundle.`);
    }
    if (quest.pickupStage === "unknown" || quest.objectiveStage === "unknown") {
      blocked = true;
      reasons.push(`Quest ${quest.id}: lifecycle/scope has not been reviewed.`);
    }
    if (dungeonQuestCompatibility(quest, input.profile) !== "match") {
      blocked = true;
      reasons.push(`Quest ${quest.id}: character restriction unresolved or incompatible.`);
    }
    if (quest.minimumLevel === null || input.profile.level === null)
      reasons.push(`Quest ${quest.id}: pickup level is unconfirmed.`);
    else if (input.profile.level < quest.minimumLevel) {
      blocked = true;
      reasons.push(
        `Quest ${quest.id}: needs level ${quest.minimumLevel} before pickup; later rewards cannot unlock it.`,
      );
    }
    if (
      quest.pickupStage === "after" ||
      (rewardIds.has(quest.id) && quest.objectiveStage === "multiple-visits")
    ) {
      blocked = true;
      reasons.push(`Quest ${quest.id}: reward needs a later stage or multiple visits.`);
    }
    const unresolved = dungeonGateConfirmations(quest.gate).filter(
      (gate) => input.plan.confirmations[gate.id] !== true,
    );
    if (unresolved.length) {
      blocked = true;
      reasons.push(...unresolved.map((gate) => gate.label));
    }
    for (const item of quest.requiredItems)
      if (input.plan.confirmations[`item-${item.id}`] !== true) {
        blocked = true;
        reasons.push(
          `Quest ${quest.id}: confirm required starting item ${item.title} (${item.id}).`,
        );
      }
  }
  if (!input.plan.confirmations[`${input.visit.id}-quest-log-space`])
    reasons.push("Confirm quest-log space and any quest-start items before entry.");
  if (!input.useReferenceXp || rewardWork.some((quest) => quest.referenceXp === null))
    reasons.push(
      "Current quest reward XP is unknown. Offline reference values cannot become live rankings.",
    );
  if (!input.outdoorXpPerHour) reasons.push("Enter your attainable outdoor XP/hour.");
  if (
    input.mode === "whole-trip" &&
    (input.killXp === null ||
      input.omittedOutdoorXp === null ||
      input.omittedOutdoorMinutes === null)
  )
    reasons.push("Full-trip comparison needs per-player kill XP and the outdoor work it replaces.");
  const addedXp =
    input.useReferenceXp &&
    !remaining.some((quest) => unresolvedAlternative(quest.gate, input.plan)) &&
    rewardWork.every(
      (quest) => quest.referenceXp !== null && !unresolvedAlternative(quest.gate, input.plan),
    )
      ? rewardWork.reduce((sum, quest) => sum + quest.referenceXp!, 0) +
        (input.mode === "whole-trip" ? (input.killXp ?? 0) : 0)
      : null;
  let gainXp: TimeInterval | null = null,
    timeSaved: TimeInterval | null = null,
    breakEvenMinutes: TimeInterval | null = null;
  const rate = input.outdoorXpPerHour;
  if (addedXp !== null && rate) {
    gainXp = {
      minimum: addedXp - (rate.maximum * minutes.maximum) / 60,
      maximum: addedXp - (rate.minimum * minutes.minimum) / 60,
    };
    breakEvenMinutes = {
      minimum: (60 * addedXp) / rate.maximum,
      maximum: (60 * addedXp) / rate.minimum,
    };
    if (
      input.mode === "whole-trip" &&
      input.omittedOutdoorXp !== null &&
      input.omittedOutdoorMinutes
    ) {
      function savedTime(
        outdoorMinutes: number,
        extraMinutes: number,
        outdoorRate: number,
      ): number | null {
        // Reuse the equal-goal calculator. No level projection is requested here;
        // the earlier pickup gates above must be met before prospective rewards.
        return compareBranches({
          level: input.profile.level ?? 1,
          currentXp: 0,
          curve: null,
          omitted: [{ id: "replaced-outdoor-work", xp: input.omittedOutdoorXp }],
          added: [{ id: "incremental-dungeon-rewards", xp: addedXp }],
          completedQuestIds: [],
          outdoorMinutes,
          alternativeXpPerHour: outdoorRate,
          time: {
            clear: extraMinutes,
            travel: 0,
            pickups: 0,
            idleWait: 0,
            prerequisites: 0,
            turnins: 0,
          },
          checkpoints: [],
        }).savedMinutes;
      }
      const minimum = savedTime(input.omittedOutdoorMinutes.minimum, minutes.maximum, rate.minimum);
      const maximum = savedTime(input.omittedOutdoorMinutes.maximum, minutes.minimum, rate.maximum);
      if (minimum !== null && maximum !== null) timeSaved = { minimum, maximum };
      else reasons.push("Comparison inputs exceed the equal-goal calculator's supported limits.");
    }
  }
  const state = blocked ? "blocked" : reasons.length ? "incomplete" : "scenario";
  const result = input.mode === "whole-trip" ? timeSaved : gainXp;
  return {
    state,
    reasons,
    addedXp,
    minutes,
    gainXp,
    timeSaved,
    breakEvenMinutes,
    decision:
      state !== "scenario" || !result
        ? "unknown"
        : result.minimum > 0
          ? "worthwhile"
          : result.maximum <= 0
            ? "not-for-speed"
            : "conditional",
  };
}
