CREATE TABLE "world_quest_observation" (
	"observation_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"evidence_kind" text NOT NULL,
	"quest_id" integer NOT NULL,
	"status" text,
	"title" text,
	"quest_level" integer,
	"suggested_group" integer,
	"quest_text" text,
	"objective_text" text,
	"progress_text" text,
	"reward_text" text,
	"xp_reward" bigint,
	"money_reward" bigint,
	"item_id" integer,
	"item_link" text,
	"currency_id" integer,
	"quantity" integer,
	"source_type" text,
	"source_id" integer,
	"source_name" text,
	"objectives" jsonb NOT NULL,
	"tag" jsonb,
	"rewards" jsonb NOT NULL,
	"map_id" integer,
	"ui_map_id" integer,
	"observer_location" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_spell_observation" (
	"observation_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"event_count" integer NOT NULL,
	"sub_event" text NOT NULL,
	"source_creature_id" integer NOT NULL,
	"source_creature_name" text,
	"destination_creature_id" integer,
	"destination_creature_name" text,
	"spell_id" integer NOT NULL,
	"spell_name" text,
	"spell_school" integer,
	"encounter_id" integer,
	"attempt_id" uuid,
	"map_id" integer,
	"ui_map_id" integer,
	"difficulty_id" integer,
	"observer_location" jsonb NOT NULL,
	CONSTRAINT "world_spell_observation_count_check" CHECK ("world_spell_observation"."event_count" > 0),
	CONSTRAINT "world_spell_observation_time_check" CHECK ("world_spell_observation"."last_seen_at" >= "world_spell_observation"."captured_at")
);
--> statement-breakpoint
CREATE TABLE "world_vendor_observation" (
	"observation_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"source_type" text,
	"source_id" integer NOT NULL,
	"source_name" text,
	"item_index" integer NOT NULL,
	"item_id" integer NOT NULL,
	"item_link" text,
	"item_name" text,
	"texture" jsonb,
	"price" bigint NOT NULL,
	"stack_count" integer NOT NULL,
	"available" integer,
	"is_purchasable" boolean NOT NULL,
	"is_usable" boolean NOT NULL,
	"extended_cost" boolean NOT NULL,
	"costs" jsonb NOT NULL,
	"map_id" integer,
	"ui_map_id" integer,
	"observer_location" jsonb NOT NULL,
	CONSTRAINT "world_vendor_observation_price_check" CHECK ("world_vendor_observation"."price" >= 0),
	CONSTRAINT "world_vendor_observation_stack_check" CHECK ("world_vendor_observation"."stack_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "world_quest_observation" ADD CONSTRAINT "world_quest_observation_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_spell_observation" ADD CONSTRAINT "world_spell_observation_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_vendor_observation" ADD CONSTRAINT "world_vendor_observation_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_quest_observation_quest_idx" ON "world_quest_observation" USING btree ("client_product","client_build","quest_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_quest_observation_title_idx" ON "world_quest_observation" USING btree ("client_build","title");--> statement-breakpoint
CREATE INDEX "world_quest_observation_source_idx" ON "world_quest_observation" USING btree ("source_type","source_id","quest_id");--> statement-breakpoint
CREATE INDEX "world_spell_observation_source_idx" ON "world_spell_observation" USING btree ("client_product","client_build","source_creature_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_spell_observation_spell_idx" ON "world_spell_observation" USING btree ("spell_id","source_creature_id");--> statement-breakpoint
CREATE INDEX "world_spell_observation_encounter_idx" ON "world_spell_observation" USING btree ("encounter_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_vendor_observation_source_idx" ON "world_vendor_observation" USING btree ("client_product","client_build","source_id","captured_at");--> statement-breakpoint
CREATE INDEX "world_vendor_observation_item_idx" ON "world_vendor_observation" USING btree ("item_id","source_id");