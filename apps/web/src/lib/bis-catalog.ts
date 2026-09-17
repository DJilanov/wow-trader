import {
  adaptCatalogToBis,
  EQUIPPABLE_INVENTORY_TYPES,
  type AdaptedBisCatalog,
  type CatalogAvailabilityState,
} from "@wow-trader/bis";
import {
  contentAvailability,
  gameBuilds,
  gameClassVersions,
  gameRaceVersions,
  itemDamages,
  itemEffects,
  itemLimitCategoryVersions,
  itemResistances,
  itemSetEffects,
  itemSockets,
  itemStats,
  itemSubclassVersions,
  itemVersions,
  professionVersions,
} from "@wow-trader/db";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "./database";
import { TBC_CLIENT_PRODUCT } from "./game-versions";

export async function getTbcBisCatalog(): Promise<AdaptedBisCatalog | null> {
  const database = getDatabase();
  const [build] = await database
    .select()
    .from(gameBuilds)
    .where(and(eq(gameBuilds.status, "published"), eq(gameBuilds.product, TBC_CLIENT_PRODUCT)))
    .orderBy(desc(gameBuilds.publishedAt))
    .limit(1);
  if (!build) return null;

  const [items, classes, races, professions, subclasses, limits, setEffects, availabilityRows] =
    await Promise.all([
      database
        .select({
          itemId: itemVersions.itemId,
          name: itemVersions.name,
          quality: itemVersions.quality,
          itemLevel: itemVersions.itemLevel,
          iconFileDataId: itemVersions.iconFileDataId,
          classId: itemVersions.classId,
          subclassId: itemVersions.subclassId,
          inventoryType: itemVersions.inventoryType,
          requiredLevel: itemVersions.requiredLevel,
          requiredSkillId: itemVersions.requiredSkillId,
          requiredSkillRank: itemVersions.requiredSkillRank,
          requiredAbilityId: itemVersions.requiredAbilityId,
          minimumFactionId: itemVersions.minimumFactionId,
          minimumReputation: itemVersions.minimumReputation,
          allowableClassMask: itemVersions.allowableClassMask,
          allowableRaceMask: itemVersions.allowableRaceMask,
          maxCount: itemVersions.maxCount,
          delayMs: itemVersions.delayMs,
          itemSetId: itemVersions.itemSetId,
          limitCategoryId: itemVersions.limitCategoryId,
        })
        .from(itemVersions)
        .where(
          and(
            eq(itemVersions.buildId, build.id),
            inArray(itemVersions.inventoryType, EQUIPPABLE_INVENTORY_TYPES),
          ),
        ),
      database
        .select({ classId: gameClassVersions.classId })
        .from(gameClassVersions)
        .where(eq(gameClassVersions.buildId, build.id)),
      database
        .select({ raceId: gameRaceVersions.raceId })
        .from(gameRaceVersions)
        .where(eq(gameRaceVersions.buildId, build.id)),
      database
        .select({ skillLineId: professionVersions.skillLineId })
        .from(professionVersions)
        .where(eq(professionVersions.buildId, build.id)),
      database
        .select({
          classId: itemSubclassVersions.classId,
          subclassId: itemSubclassVersions.subclassId,
          prerequisiteProficiency: itemSubclassVersions.prerequisiteProficiency,
        })
        .from(itemSubclassVersions)
        .where(eq(itemSubclassVersions.buildId, build.id)),
      database
        .select({
          limitCategoryId: itemLimitCategoryVersions.limitCategoryId,
          quantity: itemLimitCategoryVersions.quantity,
        })
        .from(itemLimitCategoryVersions)
        .where(eq(itemLimitCategoryVersions.buildId, build.id)),
      database
        .select({
          itemSetId: itemSetEffects.itemSetId,
          threshold: itemSetEffects.threshold,
          spellId: itemSetEffects.spellId,
        })
        .from(itemSetEffects)
        .where(eq(itemSetEffects.buildId, build.id)),
      database
        .select({
          itemId: contentAvailability.entityId,
          state: contentAvailability.state,
        })
        .from(contentAvailability)
        .where(
          and(
            eq(contentAvailability.buildId, build.id),
            eq(contentAvailability.entityKind, "item"),
          ),
        ),
    ]);

  const itemIds = items.map(({ itemId }) => itemId);
  const [stats, damages, resistances, sockets, effects] = await Promise.all([
    database
      .select({ itemId: itemStats.itemId, statType: itemStats.statType, value: itemStats.value })
      .from(itemStats)
      .where(and(eq(itemStats.buildId, build.id), inArray(itemStats.itemId, itemIds))),
    database
      .select({
        itemId: itemDamages.itemId,
        damageType: itemDamages.damageType,
        minimum: itemDamages.minimum,
        maximum: itemDamages.maximum,
      })
      .from(itemDamages)
      .where(and(eq(itemDamages.buildId, build.id), inArray(itemDamages.itemId, itemIds))),
    database
      .select({
        itemId: itemResistances.itemId,
        school: itemResistances.school,
        value: itemResistances.value,
      })
      .from(itemResistances)
      .where(and(eq(itemResistances.buildId, build.id), inArray(itemResistances.itemId, itemIds))),
    database
      .select({ itemId: itemSockets.itemId, socketType: itemSockets.socketType })
      .from(itemSockets)
      .where(and(eq(itemSockets.buildId, build.id), inArray(itemSockets.itemId, itemIds))),
    database
      .select({ itemId: itemEffects.itemId, spellId: itemEffects.spellId })
      .from(itemEffects)
      .where(and(eq(itemEffects.buildId, build.id), inArray(itemEffects.itemId, itemIds))),
  ]);
  const availabilityByItem = resolveAvailability(availabilityRows);

  return adaptCatalogToBis({
    build: { product: build.product, buildNumber: build.buildNumber, phase: null },
    candidateCoverage: "partial",
    items: items.map((item) => ({
      ...item,
      availabilityState: availabilityByItem.get(item.itemId) ?? null,
      availableFromPhase: null,
      availableThroughPhase: null,
    })),
    stats,
    damages,
    resistances,
    sockets,
    itemEffects: effects,
    setEffects,
    limitCategories: limits,
    subclasses,
    classIds: classes.map(({ classId }) => classId),
    raceIds: races.map(({ raceId }) => raceId),
    professionSkillLineIds: professions.map(({ skillLineId }) => skillLineId),
  });
}

function resolveAvailability(
  rows: readonly { readonly itemId: number; readonly state: CatalogAvailabilityState }[],
): ReadonlyMap<number, CatalogAvailabilityState> {
  const states = new Map<number, CatalogAvailabilityState>();
  for (const row of rows) {
    const current = states.get(row.itemId);
    if (current === undefined || availabilityPriority(row.state) > availabilityPriority(current)) {
      states.set(row.itemId, row.state);
    }
  }
  return states;
}

function availabilityPriority(state: CatalogAvailabilityState): number {
  return {
    client_only: 0,
    announced: 1,
    observed: 2,
    available: 3,
    disabled: 4,
  }[state];
}
