#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_RECORD_BYTES = 400_000;
const SPELL_ACQUISITION_RELATIONS = new Set([
  "taught-by-npc",
  "taught-by-item",
  "sold-by",
  "dropped-by",
  "reward-from",
  "contained-in-item",
  "contained-in-object",
]);
const ITEM_ACQUISITION_RELATIONS = new Set([
  "sold-by",
  "dropped-by",
  "reward-from",
  "contained-in-item",
  "contained-in-object",
]);

/**
 * Invert staged NPC `teaches` / `sells` lists into spell and item evidence.
 * This is a read-only report: it does not rewrite captured spell/item records.
 */
export async function buildRecipeNpcEvidence(options) {
  const staging = resolve(options.staging);
  const output = resolve(options.output);

  const spellRecords = new Map();
  const itemRecords = new Map();
  for (const name of await readdir(staging)) {
    const match = name.match(/^forever-(spell|item)-(\d+)\.json$/);
    if (!match) continue;
    const value = await readBoundedJson(resolve(staging, name), MAX_RECORD_BYTES, name);
    if (!value || typeof value !== "object" || !Array.isArray(value.relations)) continue;
    if (value.kind === "spell") spellRecords.set(Number(match[2]), value);
    else if (value.kind === "item") itemRecords.set(Number(match[2]), value);
  }

  const trainers = [];
  const vendors = [];
  let teachLinkCount = 0;
  let sellLinkCount = 0;
  for (const name of await readdir(staging)) {
    const match = name.match(/^forever-npc-(\d+)\.json$/);
    if (!match) continue;
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const value = await readBoundedJson(resolve(staging, name), MAX_RECORD_BYTES, name);
    if (!value || typeof value !== "object" || !Array.isArray(value.relations)) continue;
    const teaches = [
      ...new Set(
        value.relations
          .filter(
            (relation) =>
              relation?.relation === "teaches" &&
              relation.kind === "spell" &&
              Number.isSafeInteger(relation.id) &&
              relation.id > 0,
          )
          .map((relation) => relation.id),
      ),
    ].sort((left, right) => left - right);
    const sells = [
      ...new Set(
        value.relations
          .filter(
            (relation) =>
              relation?.relation === "sells" &&
              relation.kind === "item" &&
              Number.isSafeInteger(relation.id) &&
              relation.id > 0,
          )
          .map((relation) => relation.id),
      ),
    ].sort((left, right) => left - right);
    if (teaches.length) {
      teachLinkCount += teaches.length;
      trainers.push({ npcId: id, name: value.name, spellIds: teaches });
    }
    if (sells.length) {
      sellLinkCount += sells.length;
      vendors.push({ npcId: id, name: value.name, itemIds: sells });
    }
  }

  const unresolvedSpellIds = [...spellRecords.entries()]
    .filter(
      ([, record]) =>
        !record.relations.some((relation) => SPELL_ACQUISITION_RELATIONS.has(relation.relation)),
    )
    .map(([id]) => id);
  const noSourceItemIds = [...itemRecords.entries()]
    .filter(
      ([, record]) =>
        !record.relations.some((relation) => ITEM_ACQUISITION_RELATIONS.has(relation.relation)),
    )
    .map(([id]) => id);
  const taughtSpellIds = new Set(trainers.flatMap((trainer) => trainer.spellIds));
  const soldItemIds = new Set(vendors.flatMap((vendor) => vendor.itemIds));

  const result = {
    schema: "recipe-npc-evidence.v1",
    generatedAt: new Date().toISOString(),
    source: { staging },
    summary: {
      trainerNpcCount: trainers.length,
      vendorNpcCount: vendors.length,
      bothNpcCount: trainers.filter((trainer) =>
        vendors.some((vendor) => vendor.npcId === trainer.npcId),
      ).length,
      teachLinkCount,
      sellLinkCount,
      uniqueTaughtSpellCount: taughtSpellIds.size,
      uniqueSoldItemCount: soldItemIds.size,
      unresolvedSpellCount: unresolvedSpellIds.length,
      noSourceItemCount: noSourceItemIds.length,
      unresolvedSpellsTaughtByNpc: unresolvedSpellIds.filter((id) => taughtSpellIds.has(id)).length,
      noSourceItemsSoldByNpc: noSourceItemIds.filter((id) => soldItemIds.has(id)).length,
    },
    trainers,
    vendors,
    unresolvedSpellIds,
    noSourceItemIds,
    evidenceSha256: sha256(JSON.stringify({ trainers, vendors })),
  };

  await atomicJsonWrite(output, result);
  return { output, ...result.summary };
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
  const output = values.get("output");
  if (!staging || !output) {
    throw new Error(
      "Usage: recipe-npc-evidence.mjs --staging <directory> --output <evidence report>",
    );
  }
  return { staging, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildRecipeNpcEvidence(parseArguments(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
