import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

import { addSeoRumMetric, type SeoRumAggregate, type SeoRumMetric } from "./seo-rum";

const MAX_DAILY_GROUPS = 5_000;
let pendingWrite: Promise<void> = Promise.resolve();

export function storeSeoRumMetric(input: SeoRumMetric, now: Date = new Date()): Promise<void> {
  const root = process.env.SEO_RUM_ROOT;
  if (!root || process.env.SEO_RUM_ENABLED !== "true") {
    return Promise.reject(new Error("SEO RUM storage is disabled"));
  }
  const storageRoot = resolve(root);
  const operation = pendingWrite
    .catch(() => undefined)
    .then(() => updateAggregate(storageRoot, input, now));
  pendingWrite = operation;
  return operation;
}

async function updateAggregate(root: string, input: SeoRumMetric, now: Date): Promise<void> {
  const date = now.toISOString().slice(0, 10);
  const file = join(root, `${date}.json`);
  const existing = await readAggregate(file);
  const updated = addSeoRumMetric(existing, input, now);
  if (Object.keys(updated.groups).length > MAX_DAILY_GROUPS) {
    throw new Error("SEO RUM daily group limit exceeded");
  }
  await mkdir(root, { recursive: true });
  const temporary = join(root, `.${date}.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

async function readAggregate(file: string): Promise<SeoRumAggregate | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isAggregate(parsed)) throw new Error("SEO RUM aggregate has an invalid schema");
    return parsed;
  } catch (error: unknown) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function isAggregate(value: unknown): value is SeoRumAggregate {
  return (
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    value.schema === "seo-rum-aggregate.v1" &&
    "date" in value &&
    typeof value.date === "string" &&
    "groups" in value &&
    typeof value.groups === "object" &&
    value.groups !== null
  );
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "ENOENT"
  );
}
