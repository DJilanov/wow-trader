#!/usr/bin/env node

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { createDatabase } from "@wow-trader/db";

import { importWorldSnapshot } from "./import.js";
import { loadQuestieForeverBaked } from "./questie-baked.js";
import { loadWorldSnapshot } from "./snapshot.js";

loadRootEnvironment();

async function main(args: readonly string[]): Promise<void> {
  const normalizedArgs =
    args[0] === "--" ? args.slice(1) : args[1] === "--" ? [args[0]!, ...args.slice(2)] : args;
  const [command, manifestPath, ...flags] = normalizedArgs;
  if (command === "questie-baked-export" && manifestPath) {
    await runQuestieBakedExport(manifestPath, flags);
    return;
  }
  if (!command || !manifestPath || !["audit", "import"].includes(command)) {
    throw new Error("Usage: world-data <audit|import> /path/to/manifest.json [--publish]");
  }
  const resolvedManifestPath = isAbsolute(manifestPath)
    ? manifestPath
    : resolve(import.meta.dirname, "../../../", manifestPath);
  const bundle = await loadWorldSnapshot(resolvedManifestPath);
  if (command === "audit") {
    process.stdout.write(
      `${JSON.stringify(
        {
          product: bundle.manifest.product,
          clientVersion: bundle.manifest.clientVersion,
          buildNumber: bundle.manifest.buildNumber,
          hotfixStatus: bundle.manifest.hotfix.status,
          counts: {
            maps: bundle.maps.length,
            uiMaps: bundle.uiMaps.length,
            mapTiles: bundle.mapArtTiles.length,
            decodedMapTiles: bundle.mapMedia.tiles.length,
            unavailableMapTiles: bundle.mapMedia.unavailableTiles.length,
            areas: bundle.areas.length,
            pois: bundle.pois.length,
            encounters: bundle.encounters.length,
            creatureObjectives: bundle.creatureObjectives.length,
            bosses: bundle.bosses.length,
            bossLocations: bundle.bossLocations.length,
            creatureModels: bundle.creatureModels.length,
            bossSpellCandidates: bundle.bossSpellCandidates.length,
            lootSourceCandidates: bundle.lootSourceCandidates.length,
            mapDifficulties: bundle.mapDifficulties.length,
            contentTunings: bundle.contentTunings.length,
            quests: bundle.quests.length,
            questObjectives: bundle.questObjectives.length,
            questPois: bundle.questPois.length,
            itemSourceHints: bundle.itemSourceHints.length,
          },
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for import");
  const database = createDatabase(databaseUrl);
  try {
    const result = await importWorldSnapshot(database.db, bundle, {
      publish: flags.includes("--publish"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await database.close();
  }
}

async function runQuestieBakedExport(tocPath: string, flags: readonly string[]): Promise<void> {
  const parsedFlags = parseFlags(
    flags,
    new Set(["without-givers"]),
    new Set(["quest-ids", "output", "source-version", "source-revision", "license-ref"]),
  );
  const idsPath = resolveInputPath(requiredFlag(parsedFlags, "quest-ids"));
  if ((await stat(idsPath)).size > 32_000_000)
    throw new Error("Quest id input exceeds size budget");
  const input = JSON.parse(await readFile(idsPath, "utf8")) as unknown;
  const rows = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.quests)
      ? input.quests
      : null;
  if (!rows) throw new Error("Quest id input must be a queue or an evidence report with quests");
  const questIds = rows.map((row) => {
    if (!isRecord(row) || !Number.isSafeInteger(row.id) || (row.id as number) <= 0)
      throw new Error("Quest id input contains an invalid row");
    return row.id as number;
  });
  const bundle = await loadQuestieForeverBaked(
    resolveInputPath(tocPath),
    { questIds, includeQuestGivers: !parsedFlags.has("without-givers") },
    {
      sourceVersion: requiredFlag(parsedFlags, "source-version"),
      sourceRevision: requiredFlag(parsedFlags, "source-revision"),
      licenseRef: requiredFlag(parsedFlags, "license-ref"),
    },
  );
  const outputPath = resolveInputPath(requiredFlag(parsedFlags, "output"));
  await atomicJsonWrite(outputPath, bundle);
  const exportedIds = new Set(
    bundle.entities.filter((entity) => entity.kind === "quest").map((entity) => entity.id),
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath,
        checksum: bundle.checksum,
        requestedQuests: new Set(questIds).size,
        exportedQuests: exportedIds.size,
        missingQuestIds: [...new Set(questIds)].filter((id) => !exportedIds.has(id)),
        relatedEntities: bundle.entities.length - exportedIds.size,
        relations: bundle.relations.length,
      },
      null,
      2,
    )}\n`,
  );
}

function parseFlags(
  flags: readonly string[],
  booleanFlags: ReadonlySet<string>,
  valueFlags: ReadonlySet<string>,
): ReadonlyMap<string, string | true> {
  const result = new Map<string, string | true>();
  for (let index = 0; index < flags.length; index += 1) {
    const token = flags[index]!;
    if (!token.startsWith("--") || token.length === 2) throw new Error(`Invalid flag: ${token}`);
    const name = token.slice(2);
    if (result.has(name)) throw new Error(`Duplicate flag: --${name}`);
    if (booleanFlags.has(name)) {
      result.set(name, true);
      continue;
    }
    if (!valueFlags.has(name)) throw new Error(`Unknown flag: --${name}`);
    const value = flags[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    result.set(name, value);
    index += 1;
  }
  return result;
}

function requiredFlag(flags: ReadonlyMap<string, string | true>, name: string): string {
  const value = flags.get(name);
  if (typeof value !== "string" || !value.trim()) throw new Error(`--${name} is required`);
  return value;
}

function resolveInputPath(path: string): string {
  return isAbsolute(path) ? path : resolve(import.meta.dirname, "../../../", path);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function atomicJsonWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function loadRootEnvironment(): void {
  try {
    loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`world-data: ${message}\n`);
  process.exitCode = 1;
});
