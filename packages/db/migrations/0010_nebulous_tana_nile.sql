CREATE TABLE "world_encounter_actor_observation" (
	"attempt_id" uuid NOT NULL,
	"actor_index" integer NOT NULL,
	"creature_id" integer NOT NULL,
	"creature_name" text,
	"remaining_health_percent" double precision,
	CONSTRAINT "world_encounter_actor_observation_attempt_id_actor_index_pk" PRIMARY KEY("attempt_id","actor_index")
);
--> statement-breakpoint
CREATE TABLE "world_encounter_observation" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"encounter_id" integer NOT NULL,
	"encounter_name" text NOT NULL,
	"difficulty_id" integer NOT NULL,
	"group_size" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"success" boolean NOT NULL,
	"start_location" jsonb NOT NULL,
	"end_location" jsonb NOT NULL,
	CONSTRAINT "world_encounter_observation_time_check" CHECK ("world_encounter_observation"."ended_at" >= "world_encounter_observation"."started_at")
);
--> statement-breakpoint
CREATE TABLE "world_health_observation" (
	"observation_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"creature_id" integer NOT NULL,
	"creature_name" text,
	"trigger" text NOT NULL,
	"level" integer,
	"classification" text,
	"current_health" bigint NOT NULL,
	"maximum_health" bigint NOT NULL,
	"health_percent" double precision NOT NULL,
	"is_dead" boolean NOT NULL,
	"group_size" integer NOT NULL,
	"map_id" integer,
	"ui_map_id" integer,
	"difficulty_id" integer,
	"difficulty_name" text,
	"instance_type" text,
	"observer_location" jsonb NOT NULL,
	CONSTRAINT "world_health_observation_current_check" CHECK ("world_health_observation"."current_health" >= 0),
	CONSTRAINT "world_health_observation_maximum_check" CHECK ("world_health_observation"."maximum_health" > 0),
	CONSTRAINT "world_health_observation_percent_check" CHECK ("world_health_observation"."health_percent" >= 0 AND "world_health_observation"."health_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "world_loot_observation" (
	"observation_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"evidence_kind" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"item_id" integer NOT NULL,
	"item_link" text,
	"item_name" text,
	"quantity" integer NOT NULL,
	"icon_file_name" text,
	"encounter_id" integer,
	"attempt_id" uuid,
	"source_type" text,
	"source_id" integer,
	"source_guid" text,
	"source_quantity" integer,
	"location" jsonb NOT NULL,
	CONSTRAINT "world_loot_observation_quantity_check" CHECK ("world_loot_observation"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "world_model_observation" (
	"resolution_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"creature_id" integer NOT NULL,
	"creature_name" text,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"display_id" integer,
	"model_file_data_id" integer,
	"error_message" text,
	"evidence" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_npc_observation" (
	"observation_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"creature_id" integer NOT NULL,
	"creature_name" text,
	"object_type" text NOT NULL,
	"trigger" text NOT NULL,
	"level" integer,
	"classification" text,
	"creature_type" text,
	"creature_family" text,
	"reaction" integer,
	"can_attack" boolean NOT NULL,
	"is_quest_boss" boolean NOT NULL,
	"is_dead" boolean NOT NULL,
	"distance_squared" double precision,
	"position_evidence" text NOT NULL,
	"subject_position" jsonb,
	"closest_position" jsonb,
	"observer_location" jsonb NOT NULL,
	"map_id" integer,
	"ui_map_id" integer
);
--> statement-breakpoint
ALTER TABLE "world_encounter_actor_observation" ADD CONSTRAINT "world_encounter_actor_observation_attempt_id_world_encounter_observation_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."world_encounter_observation"("attempt_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_encounter_observation" ADD CONSTRAINT "world_encounter_observation_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_health_observation" ADD CONSTRAINT "world_health_observation_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_loot_observation" ADD CONSTRAINT "world_loot_observation_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_model_observation" ADD CONSTRAINT "world_model_observation_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_npc_observation" ADD CONSTRAINT "world_npc_observation_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_encounter_actor_creature_idx" ON "world_encounter_actor_observation" USING btree ("creature_id","attempt_id");--> statement-breakpoint
CREATE INDEX "world_encounter_observation_encounter_idx" ON "world_encounter_observation" USING btree ("client_product","client_build","encounter_id","ended_at");--> statement-breakpoint
CREATE INDEX "world_health_observation_creature_idx" ON "world_health_observation" USING btree ("client_product","client_build","creature_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_health_observation_context_idx" ON "world_health_observation" USING btree ("creature_id","difficulty_id","group_size","maximum_health");--> statement-breakpoint
CREATE INDEX "world_loot_observation_source_idx" ON "world_loot_observation" USING btree ("client_product","client_build","source_type","source_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_loot_observation_encounter_idx" ON "world_loot_observation" USING btree ("encounter_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_loot_observation_item_idx" ON "world_loot_observation" USING btree ("item_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_model_observation_creature_idx" ON "world_model_observation" USING btree ("client_product","client_build","creature_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_model_observation_display_idx" ON "world_model_observation" USING btree ("display_id","model_file_data_id");--> statement-breakpoint
CREATE INDEX "world_npc_observation_creature_idx" ON "world_npc_observation" USING btree ("client_product","client_build","creature_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_npc_observation_map_idx" ON "world_npc_observation" USING btree ("map_id","ui_map_id","creature_id");