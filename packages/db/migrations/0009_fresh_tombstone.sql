CREATE TABLE "world_boss_location" (
	"build_id" uuid NOT NULL,
	"location_index" integer NOT NULL,
	"creature_id" integer NOT NULL,
	"boss_name" text NOT NULL,
	"map_id" integer,
	"map_name" text,
	"area_id" integer,
	"ui_map_id" integer,
	"x" double precision,
	"y" double precision,
	"z" double precision,
	"precision" text NOT NULL,
	"evidence_kind" text NOT NULL,
	"evidence_label" text NOT NULL,
	"requires_review" boolean NOT NULL,
	CONSTRAINT "world_boss_location_build_id_location_index_pk" PRIMARY KEY("build_id","location_index")
);
--> statement-breakpoint
CREATE TABLE "world_boss_spell_candidate" (
	"build_id" uuid NOT NULL,
	"candidate_index" integer NOT NULL,
	"creature_id" integer NOT NULL,
	"boss_name" text NOT NULL,
	"spell_id" integer NOT NULL,
	"spell_name" text NOT NULL,
	"description" text NOT NULL,
	"aura_description" text NOT NULL,
	"icon_file_data_id" integer,
	"evidence_kind" text NOT NULL,
	"evidence_text" text NOT NULL,
	"spell_effect_id" integer,
	"effect_index" integer,
	"effect_type" integer,
	"requires_review" boolean NOT NULL,
	CONSTRAINT "world_boss_spell_candidate_build_id_candidate_index_pk" PRIMARY KEY("build_id","candidate_index")
);
--> statement-breakpoint
CREATE TABLE "world_boss" (
	"build_id" uuid NOT NULL,
	"creature_id" integer NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb NOT NULL,
	"context_names" jsonb NOT NULL,
	"criteria_tree_ids" jsonb NOT NULL,
	"criteria_ids" jsonb NOT NULL,
	"achievement_ids" jsonb NOT NULL,
	"encounter_ids" jsonb NOT NULL,
	"map_ids" jsonb NOT NULL,
	"icon_file_data_ids" jsonb NOT NULL,
	"identity_evidence" text NOT NULL,
	"static_model_status" text NOT NULL,
	CONSTRAINT "world_boss_build_id_creature_id_pk" PRIMARY KEY("build_id","creature_id")
);
--> statement-breakpoint
CREATE TABLE "world_content_tuning" (
	"build_id" uuid NOT NULL,
	"content_tuning_id" integer NOT NULL,
	"expansion_id" integer NOT NULL,
	"minimum_level" integer NOT NULL,
	"maximum_level" integer NOT NULL,
	"lfg_minimum_level" integer NOT NULL,
	"lfg_maximum_level" integer NOT NULL,
	"item_level" integer NOT NULL,
	"flags" integer NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_content_tuning_build_id_content_tuning_id_pk" PRIMARY KEY("build_id","content_tuning_id")
);
--> statement-breakpoint
CREATE TABLE "world_creature_model" (
	"build_id" uuid NOT NULL,
	"creature_id" integer NOT NULL,
	"display_id" integer NOT NULL,
	"source_kinds" jsonb NOT NULL,
	"probability" double precision NOT NULL,
	"display_scale" double precision NOT NULL,
	"model_id" integer NOT NULL,
	"model_file_data_id" integer NOT NULL,
	"model_file_data_present" boolean NOT NULL,
	"texture_file_data_ids" jsonb NOT NULL,
	"creature_model_scale" double precision NOT NULL,
	"model_scale" double precision NOT NULL,
	"collision_width" double precision NOT NULL,
	"collision_height" double precision NOT NULL,
	"geometry_bounds" jsonb NOT NULL,
	CONSTRAINT "world_creature_model_build_id_creature_id_display_id_pk" PRIMARY KEY("build_id","creature_id","display_id")
);
--> statement-breakpoint
CREATE TABLE "world_creature_objective" (
	"build_id" uuid NOT NULL,
	"criteria_tree_id" integer NOT NULL,
	"criteria_id" integer NOT NULL,
	"creature_id" integer NOT NULL,
	"name" text NOT NULL,
	"parent_criteria_tree_id" integer NOT NULL,
	"root_criteria_tree_id" integer NOT NULL,
	"root_description" text NOT NULL,
	"order_index" integer NOT NULL,
	"amount" integer NOT NULL,
	"flags" integer NOT NULL,
	"achievement_id" integer,
	"achievement_title" text,
	"achievement_description" text,
	"achievement_category_id" integer,
	"achievement_instance_map_id" integer,
	"achievement_icon_file_data_id" integer,
	"encounter_ids" jsonb NOT NULL,
	"map_ids" jsonb NOT NULL,
	"raw_criteria_tree" jsonb NOT NULL,
	"raw_criteria" jsonb NOT NULL,
	CONSTRAINT "world_creature_objective_build_id_criteria_tree_id_pk" PRIMARY KEY("build_id","criteria_tree_id")
);
--> statement-breakpoint
CREATE TABLE "world_loot_source_candidate" (
	"build_id" uuid NOT NULL,
	"source_info_id" integer NOT NULL,
	"item_id" integer,
	"target_kind" text NOT NULL,
	"target_id" integer NOT NULL,
	"target_name" text NOT NULL,
	"map_id" integer,
	"creature_id" integer,
	"evidence_kind" text NOT NULL,
	"description" text NOT NULL,
	"requires_review" boolean NOT NULL,
	CONSTRAINT "world_loot_source_candidate_build_id_source_info_id_target_kind_target_id_pk" PRIMARY KEY("build_id","source_info_id","target_kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "world_map_difficulty" (
	"build_id" uuid NOT NULL,
	"map_difficulty_id" integer NOT NULL,
	"map_id" integer NOT NULL,
	"difficulty_id" integer NOT NULL,
	"difficulty_name" text NOT NULL,
	"max_players" integer NOT NULL,
	"reset_interval" integer NOT NULL,
	"flags" integer NOT NULL,
	"content_tuning_id" integer,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_map_difficulty_build_id_map_difficulty_id_pk" PRIMARY KEY("build_id","map_difficulty_id")
);
--> statement-breakpoint
ALTER TABLE "world_boss_location" ADD CONSTRAINT "world_boss_location_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_boss_location" ADD CONSTRAINT "world_boss_location_boss_fk" FOREIGN KEY ("build_id","creature_id") REFERENCES "public"."world_boss"("build_id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_boss_spell_candidate" ADD CONSTRAINT "world_boss_spell_candidate_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_boss_spell_candidate" ADD CONSTRAINT "world_boss_spell_candidate_boss_fk" FOREIGN KEY ("build_id","creature_id") REFERENCES "public"."world_boss"("build_id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_boss" ADD CONSTRAINT "world_boss_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_content_tuning" ADD CONSTRAINT "world_content_tuning_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_creature_model" ADD CONSTRAINT "world_creature_model_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_creature_objective" ADD CONSTRAINT "world_creature_objective_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_loot_source_candidate" ADD CONSTRAINT "world_loot_source_candidate_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_loot_source_candidate" ADD CONSTRAINT "world_loot_source_candidate_hint_fk" FOREIGN KEY ("build_id","source_info_id") REFERENCES "public"."world_item_source_hint"("build_id","source_info_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_difficulty" ADD CONSTRAINT "world_map_difficulty_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_boss_location_creature_idx" ON "world_boss_location" USING btree ("build_id","creature_id");--> statement-breakpoint
CREATE INDEX "world_boss_location_map_idx" ON "world_boss_location" USING btree ("build_id","map_id","area_id");--> statement-breakpoint
CREATE INDEX "world_boss_spell_candidate_creature_idx" ON "world_boss_spell_candidate" USING btree ("build_id","creature_id","spell_id");--> statement-breakpoint
CREATE INDEX "world_boss_name_idx" ON "world_boss" USING btree ("build_id","name");--> statement-breakpoint
CREATE INDEX "world_content_tuning_level_idx" ON "world_content_tuning" USING btree ("build_id","minimum_level","maximum_level");--> statement-breakpoint
CREATE INDEX "world_creature_model_file_idx" ON "world_creature_model" USING btree ("build_id","model_file_data_id");--> statement-breakpoint
CREATE INDEX "world_creature_objective_creature_idx" ON "world_creature_objective" USING btree ("build_id","creature_id");--> statement-breakpoint
CREATE INDEX "world_creature_objective_achievement_idx" ON "world_creature_objective" USING btree ("build_id","achievement_id");--> statement-breakpoint
CREATE INDEX "world_loot_source_candidate_item_idx" ON "world_loot_source_candidate" USING btree ("build_id","item_id");--> statement-breakpoint
CREATE INDEX "world_loot_source_candidate_target_idx" ON "world_loot_source_candidate" USING btree ("build_id","target_kind","target_id");--> statement-breakpoint
CREATE INDEX "world_map_difficulty_map_idx" ON "world_map_difficulty" USING btree ("build_id","map_id","difficulty_id");