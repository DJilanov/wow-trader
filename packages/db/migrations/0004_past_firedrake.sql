CREATE TABLE "game_class_version" (
	"build_id" uuid NOT NULL,
	"class_id" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "game_class_version_build_id_class_id_pk" PRIMARY KEY("build_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "game_race_version" (
	"build_id" uuid NOT NULL,
	"race_id" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "game_race_version_build_id_race_id_pk" PRIMARY KEY("build_id","race_id")
);
--> statement-breakpoint
CREATE TABLE "gem_property_version" (
	"build_id" uuid NOT NULL,
	"gem_properties_id" integer NOT NULL,
	"enchantment_id" integer NOT NULL,
	"socket_type" integer NOT NULL,
	"minimum_item_level" integer NOT NULL,
	CONSTRAINT "gem_property_version_build_id_gem_properties_id_pk" PRIMARY KEY("build_id","gem_properties_id")
);
--> statement-breakpoint
CREATE TABLE "item_bonus_tree_node_version" (
	"build_id" uuid NOT NULL,
	"node_id" integer NOT NULL,
	"bonus_tree_id" integer NOT NULL,
	"item_context" integer NOT NULL,
	"child_bonus_tree_id" integer,
	"child_bonus_list_id" integer,
	"child_item_level_selector_id" integer,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "item_bonus_tree_node_version_build_id_node_id_pk" PRIMARY KEY("build_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "item_bonus_tree" (
	"build_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"bonus_tree_id" integer NOT NULL,
	CONSTRAINT "item_bonus_tree_build_id_item_id_bonus_tree_id_pk" PRIMARY KEY("build_id","item_id","bonus_tree_id")
);
--> statement-breakpoint
CREATE TABLE "item_bonus_version" (
	"build_id" uuid NOT NULL,
	"bonus_list_id" integer NOT NULL,
	"order_index" integer NOT NULL,
	"type" integer NOT NULL,
	"values" jsonb NOT NULL,
	CONSTRAINT "item_bonus_version_build_id_bonus_list_id_order_index_pk" PRIMARY KEY("build_id","bonus_list_id","order_index")
);
--> statement-breakpoint
CREATE TABLE "item_class_version" (
	"build_id" uuid NOT NULL,
	"class_id" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "item_class_version_build_id_class_id_pk" PRIMARY KEY("build_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "item_damage" (
	"build_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"damage_type" integer NOT NULL,
	"minimum" integer NOT NULL,
	"maximum" integer NOT NULL,
	CONSTRAINT "item_damage_build_id_item_id_slot_pk" PRIMARY KEY("build_id","item_id","slot")
);
--> statement-breakpoint
CREATE TABLE "item_effect" (
	"build_id" uuid NOT NULL,
	"item_effect_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"spell_id" integer NOT NULL,
	"trigger_type" integer NOT NULL,
	"charges" integer NOT NULL,
	"cooldown_ms" integer NOT NULL,
	"category_cooldown_ms" integer NOT NULL,
	"spell_category_id" integer,
	"specialization_id" integer,
	"player_condition_id" integer,
	CONSTRAINT "item_effect_build_id_item_effect_id_pk" PRIMARY KEY("build_id","item_effect_id")
);
--> statement-breakpoint
CREATE TABLE "item_enchantment_effect" (
	"build_id" uuid NOT NULL,
	"enchantment_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"effect_type" integer NOT NULL,
	"minimum_points" integer NOT NULL,
	"maximum_points" integer NOT NULL,
	"argument" integer NOT NULL,
	CONSTRAINT "item_enchantment_effect_build_id_enchantment_id_slot_pk" PRIMARY KEY("build_id","enchantment_id","slot")
);
--> statement-breakpoint
CREATE TABLE "item_enchantment_version" (
	"build_id" uuid NOT NULL,
	"enchantment_id" integer NOT NULL,
	"name" text NOT NULL,
	"charges" integer NOT NULL,
	"gem_item_id" integer,
	"condition_id" integer,
	"required_skill_id" integer,
	"required_skill_rank" integer NOT NULL,
	"minimum_level" integer NOT NULL,
	"maximum_level" integer NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "item_enchantment_version_build_id_enchantment_id_pk" PRIMARY KEY("build_id","enchantment_id")
);
--> statement-breakpoint
CREATE TABLE "item_limit_category_version" (
	"build_id" uuid NOT NULL,
	"limit_category_id" integer NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"flags" integer NOT NULL,
	CONSTRAINT "item_limit_category_version_build_id_limit_category_id_pk" PRIMARY KEY("build_id","limit_category_id")
);
--> statement-breakpoint
CREATE TABLE "item_random_enchantment" (
	"build_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"variant_id" integer NOT NULL,
	"name" text NOT NULL,
	"slot" integer NOT NULL,
	"enchantment_id" integer NOT NULL,
	"allocation_percent" integer NOT NULL,
	CONSTRAINT "item_random_enchantment_build_id_kind_variant_id_slot_pk" PRIMARY KEY("build_id","kind","variant_id","slot")
);
--> statement-breakpoint
CREATE TABLE "item_resistance" (
	"build_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"school" integer NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "item_resistance_build_id_item_id_school_pk" PRIMARY KEY("build_id","item_id","school")
);
--> statement-breakpoint
CREATE TABLE "item_set_effect" (
	"build_id" uuid NOT NULL,
	"item_set_effect_id" integer NOT NULL,
	"item_set_id" integer NOT NULL,
	"spell_id" integer NOT NULL,
	"threshold" integer NOT NULL,
	"specialization_id" integer,
	CONSTRAINT "item_set_effect_build_id_item_set_effect_id_pk" PRIMARY KEY("build_id","item_set_effect_id")
);
--> statement-breakpoint
CREATE TABLE "item_set_member" (
	"build_id" uuid NOT NULL,
	"item_set_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"slot" integer NOT NULL,
	CONSTRAINT "item_set_member_build_id_item_set_id_item_id_pk" PRIMARY KEY("build_id","item_set_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "item_set_version" (
	"build_id" uuid NOT NULL,
	"item_set_id" integer NOT NULL,
	"name" text NOT NULL,
	"flags" integer NOT NULL,
	"required_skill_id" integer,
	"required_skill_rank" integer NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "item_set_version_build_id_item_set_id_pk" PRIMARY KEY("build_id","item_set_id")
);
--> statement-breakpoint
CREATE TABLE "item_socket" (
	"build_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"socket_type" integer NOT NULL,
	CONSTRAINT "item_socket_build_id_item_id_slot_pk" PRIMARY KEY("build_id","item_id","slot")
);
--> statement-breakpoint
CREATE TABLE "item_stat" (
	"build_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"stat_type" integer NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "item_stat_build_id_item_id_slot_pk" PRIMARY KEY("build_id","item_id","slot")
);
--> statement-breakpoint
CREATE TABLE "item_subclass_version" (
	"build_id" uuid NOT NULL,
	"class_id" integer NOT NULL,
	"subclass_id" integer NOT NULL,
	"name" text NOT NULL,
	"verbose_name" text NOT NULL,
	"prerequisite_proficiency" integer NOT NULL,
	CONSTRAINT "item_subclass_version_build_id_class_id_subclass_id_pk" PRIMARY KEY("build_id","class_id","subclass_id")
);
--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "inventory_type" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "allowable_class_mask" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "allowable_race_mask" jsonb DEFAULT '[-1, -1]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "max_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "max_durability" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "delay_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "damage_type" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "item_set_id" integer;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "limit_category_id" integer;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "socket_bonus_enchantment_id" integer;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "gem_properties_id" integer;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "random_suffix_group_id" integer;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "random_property_id" integer;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "required_ability_id" integer;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "minimum_faction_id" integer;--> statement-breakpoint
ALTER TABLE "item_version" ADD COLUMN "minimum_reputation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "spell_version" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "spell_version" ADD COLUMN "aura_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "spell_version" ADD COLUMN "duration_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "spell_version" ADD COLUMN "maximum_duration_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "spell_version" ADD COLUMN "proc_chance" integer;--> statement-breakpoint
ALTER TABLE "spell_version" ADD COLUMN "proc_charges" integer;--> statement-breakpoint
ALTER TABLE "spell_version" ADD COLUMN "proc_cooldown_ms" integer;--> statement-breakpoint
ALTER TABLE "spell_version" ADD COLUMN "description_variables" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_version" ALTER COLUMN "inventory_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "item_version" ALTER COLUMN "allowable_class_mask" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "item_version" ALTER COLUMN "allowable_race_mask" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "item_version" ALTER COLUMN "max_count" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "item_version" ALTER COLUMN "max_durability" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "item_version" ALTER COLUMN "delay_ms" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "item_version" ALTER COLUMN "damage_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "item_version" ALTER COLUMN "minimum_reputation" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spell_version" ALTER COLUMN "description" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spell_version" ALTER COLUMN "aura_description" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spell_version" ALTER COLUMN "duration_ms" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spell_version" ALTER COLUMN "maximum_duration_ms" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spell_version" ALTER COLUMN "description_variables" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "game_class_version" ADD CONSTRAINT "game_class_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_race_version" ADD CONSTRAINT "game_race_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gem_property_version" ADD CONSTRAINT "gem_property_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gem_property_version" ADD CONSTRAINT "gem_property_enchantment_fk" FOREIGN KEY ("build_id","enchantment_id") REFERENCES "public"."item_enchantment_version"("build_id","enchantment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_bonus_tree_node_version" ADD CONSTRAINT "item_bonus_tree_node_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_bonus_tree" ADD CONSTRAINT "item_bonus_tree_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_bonus_version" ADD CONSTRAINT "item_bonus_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_class_version" ADD CONSTRAINT "item_class_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_damage" ADD CONSTRAINT "item_damage_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_effect" ADD CONSTRAINT "item_effect_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_effect" ADD CONSTRAINT "item_effect_spell_version_fk" FOREIGN KEY ("build_id","spell_id") REFERENCES "public"."spell_version"("build_id","spell_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_enchantment_effect" ADD CONSTRAINT "item_enchantment_effect_enchantment_fk" FOREIGN KEY ("build_id","enchantment_id") REFERENCES "public"."item_enchantment_version"("build_id","enchantment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_enchantment_version" ADD CONSTRAINT "item_enchantment_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_limit_category_version" ADD CONSTRAINT "item_limit_category_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_random_enchantment" ADD CONSTRAINT "item_random_enchantment_enchantment_fk" FOREIGN KEY ("build_id","enchantment_id") REFERENCES "public"."item_enchantment_version"("build_id","enchantment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_resistance" ADD CONSTRAINT "item_resistance_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_set_effect" ADD CONSTRAINT "item_set_effect_set_fk" FOREIGN KEY ("build_id","item_set_id") REFERENCES "public"."item_set_version"("build_id","item_set_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_set_effect" ADD CONSTRAINT "item_set_effect_spell_version_fk" FOREIGN KEY ("build_id","spell_id") REFERENCES "public"."spell_version"("build_id","spell_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_set_member" ADD CONSTRAINT "item_set_member_set_fk" FOREIGN KEY ("build_id","item_set_id") REFERENCES "public"."item_set_version"("build_id","item_set_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_set_member" ADD CONSTRAINT "item_set_member_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_set_version" ADD CONSTRAINT "item_set_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_socket" ADD CONSTRAINT "item_socket_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stat" ADD CONSTRAINT "item_stat_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_subclass_version" ADD CONSTRAINT "item_subclass_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_bonus_tree_node_tree_idx" ON "item_bonus_tree_node_version" USING btree ("build_id","bonus_tree_id");--> statement-breakpoint
CREATE INDEX "item_effect_item_idx" ON "item_effect" USING btree ("build_id","item_id");--> statement-breakpoint
CREATE INDEX "item_set_member_item_idx" ON "item_set_member" USING btree ("build_id","item_id");
