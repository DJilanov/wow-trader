import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { atomicJsonWrite } from "./store.js";

const ROBOTS_CACHE_FILE = ".robots-policy.json";
const MAX_ROBOTS_BYTES = 500_000;

export const ROBOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const robotsCacheSchema = z
  .object({
    schema: z.literal("wowhead-robots-policy.v1"),
    sourceUrl: z.literal("https://www.wowhead.com/robots.txt"),
    fetchedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
    text: z.string().max(MAX_ROBOTS_BYTES),
  })
  .strict()
  .refine((value) => value.expiresAt === value.fetchedAt + ROBOTS_CACHE_TTL_MS, {
    message: "Invalid robots policy expiry",
  });

interface RobotsCache {
  readonly schema: "wowhead-robots-policy.v1";
  readonly sourceUrl: "https://www.wowhead.com/robots.txt";
  readonly fetchedAt: number;
  readonly expiresAt: number;
  readonly text: string;
}

export interface RobotsPolicyText {
  readonly text: string;
  readonly source: "cache" | "network";
}

export async function loadRobotsPolicyText(
  directory: string,
  now: number,
  fetchText: () => Promise<string>,
): Promise<RobotsPolicyText> {
  const path = resolve(directory, ROBOTS_CACHE_FILE);
  const cached = await readRobotsCache(path);
  if (cached && now < cached.expiresAt) return { text: cached.text, source: "cache" };

  const text = await fetchText();
  const value: RobotsCache = robotsCacheSchema.parse({
    schema: "wowhead-robots-policy.v1",
    sourceUrl: "https://www.wowhead.com/robots.txt",
    fetchedAt: now,
    expiresAt: now + ROBOTS_CACHE_TTL_MS,
    text,
  });
  await atomicJsonWrite(path, value);
  return { text: value.text, source: "network" };
}

async function readRobotsCache(path: string): Promise<RobotsCache | null> {
  try {
    if ((await stat(path)).size > MAX_ROBOTS_BYTES + 1_000)
      throw new Error("Robots policy cache exceeds size budget");
    return robotsCacheSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
