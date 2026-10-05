import {
  chapterEligibility,
  evaluateChapterCondition,
  getChapterLabel,
  getGuideStepView,
  getDungeonQuest,
  FOREVER_XP_CURVE,
  RUNTIME_CHECK_TAGS,
  xpToCheckpoint,
  type CharacterProfile,
  type ChapterReference,
  type ImportedChapter,
  type ImportedDirective,
  type ImportedStep,
} from "@wow-trader/leveling";

interface ActivityDirective {
  readonly tag: string;
  readonly arguments: string;
  readonly condition: string;
  readonly questId: number | null;
}
interface ActivityStep {
  readonly id: string;
  readonly condition: string;
  readonly directives: readonly ActivityDirective[];
}
export interface ChapterActivity {
  readonly chapterId: string;
  readonly steps: readonly ActivityStep[];
}
export interface ChapterActivityStats {
  readonly questCount: number;
  readonly conditionalQuestCount: number;
  readonly optionalQuestCount: number;
  readonly handInCount: number;
  readonly conditionalHandInCount: number;
  readonly knownRewardCount: number;
  readonly referenceRewardXp: number | null;
}
export interface ChapterPathNode {
  readonly chapter: ChapterReference;
  readonly targets: readonly { readonly chapterId: string; readonly conditional: boolean }[];
  readonly missingTargets: readonly string[];
}

const questActions = new Set([".accept", ".complete", ".turnin", ".daily", ".dailyturnin"]);

export function projectChapterActivity(chapter: ImportedChapter): ChapterActivity {
  return {
    chapterId: chapter.chapterId,
    steps: chapter.steps
      .filter((step) => step.directives.some((directive) => questActions.has(directive.tag)))
      .map((step) => ({
        id: step.id,
        condition: step.condition,
        directives: step.directives
          .filter(
            (directive) =>
              questActions.has(directive.tag) ||
              directive.tag.startsWith("#") ||
              RUNTIME_CHECK_TAGS.has(directive.tag) ||
              [".dungeon", ".group", ".solo"].includes(directive.tag),
          )
          .map((directive) => ({
            tag: directive.tag,
            arguments: directive.arguments,
            condition: directive.condition,
            questId: directive.questId,
          })),
      })),
  };
}

export function chapterActivityStats(
  activity: ChapterActivity,
  profile: CharacterProfile,
): ChapterActivityStats {
  const quests = new Set<number>(),
    conditional = new Set<number>(),
    required = new Set<number>();
  const handIns = new Set<number>(),
    conditionalHandIns = new Set<number>();
  for (const source of activity.steps) {
    const step: ImportedStep = {
      ...source,
      ordinal: 1,
      sourceLine: 1,
      directives: source.directives.map((directive): ImportedDirective => ({
        ...directive,
        text: "",
        position: null,
        sourceLine: 1,
      })),
    };
    const view = getGuideStepView(step, profile, { dungeons: [] });
    if (view.condition === "exclude") continue;
    for (const directive of [...view.directives, ...view.conditionalDirectives]) {
      if (!questActions.has(directive.tag) || directive.questId === null) continue;
      const uncertain =
        view.condition === "unknown" || view.conditionalDirectives.includes(directive);
      (uncertain ? conditional : quests).add(directive.questId);
      if (!uncertain && !view.optional) required.add(directive.questId);
      if ([".turnin", ".dailyturnin"].includes(directive.tag))
        (uncertain ? conditionalHandIns : handIns).add(directive.questId);
    }
  }
  const rewards = [...handIns].flatMap((id) => {
    const xp = getDungeonQuest(id)?.referenceXp;
    return xp === null || xp === undefined ? [] : [xp];
  });
  return {
    questCount: quests.size,
    conditionalQuestCount: [...conditional].filter((id) => !quests.has(id)).length,
    optionalQuestCount: [...quests].filter((id) => !required.has(id)).length,
    handInCount: handIns.size,
    conditionalHandInCount: [...conditionalHandIns].filter((id) => !handIns.has(id)).length,
    knownRewardCount: rewards.length,
    referenceRewardXp: rewards.length ? rewards.reduce((sum, xp) => sum + xp, 0) : null,
  };
}

export function buildChapterPath(
  catalog: readonly ChapterReference[],
  profile: CharacterProfile,
  family: ChapterReference["family"],
): readonly ChapterPathNode[] {
  const chapters = catalog
    .filter(
      (chapter) => chapter.family === family && chapterEligibility(chapter, profile) !== "exclude",
    )
    .sort(
      (a, b) =>
        getChapterLabel(a, profile).minimumLevel - getChapterLabel(b, profile).minimumLevel ||
        a.sourceId - b.sourceId,
    );
  return chapters.map((chapter) => {
    const targets = new Map<string, boolean>(),
      missing = new Set<string>();
    for (const edge of chapter.next) {
      const condition = evaluateChapterCondition(edge.condition, profile);
      if (condition === "exclude") continue;
      const title = edge.value.split("\\").at(-1)?.trim() ?? edge.value.trim();
      const sourceCandidates = catalog.filter(
        (candidate) =>
          candidate.title === title &&
          candidate.family === family &&
          candidate.factions.includes(profile.faction),
      );
      if (!sourceCandidates.length) missing.add(title);
      for (const candidate of sourceCandidates) {
        const eligibility = chapterEligibility(candidate, profile);
        if (eligibility === "exclude") continue;
        const conditional = condition === "unknown" || eligibility === "unknown";
        targets.set(candidate.id, (targets.get(candidate.id) ?? true) && conditional);
      }
    }
    return {
      chapter,
      targets: [...targets].map(([chapterId, conditional]) => ({ chapterId, conditional })),
      missingTargets: [...missing],
    };
  });
}

export const CHAPTER_PACE_KEY = "kfc-leveling:chapter-pace:v1";

export function parseChapterPace(raw: string): number | null {
  if (!raw.trim()) return null;
  const pace = Number(raw);
  return Number.isFinite(pace) && pace >= 1 && pace <= 1_000_000_000 ? pace : null;
}

export function chapterTargetXp(
  chapter: ChapterReference,
  profile: CharacterProfile,
): number | null {
  const label = getChapterLabel(chapter, profile);
  if (label.minimumLevel === label.maximumLevel || label.unresolved) return null;
  return xpToCheckpoint(label.minimumLevel, 0, label.maximumLevel, FOREVER_XP_CURVE);
}

export function estimateChapterMinutes(xp: number | null, xpPerHour: number | null): number | null {
  return xp !== null &&
    Number.isFinite(xp) &&
    xp > 0 &&
    xpPerHour !== null &&
    parseChapterPace(String(xpPerHour)) !== null
    ? (xp / xpPerHour) * 60
    : null;
}

export function formatChapterMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return "Not estimated";
  const rounded = Math.max(5, Math.ceil(minutes / 5) * 5);
  const hours = Math.floor(rounded / 60),
    remainder = rounded % 60;
  return hours ? `≈${hours}h${remainder ? ` ${remainder}m` : ""}` : `≈${rounded}m`;
}
