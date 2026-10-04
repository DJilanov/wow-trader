import {
  CHAPTER_REFERENCES,
  chapterEligibility,
  evaluateChapterCondition,
  findChapterTargets,
  getChapterLabel,
  type CharacterProfile,
  type ChapterReference,
} from "@wow-trader/leveling";

export interface ChapterHandoff {
  readonly kind: "single" | "choice" | "unresolved" | "end";
  readonly targets: readonly ChapterReference[];
  readonly message: string;
}
export function resolveChapterHandoff(
  chapter: ChapterReference,
  profile: CharacterProfile,
  publishedIds: readonly string[],
): ChapterHandoff {
  const targets = findChapterTargets(chapter, CHAPTER_REFERENCES, profile);
  const uncertain = chapter.next.some((edge) => {
    const condition = evaluateChapterCondition(edge.condition, profile);
    if (condition === "exclude") return false;
    const title = edge.value.split("\\").at(-1)?.trim();
    const candidates = CHAPTER_REFERENCES.filter(
      (entry) =>
        entry.title === title &&
        entry.family === chapter.family &&
        entry.factions.includes(profile.faction),
    );
    return (
      condition === "unknown" ||
      candidates.length === 0 ||
      candidates.some((entry) => chapterEligibility(entry, profile) === "unknown")
    );
  });
  if (
    uncertain ||
    targets.some((entry) => entry.id === chapter.id || !publishedIds.includes(entry.id))
  )
    return {
      kind: "unresolved",
      targets: [],
      message:
        "The source transition is incomplete, conditional or its instructions are unavailable. Choose a bracket in the overview; no connection or completion has been invented.",
    };
  if (targets.length === 1)
    return {
      kind: "single",
      targets,
      message:
        "This continuation is named by the source and matches your setup. It is not a playtested travel recommendation. Read its opening travel, pickup and level checks before proceeding.",
    };
  if (targets.length > 1)
    return {
      kind: "choice",
      targets,
      message:
        "The source provides multiple continuations. Choose after checking their requirements; none is selected automatically.",
    };
  if (getChapterLabel(chapter, profile).maximumLevel >= 60)
    return {
      kind: "end",
      targets: [],
      message:
        "You reached the end of this source branch. This does not prove that every quest or a complete playable route has been finished.",
    };
  return {
    kind: "unresolved",
    targets: [],
    message:
      "No reviewed source continuation is available for this setup. Browse the chapter overview without treating the remaining brackets as a connected route.",
  };
}
