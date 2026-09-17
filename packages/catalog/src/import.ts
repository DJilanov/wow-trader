import type { CatalogBundle } from "@wow-trader/contracts";
import {
  contentAvailability,
  gameClassVersions,
  gameBuilds,
  gameRaceVersions,
  gemPropertyVersions,
  items,
  itemBonuses,
  itemBonusTreeNodes,
  itemBonusTrees,
  itemClassVersions,
  itemDamages,
  itemEffects,
  itemEnchantmentEffects,
  itemEnchantments,
  itemLimitCategoryVersions,
  itemRandomEnchantments,
  itemResistances,
  itemSetEffects,
  itemSetMembers,
  itemSets,
  itemSockets,
  itemStats,
  itemSubclassVersions,
  itemVersions,
  professions,
  professionVersions,
  recipeInputs,
  recipeOutputs,
  recipes,
  recipeTeachingItems,
  recipeVersions,
  spells,
  spellVersions,
  transformationInputs,
  transformationOutputs,
  transformationVersions,
  type WowTraderDatabase,
} from "@wow-trader/db";
import { eq } from "drizzle-orm";

const INSERT_CHUNK_SIZE = 1_000;

export interface ImportCatalogOptions {
  readonly publish: boolean;
}

export interface ImportCatalogResult {
  readonly buildId: string;
  readonly snapshotKey: string;
  readonly duplicate: boolean;
  readonly published: boolean;
}

export async function importCatalog(
  database: WowTraderDatabase,
  bundle: CatalogBundle,
  options: ImportCatalogOptions,
): Promise<ImportCatalogResult> {
  const snapshotKey = createSnapshotKey(bundle);
  if (options.publish && bundle.manifest.hotfix.status === "missing") {
    throw new Error("A catalog with a missing hotfix cache cannot be published");
  }

  return database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: gameBuilds.id, status: gameBuilds.status })
      .from(gameBuilds)
      .where(eq(gameBuilds.snapshotKey, snapshotKey))
      .limit(1);
    if (existing) {
      if (options.publish && existing.status === "review_required") {
        await transaction
          .update(gameBuilds)
          .set({ status: "published", publishedAt: new Date() })
          .where(eq(gameBuilds.id, existing.id));
      } else if (options.publish && existing.status !== "published") {
        throw new Error(`Catalog build cannot be published from status ${existing.status}`);
      }

      return {
        buildId: existing.id,
        snapshotKey,
        duplicate: true,
        published: options.publish || existing.status === "published",
      };
    }

    const [build] = await transaction
      .insert(gameBuilds)
      .values({
        snapshotKey,
        product: bundle.manifest.product,
        clientVersion: bundle.manifest.clientVersion,
        buildNumber: bundle.manifest.buildNumber,
        buildKey: bundle.manifest.buildKey.toLowerCase(),
        cdnKey: bundle.manifest.cdnKey.toLowerCase(),
        locale: bundle.manifest.locale,
        hotfixStatus: bundle.manifest.hotfix.status,
        hotfixHash: bundle.manifest.hotfix.sha256,
        definitionsRevision: bundle.manifest.definitions.revision,
        extractorVersion: bundle.manifest.extractor.version,
        status: "validating",
        extractedAt: new Date(bundle.manifest.extractedAt),
        manifest: bundle.manifest,
      })
      .returning({ id: gameBuilds.id });
    if (!build) throw new Error("Database did not return the inserted catalog build");

    await insertChunks(
      bundle.items.map((item) => ({
        itemId: item.itemId,
        firstSeenBuildNumber: bundle.manifest.buildNumber,
      })),
      async (chunk) => {
        await transaction.insert(items).values(chunk).onConflictDoNothing();
      },
    );
    await insertChunks(
      bundle.spells.map((spell) => ({
        spellId: spell.spellId,
        firstSeenBuildNumber: bundle.manifest.buildNumber,
      })),
      async (chunk) => {
        await transaction.insert(spells).values(chunk).onConflictDoNothing();
      },
    );
    await insertChunks(
      bundle.professions.map((profession) => ({
        skillLineId: profession.skillLineId,
        slug: profession.slug,
      })),
      async (chunk) => {
        await transaction.insert(professions).values(chunk).onConflictDoNothing();
      },
    );
    await insertChunks(
      bundle.recipes.map((recipe) => ({
        recipeSpellId: recipe.recipeSpellId,
        firstSeenBuildNumber: bundle.manifest.buildNumber,
      })),
      async (chunk) => {
        await transaction.insert(recipes).values(chunk).onConflictDoNothing();
      },
    );

    await insertChunks(
      bundle.items.map((item) => ({
        buildId: build.id,
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        classId: item.classId,
        subclassId: item.subclassId,
        quality: item.quality,
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
        limitCategoryId: item.limitCategoryId,
        socketBonusEnchantmentId: item.socketBonusEnchantmentId,
        gemPropertiesId: item.gemPropertiesId,
        randomSuffixGroupId: item.randomSuffixGroupId,
        randomPropertyId: item.randomPropertyId,
        requiredAbilityId: item.requiredAbilityId,
        minimumFactionId: item.minimumFactionId,
        minimumReputation: item.minimumReputation,
        buyPriceCopper: BigInt(item.buyPriceCopper),
        sellPriceCopper: BigInt(item.sellPriceCopper),
        iconFileDataId: item.iconFileDataId,
        rawRecord: item.rawRecord,
      })),
      async (chunk) => {
        await transaction.insert(itemVersions).values(chunk);
      },
    );
    await insertChunks(
      bundle.spells.map((spell) => ({
        buildId: build.id,
        spellId: spell.spellId,
        name: spell.name,
        description: spell.description,
        auraDescription: spell.auraDescription,
        durationMs: spell.durationMs,
        maximumDurationMs: spell.maximumDurationMs,
        procChance: spell.procChance,
        procCharges: spell.procCharges,
        procCooldownMs: spell.procCooldownMs,
        descriptionVariables: spell.descriptionVariables,
        rawRecord: spell.rawRecord,
      })),
      async (chunk) => {
        await transaction.insert(spellVersions).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemStats.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemStats).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemDamages.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemDamages).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemResistances.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemResistances).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemSockets.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemSockets).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemEffects.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemEffects).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemSets.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemSets).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemSetMembers.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemSetMembers).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemSetEffects.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemSetEffects).values(chunk);
      },
    );
    await insertChunks(
      bundle.gameClasses.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(gameClassVersions).values(chunk);
      },
    );
    await insertChunks(
      bundle.gameRaces.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(gameRaceVersions).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemClasses.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemClassVersions).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemSubclasses.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemSubclassVersions).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemLimitCategories.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemLimitCategoryVersions).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemEnchantments.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemEnchantments).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemEnchantmentEffects.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemEnchantmentEffects).values(chunk);
      },
    );
    await insertChunks(
      bundle.gemProperties.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(gemPropertyVersions).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemRandomEnchantments.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemRandomEnchantments).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemBonusTrees.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemBonusTrees).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemBonusTreeNodes.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemBonusTreeNodes).values(chunk);
      },
    );
    await insertChunks(
      bundle.itemBonuses.map((row) => ({ buildId: build.id, ...row })),
      async (chunk) => {
        await transaction.insert(itemBonuses).values(chunk);
      },
    );
    await insertChunks(
      bundle.professions.map((profession) => ({
        buildId: build.id,
        skillLineId: profession.skillLineId,
        name: profession.name,
        rawRecord: profession.rawRecord,
      })),
      async (chunk) => {
        await transaction.insert(professionVersions).values(chunk);
      },
    );
    await insertChunks(
      bundle.recipes.map((recipe) => ({
        buildId: build.id,
        recipeSpellId: recipe.recipeSpellId,
        professionSkillLineId: recipe.professionSkillLineId,
        requiredSkillRank: recipe.requiredSkillRank,
        craftTimeMs: recipe.craftTimeMs,
        cooldownMs: recipe.cooldownMs,
        cooldownCategoryId: recipe.cooldownCategoryId,
        categoryCooldownMs: recipe.categoryCooldownMs,
        outputKind: recipe.outputKind,
        extractionStatus: recipe.extractionStatus,
        rawRecord: recipe.rawRecord,
      })),
      async (chunk) => {
        await transaction.insert(recipeVersions).values(chunk);
      },
    );

    const inputSlots = new Map<number, number>();
    await insertChunks(
      bundle.recipeInputs.map((input) => ({
        buildId: build.id,
        recipeSpellId: input.recipeSpellId,
        slot: nextSlot(inputSlots, input.recipeSpellId),
        reagentItemId: input.reagentItemId,
        quantity: input.quantity,
        optional: input.optional,
      })),
      async (chunk) => {
        await transaction.insert(recipeInputs).values(chunk);
      },
    );
    const outputSlots = new Map<number, number>();
    await insertChunks(
      bundle.recipeOutputs.map((output) => ({
        buildId: build.id,
        recipeSpellId: output.recipeSpellId,
        slot: nextSlot(outputSlots, output.recipeSpellId),
        outputItemId: output.outputItemId,
        enchantmentId: output.enchantmentId,
        minimumQuantity: output.minimumQuantity,
        maximumQuantity: output.maximumQuantity,
        expectedQuantityNumerator: BigInt(output.expectedQuantityNumerator),
        expectedQuantityDenominator: BigInt(output.expectedQuantityDenominator),
      })),
      async (chunk) => {
        await transaction.insert(recipeOutputs).values(chunk);
      },
    );
    await insertChunks(
      bundle.recipeTeachingItems.map((item) => ({
        buildId: build.id,
        recipeSpellId: item.recipeSpellId,
        teachingItemId: item.teachingItemId,
        learningSpellId: item.learningSpellId,
      })),
      async (chunk) => {
        await transaction.insert(recipeTeachingItems).values(chunk);
      },
    );
    await insertChunks(
      bundle.transformations.map((transformation) => ({
        buildId: build.id,
        transformationId: transformation.transformationId,
        spellId: transformation.spellId,
        sourceItemId: transformation.sourceItemId,
        kind: transformation.kind,
        cooldownMs: transformation.cooldownMs,
        categoryCooldownMs: transformation.categoryCooldownMs,
        extractionStatus: transformation.extractionStatus,
        rawRecord: transformation.rawRecord,
      })),
      async (chunk) => {
        await transaction.insert(transformationVersions).values(chunk);
      },
    );
    const transformationInputSlots = new Map<number, number>();
    await insertChunks(
      bundle.transformationInputs.map((input) => ({
        buildId: build.id,
        transformationId: input.transformationId,
        slot: nextSlot(transformationInputSlots, input.transformationId),
        itemId: input.itemId,
        quantity: input.quantity,
      })),
      async (chunk) => {
        await transaction.insert(transformationInputs).values(chunk);
      },
    );
    const transformationOutputSlots = new Map<number, number>();
    await insertChunks(
      bundle.transformationOutputs.map((output) => ({
        buildId: build.id,
        transformationId: output.transformationId,
        slot: nextSlot(transformationOutputSlots, output.transformationId),
        itemId: output.itemId,
        minimumQuantity: output.minimumQuantity,
        maximumQuantity: output.maximumQuantity,
        expectedQuantityNumerator: BigInt(output.expectedQuantityNumerator),
        expectedQuantityDenominator: BigInt(output.expectedQuantityDenominator),
      })),
      async (chunk) => {
        await transaction.insert(transformationOutputs).values(chunk);
      },
    );
    await insertChunks(
      bundle.recipes.map((recipe) => ({
        buildId: build.id,
        entityKind: "recipe",
        entityId: recipe.recipeSpellId,
        state: "client_only" as const,
      })),
      async (chunk) => {
        await transaction.insert(contentAvailability).values(chunk);
      },
    );

    await transaction
      .update(gameBuilds)
      .set({
        status: options.publish ? "published" : "review_required",
        publishedAt: options.publish ? new Date() : null,
      })
      .where(eq(gameBuilds.id, build.id));

    return {
      buildId: build.id,
      snapshotKey,
      duplicate: false,
      published: options.publish,
    };
  });
}

export function createSnapshotKey(bundle: CatalogBundle): string {
  return [
    bundle.manifest.product,
    bundle.manifest.clientVersion,
    bundle.manifest.buildNumber,
    bundle.manifest.locale,
    bundle.manifest.hotfix.sha256 ?? bundle.manifest.hotfix.status,
    bundle.manifest.definitions.revision,
    bundle.manifest.schemaVersion,
  ].join(":");
}

async function insertChunks<T>(
  values: readonly T[],
  insert: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += INSERT_CHUNK_SIZE) {
    const chunk = values.slice(index, index + INSERT_CHUNK_SIZE);
    if (chunk.length > 0) await insert(chunk);
  }
}

function nextSlot(slots: Map<number, number>, recipeSpellId: number): number {
  const slot = slots.get(recipeSpellId) ?? 0;
  slots.set(recipeSpellId, slot + 1);
  return slot;
}
