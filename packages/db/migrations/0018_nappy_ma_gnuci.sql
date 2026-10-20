CREATE TABLE "community_reference_entity" (
	"snapshot_id" uuid NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_id" integer NOT NULL,
	"name" text,
	"data" jsonb NOT NULL,
	CONSTRAINT "community_reference_entity_snapshot_id_entity_kind_entity_id_pk" PRIMARY KEY("snapshot_id","entity_kind","entity_id")
);
--> statement-breakpoint
CREATE TABLE "community_reference_relation" (
	"snapshot_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" integer NOT NULL,
	"relation_kind" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" integer NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "community_reference_relation_snapshot_id_source_kind_source_id_relation_kind_target_kind_target_id_pk" PRIMARY KEY("snapshot_id","source_kind","source_id","relation_kind","target_kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "community_reference_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version" text NOT NULL,
	"source_revision" text NOT NULL,
	"locale" text NOT NULL,
	"license_ref" text NOT NULL,
	"checksum" text NOT NULL,
	"included_authored" boolean DEFAULT false NOT NULL,
	"status" "external_snapshot_status" DEFAULT 'review_required' NOT NULL,
	"manifest" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "world_loot_session" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer,
	"source_name" text,
	"source_guid" text,
	"source_quantity" integer,
	"slot_count" integer NOT NULL,
	"money" bigint,
	"encounter_id" integer,
	"attempt_id" uuid,
	"map_id" integer,
	"ui_map_id" integer,
	"observer_location" jsonb NOT NULL,
	CONSTRAINT "world_loot_session_slot_count_check" CHECK ("world_loot_session"."slot_count" >= 0),
	CONSTRAINT "world_loot_session_money_check" CHECK ("world_loot_session"."money" IS NULL OR "world_loot_session"."money" >= 0)
);
--> statement-breakpoint
CREATE TABLE "world_trainer_observation" (
	"observation_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer NOT NULL,
	"source_guid" text,
	"source_name" text,
	"service_index" integer NOT NULL,
	"service_name" text NOT NULL,
	"service_rank" text,
	"service_type" text NOT NULL,
	"spell_id" integer,
	"icon" jsonb,
	"money_cost" bigint NOT NULL,
	"required_level" integer,
	"required_skill_line" text,
	"required_skill_rank" integer,
	"all_filters_enabled" boolean NOT NULL,
	"map_id" integer,
	"ui_map_id" integer,
	"observer_location" jsonb NOT NULL,
	CONSTRAINT "world_trainer_observation_cost_check" CHECK ("world_trainer_observation"."money_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "world_loot_observation" ADD COLUMN "loot_session_id" uuid;--> statement-breakpoint
ALTER TABLE "community_reference_entity" ADD CONSTRAINT "community_reference_entity_snapshot_id_community_reference_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."community_reference_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reference_relation" ADD CONSTRAINT "community_reference_relation_snapshot_id_community_reference_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."community_reference_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reference_snapshot" ADD CONSTRAINT "community_reference_snapshot_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reference_snapshot" ADD CONSTRAINT "community_reference_snapshot_source_id_external_data_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."external_data_source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_loot_session" ADD CONSTRAINT "world_loot_session_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_trainer_observation" ADD CONSTRAINT "world_trainer_observation_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_reference_entity_lookup_idx" ON "community_reference_entity" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "community_reference_entity_name_idx" ON "community_reference_entity" USING btree ("entity_kind","name");--> statement-breakpoint
CREATE INDEX "community_reference_relation_source_idx" ON "community_reference_relation" USING btree ("source_kind","source_id","relation_kind");--> statement-breakpoint
CREATE INDEX "community_reference_relation_target_idx" ON "community_reference_relation" USING btree ("target_kind","target_id","relation_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "community_reference_snapshot_build_source_revision_uidx" ON "community_reference_snapshot" USING btree ("build_id","source_id","source_revision");--> statement-breakpoint
CREATE INDEX "community_reference_snapshot_current_idx" ON "community_reference_snapshot" USING btree ("build_id","status","published_at");--> statement-breakpoint
CREATE INDEX "world_loot_session_source_idx" ON "world_loot_session" USING btree ("client_product","client_build","source_type","source_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_trainer_observation_source_idx" ON "world_trainer_observation" USING btree ("client_product","client_build","source_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_trainer_observation_spell_idx" ON "world_trainer_observation" USING btree ("spell_id","source_id");--> statement-breakpoint
CREATE INDEX "world_trainer_observation_name_idx" ON "world_trainer_observation" USING btree ("service_name","source_id");--> statement-breakpoint
ALTER TABLE "world_loot_observation" ADD CONSTRAINT "world_loot_observation_loot_session_id_world_loot_session_session_id_fk" FOREIGN KEY ("loot_session_id") REFERENCES "public"."world_loot_session"("session_id") ON DELETE set null ON UPDATE no action;