import { createHash } from "node:crypto";

import type { WorldBundle } from "@wow-trader/contracts";
import {
  gameBuilds,
  worldBossLocations,
  worldBosses,
  worldBossSpellCandidates,
  worldContentTunings,
  worldCreatureModels,
  worldCreatureObjectives,
  worldAreaVersions,
  worldEncounterVersions,
  worldItemSourceHints,
  worldLfgDungeonVersions,
  worldLootSourceCandidates,
  worldMapArtLayers,
  worldMapArts,
  worldMapArtTiles,
  worldMapDifficulties,
  worldMapVersions,
  worldPoiVersions,
  worldQuestLineMembers,
  worldQuestLineVersions,
  worldQuestPois,
  worldQuestVersions,
  worldSnapshots,
  worldUiMapArtLinks,
  worldUiMapAssignments,
  worldUiMapVersions,
  type WowTraderDatabase,
} from "@wow-trader/db";
import { and, eq, isNull } from "drizzle-orm";

const INSERT_CHUNK_SIZE = 1_000;

export interface ImportWorldOptions {
  readonly publish: boolean;
}

export interface ImportWorldResult {
  readonly buildId: string;
  readonly snapshotKey: string;
  readonly duplicate: boolean;
  readonly published: boolean;
}

export async function importWorldSnapshot(
  database: WowTraderDatabase,
  bundle: WorldBundle,
  options: ImportWorldOptions,
): Promise<ImportWorldResult> {
  const snapshotKey = createWorldSnapshotKey(bundle);
  if (options.publish && bundle.manifest.hotfix.status === "missing") {
    throw new Error("A world snapshot with a missing hotfix cache cannot be published");
  }

  return database.transaction(async (transaction) => {
    const [build] = await transaction
      .select({ id: gameBuilds.id, status: gameBuilds.status })
      .from(gameBuilds)
      .where(
        and(
          eq(gameBuilds.product, bundle.manifest.product),
          eq(gameBuilds.buildNumber, bundle.manifest.buildNumber),
          eq(gameBuilds.buildKey, bundle.manifest.buildKey.toLowerCase()),
          eq(gameBuilds.cdnKey, bundle.manifest.cdnKey.toLowerCase()),
          eq(gameBuilds.locale, bundle.manifest.locale),
          eq(gameBuilds.hotfixStatus, bundle.manifest.hotfix.status),
          bundle.manifest.hotfix.sha256
            ? eq(gameBuilds.hotfixHash, bundle.manifest.hotfix.sha256.toLowerCase())
            : isNull(gameBuilds.hotfixHash),
          eq(gameBuilds.definitionsRevision, bundle.manifest.definitions.revision),
        ),
      )
      .limit(1);
    if (!build) {
      throw new Error(
        "The matching catalog build must be imported before its world snapshot can be imported",
      );
    }
    if (options.publish && build.status !== "published") {
      throw new Error(`The matching catalog build is ${build.status}, not published`);
    }

    const [existing] = await transaction
      .select({ snapshotKey: worldSnapshots.snapshotKey, status: worldSnapshots.status })
      .from(worldSnapshots)
      .where(eq(worldSnapshots.buildId, build.id))
      .limit(1);
    if (existing) {
      if (existing.snapshotKey !== snapshotKey) {
        throw new Error("This game build already has a different world snapshot");
      }
      if (options.publish && existing.status === "review_required") {
        await transaction
          .update(worldSnapshots)
          .set({ status: "published", publishedAt: new Date() })
          .where(eq(worldSnapshots.buildId, build.id));
      } else if (options.publish && existing.status !== "published") {
        throw new Error(`World snapshot cannot be published from status ${existing.status}`);
      }
      return {
        buildId: build.id,
        snapshotKey,
        duplicate: true,
        published: options.publish || existing.status === "published",
      };
    }

    await transaction.insert(worldSnapshots).values({
      buildId: build.id,
      snapshotKey,
      status: "review_required",
      extractedAt: new Date(bundle.manifest.extractedAt),
      manifest: bundle.manifest,
    });

    await insertChunks(
      bundle.maps.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldMapVersions).values(chunk),
    );
    await insertChunks(
      bundle.areas.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldAreaVersions).values(chunk),
    );
    await insertChunks(
      bundle.uiMaps.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldUiMapVersions).values(chunk),
    );
    await insertChunks(
      bundle.uiMapAssignments.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldUiMapAssignments).values(chunk),
    );
    await insertChunks(
      bundle.mapArts.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldMapArts).values(chunk),
    );
    await insertChunks(
      bundle.uiMapArtLinks.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldUiMapArtLinks).values(chunk),
    );
    await insertChunks(
      bundle.mapArtLayers.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldMapArtLayers).values(chunk),
    );
    await insertChunks(
      bundle.mapArtTiles.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldMapArtTiles).values(chunk),
    );
    await insertChunks(
      bundle.pois.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldPoiVersions).values(chunk),
    );
    await insertChunks(
      bundle.encounters.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldEncounterVersions).values(chunk),
    );
    await insertChunks(
      bundle.lfgDungeons.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldLfgDungeonVersions).values(chunk),
    );
    await insertChunks(
      bundle.quests.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldQuestVersions).values(chunk),
    );
    await insertChunks(
      bundle.questLines.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldQuestLineVersions).values(chunk),
    );
    await insertChunks(
      bundle.questLineMembers.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldQuestLineMembers).values(chunk),
    );
    await insertChunks(
      bundle.questPois.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldQuestPois).values(chunk),
    );
    await insertChunks(
      bundle.itemSourceHints.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldItemSourceHints).values(chunk),
    );
    await insertChunks(
      bundle.creatureObjectives.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldCreatureObjectives).values(chunk),
    );
    await insertChunks(
      bundle.bosses.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldBosses).values(chunk),
    );
    await insertChunks(
      bundle.bossLocations.map((row, locationIndex) => ({
        buildId: build.id,
        locationIndex,
        ...row,
      })),
      async (chunk) => transaction.insert(worldBossLocations).values(chunk),
    );
    await insertChunks(
      bundle.creatureModels.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldCreatureModels).values(chunk),
    );
    await insertChunks(
      bundle.bossSpellCandidates.map((row, candidateIndex) => ({
        buildId: build.id,
        candidateIndex,
        ...row,
      })),
      async (chunk) => transaction.insert(worldBossSpellCandidates).values(chunk),
    );
    await insertChunks(
      bundle.lootSourceCandidates.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldLootSourceCandidates).values(chunk),
    );
    await insertChunks(
      bundle.mapDifficulties.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldMapDifficulties).values(chunk),
    );
    await insertChunks(
      bundle.contentTunings.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => transaction.insert(worldContentTunings).values(chunk),
    );

    if (options.publish) {
      await transaction
        .update(worldSnapshots)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(worldSnapshots.buildId, build.id));
    }
    return {
      buildId: build.id,
      snapshotKey,
      duplicate: false,
      published: options.publish,
    };
  });
}

export function createWorldSnapshotKey(bundle: Pick<WorldBundle, "manifest">): string {
  const normalizedChecksums = Object.entries(bundle.manifest.normalizedArtifacts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, artifact]) => `${name}:${artifact.sha256}`)
    .join("|");
  return createHash("sha256")
    .update(
      [
        bundle.manifest.product,
        bundle.manifest.buildNumber,
        bundle.manifest.locale,
        bundle.manifest.buildKey.toLowerCase(),
        bundle.manifest.cdnKey.toLowerCase(),
        bundle.manifest.definitions.revision,
        normalizedChecksums,
        bundle.manifest.mapMediaManifest.sha256,
      ].join(":"),
    )
    .digest("hex");
}

async function insertChunks<T>(
  rows: readonly T[],
  insert: (rows: T[]) => Promise<unknown>,
): Promise<void> {
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
    if (chunk.length > 0) await insert(chunk);
  }
}
