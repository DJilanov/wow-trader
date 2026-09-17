import { z } from "zod";

import {
  isoDateTimeSchema,
  localeSchema,
  nonNegativeCopperSchema,
  sha256Schema,
  wowIdSchema,
} from "./primitives.js";

const artifactSchema = z.object({
  path: z.string().min(1),
  recordCount: z.number().int().nonnegative(),
  sha256: sha256Schema,
});

export const catalogSnapshotManifestSchema = z.object({
  schemaVersion: z.literal("catalog-snapshot-manifest.v4"),
  product: z.string().min(1),
  clientVersion: z.string().min(1),
  buildNumber: z.number().int().positive(),
  buildKey: z.string().regex(/^[a-fA-F0-9]{32}$/),
  cdnKey: z.string().regex(/^[a-fA-F0-9]{32}$/),
  locale: localeSchema,
  extractedAt: isoDateTimeSchema,
  hotfix: z.object({
    status: z.enum(["applied", "missing", "not_available"]),
    sha256: sha256Schema.nullable(),
  }),
  definitions: z.object({
    source: z.string().min(1),
    revision: z.string().min(1),
  }),
  extractor: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    revision: z.string().min(1).nullable(),
  }),
  rawTables: z.record(z.string().min(1), artifactSchema),
  normalizedArtifacts: z.record(z.string().min(1), artifactSchema),
});

export const catalogItemSchema = z.object({
  itemId: wowIdSchema,
  name: z.string().min(1),
  description: z.string(),
  classId: z.number().int().nonnegative(),
  subclassId: z.number().int().nonnegative(),
  quality: z.number().int().nonnegative(),
  requiredLevel: z.number().int().nonnegative(),
  itemLevel: z.number().int().nonnegative(),
  requiredSkillId: wowIdSchema.nullable(),
  requiredSkillRank: z.number().int().nonnegative(),
  stackSize: z.number().int().positive(),
  binding: z.number().int().nonnegative(),
  inventoryType: z.number().int().nonnegative(),
  allowableClassMask: z.number().int(),
  allowableRaceMask: z.array(z.number().int()),
  maxCount: z.number().int().nonnegative(),
  maxDurability: z.number().int().nonnegative(),
  delayMs: z.number().int().nonnegative(),
  damageType: z.number().int().nonnegative(),
  itemSetId: wowIdSchema.nullable(),
  limitCategoryId: wowIdSchema.nullable(),
  socketBonusEnchantmentId: wowIdSchema.nullable(),
  gemPropertiesId: wowIdSchema.nullable(),
  randomSuffixGroupId: wowIdSchema.nullable(),
  randomPropertyId: wowIdSchema.nullable(),
  requiredAbilityId: wowIdSchema.nullable(),
  minimumFactionId: wowIdSchema.nullable(),
  minimumReputation: z.number().int().nonnegative(),
  buyPriceCopper: nonNegativeCopperSchema,
  sellPriceCopper: nonNegativeCopperSchema,
  iconFileDataId: wowIdSchema.nullable(),
  rawRecord: z.record(z.string(), z.unknown()),
});

export const catalogSpellSchema = z.object({
  spellId: wowIdSchema,
  name: z.string().min(1),
  description: z.string(),
  auraDescription: z.string(),
  durationMs: z.number().int().nonnegative(),
  maximumDurationMs: z.number().int().nonnegative(),
  procChance: z.number().int().nonnegative().nullable(),
  procCharges: z.number().int().nullable(),
  procCooldownMs: z.number().int().nonnegative().nullable(),
  descriptionVariables: z.string(),
  rawRecord: z.record(z.string(), z.unknown()),
});

export const catalogItemStatSchema = z.object({
  itemId: wowIdSchema,
  slot: z.number().int().nonnegative(),
  statType: z.number().int().nonnegative(),
  value: z.number().int(),
});

export const catalogItemDamageSchema = z.object({
  itemId: wowIdSchema,
  slot: z.number().int().nonnegative(),
  damageType: z.number().int().nonnegative(),
  minimum: z.number().int(),
  maximum: z.number().int(),
});

export const catalogItemResistanceSchema = z.object({
  itemId: wowIdSchema,
  school: z.number().int().nonnegative(),
  value: z.number().int(),
});

export const catalogItemSocketSchema = z.object({
  itemId: wowIdSchema,
  slot: z.number().int().nonnegative(),
  socketType: z.number().int().positive(),
});

export const catalogItemEffectSchema = z.object({
  itemEffectId: wowIdSchema,
  itemId: wowIdSchema,
  slot: z.number().int().nonnegative(),
  spellId: wowIdSchema,
  triggerType: z.number().int().nonnegative(),
  charges: z.number().int(),
  cooldownMs: z.number().int(),
  categoryCooldownMs: z.number().int(),
  spellCategoryId: wowIdSchema.nullable(),
  specializationId: wowIdSchema.nullable(),
  playerConditionId: wowIdSchema.nullable(),
});

export const catalogItemSetSchema = z.object({
  itemSetId: wowIdSchema,
  name: z.string().min(1),
  flags: z.number().int(),
  requiredSkillId: wowIdSchema.nullable(),
  requiredSkillRank: z.number().int().nonnegative(),
  rawRecord: z.record(z.string(), z.unknown()),
});

export const catalogItemSetMemberSchema = z.object({
  itemSetId: wowIdSchema,
  itemId: wowIdSchema,
  slot: z.number().int().nonnegative(),
});

export const catalogItemSetEffectSchema = z.object({
  itemSetEffectId: wowIdSchema,
  itemSetId: wowIdSchema,
  spellId: wowIdSchema,
  threshold: z.number().int().nonnegative(),
  specializationId: wowIdSchema.nullable(),
});

export const catalogGameClassSchema = z.object({
  classId: wowIdSchema,
  name: z.string().min(1),
});

export const catalogGameRaceSchema = z.object({
  raceId: wowIdSchema,
  name: z.string().min(1),
});

export const catalogItemClassDefinitionSchema = z.object({
  classId: z.number().int().nonnegative(),
  name: z.string().min(1),
});

export const catalogItemSubclassDefinitionSchema = z.object({
  classId: z.number().int().nonnegative(),
  subclassId: z.number().int().nonnegative(),
  name: z.string(),
  verboseName: z.string(),
  prerequisiteProficiency: z.number().int().nonnegative(),
});

export const catalogItemLimitCategorySchema = z.object({
  limitCategoryId: wowIdSchema,
  name: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  flags: z.number().int(),
});

export const catalogGemPropertySchema = z.object({
  gemPropertiesId: wowIdSchema,
  enchantmentId: wowIdSchema,
  socketType: z.number().int().nonnegative(),
  minimumItemLevel: z.number().int().nonnegative(),
});

export const catalogItemEnchantmentSchema = z.object({
  enchantmentId: wowIdSchema,
  name: z.string(),
  charges: z.number().int(),
  gemItemId: wowIdSchema.nullable(),
  conditionId: wowIdSchema.nullable(),
  requiredSkillId: wowIdSchema.nullable(),
  requiredSkillRank: z.number().int().nonnegative(),
  minimumLevel: z.number().int().nonnegative(),
  maximumLevel: z.number().int().nonnegative(),
  rawRecord: z.record(z.string(), z.unknown()),
});

export const catalogItemEnchantmentEffectSchema = z.object({
  enchantmentId: wowIdSchema,
  slot: z.number().int().nonnegative(),
  effectType: z.number().int(),
  minimumPoints: z.number().int(),
  maximumPoints: z.number().int(),
  argument: z.number().int(),
});

export const catalogItemRandomEnchantmentSchema = z.object({
  kind: z.enum(["property", "suffix"]),
  variantId: wowIdSchema,
  name: z.string(),
  slot: z.number().int().nonnegative(),
  enchantmentId: wowIdSchema,
  allocationPercent: z.number().int().nonnegative(),
});

export const catalogItemBonusTreeSchema = z.object({
  itemId: wowIdSchema,
  bonusTreeId: wowIdSchema,
});

export const catalogItemBonusTreeNodeSchema = z.object({
  nodeId: wowIdSchema,
  bonusTreeId: wowIdSchema,
  itemContext: z.number().int().nonnegative(),
  childBonusTreeId: wowIdSchema.nullable(),
  childBonusListId: wowIdSchema.nullable(),
  childItemLevelSelectorId: wowIdSchema.nullable(),
  rawRecord: z.record(z.string(), z.unknown()),
});

export const catalogItemBonusSchema = z.object({
  bonusListId: wowIdSchema,
  orderIndex: z.number().int().nonnegative(),
  type: z.number().int(),
  values: z.array(z.number().int()),
});

export const catalogProfessionSchema = z.object({
  skillLineId: wowIdSchema,
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  rawRecord: z.record(z.string(), z.unknown()),
});

export const outputKindSchema = z.enum(["item", "enchantment", "service", "conversion"]);

export const extractionStatusSchema = z.enum([
  "complete",
  "missing_teaching_item",
  "missing_output",
  "ambiguous",
  "encrypted",
]);

export const catalogRecipeSchema = z.object({
  recipeSpellId: wowIdSchema,
  professionSkillLineId: wowIdSchema,
  requiredSkillRank: z.number().int().nonnegative(),
  craftTimeMs: z.number().int().nonnegative(),
  cooldownMs: z.number().int().nonnegative(),
  cooldownCategoryId: wowIdSchema.nullable(),
  categoryCooldownMs: z.number().int().nonnegative(),
  outputKind: outputKindSchema,
  extractionStatus: extractionStatusSchema,
  rawRecord: z.record(z.string(), z.unknown()),
});

export const catalogRecipeInputSchema = z.object({
  recipeSpellId: wowIdSchema,
  reagentItemId: wowIdSchema,
  quantity: z.number().int().positive(),
  optional: z.boolean(),
});

export const catalogRecipeOutputSchema = z
  .object({
    recipeSpellId: wowIdSchema,
    outputItemId: wowIdSchema.nullable(),
    enchantmentId: wowIdSchema.nullable(),
    minimumQuantity: z.number().int().nonnegative(),
    maximumQuantity: z.number().int().nonnegative(),
    expectedQuantityNumerator: z.number().int().nonnegative(),
    expectedQuantityDenominator: z.number().int().positive(),
  })
  .refine((value) => value.outputItemId !== null || value.enchantmentId !== null, {
    message: "A recipe output needs an item or enchantment ID",
  })
  .refine((value) => value.maximumQuantity >= value.minimumQuantity, {
    message: "Maximum output quantity cannot be smaller than minimum quantity",
  });

export const catalogRecipeTeachingItemSchema = z.object({
  recipeSpellId: wowIdSchema,
  teachingItemId: wowIdSchema,
  learningSpellId: wowIdSchema.nullable(),
});

export const catalogTransformationSchema = z.object({
  transformationId: wowIdSchema,
  spellId: wowIdSchema,
  sourceItemId: wowIdSchema,
  kind: z.literal("item_use"),
  cooldownMs: z.number().int().nonnegative(),
  categoryCooldownMs: z.number().int().nonnegative(),
  extractionStatus: extractionStatusSchema,
  rawRecord: z.record(z.string(), z.unknown()),
});

export const catalogTransformationInputSchema = z.object({
  transformationId: wowIdSchema,
  itemId: wowIdSchema,
  quantity: z.number().int().positive(),
});

export const catalogTransformationOutputSchema = z
  .object({
    transformationId: wowIdSchema,
    itemId: wowIdSchema,
    minimumQuantity: z.number().int().nonnegative(),
    maximumQuantity: z.number().int().nonnegative(),
    expectedQuantityNumerator: z.number().int().nonnegative(),
    expectedQuantityDenominator: z.number().int().positive(),
  })
  .refine((value) => value.maximumQuantity >= value.minimumQuantity, {
    message: "Maximum transformation output cannot be smaller than its minimum",
  });

export const catalogBundleSchema = z.object({
  manifest: catalogSnapshotManifestSchema,
  items: z.array(catalogItemSchema),
  spells: z.array(catalogSpellSchema),
  itemStats: z.array(catalogItemStatSchema),
  itemDamages: z.array(catalogItemDamageSchema),
  itemResistances: z.array(catalogItemResistanceSchema),
  itemSockets: z.array(catalogItemSocketSchema),
  itemEffects: z.array(catalogItemEffectSchema),
  itemSets: z.array(catalogItemSetSchema),
  itemSetMembers: z.array(catalogItemSetMemberSchema),
  itemSetEffects: z.array(catalogItemSetEffectSchema),
  gameClasses: z.array(catalogGameClassSchema),
  gameRaces: z.array(catalogGameRaceSchema),
  itemClasses: z.array(catalogItemClassDefinitionSchema),
  itemSubclasses: z.array(catalogItemSubclassDefinitionSchema),
  itemLimitCategories: z.array(catalogItemLimitCategorySchema),
  gemProperties: z.array(catalogGemPropertySchema),
  itemEnchantments: z.array(catalogItemEnchantmentSchema),
  itemEnchantmentEffects: z.array(catalogItemEnchantmentEffectSchema),
  itemRandomEnchantments: z.array(catalogItemRandomEnchantmentSchema),
  itemBonusTrees: z.array(catalogItemBonusTreeSchema),
  itemBonusTreeNodes: z.array(catalogItemBonusTreeNodeSchema),
  itemBonuses: z.array(catalogItemBonusSchema),
  professions: z.array(catalogProfessionSchema),
  recipes: z.array(catalogRecipeSchema),
  recipeInputs: z.array(catalogRecipeInputSchema),
  recipeOutputs: z.array(catalogRecipeOutputSchema),
  recipeTeachingItems: z.array(catalogRecipeTeachingItemSchema),
  transformations: z.array(catalogTransformationSchema),
  transformationInputs: z.array(catalogTransformationInputSchema),
  transformationOutputs: z.array(catalogTransformationOutputSchema),
});

export type CatalogSnapshotManifest = z.infer<typeof catalogSnapshotManifestSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogSpell = z.infer<typeof catalogSpellSchema>;
export type CatalogItemStat = z.infer<typeof catalogItemStatSchema>;
export type CatalogItemDamage = z.infer<typeof catalogItemDamageSchema>;
export type CatalogItemResistance = z.infer<typeof catalogItemResistanceSchema>;
export type CatalogItemSocket = z.infer<typeof catalogItemSocketSchema>;
export type CatalogItemEffect = z.infer<typeof catalogItemEffectSchema>;
export type CatalogItemSet = z.infer<typeof catalogItemSetSchema>;
export type CatalogItemSetMember = z.infer<typeof catalogItemSetMemberSchema>;
export type CatalogItemSetEffect = z.infer<typeof catalogItemSetEffectSchema>;
export type CatalogGameClass = z.infer<typeof catalogGameClassSchema>;
export type CatalogGameRace = z.infer<typeof catalogGameRaceSchema>;
export type CatalogItemClassDefinition = z.infer<typeof catalogItemClassDefinitionSchema>;
export type CatalogItemSubclassDefinition = z.infer<typeof catalogItemSubclassDefinitionSchema>;
export type CatalogItemLimitCategory = z.infer<typeof catalogItemLimitCategorySchema>;
export type CatalogGemProperty = z.infer<typeof catalogGemPropertySchema>;
export type CatalogItemEnchantment = z.infer<typeof catalogItemEnchantmentSchema>;
export type CatalogItemEnchantmentEffect = z.infer<typeof catalogItemEnchantmentEffectSchema>;
export type CatalogItemRandomEnchantment = z.infer<typeof catalogItemRandomEnchantmentSchema>;
export type CatalogItemBonusTree = z.infer<typeof catalogItemBonusTreeSchema>;
export type CatalogItemBonusTreeNode = z.infer<typeof catalogItemBonusTreeNodeSchema>;
export type CatalogItemBonus = z.infer<typeof catalogItemBonusSchema>;
export type CatalogProfession = z.infer<typeof catalogProfessionSchema>;
export type CatalogRecipe = z.infer<typeof catalogRecipeSchema>;
export type CatalogRecipeInput = z.infer<typeof catalogRecipeInputSchema>;
export type CatalogRecipeOutput = z.infer<typeof catalogRecipeOutputSchema>;
export type CatalogRecipeTeachingItem = z.infer<typeof catalogRecipeTeachingItemSchema>;
export type CatalogTransformation = z.infer<typeof catalogTransformationSchema>;
export type CatalogTransformationInput = z.infer<typeof catalogTransformationInputSchema>;
export type CatalogTransformationOutput = z.infer<typeof catalogTransformationOutputSchema>;
export type CatalogBundle = z.infer<typeof catalogBundleSchema>;
