#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_REPORT_BYTES = 32_000_000;
const MAX_LISTINGS = 100;
const SPELL_FILTER = "?filter=20%3B1%3B0";

export async function buildRecipeListingCrawlQueue(options) {
  const sourceReportPath = resolve(options.sourceReport);
  const sourceReport = JSON.parse(await readBoundedText(sourceReportPath, MAX_REPORT_BYTES));
  const entries = Array.isArray(sourceReport.unresolvedRecipes)
    ? sourceReport.unresolvedRecipes
    : Array.isArray(sourceReport.entries)
      ? sourceReport.entries
      : [];
  const professions = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.professionName !== "string") continue;
    const name = entry.professionName.trim();
    if (!name) continue;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) continue;
    professions.set(slug, name);
  }
  if (professions.size === 0)
    throw new Error("Source report does not contain any profession names");
  const sorted = [...professions.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slug, name]) => ({ slug, name }));
  const tasks = [];
  for (const profession of sorted) {
    tasks.push({
      game: "forever",
      kind: "spell-list",
      path: `/forever/spells/professions/${profession.slug}${SPELL_FILTER}`,
    });
    tasks.push({
      game: "forever",
      kind: "item-list",
      path: `/forever/items/recipes/${profession.slug}`,
    });
  }
  if (tasks.length > MAX_LISTINGS) throw new Error(`Listing queue exceeds ${MAX_LISTINGS} tasks`);
  return {
    tasks,
    report: {
      schema: "recipe-listing-crawl-plan.v1",
      generatedAt: new Date().toISOString(),
      source: {
        acquisitionReport: sourceReportPath,
        reportSha256: createHash("sha256").update(JSON.stringify(sourceReport)).digest("hex"),
      },
      professions: sorted,
      summary: {
        professionCount: sorted.length,
        spellListingCount: sorted.length,
        itemListingCount: sorted.length,
        totalTaskCount: tasks.length,
      },
    },
  };
}

export async function writeRecipeListingCrawlQueue(options) {
  const result = await buildRecipeListingCrawlQueue(options);
  const queuePath = resolve(options.queue);
  const reportPath = resolve(options.report ?? `${queuePath}.report.json`);
  await Promise.all([
    atomicJsonWrite(queuePath, result.tasks),
    atomicJsonWrite(reportPath, result.report),
  ]);
  return {
    queue: queuePath,
    report: reportPath,
    ...result.report.summary,
  };
}

async function readBoundedText(path, maximumBytes) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > maximumBytes)
    throw new Error("Source report exceeds its file budget");
  const source = await readFile(path, "utf8");
  if (Buffer.byteLength(source) > maximumBytes)
    throw new Error("Source report exceeds its byte budget");
  return source;
}

async function atomicJsonWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch((cleanupError) => {
      if (cleanupError?.code !== "ENOENT") throw cleanupError;
    });
    throw error;
  }
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const separator = argument.indexOf("=");
    const name = argument.slice(2, separator === -1 ? undefined : separator);
    const value = separator === -1 ? argv[++index] : argument.slice(separator + 1);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    values.set(name, value);
  }
  const sourceReport = values.get("source-report");
  const queue = values.get("queue");
  if (!sourceReport || !queue) {
    throw new Error(
      "Usage: recipe-listing-crawl-queue.mjs --source-report <report> --queue <listing queue> [--report <plan report>]",
    );
  }
  return {
    sourceReport,
    queue,
    report: values.get("report") ?? `${queue}.report.json`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeRecipeListingCrawlQueue(parseArguments(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
