import { z } from "zod";
import {
  levelingWorkspaceSchema,
  readLevelingWorkspace,
  serializeLevelingWorkspace,
  type LevelingWorkspace,
} from "./leveling-experience";

const backupSchema = z
  .object({
    format: z.literal("kfc-leveling-backup"),
    version: z.literal(1),
    exportedAt: z.string().datetime(),
    workspace: levelingWorkspaceSchema,
  })
  .strict();

export function exportLevelingBackup(workspace: LevelingWorkspace, now: Date = new Date()): string {
  serializeLevelingWorkspace(workspace);
  return JSON.stringify(
    backupSchema.parse({
      format: "kfc-leveling-backup",
      version: 1,
      exportedAt: now.toISOString(),
      workspace,
    }),
  );
}

export function readLevelingBackup(raw: string): LevelingWorkspace {
  if (raw.length > 2_010_000) throw new Error("Backup exceeds the 2 MB progress limit.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const result = backupSchema.safeParse(value);
  if (!result.success || !readLevelingWorkspace(serializeLevelingWorkspace(result.data.workspace)))
    throw new Error("Unsupported or invalid KFC leveling backup. Nothing has been changed.");
  return result.data.workspace;
}

export function mergeLevelingBackup(
  current: LevelingWorkspace,
  incoming: LevelingWorkspace,
): LevelingWorkspace {
  const sessions = [...current.sessions];
  for (const imported of incoming.sessions) {
    const index = sessions.findIndex((entry) => entry.id === imported.id);
    if (index < 0) {
      sessions.push(imported);
      continue;
    }
    const existing = sessions[index]!;
    if (
      existing.profile.faction !== imported.profile.faction ||
      existing.profile.raceId !== imported.profile.raceId ||
      existing.profile.classSlug !== imported.profile.classSlug
    )
      throw new Error(
        "A character ID belongs to a different setup. Import cancelled; existing progress is unchanged.",
      );
    const progress = { ...imported.progress };
    for (const [release, steps] of Object.entries(existing.progress))
      // Absence is an intentional pending/undone state, not permission to restore an older tick.
      progress[release] = steps;
    sessions[index] = {
      ...imported,
      ...existing,
      progress,
      readerPositions: { ...imported.readerPositions, ...existing.readerPositions },
      lastReader: existing.lastReader ?? imported.lastReader,
      lastChapterId: existing.lastChapterId ?? imported.lastChapterId,
    };
  }
  if (sessions.length > 10)
    throw new Error("Import would exceed ten local characters. Nothing has been changed.");
  const merged = levelingWorkspaceSchema.parse({
    version: 1,
    activeId: current.activeId ?? incoming.activeId,
    sessions,
  });
  serializeLevelingWorkspace(merged);
  return merged;
}
