import { z } from "zod";
import {
  CHAPTER_REFERENCES,
  LEVELING_RACES,
  WESTFALL_ROUTE,
  characterProfileSchema,
  createCharacterProfile,
  getLevelingRace,
  type CharacterProfile,
  type ChapterReference,
  type Faction,
  type RaceId,
} from "@wow-trader/leveling";

export const LEVELING_STORAGE_KEY = "kfc-leveling:characters:v1";
const MAX_WORKSPACE_LENGTH = 2_000_000;
export const LEGACY_PLANNER_STORAGE_KEY = "kfc-leveling:alliance-westfall-13-15:0.1.0";
export const WESTFALL_CHAPTER_ID =
  CHAPTER_REFERENCES.find((chapter) => chapter.sourceId === 125)?.id ??
  "chapter-125-13-15-westfall";
export const WESTFALL_READER_PATH = `/forever/leveling/routes/alliance-human/chapters/${WESTFALL_CHAPTER_ID}`;

const stepProgressSchema = z.record(
  z.string().regex(/^[a-z0-9-]{1,180}$/),
  z.enum(["done", "skipped"]),
);
export const readingPositionSchema = z
  .object({
    chapterId: z.string().regex(/^[a-z0-9-]{1,180}$/),
    version: z.string().regex(/^[a-z0-9.-]{1,80}$/),
    clientBuild: z.number().int().positive(),
    stepId: z.string().regex(/^[a-z0-9-]{1,180}$/),
  })
  .strict();
export type ReadingPosition = z.infer<typeof readingPositionSchema>;
const sessionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    profile: characterProfileSchema,
    progress: z.record(z.string().regex(/^[a-z0-9-]{1,180}$/), stepProgressSchema),
    lastChapterId: z
      .string()
      .regex(/^[a-z0-9-]{1,180}$/)
      .nullable(),
    readerPositions: z
      .record(z.string().regex(/^[a-z0-9-]{1,180}$/), z.string().regex(/^[a-z0-9-]{1,180}$/))
      .default({}),
    lastReader: readingPositionSchema.nullable().default(null),
  })
  .strict();
export const levelingWorkspaceSchema = z
  .object({
    version: z.literal(1),
    activeId: z.string().nullable(),
    sessions: z.array(sessionSchema).max(10),
  })
  .strict()
  .superRefine((workspace, context) => {
    if (
      new Set(workspace.sessions.map((session) => session.id)).size !== workspace.sessions.length ||
      (workspace.activeId !== null &&
        !workspace.sessions.some((session) => session.id === workspace.activeId))
    )
      context.addIssue({ code: "custom", message: "Invalid character session identity" });
  });
export type LevelingWorkspace = z.infer<typeof levelingWorkspaceSchema>;
export type LevelingSession = z.infer<typeof sessionSchema>;
export type StepProgress = "pending" | "done" | "skipped";

const progressDefinitionSchema = z
  .object({
    chapterId: z.string().regex(/^[a-z0-9-]{1,180}$/),
    version: z.string().regex(/^[a-z0-9.-]{1,80}$/),
    clientBuild: z.number().int().positive(),
    stepIds: z
      .array(z.string().regex(/^source-step-\d{4}$/))
      .min(1)
      .max(5000),
  })
  .strict();
export type ImportedProgressDefinition = z.infer<typeof progressDefinitionSchema>;

export function chapterProgressKey(
  chapterId: string,
  routeVersion: string,
  clientBuild: number,
): string {
  return `${chapterId}-v${routeVersion.replaceAll(".", "-")}-build-${clientBuild}`;
}

export function emptyLevelingWorkspace(): LevelingWorkspace {
  return { version: 1, activeId: null, sessions: [] };
}
export function readLevelingWorkspace(raw: string | null): LevelingWorkspace | null {
  if (!raw || raw.length > MAX_WORKSPACE_LENGTH) return null;
  try {
    const result = levelingWorkspaceSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function serializeLevelingWorkspace(workspace: LevelingWorkspace): string {
  const raw = JSON.stringify(workspace);
  if (raw.length > MAX_WORKSPACE_LENGTH)
    throw new Error(
      "Local progress has reached its save limit. Earlier saved progress is preserved; new changes last only for this visit.",
    );
  return raw;
}
export function readSharedCharacter(raw: string | null): CharacterProfile | null {
  if (!raw || raw.length > 1500) return null;
  try {
    const result = characterProfileSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function levelingRouteId(faction: Faction, raceId: RaceId): string {
  return `${faction}-${raceId}`;
}
export function profileForRouteId(routeId: string): CharacterProfile | null {
  const race = LEVELING_RACES.find((entry) => levelingRouteId(entry.faction, entry.id) === routeId);
  return race ? createCharacterProfile(race.faction, race.id) : null;
}
export function levelingDashboardPath(profile: CharacterProfile): string {
  return `/forever/leveling/routes/${levelingRouteId(profile.faction, profile.raceId)}`;
}
export function levelingChapterPath(profile: CharacterProfile, chapterId: string): string {
  return `${levelingDashboardPath(profile)}/chapters/${chapterId}`;
}
export function getPublicChapter(
  chapter: ChapterReference,
  profile: CharacterProfile,
): typeof WESTFALL_ROUTE | null {
  return chapter.id === WESTFALL_CHAPTER_ID && profile.faction === "alliance"
    ? WESTFALL_ROUTE
    : null;
}
export function profileSummary(profile: CharacterProfile): string {
  const race = getLevelingRace(profile.faction, profile.raceId);
  return `${race?.name ?? profile.raceId} · ${profile.classSlug ? profile.classSlug[0]?.toUpperCase() + profile.classSlug.slice(1) : "Class not selected"}`;
}

export function updateCharacterSession(
  workspace: LevelingWorkspace,
  sessionId: string,
  profile: CharacterProfile,
): LevelingWorkspace {
  const existing = workspace.sessions.find((session) => session.id === sessionId);
  if (
    existing &&
    (existing.profile.faction !== profile.faction ||
      existing.profile.raceId !== profile.raceId ||
      (existing.profile.classSlug !== null && profile.classSlug !== existing.profile.classSlug))
  )
    throw new Error("Create another character to change faction, race or an established class");
  const session: LevelingSession = {
    ...existing,
    id: sessionId,
    profile: characterProfileSchema.parse(profile),
    progress: existing?.progress ?? {},
    lastChapterId: existing?.lastChapterId ?? null,
    readerPositions: existing?.readerPositions ?? {},
    lastReader: existing?.lastReader ?? null,
  };
  if (!existing && workspace.sessions.length >= 10)
    throw new Error("Ten local characters are already saved. Select an existing character.");
  return levelingWorkspaceSchema.parse({
    ...workspace,
    activeId: sessionId,
    sessions: existing
      ? workspace.sessions.map((entry) => (entry.id === sessionId ? session : entry))
      : [...workspace.sessions, session],
  });
}

export function rememberReadingPosition(
  workspace: LevelingWorkspace,
  sessionId: string,
  position: ReadingPosition,
): LevelingWorkspace {
  const parsed = readingPositionSchema.safeParse(position);
  const session = workspace.sessions.find((entry) => entry.id === sessionId);
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === position.chapterId);
  if (!parsed.success || !session || !chapter?.factions.includes(session.profile.faction))
    return workspace;
  const key = chapterProgressKey(position.chapterId, position.version, position.clientBuild);
  if (
    session.readerPositions[key] === position.stepId &&
    JSON.stringify(session.lastReader) === JSON.stringify(position)
  )
    return workspace;
  return levelingWorkspaceSchema.parse({
    ...workspace,
    sessions: workspace.sessions.map((entry) =>
      entry.id === sessionId
        ? {
            ...entry,
            lastChapterId: position.chapterId,
            lastReader: position,
            readerPositions: { ...entry.readerPositions, [key]: position.stepId },
          }
        : entry,
    ),
  });
}

export function readingPositionPath(session: LevelingSession): string {
  const position = session.lastReader;
  if (position) {
    const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === position.chapterId);
    if (!chapter || !chapter.factions.includes(session.profile.faction))
      return levelingDashboardPath(session.profile);
    if (!position.version.startsWith("import-")) {
      const route = getPublicChapter(chapter, session.profile);
      if (
        !route ||
        route.version !== position.version ||
        route.clientBuild !== position.clientBuild ||
        !route.steps.some((step) => step.id === position.stepId)
      )
        return levelingChapterPath(session.profile, chapter.id);
    }
  }
  if (!position)
    return session.lastChapterId
      ? levelingChapterPath(session.profile, session.lastChapterId)
      : levelingDashboardPath(session.profile);
  const original = !position.version.startsWith("import-");
  return `${levelingChapterPath(session.profile, position.chapterId)}${original ? "?edition=kfc" : ""}#${original ? "route-" : "guide-"}${encodeURIComponent(position.stepId)}`;
}

export function updateStepProgress(
  workspace: LevelingWorkspace,
  sessionId: string,
  chapterId: string,
  stepId: string,
  status: StepProgress,
  importedDefinition?: ImportedProgressDefinition,
): LevelingWorkspace {
  const session = workspace.sessions.find((entry) => entry.id === sessionId);
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === chapterId);
  const route = chapter && session ? getPublicChapter(chapter, session.profile) : null;
  const imported = importedDefinition && progressDefinitionSchema.safeParse(importedDefinition);
  const validImport =
    imported?.success &&
    imported.data.chapterId === chapterId &&
    chapter?.factions.includes(session?.profile.faction ?? "alliance") &&
    imported.data.stepIds.includes(stepId);
  if (!session || (!validImport && (!route || !route.steps.some((step) => step.id === stepId))))
    return workspace;
  const releaseKey = validImport
    ? chapterProgressKey(chapterId, imported.data.version, imported.data.clientBuild)
    : chapterProgressKey(chapterId, route!.version, route!.clientBuild);
  const progress = { ...session.progress[releaseKey] };
  if (status === "pending") delete progress[stepId];
  else progress[stepId] = status;
  return levelingWorkspaceSchema.parse({
    ...workspace,
    sessions: workspace.sessions.map((entry) =>
      entry.id === sessionId
        ? {
            ...entry,
            lastChapterId: chapterId,
            progress: { ...entry.progress, [releaseKey]: progress },
          }
        : entry,
    ),
  });
}

export function isChapterComplete(
  session: LevelingSession | null,
  chapter: ChapterReference,
): boolean {
  if (!session) return false;
  const route = getPublicChapter(chapter, session.profile);
  return (
    route !== null &&
    route.steps
      .filter((step) => !step.optional)
      .every(
        (step) =>
          session.progress[chapterProgressKey(chapter.id, route.version, route.clientBuild)]?.[
            step.id
          ] === "done",
      )
  );
}
