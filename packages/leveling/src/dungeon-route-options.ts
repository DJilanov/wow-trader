import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { getChapterLabel, chapterEligibility, type ChapterReference } from "./chapter-catalog.js";
import { getGuideStepView, type ImportedChapter } from "./guide-archive.js";
import {
  dungeonQuestCompatibility,
  dungeonPrerequisiteClosure,
  dungeonRewardQuestIds,
  getDungeonQuest,
  compareDungeonPlan,
  dungeonSourceTags,
  type TimeInterval,
} from "./dungeon-planner.js";
import { scheduleDungeonVisit, type DungeonSchedule } from "./dungeon-scheduling.js";
import { calibratedDungeonQuestXp, THANES_REPLACEMENT } from "./dungeon-alternatives.js";
import { FOREVER_XP_CURVE, LEVELING_EVIDENCE } from "./westfall.js";
import { xpToCheckpoint } from "./calculator.js";
import type { CharacterProfile } from "./profile.js";
import type { PersonalDungeonPlan, DungeonQuest, DungeonVisit } from "./dungeon-model.js";

export const DUNGEON_TRIP_VERSION = "dungeon-trip-v2-70205";
export const DUNGEON_TRIP_STEPS = [
  { id: "prepare", title: "Collect quests and complete prerequisites", stage: "Before entry" },
  { id: "travel", title: "Meet your group at the dungeon", stage: "Before entry" },
  { id: "clear", title: "Complete the selected dungeon objectives", stage: "Inside" },
  { id: "hand-ins", title: "Hand in quests and record actual XP", stage: "Rewards" },
  { id: "bridge", title: "Keep the outdoor quest chains", stage: "Return" },
  { id: "rejoin", title: "Return to your saved outdoor step", stage: "Return" },
] as const;
export type DungeonTrip = PersonalDungeonPlan["trips"][string];
export interface DungeonRouteOption {
  readonly visit: DungeonVisit;
  readonly schedule: DungeonSchedule;
  readonly questIds: readonly number[];
  readonly unknownRestrictionCount: number;
  readonly beforeCount: number;
  readonly insideCount: number;
  readonly laterCount: number;
  readonly reviewedCount: number;
  readonly knownRewardCount: number;
  readonly rewardCount: number;
  readonly knownXp: number | null;
  readonly questXp: number | null;
  readonly xpKind: "estimated" | "reference";
  readonly reasons: readonly string[];
}

export function defaultDungeonBundle(
  visit: DungeonVisit,
  profile: CharacterProfile,
): readonly number[] {
  return visit.questIds.filter((id) => {
    const quest = getDungeonQuest(id)!;
    return (
      dungeonQuestCompatibility(quest, profile) === "match" &&
      quest.classSlug === null &&
      (quest.minimumLevel === null ||
        visit.levels === null ||
        quest.minimumLevel <= Math.max(visit.levels.atLevel, profile.level ?? 0)) &&
      quest.pickupStage !== "after" &&
      quest.objectiveStage !== "multiple-visits"
    );
  });
}

export function dungeonRouteOption(
  visit: DungeonVisit,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
): DungeonRouteOption {
  const questIds = [
    ...new Set(plan.selectedQuests[visit.id] ?? defaultDungeonBundle(visit, profile)),
  ];
  const quests = questIds
    .map((id) => getDungeonQuest(id))
    .filter((q): q is DungeonQuest => q !== null);
  const schedule = scheduleDungeonVisit(visit, profile, dungeonPrerequisiteClosure(questIds, plan));
  const level = schedule.level;
  const rewardLevel = Math.max(level ?? 0, profile.level ?? 0);
  const pending = quests.filter(
    (quest) =>
      plan.questStates[String(quest.id)] !== "rewarded" &&
      !plan.retainedQuestIds.includes(quest.id),
  );
  const xpKind =
    visit.availability === "beta" && level !== null && level <= LEVELING_EVIDENCE.betaLevelCap
      ? "estimated"
      : "reference";
  const rewards = pending.map((quest) =>
    xpKind === "estimated" && level !== null
      ? calibratedDungeonQuestXp(quest.id, rewardLevel)
      : quest.referenceXp,
  );
  const known = rewards.filter((xp): xp is number => xp !== null);
  const reasons = [...schedule.reasons];
  const reviewedCount = quests.filter(
    (q) =>
      q.pickupStage !== "unknown" &&
      q.objectiveStage === "inside" &&
      q.pickup !== null &&
      q.turnin !== null &&
      q.objective !== null &&
      !/\b(?:unknown|tbd|unconfirmed)\b/i.test(`${q.pickup} ${q.turnin} ${q.objective}`) &&
      q.minimumLevel !== null &&
      dungeonQuestCompatibility(q, profile) === "match",
  ).length;
  if (!questIds.length)
    reasons.push("No compatible one-run quest bundle is cataloged for this character.");
  if (reviewedCount !== quests.length)
    reasons.push(
      "Some selected quests need pickup, restriction, objective-scope or hand-in review.",
    );
  if (pending.some((q) => q.pickupStage === "after" || q.objectiveStage === "multiple-visits"))
    reasons.push(
      "Selected rewards need a later stage or another dungeon; they cannot be credited to this clear.",
    );
  if (known.length !== pending.length)
    reasons.push("Quest XP is incomplete; a known subtotal is not the full bundle reward.");
  return {
    visit,
    schedule,
    questIds,
    unknownRestrictionCount: visit.questIds.filter(
      (id) => dungeonQuestCompatibility(getDungeonQuest(id)!, profile) === "unknown",
    ).length,
    beforeCount: quests.filter((q) => q.pickupStage === "before").length,
    insideCount: quests.filter((q) => q.pickupStage === "inside").length,
    laterCount: quests.filter(
      (q) => q.pickupStage === "after" || q.objectiveStage === "multiple-visits",
    ).length,
    reviewedCount,
    knownRewardCount: known.length,
    rewardCount: pending.length,
    knownXp: known.length ? known.reduce((a, b) => a + b, 0) : null,
    questXp: known.length === pending.length ? known.reduce((a, b) => a + b, 0) : null,
    xpKind,
    reasons,
  };
}

export function chapterDungeonOptions(
  chapter: ChapterReference,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
): readonly DungeonRouteOption[] {
  if (chapter.family !== "questing" || chapterEligibility(chapter, profile) === "exclude")
    return [];
  const label = getChapterLabel(chapter, profile);
  if (label.unresolved) return [];
  return DUNGEON_VISITS.filter(
    (visit) => visit.faction === "both" || visit.faction === profile.faction,
  )
    .map((visit) => dungeonRouteOption(visit, profile, plan))
    .filter((option) => {
      const level = option.schedule.level;
      if (
        option.visit.id === "thanes" &&
        chapter.id === THANES_REPLACEMENT.chapterId &&
        profile.faction === "alliance"
      )
        return false;
      return (
        level !== null &&
        ((level >= label.minimumLevel && level < label.maximumLevel) ||
          (level === 60 && label.maximumLevel === 60))
      );
    })
    .sort(
      (a, b) =>
        a.schedule.level! - b.schedule.level! ||
        b.reviewedCount - a.reviewedCount ||
        a.visit.name.localeCompare(b.visit.name),
    );
}

export function dungeonTripKey(chapterId: string, visitId: string): string {
  return `${chapterId}--${visitId}`;
}

export function createDungeonTrip(
  visit: DungeonVisit,
  chapter: ChapterReference,
  guide: ImportedChapter,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
  returnStepId: string,
): DungeonTrip {
  const option = dungeonRouteOption(visit, profile, plan);
  if (
    guide.targetBuild !== LEVELING_EVIDENCE.clientBuild ||
    guide.chapterId !== chapter.id ||
    chapterEligibility(chapter, profile) !== "match"
  )
    throw new Error("Matching source build and character variant required.");
  if (
    option.schedule.state !== "ready" ||
    option.reviewedCount !== option.questIds.length ||
    option.questIds.length === 0 ||
    option.laterCount > 0
  )
    throw new Error("Dungeon run level or quest lifecycle has not been reviewed.");
  const step = guide.steps.find((entry) => entry.id === returnStepId);
  if (
    !step ||
    getGuideStepView(step, profile, { dungeons: dungeonSourceTags(plan) }).condition !== "match"
  )
    throw new Error("Return bookmark is not an applicable source step.");
  const fields = plan.scenarios[visit.id]?.fields ?? {};
  const checkpointFields: DungeonTrip["checkpointFields"] = {};
  for (const field of ["min", "max", "outdoorMin", "outdoorMax", "rate"] as const)
    if (fields[field] !== undefined) checkpointFields[field] = fields[field];
  const enteredXp = (value: string | undefined): number | null => {
    if (!value?.trim()) return null;
    const xp = Number(value);
    return Number.isSafeInteger(xp) && xp >= 0 && xp <= 1_000_000 ? xp : null;
  };
  return {
    version: DUNGEON_TRIP_VERSION,
    visitId: visit.id,
    chapterId: chapter.id,
    sourceVersion: guide.version,
    sourceSha256: guide.sourceSha256,
    returnStepId,
    questIds: [...option.questIds],
    stepId: "prepare",
    progress: {},
    targetLevel: Math.min(
      LEVELING_EVIDENCE.betaLevelCap,
      Math.max(profile.level ?? 0, option.schedule.level ?? 29) + 1,
    ),
    checkpointFields,
    currentXp: enteredXp(fields.currentXp),
    killXp: enteredXp(fields.kills),
    returnLevel: null,
    returnXp: null,
    xpNeedsUpdate: false,
    preparationConfirmed: false,
    sourceRetained: false,
  };
}

export function dungeonTripSourceReasons(
  trip: DungeonTrip,
  guide: ImportedChapter,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
): readonly string[] {
  const reasons: string[] = [];
  if (
    trip.sourceVersion !== guide.version ||
    trip.sourceSha256 !== guide.sourceSha256 ||
    trip.chapterId !== guide.chapterId ||
    guide.targetBuild !== LEVELING_EVIDENCE.clientBuild
  )
    reasons.push(
      "Source evidence changed; keep questing and review this trip again. Your old trip is preserved.",
    );
  const step = guide.steps.find((entry) => entry.id === trip.returnStepId);
  if (
    !step ||
    getGuideStepView(step, profile, { dungeons: dungeonSourceTags(plan) }).condition !== "match"
  )
    reasons.push("The saved return step is not applicable to this character variant.");
  return reasons;
}

export interface DungeonCheckpointComparison {
  readonly neededXp: number | null;
  readonly eligibleQuestXp: number | null;
  readonly knownSubtotal: number | null;
  readonly missingRewards: number;
  readonly shortfallXp: number | null;
  readonly tripMinutes: TimeInterval | null;
  readonly catchUpMinutes: TimeInterval | null;
  readonly timeSaved: TimeInterval | null;
  readonly reasons: readonly string[];
}
export function compareDungeonCheckpoint(input: {
  readonly visit: DungeonVisit;
  readonly profile: CharacterProfile;
  readonly plan: PersonalDungeonPlan;
  readonly questIds: readonly number[];
  readonly currentXp: number | null;
  readonly targetLevel: number;
  readonly killXp: number | null;
  readonly tripMinutes: TimeInterval | null;
  readonly outdoorMinutes: TimeInterval | null;
  readonly outdoorXpPerHour: number | null;
}): DungeonCheckpointComparison {
  const { visit, profile, plan } = input;
  const quests = dungeonPrerequisiteClosure(input.questIds, plan);
  const rewardIds = new Set(dungeonRewardQuestIds(input.questIds, plan));
  const remaining = quests.filter(
    (q) =>
      rewardIds.has(q.id) &&
      plan.questStates[String(q.id)] !== "rewarded" &&
      !plan.retainedQuestIds.includes(q.id),
  );
  const rewards = remaining.map((q) =>
    profile.level === null ? null : calibratedDungeonQuestXp(q.id, profile.level),
  );
  const known = rewards.filter((xp): xp is number => xp !== null);
  const reasons: string[] = [];
  const validXp =
    profile.level !== null &&
    input.currentXp !== null &&
    Number.isSafeInteger(input.currentXp) &&
    input.currentXp >= 0 &&
    input.currentXp < (FOREVER_XP_CURVE[profile.level] ?? 0) &&
    Number.isInteger(input.targetLevel) &&
    input.targetLevel > profile.level &&
    input.targetLevel <= LEVELING_EVIDENCE.betaLevelCap;
  const neededXp = validXp
    ? xpToCheckpoint(profile.level!, input.currentXp!, input.targetLevel, FOREVER_XP_CURVE)
    : null;
  if (neededXp === null)
    reasons.push(
      "Enter actual level/XP and a later checkpoint within the reviewed playable cap. At the cap this is a gear/quest trip, not a new level.",
    );
  const comparison = compareDungeonPlan({
    visit,
    profile,
    plan,
    questIds: input.questIds,
    mode: "extra-chain",
    segments: [],
    useReferenceXp: true,
    killXp: null,
    outdoorXpPerHour: { minimum: 1, maximum: 1 },
    omittedOutdoorXp: null,
    omittedOutdoorMinutes: null,
  });
  if (comparison.state !== "scenario") reasons.push(...comparison.reasons);
  const missingRewards = rewards.filter((xp) => xp === null).length;
  if (missingRewards)
    reasons.push(`${missingRewards} reward values are unknown; no complete XP total is claimed.`);
  const eligibleQuestXp =
    missingRewards === 0 && comparison.state === "scenario"
      ? known.reduce((a, b) => a + b, 0)
      : null;
  const validKills =
    input.killXp !== null &&
    Number.isSafeInteger(input.killXp) &&
    input.killXp >= 0 &&
    input.killXp <= 1_000_000;
  if (!validKills)
    reasons.push("Enter per-player kill XP, including explicit zero if none is assumed.");
  const shortfallXp =
    neededXp !== null && eligibleQuestXp !== null && validKills
      ? Math.max(0, neededXp - eligibleQuestXp - input.killXp!)
      : null;
  const intervalValid = (range: TimeInterval | null): range is TimeInterval =>
    range !== null &&
    Number.isFinite(range.minimum) &&
    range.minimum >= 0 &&
    Number.isFinite(range.maximum) &&
    range.maximum >= range.minimum;
  const tripMinutes = intervalValid(input.tripMinutes) ? input.tripMinutes : null;
  const rate = input.outdoorXpPerHour;
  const catchUpMinutes =
    shortfallXp !== null && rate !== null && Number.isFinite(rate) && rate > 0
      ? { minimum: (shortfallXp / rate) * 60, maximum: (shortfallXp / rate) * 60 }
      : null;
  if (!tripMinutes)
    reasons.push(
      "Enter both total-trip time bounds, including preparation, recruitment, both journeys, clear, hand-ins and retained work.",
    );
  const timeSaved =
    tripMinutes && catchUpMinutes && intervalValid(input.outdoorMinutes)
      ? {
          minimum: input.outdoorMinutes.minimum - tripMinutes.maximum - catchUpMinutes.maximum,
          maximum: input.outdoorMinutes.maximum - tripMinutes.minimum - catchUpMinutes.minimum,
        }
      : null;
  return {
    neededXp,
    eligibleQuestXp,
    knownSubtotal: known.length ? known.reduce((a, b) => a + b, 0) : null,
    missingRewards,
    shortfallXp,
    tripMinutes,
    catchUpMinutes,
    timeSaved,
    reasons: [...new Set(reasons)],
  };
}
