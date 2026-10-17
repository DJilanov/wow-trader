import { mkdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import {
  BlizzardApiError,
  blizzardQuestEvidenceSchema,
  requireBlizzardQuestApi,
  requestBlizzardAccessToken,
  requestBlizzardQuest,
  type BlizzardApiConfig,
  type BlizzardQuestEvidence,
} from "./blizzard-api.js";
import { referenceTaskSchema, type ReferenceTask } from "./contracts.js";
import { buildQuestXpImport, type QuestXpImportResult } from "./quest-xp-import.js";
import { atomicJsonWrite } from "./store.js";

const DEFAULT_DELAY_MS = 150;
const MAX_DELAY_MS = 60_000;
const MAX_CACHED_EVIDENCE_BYTES = 2_500_000;

export interface BlizzardQuestCollectionOptions {
  readonly tasks: readonly ReferenceTask[];
  readonly config: BlizzardApiConfig;
  readonly evidenceDirectory: string;
  readonly delayMs?: number;
  readonly refresh?: boolean;
  readonly stagedDirectory?: string;
  readonly fetcher?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (evidence: BlizzardQuestEvidence, cached: boolean) => void;
}

export interface BlizzardQuestCollectionResult {
  readonly importResult: QuestXpImportResult;
  readonly fallbackTasks: readonly ReferenceTask[];
  readonly counts: {
    readonly total: number;
    readonly available: number;
    readonly missing: number;
    readonly missingXp: number;
    readonly cached: number;
    readonly fetched: number;
  };
}

function validateDelay(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DELAY_MS)
    throw new Error(`Blizzard request delay must be an integer between 0 and ${MAX_DELAY_MS}`);
  return value;
}

function evidencePath(directory: string, questId: number): string {
  return resolve(directory, `blizzard-quest-${questId}.json`);
}

async function readCachedEvidence(
  directory: string,
  task: ReferenceTask,
  config: BlizzardApiConfig,
): Promise<BlizzardQuestEvidence | null> {
  const path = evidencePath(directory, task.id);
  try {
    if ((await stat(path)).size > MAX_CACHED_EVIDENCE_BYTES)
      throw new Error(`Cached Blizzard evidence is too large: ${task.id}`);
    const evidence = blizzardQuestEvidenceSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (
      evidence.questId !== task.id ||
      evidence.region !== config.region ||
      evidence.namespace !== config.namespace ||
      evidence.locale !== config.locale
    )
      throw new Error(`Cached Blizzard evidence context mismatch: ${task.id}`);
    return evidence;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function retryable(error: unknown): error is BlizzardApiError {
  return (
    error instanceof BlizzardApiError &&
    (error.status === 429 || (error.status >= 500 && error.status <= 599))
  );
}

async function requestWithRetry(
  questId: number,
  accessToken: string,
  options: BlizzardQuestCollectionOptions,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<BlizzardQuestEvidence> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestBlizzardQuest({
        questId,
        accessToken,
        region: options.config.region,
        namespace: options.config.namespace,
        locale: options.config.locale,
        ...(options.fetcher ? { fetcher: options.fetcher } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.now ? { now: options.now } : {}),
      });
    } catch (error) {
      if (!retryable(error) || attempt >= 2) throw error;
      const delay = error.retryAfterMs ?? 500 * 2 ** attempt;
      if (delay > MAX_DELAY_MS) throw new Error(`Blizzard API requested a retry after ${delay} ms`);
      await sleep(delay);
    }
  }
}

async function requireQuestApiWithRetry(
  accessToken: string,
  options: BlizzardQuestCollectionOptions,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await requireBlizzardQuestApi({
        accessToken,
        region: options.config.region,
        namespace: options.config.namespace,
        locale: options.config.locale,
        ...(options.fetcher ? { fetcher: options.fetcher } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.now ? { now: options.now } : {}),
      });
      return;
    } catch (error) {
      if (!retryable(error) || attempt >= 2) throw error;
      const delay = error.retryAfterMs ?? 500 * 2 ** attempt;
      if (delay > MAX_DELAY_MS) throw new Error(`Blizzard API requested a retry after ${delay} ms`);
      await sleep(delay);
    }
  }
}

export async function collectBlizzardQuestXp(
  options: BlizzardQuestCollectionOptions,
): Promise<BlizzardQuestCollectionResult> {
  const tasks = options.tasks.map((task) => referenceTaskSchema.parse(task));
  if (!tasks.length) throw new Error("Blizzard collection queue is empty");
  if (tasks.length > 10_000) throw new Error("Blizzard collection queue exceeds 10,000 quests");
  if (tasks.some((task) => task.game !== "forever" || task.kind !== "quest"))
    throw new Error("Blizzard quest XP collection accepts Forever quests only");
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length)
    throw new Error("Blizzard collection queue contains duplicate quest ids");
  const delayMs = validateDelay(options.delayMs ?? DEFAULT_DELAY_MS);
  await mkdir(options.evidenceDirectory, { recursive: true });
  const sleep =
    options.sleep ??
    (async (milliseconds: number): Promise<void> => {
      await pause(milliseconds, undefined, { signal: options.signal });
    });
  let accessToken: string | null = null;
  let questApiAvailable = false;
  let cached = 0;
  let fetched = 0;
  const evidence: BlizzardQuestEvidence[] = [];
  for (const task of tasks) {
    options.signal?.throwIfAborted();
    let record = options.refresh
      ? null
      : await readCachedEvidence(options.evidenceDirectory, task, options.config);
    const wasCached = record !== null;
    if (!record) {
      if (fetched > 0 && delayMs > 0) await sleep(delayMs);
      accessToken ??= await requestBlizzardAccessToken(options.config, {
        ...(options.fetcher ? { fetcher: options.fetcher } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.now ? { now: options.now } : {}),
      });
      if (!questApiAvailable) {
        await requireQuestApiWithRetry(accessToken, options, sleep);
        questApiAvailable = true;
      }
      record = await requestWithRetry(task.id, accessToken, options, sleep);
      await atomicJsonWrite(evidencePath(options.evidenceDirectory, task.id), record);
      fetched++;
    } else cached++;
    evidence.push(record);
    options.onProgress?.(record, wasCached);
  }
  const available = evidence.filter((record) => record.outcome === "available").length;
  if (tasks.length > 1 && available === 0)
    throw new Error(
      "Blizzard returned no usable quest XP; verify the edition namespace before creating a fallback queue",
    );
  const rows = evidence
    .filter((record) => record.outcome !== "missing")
    .map((record) => ({
      id: record.questId,
      level: record.questLevel,
      min_level: record.minimumLevel,
      reward_xp_id: null,
      xp: record.fullXp,
    }));
  if (!rows.length) throw new Error("Blizzard returned no quest records that can be imported");
  const sourceRef = `https://${options.config.region}.api.blizzard.com/data/wow/quest/{id}?namespace=${options.config.namespace}&locale=${options.config.locale}`;
  const importResult = await buildQuestXpImport({
    input: JSON.stringify(rows),
    format: "json",
    game: "forever",
    sourceKind: "blizzard-api",
    sourceRef,
    revision: options.config.namespace,
    importedAt: new Date((options.now ?? Date.now)()).toISOString(),
    knownIds: new Set(tasks.map((task) => task.id)),
    ...(options.stagedDirectory ? { stagedDirectory: options.stagedDirectory } : {}),
  });
  return {
    importResult,
    fallbackTasks: tasks.filter(
      (task) => evidence.find((record) => record.questId === task.id)?.outcome !== "available",
    ),
    counts: {
      total: tasks.length,
      available,
      missing: evidence.filter((record) => record.outcome === "missing").length,
      missingXp: evidence.filter((record) => record.outcome === "missing_xp").length,
      cached,
      fetched,
    },
  };
}
