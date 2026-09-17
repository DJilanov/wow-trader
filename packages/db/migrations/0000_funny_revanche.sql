CREATE TYPE "public"."auction_house_type" AS ENUM('alliance', 'horde', 'neutral', 'region', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."availability_state" AS ENUM('client_only', 'announced', 'observed', 'available', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."build_status" AS ENUM('extracting', 'validating', 'review_required', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('complete', 'missing_teaching_item', 'missing_output', 'ambiguous', 'encrypted');--> statement-breakpoint
CREATE TYPE "public"."hotfix_status" AS ENUM('applied', 'missing', 'not_available');--> statement-breakpoint
CREATE TYPE "public"."output_kind" AS ENUM('item', 'enchantment', 'service', 'conversion');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('accepted', 'processing', 'processed', 'rejected');--> statement-breakpoint
CREATE TABLE "auction_price_level" (
	"scan_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"market_key" text NOT NULL,
	"unit_price_copper" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"listing_count" integer NOT NULL,
	CONSTRAINT "auction_price_level_scan_id_market_key_unit_price_copper_pk" PRIMARY KEY("scan_id","market_key","unit_price_copper")
);
--> statement-breakpoint
CREATE TABLE "content_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" uuid NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_id" integer NOT NULL,
	"state" "availability_state" NOT NULL,
	"region" text,
	"phase" text,
	"effective_from" timestamp with time zone,
	"effective_until" timestamp with time zone,
	"evidence_id" uuid
);
--> statement-breakpoint
CREATE TABLE "game_build" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_key" text NOT NULL,
	"product" text NOT NULL,
	"client_version" text NOT NULL,
	"build_number" integer NOT NULL,
	"build_key" text NOT NULL,
	"cdn_key" text NOT NULL,
	"locale" text NOT NULL,
	"hotfix_status" "hotfix_status" NOT NULL,
	"hotfix_hash" text,
	"definitions_revision" text NOT NULL,
	"extractor_version" text NOT NULL,
	"status" "build_status" DEFAULT 'extracting' NOT NULL,
	"extracted_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_version" (
	"build_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"class_id" integer NOT NULL,
	"subclass_id" integer NOT NULL,
	"quality" integer NOT NULL,
	"required_level" integer NOT NULL,
	"required_skill_id" integer,
	"required_skill_rank" integer NOT NULL,
	"stack_size" integer NOT NULL,
	"binding" integer NOT NULL,
	"buy_price_copper" bigint NOT NULL,
	"sell_price_copper" bigint NOT NULL,
	"icon_file_data_id" integer,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "item_version_build_id_item_id_pk" PRIMARY KEY("build_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "item" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"first_seen_build_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_scan" (
	"scan_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_build" integer NOT NULL,
	"region" text NOT NULL,
	"realm_id" text NOT NULL,
	"auction_house_type" "auction_house_type" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"completeness" double precision NOT NULL,
	"item_count" integer NOT NULL,
	"price_level_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profession_version" (
	"build_id" uuid NOT NULL,
	"skill_line_id" integer NOT NULL,
	"name" text NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "profession_version_build_id_skill_line_id_pk" PRIMARY KEY("build_id","skill_line_id")
);
--> statement-breakpoint
CREATE TABLE "profession" (
	"skill_line_id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profession_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "raw_upload" (
	"payload_id" uuid PRIMARY KEY NOT NULL,
	"payload_type" text NOT NULL,
	"schema_version" text NOT NULL,
	"checksum" text NOT NULL,
	"status" "upload_status" NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"region" text NOT NULL,
	"realm_id" text NOT NULL,
	"auction_house_type" "auction_house_type" NOT NULL,
	"anonymous_installation_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"completeness" double precision NOT NULL,
	"raw_payload_uri" text,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recipe_input" (
	"build_id" uuid NOT NULL,
	"recipe_spell_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"reagent_item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	CONSTRAINT "recipe_input_build_id_recipe_spell_id_slot_pk" PRIMARY KEY("build_id","recipe_spell_id","slot")
);
--> statement-breakpoint
CREATE TABLE "recipe_output" (
	"build_id" uuid NOT NULL,
	"recipe_spell_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"output_item_id" integer,
	"enchantment_id" integer,
	"minimum_quantity" integer NOT NULL,
	"maximum_quantity" integer NOT NULL,
	"expected_quantity_numerator" bigint NOT NULL,
	"expected_quantity_denominator" bigint NOT NULL,
	CONSTRAINT "recipe_output_build_id_recipe_spell_id_slot_pk" PRIMARY KEY("build_id","recipe_spell_id","slot")
);
--> statement-breakpoint
CREATE TABLE "recipe_teaching_item" (
	"build_id" uuid NOT NULL,
	"recipe_spell_id" integer NOT NULL,
	"teaching_item_id" integer NOT NULL,
	"learning_spell_id" integer,
	CONSTRAINT "recipe_teaching_item_build_id_recipe_spell_id_teaching_item_id_pk" PRIMARY KEY("build_id","recipe_spell_id","teaching_item_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_version" (
	"build_id" uuid NOT NULL,
	"recipe_spell_id" integer NOT NULL,
	"profession_skill_line_id" integer NOT NULL,
	"required_skill_rank" integer NOT NULL,
	"craft_time_ms" integer NOT NULL,
	"output_kind" "output_kind" NOT NULL,
	"extraction_status" "extraction_status" NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "recipe_version_build_id_recipe_spell_id_pk" PRIMARY KEY("build_id","recipe_spell_id")
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"recipe_spell_id" integer PRIMARY KEY NOT NULL,
	"first_seen_build_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" uuid,
	"item_id" integer NOT NULL,
	"source_kind" text NOT NULL,
	"source_entity_id" integer,
	"map_id" integer,
	"difficulty_id" integer,
	"phase" text,
	"evidence_type" text NOT NULL,
	"status" text NOT NULL,
	"observation_count" integer DEFAULT 0 NOT NULL,
	"eligible_attempts" bigint DEFAULT 0 NOT NULL,
	"estimated_probability" numeric(18, 12),
	"confidence_low" numeric(18, 12),
	"confidence_high" numeric(18, 12),
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"raw_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spell_version" (
	"build_id" uuid NOT NULL,
	"spell_id" integer NOT NULL,
	"name" text NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "spell_version_build_id_spell_id_pk" PRIMARY KEY("build_id","spell_id")
);
--> statement-breakpoint
CREATE TABLE "spell" (
	"spell_id" integer PRIMARY KEY NOT NULL,
	"first_seen_build_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auction_price_level" ADD CONSTRAINT "auction_price_level_scan_id_market_scan_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."market_scan"("scan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_availability" ADD CONSTRAINT "content_availability_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_version" ADD CONSTRAINT "item_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_version" ADD CONSTRAINT "item_version_item_id_item_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profession_version" ADD CONSTRAINT "profession_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profession_version" ADD CONSTRAINT "profession_version_skill_line_id_profession_skill_line_id_fk" FOREIGN KEY ("skill_line_id") REFERENCES "public"."profession"("skill_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_input" ADD CONSTRAINT "recipe_input_reagent_item_id_item_item_id_fk" FOREIGN KEY ("reagent_item_id") REFERENCES "public"."item"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_output" ADD CONSTRAINT "recipe_output_output_item_id_item_item_id_fk" FOREIGN KEY ("output_item_id") REFERENCES "public"."item"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_teaching_item" ADD CONSTRAINT "recipe_teaching_item_teaching_item_id_item_item_id_fk" FOREIGN KEY ("teaching_item_id") REFERENCES "public"."item"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_recipe_spell_id_recipe_recipe_spell_id_fk" FOREIGN KEY ("recipe_spell_id") REFERENCES "public"."recipe"("recipe_spell_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_profession_skill_line_id_profession_skill_line_id_fk" FOREIGN KEY ("profession_skill_line_id") REFERENCES "public"."profession"("skill_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_recipe_spell_id_spell_spell_id_fk" FOREIGN KEY ("recipe_spell_id") REFERENCES "public"."spell"("spell_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_claim" ADD CONSTRAINT "source_claim_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spell_version" ADD CONSTRAINT "spell_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spell_version" ADD CONSTRAINT "spell_version_spell_id_spell_spell_id_fk" FOREIGN KEY ("spell_id") REFERENCES "public"."spell"("spell_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auction_price_level_item_idx" ON "auction_price_level" USING btree ("item_id","scan_id");--> statement-breakpoint
CREATE INDEX "auction_price_level_market_key_idx" ON "auction_price_level" USING btree ("market_key","unit_price_copper");--> statement-breakpoint
CREATE INDEX "content_availability_entity_idx" ON "content_availability" USING btree ("build_id","entity_kind","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_build_snapshot_key_uidx" ON "game_build" USING btree ("snapshot_key");--> statement-breakpoint
CREATE INDEX "game_build_current_idx" ON "game_build" USING btree ("product","locale","status","published_at");--> statement-breakpoint
CREATE INDEX "item_version_name_idx" ON "item_version" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "market_scan_payload_uidx" ON "market_scan" USING btree ("payload_id");--> statement-breakpoint
CREATE INDEX "market_scan_market_time_idx" ON "market_scan" USING btree ("region","realm_id","auction_house_type","completed_at");--> statement-breakpoint
CREATE INDEX "raw_upload_status_idx" ON "raw_upload" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "raw_upload_market_idx" ON "raw_upload" USING btree ("region","realm_id","auction_house_type");--> statement-breakpoint
CREATE INDEX "recipe_input_reagent_idx" ON "recipe_input" USING btree ("build_id","reagent_item_id");--> statement-breakpoint
CREATE INDEX "recipe_output_item_idx" ON "recipe_output" USING btree ("build_id","output_item_id");--> statement-breakpoint
CREATE INDEX "recipe_version_profession_idx" ON "recipe_version" USING btree ("build_id","profession_skill_line_id");--> statement-breakpoint
CREATE INDEX "source_claim_item_idx" ON "source_claim" USING btree ("item_id","status");--> statement-breakpoint
CREATE INDEX "spell_version_name_idx" ON "spell_version" USING btree ("name");