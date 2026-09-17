#!/usr/bin/env node

import { isAbsolute, resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { createDatabase } from "@wow-trader/db";

import { importWorldSnapshot } from "./import.js";
import { loadWorldSnapshot } from "./snapshot.js";

loadRootEnvironment();

async function main(args: readonly string[]): Promise<void> {
  const [command, manifestPath, ...flags] = args;
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
