import {
  communityReferenceEntities,
  communityReferenceRelations,
  communityReferenceSnapshots,
  gameBuilds,
  worldNpcObservations,
} from "@wow-trader/db";
import {
  assessEvidenceNameAgreement,
  decodeQuestieSpawnLocations,
  type EvidenceNameAgreement,
} from "@wow-trader/world-data";
import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "./database";
import { normalizeEntityGraphRelation, type EntityGraphRelationKind } from "./entity-graph";
import { getForeverMapPage, getForeverWorldData } from "./forever-world";
import { FOREVER_CLIENT_PRODUCT } from "./game-versions";
import { helperAbsoluteUrl } from "./seo";
import {
  assessSearchSurface,
  isIndexableSearchSurface,
  type SearchSurfaceEntry,
} from "./search-surface";

export type CommunityEntityKind = "npc" | "object";

export interface CommunityReferenceRelationship {
  readonly direction: "incoming" | "outgoing";
  readonly relationKind: string;
  readonly normalizedKind: EntityGraphRelationKind;
  readonly label: string;
  readonly href: string | null;
  readonly relatedKind: string;
  readonly relatedId: number;
  readonly relatedName: string | null;
}

export interface CommunityReferenceLocationMap {
  readonly uiMapId: number;
  readonly name: string;
  readonly buildNumber: number;
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tiles: readonly {
    readonly tileId: number;
    readonly rowIndex: number;
    readonly columnIndex: number;
    readonly fileDataId: number;
  }[];
}

export interface CommunityReferenceLocationGroup {
  readonly areaId: number;
  readonly areaName: string | null;
  readonly locations: readonly { readonly xPercent: number; readonly yPercent: number }[];
  readonly map: CommunityReferenceLocationMap | null;
}

export interface CommunityReferenceEntityDetail {
  readonly kind: CommunityEntityKind;
  readonly id: number;
  readonly name: string;
  readonly subName: string | null;
  readonly minimumLevel: number | null;
  readonly maximumLevel: number | null;
  readonly rank: number | null;
  readonly zoneId: number | null;
  readonly snapshot: {
    readonly sourceVersion: string;
    readonly sourceRevision: string;
    readonly publishedAt: Date;
    readonly buildNumber: number;
    readonly clientVersion: string;
  };
  readonly locations: readonly CommunityReferenceLocationGroup[];
  readonly rejectedLocationCount: number;
  readonly relationships: readonly CommunityReferenceRelationship[];
  readonly relationshipCount: number;
  readonly observations: readonly {
    readonly observationId: string;
    readonly capturedAt: Date;
    readonly creatureName: string | null;
    readonly level: number | null;
    readonly classification: string | null;
    readonly mapId: number | null;
    readonly uiMapId: number | null;
    readonly positionEvidence: string;
  }[];
  readonly identityAgreement: EvidenceNameAgreement;
}

export interface CommunityReferenceSitemapData {
  readonly publishedAt: Date;
  readonly npcIds: readonly number[];
  readonly objectIds: readonly number[];
  readonly searchSurface: readonly SearchSurfaceEntry[];
  readonly entities: readonly CommunityReferenceDirectoryEntry[];
}

export interface CommunityReferenceDirectoryEntry {
  readonly kind: CommunityEntityKind;
  readonly id: number;
  readonly name: string;
  readonly searchSurface: SearchSurfaceEntry;
}

export interface CommunityReferenceDirectoryPage {
  readonly kind: CommunityEntityKind;
  readonly publishedAt: Date;
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  readonly entries: readonly CommunityReferenceDirectoryEntry[];
}

export function getIndexableCommunityDirectoryKinds(
  data: Pick<CommunityReferenceSitemapData, "npcIds" | "objectIds"> | null,
): readonly CommunityEntityKind[] {
  if (!data) return [];
  return [
    ...(data.npcIds.length ? (["npc"] as const) : []),
    ...(data.objectIds.length ? (["object"] as const) : []),
  ];
}

interface PublishedSnapshot {
  readonly id: string;
  readonly sourceVersion: string;
  readonly sourceRevision: string;
  readonly checksum: string;
  readonly publishedAt: Date | null;
  readonly buildNumber: number;
  readonly clientVersion: string;
}

const MAX_RELATIONSHIPS = 500;

export const getCommunityReferenceEntity = cache(
  async (kind: CommunityEntityKind, id: number): Promise<CommunityReferenceEntityDetail | null> => {
    const database = getDatabase();
    const snapshot = await getPublishedSnapshot(database);
    if (!snapshot?.publishedAt) return null;
    const [entity] = await database
      .select({
        name: communityReferenceEntities.name,
        data: communityReferenceEntities.data,
      })
      .from(communityReferenceEntities)
      .where(
        and(
          eq(communityReferenceEntities.snapshotId, snapshot.id),
          eq(communityReferenceEntities.entityKind, kind),
          eq(communityReferenceEntities.entityId, id),
        ),
      )
      .limit(1);
    if (!entity?.name) return null;

    const relationCondition = and(
      eq(communityReferenceRelations.snapshotId, snapshot.id),
      or(
        and(
          eq(communityReferenceRelations.sourceKind, kind),
          eq(communityReferenceRelations.sourceId, id),
        ),
        and(
          eq(communityReferenceRelations.targetKind, kind),
          eq(communityReferenceRelations.targetId, id),
        ),
      ),
    );
    const [relationRows, relationCounts, observations] = await Promise.all([
      database
        .select({
          sourceKind: communityReferenceRelations.sourceKind,
          sourceId: communityReferenceRelations.sourceId,
          relationKind: communityReferenceRelations.relationKind,
          targetKind: communityReferenceRelations.targetKind,
          targetId: communityReferenceRelations.targetId,
        })
        .from(communityReferenceRelations)
        .where(relationCondition)
        .orderBy(
          communityReferenceRelations.relationKind,
          communityReferenceRelations.sourceId,
          communityReferenceRelations.targetId,
        )
        .limit(MAX_RELATIONSHIPS),
      database
        .select({ value: count() })
        .from(communityReferenceRelations)
        .where(relationCondition),
      kind === "npc"
        ? database
            .select({
              observationId: worldNpcObservations.observationId,
              capturedAt: worldNpcObservations.capturedAt,
              creatureName: worldNpcObservations.creatureName,
              level: worldNpcObservations.level,
              classification: worldNpcObservations.classification,
              mapId: worldNpcObservations.mapId,
              uiMapId: worldNpcObservations.uiMapId,
              positionEvidence: worldNpcObservations.positionEvidence,
            })
            .from(worldNpcObservations)
            .where(
              and(
                eq(worldNpcObservations.clientProduct, FOREVER_CLIENT_PRODUCT),
                eq(worldNpcObservations.clientBuild, snapshot.buildNumber),
                eq(worldNpcObservations.creatureId, id),
              ),
            )
            .orderBy(desc(worldNpcObservations.capturedAt))
            .limit(100)
        : Promise.resolve([]),
    ]);
    const relatedNames = await loadRelatedNames(database, snapshot.id, kind, id, relationRows);
    const decodedLocations = decodeQuestieSpawnLocations(readRecordValue(entity.data, "spawns"));
    const world = await getForeverWorldData().catch(() => null);
    const locations = await buildLocationGroups(decodedLocations, world);
    const relationships = relationRows.map((relation): CommunityReferenceRelationship => {
      const outgoing = relation.sourceKind === kind && relation.sourceId === id;
      const relatedKind = outgoing ? relation.targetKind : relation.sourceKind;
      const relatedId = outgoing ? relation.targetId : relation.sourceId;
      const normalized = normalizeEntityGraphRelation({
        direction: outgoing ? "outgoing" : "incoming",
        relationKind: relation.relationKind,
        relatedKind,
        relatedId,
      });
      return {
        ...normalized,
        relatedName: relatedNames.get(entityKey(relatedKind, relatedId)) ?? null,
      };
    });
    return {
      kind,
      id,
      name: entity.name,
      subName: readString(entity.data, "subName"),
      minimumLevel: readInteger(entity.data, "minLevel"),
      maximumLevel: readInteger(entity.data, "maxLevel"),
      rank: readInteger(entity.data, "rank"),
      zoneId: readInteger(entity.data, "zoneID"),
      snapshot: {
        sourceVersion: snapshot.sourceVersion,
        sourceRevision: snapshot.sourceRevision,
        publishedAt: snapshot.publishedAt,
        buildNumber: snapshot.buildNumber,
        clientVersion: snapshot.clientVersion,
      },
      locations,
      rejectedLocationCount: decodedLocations.rejectedCount,
      relationships,
      relationshipCount: relationCounts[0]?.value ?? 0,
      observations,
      identityAgreement: assessEvidenceNameAgreement(
        entity.name,
        observations.map((observation) => observation.creatureName),
      ),
    };
  },
);

export async function getCommunityReferenceSitemapData(): Promise<CommunityReferenceSitemapData | null> {
  const database = getDatabase();
  const snapshot = await getPublishedSnapshot(database);
  if (!snapshot?.publishedAt) return null;
  const publishedAt = snapshot.publishedAt;
  const rows = await database
    .select({
      kind: communityReferenceEntities.entityKind,
      id: communityReferenceEntities.entityId,
      name: communityReferenceEntities.name,
      data: communityReferenceEntities.data,
    })
    .from(communityReferenceEntities)
    .where(
      and(
        eq(communityReferenceEntities.snapshotId, snapshot.id),
        inArray(communityReferenceEntities.entityKind, ["npc", "object"]),
      ),
    )
    .orderBy(communityReferenceEntities.entityKind, communityReferenceEntities.entityId);
  const [relations, observations] = await Promise.all([
    database
      .select({
        sourceKind: communityReferenceRelations.sourceKind,
        sourceId: communityReferenceRelations.sourceId,
        relationKind: communityReferenceRelations.relationKind,
        targetKind: communityReferenceRelations.targetKind,
        targetId: communityReferenceRelations.targetId,
      })
      .from(communityReferenceRelations)
      .where(eq(communityReferenceRelations.snapshotId, snapshot.id)),
    database
      .select({
        creatureId: worldNpcObservations.creatureId,
        creatureName: worldNpcObservations.creatureName,
      })
      .from(worldNpcObservations)
      .where(
        and(
          eq(worldNpcObservations.clientProduct, FOREVER_CLIENT_PRODUCT),
          eq(worldNpcObservations.clientBuild, snapshot.buildNumber),
        ),
      ),
  ]);
  const relationsByEntity = new Map<string, typeof relations>();
  for (const relation of relations) {
    const keys = new Set([
      entityKey(relation.sourceKind, relation.sourceId),
      entityKey(relation.targetKind, relation.targetId),
    ]);
    for (const key of keys) {
      const values = relationsByEntity.get(key) ?? [];
      values.push(relation);
      relationsByEntity.set(key, values);
    }
  }
  const observedNamesByNpc = new Map<number, Array<string | null>>();
  for (const observation of observations) {
    const names = observedNamesByNpc.get(observation.creatureId) ?? [];
    names.push(observation.creatureName);
    observedNamesByNpc.set(observation.creatureId, names);
  }
  const assessedRows = rows.map((row) => {
    const entityRelations = relationsByEntity.get(entityKey(row.kind, row.id)) ?? [];
    const observedNames = row.kind === "npc" ? (observedNamesByNpc.get(row.id) ?? []) : [];
    const identityAgreement = assessEvidenceNameAgreement(row.name, observedNames);
    const outgoingLinks = entityRelations.flatMap((relation) => {
      const isSource = relation.sourceKind === row.kind && relation.sourceId === row.id;
      const normalized = normalizeEntityGraphRelation({
        direction: isSource ? "outgoing" : "incoming",
        relationKind: relation.relationKind,
        relatedKind: isSource ? relation.targetKind : relation.sourceKind,
        relatedId: isSource ? relation.targetId : relation.sourceId,
      });
      return normalized.href ? [helperAbsoluteUrl(normalized.href)] : [];
    });
    return {
      kind: row.kind,
      id: row.id,
      name: row.name,
      entry: buildCommunitySearchSurface({
        kind: row.kind as CommunityEntityKind,
        id: row.id,
        name: row.name,
        publishedAt,
        checksum: snapshot.checksum,
        identityAgreement,
        hasUsefulEvidence:
          entityRelations.length > 0 ||
          observedNames.length > 0 ||
          hasUsefulCommunityData(row.data),
        outgoingLinks,
      }),
    };
  });
  return {
    publishedAt,
    npcIds: assessedRows
      .filter((row) => row.kind === "npc" && isIndexableSearchSurface(row.entry))
      .map((row) => row.id),
    objectIds: assessedRows
      .filter((row) => row.kind === "object" && isIndexableSearchSurface(row.entry))
      .map((row) => row.id),
    searchSurface: assessedRows.map((row) => row.entry),
    entities: assessedRows.flatMap((row) =>
      row.name && isIndexableSearchSurface(row.entry)
        ? [
            {
              kind: row.kind as CommunityEntityKind,
              id: row.id,
              name: row.name,
              searchSurface: row.entry,
            },
          ]
        : [],
    ),
  };
}

export async function getCommunityReferenceDirectoryPage(
  kind: CommunityEntityKind,
  page: number,
  pageSize = 200,
): Promise<CommunityReferenceDirectoryPage | null> {
  if (!Number.isSafeInteger(page) || page <= 0 || !Number.isSafeInteger(pageSize) || pageSize <= 0)
    return null;
  const data = await getCommunityReferenceSitemapData();
  if (!data) return null;
  const entries = data.entities
    .filter((entity) => entity.kind === kind)
    .sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id);
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  if (page > pageCount) return null;
  const offset = (page - 1) * pageSize;
  return {
    kind,
    publishedAt: data.publishedAt,
    page,
    pageCount,
    total: entries.length,
    entries: entries.slice(offset, offset + pageSize),
  };
}

export function getCommunityEntitySearchSurface(
  entity: CommunityReferenceEntityDetail,
): SearchSurfaceEntry {
  return buildCommunitySearchSurface({
    kind: entity.kind,
    id: entity.id,
    name: entity.name,
    publishedAt: entity.snapshot.publishedAt,
    checksum: null,
    identityAgreement: entity.identityAgreement,
    hasUsefulEvidence: Boolean(
      entity.locations.length ||
      entity.relationshipCount ||
      entity.observations.length ||
      entity.subName ||
      entity.minimumLevel !== null ||
      entity.maximumLevel !== null ||
      entity.rank !== null ||
      entity.zoneId !== null,
    ),
    outgoingLinks: entity.relationships.flatMap((relationship) =>
      relationship.href ? [helperAbsoluteUrl(relationship.href)] : [],
    ),
  });
}

async function getPublishedSnapshot(
  database: ReturnType<typeof getDatabase>,
): Promise<PublishedSnapshot | null> {
  const [snapshot] = await database
    .select({
      id: communityReferenceSnapshots.id,
      sourceVersion: communityReferenceSnapshots.sourceVersion,
      sourceRevision: communityReferenceSnapshots.sourceRevision,
      checksum: communityReferenceSnapshots.checksum,
      publishedAt: communityReferenceSnapshots.publishedAt,
      buildNumber: gameBuilds.buildNumber,
      clientVersion: gameBuilds.clientVersion,
    })
    .from(communityReferenceSnapshots)
    .innerJoin(gameBuilds, eq(gameBuilds.id, communityReferenceSnapshots.buildId))
    .where(
      and(
        eq(gameBuilds.product, FOREVER_CLIENT_PRODUCT),
        eq(gameBuilds.status, "published"),
        eq(communityReferenceSnapshots.status, "published"),
      ),
    )
    .orderBy(desc(communityReferenceSnapshots.publishedAt))
    .limit(1);
  return snapshot ?? null;
}

async function loadRelatedNames(
  database: ReturnType<typeof getDatabase>,
  snapshotId: string,
  kind: CommunityEntityKind,
  id: number,
  relations: readonly {
    readonly sourceKind: string;
    readonly sourceId: number;
    readonly targetKind: string;
    readonly targetId: number;
  }[],
): Promise<ReadonlyMap<string, string | null>> {
  const related = relations.map((relation) =>
    relation.sourceKind === kind && relation.sourceId === id
      ? { kind: relation.targetKind, id: relation.targetId }
      : { kind: relation.sourceKind, id: relation.sourceId },
  );
  const conditions = [...new Set(related.map((entry) => entry.kind))].flatMap((relatedKind) => {
    const ids = related.filter((entry) => entry.kind === relatedKind).map((entry) => entry.id);
    return ids.length
      ? [
          and(
            eq(communityReferenceEntities.entityKind, relatedKind),
            inArray(communityReferenceEntities.entityId, ids),
          ),
        ]
      : [];
  });
  if (!conditions.length) return new Map();
  const names = await database
    .select({
      kind: communityReferenceEntities.entityKind,
      id: communityReferenceEntities.entityId,
      name: communityReferenceEntities.name,
    })
    .from(communityReferenceEntities)
    .where(and(eq(communityReferenceEntities.snapshotId, snapshotId), or(...conditions)));
  return new Map(names.map((entry) => [entityKey(entry.kind, entry.id), entry.name]));
}

async function buildLocationGroups(
  decoded: ReturnType<typeof decodeQuestieSpawnLocations>,
  world: Awaited<ReturnType<typeof getForeverWorldData>>,
): Promise<readonly CommunityReferenceLocationGroup[]> {
  const byArea = new Map<number, Array<{ readonly xPercent: number; readonly yPercent: number }>>();
  for (const location of decoded.locations) {
    const group = byArea.get(location.areaId) ?? [];
    group.push({ xPercent: location.xPercent, yPercent: location.yPercent });
    byArea.set(location.areaId, group);
  }
  return Promise.all(
    [...byArea.entries()].map(async ([areaId, locations], index) => {
      const areaName = world?.areas.find((area) => area.areaId === areaId)?.name ?? null;
      const map = index < 20 ? await resolveLocationMap(world, areaId) : null;
      return {
        areaId,
        areaName,
        locations,
        map,
      };
    }),
  );
}

async function resolveLocationMap(
  world: Awaited<ReturnType<typeof getForeverWorldData>>,
  areaId: number,
): Promise<CommunityReferenceLocationMap | null> {
  if (!world) return null;
  const candidates = world.uiMapAssignments
    .filter((assignment) => assignment.areaId === areaId)
    .sort((left, right) => left.orderIndex - right.orderIndex);
  for (const candidate of candidates) {
    const page = await getForeverMapPage(candidate.uiMapId);
    if (!page?.layer || page.tiles.length === 0) continue;
    return {
      uiMapId: page.map.uiMapId,
      name: page.map.name,
      buildNumber: page.build.buildNumber,
      width: page.layer.layerWidth,
      height: page.layer.layerHeight,
      tileWidth: page.layer.tileWidth,
      tileHeight: page.layer.tileHeight,
      tiles: page.tiles,
    };
  }
  return null;
}

function readRecordValue(data: unknown, key: string): unknown {
  return isRecord(data) ? data[key] : undefined;
}

function readString(data: unknown, key: string): string | null {
  const value = readRecordValue(data, key);
  return typeof value === "string" && value.trim() ? value : null;
}

function readInteger(data: unknown, key: string): number | null {
  const value = readRecordValue(data, key);
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entityKey(kind: string, id: number): string {
  return `${kind}:${id}`;
}

function buildCommunitySearchSurface(options: {
  readonly kind: CommunityEntityKind;
  readonly id: number;
  readonly name: string | null;
  readonly publishedAt: Date;
  readonly checksum: string | null;
  readonly identityAgreement: EvidenceNameAgreement;
  readonly hasUsefulEvidence: boolean;
  readonly outgoingLinks: readonly string[];
}): SearchSurfaceEntry {
  return assessSearchSurface({
    url: helperAbsoluteUrl(`/forever/encyclopedia/${options.kind}s/${options.id}`),
    pageExists: Boolean(options.name),
    authoritativeIdentityPresent: Boolean(options.name),
    identityConflict: options.identityAgreement.status === "conflicting",
    requiredEvidencePresent: options.hasUsefulEvidence,
    lastModified: options.publishedAt,
    contentHash: options.checksum,
    outgoingLinks: options.outgoingLinks,
    evidenceKinds: [
      "published_community",
      ...(options.identityAgreement.observedCount ? (["runtime_observation"] as const) : []),
    ],
  });
}

function hasUsefulCommunityData(data: unknown): boolean {
  if (!isRecord(data)) return false;
  return ["spawns", "waypoints", "subName", "minLevel", "maxLevel", "rank", "zoneID"].some(
    (key) => {
      const value = data[key];
      if (typeof value === "string") return value.trim().length > 0;
      if (typeof value === "number") return Number.isFinite(value);
      if (Array.isArray(value)) return value.length > 0;
      return isRecord(value) && Object.keys(value).length > 0;
    },
  );
}
