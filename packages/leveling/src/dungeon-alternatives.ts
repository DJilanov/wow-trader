import type { CharacterProfile } from "./profile.js";
import type { ChapterReference } from "./chapter-catalog.js";
import { getChapterLabel } from "./chapter-catalog.js";
import type { ImportedChapter, GuideStepView } from "./guide-archive.js";
import { getGuideStepView } from "./guide-archive.js";
import { FOREVER_XP_CURVE, LEVELING_EVIDENCE } from "./westfall.js";
import { DUNGEON_FACTS, DUNGEON_VISITS } from "./dungeon-catalog.js";
import { dungeonQuestCompatibility, getDungeonQuest } from "./dungeon-planner.js";
import type { PersonalDungeonPlan } from "./dungeon-model.js";
import { xpToCheckpoint } from "./calculator.js";

export const THANES_REPLACEMENT = {
  version: "thanes-darkshore-v1-70205-crest",
  chapterId: "chapter-126-14-16-darkshore",
  continuationId: "chapter-127-16-19-darkshore",
  visitId: "thanes",
  minimumLevel: 15,
  targetLevel: 16,
  questIds: [96403, 96394, 96393, 96395],
  treatyId: 98423,
} as const;
export const DUNGEON_XP_CALIBRATION = {
  id: "crest-95189-6200-at-20-build-70205",
  questId: 95189,
  baselineXp: 2600,
  reportedXp: 6200,
  reportedLevel: 20,
  postedAt: "2026-10-02T02:04:13Z",
  targetBuild: 70205,
  source: "https://www.wowhead.com/forever/quest=95189/crest-of-lordaeron",
  status: "estimated",
} as const;
export type DungeonReplacementPlan = PersonalDungeonPlan["replacements"][string];
export const THANES_ROUTE_STEPS = [
  { id: "prepare", title: "Prepare your four-quest bundle", stage: "Before entry" },
  { id: "travel", title: "Reach Old Ironforge and meet your party", stage: "Before entry" },
  { id: "clear", title: "Clear Hall of Thanes", stage: "Inside" },
  { id: "treaty", title: "Check the level-16 Treaty bonus", stage: "Inside" },
  { id: "hand-ins", title: "Finish your quest hand-ins", stage: "Rewards" },
  { id: "bridge", title: "Keep the Darkshore quests you still need", stage: "Rejoin" },
  { id: "rejoin", title: "Check your level and continue", stage: "Rejoin" },
] as const;

export function emptyDungeonReplacement(): DungeonReplacementPlan {
  return {
    version: THANES_REPLACEMENT.version,
    active: false,
    stepId: null,
    progress: {},
    currentXp: null,
    killXp: null,
    tripMinutes: null,
    outdoorMinutes: null,
    returnLevel: null,
    carryover: {},
    preparationConfirmed: false,
    xpForecast: null,
    xpNeedsUpdate: false,
  };
}
export function offersThanesReplacement(
  chapter: ChapterReference,
  profile: CharacterProfile,
): boolean {
  return (
    chapter.id === THANES_REPLACEMENT.chapterId &&
    profile.faction === "alliance" &&
    getChapterLabel(chapter, profile).maximumLevel === THANES_REPLACEMENT.targetLevel
  );
}
export function calibratedDungeonQuestXp(questId: number, level: number): number | null {
  if (!Number.isInteger(level) || level < 1 || level > 60) return null;
  const quest = getDungeonQuest(questId);
  if (
    !quest ||
    quest.referenceXp === null ||
    quest.questLevel === null ||
    level > quest.questLevel + 5
  )
    return null;
  const isDungeon = DUNGEON_FACTS.associations.some((entry) => entry.questId === questId);
  return Math.round(
    quest.referenceXp *
      (isDungeon ? DUNGEON_XP_CALIBRATION.reportedXp / DUNGEON_XP_CALIBRATION.baselineXp : 1),
  );
}
export interface DungeonAlternativeEstimate {
  readonly level: number;
  readonly assumedLevel: boolean;
  readonly assumedProgress: boolean;
  readonly questIds: readonly number[];
  readonly questXp: number | null;
  readonly fullBundleXp: number | null;
  readonly neededXp: number | null;
  readonly gapXp: number | null;
  readonly coverage: "covers" | "needs-kills" | "unknown" | "already-ahead" | "too-early";
  readonly savedMinutes: number | null;
  readonly reasons: readonly string[];
}
export function estimateThanesReplacement(
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
): DungeonAlternativeEstimate {
  const replacement = plan.replacements[THANES_REPLACEMENT.chapterId] ?? emptyDungeonReplacement();
  const level = profile.level ?? 15;
  const currentXp = replacement.currentXp ?? 0;
  const reasons: string[] = [];
  const questIds = THANES_REPLACEMENT.questIds.filter((id) => {
    const quest = getDungeonQuest(id)!;
    return (
      dungeonQuestCompatibility(quest, profile) === "match" &&
      (quest.minimumLevel ?? Infinity) <= level
    );
  });
  const pending = questIds.filter(
    (id) => plan.questStates[String(id)] !== "rewarded" && !plan.retainedQuestIds.includes(id),
  );
  const rewards = pending.map((id) => calibratedDungeonQuestXp(id, level));
  const questXp = rewards.some((xp) => xp === null)
    ? null
    : rewards.reduce<number>((sum, xp) => sum + xp!, 0);
  const fullRewards = DUNGEON_VISITS.find((visit) => visit.id === "thanes")!.questIds.map((id) =>
    calibratedDungeonQuestXp(id, 16),
  );
  const fullBundleXp = fullRewards.some((xp) => xp === null)
    ? null
    : fullRewards.reduce<number>((sum, xp) => sum + xp!, 0);
  const validProgress =
    Number.isSafeInteger(currentXp) &&
    currentXp >= 0 &&
    (FOREVER_XP_CURVE[level] === undefined || currentXp < FOREVER_XP_CURVE[level]!);
  const neededXp = validProgress ? xpToCheckpoint(level, currentXp, 16, FOREVER_XP_CURVE) : null;
  const gapXp =
    neededXp === null || questXp === null
      ? null
      : Math.max(0, neededXp - questXp - (replacement.killXp ?? 0));
  if (!validProgress) reasons.push("XP progress must be below the XP required for the next level.");
  if (level < 15)
    reasons.push("Continue your outdoor route to level 15 before using this replacement.");
  if (plan.questStates["96391"] !== "rewarded" && pending.includes(96393))
    reasons.push("Old Ironforge Incursion requires Underground Map to be turned in before entry.");
  if (profile.party.size !== 5 || profile.party.readiness !== "together")
    reasons.push(
      "Recruitment and travel still count. This XP estimate is not a speed recommendation.",
    );
  return {
    level,
    assumedLevel: profile.level === null,
    assumedProgress: replacement.currentXp === null,
    questIds,
    questXp,
    fullBundleXp,
    neededXp,
    gapXp,
    coverage:
      level < 15
        ? "too-early"
        : level >= 16
          ? "already-ahead"
          : gapXp === null
            ? "unknown"
            : gapXp === 0
              ? "covers"
              : "needs-kills",
    savedMinutes:
      level === 15 &&
      gapXp === 0 &&
      replacement.tripMinutes !== null &&
      replacement.outdoorMinutes !== null
        ? replacement.outdoorMinutes - replacement.tripMinutes
        : null,
    reasons,
  };
}
export interface DungeonCarryover {
  readonly questId: number;
  readonly title: string;
  readonly sourceStepId: string;
  readonly conditional: boolean;
}
export function dungeonCarryoverRequirements(
  source: ImportedChapter,
  next: ImportedChapter,
  profile: CharacterProfile,
): readonly DungeonCarryover[] {
  if (
    source.targetBuild !== DUNGEON_XP_CALIBRATION.targetBuild ||
    next.targetBuild !== source.targetBuild
  )
    return [];
  const applicable = (chapter: ImportedChapter): readonly GuideStepView[] =>
    chapter.steps
      .map((step) => getGuideStepView(step, profile, { dungeons: [] }))
      .filter((view) => view.condition !== "exclude");
  const before = applicable(source),
    after = applicable(next);
  const introducedAfter = new Set<number>();
  const carry = new Map<number, DungeonCarryover>();
  for (const view of after)
    for (const directive of [...view.directives, ...view.conditionalDirectives].sort(
      (a, b) => a.sourceLine - b.sourceLine,
    )) {
      const id = directive.questId;
      if (
        directive.tag === ".accept" &&
        id !== null &&
        view.condition === "match" &&
        !view.optional &&
        view.runtimeChecks.length === 0 &&
        !view.conditionalDirectives.includes(directive)
      )
        introducedAfter.add(id);
      if (directive.tag !== ".turnin" || id === null || introducedAfter.has(id)) continue;
      const anchor = before.find((entry) =>
        [...entry.directives, ...entry.conditionalDirectives].some(
          (d) => d.tag === ".accept" && d.questId === id,
        ),
      );
      if (!anchor) continue;
      const conditional =
        view.condition === "unknown" ||
        view.conditionalDirectives.includes(directive) ||
        view.optional ||
        view.runtimeChecks.some((check) => [".isOnQuest", ".isQuestAvailable"].includes(check.tag));
      const existing = carry.get(id);
      if (existing) {
        if (!conditional && existing.conditional)
          carry.set(id, { ...existing, conditional: false });
        continue;
      }
      carry.set(id, {
        questId: id,
        title: directive.text.replace(/^(?:Turn in|Turnin)\s+/i, "").trim() || `Quest ${id}`,
        sourceStepId: anchor.step.id,
        conditional,
      });
    }
  return [...carry.values()];
}
export function dungeonReplacementRejoinReasons(
  profile: CharacterProfile,
  replacement: DungeonReplacementPlan,
  carryover: readonly DungeonCarryover[],
  sourceBuild: number,
): readonly string[] {
  const reasons: string[] = [];
  if (
    sourceBuild !== LEVELING_EVIDENCE.clientBuild ||
    sourceBuild !== DUNGEON_XP_CALIBRATION.targetBuild
  )
    reasons.push("The source build differs from this dungeon alternative.");
  if (profile.faction !== "alliance") reasons.push("This is an Alliance route alternative.");
  if (profile.classSlug === null || profile.xpRate === null)
    reasons.push(
      "Choose your class and known outdoor XP rate before reviewing the next chapter's quest chains.",
    );
  if (replacement.returnLevel === null || replacement.returnLevel < 16)
    reasons.push("Confirm you actually reached level 16 after the run and hand-ins.");
  for (const quest of carryover)
    if (
      replacement.carryover[String(quest.questId)] !== "ready" &&
      !(quest.conditional && replacement.carryover[String(quest.questId)] === "not-needed")
    )
      reasons.push(
        `Review ${quest.title} (${quest.questId}) before skipping its original preparation.`,
      );
  return reasons;
}
