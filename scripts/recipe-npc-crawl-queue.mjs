#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_RECORD_BYTES = 400_000;
const MAX_TASKS = 100_000;

/**
 * Build the targeted NPC queue from already-staged profession evidence.
 *
 * Trainer relations use `taught-by-npc` on spell records. Vendor relations use
 * `sold-by` on item records. Both are inverted into NPC detail tasks so one
 * request per NPC can expose the complete `teaches` / `sells` list.
 */
export async function buildRecipeNpcCrawlQueue(options) {
  const staging = resolve(options.staging);
  const queue = resolve(options.queue);
  const report = resolve(options.report);

  const trainers = new Map();
  const vendors = new Map();
  const catalogCandidates = new Set();
  if (options.candidates) {
    const rows = await readBoundedJson(resolve(options.candidates), 32_000_000, "NPC candidates");
    if (!Array.isArray(rows) || rows.length > MAX_TASKS)
      throw new Error("NPC candidates must be a bounded task array");
    for (const row of rows) {
      if (
        !row ||
        row.game !== "forever" ||
        row.kind !== "npc" ||
        !Number.isSafeInteger(row.id) ||
        row.id <= 0 ||
        row.id > 2_147_483_647 ||
        Object.keys(row).some((key) => !["game", "kind", "id"].includes(key))
      )
        throw new Error("Invalid Forever NPC candidate task");
      catalogCandidates.add(row.id);
    }
  }
  let trainerSpellLinkCount = 0;
  let vendorItemLinkCount = 0;
  let spellCount = 0;
  let itemCount = 0;

  for (const name of await readdir(staging)) {
    if (!/^forever-(spell|item)-\d+\.json$/.test(name)) continue;
    const value = await readBoundedJson(resolve(staging, name), MAX_RECORD_BYTES, name);
    if (!value || typeof value !== "object" || !Array.isArray(value.relations)) continue;
    if (value.kind === "spell") {
      spellCount++;
      for (const relation of value.relations) {
        if (
          relation?.relation !== "taught-by-npc" ||
          relation.kind !== "npc" ||
          !Number.isSafeInteger(relation.id) ||
          relation.id <= 0 ||
          typeof relation.name !== "string"
        )
          continue;
        trainerSpellLinkCount++;
        const current = trainers.get(relation.id) ?? {
          id: relation.id,
          name: relation.name,
          links: 0,
        };
        current.links++;
        trainers.set(relation.id, current);
      }
    } else if (value.kind === "item") {
      itemCount++;
      for (const relation of value.relations) {
        if (
          relation?.relation !== "sold-by" ||
          relation.kind !== "npc" ||
          !Number.isSafeInteger(relation.id) ||
          relation.id <= 0 ||
          typeof relation.name !== "string"
        )
          continue;
        vendorItemLinkCount++;
        const current = vendors.get(relation.id) ?? {
          id: relation.id,
          name: relation.name,
          links: 0,
        };
        current.links++;
        vendors.set(relation.id, current);
      }
    }
  }

  const npcIds = new Set([...trainers.keys(), ...vendors.keys(), ...catalogCandidates]);
  const uniqueIds = [...npcIds].sort((left, right) => left - right);
  if (uniqueIds.length > MAX_TASKS) throw new Error("Recipe NPC queue exceeds the task budget");

  const staged = new Set();
  let stagedWithTeaches = 0;
  let stagedWithSells = 0;
  let stagedWithNeither = 0;
  for (const name of await readdir(staging)) {
    const match = name.match(/^forever-npc-(\d+)\.json$/);
    if (!match) continue;
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    if (!npcIds.has(id)) continue;
    const value = await readBoundedJson(resolve(staging, name), MAX_RECORD_BYTES, name);
    if (!value || typeof value !== "object" || !Array.isArray(value.relations)) continue;
    staged.add(id);
    const hasTeaches = value.relations.some((relation) => relation?.relation === "teaches");
    const hasSells = value.relations.some((relation) => relation?.relation === "sells");
    if (hasTeaches) stagedWithTeaches++;
    if (hasSells) stagedWithSells++;
    if (!hasTeaches && !hasSells) stagedWithNeither++;
  }

  const tasks = uniqueIds.map((id) => ({ game: "forever", kind: "npc", id }));
  const bothNpcCount = uniqueIds.filter((id) => trainers.has(id) && vendors.has(id)).length;
  const result = {
    schema: "recipe-npc-crawl-plan.v1",
    generatedAt: new Date().toISOString(),
    source: {
      staging,
      spellCount,
      itemCount,
      ...(options.candidates ? { candidates: resolve(options.candidates) } : {}),
    },
    summary: {
      trainerNpcCount: trainers.size,
      vendorNpcCount: vendors.size,
      bothNpcCount,
      uniqueNpcCount: uniqueIds.length,
      trainerSpellLinkCount,
      vendorItemLinkCount,
      stagedNpcCount: staged.size,
      pendingNpcCount: uniqueIds.length - staged.size,
      stagedWithTeaches,
      stagedWithSells,
      stagedWithNeither,
      queueTaskCount: tasks.length,
      ...(options.candidates ? { catalogCandidateCount: catalogCandidates.size } : {}),
    },
    trainers: [...trainers.values()].sort((left, right) => left.id - right.id),
    vendors: [...vendors.values()].sort((left, right) => left.id - right.id),
    queueSha256: sha256(JSON.stringify(tasks)),
  };

  await Promise.all([atomicJsonWrite(queue, tasks), atomicJsonWrite(report, result)]);
  return {
    queue,
    report,
    ...result.summary,
  };
}

async function readBoundedJson(path, maximumBytes, label) {
  const source = await readFile(path, "utf8");
  if (Buffer.byteLength(source) > maximumBytes) throw new Error(`${label} exceeds its byte budget`);
  return JSON.parse(source);
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  const staging = values.get("staging");
  const queue = values.get("queue");
  if (!staging || !queue) {
    throw new Error(
      "Usage: recipe-npc-crawl-queue.mjs --staging <directory> --queue <npc queue> [--report <plan report>] [--candidates <catalog NPC queue>]",
    );
  }
  return {
    staging,
    queue,
    report: values.get("report") ?? `${queue}.report.json`,
    candidates: values.get("candidates") ?? process.env.NPC_CANDIDATE_QUEUE,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildRecipeNpcCrawlQueue(parseArguments(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
