import {
  gameBuilds,
  itemDamages,
  itemEffects,
  itemResistances,
  itemSockets,
  itemStats,
  itemVersions,
  marketItemSignals,
  marketScans,
  professionVersions,
  professions,
  rawUploads,
  recipeInputs,
  recipeOutputs,
  recipeTeachingItems,
  recipeVersions,
} from "@wow-trader/db";
import { and, count, desc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "./database";
import { FOREVER_CLIENT_PRODUCT } from "./game-versions";
import { getForeverWorldOverview } from "./forever-world";

const PUBLIC_MARKET_MINIMUM_OBSERVATIONS = 24;
const PUBLIC_MARKET_MINIMUM_CONFIDENCE_BASIS_POINTS = 5_000;

export interface ForeverObservatoryReport {
  readonly schemaVersion: "forever-observatory.v1";
  readonly generatedAt: string;
  readonly catalog: {
    readonly current: BuildSummary | null;
    readonly previous: BuildSummary | null;
    readonly changes: CatalogChangeSummary | null;
    readonly professions: readonly ProfessionSummary[];
  };
  readonly market: MarketResearchSummary;
  readonly world: Awaited<ReturnType<typeof getForeverWorldOverview>>;
  readonly discovery: {
    readonly catalogItems: number;
    readonly latestMarketItems: number;
    readonly latestMarketCoveragePercent: number | null;
    readonly sourceHints: number;
    readonly lootSourceCandidates: number;
    readonly confirmedDropRates: number;
  };
  readonly publicationRules: readonly string[];
}

interface BuildSummary {
  readonly snapshotKey: string;
  readonly buildNumber: number;
  readonly version: string;
  readonly hotfixHash: string | null;
  readonly definitionsRevision: string;
  readonly extractorVersion: string;
  readonly publishedAt: string | null;
  readonly extractedAt: string;
}

interface EntityChangeCounts {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly sampleIds: readonly number[];
}

interface CatalogChangeSummary {
  readonly items: EntityChangeCounts;
  readonly recipes: EntityChangeCounts;
  readonly note: string;
}

interface ProfessionSummary {
  readonly skillLineId: number;
  readonly slug: string;
  readonly name: string;
  readonly recipes: number;
  readonly cooldownRecipes: number;
  readonly unresolvedRecipes: number;
}

interface MarketResearchSummary {
  readonly state: "unavailable" | "collecting" | "reportable";
  readonly evidenceRule: string;
  readonly scan: {
    readonly buildNumber: number;
    readonly market: string;
    readonly completedAt: string;
    readonly completeness: number;
    readonly itemCount: number;
  } | null;
  readonly eligibleItems: number;
  readonly collectingItems: number;
  readonly signals: Readonly<Record<string, number>>;
  readonly notable: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly signal: string;
    readonly differencePercent: number;
    readonly confidencePercent: number;
    readonly observationCount: number;
  }[];
}

interface ComparableRecord {
  readonly id: number;
  readonly value: string;
}

export async function getForeverObservatoryReport(): Promise<ForeverObservatoryReport> {
  const database = getDatabase();
  const builds = await database
    .select({
      id: gameBuilds.id,
      snapshotKey: gameBuilds.snapshotKey,
      buildNumber: gameBuilds.buildNumber,
      clientVersion: gameBuilds.clientVersion,
      hotfixHash: gameBuilds.hotfixHash,
      definitionsRevision: gameBuilds.definitionsRevision,
      extractorVersion: gameBuilds.extractorVersion,
      publishedAt: gameBuilds.publishedAt,
      extractedAt: gameBuilds.extractedAt,
    })
    .from(gameBuilds)
    .where(and(eq(gameBuilds.product, FOREVER_CLIENT_PRODUCT), eq(gameBuilds.status, "published")))
    .orderBy(desc(gameBuilds.buildNumber), desc(gameBuilds.publishedAt), desc(gameBuilds.createdAt))
    .limit(2);
  const current = builds[0] ?? null;
  const previous = builds[1] ?? null;

  const [changes, professionSummaries, market, world] = await Promise.all([
    current && previous ? compareBuilds(previous.id, current.id) : Promise.resolve(null),
    current ? getProfessionSummaries(current.id) : Promise.resolve([]),
    getMarketSummary(current ? { id: current.id, buildNumber: current.buildNumber } : null),
    getForeverWorldOverview().catch(() => null),
  ]);
  const catalogItems = current
    ? ((
        await database
          .select({ value: count() })
          .from(itemVersions)
          .where(eq(itemVersions.buildId, current.id))
      )[0]?.value ?? 0)
    : 0;
  const latestMarketItems = market.scan?.itemCount ?? 0;
  const worldCounts = world?.counts;

  return {
    schemaVersion: "forever-observatory.v1",
    generatedAt: new Date().toISOString(),
    catalog: {
      current: current ? buildSummary(current) : null,
      previous: previous ? buildSummary(previous) : null,
      changes,
      professions: professionSummaries,
    },
    market,
    world,
    discovery: {
      catalogItems,
      latestMarketItems,
      latestMarketCoveragePercent:
        catalogItems > 0 ? Math.round((latestMarketItems / catalogItems) * 10_000) / 100 : null,
      sourceHints: worldCounts?.sourceHints ?? 0,
      lootSourceCandidates: worldCounts?.lootSourceCandidates ?? 0,
      confirmedDropRates: 0,
    },
    publicationRules: [
      "Catalog claims are scoped to one published client build.",
      `Public market trends require at least ${PUBLIC_MARKET_MINIMUM_OBSERVATIONS} accepted observations and ${PUBLIC_MARKET_MINIMUM_CONFIDENCE_BASIS_POINTS / 100}% confidence.`,
      "Cooldown recipes are excluded from repeatable-profit guidance.",
      "Client source hints and candidate relationships are not confirmed loot sources or drop rates.",
      "BiS and class-scaling conclusions remain unpublished until a build-locked mechanics model passes validation.",
    ],
  };
}

async function compareBuilds(
  fromBuildId: string,
  toBuildId: string,
): Promise<CatalogChangeSummary> {
  const database = getDatabase();
  const [
    itemRows,
    statRows,
    damageRows,
    resistanceRows,
    socketRows,
    effectRows,
    recipeRows,
    inputRows,
    outputRows,
    teachingRows,
  ] = await Promise.all([
    database
      .select({
        buildId: itemVersions.buildId,
        id: itemVersions.itemId,
        name: itemVersions.name,
        description: itemVersions.description,
        classId: itemVersions.classId,
        subclassId: itemVersions.subclassId,
        quality: itemVersions.quality,
        requiredLevel: itemVersions.requiredLevel,
        itemLevel: itemVersions.itemLevel,
        requiredSkillId: itemVersions.requiredSkillId,
        requiredSkillRank: itemVersions.requiredSkillRank,
        stackSize: itemVersions.stackSize,
        binding: itemVersions.binding,
        inventoryType: itemVersions.inventoryType,
        buyPriceCopper: itemVersions.buyPriceCopper,
        sellPriceCopper: itemVersions.sellPriceCopper,
        iconFileDataId: itemVersions.iconFileDataId,
      })
      .from(itemVersions)
      .where(inArray(itemVersions.buildId, [fromBuildId, toBuildId])),
    database
      .select()
      .from(itemStats)
      .where(inArray(itemStats.buildId, [fromBuildId, toBuildId])),
    database
      .select()
      .from(itemDamages)
      .where(inArray(itemDamages.buildId, [fromBuildId, toBuildId])),
    database
      .select()
      .from(itemResistances)
      .where(inArray(itemResistances.buildId, [fromBuildId, toBuildId])),
    database
      .select()
      .from(itemSockets)
      .where(inArray(itemSockets.buildId, [fromBuildId, toBuildId])),
    database
      .select()
      .from(itemEffects)
      .where(inArray(itemEffects.buildId, [fromBuildId, toBuildId])),
    database
      .select({
        buildId: recipeVersions.buildId,
        id: recipeVersions.recipeSpellId,
        professionSkillLineId: recipeVersions.professionSkillLineId,
        requiredSkillRank: recipeVersions.requiredSkillRank,
        cooldownMs: recipeVersions.cooldownMs,
        categoryCooldownMs: recipeVersions.categoryCooldownMs,
        outputKind: recipeVersions.outputKind,
        extractionStatus: recipeVersions.extractionStatus,
      })
      .from(recipeVersions)
      .where(inArray(recipeVersions.buildId, [fromBuildId, toBuildId])),
    database
      .select()
      .from(recipeInputs)
      .where(inArray(recipeInputs.buildId, [fromBuildId, toBuildId])),
    database
      .select()
      .from(recipeOutputs)
      .where(inArray(recipeOutputs.buildId, [fromBuildId, toBuildId])),
    database
      .select()
      .from(recipeTeachingItems)
      .where(inArray(recipeTeachingItems.buildId, [fromBuildId, toBuildId])),
  ]);

  const statsByItem = groupRows(statRows, (row) => row.itemId);
  const damagesByItem = groupRows(damageRows, (row) => row.itemId);
  const resistancesByItem = groupRows(resistanceRows, (row) => row.itemId);
  const socketsByItem = groupRows(socketRows, (row) => row.itemId);
  const effectsByItem = groupRows(effectRows, (row) => row.itemId);
  const inputsByRecipe = groupRows(inputRows, (row) => row.recipeSpellId);
  const outputsByRecipe = groupRows(outputRows, (row) => row.recipeSpellId);
  const teachingByRecipe = groupRows(teachingRows, (row) => row.recipeSpellId);

  const items = itemRows.map((row) => ({
    buildId: row.buildId,
    id: row.id,
    value: stableStringify({
      ...row,
      buildId: undefined,
      buyPriceCopper: String(row.buyPriceCopper),
      sellPriceCopper: String(row.sellPriceCopper),
      stats: statsByItem.get(entityKey(row.buildId, row.id)) ?? [],
      damages: damagesByItem.get(entityKey(row.buildId, row.id)) ?? [],
      resistances: resistancesByItem.get(entityKey(row.buildId, row.id)) ?? [],
      sockets: socketsByItem.get(entityKey(row.buildId, row.id)) ?? [],
      effects: effectsByItem.get(entityKey(row.buildId, row.id)) ?? [],
    }),
  }));
  const recipes = recipeRows.map((row) => ({
    buildId: row.buildId,
    id: row.id,
    value: stableStringify({
      ...row,
      buildId: undefined,
      inputs: inputsByRecipe.get(entityKey(row.buildId, row.id)) ?? [],
      outputs: outputsByRecipe.get(entityKey(row.buildId, row.id)) ?? [],
      teachingItems: teachingByRecipe.get(entityKey(row.buildId, row.id)) ?? [],
    }),
  }));

  return {
    items: summarizeChanges(
      items.filter((row) => row.buildId === fromBuildId),
      items.filter((row) => row.buildId === toBuildId),
    ),
    recipes: summarizeChanges(
      recipes.filter((row) => row.buildId === fromBuildId),
      recipes.filter((row) => row.buildId === toBuildId),
    ),
    note: "Counts compare normalized player-facing fields. Raw extraction evidence is excluded.",
  };
}

async function getProfessionSummaries(buildId: string): Promise<readonly ProfessionSummary[]> {
  const database = getDatabase();
  const [professionRows, recipeRows] = await Promise.all([
    database
      .select({
        skillLineId: professionVersions.skillLineId,
        name: professionVersions.name,
        slug: professions.slug,
      })
      .from(professionVersions)
      .innerJoin(professions, eq(professions.skillLineId, professionVersions.skillLineId))
      .where(eq(professionVersions.buildId, buildId)),
    database
      .select({
        professionSkillLineId: recipeVersions.professionSkillLineId,
        cooldownMs: recipeVersions.cooldownMs,
        categoryCooldownMs: recipeVersions.categoryCooldownMs,
        extractionStatus: recipeVersions.extractionStatus,
      })
      .from(recipeVersions)
      .where(eq(recipeVersions.buildId, buildId)),
  ]);
  return professionRows
    .map((profession) => {
      const recipesForProfession = recipeRows.filter(
        (recipe) => recipe.professionSkillLineId === profession.skillLineId,
      );
      return {
        ...profession,
        recipes: recipesForProfession.length,
        cooldownRecipes: recipesForProfession.filter(
          (recipe) => recipe.cooldownMs > 0 || recipe.categoryCooldownMs > 0,
        ).length,
        unresolvedRecipes: recipesForProfession.filter(
          (recipe) => recipe.extractionStatus !== "complete",
        ).length,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function getMarketSummary(
  build: { readonly id: string; readonly buildNumber: number } | null,
): Promise<MarketResearchSummary> {
  const database = getDatabase();
  const [scan] = await database
    .select({
      scanId: marketScans.scanId,
      clientBuild: marketScans.clientBuild,
      region: marketScans.region,
      realmId: marketScans.realmId,
      auctionHouseType: marketScans.auctionHouseType,
      completedAt: marketScans.completedAt,
      completeness: marketScans.completeness,
      itemCount: marketScans.itemCount,
    })
    .from(marketScans)
    .innerJoin(rawUploads, eq(rawUploads.payloadId, marketScans.payloadId))
    .where(
      and(
        eq(rawUploads.clientProduct, FOREVER_CLIENT_PRODUCT),
        eq(marketScans.qualityAccepted, true),
      ),
    )
    .orderBy(desc(marketScans.completedAt))
    .limit(1);
  const evidenceRule = `At least ${PUBLIC_MARKET_MINIMUM_OBSERVATIONS} accepted observations and ${PUBLIC_MARKET_MINIMUM_CONFIDENCE_BASIS_POINTS / 100}% confidence for the exact build and market.`;
  if (!scan || !build) return emptyMarket(evidenceRule);
  if (scan.clientBuild !== build.buildNumber) {
    return {
      ...emptyMarket(evidenceRule),
      state: "collecting",
      scan: marketScanSummary(scan),
    };
  }

  const rows = await database
    .select({
      itemId: marketItemSignals.itemId,
      name: itemVersions.name,
      signal: marketItemSignals.signal,
      observationCount: marketItemSignals.observationCount,
      confidenceBasisPoints: marketItemSignals.confidenceBasisPoints,
      differenceBasisPoints: marketItemSignals.differenceBasisPoints,
    })
    .from(marketItemSignals)
    .innerJoin(
      itemVersions,
      and(eq(itemVersions.buildId, build.id), eq(itemVersions.itemId, marketItemSignals.itemId)),
    )
    .where(
      and(
        eq(marketItemSignals.clientProduct, FOREVER_CLIENT_PRODUCT),
        eq(marketItemSignals.clientBuild, scan.clientBuild),
        eq(marketItemSignals.region, scan.region),
        eq(marketItemSignals.realmId, scan.realmId),
        eq(marketItemSignals.auctionHouseType, scan.auctionHouseType),
        eq(marketItemSignals.asOfScanId, scan.scanId),
      ),
    );
  const eligible = rows.filter(
    (row) =>
      row.observationCount >= PUBLIC_MARKET_MINIMUM_OBSERVATIONS &&
      (row.confidenceBasisPoints ?? 0) >= PUBLIC_MARKET_MINIMUM_CONFIDENCE_BASIS_POINTS,
  );
  const signals: Record<string, number> = {};
  for (const row of eligible) signals[row.signal] = (signals[row.signal] ?? 0) + 1;
  const notable = eligible
    .filter(
      (row) =>
        row.differenceBasisPoints !== null &&
        ["bargain", "rising", "spike_risk", "oversupplied", "falling"].includes(row.signal),
    )
    .sort(
      (left, right) =>
        Math.abs(right.differenceBasisPoints ?? 0) - Math.abs(left.differenceBasisPoints ?? 0),
    )
    .slice(0, 12)
    .map((row) => ({
      itemId: row.itemId,
      name: row.name,
      signal: row.signal,
      differencePercent: Math.round((row.differenceBasisPoints ?? 0) / 100),
      confidencePercent: Math.round((row.confidenceBasisPoints ?? 0) / 100),
      observationCount: row.observationCount,
    }));
  return {
    state: eligible.length > 0 ? "reportable" : "collecting",
    evidenceRule,
    scan: marketScanSummary(scan),
    eligibleItems: eligible.length,
    collectingItems: rows.length - eligible.length,
    signals,
    notable,
  };
}

function marketScanSummary(scan: {
  readonly clientBuild: number;
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: string;
  readonly completedAt: Date;
  readonly completeness: number;
  readonly itemCount: number;
}): NonNullable<MarketResearchSummary["scan"]> {
  return {
    buildNumber: scan.clientBuild,
    market: `${scan.region}|${scan.realmId}|${scan.auctionHouseType}`,
    completedAt: scan.completedAt.toISOString(),
    completeness: scan.completeness,
    itemCount: scan.itemCount,
  };
}

function emptyMarket(evidenceRule: string): MarketResearchSummary {
  return {
    state: "unavailable",
    evidenceRule,
    scan: null,
    eligibleItems: 0,
    collectingItems: 0,
    signals: {},
    notable: [],
  };
}

function summarizeChanges(
  before: readonly (ComparableRecord & { readonly buildId: string })[],
  after: readonly (ComparableRecord & { readonly buildId: string })[],
): EntityChangeCounts {
  const beforeById = new Map(before.map((row) => [row.id, row.value]));
  const afterById = new Map(after.map((row) => [row.id, row.value]));
  const added = [...afterById.keys()].filter((id) => !beforeById.has(id));
  const removed = [...beforeById.keys()].filter((id) => !afterById.has(id));
  const changed = [...afterById.entries()]
    .filter(([id, value]) => beforeById.has(id) && beforeById.get(id) !== value)
    .map(([id]) => id);
  return {
    added: added.length,
    removed: removed.length,
    changed: changed.length,
    sampleIds: [...added, ...removed, ...changed].sort(numericSort).slice(0, 20),
  };
}

function buildSummary(build: {
  readonly snapshotKey: string;
  readonly buildNumber: number;
  readonly clientVersion: string;
  readonly hotfixHash: string | null;
  readonly definitionsRevision: string;
  readonly extractorVersion: string;
  readonly publishedAt: Date | null;
  readonly extractedAt: Date;
}): BuildSummary {
  return {
    snapshotKey: build.snapshotKey,
    buildNumber: build.buildNumber,
    version: build.clientVersion,
    hotfixHash: build.hotfixHash,
    definitionsRevision: build.definitionsRevision,
    extractorVersion: build.extractorVersion,
    publishedAt: build.publishedAt?.toISOString() ?? null,
    extractedAt: build.extractedAt.toISOString(),
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    typeof entry === "bigint" ? entry.toString() : entry,
  );
}

function compareValues(left: unknown, right: unknown): number {
  return stableStringify(left).localeCompare(stableStringify(right));
}

function groupRows<T extends { readonly buildId: string }>(
  rows: readonly T[],
  selectId: (row: T) => number,
): ReadonlyMap<string, readonly Omit<T, "buildId">[]> {
  const grouped = new Map<string, Omit<T, "buildId">[]>();
  for (const row of rows) {
    const { buildId, ...value } = row;
    const key = entityKey(buildId, selectId(row));
    const current = grouped.get(key) ?? [];
    current.push(value);
    grouped.set(key, current);
  }
  for (const values of grouped.values()) values.sort(compareValues);
  return grouped;
}

function entityKey(buildId: string, entityId: number): string {
  return `${buildId}:${entityId}`;
}

function numericSort(left: number, right: number): number {
  return left - right;
}
