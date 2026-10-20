#!/usr/bin/env node

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { loadCatalogSnapshot } from "@wow-trader/catalog";
import { createDatabase, worldTrainerObservations } from "@wow-trader/db";
import { and, eq } from "drizzle-orm";

import { buildCommunityCoverage } from "./community-coverage.js";
import { importQuestieForeverBundle } from "./community-import.js";
import { importWorldSnapshot } from "./import.js";
import { loadQuestieForeverExport } from "./questie-forever.js";
import { loadQuestieForeverBaked } from "./questie-baked.js";
import { loadWorldSnapshot } from "./snapshot.js";

loadRootEnvironment();

async function main(args: readonly string[]): Promise<void> {
  const normalizedArgs =
    args[0] === "--" ? args.slice(1) : args[1] === "--" ? [args[0]!, ...args.slice(2)] : args;
  const [command, manifestPath, ...flags] = normalizedArgs;
  if (!command || !manifestPath) {
    throw new Error(usage());
  }
  if (command === "community-audit" || command === "community-import") {
    await runCommunityCommand(command, manifestPath, flags);
    return;
  }
  if (command === "community-coverage") {
    await runCommunityCoverageCommand(manifestPath, flags);
    return;
  }
  if (command === "questie-baked-export") {
    await runQuestieBakedExport(manifestPath, flags);
    return;
  }
  if (!["audit", "import"].includes(command)) {
    throw new Error(usage());
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

async function runCommunityCoverageCommand(
  catalogManifestPath: string,
  flags: readonly string[],
): Promise<void> {
  const parsedFlags = parseFlags(
    flags,
    new Set(["include-authored", "include-observations"]),
    new Set([
      "community",
      "source-version",
      "source-revision",
      "license-ref",
      "queue",
      "report",
      "game",
    ]),
  );
  const catalog = await loadCatalogSnapshot(resolveInputPath(catalogManifestPath));
  const community = await loadQuestieForeverExport(
    resolveInputPath(requiredFlag(parsedFlags, "community")),
    {
      sourceVersion: requiredFlag(parsedFlags, "source-version"),
      sourceRevision: requiredFlag(parsedFlags, "source-revision"),
      licenseRef: requiredFlag(parsedFlags, "license-ref"),
      includedAuthored: parsedFlags.has("include-authored"),
    },
  );
  const game = optionalFlag(parsedFlags, "game") ?? "forever";
  if (!/^[a-z0-9-]+$/.test(game)) throw new Error("--game must be a lowercase URL slug");
  const observedTrainerSpellIds = parsedFlags.has("include-observations")
    ? await loadObservedTrainerSpellIds(catalog)
    : new Set<number>();
  const result = buildCommunityCoverage(catalog, community, {
    game,
    observedTrainerSpellIds,
  });
  const queuePath = resolveInputPath(requiredFlag(parsedFlags, "queue"));
  const reportPath = resolveInputPath(requiredFlag(parsedFlags, "report"));
  await Promise.all([
    atomicJsonWrite(queuePath, result.tasks),
    atomicJsonWrite(reportPath, result.report),
  ]);
  process.stdout.write(
    `${JSON.stringify(
      {
        queuePath,
        reportPath,
        queueSha256: result.report.queueSha256,
        summary: result.report.summary,
      },
      null,
      2,
    )}\n`,
  );
}

async function loadObservedTrainerSpellIds(
  catalog: Awaited<ReturnType<typeof loadCatalogSnapshot>>,
): Promise<ReadonlySet<number>> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required with --include-observations");
  const database = createDatabase(databaseUrl);
  try {
    const observations = await database.db
      .select({
        spellId: worldTrainerObservations.spellId,
        serviceName: worldTrainerObservations.serviceName,
      })
      .from(worldTrainerObservations)
      .where(
        and(
          eq(worldTrainerObservations.clientProduct, catalog.manifest.product),
          eq(worldTrainerObservations.clientBuild, catalog.manifest.buildNumber),
          eq(worldTrainerObservations.locale, catalog.manifest.locale),
        ),
      );
    const recipeIds = new Set(catalog.recipes.map((recipe) => recipe.recipeSpellId));
    const recipeIdsByName = new Map<string, number[]>();
    for (const spell of catalog.spells) {
      if (!recipeIds.has(spell.spellId)) continue;
      const key = normalizeName(spell.name);
      const ids = recipeIdsByName.get(key) ?? [];
      ids.push(spell.spellId);
      recipeIdsByName.set(key, ids);
    }
    const result = new Set<number>();
    for (const observation of observations) {
      if (observation.spellId !== null && recipeIds.has(observation.spellId)) {
        result.add(observation.spellId);
        continue;
      }
      const matchingIds = recipeIdsByName.get(normalizeName(observation.serviceName)) ?? [];
      if (matchingIds.length === 1) result.add(matchingIds[0]!);
    }
    return result;
  } finally {
    await database.close();
  }
}

async function runCommunityCommand(
  command: "community-audit" | "community-import",
  directory: string,
  flags: readonly string[],
): Promise<void> {
  const parsedFlags = parseFlags(
    flags,
    new Set(
      command === "community-import" ? ["publish", "include-authored"] : ["include-authored"],
    ),
    new Set(
      command === "community-import"
        ? [
            "source-version",
            "source-revision",
            "license-ref",
            "license-name",
            "product",
            "build",
            "locale",
          ]
        : ["source-version", "source-revision", "license-ref"],
    ),
  );
  const bundle = await loadQuestieForeverExport(
    isAbsolute(directory) ? directory : resolve(process.cwd(), directory),
    {
      sourceVersion: requiredFlag(parsedFlags, "source-version"),
      sourceRevision: requiredFlag(parsedFlags, "source-revision"),
      licenseRef: requiredFlag(parsedFlags, "license-ref"),
      includedAuthored: parsedFlags.has("include-authored"),
    },
  );
  if (command === "community-audit") {
    process.stdout.write(
      `${JSON.stringify(
        {
          sourceKind: bundle.sourceKind,
          sourceVersion: bundle.sourceVersion,
          sourceRevision: bundle.sourceRevision,
          includedAuthored: bundle.includedAuthored,
          checksum: bundle.checksum,
          artifacts: bundle.artifacts,
          entityCount: bundle.entities.length,
          relationCount: bundle.relations.length,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const buildNumber = Number(requiredFlag(parsedFlags, "build"));
  if (!Number.isSafeInteger(buildNumber) || buildNumber <= 0) {
    throw new Error("--build must be a positive integer");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for import");
  const database = createDatabase(databaseUrl);
  try {
    const licenseName = optionalFlag(parsedFlags, "license-name");
    const result = await importQuestieForeverBundle(database.db, bundle, {
      product: requiredFlag(parsedFlags, "product"),
      buildNumber,
      locale: requiredFlag(parsedFlags, "locale"),
      publish: parsedFlags.has("publish"),
      ...(licenseName ? { licenseName } : {}),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await database.close();
  }
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

function optionalFlag(flags: ReadonlyMap<string, string | true>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function resolveInputPath(path: string): string {
  return isAbsolute(path) ? path : resolve(import.meta.dirname, "../../../", path);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function atomicJsonWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function usage(): string {
  return [
    "Usage:",
    "  world-data <audit|import> /path/to/manifest.json [--publish]",
    "  world-data community-audit /path/to/combined --source-version VERSION --source-revision REVISION --license-ref URL [--include-authored]",
    "  world-data community-import /path/to/combined --product PRODUCT --build NUMBER --locale LOCALE --source-version VERSION --source-revision REVISION --license-ref URL [--license-name NAME] [--include-authored] [--publish]",
    "  world-data community-coverage /path/to/catalog/manifest.json --community /path/to/combined --source-version VERSION --source-revision REVISION --license-ref URL --queue /path/to/queue.json --report /path/to/report.json [--game forever] [--include-authored] [--include-observations]",
    "  world-data questie-baked-export /path/to/QuestieDB_Forever.toc --quest-ids /path/to/queue-or-report.json --output /path/to/bundle.json --source-version VERSION --source-revision REVISION --license-ref REFERENCE [--without-givers]",
  ].join("\n");
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
