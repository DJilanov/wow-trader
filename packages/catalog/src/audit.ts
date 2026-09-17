import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { dirname, extname, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import {
  catalogSnapshotManifestSchema,
  type CatalogItem,
  type CatalogSnapshotManifest,
} from "@wow-trader/contracts";

import { loadCatalogSnapshot } from "./snapshot.js";

type JsonRecord = Record<string, unknown>;

export interface AuditIdSummary {
  readonly count: number;
  readonly sampleIds: readonly number[];
}

export interface CatalogSnapshotAuditReport {
  readonly valid: boolean;
  readonly product: string;
  readonly clientVersion: string;
  readonly buildNumber: number;
  readonly artifacts: {
    readonly verified: number;
  };
  readonly items: {
    readonly itemRecords: number;
    readonly itemSparseRecords: number;
    readonly itemSearchNameRecords: number;
    readonly sourceUnionIds: number;
    readonly normalizableSourceIds: number;
    readonly normalizedRecords: number;
    readonly sourceIdsWithoutUsableName: AuditIdSummary;
    readonly sourceIdsMissingFromNormalized: AuditIdSummary;
    readonly normalizedIdsMissingFromSources: AuditIdSummary;
    readonly normalizedFieldMismatches: AuditIdSummary;
    readonly rawRecordMismatches: AuditIdSummary;
  };
  readonly warnings: readonly string[];
}

export async function auditCatalogSnapshot(
  manifestPath: string,
): Promise<CatalogSnapshotAuditReport> {
  const absoluteManifestPath = resolve(manifestPath);
  const snapshotDirectory = dirname(absoluteManifestPath);
  const manifest = catalogSnapshotManifestSchema.parse(
    JSON.parse(await readFile(absoluteManifestPath, "utf8")) as unknown,
  );

  const descriptors = [
    ...Object.entries(manifest.rawTables),
    ...Object.entries(manifest.normalizedArtifacts),
  ];
  for (const [name, artifact] of descriptors) {
    await verifyArtifact(snapshotDirectory, name, artifact);
  }

  const bundle = await loadCatalogSnapshot(absoluteManifestPath);
  const itemRows = await loadRawTable(snapshotDirectory, manifest, "Item.effective");
  const sparseRows = await loadRawTable(snapshotDirectory, manifest, "ItemSparse.effective");
  const searchNameRows = await loadRawTable(
    snapshotDirectory,
    manifest,
    "ItemSearchName.effective",
  );

  const sourceIds = new Set([...itemRows.keys(), ...sparseRows.keys(), ...searchNameRows.keys()]);
  const normalizableSourceIds = new Set(
    [...sourceIds].filter((itemId) =>
      expectedItemName(sparseRows.get(itemId), searchNameRows.get(itemId)),
    ),
  );
  const normalizedItems = uniqueNormalizedItems(bundle.items);

  const sourceIdsWithoutUsableName = difference(sourceIds, normalizableSourceIds);
  const sourceIdsMissingFromNormalized = difference(normalizableSourceIds, normalizedItems.keys());
  const normalizedIdsMissingFromSources = difference(normalizedItems.keys(), normalizableSourceIds);
  const normalizedFieldMismatches: number[] = [];
  const rawRecordMismatches: number[] = [];

  for (const itemId of intersection(normalizableSourceIds, normalizedItems.keys())) {
    const actual = normalizedItems.get(itemId);
    if (!actual) continue;

    const item = itemRows.get(itemId);
    const sparse = sparseRows.get(itemId);
    const searchName = searchNameRows.get(itemId);
    const expected = normalizeItemFields(itemId, item, sparse, searchName);
    if (!sameNormalizedFields(actual, expected)) normalizedFieldMismatches.push(itemId);

    const rawRecordMatches =
      isDeepStrictEqual(actual.rawRecord.item, item ?? null) &&
      isDeepStrictEqual(actual.rawRecord.itemSparse, sparse ?? null) &&
      isDeepStrictEqual(actual.rawRecord.itemSearchName, searchName ?? null);
    if (!rawRecordMatches) rawRecordMismatches.push(itemId);
  }

  const warnings: string[] = [];
  if (sourceIdsWithoutUsableName.length > 0) {
    warnings.push(
      `${sourceIdsWithoutUsableName.length} source item IDs have no localized name in ItemSparse or ItemSearchName and cannot become player-facing catalog rows.`,
    );
  }

  const valid =
    sourceIdsMissingFromNormalized.length === 0 &&
    normalizedIdsMissingFromSources.length === 0 &&
    normalizedFieldMismatches.length === 0 &&
    rawRecordMismatches.length === 0;

  return {
    valid,
    product: manifest.product,
    clientVersion: manifest.clientVersion,
    buildNumber: manifest.buildNumber,
    artifacts: { verified: descriptors.length },
    items: {
      itemRecords: itemRows.size,
      itemSparseRecords: sparseRows.size,
      itemSearchNameRecords: searchNameRows.size,
      sourceUnionIds: sourceIds.size,
      normalizableSourceIds: normalizableSourceIds.size,
      normalizedRecords: normalizedItems.size,
      sourceIdsWithoutUsableName: summarizeIds(sourceIdsWithoutUsableName),
      sourceIdsMissingFromNormalized: summarizeIds(sourceIdsMissingFromNormalized),
      normalizedIdsMissingFromSources: summarizeIds(normalizedIdsMissingFromSources),
      normalizedFieldMismatches: summarizeIds(normalizedFieldMismatches),
      rawRecordMismatches: summarizeIds(rawRecordMismatches),
    },
    warnings,
  };
}

function uniqueNormalizedItems(items: readonly CatalogItem[]): ReadonlyMap<number, CatalogItem> {
  const records = new Map<number, CatalogItem>();
  for (const item of items) {
    if (records.has(item.itemId)) throw new Error(`Duplicate normalized item ID ${item.itemId}`);
    records.set(item.itemId, item);
  }
  return records;
}

async function loadRawTable(
  snapshotDirectory: string,
  manifest: CatalogSnapshotManifest,
  name: string,
): Promise<ReadonlyMap<number, JsonRecord>> {
  const artifact = manifest.rawTables[name];
  if (!artifact) throw new Error(`Manifest is missing raw artifact '${name}'`);

  const records = new Map<number, JsonRecord>();
  await forEachJsonRecord(resolveArtifactPath(snapshotDirectory, artifact.path), (record) => {
    const itemId = record.id;
    if (!Number.isSafeInteger(itemId) || Number(itemId) <= 0) {
      throw new Error(`Raw artifact '${name}' contains an invalid item ID`);
    }
    const numericItemId = Number(itemId);
    if (records.has(numericItemId)) {
      throw new Error(`Raw artifact '${name}' contains duplicate item ID ${numericItemId}`);
    }
    records.set(numericItemId, record);
  });
  return records;
}

async function verifyArtifact(
  snapshotDirectory: string,
  name: string,
  artifact: CatalogSnapshotManifest["rawTables"][string],
): Promise<void> {
  const path = resolveArtifactPath(snapshotDirectory, artifact.path);
  const checksum = await sha256File(path);
  if (checksum !== artifact.sha256.toLowerCase()) {
    throw new Error(
      `Checksum mismatch for '${name}': expected ${artifact.sha256}, received ${checksum}`,
    );
  }

  let recordCount = 0;
  await forEachJsonRecord(path, () => {
    recordCount += 1;
  });
  if (recordCount !== artifact.recordCount) {
    throw new Error(
      `Record count mismatch for '${name}': expected ${artifact.recordCount}, received ${recordCount}`,
    );
  }
}

async function forEachJsonRecord(path: string, visit: (record: JsonRecord) => void): Promise<void> {
  const source = createReadStream(path);
  const input = extname(path) === ".gz" ? source.pipe(createGunzip()) : source;
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim().length === 0) continue;

    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(`Invalid JSON in ${path}:${lineNumber}`, { cause: error });
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Expected an object in ${path}:${lineNumber}`);
    }
    visit(value as JsonRecord);
  }
}

function normalizeItemFields(
  itemId: number,
  item: JsonRecord | undefined,
  sparse: JsonRecord | undefined,
  searchName: JsonRecord | undefined,
): Omit<CatalogItem, "rawRecord"> {
  const requiredSkill = getInteger(sparse, "RequiredSkill");
  const iconFileDataId = getInteger(item, "IconFileDataID");
  const optionalPositive = (field: string): number | null => {
    const value = getInteger(sparse, field);
    return value > 0 ? value : null;
  };
  return {
    itemId,
    name: expectedItemName(sparse, searchName),
    description: getString(sparse, "Description_lang"),
    classId: Math.max(0, getInteger(item, "ClassID")),
    subclassId: Math.max(0, getInteger(item, "SubclassID")),
    quality: Math.max(
      0,
      firstNonZero(
        getInteger(sparse, "OverallQualityID"),
        getInteger(searchName, "OverallQualityID"),
      ),
    ),
    requiredLevel: Math.max(
      0,
      firstNonZero(getInteger(sparse, "RequiredLevel"), getInteger(searchName, "RequiredLevel")),
    ),
    itemLevel: Math.max(0, getInteger(sparse, "ItemLevel")),
    requiredSkillId: requiredSkill > 0 ? requiredSkill : null,
    requiredSkillRank: Math.max(0, getInteger(sparse, "RequiredSkillRank")),
    stackSize: Math.max(1, getInteger(sparse, "Stackable")),
    binding: Math.max(0, getInteger(sparse, "Bonding")),
    inventoryType: Math.max(0, getInteger(sparse, "InventoryType")),
    allowableClassMask: getInteger(sparse, "AllowableClass"),
    allowableRaceMask: getIntegerArray(sparse, "AllowableRace"),
    maxCount: Math.max(0, getInteger(sparse, "MaxCount")),
    maxDurability: Math.max(0, getInteger(sparse, "MaxDurability")),
    delayMs: Math.max(0, getInteger(sparse, "ItemDelay")),
    damageType: Math.max(0, getInteger(sparse, "DamageType")),
    itemSetId: optionalPositive("ItemSet"),
    limitCategoryId: optionalPositive("LimitCategory"),
    socketBonusEnchantmentId: optionalPositive("Socket_match_enchantment_ID"),
    gemPropertiesId: optionalPositive("Gem_properties"),
    randomSuffixGroupId: optionalPositive("ItemRandomSuffixGroupID"),
    randomPropertyId: optionalPositive("RandomSelect"),
    requiredAbilityId: optionalPositive("RequiredAbility"),
    minimumFactionId: optionalPositive("MinFactionID"),
    minimumReputation: Math.max(0, getInteger(sparse, "MinReputation")),
    buyPriceCopper: String(Math.max(0, getInteger(sparse, "BuyPrice"))),
    sellPriceCopper: String(Math.max(0, getInteger(sparse, "SellPrice"))),
    iconFileDataId: iconFileDataId > 0 ? iconFileDataId : null,
  };
}

function sameNormalizedFields(
  actual: CatalogItem,
  expected: Omit<CatalogItem, "rawRecord">,
): boolean {
  const { rawRecord: _rawRecord, ...actualFields } = actual;
  return isDeepStrictEqual(actualFields, expected);
}

function expectedItemName(
  sparse: JsonRecord | undefined,
  searchName: JsonRecord | undefined,
): string {
  return firstNonEmpty(getString(sparse, "Display_lang"), getString(searchName, "Display_lang"));
}

function getInteger(record: JsonRecord | undefined, field: string): number {
  const value = record?.[field];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function getString(record: JsonRecord | undefined, field: string): string {
  const value = record?.[field];
  return typeof value === "string" ? value : "";
}

function getIntegerArray(record: JsonRecord | undefined, field: string): number[] {
  const value = record?.[field];
  return Array.isArray(value)
    ? value.filter((entry): entry is number => Number.isSafeInteger(entry))
    : [];
}

function firstNonZero(...values: readonly number[]): number {
  return values.find((value) => value !== 0) ?? 0;
}

function firstNonEmpty(...values: readonly string[]): string {
  return values.find((value) => value.trim().length > 0) ?? "";
}

function difference(left: Iterable<number>, right: Iterable<number>): number[] {
  const rightSet = new Set(right);
  return [...left].filter((itemId) => !rightSet.has(itemId)).sort((a, b) => a - b);
}

function intersection(left: Iterable<number>, right: Iterable<number>): number[] {
  const rightSet = new Set(right);
  return [...left].filter((itemId) => rightSet.has(itemId)).sort((a, b) => a - b);
}

function summarizeIds(ids: readonly number[]): AuditIdSummary {
  return { count: ids.length, sampleIds: ids.slice(0, 25) };
}

function resolveArtifactPath(snapshotDirectory: string, artifactPath: string): string {
  const absolutePath = resolve(snapshotDirectory, artifactPath);
  const traversal = relative(snapshotDirectory, absolutePath);
  if (
    traversal.startsWith("..") ||
    traversal.includes(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error(`Artifact path escapes the snapshot directory: ${artifactPath}`);
  }
  return absolutePath;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
