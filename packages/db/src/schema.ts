import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const buildStatusEnum = pgEnum("build_status", [
  "extracting",
  "validating",
  "review_required",
  "published",
  "rejected",
]);

export const hotfixStatusEnum = pgEnum("hotfix_status", ["applied", "missing", "not_available"]);

export const outputKindEnum = pgEnum("output_kind", [
  "item",
  "enchantment",
  "service",
  "conversion",
]);

export const transformationKindEnum = pgEnum("transformation_kind", ["item_use"]);

export const extractionStatusEnum = pgEnum("extraction_status", [
  "complete",
  "missing_teaching_item",
  "missing_output",
  "ambiguous",
  "encrypted",
]);

export const availabilityStateEnum = pgEnum("availability_state", [
  "client_only",
  "announced",
  "observed",
  "available",
  "disabled",
]);

export const auctionHouseTypeEnum = pgEnum("auction_house_type", [
  "alliance",
  "horde",
  "neutral",
  "region",
  "unknown",
]);

export const uploadStatusEnum = pgEnum("upload_status", [
  "accepted",
  "processing",
  "processed",
  "rejected",
]);

export const externalSnapshotStatusEnum = pgEnum("external_snapshot_status", [
  "review_required",
  "published",
  "rejected",
]);

export const gameBuilds = pgTable(
  "game_build",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotKey: text("snapshot_key").notNull(),
    product: text("product").notNull(),
    clientVersion: text("client_version").notNull(),
    buildNumber: integer("build_number").notNull(),
    buildKey: text("build_key").notNull(),
    cdnKey: text("cdn_key").notNull(),
    locale: text("locale").notNull(),
    hotfixStatus: hotfixStatusEnum("hotfix_status").notNull(),
    hotfixHash: text("hotfix_hash"),
    definitionsRevision: text("definitions_revision").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    status: buildStatusEnum("status").notNull().default("extracting"),
    extractedAt: timestamp("extracted_at", { withTimezone: true, mode: "date" }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    manifest: jsonb("manifest").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("game_build_snapshot_key_uidx").on(table.snapshotKey),
    index("game_build_current_idx").on(
      table.product,
      table.locale,
      table.status,
      table.publishedAt,
    ),
  ],
);

export const items = pgTable("item", {
  itemId: integer("item_id").primaryKey(),
  firstSeenBuildNumber: integer("first_seen_build_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const itemVersions = pgTable(
  "item_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.itemId),
    name: text("name").notNull(),
    description: text("description").notNull(),
    classId: integer("class_id").notNull(),
    subclassId: integer("subclass_id").notNull(),
    quality: integer("quality").notNull(),
    requiredLevel: integer("required_level").notNull(),
    itemLevel: integer("item_level").notNull(),
    requiredSkillId: integer("required_skill_id"),
    requiredSkillRank: integer("required_skill_rank").notNull(),
    stackSize: integer("stack_size").notNull(),
    binding: integer("binding").notNull(),
    inventoryType: integer("inventory_type").notNull(),
    allowableClassMask: integer("allowable_class_mask").notNull(),
    allowableRaceMask: jsonb("allowable_race_mask").$type<readonly number[]>().notNull(),
    maxCount: integer("max_count").notNull(),
    maxDurability: integer("max_durability").notNull(),
    delayMs: integer("delay_ms").notNull(),
    damageType: integer("damage_type").notNull(),
    itemSetId: integer("item_set_id"),
    limitCategoryId: integer("limit_category_id"),
    socketBonusEnchantmentId: integer("socket_bonus_enchantment_id"),
    gemPropertiesId: integer("gem_properties_id"),
    randomSuffixGroupId: integer("random_suffix_group_id"),
    randomPropertyId: integer("random_property_id"),
    requiredAbilityId: integer("required_ability_id"),
    minimumFactionId: integer("minimum_faction_id"),
    minimumReputation: integer("minimum_reputation").notNull(),
    buyPriceCopper: bigint("buy_price_copper", { mode: "bigint" }).notNull(),
    sellPriceCopper: bigint("sell_price_copper", { mode: "bigint" }).notNull(),
    iconFileDataId: integer("icon_file_data_id"),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.itemId] }),
    index("item_version_name_idx").on(table.name),
  ],
);

export const spells = pgTable("spell", {
  spellId: integer("spell_id").primaryKey(),
  firstSeenBuildNumber: integer("first_seen_build_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const spellVersions = pgTable(
  "spell_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    spellId: integer("spell_id")
      .notNull()
      .references(() => spells.spellId),
    name: text("name").notNull(),
    description: text("description").notNull(),
    auraDescription: text("aura_description").notNull(),
    durationMs: integer("duration_ms").notNull(),
    maximumDurationMs: integer("maximum_duration_ms").notNull(),
    procChance: integer("proc_chance"),
    procCharges: integer("proc_charges"),
    procCooldownMs: integer("proc_cooldown_ms"),
    descriptionVariables: text("description_variables").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.spellId] }),
    index("spell_version_name_idx").on(table.name),
  ],
);

export const itemStats = pgTable(
  "item_stat",
  {
    buildId: uuid("build_id").notNull(),
    itemId: integer("item_id").notNull(),
    slot: integer("slot").notNull(),
    statType: integer("stat_type").notNull(),
    value: integer("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.itemId, table.slot] }),
    foreignKey({
      name: "item_stat_item_version_fk",
      columns: [table.buildId, table.itemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }).onDelete("cascade"),
  ],
);

export const itemDamages = pgTable(
  "item_damage",
  {
    buildId: uuid("build_id").notNull(),
    itemId: integer("item_id").notNull(),
    slot: integer("slot").notNull(),
    damageType: integer("damage_type").notNull(),
    minimum: integer("minimum").notNull(),
    maximum: integer("maximum").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.itemId, table.slot] }),
    foreignKey({
      name: "item_damage_item_version_fk",
      columns: [table.buildId, table.itemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }).onDelete("cascade"),
  ],
);

export const itemResistances = pgTable(
  "item_resistance",
  {
    buildId: uuid("build_id").notNull(),
    itemId: integer("item_id").notNull(),
    school: integer("school").notNull(),
    value: integer("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.itemId, table.school] }),
    foreignKey({
      name: "item_resistance_item_version_fk",
      columns: [table.buildId, table.itemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }).onDelete("cascade"),
  ],
);

export const itemSockets = pgTable(
  "item_socket",
  {
    buildId: uuid("build_id").notNull(),
    itemId: integer("item_id").notNull(),
    slot: integer("slot").notNull(),
    socketType: integer("socket_type").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.itemId, table.slot] }),
    foreignKey({
      name: "item_socket_item_version_fk",
      columns: [table.buildId, table.itemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }).onDelete("cascade"),
  ],
);

export const itemEffects = pgTable(
  "item_effect",
  {
    buildId: uuid("build_id").notNull(),
    itemEffectId: integer("item_effect_id").notNull(),
    itemId: integer("item_id").notNull(),
    slot: integer("slot").notNull(),
    spellId: integer("spell_id").notNull(),
    triggerType: integer("trigger_type").notNull(),
    charges: integer("charges").notNull(),
    cooldownMs: integer("cooldown_ms").notNull(),
    categoryCooldownMs: integer("category_cooldown_ms").notNull(),
    spellCategoryId: integer("spell_category_id"),
    specializationId: integer("specialization_id"),
    playerConditionId: integer("player_condition_id"),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.itemEffectId] }),
    foreignKey({
      name: "item_effect_item_version_fk",
      columns: [table.buildId, table.itemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }).onDelete("cascade"),
    foreignKey({
      name: "item_effect_spell_version_fk",
      columns: [table.buildId, table.spellId],
      foreignColumns: [spellVersions.buildId, spellVersions.spellId],
    }).onDelete("cascade"),
    index("item_effect_item_idx").on(table.buildId, table.itemId),
  ],
);

export const itemSets = pgTable(
  "item_set_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    itemSetId: integer("item_set_id").notNull(),
    name: text("name").notNull(),
    flags: integer("flags").notNull(),
    requiredSkillId: integer("required_skill_id"),
    requiredSkillRank: integer("required_skill_rank").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.itemSetId] })],
);

export const itemSetMembers = pgTable(
  "item_set_member",
  {
    buildId: uuid("build_id").notNull(),
    itemSetId: integer("item_set_id").notNull(),
    itemId: integer("item_id").notNull(),
    slot: integer("slot").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.itemSetId, table.itemId] }),
    foreignKey({
      name: "item_set_member_set_fk",
      columns: [table.buildId, table.itemSetId],
      foreignColumns: [itemSets.buildId, itemSets.itemSetId],
    }).onDelete("cascade"),
    foreignKey({
      name: "item_set_member_item_version_fk",
      columns: [table.buildId, table.itemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }).onDelete("cascade"),
    index("item_set_member_item_idx").on(table.buildId, table.itemId),
  ],
);

export const itemSetEffects = pgTable(
  "item_set_effect",
  {
    buildId: uuid("build_id").notNull(),
    itemSetEffectId: integer("item_set_effect_id").notNull(),
    itemSetId: integer("item_set_id").notNull(),
    spellId: integer("spell_id").notNull(),
    threshold: integer("threshold").notNull(),
    specializationId: integer("specialization_id"),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.itemSetEffectId] }),
    foreignKey({
      name: "item_set_effect_set_fk",
      columns: [table.buildId, table.itemSetId],
      foreignColumns: [itemSets.buildId, itemSets.itemSetId],
    }).onDelete("cascade"),
    foreignKey({
      name: "item_set_effect_spell_version_fk",
      columns: [table.buildId, table.spellId],
      foreignColumns: [spellVersions.buildId, spellVersions.spellId],
    }).onDelete("cascade"),
  ],
);

export const gameClassVersions = pgTable(
  "game_class_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    classId: integer("class_id").notNull(),
    name: text("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.classId] })],
);

export const gameRaceVersions = pgTable(
  "game_race_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    raceId: integer("race_id").notNull(),
    name: text("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.raceId] })],
);

export const itemClassVersions = pgTable(
  "item_class_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    classId: integer("class_id").notNull(),
    name: text("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.classId] })],
);

export const itemSubclassVersions = pgTable(
  "item_subclass_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    classId: integer("class_id").notNull(),
    subclassId: integer("subclass_id").notNull(),
    name: text("name").notNull(),
    verboseName: text("verbose_name").notNull(),
    prerequisiteProficiency: integer("prerequisite_proficiency").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.classId, table.subclassId] })],
);

export const itemLimitCategoryVersions = pgTable(
  "item_limit_category_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    limitCategoryId: integer("limit_category_id").notNull(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    flags: integer("flags").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.limitCategoryId] })],
);

export const itemEnchantments = pgTable(
  "item_enchantment_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    enchantmentId: integer("enchantment_id").notNull(),
    name: text("name").notNull(),
    charges: integer("charges").notNull(),
    gemItemId: integer("gem_item_id"),
    conditionId: integer("condition_id"),
    requiredSkillId: integer("required_skill_id"),
    requiredSkillRank: integer("required_skill_rank").notNull(),
    minimumLevel: integer("minimum_level").notNull(),
    maximumLevel: integer("maximum_level").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.enchantmentId] })],
);

export const itemEnchantmentEffects = pgTable(
  "item_enchantment_effect",
  {
    buildId: uuid("build_id").notNull(),
    enchantmentId: integer("enchantment_id").notNull(),
    slot: integer("slot").notNull(),
    effectType: integer("effect_type").notNull(),
    minimumPoints: integer("minimum_points").notNull(),
    maximumPoints: integer("maximum_points").notNull(),
    argument: integer("argument").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.enchantmentId, table.slot] }),
    foreignKey({
      name: "item_enchantment_effect_enchantment_fk",
      columns: [table.buildId, table.enchantmentId],
      foreignColumns: [itemEnchantments.buildId, itemEnchantments.enchantmentId],
    }).onDelete("cascade"),
  ],
);

export const gemPropertyVersions = pgTable(
  "gem_property_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    gemPropertiesId: integer("gem_properties_id").notNull(),
    enchantmentId: integer("enchantment_id").notNull(),
    socketType: integer("socket_type").notNull(),
    minimumItemLevel: integer("minimum_item_level").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.gemPropertiesId] }),
    foreignKey({
      name: "gem_property_enchantment_fk",
      columns: [table.buildId, table.enchantmentId],
      foreignColumns: [itemEnchantments.buildId, itemEnchantments.enchantmentId],
    }).onDelete("cascade"),
  ],
);

export const itemRandomEnchantments = pgTable(
  "item_random_enchantment",
  {
    buildId: uuid("build_id").notNull(),
    kind: text("kind").notNull(),
    variantId: integer("variant_id").notNull(),
    name: text("name").notNull(),
    slot: integer("slot").notNull(),
    enchantmentId: integer("enchantment_id").notNull(),
    allocationPercent: integer("allocation_percent").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.kind, table.variantId, table.slot] }),
    foreignKey({
      name: "item_random_enchantment_enchantment_fk",
      columns: [table.buildId, table.enchantmentId],
      foreignColumns: [itemEnchantments.buildId, itemEnchantments.enchantmentId],
    }).onDelete("cascade"),
  ],
);

export const itemBonusTrees = pgTable(
  "item_bonus_tree",
  {
    buildId: uuid("build_id").notNull(),
    itemId: integer("item_id").notNull(),
    bonusTreeId: integer("bonus_tree_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.itemId, table.bonusTreeId] }),
    foreignKey({
      name: "item_bonus_tree_item_version_fk",
      columns: [table.buildId, table.itemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }).onDelete("cascade"),
  ],
);

export const itemBonusTreeNodes = pgTable(
  "item_bonus_tree_node_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    nodeId: integer("node_id").notNull(),
    bonusTreeId: integer("bonus_tree_id").notNull(),
    itemContext: integer("item_context").notNull(),
    childBonusTreeId: integer("child_bonus_tree_id"),
    childBonusListId: integer("child_bonus_list_id"),
    childItemLevelSelectorId: integer("child_item_level_selector_id"),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.nodeId] }),
    index("item_bonus_tree_node_tree_idx").on(table.buildId, table.bonusTreeId),
  ],
);

export const itemBonuses = pgTable(
  "item_bonus_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    bonusListId: integer("bonus_list_id").notNull(),
    orderIndex: integer("order_index").notNull(),
    type: integer("type").notNull(),
    values: jsonb("values").$type<readonly number[]>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.bonusListId, table.orderIndex] })],
);

export const professions = pgTable("profession", {
  skillLineId: integer("skill_line_id").primaryKey(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const professionVersions = pgTable(
  "profession_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    skillLineId: integer("skill_line_id")
      .notNull()
      .references(() => professions.skillLineId),
    name: text("name").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.skillLineId] })],
);

export const recipes = pgTable("recipe", {
  recipeSpellId: integer("recipe_spell_id")
    .primaryKey()
    .references(() => spells.spellId),
  firstSeenBuildNumber: integer("first_seen_build_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const recipeVersions = pgTable(
  "recipe_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    recipeSpellId: integer("recipe_spell_id")
      .notNull()
      .references(() => recipes.recipeSpellId),
    professionSkillLineId: integer("profession_skill_line_id")
      .notNull()
      .references(() => professions.skillLineId),
    requiredSkillRank: integer("required_skill_rank").notNull(),
    craftTimeMs: integer("craft_time_ms").notNull(),
    cooldownMs: integer("cooldown_ms").notNull().default(0),
    cooldownCategoryId: integer("cooldown_category_id"),
    categoryCooldownMs: integer("category_cooldown_ms").notNull().default(0),
    outputKind: outputKindEnum("output_kind").notNull(),
    extractionStatus: extractionStatusEnum("extraction_status").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.recipeSpellId] }),
    foreignKey({
      name: "recipe_version_spell_version_fk",
      columns: [table.buildId, table.recipeSpellId],
      foreignColumns: [spellVersions.buildId, spellVersions.spellId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recipe_version_profession_version_fk",
      columns: [table.buildId, table.professionSkillLineId],
      foreignColumns: [professionVersions.buildId, professionVersions.skillLineId],
    }).onDelete("cascade"),
    check("recipe_version_required_skill_check", sql`${table.requiredSkillRank} >= 0`),
    check("recipe_version_craft_time_check", sql`${table.craftTimeMs} >= 0`),
    check("recipe_version_cooldown_check", sql`${table.cooldownMs} >= 0`),
    check("recipe_version_category_cooldown_check", sql`${table.categoryCooldownMs} >= 0`),
    index("recipe_version_profession_idx").on(table.buildId, table.professionSkillLineId),
  ],
);

export const recipeInputs = pgTable(
  "recipe_input",
  {
    buildId: uuid("build_id").notNull(),
    recipeSpellId: integer("recipe_spell_id").notNull(),
    slot: integer("slot").notNull(),
    reagentItemId: integer("reagent_item_id")
      .notNull()
      .references(() => items.itemId),
    quantity: integer("quantity").notNull(),
    optional: boolean("optional").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.recipeSpellId, table.slot] }),
    foreignKey({
      name: "recipe_input_recipe_version_fk",
      columns: [table.buildId, table.recipeSpellId],
      foreignColumns: [recipeVersions.buildId, recipeVersions.recipeSpellId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recipe_input_item_version_fk",
      columns: [table.buildId, table.reagentItemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }),
    check("recipe_input_quantity_check", sql`${table.quantity} > 0`),
    index("recipe_input_reagent_idx").on(table.buildId, table.reagentItemId),
  ],
);

export const recipeOutputs = pgTable(
  "recipe_output",
  {
    buildId: uuid("build_id").notNull(),
    recipeSpellId: integer("recipe_spell_id").notNull(),
    slot: integer("slot").notNull(),
    outputItemId: integer("output_item_id").references(() => items.itemId),
    enchantmentId: integer("enchantment_id"),
    minimumQuantity: integer("minimum_quantity").notNull(),
    maximumQuantity: integer("maximum_quantity").notNull(),
    expectedQuantityNumerator: bigint("expected_quantity_numerator", { mode: "bigint" }).notNull(),
    expectedQuantityDenominator: bigint("expected_quantity_denominator", {
      mode: "bigint",
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.recipeSpellId, table.slot] }),
    foreignKey({
      name: "recipe_output_recipe_version_fk",
      columns: [table.buildId, table.recipeSpellId],
      foreignColumns: [recipeVersions.buildId, recipeVersions.recipeSpellId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recipe_output_item_version_fk",
      columns: [table.buildId, table.outputItemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }),
    check(
      "recipe_output_identity_check",
      sql`${table.outputItemId} IS NOT NULL OR ${table.enchantmentId} IS NOT NULL`,
    ),
    check("recipe_output_minimum_check", sql`${table.minimumQuantity} >= 0`),
    check("recipe_output_range_check", sql`${table.maximumQuantity} >= ${table.minimumQuantity}`),
    check(
      "recipe_output_expected_denominator_check",
      sql`${table.expectedQuantityDenominator} > 0`,
    ),
    index("recipe_output_item_idx").on(table.buildId, table.outputItemId),
  ],
);

export const recipeTeachingItems = pgTable(
  "recipe_teaching_item",
  {
    buildId: uuid("build_id").notNull(),
    recipeSpellId: integer("recipe_spell_id").notNull(),
    teachingItemId: integer("teaching_item_id")
      .notNull()
      .references(() => items.itemId),
    learningSpellId: integer("learning_spell_id"),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.recipeSpellId, table.teachingItemId] }),
    foreignKey({
      name: "recipe_teaching_item_recipe_version_fk",
      columns: [table.buildId, table.recipeSpellId],
      foreignColumns: [recipeVersions.buildId, recipeVersions.recipeSpellId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recipe_teaching_item_item_version_fk",
      columns: [table.buildId, table.teachingItemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }),
    foreignKey({
      name: "recipe_teaching_item_learning_spell_version_fk",
      columns: [table.buildId, table.learningSpellId],
      foreignColumns: [spellVersions.buildId, spellVersions.spellId],
    }),
  ],
);

export const transformationVersions = pgTable(
  "transformation_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    transformationId: integer("transformation_id").notNull(),
    spellId: integer("spell_id").notNull(),
    sourceItemId: integer("source_item_id").notNull(),
    kind: transformationKindEnum("kind").notNull(),
    cooldownMs: integer("cooldown_ms").notNull().default(0),
    categoryCooldownMs: integer("category_cooldown_ms").notNull().default(0),
    extractionStatus: extractionStatusEnum("extraction_status").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.transformationId] }),
    foreignKey({
      name: "transformation_version_spell_version_fk",
      columns: [table.buildId, table.spellId],
      foreignColumns: [spellVersions.buildId, spellVersions.spellId],
    }).onDelete("cascade"),
    foreignKey({
      name: "transformation_version_source_item_fk",
      columns: [table.buildId, table.sourceItemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }).onDelete("cascade"),
    check("transformation_version_cooldown_check", sql`${table.cooldownMs} >= 0`),
    check("transformation_version_category_cooldown_check", sql`${table.categoryCooldownMs} >= 0`),
    index("transformation_version_spell_idx").on(table.buildId, table.spellId),
  ],
);

export const transformationInputs = pgTable(
  "transformation_input",
  {
    buildId: uuid("build_id").notNull(),
    transformationId: integer("transformation_id").notNull(),
    slot: integer("slot").notNull(),
    itemId: integer("item_id").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.transformationId, table.slot] }),
    foreignKey({
      name: "transformation_input_version_fk",
      columns: [table.buildId, table.transformationId],
      foreignColumns: [transformationVersions.buildId, transformationVersions.transformationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "transformation_input_item_version_fk",
      columns: [table.buildId, table.itemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }),
    check("transformation_input_quantity_check", sql`${table.quantity} > 0`),
    index("transformation_input_item_idx").on(table.buildId, table.itemId),
  ],
);

export const transformationOutputs = pgTable(
  "transformation_output",
  {
    buildId: uuid("build_id").notNull(),
    transformationId: integer("transformation_id").notNull(),
    slot: integer("slot").notNull(),
    itemId: integer("item_id").notNull(),
    minimumQuantity: integer("minimum_quantity").notNull(),
    maximumQuantity: integer("maximum_quantity").notNull(),
    expectedQuantityNumerator: bigint("expected_quantity_numerator", { mode: "bigint" }).notNull(),
    expectedQuantityDenominator: bigint("expected_quantity_denominator", {
      mode: "bigint",
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.transformationId, table.slot] }),
    foreignKey({
      name: "transformation_output_version_fk",
      columns: [table.buildId, table.transformationId],
      foreignColumns: [transformationVersions.buildId, transformationVersions.transformationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "transformation_output_item_version_fk",
      columns: [table.buildId, table.itemId],
      foreignColumns: [itemVersions.buildId, itemVersions.itemId],
    }),
    check("transformation_output_minimum_check", sql`${table.minimumQuantity} >= 0`),
    check(
      "transformation_output_range_check",
      sql`${table.maximumQuantity} >= ${table.minimumQuantity}`,
    ),
    check(
      "transformation_output_expected_denominator_check",
      sql`${table.expectedQuantityDenominator} > 0`,
    ),
    index("transformation_output_item_idx").on(table.buildId, table.itemId),
  ],
);

export const contentAvailability = pgTable(
  "content_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildId: uuid("build_id")
      .notNull()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    entityKind: text("entity_kind").notNull(),
    entityId: integer("entity_id").notNull(),
    state: availabilityStateEnum("state").notNull(),
    region: text("region"),
    phase: text("phase"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }),
    effectiveUntil: timestamp("effective_until", { withTimezone: true, mode: "date" }),
    evidenceId: uuid("evidence_id"),
  },
  (table) => [
    index("content_availability_entity_idx").on(table.buildId, table.entityKind, table.entityId),
  ],
);

export const rawUploads = pgTable(
  "raw_upload",
  {
    payloadId: uuid("payload_id").primaryKey(),
    payloadType: text("payload_type").notNull(),
    schemaVersion: text("schema_version").notNull(),
    checksum: text("checksum").notNull(),
    envelopeHash: text("envelope_hash").notNull(),
    status: uploadStatusEnum("status").notNull(),
    clientProduct: text("client_product").notNull(),
    clientBuild: integer("client_build").notNull(),
    locale: text("locale").notNull(),
    region: text("region").notNull(),
    realmId: text("realm_id").notNull(),
    auctionHouseType: auctionHouseTypeEnum("auction_house_type").notNull(),
    sourceCharacterName: text("source_character_name"),
    sourceCharacterRealmId: text("source_character_realm_id"),
    sourceCharacterFaction: text("source_character_faction"),
    sourceCharacterGuid: text("source_character_guid"),
    anonymousInstallationId: text("anonymous_installation_id").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }).notNull(),
    completeness: doublePrecision("completeness").notNull(),
    rawPayloadUri: text("raw_payload_uri"),
    errorCode: text("error_code"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("raw_upload_status_idx").on(table.status, table.receivedAt),
    index("raw_upload_market_idx").on(table.region, table.realmId, table.auctionHouseType),
  ],
);

export const marketScans = pgTable(
  "market_scan",
  {
    scanId: uuid("scan_id").primaryKey(),
    payloadId: uuid("payload_id")
      .notNull()
      .references(() => rawUploads.payloadId, { onDelete: "cascade" }),
    clientBuild: integer("client_build").notNull(),
    region: text("region").notNull(),
    realmId: text("realm_id").notNull(),
    auctionHouseType: auctionHouseTypeEnum("auction_house_type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }).notNull(),
    completeness: doublePrecision("completeness").notNull(),
    itemCount: integer("item_count").notNull(),
    priceLevelCount: integer("price_level_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("market_scan_payload_uidx").on(table.payloadId),
    check(
      "market_scan_completeness_check",
      sql`${table.completeness} >= 0 AND ${table.completeness} <= 1`,
    ),
    check("market_scan_time_check", sql`${table.completedAt} >= ${table.startedAt}`),
    check("market_scan_item_count_check", sql`${table.itemCount} >= 0`),
    check("market_scan_price_level_count_check", sql`${table.priceLevelCount} >= 0`),
    index("market_scan_market_time_idx").on(
      table.region,
      table.realmId,
      table.auctionHouseType,
      table.completedAt,
    ),
  ],
);

export const auctionPriceLevels = pgTable(
  "auction_price_level",
  {
    scanId: uuid("scan_id")
      .notNull()
      .references(() => marketScans.scanId, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull(),
    marketKey: text("market_key").notNull(),
    unitPriceCopper: bigint("unit_price_copper", { mode: "bigint" }).notNull(),
    quantity: integer("quantity").notNull(),
    listingCount: integer("listing_count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scanId, table.marketKey, table.unitPriceCopper] }),
    check("auction_price_level_price_check", sql`${table.unitPriceCopper} > 0`),
    check("auction_price_level_quantity_check", sql`${table.quantity} > 0`),
    check("auction_price_level_listing_count_check", sql`${table.listingCount} > 0`),
    index("auction_price_level_item_idx").on(table.itemId, table.scanId),
    index("auction_price_level_market_key_idx").on(table.marketKey, table.unitPriceCopper),
  ],
);

export const worldSnapshots = pgTable(
  "world_snapshot",
  {
    buildId: uuid("build_id")
      .primaryKey()
      .references(() => gameBuilds.id, { onDelete: "cascade" }),
    snapshotKey: text("snapshot_key").notNull(),
    status: externalSnapshotStatusEnum("status").notNull().default("review_required"),
    extractedAt: timestamp("extracted_at", { withTimezone: true, mode: "date" }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    manifest: jsonb("manifest").notNull(),
  },
  (table) => [uniqueIndex("world_snapshot_snapshot_key_uidx").on(table.snapshotKey)],
);

export const worldMapVersions = pgTable(
  "world_map_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    mapId: integer("map_id").notNull(),
    directory: text("directory").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    mapType: integer("map_type").notNull(),
    instanceType: integer("instance_type").notNull(),
    expansionId: integer("expansion_id").notNull(),
    areaTableId: integer("area_table_id").notNull(),
    parentMapId: integer("parent_map_id"),
    cosmeticParentMapId: integer("cosmetic_parent_map_id"),
    maxPlayers: integer("max_players").notNull(),
    wdtFileDataId: integer("wdt_file_data_id"),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.mapId] }),
    index("world_map_name_idx").on(table.buildId, table.name),
  ],
);

export const worldAreaVersions = pgTable(
  "world_area_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    areaId: integer("area_id").notNull(),
    mapId: integer("map_id").notNull(),
    parentAreaId: integer("parent_area_id"),
    name: text("name").notNull(),
    zoneName: text("zone_name").notNull(),
    explorationLevel: integer("exploration_level").notNull(),
    factionGroupMask: integer("faction_group_mask").notNull(),
    flags: jsonb("flags").$type<readonly number[]>().notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.areaId] }),
    index("world_area_map_idx").on(table.buildId, table.mapId),
    index("world_area_name_idx").on(table.buildId, table.name),
  ],
);

export const worldUiMapVersions = pgTable(
  "world_ui_map_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    uiMapId: integer("ui_map_id").notNull(),
    name: text("name").notNull(),
    parentUiMapId: integer("parent_ui_map_id"),
    type: integer("type").notNull(),
    system: integer("system").notNull(),
    flags: integer("flags").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.uiMapId] }),
    index("world_ui_map_name_idx").on(table.buildId, table.name),
  ],
);

export const worldUiMapAssignments = pgTable(
  "world_ui_map_assignment",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    assignmentId: integer("assignment_id").notNull(),
    uiMapId: integer("ui_map_id").notNull(),
    mapId: integer("map_id").notNull(),
    areaId: integer("area_id"),
    orderIndex: integer("order_index").notNull(),
    uiMinX: doublePrecision("ui_min_x").notNull(),
    uiMinY: doublePrecision("ui_min_y").notNull(),
    uiMaxX: doublePrecision("ui_max_x").notNull(),
    uiMaxY: doublePrecision("ui_max_y").notNull(),
    region: jsonb("region").$type<readonly number[]>().notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.assignmentId] }),
    foreignKey({
      name: "world_ui_map_assignment_ui_map_fk",
      columns: [table.buildId, table.uiMapId],
      foreignColumns: [worldUiMapVersions.buildId, worldUiMapVersions.uiMapId],
    }).onDelete("cascade"),
    index("world_ui_map_assignment_lookup_idx").on(
      table.buildId,
      table.uiMapId,
      table.mapId,
      table.areaId,
    ),
  ],
);

export const worldMapArts = pgTable(
  "world_map_art",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    mapArtId: integer("map_art_id").notNull(),
    styleId: integer("style_id").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.mapArtId] })],
);

export const worldUiMapArtLinks = pgTable(
  "world_ui_map_art_link",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    linkId: integer("link_id").notNull(),
    uiMapId: integer("ui_map_id").notNull(),
    mapArtId: integer("map_art_id").notNull(),
    phaseId: integer("phase_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.linkId] }),
    foreignKey({
      name: "world_ui_map_art_link_ui_map_fk",
      columns: [table.buildId, table.uiMapId],
      foreignColumns: [worldUiMapVersions.buildId, worldUiMapVersions.uiMapId],
    }).onDelete("cascade"),
    foreignKey({
      name: "world_ui_map_art_link_art_fk",
      columns: [table.buildId, table.mapArtId],
      foreignColumns: [worldMapArts.buildId, worldMapArts.mapArtId],
    }).onDelete("cascade"),
    index("world_ui_map_art_link_lookup_idx").on(table.buildId, table.uiMapId, table.phaseId),
  ],
);

export const worldMapArtLayers = pgTable(
  "world_map_art_layer",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    layerId: integer("layer_id").notNull(),
    styleId: integer("style_id").notNull(),
    layerIndex: integer("layer_index").notNull(),
    layerWidth: integer("layer_width").notNull(),
    layerHeight: integer("layer_height").notNull(),
    tileWidth: integer("tile_width").notNull(),
    tileHeight: integer("tile_height").notNull(),
    minScale: doublePrecision("min_scale").notNull(),
    maxScale: doublePrecision("max_scale").notNull(),
    additionalZoomSteps: integer("additional_zoom_steps").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.layerId] }),
    index("world_map_art_layer_style_idx").on(table.buildId, table.styleId, table.layerIndex),
  ],
);

export const worldMapArtTiles = pgTable(
  "world_map_art_tile",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    tileId: integer("tile_id").notNull(),
    mapArtId: integer("map_art_id").notNull(),
    layerIndex: integer("layer_index").notNull(),
    rowIndex: integer("row_index").notNull(),
    columnIndex: integer("column_index").notNull(),
    fileDataId: integer("file_data_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.tileId] }),
    foreignKey({
      name: "world_map_art_tile_art_fk",
      columns: [table.buildId, table.mapArtId],
      foreignColumns: [worldMapArts.buildId, worldMapArts.mapArtId],
    }).onDelete("cascade"),
    index("world_map_art_tile_grid_idx").on(
      table.buildId,
      table.mapArtId,
      table.layerIndex,
      table.rowIndex,
      table.columnIndex,
    ),
  ],
);

export const worldPoiVersions = pgTable(
  "world_poi_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    entityId: integer("entity_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    mapId: integer("map_id"),
    areaId: integer("area_id"),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    z: doublePrecision("z").notNull(),
    iconId: integer("icon_id"),
    typeId: integer("type_id"),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.kind, table.entityId] }),
    index("world_poi_map_idx").on(table.buildId, table.mapId, table.kind),
    index("world_poi_name_idx").on(table.buildId, table.name),
  ],
);

export const worldEncounterVersions = pgTable(
  "world_encounter_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    encounterId: integer("encounter_id").notNull(),
    mapId: integer("map_id").notNull(),
    difficultyId: integer("difficulty_id").notNull(),
    name: text("name").notNull(),
    orderIndex: integer("order_index").notNull(),
    flags: integer("flags").notNull(),
    iconFileDataId: integer("icon_file_data_id"),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.encounterId] }),
    index("world_encounter_map_idx").on(
      table.buildId,
      table.mapId,
      table.difficultyId,
      table.orderIndex,
    ),
    index("world_encounter_name_idx").on(table.buildId, table.name),
  ],
);

export const worldLfgDungeonVersions = pgTable(
  "world_lfg_dungeon_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    lfgDungeonId: integer("lfg_dungeon_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    mapId: integer("map_id"),
    difficultyId: integer("difficulty_id").notNull(),
    contentTuningId: integer("content_tuning_id").notNull(),
    typeId: integer("type_id").notNull(),
    subtype: integer("subtype").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.lfgDungeonId] }),
    index("world_lfg_dungeon_name_idx").on(table.buildId, table.name),
  ],
);

export const worldQuestVersions = pgTable(
  "world_quest_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    questId: integer("quest_id").notNull(),
    uniqueBitFlag: integer("unique_bit_flag").notNull(),
    uiQuestDetailsThemeId: integer("ui_quest_details_theme_id").notNull(),
    title: text("title"),
    availabilityState: text("availability_state").notNull().default("client_id_present"),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.questId] }),
    index("world_quest_title_idx").on(table.buildId, table.title),
    index("world_quest_availability_idx").on(table.buildId, table.availabilityState),
  ],
);

export const worldQuestLineVersions = pgTable(
  "world_quest_line_version",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    questLineId: integer("quest_line_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    flags: integer("flags").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.questLineId] })],
);

export const worldQuestLineMembers = pgTable(
  "world_quest_line_member",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    relationId: integer("relation_id").notNull(),
    questLineId: integer("quest_line_id").notNull(),
    questId: integer("quest_id").notNull(),
    orderIndex: integer("order_index").notNull(),
    flags: integer("flags").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.relationId] }),
    foreignKey({
      name: "world_quest_line_member_line_fk",
      columns: [table.buildId, table.questLineId],
      foreignColumns: [worldQuestLineVersions.buildId, worldQuestLineVersions.questLineId],
    }).onDelete("cascade"),
    foreignKey({
      name: "world_quest_line_member_quest_fk",
      columns: [table.buildId, table.questId],
      foreignColumns: [worldQuestVersions.buildId, worldQuestVersions.questId],
    }).onDelete("cascade"),
    index("world_quest_line_member_order_idx").on(
      table.buildId,
      table.questLineId,
      table.orderIndex,
    ),
  ],
);

export const worldQuestPois = pgTable(
  "world_quest_poi",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    blobId: integer("blob_id").notNull(),
    questId: integer("quest_id").notNull(),
    mapId: integer("map_id").notNull(),
    uiMapId: integer("ui_map_id"),
    objectiveIndex: integer("objective_index").notNull(),
    objectiveId: integer("objective_id"),
    flags: integer("flags").notNull(),
    points: jsonb("points")
      .$type<
        readonly {
          readonly pointId: number;
          readonly x: number;
          readonly y: number;
          readonly z: number;
        }[]
      >()
      .notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.blobId] }),
    foreignKey({
      name: "world_quest_poi_quest_fk",
      columns: [table.buildId, table.questId],
      foreignColumns: [worldQuestVersions.buildId, worldQuestVersions.questId],
    }).onDelete("cascade"),
    index("world_quest_poi_map_idx").on(table.buildId, table.uiMapId, table.questId),
  ],
);

export const worldItemSourceHints = pgTable(
  "world_item_source_hint",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    sourceInfoId: integer("source_info_id").notNull(),
    itemModifiedAppearanceId: integer("item_modified_appearance_id").notNull(),
    itemId: integer("item_id"),
    sourceType: integer("source_type").notNull(),
    description: text("description").notNull(),
    evidenceType: text("evidence_type").notNull().default("client_source_hint"),
    reviewStatus: text("review_status").notNull().default("review_required"),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.sourceInfoId] }),
    index("world_item_source_hint_item_idx").on(table.buildId, table.itemId),
    index("world_item_source_hint_description_idx").on(table.buildId, table.description),
  ],
);

export const worldCreatureObjectives = pgTable(
  "world_creature_objective",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    criteriaTreeId: integer("criteria_tree_id").notNull(),
    criteriaId: integer("criteria_id").notNull(),
    creatureId: integer("creature_id").notNull(),
    name: text("name").notNull(),
    parentCriteriaTreeId: integer("parent_criteria_tree_id").notNull(),
    rootCriteriaTreeId: integer("root_criteria_tree_id").notNull(),
    rootDescription: text("root_description").notNull(),
    orderIndex: integer("order_index").notNull(),
    amount: integer("amount").notNull(),
    flags: integer("flags").notNull(),
    achievementId: integer("achievement_id"),
    achievementTitle: text("achievement_title"),
    achievementDescription: text("achievement_description"),
    achievementCategoryId: integer("achievement_category_id"),
    achievementInstanceMapId: integer("achievement_instance_map_id"),
    achievementIconFileDataId: integer("achievement_icon_file_data_id"),
    encounterIds: jsonb("encounter_ids").$type<readonly number[]>().notNull(),
    mapIds: jsonb("map_ids").$type<readonly number[]>().notNull(),
    rawCriteriaTree: jsonb("raw_criteria_tree").notNull(),
    rawCriteria: jsonb("raw_criteria").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.criteriaTreeId] }),
    index("world_creature_objective_creature_idx").on(table.buildId, table.creatureId),
    index("world_creature_objective_achievement_idx").on(table.buildId, table.achievementId),
  ],
);

export const worldBosses = pgTable(
  "world_boss",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    creatureId: integer("creature_id").notNull(),
    name: text("name").notNull(),
    aliases: jsonb("aliases").$type<readonly string[]>().notNull(),
    contextNames: jsonb("context_names").$type<readonly string[]>().notNull(),
    criteriaTreeIds: jsonb("criteria_tree_ids").$type<readonly number[]>().notNull(),
    criteriaIds: jsonb("criteria_ids").$type<readonly number[]>().notNull(),
    achievementIds: jsonb("achievement_ids").$type<readonly number[]>().notNull(),
    encounterIds: jsonb("encounter_ids").$type<readonly number[]>().notNull(),
    mapIds: jsonb("map_ids").$type<readonly number[]>().notNull(),
    iconFileDataIds: jsonb("icon_file_data_ids").$type<readonly number[]>().notNull(),
    identityEvidence: text("identity_evidence").notNull(),
    staticModelStatus: text("static_model_status").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.creatureId] }),
    index("world_boss_name_idx").on(table.buildId, table.name),
  ],
);

export const worldBossLocations = pgTable(
  "world_boss_location",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    locationIndex: integer("location_index").notNull(),
    creatureId: integer("creature_id").notNull(),
    bossName: text("boss_name").notNull(),
    mapId: integer("map_id"),
    mapName: text("map_name"),
    areaId: integer("area_id"),
    uiMapId: integer("ui_map_id"),
    x: doublePrecision("x"),
    y: doublePrecision("y"),
    z: doublePrecision("z"),
    precision: text("precision").notNull(),
    evidenceKind: text("evidence_kind").notNull(),
    evidenceLabel: text("evidence_label").notNull(),
    requiresReview: boolean("requires_review").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.locationIndex] }),
    foreignKey({
      name: "world_boss_location_boss_fk",
      columns: [table.buildId, table.creatureId],
      foreignColumns: [worldBosses.buildId, worldBosses.creatureId],
    }).onDelete("cascade"),
    index("world_boss_location_creature_idx").on(table.buildId, table.creatureId),
    index("world_boss_location_map_idx").on(table.buildId, table.mapId, table.areaId),
  ],
);

export const worldCreatureModels = pgTable(
  "world_creature_model",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    creatureId: integer("creature_id").notNull(),
    displayId: integer("display_id").notNull(),
    sourceKinds: jsonb("source_kinds").$type<readonly string[]>().notNull(),
    probability: doublePrecision("probability").notNull(),
    displayScale: doublePrecision("display_scale").notNull(),
    modelId: integer("model_id").notNull(),
    modelFileDataId: integer("model_file_data_id").notNull(),
    modelFileDataPresent: boolean("model_file_data_present").notNull(),
    textureFileDataIds: jsonb("texture_file_data_ids").$type<readonly number[]>().notNull(),
    creatureModelScale: doublePrecision("creature_model_scale").notNull(),
    modelScale: doublePrecision("model_scale").notNull(),
    collisionWidth: doublePrecision("collision_width").notNull(),
    collisionHeight: doublePrecision("collision_height").notNull(),
    geometryBounds: jsonb("geometry_bounds").$type<readonly number[]>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.creatureId, table.displayId] }),
    index("world_creature_model_file_idx").on(table.buildId, table.modelFileDataId),
  ],
);

export const worldBossSpellCandidates = pgTable(
  "world_boss_spell_candidate",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    candidateIndex: integer("candidate_index").notNull(),
    creatureId: integer("creature_id").notNull(),
    bossName: text("boss_name").notNull(),
    spellId: integer("spell_id").notNull(),
    spellName: text("spell_name").notNull(),
    description: text("description").notNull(),
    auraDescription: text("aura_description").notNull(),
    iconFileDataId: integer("icon_file_data_id"),
    evidenceKind: text("evidence_kind").notNull(),
    evidenceText: text("evidence_text").notNull(),
    spellEffectId: integer("spell_effect_id"),
    effectIndex: integer("effect_index"),
    effectType: integer("effect_type"),
    requiresReview: boolean("requires_review").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.candidateIndex] }),
    foreignKey({
      name: "world_boss_spell_candidate_boss_fk",
      columns: [table.buildId, table.creatureId],
      foreignColumns: [worldBosses.buildId, worldBosses.creatureId],
    }).onDelete("cascade"),
    index("world_boss_spell_candidate_creature_idx").on(
      table.buildId,
      table.creatureId,
      table.spellId,
    ),
  ],
);

export const worldLootSourceCandidates = pgTable(
  "world_loot_source_candidate",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    sourceInfoId: integer("source_info_id").notNull(),
    itemId: integer("item_id"),
    targetKind: text("target_kind").notNull(),
    targetId: integer("target_id").notNull(),
    targetName: text("target_name").notNull(),
    mapId: integer("map_id"),
    creatureId: integer("creature_id"),
    evidenceKind: text("evidence_kind").notNull(),
    description: text("description").notNull(),
    requiresReview: boolean("requires_review").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.sourceInfoId, table.targetKind, table.targetId] }),
    foreignKey({
      name: "world_loot_source_candidate_hint_fk",
      columns: [table.buildId, table.sourceInfoId],
      foreignColumns: [worldItemSourceHints.buildId, worldItemSourceHints.sourceInfoId],
    }).onDelete("cascade"),
    index("world_loot_source_candidate_item_idx").on(table.buildId, table.itemId),
    index("world_loot_source_candidate_target_idx").on(
      table.buildId,
      table.targetKind,
      table.targetId,
    ),
  ],
);

export const worldMapDifficulties = pgTable(
  "world_map_difficulty",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    mapDifficultyId: integer("map_difficulty_id").notNull(),
    mapId: integer("map_id").notNull(),
    difficultyId: integer("difficulty_id").notNull(),
    difficultyName: text("difficulty_name").notNull(),
    maxPlayers: integer("max_players").notNull(),
    resetInterval: integer("reset_interval").notNull(),
    flags: integer("flags").notNull(),
    contentTuningId: integer("content_tuning_id"),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.mapDifficultyId] }),
    index("world_map_difficulty_map_idx").on(table.buildId, table.mapId, table.difficultyId),
  ],
);

export const worldContentTunings = pgTable(
  "world_content_tuning",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => worldSnapshots.buildId, { onDelete: "cascade" }),
    contentTuningId: integer("content_tuning_id").notNull(),
    expansionId: integer("expansion_id").notNull(),
    minimumLevel: integer("minimum_level").notNull(),
    maximumLevel: integer("maximum_level").notNull(),
    lfgMinimumLevel: integer("lfg_minimum_level").notNull(),
    lfgMaximumLevel: integer("lfg_maximum_level").notNull(),
    itemLevel: integer("item_level").notNull(),
    flags: integer("flags").notNull(),
    rawRecord: jsonb("raw_record").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.contentTuningId] }),
    index("world_content_tuning_level_idx").on(
      table.buildId,
      table.minimumLevel,
      table.maximumLevel,
    ),
  ],
);

export const sourceClaims = pgTable(
  "source_claim",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildId: uuid("build_id").references(() => gameBuilds.id, { onDelete: "set null" }),
    itemId: integer("item_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceEntityId: integer("source_entity_id"),
    mapId: integer("map_id"),
    difficultyId: integer("difficulty_id"),
    phase: text("phase"),
    evidenceType: text("evidence_type").notNull(),
    status: text("status").notNull(),
    observationCount: integer("observation_count").notNull().default(0),
    eligibleAttempts: bigint("eligible_attempts", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    estimatedProbability: numeric("estimated_probability", { precision: 18, scale: 12 }),
    confidenceLow: numeric("confidence_low", { precision: 18, scale: 12 }),
    confidenceHigh: numeric("confidence_high", { precision: 18, scale: 12 }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull(),
    rawEvidence: jsonb("raw_evidence")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [index("source_claim_item_idx").on(table.itemId, table.status)],
);

export const externalDataSources = pgTable(
  "external_data_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    homepageUrl: text("homepage_url").notNull(),
    dataUrl: text("data_url").notNull(),
    license: text("license").notNull(),
    licenseUrl: text("license_url").notNull(),
    attribution: text("attribution").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("external_data_source_slug_uidx").on(table.slug)],
);

export const externalDataSnapshots = pgTable(
  "external_data_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => externalDataSources.id, { onDelete: "cascade" }),
    checksum: text("checksum").notNull(),
    sourcePayloadChecksum: text("source_payload_checksum").notNull(),
    supplementalChecksum: text("supplemental_checksum"),
    byteSize: integer("byte_size").notNull(),
    upstreamGeneratedDate: text("upstream_generated_date").notNull(),
    parserVersion: text("parser_version").notNull(),
    status: externalSnapshotStatusEnum("status").notNull().default("review_required"),
    rawPayload: text("raw_payload").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    supplementalPayload: jsonb("supplemental_payload").$type<unknown>().notNull(),
    validationReport: jsonb("validation_report").$type<unknown>().notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true, mode: "date" }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("external_data_snapshot_source_checksum_uidx").on(table.sourceId, table.checksum),
    index("external_data_snapshot_source_status_idx").on(
      table.sourceId,
      table.status,
      table.retrievedAt,
    ),
    check("external_data_snapshot_byte_size_check", sql`${table.byteSize} > 0`),
  ],
);

export const externalDataPublications = pgTable("external_data_publication", {
  sourceId: uuid("source_id")
    .primaryKey()
    .references(() => externalDataSources.id, { onDelete: "cascade" }),
  snapshotId: uuid("snapshot_id")
    .notNull()
    .unique()
    .references(() => externalDataSnapshots.id, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
