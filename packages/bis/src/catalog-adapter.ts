import type {
  BuildReference,
  CandidateCoverage,
  EquipmentSlot,
  GearItem,
  GearSetBonus,
  ItemAvailability,
  StatKey,
} from "./types.js";

export type CatalogAvailabilityState =
  "announced" | "available" | "client_only" | "disabled" | "observed";

export interface CatalogItemRow {
  readonly itemId: number;
  readonly name: string;
  readonly quality: number;
  readonly itemLevel: number;
  readonly iconFileDataId: number | null;
  readonly classId: number;
  readonly subclassId: number;
  readonly inventoryType: number;
  readonly requiredLevel: number;
  readonly requiredSkillId: number | null;
  readonly requiredSkillRank: number;
  readonly requiredAbilityId: number | null;
  readonly minimumFactionId: number | null;
  readonly minimumReputation: number;
  readonly allowableClassMask: number;
  readonly allowableRaceMask: readonly number[];
  readonly maxCount: number;
  readonly delayMs: number;
  readonly itemSetId: number | null;
  readonly limitCategoryId: number | null;
  readonly availabilityState: CatalogAvailabilityState | null;
  readonly availableFromPhase: number | null;
  readonly availableThroughPhase: number | null;
}

export interface CatalogStatRow {
  readonly itemId: number;
  readonly statType: number;
  readonly value: number;
}

export interface CatalogDamageRow {
  readonly itemId: number;
  readonly damageType: number;
  readonly minimum: number;
  readonly maximum: number;
}

export interface CatalogResistanceRow {
  readonly itemId: number;
  readonly school: number;
  readonly value: number;
}

export interface CatalogSocketRow {
  readonly itemId: number;
  readonly socketType: number;
}

export interface CatalogItemEffectRow {
  readonly itemId: number;
  readonly spellId: number;
}

export interface CatalogSetEffectRow {
  readonly itemSetId: number;
  readonly threshold: number;
  readonly spellId: number;
}

export interface CatalogLimitCategoryRow {
  readonly limitCategoryId: number;
  readonly quantity: number;
}

export interface CatalogSubclassRow {
  readonly classId: number;
  readonly subclassId: number;
  readonly prerequisiteProficiency: number;
}

export interface CatalogToBisInput {
  readonly build: BuildReference;
  readonly candidateCoverage: CandidateCoverage;
  readonly items: readonly CatalogItemRow[];
  readonly stats: readonly CatalogStatRow[];
  readonly damages: readonly CatalogDamageRow[];
  readonly resistances: readonly CatalogResistanceRow[];
  readonly sockets: readonly CatalogSocketRow[];
  readonly itemEffects: readonly CatalogItemEffectRow[];
  readonly setEffects: readonly CatalogSetEffectRow[];
  readonly limitCategories: readonly CatalogLimitCategoryRow[];
  readonly subclasses: readonly CatalogSubclassRow[];
  readonly classIds: readonly number[];
  readonly raceIds: readonly number[];
  readonly professionSkillLineIds: readonly number[];
}

export interface AdaptedCatalogItem extends GearItem {
  readonly quality: number;
  readonly itemLevel: number;
  readonly iconFileDataId: number | null;
  readonly classId: number;
  readonly subclassId: number;
  readonly socketTypes: readonly number[];
}

export interface CatalogAdapterDiagnostics {
  readonly inputItemCount: number;
  readonly adaptedItemCount: number;
  readonly nonEquippableItemCount: number;
  readonly unknownAvailabilityItemCount: number;
  readonly disabledItemCount: number;
  readonly unknownStatTypeIds: readonly number[];
  readonly unknownResistanceSchoolIds: readonly number[];
}

export interface AdaptedBisCatalog {
  readonly build: BuildReference;
  readonly candidateCoverage: CandidateCoverage;
  readonly items: readonly AdaptedCatalogItem[];
  readonly setBonuses: readonly GearSetBonus[];
  readonly diagnostics: CatalogAdapterDiagnostics;
}

export const EQUIPPABLE_INVENTORY_TYPES = [
  1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 25, 26, 28,
] as const;

const slotsByInventoryType: Readonly<Record<number, readonly EquipmentSlot[]>> = {
  1: ["head"],
  2: ["neck"],
  3: ["shoulder"],
  5: ["chest"],
  6: ["waist"],
  7: ["legs"],
  8: ["feet"],
  9: ["wrist"],
  10: ["hands"],
  11: ["finger1", "finger2"],
  12: ["trinket1", "trinket2"],
  13: ["mainHand", "offHand"],
  14: ["offHand"],
  15: ["ranged"],
  16: ["back"],
  17: ["mainHand"],
  20: ["chest"],
  21: ["mainHand"],
  22: ["offHand"],
  23: ["offHand"],
  25: ["ranged"],
  26: ["ranged"],
  28: ["ranged"],
};

const statKeys: Readonly<Record<number, StatKey>> = {
  0: "mana",
  1: "health",
  3: "agility",
  4: "strength",
  5: "intellect",
  6: "spirit",
  7: "stamina",
  12: "defenseRating",
  13: "dodgeRating",
  14: "parryRating",
  15: "blockRating",
  16: "meleeHitRating",
  17: "rangedHitRating",
  18: "spellHitRating",
  19: "meleeCriticalStrikeRating",
  20: "rangedCriticalStrikeRating",
  21: "spellCriticalStrikeRating",
  28: "meleeHasteRating",
  29: "rangedHasteRating",
  30: "spellHasteRating",
  31: "hitRating",
  32: "criticalStrikeRating",
  35: "resilienceRating",
  36: "hasteRating",
  37: "expertiseRating",
  38: "attackPower",
  39: "rangedAttackPower",
  43: "manaPer5Seconds",
  44: "armorPenetrationRating",
  45: "spellPower",
  46: "healthPer5Seconds",
  47: "spellPenetration",
  48: "blockValue",
};

const resistanceKeys: Readonly<Record<number, StatKey>> = {
  0: "armor",
  1: "holyResistance",
  2: "fireResistance",
  3: "natureResistance",
  4: "frostResistance",
  5: "shadowResistance",
  6: "arcaneResistance",
};

export function inventoryTypeSlots(inventoryType: number): readonly EquipmentSlot[] {
  return slotsByInventoryType[inventoryType] ?? [];
}

export function catalogStatKey(statType: number): StatKey {
  return statKeys[statType] ?? `statType:${statType}`;
}

export function catalogResistanceKey(school: number): StatKey {
  return resistanceKeys[school] ?? `resistanceSchool:${school}`;
}

export function adaptCatalogToBis(input: CatalogToBisInput): AdaptedBisCatalog {
  validateReferenceData(input);

  const statsByItem = groupByItem(input.stats);
  const damagesByItem = groupByItem(input.damages);
  const resistancesByItem = groupByItem(input.resistances);
  const socketsByItem = groupByItem(input.sockets);
  const effectsByItem = groupByItem(input.itemEffects);
  const limitMaximumById = new Map(
    input.limitCategories.map((row) => [row.limitCategoryId, Math.max(1, row.quantity)]),
  );
  const proficiencyBySubclass = new Map(
    input.subclasses.map((row) => [
      `${row.classId}:${row.subclassId}`,
      row.prerequisiteProficiency,
    ]),
  );
  const professionSkillLineIds = new Set(input.professionSkillLineIds);
  const unknownStatTypeIds = new Set<number>();
  const unknownResistanceSchoolIds = new Set<number>();
  let nonEquippableItemCount = 0;
  let unknownAvailabilityItemCount = 0;
  let disabledItemCount = 0;
  const items: AdaptedCatalogItem[] = [];

  for (const item of input.items) {
    const slots = inventoryTypeSlots(item.inventoryType);
    if (slots.length === 0) {
      nonEquippableItemCount += 1;
      continue;
    }

    const stats: Record<StatKey, number> = {};
    for (const stat of statsByItem.get(item.itemId) ?? []) {
      const key = catalogStatKey(stat.statType);
      addStat(stats, key, stat.value);
      if (statKeys[stat.statType] === undefined) unknownStatTypeIds.add(stat.statType);
    }
    for (const resistance of resistancesByItem.get(item.itemId) ?? []) {
      const key = catalogResistanceKey(resistance.school);
      addStat(stats, key, resistance.value);
      if (resistanceKeys[resistance.school] === undefined) {
        unknownResistanceSchoolIds.add(resistance.school);
      }
    }

    const availability = mapAvailability(item.availabilityState);
    if (availability === "unknown") unknownAvailabilityItemCount += 1;
    if (availability === "unavailable") disabledItemCount += 1;
    const requiredSkillId = positiveOrNull(item.requiredSkillId);
    const minimumFactionId = positiveOrNull(item.minimumFactionId);
    const prerequisiteProficiency = positiveOrNull(
      proficiencyBySubclass.get(`${item.classId}:${item.subclassId}`) ?? null,
    );
    const requiredProfessionId =
      requiredSkillId !== null && professionSkillLineIds.has(requiredSkillId)
        ? requiredSkillId
        : null;
    const requiredProficiencyIds = uniqueSortedNumbers([
      requiredProfessionId === null ? requiredSkillId : null,
      prerequisiteProficiency,
    ]);
    const maximumEquipped =
      item.maxCount > 0 ? Math.min(item.maxCount, slots.length) : slots.length;
    const damages = (damagesByItem.get(item.itemId) ?? []).map((damage) => ({
      school: damage.damageType,
      minimum: damage.minimum,
      maximum: damage.maximum,
    }));

    items.push({
      itemId: item.itemId,
      variantId: `${item.itemId}:base`,
      name: item.name,
      quality: item.quality,
      itemLevel: item.itemLevel,
      iconFileDataId: item.iconFileDataId,
      classId: item.classId,
      subclassId: item.subclassId,
      socketTypes: (socketsByItem.get(item.itemId) ?? []).map(({ socketType }) => socketType),
      slots,
      stats,
      effectSpellIds: uniqueSortedNumbers(
        (effectsByItem.get(item.itemId) ?? []).map(({ spellId }) => spellId),
      ),
      setId: positiveOrNull(item.itemSetId),
      requiredLevel: Math.max(0, item.requiredLevel),
      allowedClassIds: maskIds(item.allowableClassMask, input.classIds),
      allowedRaceIds: splitMaskIds(item.allowableRaceMask, input.raceIds),
      allowedFactions: [],
      requiredProfessionId,
      requiredProfessionSpecializationId: null,
      requiredProficiencyIds,
      requiredAbilityIds: uniqueSortedNumbers([item.requiredAbilityId]),
      requiredSkillId,
      requiredSkillRank: requiredSkillId === null ? 0 : Math.max(0, item.requiredSkillRank),
      requiredReputation:
        minimumFactionId === null
          ? null
          : {
              factionId: minimumFactionId,
              minimumRank: Math.max(0, item.minimumReputation),
            },
      availableFromPhase: item.availableFromPhase,
      availableThroughPhase: item.availableThroughPhase,
      availability,
      uniqueGroupId: positiveOrNull(item.limitCategoryId),
      uniqueGroupMaximum:
        item.limitCategoryId === null ? 1 : (limitMaximumById.get(item.limitCategoryId) ?? 1),
      maximumEquipped: Math.max(1, maximumEquipped),
      blocksSlots: item.inventoryType === 17 ? ["offHand"] : [],
      ...(item.delayMs > 0 && damages.length > 0
        ? { weapon: { delayMs: item.delayMs, damages } }
        : {}),
    });
  }

  return {
    build: input.build,
    candidateCoverage: input.candidateCoverage,
    items,
    setBonuses: deduplicateSetBonuses(input.setEffects),
    diagnostics: {
      inputItemCount: input.items.length,
      adaptedItemCount: items.length,
      nonEquippableItemCount,
      unknownAvailabilityItemCount,
      disabledItemCount,
      unknownStatTypeIds: [...unknownStatTypeIds].sort(compareNumbers),
      unknownResistanceSchoolIds: [...unknownResistanceSchoolIds].sort(compareNumbers),
    },
  };
}

function validateReferenceData(input: CatalogToBisInput): void {
  if (input.classIds.length === 0) throw new Error("Catalog class IDs are required");
  if (input.raceIds.length === 0) throw new Error("Catalog race IDs are required");
  if (new Set(input.items.map(({ itemId }) => itemId)).size !== input.items.length) {
    throw new Error("Catalog item IDs must be unique");
  }
}

function mapAvailability(state: CatalogAvailabilityState | null): ItemAvailability {
  if (state === "available" || state === "observed") return "available";
  if (state === "disabled") return "unavailable";
  return "unknown";
}

function maskIds(mask: number, knownIds: readonly number[]): readonly number[] {
  if (mask === -1 || mask === 0) return [];
  return knownIds.filter((id) => id >= 1 && id <= 32 && ((mask >>> (id - 1)) & 1) === 1);
}

function splitMaskIds(mask: readonly number[], knownIds: readonly number[]): readonly number[] {
  if (mask.length === 0 || mask.every((word) => word === -1 || word === 0)) return [];
  return knownIds.filter((id) => {
    if (id < 1) return false;
    const zeroBasedId = id - 1;
    const word = mask[Math.floor(zeroBasedId / 32)];
    return word === -1 || (word !== undefined && ((word >>> (zeroBasedId % 32)) & 1) === 1);
  });
}

function positiveOrNull(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

function uniqueSortedNumbers(values: readonly (number | null)[]): readonly number[] {
  return [...new Set(values.filter((value): value is number => value !== null && value > 0))].sort(
    compareNumbers,
  );
}

function addStat(stats: Record<StatKey, number>, key: StatKey, value: number): void {
  stats[key] = (stats[key] ?? 0) + value;
}

function groupByItem<T extends { readonly itemId: number }>(rows: readonly T[]): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const values = grouped.get(row.itemId);
    if (values) values.push(row);
    else grouped.set(row.itemId, [row]);
  }
  return grouped;
}

function deduplicateSetBonuses(rows: readonly CatalogSetEffectRow[]): readonly GearSetBonus[] {
  return [
    ...new Map(
      rows.map((row) => [
        `${row.itemSetId}:${row.threshold}:${row.spellId}`,
        { setId: row.itemSetId, threshold: row.threshold, spellId: row.spellId },
      ]),
    ).values(),
  ].sort(
    (left, right) =>
      left.setId - right.setId || left.threshold - right.threshold || left.spellId - right.spellId,
  );
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}
