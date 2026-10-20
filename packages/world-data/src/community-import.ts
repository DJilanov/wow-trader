import {
  communityReferenceEntities,
  communityReferenceRelations,
  communityReferenceSnapshots,
  externalDataSources,
  gameBuilds,
  type WowTraderDatabase,
} from "@wow-trader/db";
import { and, desc, eq } from "drizzle-orm";

import type { QuestieForeverBundle } from "./questie-forever.js";

const INSERT_CHUNK_SIZE = 1_000;
const QUESTIE_SOURCE_SLUG = "questiedb-forever";
const REVIEW_REQUIRED_LICENSE = "Review required";

export interface ImportCommunityReferenceOptions {
  readonly product: string;
  readonly buildNumber: number;
  readonly locale: string;
  readonly publish: boolean;
  readonly licenseName?: string;
}

export interface ImportCommunityReferenceResult {
  readonly snapshotId: string;
  readonly buildId: string;
  readonly checksum: string;
  readonly entityCount: number;
  readonly relationCount: number;
  readonly duplicate: boolean;
  readonly published: boolean;
}

export async function importQuestieForeverBundle(
  database: WowTraderDatabase,
  bundle: QuestieForeverBundle,
  options: ImportCommunityReferenceOptions,
): Promise<ImportCommunityReferenceResult> {
  if (!options.product.trim()) throw new Error("Community import requires a client product");
  if (!Number.isSafeInteger(options.buildNumber) || options.buildNumber <= 0) {
    throw new Error("Community import requires a positive client build number");
  }
  if (!/^[a-z]{2}[A-Z]{2}$/.test(options.locale)) {
    throw new Error("Community import locale must use the enUS format");
  }
  const licenseName = options.licenseName?.trim() || REVIEW_REQUIRED_LICENSE;
  if (options.publish && licenseName === REVIEW_REQUIRED_LICENSE) {
    throw new Error("Published community imports require an explicit reviewed license name");
  }

  return database.transaction(async (transaction) => {
    const builds = await transaction
      .select({ id: gameBuilds.id, status: gameBuilds.status })
      .from(gameBuilds)
      .where(
        and(
          eq(gameBuilds.product, options.product),
          eq(gameBuilds.buildNumber, options.buildNumber),
          eq(gameBuilds.locale, options.locale),
        ),
      )
      .orderBy(desc(gameBuilds.publishedAt), desc(gameBuilds.extractedAt))
      .limit(2);
    if (builds.length === 0) {
      throw new Error("The exact catalog build must be imported before community references");
    }
    if (builds.length > 1) {
      throw new Error(
        "More than one catalog snapshot matches this product, build, and locale; use an unambiguous build",
      );
    }
    const build = builds[0]!;
    if (options.publish && build.status !== "published") {
      throw new Error(
        `Community references cannot be published while the catalog is ${build.status}`,
      );
    }

    const now = new Date();
    const [source] = await transaction
      .insert(externalDataSources)
      .values({
        slug: QUESTIE_SOURCE_SLUG,
        name: "QuestieDB Forever",
        homepageUrl: "https://github.com/Questie/QuestieDB",
        dataUrl: "https://github.com/Questie/QuestieDB",
        license: licenseName,
        licenseUrl: bundle.licenseRef,
        attribution: "QuestieDB contributors",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: externalDataSources.slug,
        set: {
          license: licenseName,
          licenseUrl: bundle.licenseRef,
          updatedAt: now,
        },
      })
      .returning({ id: externalDataSources.id });
    if (!source) throw new Error("QuestieDB source registration did not return an id");

    const [existing] = await transaction
      .select({
        id: communityReferenceSnapshots.id,
        checksum: communityReferenceSnapshots.checksum,
        status: communityReferenceSnapshots.status,
      })
      .from(communityReferenceSnapshots)
      .where(
        and(
          eq(communityReferenceSnapshots.buildId, build.id),
          eq(communityReferenceSnapshots.sourceId, source.id),
          eq(communityReferenceSnapshots.sourceRevision, bundle.sourceRevision),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.checksum !== bundle.checksum) {
        throw new Error("The same QuestieDB revision produced a different export checksum");
      }
      if (options.publish && existing.status === "review_required") {
        await transaction
          .update(communityReferenceSnapshots)
          .set({ status: "published", publishedAt: now })
          .where(eq(communityReferenceSnapshots.id, existing.id));
      } else if (options.publish && existing.status !== "published") {
        throw new Error(`Community snapshot cannot be published from status ${existing.status}`);
      }
      return result(
        existing.id,
        build.id,
        bundle,
        true,
        options.publish || existing.status === "published",
      );
    }

    const [snapshot] = await transaction
      .insert(communityReferenceSnapshots)
      .values({
        buildId: build.id,
        sourceId: source.id,
        sourceVersion: bundle.sourceVersion,
        sourceRevision: bundle.sourceRevision,
        locale: options.locale,
        licenseRef: bundle.licenseRef,
        checksum: bundle.checksum,
        includedAuthored: bundle.includedAuthored,
        status: options.publish ? "published" : "review_required",
        manifest: {
          formatVersion: bundle.formatVersion,
          sourceKind: bundle.sourceKind,
          sourceVersion: bundle.sourceVersion,
          sourceRevision: bundle.sourceRevision,
          includedAuthored: bundle.includedAuthored,
          artifacts: bundle.artifacts,
          entityCount: bundle.entities.length,
          relationCount: bundle.relations.length,
        },
        publishedAt: options.publish ? now : null,
      })
      .returning({ id: communityReferenceSnapshots.id });
    if (!snapshot) throw new Error("Community snapshot insert did not return an id");

    await insertChunks(
      bundle.entities.map((entity) => ({
        snapshotId: snapshot.id,
        entityKind: entity.kind,
        entityId: entity.id,
        name: entity.name,
        data: entity.data,
      })),
      async (chunk) => transaction.insert(communityReferenceEntities).values(chunk),
    );
    await insertChunks(
      bundle.relations.map((relation) => ({
        snapshotId: snapshot.id,
        sourceKind: relation.sourceKind,
        sourceId: relation.sourceId,
        relationKind: relation.relationKind,
        targetKind: relation.targetKind,
        targetId: relation.targetId,
        evidence: relation.evidence,
      })),
      async (chunk) => transaction.insert(communityReferenceRelations).values(chunk),
    );
    return result(snapshot.id, build.id, bundle, false, options.publish);
  });
}

function result(
  snapshotId: string,
  buildId: string,
  bundle: QuestieForeverBundle,
  duplicate: boolean,
  published: boolean,
): ImportCommunityReferenceResult {
  return {
    snapshotId,
    buildId,
    checksum: bundle.checksum,
    entityCount: bundle.entities.length,
    relationCount: bundle.relations.length,
    duplicate,
    published,
  };
}

async function insertChunks<T>(
  rows: readonly T[],
  insert: (rows: T[]) => Promise<unknown>,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
    await insert(rows.slice(offset, offset + INSERT_CHUNK_SIZE));
  }
}
