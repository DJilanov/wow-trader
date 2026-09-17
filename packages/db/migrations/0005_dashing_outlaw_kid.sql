CREATE TYPE "public"."transformation_kind" AS ENUM('item_use');--> statement-breakpoint
CREATE TABLE "transformation_input" (
	"build_id" uuid NOT NULL,
	"transformation_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "transformation_input_build_id_transformation_id_slot_pk" PRIMARY KEY("build_id","transformation_id","slot"),
	CONSTRAINT "transformation_input_quantity_check" CHECK ("transformation_input"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "transformation_output" (
	"build_id" uuid NOT NULL,
	"transformation_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"item_id" integer NOT NULL,
	"minimum_quantity" integer NOT NULL,
	"maximum_quantity" integer NOT NULL,
	"expected_quantity_numerator" bigint NOT NULL,
	"expected_quantity_denominator" bigint NOT NULL,
	CONSTRAINT "transformation_output_build_id_transformation_id_slot_pk" PRIMARY KEY("build_id","transformation_id","slot"),
	CONSTRAINT "transformation_output_minimum_check" CHECK ("transformation_output"."minimum_quantity" >= 0),
	CONSTRAINT "transformation_output_range_check" CHECK ("transformation_output"."maximum_quantity" >= "transformation_output"."minimum_quantity"),
	CONSTRAINT "transformation_output_expected_denominator_check" CHECK ("transformation_output"."expected_quantity_denominator" > 0)
);
--> statement-breakpoint
CREATE TABLE "transformation_version" (
	"build_id" uuid NOT NULL,
	"transformation_id" integer NOT NULL,
	"spell_id" integer NOT NULL,
	"source_item_id" integer NOT NULL,
	"kind" "transformation_kind" NOT NULL,
	"cooldown_ms" integer DEFAULT 0 NOT NULL,
	"category_cooldown_ms" integer DEFAULT 0 NOT NULL,
	"extraction_status" "extraction_status" NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "transformation_version_build_id_transformation_id_pk" PRIMARY KEY("build_id","transformation_id"),
	CONSTRAINT "transformation_version_cooldown_check" CHECK ("transformation_version"."cooldown_ms" >= 0),
	CONSTRAINT "transformation_version_category_cooldown_check" CHECK ("transformation_version"."category_cooldown_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "transformation_input" ADD CONSTRAINT "transformation_input_version_fk" FOREIGN KEY ("build_id","transformation_id") REFERENCES "public"."transformation_version"("build_id","transformation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transformation_input" ADD CONSTRAINT "transformation_input_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transformation_output" ADD CONSTRAINT "transformation_output_version_fk" FOREIGN KEY ("build_id","transformation_id") REFERENCES "public"."transformation_version"("build_id","transformation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transformation_output" ADD CONSTRAINT "transformation_output_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transformation_version" ADD CONSTRAINT "transformation_version_build_id_game_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."game_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transformation_version" ADD CONSTRAINT "transformation_version_spell_version_fk" FOREIGN KEY ("build_id","spell_id") REFERENCES "public"."spell_version"("build_id","spell_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transformation_version" ADD CONSTRAINT "transformation_version_source_item_fk" FOREIGN KEY ("build_id","source_item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transformation_input_item_idx" ON "transformation_input" USING btree ("build_id","item_id");--> statement-breakpoint
CREATE INDEX "transformation_output_item_idx" ON "transformation_output" USING btree ("build_id","item_id");--> statement-breakpoint
CREATE INDEX "transformation_version_spell_idx" ON "transformation_version" USING btree ("build_id","spell_id");