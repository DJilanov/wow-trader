CREATE TABLE "world_area_version" (
	"build_id" uuid NOT NULL,
	"area_id" integer NOT NULL,
	"map_id" integer NOT NULL,
	"parent_area_id" integer,
	"name" text NOT NULL,
	"zone_name" text NOT NULL,
	"exploration_level" integer NOT NULL,
	"faction_group_mask" integer NOT NULL,
	"flags" jsonb NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_area_version_build_id_area_id_pk" PRIMARY KEY("build_id","area_id")
);
--> statement-breakpoint
CREATE TABLE "world_encounter_version" (
	"build_id" uuid NOT NULL,
	"encounter_id" integer NOT NULL,
	"map_id" integer NOT NULL,
	"difficulty_id" integer NOT NULL,
	"name" text NOT NULL,
	"order_index" integer NOT NULL,
	"flags" integer NOT NULL,
	"icon_file_data_id" integer,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_encounter_version_build_id_encounter_id_pk" PRIMARY KEY("build_id","encounter_id")
);
--> statement-breakpoint
CREATE TABLE "world_item_source_hint" (
	"build_id" uuid NOT NULL,
	"source_info_id" integer NOT NULL,
	"item_modified_appearance_id" integer NOT NULL,
	"item_id" integer,
	"source_type" integer NOT NULL,
	"description" text NOT NULL,
	"evidence_type" text DEFAULT 'client_source_hint' NOT NULL,
	"review_status" text DEFAULT 'review_required' NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_item_source_hint_build_id_source_info_id_pk" PRIMARY KEY("build_id","source_info_id")
);
--> statement-breakpoint
CREATE TABLE "world_lfg_dungeon_version" (
	"build_id" uuid NOT NULL,
	"lfg_dungeon_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"map_id" integer,
	"difficulty_id" integer NOT NULL,
	"content_tuning_id" integer NOT NULL,
	"type_id" integer NOT NULL,
	"subtype" integer NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_lfg_dungeon_version_build_id_lfg_dungeon_id_pk" PRIMARY KEY("build_id","lfg_dungeon_id")
);
--> statement-breakpoint
CREATE TABLE "world_map_art_layer" (
	"build_id" uuid NOT NULL,
	"layer_id" integer NOT NULL,
	"style_id" integer NOT NULL,
	"layer_index" integer NOT NULL,
	"layer_width" integer NOT NULL,
	"layer_height" integer NOT NULL,
	"tile_width" integer NOT NULL,
	"tile_height" integer NOT NULL,
	"min_scale" double precision NOT NULL,
	"max_scale" double precision NOT NULL,
	"additional_zoom_steps" integer NOT NULL,
	CONSTRAINT "world_map_art_layer_build_id_layer_id_pk" PRIMARY KEY("build_id","layer_id")
);
--> statement-breakpoint
CREATE TABLE "world_map_art_tile" (
	"build_id" uuid NOT NULL,
	"tile_id" integer NOT NULL,
	"map_art_id" integer NOT NULL,
	"layer_index" integer NOT NULL,
	"row_index" integer NOT NULL,
	"column_index" integer NOT NULL,
	"file_data_id" integer NOT NULL,
	CONSTRAINT "world_map_art_tile_build_id_tile_id_pk" PRIMARY KEY("build_id","tile_id")
);
--> statement-breakpoint
CREATE TABLE "world_map_art" (
	"build_id" uuid NOT NULL,
	"map_art_id" integer NOT NULL,
	"style_id" integer NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_map_art_build_id_map_art_id_pk" PRIMARY KEY("build_id","map_art_id")
);
--> statement-breakpoint
CREATE TABLE "world_map_version" (
	"build_id" uuid NOT NULL,
	"map_id" integer NOT NULL,
	"directory" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"map_type" integer NOT NULL,
	"instance_type" integer NOT NULL,
	"expansion_id" integer NOT NULL,
	"area_table_id" integer NOT NULL,
	"parent_map_id" integer,
	"cosmetic_parent_map_id" integer,
	"max_players" integer NOT NULL,
	"wdt_file_data_id" integer,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_map_version_build_id_map_id_pk" PRIMARY KEY("build_id","map_id")
);
--> statement-breakpoint
CREATE TABLE "world_poi_version" (
	"build_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entity_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"map_id" integer,
	"area_id" integer,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"z" double precision NOT NULL,
	"icon_id" integer,
	"type_id" integer,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_poi_version_build_id_kind_entity_id_pk" PRIMARY KEY("build_id","kind","entity_id")
);
--> statement-breakpoint
CREATE TABLE "world_quest_line_member" (
	"build_id" uuid NOT NULL,
	"relation_id" integer NOT NULL,
	"quest_line_id" integer NOT NULL,
	"quest_id" integer NOT NULL,
	"order_index" integer NOT NULL,
	"flags" integer NOT NULL,
	CONSTRAINT "world_quest_line_member_build_id_relation_id_pk" PRIMARY KEY("build_id","relation_id")
);
--> statement-breakpoint
CREATE TABLE "world_quest_line_version" (
	"build_id" uuid NOT NULL,
	"quest_line_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"flags" integer NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_quest_line_version_build_id_quest_line_id_pk" PRIMARY KEY("build_id","quest_line_id")
);
--> statement-breakpoint
CREATE TABLE "world_quest_poi" (
	"build_id" uuid NOT NULL,
	"blob_id" integer NOT NULL,
	"quest_id" integer NOT NULL,
	"map_id" integer NOT NULL,
	"ui_map_id" integer,
	"objective_index" integer NOT NULL,
	"objective_id" integer,
	"flags" integer NOT NULL,
	"points" jsonb NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_quest_poi_build_id_blob_id_pk" PRIMARY KEY("build_id","blob_id")
);
--> statement-breakpoint
CREATE TABLE "world_quest_version" (
	"build_id" uuid NOT NULL,
	"quest_id" integer NOT NULL,
	"unique_bit_flag" integer NOT NULL,
	"ui_quest_details_theme_id" integer NOT NULL,
	"title" text,
	"availability_state" text DEFAULT 'client_id_present' NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_quest_version_build_id_quest_id_pk" PRIMARY KEY("build_id","quest_id")
);
--> statement-breakpoint
CREATE TABLE "world_snapshot" (
	"build_id" uuid PRIMARY KEY NOT NULL,
	"snapshot_key" text NOT NULL,
	"status" "external_snapshot_status" DEFAULT 'review_required' NOT NULL,
	"extracted_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"manifest" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_ui_map_art_link" (
	"build_id" uuid NOT NULL,
	"link_id" integer NOT NULL,
	"ui_map_id" integer NOT NULL,
	"map_art_id" integer NOT NULL,
	"phase_id" integer NOT NULL,
	CONSTRAINT "world_ui_map_art_link_build_id_link_id_pk" PRIMARY KEY("build_id","link_id")
);
--> statement-breakpoint
CREATE TABLE "world_ui_map_assignment" (
	"build_id" uuid NOT NULL,
	"assignment_id" integer NOT NULL,
	"ui_map_id" integer NOT NULL,
	"map_id" integer NOT NULL,
	"area_id" integer,
	"order_index" integer NOT NULL,
	"ui_min_x" double precision NOT NULL,
	"ui_min_y" double precision NOT NULL,
	"ui_max_x" double precision NOT NULL,
	"ui_max_y" double precision NOT NULL,
	"region" jsonb NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_ui_map_assignment_build_id_assignment_id_pk" PRIMARY KEY("build_id","assignment_id")
);
--> statement-breakpoint
CREATE TABLE "world_ui_map_version" (
	"build_id" uuid NOT NULL,
	"ui_map_id" integer NOT NULL,
	"name" text NOT NULL,
	"parent_ui_map_id" integer,
	"type" integer NOT NULL,
	"system" integer NOT NULL,
	"flags" integer NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_ui_map_version_build_id_ui_map_id_pk" PRIMARY KEY("build_id","ui_map_id")
);
--> statement-breakpoint
ALTER TABLE "world_area_version" ADD CONSTRAINT "world_area_version_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_encounter_version" ADD CONSTRAINT "world_encounter_version_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_item_source_hint" ADD CONSTRAINT "world_item_source_hint_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lfg_dungeon_version" ADD CONSTRAINT "world_lfg_dungeon_version_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_art_layer" ADD CONSTRAINT "world_map_art_layer_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_art_tile" ADD CONSTRAINT "world_map_art_tile_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_art_tile" ADD CONSTRAINT "world_map_art_tile_art_fk" FOREIGN KEY ("build_id","map_art_id") REFERENCES "public"."world_map_art"("build_id","map_art_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_art" ADD CONSTRAINT "world_map_art_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_version" ADD CONSTRAINT "world_map_version_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_poi_version" ADD CONSTRAINT "world_poi_version_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_quest_line_member" ADD CONSTRAINT "world_quest_line_member_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_quest_line_member" ADD CONSTRAINT "world_quest_line_member_line_fk" FOREIGN KEY ("build_id","quest_line_id") REFERENCES "public"."world_quest_line_version"("build_id","quest_line_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_quest_line_member" ADD CONSTRAINT "world_quest_line_member_quest_fk" FOREIGN KEY ("build_id","quest_id") REFERENCES "public"."world_quest_version"("build_id","quest_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_quest_line_version" ADD CONSTRAINT "world_quest_line_version_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_quest_poi" ADD CONSTRAINT "world_quest_poi_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_quest_poi" ADD CONSTRAINT "world_quest_poi_quest_fk" FOREIGN KEY ("build_id","quest_id") REFERENCES "public"."world_quest_version"("build_id","quest_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD CONSTRAINT "world_quest_version_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_snapshot" ADD CONSTRAINT "world_snapshot_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_ui_map_art_link" ADD CONSTRAINT "world_ui_map_art_link_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_ui_map_art_link" ADD CONSTRAINT "world_ui_map_art_link_ui_map_fk" FOREIGN KEY ("build_id","ui_map_id") REFERENCES "public"."world_ui_map_version"("build_id","ui_map_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_ui_map_art_link" ADD CONSTRAINT "world_ui_map_art_link_art_fk" FOREIGN KEY ("build_id","map_art_id") REFERENCES "public"."world_map_art"("build_id","map_art_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_ui_map_assignment" ADD CONSTRAINT "world_ui_map_assignment_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_ui_map_assignment" ADD CONSTRAINT "world_ui_map_assignment_ui_map_fk" FOREIGN KEY ("build_id","ui_map_id") REFERENCES "public"."world_ui_map_version"("build_id","ui_map_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_ui_map_version" ADD CONSTRAINT "world_ui_map_version_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_area_map_idx" ON "world_area_version" USING btree ("build_id","map_id");--> statement-breakpoint
CREATE INDEX "world_area_name_idx" ON "world_area_version" USING btree ("build_id","name");--> statement-breakpoint
CREATE INDEX "world_encounter_map_idx" ON "world_encounter_version" USING btree ("build_id","map_id","difficulty_id","order_index");--> statement-breakpoint
CREATE INDEX "world_encounter_name_idx" ON "world_encounter_version" USING btree ("build_id","name");--> statement-breakpoint
CREATE INDEX "world_item_source_hint_item_idx" ON "world_item_source_hint" USING btree ("build_id","item_id");--> statement-breakpoint
CREATE INDEX "world_item_source_hint_description_idx" ON "world_item_source_hint" USING btree ("build_id","description");--> statement-breakpoint
CREATE INDEX "world_lfg_dungeon_name_idx" ON "world_lfg_dungeon_version" USING btree ("build_id","name");--> statement-breakpoint
CREATE INDEX "world_map_art_layer_style_idx" ON "world_map_art_layer" USING btree ("build_id","style_id","layer_index");--> statement-breakpoint
CREATE INDEX "world_map_art_tile_grid_idx" ON "world_map_art_tile" USING btree ("build_id","map_art_id","layer_index","row_index","column_index");--> statement-breakpoint
CREATE INDEX "world_map_name_idx" ON "world_map_version" USING btree ("build_id","name");--> statement-breakpoint
CREATE INDEX "world_poi_map_idx" ON "world_poi_version" USING btree ("build_id","map_id","kind");--> statement-breakpoint
CREATE INDEX "world_poi_name_idx" ON "world_poi_version" USING btree ("build_id","name");--> statement-breakpoint
CREATE INDEX "world_quest_line_member_order_idx" ON "world_quest_line_member" USING btree ("build_id","quest_line_id","order_index");--> statement-breakpoint
CREATE INDEX "world_quest_poi_map_idx" ON "world_quest_poi" USING btree ("build_id","ui_map_id","quest_id");--> statement-breakpoint
CREATE INDEX "world_quest_title_idx" ON "world_quest_version" USING btree ("build_id","title");--> statement-breakpoint
CREATE INDEX "world_quest_availability_idx" ON "world_quest_version" USING btree ("build_id","availability_state");--> statement-breakpoint
CREATE UNIQUE INDEX "world_snapshot_snapshot_key_uidx" ON "world_snapshot" USING btree ("snapshot_key");--> statement-breakpoint
CREATE INDEX "world_ui_map_art_link_lookup_idx" ON "world_ui_map_art_link" USING btree ("build_id","ui_map_id","phase_id");--> statement-breakpoint
CREATE INDEX "world_ui_map_assignment_lookup_idx" ON "world_ui_map_assignment" USING btree ("build_id","ui_map_id","map_id","area_id");--> statement-breakpoint
CREATE INDEX "world_ui_map_name_idx" ON "world_ui_map_version" USING btree ("build_id","name");