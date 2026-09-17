import {
  auctionPriceLevels,
  gameBuilds,
  itemVersions,
  marketScans,
  professions,
  professionVersions,
  rawUploads,
  recipeInputs,
  recipeOutputs,
  recipeVersions,
  spellVersions,
  transformationInputs,
  transformationOutputs,
  transformationVersions,
} from "@wow-trader/db";
import {
  createProductionPlanner,
  isTimeGatedCraft,
  type ProductionPlanner,
  type ProductionRecipe,
} from "@wow-trader/economics";
import { and, count, desc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "./database";
import { DISENCHANT_MATERIAL_ITEM_IDS, getDisenchantDistribution } from "./disenchanting";
import { formatCopper, formatPercentBasisPoints } from "./format";
import { TBC_CLIENT_PRODUCT } from "./game-versions";
import { getMarketScanFreshness, type MarketScanFreshness } from "./market-freshness";
import { matchesProductName } from "./product-search";
import { getAuditedRequiredSkillRank } from "./recipe-requirements";
import {
  applySpecialization,
  getCraftingSpecializationProfiles,
  isRecipeAvailableWithSpecialization,
  resolveSpecialization,
  type AppliedSpecialization,
  type CraftingSpecializationProfile,
  type ProfessionSpecializationProfile,
} from "./specializations";
import {
  evaluateWorkspaceRecipe,
  type RealizationRoute,
  type WorkspaceMaterialPlan,
  type WorkspaceRecipeCandidate,
  type WorkspaceRouteEvaluation,
} from "./workspace";

export type WorkspaceRouteFilter = "best" | RealizationRoute;
export type WorkspaceSort = "profit" | "roi" | "specialization-uplift";

export interface MarketWorkspaceFilters {
  readonly clientProduct?: string;
  readonly market?: string;
  readonly profession?: string;
  readonly query?: string;
  readonly route?: WorkspaceRouteFilter;
  readonly sort?: WorkspaceSort;
  readonly specializations?: CraftingSpecializationProfile;
  readonly useAltCrafting?: boolean;
  readonly recipeSpellId?: number;
}

export interface MarketWorkspaceOpportunity {
  readonly recipeSpellId: number;
  readonly recipeName: string;
  readonly professionName: string;
  readonly professionSlug: string;
  readonly route: RealizationRoute;
  readonly routeLabel: string;
  readonly requiredSkillRank: number;
  readonly cooldownLabel: string | null;
  readonly outputLabel: string;
  readonly outputIconFileDataId: number | null;
  readonly outputQuality: number;
  readonly expectedYieldLabel: string;
  readonly yieldRangeLabel: string;
  readonly reagentCost: string;
  readonly netValue: string;
  readonly auctionHouseCut: string;
  readonly quotedProfit: string;
  readonly baseProfit: string;
  readonly specializationUplift: string | null;
  readonly specializationName: string | null;
  readonly specializationModelVersion: string | null;
  readonly directReagentCost: string | null;
  readonly networkSavings: string | null;
  readonly directMarketProfit: string | null;
  readonly stopEarlyWarning: string | null;
  readonly usesAltCrafting: boolean;
  readonly craftSteps: readonly {
    readonly recipeSpellId: number;
    readonly recipeName: string;
    readonly professionName: string;
    readonly requiredSkillRank: number;
    readonly crafts: number;
    readonly outputItemId: number;
    readonly outputName: string;
    readonly outputQuantity: number;
    readonly leftoverQuantity: number;
  }[];
  readonly crossProfessionTransferCount: number;
  readonly returnOnCapital: string;
  readonly confidenceTier: "deterministic" | "modeled" | "speculative";
  readonly confidenceLabel: string;
  readonly evidence: string;
  readonly inputs: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly quantity: number;
    readonly iconFileDataId: number | null;
    readonly quality: number;
    readonly cost: string;
    readonly highestUnitPrice: string;
  }[];
  readonly outputs: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly iconFileDataId: number | null;
    readonly quality: number;
    readonly expectedQuantity: string;
    readonly unitValue: string;
  }[];
  readonly omittedOutputCount: number;
}

export interface MarketWorkspaceData {
  readonly scan: {
    readonly market: string;
    readonly region: string;
    readonly realmId: string;
    readonly auctionHouseType: string;
    readonly completedAt: Date;
    readonly completeness: number;
    readonly itemCount: number;
    readonly clientBuild: number;
    readonly clientVersion: string;
    readonly historyScanCount: number;
    readonly freshness: MarketScanFreshness;
  } | null;
  readonly markets: readonly {
    readonly value: string;
    readonly label: string;
    readonly completedAt: Date;
  }[];
  readonly professions: readonly {
    readonly slug: string;
    readonly name: string;
    readonly opportunityCount: number;
  }[];
  readonly routeCounts: Readonly<Record<"best" | RealizationRoute, number>>;
  readonly specializationProfiles: readonly ProfessionSpecializationProfile[];
  readonly useAltCrafting: boolean;
  readonly opportunities: readonly MarketWorkspaceOpportunity[];
  readonly totalOpportunityCount: number;
  readonly limitation: string;
}

interface EvaluatedCandidate {
  readonly candidate: WorkspaceRecipeCandidate;
  readonly evaluation: WorkspaceRouteEvaluation;
  readonly baseEvaluation: WorkspaceRouteEvaluation;
  readonly specialization: AppliedSpecialization | null;
  readonly directMarketEvaluation: WorkspaceRouteEvaluation | null;
}

export async function getMarketWorkspace(
  filters: MarketWorkspaceFilters = {},
): Promise<MarketWorkspaceData> {
  const database = getDatabase();
  const clientProduct = filters.clientProduct ?? TBC_CLIENT_PRODUCT;
  const recentScans = await database
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
    .where(
      inArray(
        marketScans.payloadId,
        database
          .select({ payloadId: rawUploads.payloadId })
          .from(rawUploads)
          .where(eq(rawUploads.clientProduct, clientProduct)),
      ),
    )
    .orderBy(desc(marketScans.completedAt))
    .limit(250);
  const markets = uniqueMarkets(recentScans);
  const selected =
    recentScans.find((scan) => marketValue(scan) === filters.market) ?? recentScans.at(0) ?? null;
  if (!selected) return emptyWorkspace(markets, "Run and upload a full Auction House scan first.");

  const [build] = await database
    .select()
    .from(gameBuilds)
    .where(
      and(
        eq(gameBuilds.status, "published"),
        eq(gameBuilds.product, clientProduct),
        eq(gameBuilds.buildNumber, selected.clientBuild),
      ),
    )
    .orderBy(desc(gameBuilds.publishedAt))
    .limit(1);
  if (!build) {
    return emptyWorkspace(
      markets,
      `No published catalog matches Auction House build ${selected.clientBuild}.`,
    );
  }

  const [
    levels,
    recipeRows,
    inputRows,
    outputRows,
    professionRows,
    scanCountRows,
    disenchantMaterialRows,
    transformationRows,
    transformationInputRows,
    transformationOutputRows,
  ] = await Promise.all([
    database
      .select()
      .from(auctionPriceLevels)
      .where(eq(auctionPriceLevels.scanId, selected.scanId)),
    database
      .select({
        recipeSpellId: recipeVersions.recipeSpellId,
        recipeName: spellVersions.name,
        professionName: professionVersions.name,
        professionSlug: professions.slug,
        requiredSkillRank: recipeVersions.requiredSkillRank,
        cooldownMs: recipeVersions.cooldownMs,
        categoryCooldownMs: recipeVersions.categoryCooldownMs,
        outputKind: recipeVersions.outputKind,
      })
      .from(recipeVersions)
      .innerJoin(
        spellVersions,
        and(
          eq(spellVersions.buildId, recipeVersions.buildId),
          eq(spellVersions.spellId, recipeVersions.recipeSpellId),
        ),
      )
      .innerJoin(
        professionVersions,
        and(
          eq(professionVersions.buildId, recipeVersions.buildId),
          eq(professionVersions.skillLineId, recipeVersions.professionSkillLineId),
        ),
      )
      .innerJoin(professions, eq(professions.skillLineId, recipeVersions.professionSkillLineId))
      .where(eq(recipeVersions.buildId, build.id)),
    database
      .select({
        recipeSpellId: recipeInputs.recipeSpellId,
        itemId: recipeInputs.reagentItemId,
        name: itemVersions.name,
        quantity: recipeInputs.quantity,
        iconFileDataId: itemVersions.iconFileDataId,
        quality: itemVersions.quality,
      })
      .from(recipeInputs)
      .innerJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, recipeInputs.buildId),
          eq(itemVersions.itemId, recipeInputs.reagentItemId),
        ),
      )
      .where(eq(recipeInputs.buildId, build.id)),
    database
      .select({
        recipeSpellId: recipeOutputs.recipeSpellId,
        itemId: recipeOutputs.outputItemId,
        name: itemVersions.name,
        classId: itemVersions.classId,
        subclassId: itemVersions.subclassId,
        iconFileDataId: itemVersions.iconFileDataId,
        quality: itemVersions.quality,
        itemLevel: itemVersions.itemLevel,
        vendorSellPriceCopper: itemVersions.sellPriceCopper,
        minimumQuantity: recipeOutputs.minimumQuantity,
        maximumQuantity: recipeOutputs.maximumQuantity,
        expectedQuantityNumerator: recipeOutputs.expectedQuantityNumerator,
        expectedQuantityDenominator: recipeOutputs.expectedQuantityDenominator,
      })
      .from(recipeOutputs)
      .innerJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, recipeOutputs.buildId),
          eq(itemVersions.itemId, recipeOutputs.outputItemId),
        ),
      )
      .where(eq(recipeOutputs.buildId, build.id)),
    database
      .select({ slug: professions.slug, name: professionVersions.name })
      .from(professions)
      .innerJoin(
        professionVersions,
        and(
          eq(professionVersions.skillLineId, professions.skillLineId),
          eq(professionVersions.buildId, build.id),
        ),
      )
      .orderBy(professionVersions.name),
    database
      .select({ value: count() })
      .from(marketScans)
      .where(
        and(
          eq(marketScans.region, selected.region),
          eq(marketScans.realmId, selected.realmId),
          eq(marketScans.auctionHouseType, selected.auctionHouseType),
          inArray(
            marketScans.payloadId,
            database
              .select({ payloadId: rawUploads.payloadId })
              .from(rawUploads)
              .where(eq(rawUploads.clientProduct, clientProduct)),
          ),
        ),
      ),
    database
      .select({
        itemId: itemVersions.itemId,
        name: itemVersions.name,
        iconFileDataId: itemVersions.iconFileDataId,
        quality: itemVersions.quality,
      })
      .from(itemVersions)
      .where(
        and(
          eq(itemVersions.buildId, build.id),
          inArray(itemVersions.itemId, [...DISENCHANT_MATERIAL_ITEM_IDS]),
        ),
      ),
    database
      .select({
        transformationId: transformationVersions.transformationId,
        spellId: transformationVersions.spellId,
        name: spellVersions.name,
        cooldownMs: transformationVersions.cooldownMs,
        categoryCooldownMs: transformationVersions.categoryCooldownMs,
      })
      .from(transformationVersions)
      .innerJoin(
        spellVersions,
        and(
          eq(spellVersions.buildId, transformationVersions.buildId),
          eq(spellVersions.spellId, transformationVersions.spellId),
        ),
      )
      .where(eq(transformationVersions.buildId, build.id)),
    database
      .select({
        transformationId: transformationInputs.transformationId,
        itemId: transformationInputs.itemId,
        name: itemVersions.name,
        quantity: transformationInputs.quantity,
        iconFileDataId: itemVersions.iconFileDataId,
        quality: itemVersions.quality,
      })
      .from(transformationInputs)
      .innerJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, transformationInputs.buildId),
          eq(itemVersions.itemId, transformationInputs.itemId),
        ),
      )
      .where(eq(transformationInputs.buildId, build.id)),
    database
      .select({
        transformationId: transformationOutputs.transformationId,
        itemId: transformationOutputs.itemId,
        name: itemVersions.name,
        minimumQuantity: transformationOutputs.minimumQuantity,
        maximumQuantity: transformationOutputs.maximumQuantity,
        iconFileDataId: itemVersions.iconFileDataId,
        quality: itemVersions.quality,
      })
      .from(transformationOutputs)
      .innerJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, transformationOutputs.buildId),
          eq(itemVersions.itemId, transformationOutputs.itemId),
        ),
      )
      .where(eq(transformationOutputs.buildId, build.id)),
  ]);

  const priceLevelsByItem = groupBy(
    levels.filter((level) => level.marketKey === String(level.itemId)),
    (level) => level.itemId,
  );
  const inputsByRecipe = groupBy(inputRows, (row) => row.recipeSpellId);
  const outputsByRecipe = groupBy(
    outputRows.filter(
      (row): row is typeof row & { readonly itemId: number } => row.itemId !== null,
    ),
    (row) => row.recipeSpellId,
  );
  const disenchantMaterialsByItem = new Map(
    disenchantMaterialRows.map((material) => [material.itemId, material]),
  );
  const transformationInputsById = groupBy(transformationInputRows, (row) => row.transformationId);
  const transformationOutputsById = groupBy(
    transformationOutputRows,
    (row) => row.transformationId,
  );
  const auctionHouseCutBasisPoints = selected.auctionHouseType === "neutral" ? 1_500 : 500;
  const evaluated: EvaluatedCandidate[] = [];
  const selectedSpecializations = filters.specializations ?? {};
  const useAltCrafting = filters.useAltCrafting ?? false;
  const specializationProfiles = getCraftingSpecializationProfiles(
    build.product,
    build.buildNumber,
    selectedSpecializations,
    useAltCrafting ? undefined : filters.profession || undefined,
  );
  const candidates = recipeRows.flatMap((recipe) => {
    if (isTimeGatedCraft(recipe.cooldownMs, recipe.categoryCooldownMs)) return [];
    const candidate = makeCandidate(
      recipe,
      inputsByRecipe.get(recipe.recipeSpellId) ?? [],
      outputsByRecipe.get(recipe.recipeSpellId) ?? [],
      priceLevelsByItem,
      build.product,
      build.buildNumber,
      disenchantMaterialsByItem,
    );
    return candidate ? [candidate] : [];
  });
  const itemDetailsById = new Map(
    [...inputRows, ...outputRows, ...transformationInputRows, ...transformationOutputRows]
      .filter((item): item is typeof item & { readonly itemId: number } => item.itemId !== null)
      .map((item) => [
        item.itemId,
        {
          name: item.name,
          iconFileDataId: item.iconFileDataId,
          quality: item.quality,
        },
      ]),
  );
  const productionPlanner = useAltCrafting
    ? createWorkspaceProductionPlanner(
        candidates,
        priceLevelsByItem,
        build.product,
        build.buildNumber,
        selectedSpecializations,
        transformationRows.map((transformation) => ({
          ...transformation,
          inputs: transformationInputsById.get(transformation.transformationId) ?? [],
          outputs: transformationOutputsById.get(transformation.transformationId) ?? [],
        })),
      )
    : null;

  for (const candidate of candidates) {
    if (
      !isRecipeAvailableWithSpecialization(
        build.product,
        build.buildNumber,
        selectedSpecializations,
        candidate,
      )
    ) {
      continue;
    }
    const specialization = resolveSpecialization(
      build.product,
      build.buildNumber,
      selectedSpecializations,
      candidate,
    );
    const materialPlan = productionPlanner
      ? makeWorkspaceMaterialPlan(
          productionPlanner.plan({
            requirements: candidate.inputs.map((input) => ({
              itemId: input.itemId,
              quantity: input.quantity,
            })),
            consumerProfessionSlug: candidate.professionSlug,
          }),
          itemDetailsById,
        )
      : undefined;
    if (productionPlanner && !materialPlan) continue;
    const baseEvaluations = evaluateWorkspaceRecipe(
      candidate,
      auctionHouseCutBasisPoints,
      materialPlan,
    );
    const adjustedCandidate = applySpecialization(candidate, specialization);
    const directMarketEvaluations = productionPlanner
      ? evaluateWorkspaceRecipe(adjustedCandidate, auctionHouseCutBasisPoints)
      : [];
    for (const evaluation of evaluateWorkspaceRecipe(
      adjustedCandidate,
      auctionHouseCutBasisPoints,
      materialPlan,
    )) {
      const baseEvaluation = baseEvaluations.find((entry) => entry.route === evaluation.route);
      if (!baseEvaluation) continue;
      if (evaluation.result.expectedProfitCopper > 0n) {
        evaluated.push({
          candidate: adjustedCandidate,
          evaluation,
          baseEvaluation,
          specialization,
          directMarketEvaluation:
            directMarketEvaluations.find((entry) => entry.route === evaluation.route) ?? null,
        });
      }
    }
  }

  const matchingRecipe = filters.recipeSpellId
    ? evaluated.filter((entry) => entry.candidate.recipeSpellId === filters.recipeSpellId)
    : evaluated;
  const best = bestByRecipe(matchingRecipe);
  const matchingQuery = filterByQuery(matchingRecipe, filters.query ?? "");
  const matchingBest = filterByQuery(best, filters.query ?? "");
  const route = filters.route ?? "best";
  const forRoute =
    route === "best"
      ? matchingBest
      : matchingQuery.filter((entry) => entry.evaluation.route === route);
  const professionCounts = countByProfession(forRoute);
  const forProfession = filters.profession
    ? forRoute.filter((entry) => entry.candidate.professionSlug === filters.profession)
    : forRoute;
  const matchingQueryForProfession = filterByProfession(matchingQuery, filters.profession);
  const matchingBestForProfession = filterByProfession(matchingBest, filters.profession);
  const sorted = sortOpportunities(forProfession, filters.sort ?? "profit");
  const historyScanCount = scanCountRows[0]?.value ?? 0;
  const freshness = getMarketScanFreshness(selected.completedAt);
  const opportunities = sorted
    .slice(0, 50)
    .map((opportunity) => formatOpportunity(opportunity, freshness));

  return {
    scan: {
      market: marketValue(selected),
      region: selected.region,
      realmId: selected.realmId,
      auctionHouseType: selected.auctionHouseType,
      completedAt: selected.completedAt,
      completeness: selected.completeness,
      itemCount: selected.itemCount,
      clientBuild: selected.clientBuild,
      clientVersion: build.clientVersion,
      historyScanCount,
      freshness,
    },
    markets,
    professions: professionRows.map((profession) => ({
      ...profession,
      opportunityCount: professionCounts.get(profession.slug) ?? 0,
    })),
    routeCounts: {
      best: matchingBestForProfession.length,
      auction_house: matchingQueryForProfession.filter(
        (entry) => entry.evaluation.route === "auction_house",
      ).length,
      disenchant: matchingQueryForProfession.filter(
        (entry) => entry.evaluation.route === "disenchant",
      ).length,
      vendor: matchingQueryForProfession.filter((entry) => entry.evaluation.route === "vendor")
        .length,
    },
    specializationProfiles,
    useAltCrafting,
    opportunities,
    totalOpportunityCount: forProfession.length,
    limitation: formatLimitation(
      route,
      historyScanCount,
      specializationProfiles.some((profile) => profile.selected !== "none"),
      useAltCrafting,
      freshness,
    ),
  };
}

function createWorkspaceProductionPlanner(
  candidates: readonly WorkspaceRecipeCandidate[],
  priceLevelsByItem: ReadonlyMap<
    number,
    readonly { readonly unitPriceCopper: bigint; readonly quantity: number }[]
  >,
  product: string,
  buildNumber: number,
  specializations: CraftingSpecializationProfile,
  transformations: readonly WorkspaceTransformation[],
): ProductionPlanner {
  const recipes: ProductionRecipe[] = [];
  for (const candidate of candidates) {
    if (!isRecipeAvailableWithSpecialization(product, buildNumber, specializations, candidate)) {
      continue;
    }
    const adjusted = applySpecialization(
      candidate,
      resolveSpecialization(product, buildNumber, specializations, candidate),
    );
    const [output] = adjusted.outputs;
    if (
      adjusted.outputs.length !== 1 ||
      !output ||
      output.minimumQuantity <= 0 ||
      output.minimumQuantity !== output.maximumQuantity
    ) {
      continue;
    }
    recipes.push({
      kind: "profession",
      recipeSpellId: adjusted.recipeSpellId,
      recipeName: adjusted.recipeName,
      professionSlug: adjusted.professionSlug,
      professionName: adjusted.professionName,
      requiredSkillRank: adjusted.requiredSkillRank,
      cooldownMs: adjusted.cooldownMs,
      categoryCooldownMs: adjusted.categoryCooldownMs,
      inputs: adjusted.inputs.map((input) => ({
        itemId: input.itemId,
        quantity: input.quantity,
      })),
      outputItemId: output.itemId,
      outputName: output.name,
      guaranteedOutputQuantity: output.minimumQuantity,
    });
  }
  for (const transformation of transformations) {
    const [output] = transformation.outputs;
    if (
      transformation.inputs.length === 0 ||
      transformation.outputs.length !== 1 ||
      !output ||
      output.minimumQuantity <= 0 ||
      output.minimumQuantity !== output.maximumQuantity
    ) {
      continue;
    }
    recipes.push({
      kind: "item_use",
      recipeSpellId: transformation.spellId,
      recipeName: transformation.name,
      professionSlug: "item-conversion",
      professionName: "Item conversion",
      requiredSkillRank: 0,
      cooldownMs: transformation.cooldownMs,
      categoryCooldownMs: transformation.categoryCooldownMs,
      inputs: transformation.inputs.map((input) => ({
        itemId: input.itemId,
        quantity: input.quantity,
      })),
      outputItemId: output.itemId,
      outputName: output.name,
      guaranteedOutputQuantity: output.minimumQuantity,
    });
  }
  return createProductionPlanner({
    recipes,
    priceLevelsByItem,
  });
}

interface WorkspaceTransformation {
  readonly transformationId: number;
  readonly spellId: number;
  readonly name: string;
  readonly cooldownMs: number;
  readonly categoryCooldownMs: number;
  readonly inputs: readonly {
    readonly itemId: number;
    readonly quantity: number;
  }[];
  readonly outputs: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly minimumQuantity: number;
    readonly maximumQuantity: number;
  }[];
}

function makeWorkspaceMaterialPlan(
  plan: ReturnType<ProductionPlanner["plan"]>,
  itemDetailsById: ReadonlyMap<
    number,
    { readonly name: string; readonly iconFileDataId: number | null; readonly quality: number }
  >,
): WorkspaceMaterialPlan | undefined {
  if (!plan.viable) return undefined;
  return {
    totalCostCopper: plan.totalCostCopper,
    directPurchaseCostCopper: plan.directPurchaseCostCopper,
    savingsVsDirectPurchaseCopper: plan.savingsVsDirectPurchaseCopper,
    purchases: plan.purchases.map((purchase) => {
      const item = itemDetailsById.get(purchase.itemId);
      if (!item) throw new Error(`Missing catalog item ${purchase.itemId} in production plan`);
      return { ...purchase, ...item };
    }),
    craftSteps: plan.craftSteps,
    crossProfessionTransferCount: plan.crossProfessionTransferCount,
  };
}

function formatLimitation(
  route: WorkspaceRouteFilter,
  historyScanCount: number,
  hasSpecialization: boolean,
  useAltCrafting: boolean,
  freshness: MarketScanFreshness,
): string {
  const marketBoundary =
    historyScanCount < 6
      ? `Current one-craft quotes are available. ${historyScanCount} of 6 minimum scans collected for normal-price signals; demand, deposits, and fill probability remain unmodeled.`
      : "Current one-craft quotes use live reagent depth. Demand, deposits, and fill probability remain unmodeled until historical calibration is complete.";
  const routeBoundary =
    route === "disenchant"
      ? "Disenchant EV uses the build-locked static TBC item-level table and live material asks; your character's Enchanting skill is not imported, so verify the listed requirement. "
      : "";
  const networkBoundary = useAltCrafting
    ? " Alt-crafted materials use the cheapest deterministic non-cooldown recipe chain and current AH depth. Recipe ownership is still a profile assumption until character data is imported."
    : "";
  const specializationBoundary = hasSpecialization
    ? " Alchemy mastery results use a provisional 1.20× expected-output assumption; tailoring specialist cloth yield and recipe locks use the build-locked TBC profile."
    : "";
  const freshnessBoundary = freshness.state === "fresh" ? "" : ` ${freshness.guidance}`;
  return `${routeBoundary}${marketBoundary}${freshnessBoundary}${networkBoundary}${specializationBoundary}`;
}

function makeCandidate(
  recipe: {
    readonly recipeSpellId: number;
    readonly recipeName: string;
    readonly professionName: string;
    readonly professionSlug: string;
    readonly requiredSkillRank: number;
    readonly cooldownMs: number;
    readonly categoryCooldownMs: number;
    readonly outputKind: WorkspaceRecipeCandidate["outputKind"];
  },
  inputs: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly quantity: number;
    readonly iconFileDataId: number | null;
    readonly quality: number;
  }[],
  outputs: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly classId: number;
    readonly subclassId: number;
    readonly iconFileDataId: number | null;
    readonly quality: number;
    readonly itemLevel: number;
    readonly vendorSellPriceCopper: bigint;
    readonly minimumQuantity: number;
    readonly maximumQuantity: number;
    readonly expectedQuantityNumerator: bigint;
    readonly expectedQuantityDenominator: bigint;
  }[],
  priceLevelsByItem: ReadonlyMap<
    number,
    readonly {
      readonly unitPriceCopper: bigint;
      readonly quantity: number;
      readonly listingCount: number;
    }[]
  >,
  product: string,
  buildNumber: number,
  disenchantMaterialsByItem: ReadonlyMap<
    number,
    {
      readonly itemId: number;
      readonly name: string;
      readonly iconFileDataId: number | null;
      readonly quality: number;
    }
  >,
): WorkspaceRecipeCandidate | null {
  if (inputs.length === 0 || outputs.length === 0) return null;
  const combinedInputs = new Map<
    number,
    {
      readonly itemId: number;
      readonly name: string;
      readonly iconFileDataId: number | null;
      readonly quality: number;
      quantity: number;
    }
  >();
  for (const input of inputs) {
    const existing = combinedInputs.get(input.itemId);
    if (existing) existing.quantity += input.quantity;
    else combinedInputs.set(input.itemId, { ...input });
  }

  return {
    ...recipe,
    requiredSkillRank: getAuditedRequiredSkillRank(
      product,
      buildNumber,
      recipe.recipeSpellId,
      recipe.requiredSkillRank,
    ),
    inputs: [...combinedInputs.values()].map((input) => ({
      ...input,
      priceLevels: (priceLevelsByItem.get(input.itemId) ?? []).map((level) => ({
        unitPriceCopper: level.unitPriceCopper,
        quantity: level.quantity,
      })),
    })),
    outputs: outputs.map((output) => {
      const distribution = getDisenchantDistribution(product, buildNumber, output);
      const disenchantMaterials = distribution?.expectedMaterials.flatMap((expected) => {
        const material = disenchantMaterialsByItem.get(expected.materialItemId);
        if (!material) return [];
        return [
          {
            ...material,
            expectedQuantity: expected.expectedQuantity,
            priceLevels: priceLevelsByItem.get(material.itemId) ?? [],
          },
        ];
      });
      const disenchant =
        distribution &&
        disenchantMaterials &&
        disenchantMaterials.length === distribution.expectedMaterials.length
          ? {
              requiredEnchantingSkill: distribution.requiredEnchantingSkill,
              modelVersion: distribution.modelVersion,
              evidence: distribution.evidence,
              materials: disenchantMaterials,
            }
          : null;
      return {
        itemId: output.itemId,
        name: output.name,
        classId: output.classId,
        subclassId: output.subclassId,
        iconFileDataId: output.iconFileDataId,
        quality: output.quality,
        itemLevel: output.itemLevel,
        minimumQuantity: output.minimumQuantity,
        maximumQuantity: output.maximumQuantity,
        expectedQuantity: {
          numerator: output.expectedQuantityNumerator,
          denominator: output.expectedQuantityDenominator,
        },
        vendorSellPriceCopper: output.vendorSellPriceCopper,
        priceLevels: priceLevelsByItem.get(output.itemId) ?? [],
        disenchant,
      };
    }),
  };
}

function bestByRecipe(entries: readonly EvaluatedCandidate[]): EvaluatedCandidate[] {
  const byRecipe = new Map<number, EvaluatedCandidate>();
  for (const entry of entries) {
    const existing = byRecipe.get(entry.candidate.recipeSpellId);
    if (
      !existing ||
      entry.evaluation.result.expectedProfitCopper > existing.evaluation.result.expectedProfitCopper
    ) {
      byRecipe.set(entry.candidate.recipeSpellId, entry);
    }
  }
  return [...byRecipe.values()];
}

function filterByQuery(
  entries: readonly EvaluatedCandidate[],
  query: string,
): EvaluatedCandidate[] {
  return entries.filter(({ candidate }) => matchesProductName(candidate.outputs, query));
}

function filterByProfession(
  entries: readonly EvaluatedCandidate[],
  profession: string | undefined,
): EvaluatedCandidate[] {
  return profession
    ? entries.filter((entry) => entry.candidate.professionSlug === profession)
    : [...entries];
}

function countByProfession(entries: readonly EvaluatedCandidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const slug = entry.candidate.professionSlug;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

function sortOpportunities(
  entries: readonly EvaluatedCandidate[],
  sort: WorkspaceSort,
): EvaluatedCandidate[] {
  return [...entries].sort((left, right) => {
    const leftValue = sortValue(left, sort);
    const rightValue = sortValue(right, sort);
    return leftValue === rightValue ? 0 : leftValue > rightValue ? -1 : 1;
  });
}

function formatOpportunity(
  {
    candidate,
    evaluation,
    baseEvaluation,
    specialization,
    directMarketEvaluation,
  }: EvaluatedCandidate,
  freshness: MarketScanFreshness,
): MarketWorkspaceOpportunity {
  const result = evaluation.result;
  const baseProfitCopper = baseEvaluation.result.expectedProfitCopper;
  const specializationUpliftCopper = result.expectedProfitCopper - baseProfitCopper;
  const primaryOutput = candidate.outputs[0];
  if (!primaryOutput) throw new Error(`Recipe ${candidate.recipeSpellId} has no output`);
  return {
    recipeSpellId: candidate.recipeSpellId,
    recipeName: candidate.recipeName,
    professionName: candidate.professionName,
    professionSlug: candidate.professionSlug,
    route: evaluation.route,
    routeLabel: formatRouteLabel(evaluation.route),
    requiredSkillRank: candidate.requiredSkillRank,
    cooldownLabel: formatCooldown(candidate.cooldownMs, candidate.categoryCooldownMs),
    outputLabel: candidate.outputs.map((output) => output.name).join(" + "),
    outputIconFileDataId: primaryOutput.iconFileDataId,
    outputQuality: primaryOutput.quality,
    expectedYieldLabel: candidate.outputs
      .map((output) => `${formatFraction(output.expectedQuantity)}× ${output.name}`)
      .join(" + "),
    yieldRangeLabel: candidate.outputs
      .map((output) => `${output.minimumQuantity}–${output.maximumQuantity}`)
      .join(" + "),
    reagentCost: formatCopper(result.reagentCostCopper),
    directReagentCost:
      evaluation.directReagentCostCopper === null
        ? null
        : formatCopper(evaluation.directReagentCostCopper),
    networkSavings:
      evaluation.networkSavingsCopper !== null && evaluation.networkSavingsCopper > 0n
        ? formatCopper(evaluation.networkSavingsCopper)
        : null,
    directMarketProfit: directMarketEvaluation
      ? formatCopper(directMarketEvaluation.result.expectedProfitCopper)
      : null,
    stopEarlyWarning:
      evaluation.craftSteps.length > 0 &&
      directMarketEvaluation &&
      directMarketEvaluation.result.expectedProfitCopper <= 0n
        ? `This final craft is ${formatCopper(-directMarketEvaluation.result.expectedProfitCopper)} unprofitable when the crafted intermediates are valued at their current AH asks. Compare selling the intermediates instead of continuing the chain.`
        : null,
    usesAltCrafting: evaluation.craftSteps.length > 0,
    craftSteps: evaluation.craftSteps.map((step) => ({
      recipeSpellId: step.recipeSpellId,
      recipeName: step.recipeName,
      professionName: step.professionName,
      requiredSkillRank: step.requiredSkillRank,
      crafts: step.crafts,
      outputItemId: step.outputItemId,
      outputName: step.outputName,
      outputQuantity: step.outputQuantity,
      leftoverQuantity: step.leftoverQuantity,
    })),
    crossProfessionTransferCount: evaluation.crossProfessionTransferCount,
    netValue: formatCopper(result.expectedNetRevenueCopper),
    auctionHouseCut: formatCopper(result.expectedAuctionHouseCutCopper),
    quotedProfit: formatCopper(result.expectedProfitCopper),
    baseProfit: formatCopper(baseProfitCopper),
    specializationUplift:
      specialization && specializationUpliftCopper > 0n
        ? formatCopper(specializationUpliftCopper)
        : null,
    specializationName: specialization?.name ?? null,
    specializationModelVersion: specialization?.modelVersion ?? null,
    returnOnCapital:
      result.returnOnCapitalBasisPoints === null
        ? "n/a"
        : formatPercentBasisPoints(result.returnOnCapitalBasisPoints),
    confidenceTier:
      evaluation.route === "auction_house"
        ? "speculative"
        : evaluation.route === "disenchant"
          ? "modeled"
          : "deterministic",
    confidenceLabel: formatConfidenceLabel(evaluation, specialization, freshness),
    evidence: [
      freshness.guidance,
      evaluation.route === "disenchant"
        ? `${evaluation.evidence} Expected materials use model ${evaluation.modelVersion}; each material uses the current quantity-weighted p10 ask backed by at least three listings, after the AH cut. Listings are not confirmed sales.`
        : evaluation.route === "vendor"
          ? "Vendor value comes from the matching client build; reagent cost consumes the current AH depth."
          : "Output value uses the current quantity-weighted p10 ask backed by at least three listings. Listings are not confirmed sales.",
      evaluation.craftSteps.length > 0
        ? `Material cost uses ${evaluation.craftSteps.length} deterministic alt-crafting step${evaluation.craftSteps.length === 1 ? "" : "s"}; only the raw leaves are purchased from the AH and internal transfers pay no AH cut.`
        : undefined,
      specialization?.evidence,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" "),
    inputs: evaluation.inputs.map((input) => ({
      itemId: input.itemId,
      name: input.name,
      quantity: input.quantity,
      iconFileDataId: input.iconFileDataId,
      quality: input.quality,
      cost: formatCopper(input.costCopper),
      highestUnitPrice: formatCopper(input.highestUnitPriceCopper),
    })),
    outputs: evaluation.outputs.map((output) => ({
      itemId: output.itemId,
      name: output.name,
      iconFileDataId: output.iconFileDataId,
      quality: output.quality,
      expectedQuantity: formatFraction(output.expectedQuantity),
      unitValue: formatCopper(output.unitValueCopper),
    })),
    omittedOutputCount: evaluation.omittedOutputCount,
  };
}

function formatConfidenceLabel(
  evaluation: WorkspaceRouteEvaluation,
  specialization: AppliedSpecialization | null,
  freshness: MarketScanFreshness,
): string {
  const stalePrefix = freshness.state === "stale" ? "Stale · " : "";
  const specializationSuffix =
    specialization?.effectKind === "provisional_yield"
      ? " · provisional mastery"
      : specialization?.effectKind === "guaranteed_yield"
        ? " · specialist yield"
        : specialization
          ? " · specialist recipe"
          : "";
  if (evaluation.route === "disenchant") {
    return `${stalePrefix}Modeled EV · Enchanting ${evaluation.requiredEnchantingSkill}${specializationSuffix}`;
  }
  if (evaluation.route === "vendor") {
    return `${stalePrefix}Deterministic exit${specializationSuffix}`;
  }
  return `${stalePrefix}Speculative ask${specializationSuffix}`;
}

function formatRouteLabel(route: RealizationRoute): string {
  if (route === "auction_house") return "Auction House";
  if (route === "disenchant") return "Disenchant";
  return "Vendor";
}

function sortValue(entry: EvaluatedCandidate, sort: WorkspaceSort): bigint {
  if (sort === "roi") return entry.evaluation.result.returnOnCapitalBasisPoints ?? -1n;
  if (sort === "specialization-uplift") {
    return (
      entry.evaluation.result.expectedProfitCopper -
      entry.baseEvaluation.result.expectedProfitCopper
    );
  }
  return entry.evaluation.result.expectedProfitCopper;
}

function formatFraction(fraction: {
  readonly numerator: bigint;
  readonly denominator: bigint;
}): string {
  if (fraction.denominator <= 0n) throw new RangeError("Fraction denominator must be positive");
  if (fraction.numerator % fraction.denominator === 0n) {
    return (fraction.numerator / fraction.denominator).toString();
  }
  return (Number(fraction.numerator) / Number(fraction.denominator))
    .toFixed(3)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function formatCooldown(directMs: number, categoryMs: number): string | null {
  const milliseconds = Math.max(directMs, categoryMs);
  if (milliseconds <= 0) return null;
  const hours = milliseconds / 3_600_000;
  return hours >= 1 ? `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h cooldown` : "Cooldown";
}

function uniqueMarkets(
  scans: readonly {
    readonly region: string;
    readonly realmId: string;
    readonly auctionHouseType: string;
    readonly completedAt: Date;
  }[],
): { readonly value: string; readonly label: string; readonly completedAt: Date }[] {
  const unique = new Map<string, { value: string; label: string; completedAt: Date }>();
  for (const scan of scans) {
    const value = marketValue(scan);
    if (!unique.has(value)) {
      unique.set(value, {
        value,
        label: `${scan.region} · ${scan.realmId} · ${capitalize(scan.auctionHouseType)}`,
        completedAt: scan.completedAt,
      });
    }
  }
  return [...unique.values()];
}

function marketValue(value: {
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: string;
}): string {
  return `${value.region}|${value.realmId}|${value.auctionHouseType}`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

function groupBy<T, K>(rows: readonly T[], selectKey: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = selectKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function emptyWorkspace(
  markets: MarketWorkspaceData["markets"],
  limitation: string,
): MarketWorkspaceData {
  return {
    scan: null,
    markets,
    professions: [],
    routeCounts: { best: 0, auction_house: 0, disenchant: 0, vendor: 0 },
    specializationProfiles: [],
    useAltCrafting: false,
    opportunities: [],
    totalOpportunityCount: 0,
    limitation,
  };
}
