import { calculateCraftingOpportunity } from "@wow-trader/economics";
import {
  auctionPriceLevels,
  gameClassVersions,
  gameBuilds,
  gameRaceVersions,
  gemPropertyVersions,
  itemClassVersions,
  itemDamages,
  itemEffects,
  itemEnchantmentEffects,
  itemEnchantments,
  itemLimitCategoryVersions,
  itemResistances,
  itemSetEffects,
  itemSetMembers,
  itemSets,
  itemSockets,
  itemStats,
  itemSubclassVersions,
  itemVersions,
  marketScans,
  professions,
  professionVersions,
  rawUploads,
  recipeInputs,
  recipeOutputs,
  recipeTeachingItems,
  recipeVersions,
  spellVersions,
  transformationInputs,
  transformationOutputs,
  transformationVersions,
  type WowTraderDatabase,
} from "@wow-trader/db";
import { forecastPrice, summarizeOrderBook, type PriceForecast } from "@wow-trader/market";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { formatCopper, formatPercentBasisPoints } from "./format";
import { getDatabase } from "./database";
import { TBC_CLIENT_PRODUCT } from "./game-versions";
import {
  buildProductionChain,
  type ProductionMaterialNode,
  type ProductionMethodSource,
} from "./production-chain";

export interface DashboardData {
  readonly build: {
    readonly product: string;
    readonly version: string;
    readonly buildNumber: number;
    readonly publishedAt: Date | null;
    readonly hotfixStatus: string;
  } | null;
  readonly counts: {
    readonly items: number;
    readonly recipes: number;
    readonly professions: number;
  };
  readonly market: {
    readonly region: string;
    readonly realmId: string;
    readonly auctionHouseType: string;
    readonly completedAt: Date;
    readonly completeness: number;
    readonly itemCount: number;
  } | null;
}

export interface CatalogSearchItem {
  readonly itemId: number;
  readonly name: string;
  readonly quality: number;
  readonly classId: number;
}

export interface SitemapCatalogData {
  readonly publishedAt: Date;
  readonly itemIds: readonly number[];
  readonly recipeSpellIds: readonly number[];
  readonly professionSlugs: readonly string[];
  readonly markets: readonly {
    readonly region: string;
    readonly realmId: string;
  }[];
}

export interface RecipeDetail {
  readonly recipeSpellId: number;
  readonly name: string;
  readonly profession: { readonly name: string; readonly slug: string };
  readonly requiredSkillRank: number;
  readonly craftTimeMs: number;
  readonly cooldownMs: number;
  readonly cooldownCategoryId: number | null;
  readonly categoryCooldownMs: number;
  readonly outputKind: string;
  readonly extractionStatus: string;
  readonly build: { readonly version: string; readonly number: number };
  readonly inputs: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly quantity: number;
    readonly optional: boolean;
    readonly iconFileDataId: number | null;
    readonly quality: number;
  }[];
  readonly outputs: readonly {
    readonly itemId: number | null;
    readonly itemName: string | null;
    readonly enchantmentId: number | null;
    readonly minimumQuantity: number;
    readonly maximumQuantity: number;
    readonly expectedNumerator: bigint;
    readonly expectedDenominator: bigint;
    readonly iconFileDataId: number | null;
    readonly quality: number | null;
  }[];
  readonly teachingItems: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly iconFileDataId: number | null;
    readonly quality: number;
  }[];
  readonly productionChain: readonly ProductionMaterialNode[];
}

export interface ItemDetail {
  readonly itemId: number;
  readonly name: string;
  readonly description: string;
  readonly iconFileDataId: number | null;
  readonly quality: number;
  readonly classId: number;
  readonly subclassId: number;
  readonly requiredLevel: number;
  readonly itemLevel: number;
  readonly requiredSkillId: number | null;
  readonly requiredSkillRank: number;
  readonly stackSize: number;
  readonly binding: number;
  readonly inventoryType: number;
  readonly allowableClassMask: number;
  readonly allowableRaceMask: readonly number[];
  readonly maxCount: number;
  readonly maxDurability: number;
  readonly delayMs: number;
  readonly damageType: number;
  readonly itemSetId: number | null;
  readonly requiredAbilityId: number | null;
  readonly requiredAbilityName: string | null;
  readonly minimumFactionId: number | null;
  readonly minimumReputation: number;
  readonly buyPriceCopper: bigint;
  readonly sellPriceCopper: bigint;
  readonly className: string | null;
  readonly subclassName: string | null;
  readonly gameClasses: readonly { readonly classId: number; readonly name: string }[];
  readonly allowedClasses: readonly { readonly classId: number; readonly name: string }[];
  readonly allowedRaces: readonly { readonly raceId: number; readonly name: string }[];
  readonly stats: readonly {
    readonly slot: number;
    readonly statType: number;
    readonly value: number;
  }[];
  readonly damages: readonly {
    readonly slot: number;
    readonly damageType: number;
    readonly minimum: number;
    readonly maximum: number;
  }[];
  readonly resistances: readonly { readonly school: number; readonly value: number }[];
  readonly sockets: readonly { readonly slot: number; readonly socketType: number }[];
  readonly effects: readonly ItemSpellEffect[];
  readonly itemSet: {
    readonly itemSetId: number;
    readonly name: string;
    readonly members: readonly {
      readonly itemId: number;
      readonly name: string;
      readonly quality: number;
    }[];
    readonly effects: readonly (ItemSpellEffect & { readonly threshold: number })[];
  } | null;
  readonly limitCategory: {
    readonly name: string;
    readonly quantity: number;
  } | null;
  readonly gem: {
    readonly socketType: number;
    readonly minimumItemLevel: number;
    readonly enchantment: ItemEnchantmentDetail;
  } | null;
  readonly socketBonus: ItemEnchantmentDetail | null;
  readonly build: { readonly version: string; readonly number: number };
  readonly consumedBy: readonly {
    readonly recipeSpellId: number;
    readonly name: string;
    readonly quantity: number;
  }[];
  readonly producedBy: readonly { readonly recipeSpellId: number; readonly name: string }[];
  readonly teaches: readonly { readonly recipeSpellId: number; readonly name: string }[];
  readonly market: ItemMarketData | null;
}

export interface ItemSpellEffect {
  readonly spellId: number;
  readonly name: string;
  readonly description: string;
  readonly auraDescription: string;
  readonly triggerType: number;
  readonly charges: number;
  readonly cooldownMs: number;
  readonly categoryCooldownMs: number;
  readonly procChance: number | null;
  readonly procCharges: number | null;
  readonly procCooldownMs: number | null;
  readonly durationMs: number;
  readonly descriptionVariables: string;
  readonly rawRecord: unknown;
}

export interface ItemEnchantmentDetail {
  readonly enchantmentId: number;
  readonly name: string;
  readonly effects: readonly {
    readonly slot: number;
    readonly effectType: number;
    readonly minimumPoints: number;
    readonly maximumPoints: number;
    readonly argument: number;
  }[];
}

export interface ItemMarketData {
  readonly marketKey: string;
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: string;
  readonly latestAt: Date;
  readonly current: {
    readonly minimumPriceCopper: bigint;
    readonly weightedMedianPriceCopper: bigint;
    readonly availableQuantity: number;
    readonly listingCount: number;
    readonly quantityWithinFivePercent: number;
  };
  readonly forecast: PriceForecast;
  readonly history: readonly {
    readonly observedAt: Date;
    readonly minimumPriceCopper: bigint;
    readonly weightedMedianPriceCopper: bigint;
    readonly availableQuantity: number;
  }[];
}

export interface ProfessionDetail {
  readonly skillLineId: number;
  readonly name: string;
  readonly slug: string;
  readonly build: { readonly version: string; readonly number: number };
  readonly recipes: readonly {
    readonly spellId: number;
    readonly name: string;
    readonly requiredSkillRank: number;
    readonly outputKind: string;
    readonly extractionStatus: string;
  }[];
}

export interface MarketOpportunity {
  readonly recipeSpellId: number;
  readonly recipeName: string;
  readonly professionName: string;
  readonly expectedProfit: string;
  readonly reagentCost: string;
  readonly expectedNetRevenue: string;
  readonly returnOnCapital: string;
}

export interface OpportunityData {
  readonly scan: {
    readonly region: string;
    readonly realmId: string;
    readonly auctionHouseType: string;
    readonly completedAt: Date;
    readonly completeness: number;
    readonly clientBuild: number;
  } | null;
  readonly opportunities: readonly MarketOpportunity[];
  readonly limitation: string;
}

export interface MarketOverview {
  readonly scan: {
    readonly region: string;
    readonly realmId: string;
    readonly auctionHouseType: string;
    readonly clientBuild: number;
    readonly completedAt: Date;
    readonly completeness: number;
    readonly itemCount: number;
  };
  readonly rows: readonly {
    readonly itemId: number;
    readonly itemName: string;
    readonly marketKey: string;
    readonly minimumPriceCopper: bigint;
    readonly availableQuantity: number;
    readonly listingCount: number;
  }[];
}

export async function getDashboardData(
  clientProduct: string = TBC_CLIENT_PRODUCT,
): Promise<DashboardData> {
  const database = getDatabase();
  const build = await getLatestBuild(database, undefined, clientProduct);
  const [latestScan] = await database
    .select({
      region: marketScans.region,
      realmId: marketScans.realmId,
      auctionHouseType: marketScans.auctionHouseType,
      completedAt: marketScans.completedAt,
      completeness: marketScans.completeness,
      itemCount: marketScans.itemCount,
    })
    .from(marketScans)
    .where(scanProductCondition(database, clientProduct))
    .orderBy(desc(marketScans.completedAt))
    .limit(1);

  if (!build) {
    return {
      build: null,
      counts: { items: 0, recipes: 0, professions: 0 },
      market: latestScan ?? null,
    };
  }

  const [[itemCount], [recipeCount], [professionCount]] = await Promise.all([
    database
      .select({ value: count() })
      .from(itemVersions)
      .where(eq(itemVersions.buildId, build.id)),
    database
      .select({ value: count() })
      .from(recipeVersions)
      .where(eq(recipeVersions.buildId, build.id)),
    database
      .select({ value: count() })
      .from(professionVersions)
      .where(eq(professionVersions.buildId, build.id)),
  ]);

  return {
    build: {
      product: build.product,
      version: build.clientVersion,
      buildNumber: build.buildNumber,
      publishedAt: build.publishedAt,
      hotfixStatus: build.hotfixStatus,
    },
    counts: {
      items: itemCount?.value ?? 0,
      recipes: recipeCount?.value ?? 0,
      professions: professionCount?.value ?? 0,
    },
    market: latestScan ?? null,
  };
}

export async function getSitemapCatalogData(
  clientProduct: string = TBC_CLIENT_PRODUCT,
): Promise<SitemapCatalogData | null> {
  const database = getDatabase();
  const build = await getLatestBuild(database, undefined, clientProduct);
  if (!build) return null;

  const [itemRows, recipeRows, professionRows, marketRows] = await Promise.all([
    database
      .select({ itemId: itemVersions.itemId })
      .from(itemVersions)
      .where(eq(itemVersions.buildId, build.id)),
    database
      .select({ spellId: recipeVersions.recipeSpellId })
      .from(recipeVersions)
      .where(eq(recipeVersions.buildId, build.id)),
    database
      .select({ slug: professions.slug })
      .from(professionVersions)
      .innerJoin(professions, eq(professions.skillLineId, professionVersions.skillLineId))
      .where(eq(professionVersions.buildId, build.id)),
    database
      .selectDistinct({ region: marketScans.region, realmId: marketScans.realmId })
      .from(marketScans)
      .where(scanProductCondition(database, clientProduct)),
  ]);

  return {
    publishedAt: build.publishedAt ?? build.createdAt,
    itemIds: itemRows.map(({ itemId }) => itemId),
    recipeSpellIds: recipeRows.map(({ spellId }) => spellId),
    professionSlugs: professionRows.map(({ slug }) => slug),
    markets: marketRows,
  };
}

export async function searchCatalog(
  query: string,
  clientProduct: string = TBC_CLIENT_PRODUCT,
): Promise<readonly CatalogSearchItem[]> {
  if (query.trim().length < 2) return [];
  const database = getDatabase();
  const build = await getLatestBuild(database, undefined, clientProduct);
  if (!build) return [];
  const escapedQuery = query.trim().replaceAll("%", "\\%").replaceAll("_", "\\_");

  return database
    .select({
      itemId: itemVersions.itemId,
      name: itemVersions.name,
      quality: itemVersions.quality,
      classId: itemVersions.classId,
    })
    .from(itemVersions)
    .where(
      and(
        eq(itemVersions.buildId, build.id),
        or(
          ilike(itemVersions.name, `%${escapedQuery}%`),
          eq(itemVersions.itemId, numericId(query)),
        ),
      ),
    )
    .orderBy(itemVersions.name)
    .limit(40);
}

export async function getRecipeDetail(
  recipeSpellId: number,
  clientProduct: string = TBC_CLIENT_PRODUCT,
): Promise<RecipeDetail | null> {
  const database = getDatabase();
  const build = await getLatestBuild(database, undefined, clientProduct);
  if (!build) return null;
  const [recipe] = await database
    .select({
      recipeSpellId: recipeVersions.recipeSpellId,
      name: spellVersions.name,
      professionName: professionVersions.name,
      professionSlug: professions.slug,
      requiredSkillRank: recipeVersions.requiredSkillRank,
      craftTimeMs: recipeVersions.craftTimeMs,
      cooldownMs: recipeVersions.cooldownMs,
      cooldownCategoryId: recipeVersions.cooldownCategoryId,
      categoryCooldownMs: recipeVersions.categoryCooldownMs,
      outputKind: recipeVersions.outputKind,
      extractionStatus: recipeVersions.extractionStatus,
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
    .innerJoin(professions, eq(professions.skillLineId, professionVersions.skillLineId))
    .where(
      and(eq(recipeVersions.buildId, build.id), eq(recipeVersions.recipeSpellId, recipeSpellId)),
    )
    .limit(1);
  if (!recipe) return null;

  const [inputs, outputs, teachingItems] = await Promise.all([
    database
      .select({
        itemId: recipeInputs.reagentItemId,
        name: itemVersions.name,
        quantity: recipeInputs.quantity,
        optional: recipeInputs.optional,
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
      .where(and(eq(recipeInputs.buildId, build.id), eq(recipeInputs.recipeSpellId, recipeSpellId)))
      .orderBy(recipeInputs.slot),
    database
      .select({
        itemId: recipeOutputs.outputItemId,
        itemName: itemVersions.name,
        enchantmentId: recipeOutputs.enchantmentId,
        minimumQuantity: recipeOutputs.minimumQuantity,
        maximumQuantity: recipeOutputs.maximumQuantity,
        expectedNumerator: recipeOutputs.expectedQuantityNumerator,
        expectedDenominator: recipeOutputs.expectedQuantityDenominator,
        iconFileDataId: itemVersions.iconFileDataId,
        quality: itemVersions.quality,
      })
      .from(recipeOutputs)
      .leftJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, recipeOutputs.buildId),
          eq(itemVersions.itemId, recipeOutputs.outputItemId),
        ),
      )
      .where(
        and(eq(recipeOutputs.buildId, build.id), eq(recipeOutputs.recipeSpellId, recipeSpellId)),
      )
      .orderBy(recipeOutputs.slot),
    database
      .select({
        itemId: recipeTeachingItems.teachingItemId,
        name: itemVersions.name,
        iconFileDataId: itemVersions.iconFileDataId,
        quality: itemVersions.quality,
      })
      .from(recipeTeachingItems)
      .innerJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, recipeTeachingItems.buildId),
          eq(itemVersions.itemId, recipeTeachingItems.teachingItemId),
        ),
      )
      .where(
        and(
          eq(recipeTeachingItems.buildId, build.id),
          eq(recipeTeachingItems.recipeSpellId, recipeSpellId),
        ),
      ),
  ]);
  const productionMethods = await getProductionMethods(database, build.id);

  return {
    recipeSpellId,
    name: recipe.name,
    profession: { name: recipe.professionName, slug: recipe.professionSlug },
    requiredSkillRank: recipe.requiredSkillRank,
    craftTimeMs: recipe.craftTimeMs,
    cooldownMs: recipe.cooldownMs,
    cooldownCategoryId: recipe.cooldownCategoryId,
    categoryCooldownMs: recipe.categoryCooldownMs,
    outputKind: recipe.outputKind,
    extractionStatus: recipe.extractionStatus,
    build: { version: build.clientVersion, number: build.buildNumber },
    inputs,
    outputs,
    teachingItems,
    productionChain: buildProductionChain(inputs, productionMethods),
  };
}

async function getProductionMethods(
  database: WowTraderDatabase,
  buildId: string,
): Promise<readonly ProductionMethodSource[]> {
  const [recipeMethodRows, recipeInputRows, transformationMethodRows, transformationInputRows] =
    await Promise.all([
      database
        .select({
          recipeSpellId: recipeVersions.recipeSpellId,
          name: spellVersions.name,
          professionName: professionVersions.name,
          professionSlug: professions.slug,
          requiredSkillRank: recipeVersions.requiredSkillRank,
          cooldownMs: recipeVersions.cooldownMs,
          categoryCooldownMs: recipeVersions.categoryCooldownMs,
          outputItemId: recipeOutputs.outputItemId,
          outputName: itemVersions.name,
          outputIconFileDataId: itemVersions.iconFileDataId,
          outputQuality: itemVersions.quality,
          minimumQuantity: recipeOutputs.minimumQuantity,
          maximumQuantity: recipeOutputs.maximumQuantity,
        })
        .from(recipeOutputs)
        .innerJoin(
          recipeVersions,
          and(
            eq(recipeVersions.buildId, recipeOutputs.buildId),
            eq(recipeVersions.recipeSpellId, recipeOutputs.recipeSpellId),
          ),
        )
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
        .innerJoin(
          itemVersions,
          and(
            eq(itemVersions.buildId, recipeOutputs.buildId),
            eq(itemVersions.itemId, recipeOutputs.outputItemId),
          ),
        )
        .where(eq(recipeOutputs.buildId, buildId)),
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
        .where(eq(recipeInputs.buildId, buildId)),
      database
        .select({
          transformationId: transformationVersions.transformationId,
          spellId: transformationVersions.spellId,
          name: spellVersions.name,
          cooldownMs: transformationVersions.cooldownMs,
          categoryCooldownMs: transformationVersions.categoryCooldownMs,
          outputItemId: transformationOutputs.itemId,
          outputName: itemVersions.name,
          outputIconFileDataId: itemVersions.iconFileDataId,
          outputQuality: itemVersions.quality,
          minimumQuantity: transformationOutputs.minimumQuantity,
          maximumQuantity: transformationOutputs.maximumQuantity,
        })
        .from(transformationOutputs)
        .innerJoin(
          transformationVersions,
          and(
            eq(transformationVersions.buildId, transformationOutputs.buildId),
            eq(transformationVersions.transformationId, transformationOutputs.transformationId),
          ),
        )
        .innerJoin(
          spellVersions,
          and(
            eq(spellVersions.buildId, transformationVersions.buildId),
            eq(spellVersions.spellId, transformationVersions.spellId),
          ),
        )
        .innerJoin(
          itemVersions,
          and(
            eq(itemVersions.buildId, transformationOutputs.buildId),
            eq(itemVersions.itemId, transformationOutputs.itemId),
          ),
        )
        .where(eq(transformationOutputs.buildId, buildId)),
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
        .where(eq(transformationInputs.buildId, buildId)),
    ]);

  const recipeInputsBySpellId = groupBy(recipeInputRows, (row) => row.recipeSpellId);
  const transformationInputsById = groupBy(transformationInputRows, (row) => row.transformationId);
  return [
    ...recipeMethodRows.flatMap((row): readonly ProductionMethodSource[] =>
      row.outputItemId === null
        ? []
        : [
            {
              methodId: `recipe:${row.recipeSpellId}:${row.outputItemId}`,
              spellId: row.recipeSpellId,
              kind: "profession",
              name: row.name,
              profession: { name: row.professionName, slug: row.professionSlug },
              requiredSkillRank: row.requiredSkillRank,
              cooldownMs: row.cooldownMs,
              categoryCooldownMs: row.categoryCooldownMs,
              output: {
                itemId: row.outputItemId,
                name: row.outputName,
                iconFileDataId: row.outputIconFileDataId,
                quality: row.outputQuality,
                minimumQuantity: row.minimumQuantity,
                maximumQuantity: row.maximumQuantity,
              },
              inputs: recipeInputsBySpellId.get(row.recipeSpellId) ?? [],
            },
          ],
    ),
    ...transformationMethodRows.map((row): ProductionMethodSource => ({
      methodId: `transformation:${row.transformationId}:${row.outputItemId}`,
      spellId: row.spellId,
      kind: "item_use",
      name: row.name,
      profession: null,
      requiredSkillRank: 0,
      cooldownMs: row.cooldownMs,
      categoryCooldownMs: row.categoryCooldownMs,
      output: {
        itemId: row.outputItemId,
        name: row.outputName,
        iconFileDataId: row.outputIconFileDataId,
        quality: row.outputQuality,
        minimumQuantity: row.minimumQuantity,
        maximumQuantity: row.maximumQuantity,
      },
      inputs: transformationInputsById.get(row.transformationId) ?? [],
    })),
  ];
}

export async function getItemDetail(
  itemId: number,
  clientProduct: string = TBC_CLIENT_PRODUCT,
): Promise<ItemDetail | null> {
  const database = getDatabase();
  const build = await getLatestBuild(database, undefined, clientProduct);
  if (!build) return null;
  const [item] = await database
    .select()
    .from(itemVersions)
    .where(and(eq(itemVersions.buildId, build.id), eq(itemVersions.itemId, itemId)))
    .limit(1);
  if (!item) return null;

  const [
    consumedBy,
    producedBy,
    teaches,
    market,
    stats,
    damages,
    resistances,
    sockets,
    effects,
    itemClass,
    itemSubclass,
    gameClasses,
    gameRaces,
    limitCategories,
    requiredAbilities,
  ] = await Promise.all([
    database
      .select({
        recipeSpellId: recipeInputs.recipeSpellId,
        name: spellVersions.name,
        quantity: recipeInputs.quantity,
      })
      .from(recipeInputs)
      .innerJoin(
        spellVersions,
        and(
          eq(spellVersions.buildId, recipeInputs.buildId),
          eq(spellVersions.spellId, recipeInputs.recipeSpellId),
        ),
      )
      .where(and(eq(recipeInputs.buildId, build.id), eq(recipeInputs.reagentItemId, itemId)))
      .orderBy(spellVersions.name),
    database
      .select({ recipeSpellId: recipeOutputs.recipeSpellId, name: spellVersions.name })
      .from(recipeOutputs)
      .innerJoin(
        spellVersions,
        and(
          eq(spellVersions.buildId, recipeOutputs.buildId),
          eq(spellVersions.spellId, recipeOutputs.recipeSpellId),
        ),
      )
      .where(and(eq(recipeOutputs.buildId, build.id), eq(recipeOutputs.outputItemId, itemId)))
      .orderBy(spellVersions.name),
    database
      .select({ recipeSpellId: recipeTeachingItems.recipeSpellId, name: spellVersions.name })
      .from(recipeTeachingItems)
      .innerJoin(
        spellVersions,
        and(
          eq(spellVersions.buildId, recipeTeachingItems.buildId),
          eq(spellVersions.spellId, recipeTeachingItems.recipeSpellId),
        ),
      )
      .where(
        and(
          eq(recipeTeachingItems.buildId, build.id),
          eq(recipeTeachingItems.teachingItemId, itemId),
        ),
      )
      .orderBy(spellVersions.name),
    getItemMarketData(database, itemId, clientProduct),
    database
      .select({ slot: itemStats.slot, statType: itemStats.statType, value: itemStats.value })
      .from(itemStats)
      .where(and(eq(itemStats.buildId, build.id), eq(itemStats.itemId, itemId)))
      .orderBy(itemStats.slot),
    database
      .select({
        slot: itemDamages.slot,
        damageType: itemDamages.damageType,
        minimum: itemDamages.minimum,
        maximum: itemDamages.maximum,
      })
      .from(itemDamages)
      .where(and(eq(itemDamages.buildId, build.id), eq(itemDamages.itemId, itemId)))
      .orderBy(itemDamages.slot),
    database
      .select({ school: itemResistances.school, value: itemResistances.value })
      .from(itemResistances)
      .where(and(eq(itemResistances.buildId, build.id), eq(itemResistances.itemId, itemId)))
      .orderBy(itemResistances.school),
    database
      .select({ slot: itemSockets.slot, socketType: itemSockets.socketType })
      .from(itemSockets)
      .where(and(eq(itemSockets.buildId, build.id), eq(itemSockets.itemId, itemId)))
      .orderBy(itemSockets.slot),
    database
      .select({
        spellId: itemEffects.spellId,
        name: spellVersions.name,
        description: spellVersions.description,
        auraDescription: spellVersions.auraDescription,
        triggerType: itemEffects.triggerType,
        charges: itemEffects.charges,
        cooldownMs: itemEffects.cooldownMs,
        categoryCooldownMs: itemEffects.categoryCooldownMs,
        procChance: spellVersions.procChance,
        procCharges: spellVersions.procCharges,
        procCooldownMs: spellVersions.procCooldownMs,
        durationMs: spellVersions.durationMs,
        descriptionVariables: spellVersions.descriptionVariables,
        rawRecord: spellVersions.rawRecord,
      })
      .from(itemEffects)
      .innerJoin(
        spellVersions,
        and(
          eq(spellVersions.buildId, itemEffects.buildId),
          eq(spellVersions.spellId, itemEffects.spellId),
        ),
      )
      .where(and(eq(itemEffects.buildId, build.id), eq(itemEffects.itemId, itemId)))
      .orderBy(itemEffects.slot, itemEffects.itemEffectId),
    database
      .select({ name: itemClassVersions.name })
      .from(itemClassVersions)
      .where(
        and(eq(itemClassVersions.buildId, build.id), eq(itemClassVersions.classId, item.classId)),
      )
      .limit(1),
    database
      .select({ name: itemSubclassVersions.name, verboseName: itemSubclassVersions.verboseName })
      .from(itemSubclassVersions)
      .where(
        and(
          eq(itemSubclassVersions.buildId, build.id),
          eq(itemSubclassVersions.classId, item.classId),
          eq(itemSubclassVersions.subclassId, item.subclassId),
        ),
      )
      .limit(1),
    database
      .select({ classId: gameClassVersions.classId, name: gameClassVersions.name })
      .from(gameClassVersions)
      .where(eq(gameClassVersions.buildId, build.id))
      .orderBy(gameClassVersions.classId),
    database
      .select({ raceId: gameRaceVersions.raceId, name: gameRaceVersions.name })
      .from(gameRaceVersions)
      .where(eq(gameRaceVersions.buildId, build.id))
      .orderBy(gameRaceVersions.raceId),
    item.limitCategoryId === null
      ? Promise.resolve([])
      : database
          .select({
            name: itemLimitCategoryVersions.name,
            quantity: itemLimitCategoryVersions.quantity,
          })
          .from(itemLimitCategoryVersions)
          .where(
            and(
              eq(itemLimitCategoryVersions.buildId, build.id),
              eq(itemLimitCategoryVersions.limitCategoryId, item.limitCategoryId),
            ),
          )
          .limit(1),
    item.requiredAbilityId === null
      ? Promise.resolve([])
      : database
          .select({ name: spellVersions.name })
          .from(spellVersions)
          .where(
            and(
              eq(spellVersions.buildId, build.id),
              eq(spellVersions.spellId, item.requiredAbilityId),
            ),
          )
          .limit(1),
  ]);

  const [itemSet, gem, socketBonus] = await Promise.all([
    getItemSetDetail(database, build.id, item.itemSetId),
    getGemDetail(database, build.id, item.gemPropertiesId),
    getItemEnchantmentDetail(database, build.id, item.socketBonusEnchantmentId),
  ]);

  return {
    itemId,
    name: item.name,
    description: item.description,
    iconFileDataId: item.iconFileDataId,
    quality: item.quality,
    classId: item.classId,
    subclassId: item.subclassId,
    requiredLevel: item.requiredLevel,
    itemLevel: item.itemLevel,
    requiredSkillId: item.requiredSkillId,
    requiredSkillRank: item.requiredSkillRank,
    stackSize: item.stackSize,
    binding: item.binding,
    inventoryType: item.inventoryType,
    allowableClassMask: item.allowableClassMask,
    allowableRaceMask: item.allowableRaceMask,
    maxCount: item.maxCount,
    maxDurability: item.maxDurability,
    delayMs: item.delayMs,
    damageType: item.damageType,
    itemSetId: item.itemSetId,
    requiredAbilityId: item.requiredAbilityId,
    requiredAbilityName: requiredAbilities[0]?.name ?? null,
    minimumFactionId: item.minimumFactionId,
    minimumReputation: item.minimumReputation,
    buyPriceCopper: item.buyPriceCopper,
    sellPriceCopper: item.sellPriceCopper,
    className: itemClass[0]?.name ?? null,
    subclassName: itemSubclass[0]?.verboseName || itemSubclass[0]?.name || null,
    gameClasses,
    allowedClasses: gameClasses.filter((gameClass) =>
      includesMaskValue(item.allowableClassMask, gameClass.classId),
    ),
    allowedRaces: gameRaces.filter((race) =>
      includesSplitMaskValue(item.allowableRaceMask, race.raceId),
    ),
    stats,
    damages,
    resistances,
    sockets,
    effects,
    itemSet,
    limitCategory: limitCategories[0] ?? null,
    gem,
    socketBonus,
    build: { version: build.clientVersion, number: build.buildNumber },
    consumedBy,
    producedBy,
    teaches,
    market,
  };
}

export async function getMarketOverview(
  region: string,
  realmId: string,
  clientProduct: string = TBC_CLIENT_PRODUCT,
): Promise<MarketOverview | null> {
  const database = getDatabase();
  const [scan] = await database
    .select()
    .from(marketScans)
    .where(
      and(
        eq(marketScans.region, region),
        eq(marketScans.realmId, realmId),
        scanProductCondition(database, clientProduct),
      ),
    )
    .orderBy(desc(marketScans.completedAt))
    .limit(1);
  if (!scan) return null;

  const build = await getLatestBuild(database, scan.clientBuild, clientProduct);
  if (!build) return { scan, rows: [] };

  const minimumPrice = sql<string>`min(${auctionPriceLevels.unitPriceCopper})::text`;
  const availableQuantity = sql<string>`sum(${auctionPriceLevels.quantity})::text`;
  const listingCount = sql<string>`sum(${auctionPriceLevels.listingCount})::text`;
  const aggregateRows = await database
    .select({
      itemId: auctionPriceLevels.itemId,
      itemName: itemVersions.name,
      marketKey: auctionPriceLevels.marketKey,
      minimumPrice,
      availableQuantity,
      listingCount,
    })
    .from(auctionPriceLevels)
    .innerJoin(
      itemVersions,
      and(eq(itemVersions.buildId, build.id), eq(itemVersions.itemId, auctionPriceLevels.itemId)),
    )
    .where(eq(auctionPriceLevels.scanId, scan.scanId))
    .groupBy(auctionPriceLevels.itemId, auctionPriceLevels.marketKey, itemVersions.name)
    .orderBy(desc(sql`sum(${auctionPriceLevels.quantity})`))
    .limit(250);

  return {
    scan,
    rows: aggregateRows.map((row) => ({
      itemId: row.itemId,
      itemName: row.itemName,
      marketKey: row.marketKey,
      minimumPriceCopper: BigInt(row.minimumPrice),
      availableQuantity: parseSafeCount(row.availableQuantity, "available quantity"),
      listingCount: parseSafeCount(row.listingCount, "listing count"),
    })),
  };
}

export async function getProfessionDetail(
  slug: string,
  clientProduct: string = TBC_CLIENT_PRODUCT,
): Promise<ProfessionDetail | null> {
  const database = getDatabase();
  const build = await getLatestBuild(database, undefined, clientProduct);
  if (!build) return null;
  const [profession] = await database
    .select({
      skillLineId: professions.skillLineId,
      slug: professions.slug,
      name: professionVersions.name,
    })
    .from(professions)
    .innerJoin(
      professionVersions,
      and(
        eq(professionVersions.skillLineId, professions.skillLineId),
        eq(professionVersions.buildId, build.id),
      ),
    )
    .where(eq(professions.slug, slug))
    .limit(1);
  if (!profession) return null;

  const recipeRows = await database
    .select({
      spellId: recipeVersions.recipeSpellId,
      name: spellVersions.name,
      requiredSkillRank: recipeVersions.requiredSkillRank,
      outputKind: recipeVersions.outputKind,
      extractionStatus: recipeVersions.extractionStatus,
    })
    .from(recipeVersions)
    .innerJoin(
      spellVersions,
      and(
        eq(spellVersions.buildId, recipeVersions.buildId),
        eq(spellVersions.spellId, recipeVersions.recipeSpellId),
      ),
    )
    .where(
      and(
        eq(recipeVersions.buildId, build.id),
        eq(recipeVersions.professionSkillLineId, profession.skillLineId),
      ),
    )
    .orderBy(recipeVersions.requiredSkillRank, spellVersions.name);

  return {
    ...profession,
    build: { version: build.clientVersion, number: build.buildNumber },
    recipes: recipeRows,
  };
}

export async function getOpportunities(
  region?: string,
  realmId?: string,
  clientProduct: string = TBC_CLIENT_PRODUCT,
): Promise<OpportunityData> {
  const database = getDatabase();
  const scanCondition =
    region && realmId
      ? and(eq(marketScans.region, region), eq(marketScans.realmId, realmId))
      : region
        ? eq(marketScans.region, region)
        : undefined;
  const [scan] = await database
    .select()
    .from(marketScans)
    .where(and(scanCondition, scanProductCondition(database, clientProduct)))
    .orderBy(desc(marketScans.completedAt))
    .limit(1);
  if (!scan) {
    return {
      scan: null,
      opportunities: [],
      limitation:
        "A complete Auction House scan is required before opportunities can be calculated.",
    };
  }

  const build = await getLatestBuild(database, scan.clientBuild, clientProduct);
  if (!build) {
    return {
      scan,
      opportunities: [],
      limitation: `No published catalog matches Auction House build ${scan.clientBuild}.`,
    };
  }

  const [levels, recipeRows, inputRows, outputRows] = await Promise.all([
    database.select().from(auctionPriceLevels).where(eq(auctionPriceLevels.scanId, scan.scanId)),
    database
      .select({
        recipeSpellId: recipeVersions.recipeSpellId,
        name: spellVersions.name,
        professionName: professionVersions.name,
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
      .where(eq(recipeVersions.buildId, build.id)),
    database.select().from(recipeInputs).where(eq(recipeInputs.buildId, build.id)),
    database.select().from(recipeOutputs).where(eq(recipeOutputs.buildId, build.id)),
  ]);

  const priceLevelsByItem = groupBy(
    levels.filter((level) => level.marketKey === String(level.itemId)),
    (level) => level.itemId,
  );
  const inputsByRecipe = groupBy(inputRows, (input) => input.recipeSpellId);
  const outputsByRecipe = groupBy(outputRows, (output) => output.recipeSpellId);
  const auctionHouseCutBasisPoints = scan.auctionHouseType === "neutral" ? 1_500 : 500;
  const opportunities: (MarketOpportunity & { readonly profitCopper: bigint })[] = [];

  for (const recipe of recipeRows) {
    const recipeInputRows = inputsByRecipe.get(recipe.recipeSpellId) ?? [];
    const recipeOutputRows = outputsByRecipe.get(recipe.recipeSpellId) ?? [];
    if (recipeInputRows.length === 0 || recipeOutputRows.length === 0) continue;

    const inputQuantities = new Map<number, number>();
    for (const input of recipeInputRows) {
      inputQuantities.set(
        input.reagentItemId,
        (inputQuantities.get(input.reagentItemId) ?? 0) + input.quantity,
      );
    }
    const outputMarkets = recipeOutputRows.flatMap((output) => {
      if (output.outputItemId === null) return [];
      const outputLevels = priceLevelsByItem.get(output.outputItemId) ?? [];
      const minimumPrice = outputLevels.reduce<bigint | null>(
        (minimum, level) =>
          minimum === null || level.unitPriceCopper < minimum ? level.unitPriceCopper : minimum,
        null,
      );
      return minimumPrice === null
        ? []
        : [
            {
              itemId: output.outputItemId,
              expectedQuantity: {
                numerator: output.expectedQuantityNumerator,
                denominator: output.expectedQuantityDenominator,
              },
              expectedUnitPriceCopper: minimumPrice,
              fillRateBasisPoints: 10_000,
            },
          ];
    });
    if (outputMarkets.length !== recipeOutputRows.length) continue;

    const result = calculateCraftingOpportunity({
      crafts: 1,
      inputs: [...inputQuantities].map(([itemId, quantity]) => ({
        itemId,
        quantity,
        priceLevels: (priceLevelsByItem.get(itemId) ?? []).map((level) => ({
          unitPriceCopper: level.unitPriceCopper,
          quantity: level.quantity,
        })),
      })),
      outputs: outputMarkets,
      auctionHouseCutBasisPoints,
      fixedCostCopper: 0n,
      listingDepositCopper: 0n,
      expectedDepositLossCopper: 0n,
      cooldownOpportunityCostCopper: 0n,
    });
    if (!result.viable || result.expectedProfitCopper <= 0n) continue;

    opportunities.push({
      profitCopper: result.expectedProfitCopper,
      recipeSpellId: recipe.recipeSpellId,
      recipeName: recipe.name,
      professionName: recipe.professionName,
      expectedProfit: formatCopper(result.expectedProfitCopper),
      reagentCost: formatCopper(result.reagentCostCopper),
      expectedNetRevenue: formatCopper(result.expectedNetRevenueCopper),
      returnOnCapital:
        result.returnOnCapitalBasisPoints === null
          ? "n/a"
          : formatPercentBasisPoints(result.returnOnCapitalBasisPoints),
    });
  }

  opportunities.sort((left, right) =>
    left.profitCopper === right.profitCopper ? 0 : left.profitCopper > right.profitCopper ? -1 : 1,
  );
  return {
    scan,
    opportunities: opportunities
      .slice(0, 100)
      .map(({ profitCopper: _, ...opportunity }) => opportunity),
    limitation:
      "Quoted margin uses current order-book depth, the correct faction/neutral AH cut, and one craft. Demand, deposits, cooldown shadow price, and sale probability remain unmodeled, so this is not a profit guarantee.",
  };
}

async function getItemSetDetail(
  database: WowTraderDatabase,
  buildId: string,
  itemSetId: number | null,
): Promise<ItemDetail["itemSet"]> {
  if (itemSetId === null) return null;
  const [itemSet] = await database
    .select({ itemSetId: itemSets.itemSetId, name: itemSets.name })
    .from(itemSets)
    .where(and(eq(itemSets.buildId, buildId), eq(itemSets.itemSetId, itemSetId)))
    .limit(1);
  if (!itemSet) return null;

  const [members, effects] = await Promise.all([
    database
      .select({
        itemId: itemSetMembers.itemId,
        name: itemVersions.name,
        quality: itemVersions.quality,
      })
      .from(itemSetMembers)
      .innerJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, itemSetMembers.buildId),
          eq(itemVersions.itemId, itemSetMembers.itemId),
        ),
      )
      .where(and(eq(itemSetMembers.buildId, buildId), eq(itemSetMembers.itemSetId, itemSetId)))
      .orderBy(itemSetMembers.slot),
    database
      .select({
        spellId: itemSetEffects.spellId,
        threshold: itemSetEffects.threshold,
        name: spellVersions.name,
        description: spellVersions.description,
        auraDescription: spellVersions.auraDescription,
        procChance: spellVersions.procChance,
        procCharges: spellVersions.procCharges,
        procCooldownMs: spellVersions.procCooldownMs,
        durationMs: spellVersions.durationMs,
        descriptionVariables: spellVersions.descriptionVariables,
        rawRecord: spellVersions.rawRecord,
      })
      .from(itemSetEffects)
      .innerJoin(
        spellVersions,
        and(
          eq(spellVersions.buildId, itemSetEffects.buildId),
          eq(spellVersions.spellId, itemSetEffects.spellId),
        ),
      )
      .where(and(eq(itemSetEffects.buildId, buildId), eq(itemSetEffects.itemSetId, itemSetId)))
      .orderBy(itemSetEffects.threshold, itemSetEffects.itemSetEffectId),
  ]);

  return {
    ...itemSet,
    members,
    effects: effects.map((effect) => ({
      ...effect,
      triggerType: 0,
      charges: 0,
      cooldownMs: -1,
      categoryCooldownMs: -1,
    })),
  };
}

async function getGemDetail(
  database: WowTraderDatabase,
  buildId: string,
  gemPropertiesId: number | null,
): Promise<ItemDetail["gem"]> {
  if (gemPropertiesId === null) return null;
  const [gem] = await database
    .select({
      enchantmentId: gemPropertyVersions.enchantmentId,
      socketType: gemPropertyVersions.socketType,
      minimumItemLevel: gemPropertyVersions.minimumItemLevel,
    })
    .from(gemPropertyVersions)
    .where(
      and(
        eq(gemPropertyVersions.buildId, buildId),
        eq(gemPropertyVersions.gemPropertiesId, gemPropertiesId),
      ),
    )
    .limit(1);
  if (!gem) return null;
  const enchantment = await getItemEnchantmentDetail(database, buildId, gem.enchantmentId);
  return enchantment ? { ...gem, enchantment } : null;
}

async function getItemEnchantmentDetail(
  database: WowTraderDatabase,
  buildId: string,
  enchantmentId: number | null,
): Promise<ItemEnchantmentDetail | null> {
  if (enchantmentId === null) return null;
  const [enchantments, effects] = await Promise.all([
    database
      .select({ enchantmentId: itemEnchantments.enchantmentId, name: itemEnchantments.name })
      .from(itemEnchantments)
      .where(
        and(
          eq(itemEnchantments.buildId, buildId),
          eq(itemEnchantments.enchantmentId, enchantmentId),
        ),
      )
      .limit(1),
    database
      .select({
        slot: itemEnchantmentEffects.slot,
        effectType: itemEnchantmentEffects.effectType,
        minimumPoints: itemEnchantmentEffects.minimumPoints,
        maximumPoints: itemEnchantmentEffects.maximumPoints,
        argument: itemEnchantmentEffects.argument,
      })
      .from(itemEnchantmentEffects)
      .where(
        and(
          eq(itemEnchantmentEffects.buildId, buildId),
          eq(itemEnchantmentEffects.enchantmentId, enchantmentId),
        ),
      )
      .orderBy(itemEnchantmentEffects.slot),
  ]);
  const enchantment = enchantments[0];
  return enchantment ? { ...enchantment, effects } : null;
}

export function includesMaskValue(mask: number, id: number): boolean {
  if (mask === -1) return true;
  if (!Number.isSafeInteger(id) || id < 1 || id > 32) return false;
  return ((mask >>> (id - 1)) & 1) === 1;
}

export function includesSplitMaskValue(mask: readonly number[], id: number): boolean {
  if (!Number.isSafeInteger(id) || id < 1) return false;
  const zeroBasedId = id - 1;
  const word = mask[Math.floor(zeroBasedId / 32)];
  return word === -1 || (word !== undefined && ((word >>> (zeroBasedId % 32)) & 1) === 1);
}

async function getLatestBuild(
  database: WowTraderDatabase,
  buildNumber?: number,
  clientProduct: string = TBC_CLIENT_PRODUCT,
): Promise<typeof gameBuilds.$inferSelect | null> {
  const condition =
    buildNumber === undefined
      ? and(eq(gameBuilds.status, "published"), eq(gameBuilds.product, clientProduct))
      : and(
          eq(gameBuilds.status, "published"),
          eq(gameBuilds.product, clientProduct),
          eq(gameBuilds.buildNumber, buildNumber),
        );
  const [build] = await database
    .select()
    .from(gameBuilds)
    .where(condition)
    .orderBy(desc(gameBuilds.publishedAt))
    .limit(1);
  return build ?? null;
}

function scanProductCondition(database: WowTraderDatabase, clientProduct: string): SQL {
  return inArray(
    marketScans.payloadId,
    database
      .select({ payloadId: rawUploads.payloadId })
      .from(rawUploads)
      .where(eq(rawUploads.clientProduct, clientProduct)),
  );
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

function numericId(value: string): number {
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : -1;
}

async function getItemMarketData(
  database: WowTraderDatabase,
  itemId: number,
  clientProduct: string,
): Promise<ItemMarketData | null> {
  const [latest] = await database
    .select({
      marketKey: auctionPriceLevels.marketKey,
      region: marketScans.region,
      realmId: marketScans.realmId,
      auctionHouseType: marketScans.auctionHouseType,
    })
    .from(auctionPriceLevels)
    .innerJoin(marketScans, eq(marketScans.scanId, auctionPriceLevels.scanId))
    .where(
      and(eq(auctionPriceLevels.itemId, itemId), scanProductCondition(database, clientProduct)),
    )
    .orderBy(desc(marketScans.completedAt), auctionPriceLevels.unitPriceCopper)
    .limit(1);
  if (!latest) return null;

  const recentScans = await database
    .selectDistinct({
      scanId: marketScans.scanId,
      observedAt: marketScans.completedAt,
      completeness: marketScans.completeness,
    })
    .from(auctionPriceLevels)
    .innerJoin(marketScans, eq(marketScans.scanId, auctionPriceLevels.scanId))
    .where(
      and(
        eq(auctionPriceLevels.itemId, itemId),
        eq(auctionPriceLevels.marketKey, latest.marketKey),
        eq(marketScans.region, latest.region),
        eq(marketScans.realmId, latest.realmId),
        eq(marketScans.auctionHouseType, latest.auctionHouseType),
        scanProductCondition(database, clientProduct),
      ),
    )
    .orderBy(desc(marketScans.completedAt))
    .limit(48);
  if (recentScans.length === 0) return null;

  const rows = await database
    .select({
      scanId: marketScans.scanId,
      observedAt: marketScans.completedAt,
      completeness: marketScans.completeness,
      unitPriceCopper: auctionPriceLevels.unitPriceCopper,
      quantity: auctionPriceLevels.quantity,
      listingCount: auctionPriceLevels.listingCount,
    })
    .from(auctionPriceLevels)
    .innerJoin(marketScans, eq(marketScans.scanId, auctionPriceLevels.scanId))
    .where(
      inArray(
        marketScans.scanId,
        recentScans.map((scan) => scan.scanId),
      ),
    )
    .orderBy(desc(marketScans.completedAt));
  const byScan = groupBy(rows, (row) => row.scanId);
  const history = [...byScan.values()]
    .map((levels) => {
      const first = levels[0]!;
      const summary = summarizeOrderBook(
        levels.map((level) => ({
          unitPriceCopper: level.unitPriceCopper,
          quantity: level.quantity,
          listingCount: level.listingCount,
        })),
      );
      return { observedAt: first.observedAt, completeness: first.completeness, ...summary };
    })
    .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime())
    .slice(-48);
  const current = history.at(-1);
  if (!current) return null;

  return {
    ...latest,
    latestAt: current.observedAt,
    current,
    forecast: forecastPrice(
      history.map((observation) => ({
        observedAt: observation.observedAt,
        priceCopper: observation.weightedMedianPriceCopper,
        availableQuantity: observation.availableQuantity,
        completeness: observation.completeness,
      })),
      30 * 60_000,
    ),
    history: history.map((observation) => ({
      observedAt: observation.observedAt,
      minimumPriceCopper: observation.minimumPriceCopper,
      weightedMedianPriceCopper: observation.weightedMedianPriceCopper,
      availableQuantity: observation.availableQuantity,
    })),
  };
}

function parseSafeCount(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new RangeError(`${name} is outside the safe range`);
  return parsed;
}
