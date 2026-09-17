import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const stateV1Schema = z.object({
  schemaVersion: z.literal(1),
  uploadedScanIds: z.array(z.string().uuid()),
});

const activitySchema = z.object({
  scanId: z.string().uuid(),
  productId: z.string().min(1).max(64),
  status: z.enum(["processed", "failed"]),
  occurredAt: z.string().datetime(),
  characterLabel: z.string().min(1).max(256).nullable(),
  message: z.string().min(1).max(1_024),
  realmId: z.string().min(1).max(128).nullable().optional(),
  marketCount: z.number().int().nonnegative().optional(),
  receipt: z.enum(["processed", "duplicate", "failed"]).optional(),
});

const stateV2Schema = z.object({
  schemaVersion: z.literal(2),
  uploadedScanIds: z.array(z.string().uuid()),
  activities: z.array(activitySchema).max(100),
});

export type CompanionActivity = z.infer<typeof activitySchema>;

export interface CompanionState {
  readonly schemaVersion: 2;
  readonly uploadedScanIds: readonly string[];
  readonly activities: readonly CompanionActivity[];
}

export async function readCompanionState(filePath: string): Promise<CompanionState> {
  try {
    const value: unknown = JSON.parse(await readFile(filePath, "utf8"));
    const v2 = stateV2Schema.safeParse(value);
    if (v2.success) return v2.data;
    const v1 = stateV1Schema.parse(value);
    return { schemaVersion: 2, uploadedScanIds: v1.uploadedScanIds, activities: [] };
  } catch (error: unknown) {
    if (isMissingFileError(error)) return emptyCompanionState();
    throw error;
  }
}

export async function writeCompanionState(filePath: string, state: CompanionState): Promise<void> {
  const validated = stateV2Schema.parse(state);
  const resolvedPath = path.resolve(filePath);
  const directory = path.dirname(resolvedPath);
  const temporaryPath = `${resolvedPath}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, resolvedPath);
}

export function emptyCompanionState(): CompanionState {
  return { schemaVersion: 2, uploadedScanIds: [], activities: [] };
}

export function appendCompanionActivity(
  state: CompanionState,
  activity: CompanionActivity,
): CompanionState {
  return { ...state, activities: [activity, ...state.activities].slice(0, 100) };
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
