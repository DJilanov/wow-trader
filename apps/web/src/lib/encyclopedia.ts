import {
  gameClassVersions,
  gameBuilds,
  gameRaceVersions,
  gemPropertyVersions,
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
  professions,
  professionVersions,
  recipeVersions,
  spellVersions,
  type WowTraderDatabase,
} from "@wow-trader/db";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";

import { getDatabase } from "./database";
import { includesMaskValue, includesSplitMaskValue } from "./data";
import { TBC_CLIENT_PRODUCT } from "./game-versions";
import type { ItemTooltipRecord } from "./item-tooltip";

export type EncyclopediaSection = "all" | "items" | "recipes" | "professions";

export interface EncyclopediaItem extends ItemTooltipRecord {
  readonly iconFileDataId: number | null;
}

export interface EncyclopediaData {
  readonly build: {
    readonly product: string;
    readonly version: string;
    readonly buildNumber: number;
  };
  readonly counts: {
    readonly items: number;
    readonly recipes: number;
    readonly professions: number;
  };
  readonly query: string;
  readonly searched: boolean;
  readonly resultLimit: number;
  readonly items: readonly EncyclopediaItem[];
  readonly recipes: readonly {
    readonly recipeSpellId: number;
    readonly name: string;
    readonly professionName: string;
    readonly professionSlug: string;
    readonly requiredSkillRank: number;
    readonly outputKind: string;
    readonly extractionStatus: string;
    readonly hasCooldown: boolean;
  }[];
  readonly professions: readonly {
    readonly skillLineId: number;
    readonly slug: string;
    readonly name: string;
    readonly recipeCount: number;
  }[];
}

const RESULT_LIMIT = 40;

interface EncyclopediaItemRow {
  readonly itemId: number;
  readonly name: string;
  readonly description: string;
  readonly quality: number;
  readonly classId: number;
  readonly subclassId: number;
  readonly itemLevel: number;
  readonly requiredLevel: number;
  readonly requiredSkillId: number | null;
  readonly requiredSkillRank: number;
  readonly binding: number;
  readonly inventoryType: number;
  readonly allowableClassMask: number;
  readonly allowableRaceMask: readonly number[];
  readonly maxCount: number;
  readonly maxDurability: number;
  readonly delayMs: number;
  readonly itemSetId: number | null;
  readonly limitCategoryId: number | null;
  readonly socketBonusEnchantmentId: number | null;
  readonly gemPropertiesId: number | null;
  readonly requiredAbilityId: number | null;
  readonly minimumFactionId: number | null;
  readonly minimumReputation: number;
  readonly iconFileDataId: number | null;
}

const itemClassNames: Readonly<Record<number, string>> = {
  0: "Consumable",
  1: "Container",
  2: "Weapon",
  3: "Gem",
  4: "Armor",
  5: "Reagent",
  6: "Projectile",
  7: "Trade good",
  8: "Generic",
  9: "Recipe",
  10: "Currency",
  11: "Quiver",
  12: "Quest item",
  13: "Key",
  14: "Permanent",
  15: "Miscellaneous",
};

export function parseEncyclopediaSection(value: string | undefined): EncyclopediaSection {
  return value === "items" || value === "recipes" || value === "professions" ? value : "all";
}

export function isEncyclopediaQuerySearchable(query: string): boolean {
  const normalized = query.trim();
  return normalized.length >= 2 || numericId(normalized) > 0;
}

export async function getEncyclopediaData(
  rawQuery: string,
  section: EncyclopediaSection,
): Promise<EncyclopediaData | null> {
  const database = getDatabase();
  const [build] = await database
    .select()
    .from(gameBuilds)
    .where(and(eq(gameBuilds.status, "published"), eq(gameBuilds.product, TBC_CLIENT_PRODUCT)))
    .orderBy(desc(gameBuilds.publishedAt))
    .limit(1);
  if (!build) return null;

  const query = rawQuery.trim().slice(0, 120);
  const searched = isEncyclopediaQuerySearchable(query);
  const exactId = numericId(query);
  const pattern = `%${escapeLikePattern(query)}%`;
  const includeItems = searched && (section === "all" || section === "items");
  const includeRecipes = searched && (section === "all" || section === "recipes");
  const includeProfessions = section === "all" || section === "professions";
  const shouldListProfessions = includeProfessions && (query.length === 0 || searched);

  const [itemCountRows, recipeCountRows, professionCountRows, itemRows, recipes, professionRows] =
    await Promise.all([
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
      includeItems
        ? database
            .select({
              itemId: itemVersions.itemId,
              name: itemVersions.name,
              description: itemVersions.description,
              quality: itemVersions.quality,
              classId: itemVersions.classId,
              subclassId: itemVersions.subclassId,
              itemLevel: itemVersions.itemLevel,
              requiredLevel: itemVersions.requiredLevel,
              requiredSkillId: itemVersions.requiredSkillId,
              requiredSkillRank: itemVersions.requiredSkillRank,
              binding: itemVersions.binding,
              inventoryType: itemVersions.inventoryType,
              allowableClassMask: itemVersions.allowableClassMask,
              allowableRaceMask: itemVersions.allowableRaceMask,
              maxCount: itemVersions.maxCount,
              maxDurability: itemVersions.maxDurability,
              delayMs: itemVersions.delayMs,
              itemSetId: itemVersions.itemSetId,
              limitCategoryId: itemVersions.limitCategoryId,
              socketBonusEnchantmentId: itemVersions.socketBonusEnchantmentId,
              gemPropertiesId: itemVersions.gemPropertiesId,
              requiredAbilityId: itemVersions.requiredAbilityId,
              minimumFactionId: itemVersions.minimumFactionId,
              minimumReputation: itemVersions.minimumReputation,
              iconFileDataId: itemVersions.iconFileDataId,
            })
            .from(itemVersions)
            .where(
              and(
                eq(itemVersions.buildId, build.id),
                or(ilike(itemVersions.name, pattern), eq(itemVersions.itemId, exactId)),
              ),
            )
            .orderBy(itemVersions.name, itemVersions.itemId)
            .limit(RESULT_LIMIT)
        : Promise.resolve([]),
      includeRecipes
        ? database
            .select({
              recipeSpellId: recipeVersions.recipeSpellId,
              name: spellVersions.name,
              professionName: professionVersions.name,
              professionSlug: professions.slug,
              requiredSkillRank: recipeVersions.requiredSkillRank,
              outputKind: recipeVersions.outputKind,
              extractionStatus: recipeVersions.extractionStatus,
              cooldownMs: recipeVersions.cooldownMs,
              categoryCooldownMs: recipeVersions.categoryCooldownMs,
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
            .innerJoin(
              professions,
              eq(professions.skillLineId, recipeVersions.professionSkillLineId),
            )
            .where(
              and(
                eq(recipeVersions.buildId, build.id),
                or(ilike(spellVersions.name, pattern), eq(recipeVersions.recipeSpellId, exactId)),
              ),
            )
            .orderBy(spellVersions.name, recipeVersions.recipeSpellId)
            .limit(RESULT_LIMIT)
        : Promise.resolve([]),
      shouldListProfessions
        ? database
            .select({
              skillLineId: professionVersions.skillLineId,
              slug: professions.slug,
              name: professionVersions.name,
              recipeCount: count(recipeVersions.recipeSpellId),
            })
            .from(professionVersions)
            .innerJoin(professions, eq(professions.skillLineId, professionVersions.skillLineId))
            .leftJoin(
              recipeVersions,
              and(
                eq(recipeVersions.buildId, professionVersions.buildId),
                eq(recipeVersions.professionSkillLineId, professionVersions.skillLineId),
              ),
            )
            .where(
              and(
                eq(professionVersions.buildId, build.id),
                query.length === 0
                  ? undefined
                  : or(
                      ilike(professionVersions.name, pattern),
                      ilike(professions.slug, pattern),
                      eq(professionVersions.skillLineId, exactId),
                    ),
              ),
            )
            .groupBy(professionVersions.skillLineId, professions.slug, professionVersions.name)
            .orderBy(professionVersions.name)
            .limit(RESULT_LIMIT)
        : Promise.resolve([]),
    ]);

  const items = await hydrateEncyclopediaItems(database, build.id, itemRows);

  return {
    build: {
      product: build.product,
      version: build.clientVersion,
      buildNumber: build.buildNumber,
    },
    counts: {
      items: itemCountRows[0]?.value ?? 0,
      recipes: recipeCountRows[0]?.value ?? 0,
      professions: professionCountRows[0]?.value ?? 0,
    },
    query,
    searched,
    resultLimit: RESULT_LIMIT,
    items,
    recipes: recipes.map(({ cooldownMs, categoryCooldownMs, ...recipe }) => ({
      ...recipe,
      hasCooldown: cooldownMs > 0 || categoryCooldownMs > 0,
    })),
    professions: professionRows,
  };
}

function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function numericId(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : -1;
}

async function hydrateEncyclopediaItems(
  database: WowTraderDatabase,
  buildId: string,
  items: readonly EncyclopediaItemRow[],
): Promise<readonly EncyclopediaItem[]> {
  if (items.length === 0) return [];

  const itemIds = items.map((item) => item.itemId);
  const itemSetIds = uniqueNumbers(items.map((item) => item.itemSetId));
  const limitCategoryIds = uniqueNumbers(items.map((item) => item.limitCategoryId));
  const gemPropertiesIds = uniqueNumbers(items.map((item) => item.gemPropertiesId));
  const requiredAbilityIds = uniqueNumbers(items.map((item) => item.requiredAbilityId));

  const [
    stats,
    damages,
    resistances,
    sockets,
    effects,
    subclasses,
    gameClasses,
    gameRaces,
    itemSetRows,
    itemSetMemberRows,
    itemSetEffectRows,
    limitCategories,
    gems,
    requiredAbilities,
  ] = await Promise.all([
    database
      .select({
        itemId: itemStats.itemId,
        slot: itemStats.slot,
        statType: itemStats.statType,
        value: itemStats.value,
      })
      .from(itemStats)
      .where(and(eq(itemStats.buildId, buildId), inArray(itemStats.itemId, itemIds)))
      .orderBy(itemStats.itemId, itemStats.slot),
    database
      .select({
        itemId: itemDamages.itemId,
        slot: itemDamages.slot,
        damageType: itemDamages.damageType,
        minimum: itemDamages.minimum,
        maximum: itemDamages.maximum,
      })
      .from(itemDamages)
      .where(and(eq(itemDamages.buildId, buildId), inArray(itemDamages.itemId, itemIds)))
      .orderBy(itemDamages.itemId, itemDamages.slot),
    database
      .select({
        itemId: itemResistances.itemId,
        school: itemResistances.school,
        value: itemResistances.value,
      })
      .from(itemResistances)
      .where(and(eq(itemResistances.buildId, buildId), inArray(itemResistances.itemId, itemIds)))
      .orderBy(itemResistances.itemId, itemResistances.school),
    database
      .select({
        itemId: itemSockets.itemId,
        slot: itemSockets.slot,
        socketType: itemSockets.socketType,
      })
      .from(itemSockets)
      .where(and(eq(itemSockets.buildId, buildId), inArray(itemSockets.itemId, itemIds)))
      .orderBy(itemSockets.itemId, itemSockets.slot),
    database
      .select({
        itemId: itemEffects.itemId,
        slot: itemEffects.slot,
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
      .where(and(eq(itemEffects.buildId, buildId), inArray(itemEffects.itemId, itemIds)))
      .orderBy(itemEffects.itemId, itemEffects.slot, itemEffects.itemEffectId),
    database
      .select({
        classId: itemSubclassVersions.classId,
        subclassId: itemSubclassVersions.subclassId,
        name: itemSubclassVersions.name,
        verboseName: itemSubclassVersions.verboseName,
      })
      .from(itemSubclassVersions)
      .where(eq(itemSubclassVersions.buildId, buildId)),
    database
      .select({ classId: gameClassVersions.classId, name: gameClassVersions.name })
      .from(gameClassVersions)
      .where(eq(gameClassVersions.buildId, buildId))
      .orderBy(gameClassVersions.classId),
    database
      .select({ raceId: gameRaceVersions.raceId, name: gameRaceVersions.name })
      .from(gameRaceVersions)
      .where(eq(gameRaceVersions.buildId, buildId))
      .orderBy(gameRaceVersions.raceId),
    itemSetIds.length > 0
      ? database
          .select({ itemSetId: itemSets.itemSetId, name: itemSets.name })
          .from(itemSets)
          .where(and(eq(itemSets.buildId, buildId), inArray(itemSets.itemSetId, itemSetIds)))
      : Promise.resolve([]),
    itemSetIds.length > 0
      ? database
          .select({
            itemSetId: itemSetMembers.itemSetId,
            itemId: itemSetMembers.itemId,
            name: itemVersions.name,
            quality: itemVersions.quality,
            slot: itemSetMembers.slot,
          })
          .from(itemSetMembers)
          .innerJoin(
            itemVersions,
            and(
              eq(itemVersions.buildId, itemSetMembers.buildId),
              eq(itemVersions.itemId, itemSetMembers.itemId),
            ),
          )
          .where(
            and(eq(itemSetMembers.buildId, buildId), inArray(itemSetMembers.itemSetId, itemSetIds)),
          )
          .orderBy(itemSetMembers.itemSetId, itemSetMembers.slot)
      : Promise.resolve([]),
    itemSetIds.length > 0
      ? database
          .select({
            itemSetId: itemSetEffects.itemSetId,
            threshold: itemSetEffects.threshold,
            spellId: itemSetEffects.spellId,
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
          .where(
            and(eq(itemSetEffects.buildId, buildId), inArray(itemSetEffects.itemSetId, itemSetIds)),
          )
          .orderBy(
            itemSetEffects.itemSetId,
            itemSetEffects.threshold,
            itemSetEffects.itemSetEffectId,
          )
      : Promise.resolve([]),
    limitCategoryIds.length > 0
      ? database
          .select({
            limitCategoryId: itemLimitCategoryVersions.limitCategoryId,
            name: itemLimitCategoryVersions.name,
            quantity: itemLimitCategoryVersions.quantity,
          })
          .from(itemLimitCategoryVersions)
          .where(
            and(
              eq(itemLimitCategoryVersions.buildId, buildId),
              inArray(itemLimitCategoryVersions.limitCategoryId, limitCategoryIds),
            ),
          )
      : Promise.resolve([]),
    gemPropertiesIds.length > 0
      ? database
          .select({
            gemPropertiesId: gemPropertyVersions.gemPropertiesId,
            enchantmentId: gemPropertyVersions.enchantmentId,
            socketType: gemPropertyVersions.socketType,
            minimumItemLevel: gemPropertyVersions.minimumItemLevel,
          })
          .from(gemPropertyVersions)
          .where(
            and(
              eq(gemPropertyVersions.buildId, buildId),
              inArray(gemPropertyVersions.gemPropertiesId, gemPropertiesIds),
            ),
          )
      : Promise.resolve([]),
    requiredAbilityIds.length > 0
      ? database
          .select({ spellId: spellVersions.spellId, name: spellVersions.name })
          .from(spellVersions)
          .where(
            and(
              eq(spellVersions.buildId, buildId),
              inArray(spellVersions.spellId, requiredAbilityIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const enchantmentIds = uniqueNumbers([
    ...items.map((item) => item.socketBonusEnchantmentId),
    ...gems.map((gem) => gem.enchantmentId),
  ]);
  const [enchantments, enchantmentEffects] = await Promise.all([
    enchantmentIds.length > 0
      ? database
          .select({ enchantmentId: itemEnchantments.enchantmentId, name: itemEnchantments.name })
          .from(itemEnchantments)
          .where(
            and(
              eq(itemEnchantments.buildId, buildId),
              inArray(itemEnchantments.enchantmentId, enchantmentIds),
            ),
          )
      : Promise.resolve([]),
    enchantmentIds.length > 0
      ? database
          .select({
            enchantmentId: itemEnchantmentEffects.enchantmentId,
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
              inArray(itemEnchantmentEffects.enchantmentId, enchantmentIds),
            ),
          )
          .orderBy(itemEnchantmentEffects.enchantmentId, itemEnchantmentEffects.slot)
      : Promise.resolve([]),
  ]);

  const statsByItem = groupBy(stats, (row) => row.itemId);
  const damagesByItem = groupBy(damages, (row) => row.itemId);
  const resistancesByItem = groupBy(resistances, (row) => row.itemId);
  const socketsByItem = groupBy(sockets, (row) => row.itemId);
  const effectsByItem = groupBy(effects, (row) => row.itemId);
  const subclassesByKey = new Map(
    subclasses.map((subclass) => [
      `${subclass.classId}:${subclass.subclassId}`,
      subclass.verboseName || subclass.name,
    ]),
  );
  const itemSetsById = new Map(itemSetRows.map((itemSet) => [itemSet.itemSetId, itemSet]));
  const setMembersById = groupBy(itemSetMemberRows, (member) => member.itemSetId);
  const setEffectsById = groupBy(itemSetEffectRows, (effect) => effect.itemSetId);
  const limitsById = new Map(
    limitCategories.map(({ limitCategoryId, ...limit }) => [limitCategoryId, limit]),
  );
  const gemsById = new Map(gems.map((gem) => [gem.gemPropertiesId, gem]));
  const requiredAbilitiesById = new Map(
    requiredAbilities.map((ability) => [ability.spellId, ability.name]),
  );
  const enchantmentEffectsById = groupBy(enchantmentEffects, (effect) => effect.enchantmentId);
  const enchantmentsById = new Map(
    enchantments.map((enchantment) => [
      enchantment.enchantmentId,
      {
        ...enchantment,
        effects: (enchantmentEffectsById.get(enchantment.enchantmentId) ?? []).map(
          ({ enchantmentId: _, ...effect }) => effect,
        ),
      },
    ]),
  );

  return items.map((item) => {
    const itemSet = item.itemSetId === null ? undefined : itemSetsById.get(item.itemSetId);
    const gemRow = item.gemPropertiesId === null ? undefined : gemsById.get(item.gemPropertiesId);
    const gemEnchantment = gemRow ? enchantmentsById.get(gemRow.enchantmentId) : undefined;
    const socketBonus =
      item.socketBonusEnchantmentId === null
        ? undefined
        : enchantmentsById.get(item.socketBonusEnchantmentId);

    return {
      itemId: item.itemId,
      name: item.name,
      description: item.description,
      iconFileDataId: item.iconFileDataId,
      quality: item.quality,
      itemLevel: item.itemLevel,
      maxCount: item.maxCount,
      limitCategory:
        item.limitCategoryId === null ? null : (limitsById.get(item.limitCategoryId) ?? null),
      binding: item.binding,
      inventoryType: item.inventoryType,
      className: itemClassNames[item.classId] ?? `Item class ${item.classId}`,
      subclassName: subclassesByKey.get(`${item.classId}:${item.subclassId}`) ?? null,
      damages: (damagesByItem.get(item.itemId) ?? []).map(({ itemId: _, ...damage }) => damage),
      delayMs: item.delayMs,
      resistances: (resistancesByItem.get(item.itemId) ?? []).map(
        ({ itemId: _, ...resistance }) => resistance,
      ),
      stats: (statsByItem.get(item.itemId) ?? []).map(({ itemId: _, ...stat }) => stat),
      sockets: (socketsByItem.get(item.itemId) ?? []).map(({ itemId: _, ...socket }) => socket),
      socketBonus: socketBonus ?? null,
      gem:
        gemRow && gemEnchantment
          ? {
              socketType: gemRow.socketType,
              minimumItemLevel: gemRow.minimumItemLevel,
              enchantment: gemEnchantment,
            }
          : null,
      maxDurability: item.maxDurability,
      allowableClassMask: item.allowableClassMask,
      allowedClasses: gameClasses.filter((gameClass) =>
        includesMaskValue(item.allowableClassMask, gameClass.classId),
      ),
      allowableRaceMask: item.allowableRaceMask,
      allowedRaces: gameRaces.filter((race) =>
        includesSplitMaskValue(item.allowableRaceMask, race.raceId),
      ),
      requiredLevel: item.requiredLevel,
      requiredSkillId: item.requiredSkillId,
      requiredSkillRank: item.requiredSkillRank,
      requiredAbilityId: item.requiredAbilityId,
      requiredAbilityName:
        item.requiredAbilityId === null
          ? null
          : (requiredAbilitiesById.get(item.requiredAbilityId) ?? null),
      minimumFactionId: item.minimumFactionId,
      minimumReputation: item.minimumReputation,
      effects: (effectsByItem.get(item.itemId) ?? []).map(
        ({ itemId: _, slot: __, ...effect }) => effect,
      ),
      itemSet: itemSet
        ? {
            itemSetId: itemSet.itemSetId,
            name: itemSet.name,
            members: (setMembersById.get(itemSet.itemSetId) ?? []).map(
              ({ itemSetId: _, slot: __, ...member }) => member,
            ),
            effects: (setEffectsById.get(itemSet.itemSetId) ?? []).map(
              ({ itemSetId: _, ...effect }) => ({
                ...effect,
                triggerType: 0,
                charges: 0,
                cooldownMs: -1,
                categoryCooldownMs: -1,
              }),
            ),
          }
        : null,
    };
  });
}

function uniqueNumbers(values: readonly (number | null)[]): number[] {
  return [...new Set(values.filter((value): value is number => value !== null))];
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
