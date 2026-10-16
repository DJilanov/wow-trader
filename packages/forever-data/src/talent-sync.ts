import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WowTraderDatabase } from "@wow-trader/db";
import { z } from "zod";
import { FOREVER_CLASSES } from "./updates.js";
import { syncForeverAssets, verifyForeverAssets } from "./assets.js";
import {
  fetchForeverCapture,
  getPublishedForeverSnapshot,
  importForeverCapture,
  type ForeverCapture,
} from "./server.js";

const statusSchema = z
  .object({
    schema: z.literal("forever-talent-sync.v1"),
    checkedAt: z.iso.datetime(),
    nextCheckAt: z.iso.datetime(),
    checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    publishedAt: z.iso.datetime().nullable(),
    generated: z.string().nullable(),
    build: z.string().nullable(),
    error: z.string().nullable(),
  })
  .strict();
export type TalentSyncStatus = z.infer<typeof statusSchema>;
export interface TalentSyncOptions {
  readonly database: WowTraderDatabase;
  readonly directory: string;
  readonly assetsDirectory: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
  readonly capture?: () => Promise<ForeverCapture>;
}

export function validateAutomaticTalentCapture(
  capture: ForeverCapture,
  previous: { readonly generated: string; readonly build: string | null } | null,
  now: Date,
): string {
  if (
    !capture.validation.valid ||
    capture.validation.issues.length ||
    capture.validation.counts.classes !== 9 ||
    capture.validation.counts.trees !== 27 ||
    capture.validation.counts.talents < 350 ||
    capture.validation.counts.completeTalents !== capture.validation.counts.talents ||
    FOREVER_CLASSES.some(
      (name) => capture.data.talents[name]?.trees.length !== 3 || !capture.data.spellbooks[name],
    )
  )
    throw new Error("Talent update requires review: source validation or coverage changed");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(capture.data.generated) ||
    capture.data.generated > now.toISOString().slice(0, 10)
  )
    throw new Error("Invalid talent generation date");
  if (previous && capture.data.generated < previous.generated)
    throw new Error("Talent source generation date moved backwards");
  const builds = [
    ...new Set(
      Object.values(capture.data.spellbooks)
        .map((book) => book.build)
        .filter((build): build is string => Boolean(build)),
    ),
  ];
  const build = builds.length === 1 ? builds[0] : null;
  if (
    !build ||
    !/^1\.60\.\d+\.\d+$/.test(build) ||
    Object.values(capture.data.spellbooks).some(
      (book) => book.source !== "beta" || book.build !== build,
    )
  )
    throw new Error("Talent source does not have one Forever beta build");
  if (previous?.build && Number(build.split(".").at(-1)) < Number(previous.build.split(".").at(-1)))
    throw new Error("Talent source client build moved backwards");
  return build;
}

export async function readTalentSyncStatus(directory: string): Promise<TalentSyncStatus | null> {
  try {
    return statusSchema.parse(
      JSON.parse(await readFile(join(directory, "talent-health.json"), "utf8")),
    );
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function syncTalentSnapshot(options: TalentSyncOptions): Promise<TalentSyncStatus> {
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const lockPath = join(options.directory, ".talent-sync.lock"),
    lock = await open(lockPath, "wx", 0o600);
  const now = options.now ?? (() => new Date());
  let before: TalentSyncStatus | null = null;
  let staging: string | null = null;
  try {
    const time = now();
    before = await readTalentSyncStatus(options.directory);
    if (before && Date.parse(before.nextCheckAt) > time.valueOf()) return before;
    const previous = await getPublishedForeverSnapshot(options.database);
    const capture = await (options.capture?.() ?? fetchForeverCapture(options.fetcher));
    const priorBuild = previous
      ? [
          ...new Set(
            Object.values(previous.data.spellbooks).flatMap((book) =>
              book.build ? [book.build] : [],
            ),
          ),
        ]
      : [];
    const build = validateAutomaticTalentCapture(
      capture,
      previous
        ? { generated: previous.generated, build: priorBuild.length === 1 ? priorBuild[0]! : null }
        : null,
      time,
    );
    if (previous?.checksum !== capture.checksum) {
      await mkdir(options.assetsDirectory, { recursive: true });
      const target = join(options.assetsDirectory, capture.checksum);
      const manifestPath = join(target, "manifest.json");
      let exists = false;
      try {
        await readFile(manifestPath);
        exists = true;
      } catch (error: unknown) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      if (
        exists &&
        !(await verifyForeverAssets(capture.data, capture.supplemental, target, capture.checksum))
      )
        throw new Error("Existing immutable talent assets failed integrity checks");
      if (!exists) {
        staging = join(options.assetsDirectory, `.staging-${randomUUID()}`);
        const assets = await syncForeverAssets(
          capture.data,
          capture.supplemental,
          staging,
          capture.checksum,
          options.fetcher,
        );
        if (assets.missing.length)
          throw new Error("Talent update assets incomplete; old publication retained");
        await rename(staging, target);
        staging = null;
      }
      await importForeverCapture(options.database, capture, { publish: true });
    }
    const value = statusSchema.parse({
      schema: "forever-talent-sync.v1",
      checkedAt: time.toISOString(),
      nextCheckAt: nextCheck(time).toISOString(),
      checksum: capture.checksum,
      publishedAt:
        previous?.checksum === capture.checksum
          ? previous.publishedAt.toISOString()
          : time.toISOString(),
      generated: capture.data.generated,
      build,
      error: null,
    });
    await atomicStatus(options.directory, value);
    return value;
  } catch (error: unknown) {
    const time = now();
    await atomicStatus(
      options.directory,
      statusSchema.parse({
        schema: "forever-talent-sync.v1",
        checkedAt: time.toISOString(),
        nextCheckAt: nextCheck(time).toISOString(),
        checksum: before?.checksum ?? null,
        publishedAt: before?.publishedAt ?? null,
        generated: before?.generated ?? null,
        build: before?.build ?? null,
        error: "talent_validation_or_publication_failed",
      }),
    );
    throw error;
  } finally {
    if (staging) await rm(staging, { recursive: true });
    await lock.close();
    await unlink(lockPath);
  }
}

async function atomicStatus(directory: string, value: TalentSyncStatus): Promise<void> {
  const temporary = join(directory, `.talent-health-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    await rename(temporary, join(directory, "talent-health.json"));
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    });
  }
}

function nextCheck(time: Date): Date {
  const result = new Date(time);
  result.setUTCHours(6, 0, 0, 0);
  if (result.valueOf() <= time.valueOf()) result.setUTCDate(result.getUTCDate() + 1);
  return result;
}
