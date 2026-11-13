import {
  communityReferenceRelations,
  communityReferenceSnapshots,
  auctionPriceLevels,
  gameBuilds,
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
  worldTrainerObservations,
} from "@wow-trader/db";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { loadClientDisenchantEvidence } from "@wow-trader/catalog";
import { DISENCHANT_MATERIAL_ITEM_IDS } from "./disenchanting";
import { getLevelingItemRecovery } from "./profession-leveling-item-values";
import { getDatabase } from "./database";
import { communitySnapshotFreshnessCondition } from "./community-publication";
import { isPurchasableRecipePattern, readRecipeSkillBands } from "./profession-leveling-catalog";
import { getMarketScanFreshness } from "./market-freshness";
import { marketSelectionValue, selectMarketScan } from "./market-selection";
import type {
  LevelingAcquisition,
  LevelingItem,
  LevelingRecipe,
  ProfessionLevelingData,
} from "./profession-leveling-types";

const PRODUCT = "wow_classic_beta";
const CRAFTING_PROFESSIONS = [164, 165, 171, 197, 202, 333, 185, 129, 186];

export async function getProfessionLevelingData(
  professionSlug: string,
  requestedMarket: string,
): Promise<ProfessionLevelingData> {
  const db = getDatabase();
  const scans = await db
    .select({
      scanId: marketScans.scanId,
      clientBuild: marketScans.clientBuild,
      region: marketScans.region,
      realmId: marketScans.realmId,
      auctionHouseType: marketScans.auctionHouseType,
      completedAt: marketScans.completedAt,
    })
    .from(marketScans)
    .innerJoin(rawUploads, eq(rawUploads.payloadId, marketScans.payloadId))
    .where(and(eq(rawUploads.clientProduct, PRODUCT), eq(marketScans.qualityAccepted, true)))
    .orderBy(desc(marketScans.completedAt), desc(marketScans.scanId))
    .limit(250);
  const markets = [
    ...new Map(
      scans.map((scan) => [
        marketSelectionValue(scan),
        {
          value: marketSelectionValue(scan),
          label: `${scan.region} · ${scan.realmId} · ${scan.auctionHouseType}`,
        },
      ]),
    ).values(),
  ];
  const selected = selectMarketScan(scans, requestedMarket);
  const base: ProfessionLevelingData = {
    professions: [],
    markets,
    market: selected ? marketSelectionValue(selected) : requestedMarket,
    profession: professionSlug,
    scan: selected
      ? {
          at: selected.completedAt.toISOString(),
          build: selected.clientBuild,
          fresh: getMarketScanFreshness(selected.completedAt).state === "fresh",
        }
      : null,
    recipes: [],
    items: [],
    limitation: null,
  };
  if (!selected)
    return {
      ...base,
      limitation:
        "No accepted Auction House scan matches this market. Upload a complete scan with Companion first.",
    };
  const [build] = await db
    .select({ id: gameBuilds.id, manifest: gameBuilds.manifest })
    .from(gameBuilds)
    .where(
      and(
        eq(gameBuilds.product, PRODUCT),
        eq(gameBuilds.status, "published"),
        eq(gameBuilds.locale, "enUS"),
        eq(gameBuilds.buildNumber, selected.clientBuild),
      ),
    )
    .limit(1);
  if (!build)
    return {
      ...base,
      limitation: `The exact catalog for scan build ${selected.clientBuild} is not published yet.`,
    };
  const available = await db
    .select({ id: professions.skillLineId, slug: professions.slug, name: professionVersions.name })
    .from(professionVersions)
    .innerJoin(professions, eq(professions.skillLineId, professionVersions.skillLineId))
    .where(
      and(
        eq(professionVersions.buildId, build.id),
        inArray(professions.skillLineId, CRAFTING_PROFESSIONS),
      ),
    )
    .orderBy(professionVersions.name);
  const profession =
    available.find((candidate) => candidate.slug === professionSlug) ?? available[0];
  if (!profession)
    return {
      ...base,
      limitation: "No supported crafting profession is available in this catalog.",
    };
  const rows = await db
    .select({
      id: recipeVersions.recipeSpellId,
      name: spellVersions.name,
      rank: recipeVersions.requiredSkillRank,
      raw: recipeVersions.rawRecord,
      cooldown: recipeVersions.cooldownMs,
      categoryCooldown: recipeVersions.categoryCooldownMs,
      status: recipeVersions.extractionStatus,
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
        eq(recipeVersions.professionSkillLineId, profession.id),
      ),
    )
    .orderBy(recipeVersions.requiredSkillRank, spellVersions.name);
  const ids = rows.map((row) => row.id);
  if (!ids.length)
    return {
      ...base,
      professions: available,
      profession: profession.slug,
      limitation: "This profession has no captured recipes.",
    };
  const [inputs, outputs, patterns, trainers, referencePatterns] = await Promise.all([
    db
      .select()
      .from(recipeInputs)
      .where(and(eq(recipeInputs.buildId, build.id), inArray(recipeInputs.recipeSpellId, ids))),
    db
      .select()
      .from(recipeOutputs)
      .where(and(eq(recipeOutputs.buildId, build.id), inArray(recipeOutputs.recipeSpellId, ids))),
    db
      .select({
        recipeId: recipeTeachingItems.recipeSpellId,
        itemId: recipeTeachingItems.teachingItemId,
        binding: itemVersions.binding,
        ability: itemVersions.requiredAbilityId,
        faction: itemVersions.minimumFactionId,
        reputation: itemVersions.minimumReputation,
        rank: itemVersions.requiredSkillRank,
        classId: itemVersions.classId,
        classMask: itemVersions.allowableClassMask,
        raceMask: itemVersions.allowableRaceMask,
        level: itemVersions.requiredLevel,
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
          inArray(recipeTeachingItems.recipeSpellId, ids),
        ),
      ),
    db
      .select({
        id: worldTrainerObservations.spellId,
        source: worldTrainerObservations.sourceId,
        cost: worldTrainerObservations.moneyCost,
        level: worldTrainerObservations.requiredLevel,
        rank: worldTrainerObservations.requiredSkillRank,
      })
      .from(worldTrainerObservations)
      .innerJoin(rawUploads, eq(rawUploads.payloadId, worldTrainerObservations.payloadId))
      .where(
        and(
          eq(worldTrainerObservations.clientProduct, PRODUCT),
          eq(worldTrainerObservations.clientBuild, selected.clientBuild),
          eq(rawUploads.region, selected.region),
          eq(rawUploads.realmId, selected.realmId),
          eq(rawUploads.auctionHouseType, selected.auctionHouseType),
          inArray(worldTrainerObservations.serviceType, ["available", "unavailable"]),
          gt(worldTrainerObservations.moneyCost, 0n),
          inArray(worldTrainerObservations.spellId, ids),
        ),
      )
      .orderBy(desc(worldTrainerObservations.capturedAt))
      .limit(10_000),
    db
      .select({
        recipeId: communityReferenceRelations.targetId,
        itemId: communityReferenceRelations.sourceId,
        binding: itemVersions.binding,
        ability: itemVersions.requiredAbilityId,
        faction: itemVersions.minimumFactionId,
        reputation: itemVersions.minimumReputation,
        rank: itemVersions.requiredSkillRank,
        classId: itemVersions.classId,
        classMask: itemVersions.allowableClassMask,
        raceMask: itemVersions.allowableRaceMask,
        level: itemVersions.requiredLevel,
      })
      .from(communityReferenceRelations)
      .innerJoin(
        communityReferenceSnapshots,
        eq(communityReferenceSnapshots.id, communityReferenceRelations.snapshotId),
      )
      .innerJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, build.id),
          eq(itemVersions.itemId, communityReferenceRelations.sourceId),
        ),
      )
      .where(
        and(
          eq(communityReferenceSnapshots.buildId, build.id),
          eq(communityReferenceSnapshots.status, "published"),
          communitySnapshotFreshnessCondition(),
          eq(communityReferenceRelations.sourceKind, "item"),
          eq(communityReferenceRelations.relationKind, "teaches_spell"),
          eq(communityReferenceRelations.targetKind, "spell"),
          inArray(communityReferenceRelations.targetId, ids),
        ),
      ),
  ]);
  const acquisition = new Map<number, LevelingAcquisition[]>();
  const seenTrainer = new Set<string>();
  for (const trainer of trainers) {
    if (!trainer.id) continue;
    const key = `${trainer.id}:${trainer.source}`;
    if (seenTrainer.has(key)) continue;
    seenTrainer.add(key);
    acquisition.set(trainer.id, [
      ...(acquisition.get(trainer.id) ?? []),
      {
        label: `Trainer ${trainer.source} (observed fee)`,
        costCopper: trainer.cost.toString(),
        ...(trainer.level !== null ? { requiredLevel: trainer.level } : {}),
        ...(trainer.rank !== null ? { requiredSkill: trainer.rank } : {}),
      },
    ]);
  }
  for (const pattern of [...patterns, ...referencePatterns]) {
    if (!isPurchasableRecipePattern(pattern)) continue;
    acquisition.set(pattern.recipeId, [
      ...(acquisition.get(pattern.recipeId) ?? []),
      {
        label: "Buy recipe on AH",
        costCopper: "0",
        itemId: pattern.itemId,
        ...(pattern.rank > 0 ? { requiredSkill: pattern.rank } : {}),
        requiredLevel: pattern.level,
      },
    ]);
  }
  const recipes: LevelingRecipe[] = rows.flatMap((row): LevelingRecipe[] => {
    const bands = readRecipeSkillBands(row.raw, row.rank);
    if (!bands || row.status !== "complete" || row.cooldown > 0 || row.categoryCooldown > 0)
      return [];
    const required = inputs.filter((input) => input.recipeSpellId === row.id && !input.optional);
    if (!required.length) return [];
    const results = outputs.filter((output) => output.recipeSpellId === row.id);
    const output =
      results.length === 1 && results[0]?.outputItemId && results[0].minimumQuantity > 0
        ? { itemId: results[0].outputItemId, quantity: results[0].minimumQuantity }
        : null;
    const observedRanks = (acquisition.get(row.id) ?? []).flatMap((option) =>
      option.requiredSkill === undefined ? [] : [option.requiredSkill],
    );
    // A spell's cast floor does not establish the trainer's learning requirement.
    const requiredSkillKnown = observedRanks.length > 0;
    const requiredSkill = observedRanks.length
      ? Math.max(bands.required, Math.min(...observedRanks))
      : bands.required;
    return [
      {
        id: row.id,
        name: row.name,
        requiredSkill,
        requiredSkillKnown,
        yellowSkill: bands.yellow,
        graySkill: bands.gray,
        skillUps: bands.skillUps,
        inputs: required.map((input) => ({
          itemId: input.reagentItemId,
          quantity: input.quantity,
        })),
        output,
        acquisition: acquisition.get(row.id) ?? [],
        restriction: bands.restricted
          ? "Race or class requirement: mark learned only if usable by this character."
          : null,
      },
    ];
  });
  const itemIds = [
    ...new Set(
      recipes.flatMap((recipe) => [
        ...recipe.inputs.map((input) => input.itemId),
        ...recipe.acquisition.flatMap((option) => (option.itemId ? [option.itemId] : [])),
        ...(recipe.output ? [recipe.output.itemId] : []),
      ]),
    ),
  ];
  if (!itemIds.length)
    return {
      ...base,
      professions: available,
      profession: profession.slug,
      recipes,
      limitation: "No complete skill-up recipes are captured for this profession.",
    };
  const pricingIds = [...new Set([...itemIds, ...DISENCHANT_MATERIAL_ITEM_IDS])];
  const [itemRows, levels, evidence] = await Promise.all([
    db
      .select({
        id: itemVersions.itemId,
        name: itemVersions.name,
        classId: itemVersions.classId,
        subclassId: itemVersions.subclassId,
        quality: itemVersions.quality,
        itemLevel: itemVersions.itemLevel,
        binding: itemVersions.binding,
        rawRecord: itemVersions.rawRecord,
        vendorSellCopper: itemVersions.sellPriceCopper,
      })
      .from(itemVersions)
      .where(and(eq(itemVersions.buildId, build.id), inArray(itemVersions.itemId, itemIds))),
    db
      .select()
      .from(auctionPriceLevels)
      .where(
        and(
          eq(auctionPriceLevels.scanId, selected.scanId),
          inArray(auctionPriceLevels.itemId, pricingIds),
        ),
      )
      .orderBy(auctionPriceLevels.unitPriceCopper),
    loadClientDisenchantEvidence(process.env.WOW_TRADER_CATALOG_ROOT, build.manifest).catch(
      (error: unknown) => {
        console.warn(
          "Profession disenchant estimates are unavailable.",
          error instanceof Error ? error.message : "Invalid catalog evidence",
        );
        return null;
      },
    ),
  ]);
  const materialPrices = new Map<number, bigint>();
  for (const level of levels) {
    if (
      level.marketKey !== String(level.itemId) ||
      level.quantity <= 0 ||
      level.unitPriceCopper <= 0n
    )
      continue;
    const old = materialPrices.get(level.itemId);
    if (old === undefined || old > level.unitPriceCopper)
      materialPrices.set(level.itemId, level.unitPriceCopper);
  }
  const items: LevelingItem[] = itemRows.map((item) => ({
    id: item.id,
    name: item.name,
    recovery: getLevelingItemRecovery(
      { ...item, itemId: item.id },
      evidence,
      materialPrices,
      selected.auctionHouseType,
    ),
    levels: levels
      .filter((level) => level.itemId === item.id && level.marketKey === String(item.id))
      .map((level) => ({
        unitPriceCopper: level.unitPriceCopper.toString(),
        quantity: level.quantity,
        listingCount: level.listingCount,
        lots: level.lots,
      })),
  }));
  return { ...base, professions: available, profession: profession.slug, recipes, items };
}
