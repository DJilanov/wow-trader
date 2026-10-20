ALTER TABLE "recipe_input" DROP CONSTRAINT "recipe_input_item_version_fk";
--> statement-breakpoint
ALTER TABLE "recipe_output" DROP CONSTRAINT "recipe_output_item_version_fk";
--> statement-breakpoint
ALTER TABLE "recipe_teaching_item" DROP CONSTRAINT "recipe_teaching_item_item_version_fk";
--> statement-breakpoint
ALTER TABLE "recipe_teaching_item" DROP CONSTRAINT "recipe_teaching_item_learning_spell_version_fk";
--> statement-breakpoint
ALTER TABLE "transformation_input" DROP CONSTRAINT "transformation_input_item_version_fk";
--> statement-breakpoint
ALTER TABLE "transformation_output" DROP CONSTRAINT "transformation_output_item_version_fk";
--> statement-breakpoint
ALTER TABLE "recipe_input" ADD CONSTRAINT "recipe_input_item_version_fk" FOREIGN KEY ("build_id","reagent_item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_output" ADD CONSTRAINT "recipe_output_item_version_fk" FOREIGN KEY ("build_id","output_item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_teaching_item" ADD CONSTRAINT "recipe_teaching_item_item_version_fk" FOREIGN KEY ("build_id","teaching_item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_teaching_item" ADD CONSTRAINT "recipe_teaching_item_learning_spell_version_fk" FOREIGN KEY ("build_id","learning_spell_id") REFERENCES "public"."spell_version"("build_id","spell_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transformation_input" ADD CONSTRAINT "transformation_input_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transformation_output" ADD CONSTRAINT "transformation_output_item_version_fk" FOREIGN KEY ("build_id","item_id") REFERENCES "public"."item_version"("build_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
WITH "retained_game_build" AS (
	SELECT DISTINCT ON ("product", "locale") "id"
	FROM "game_build"
	ORDER BY
		"product",
		"locale",
		("status" = 'published') DESC,
		"published_at" DESC NULLS LAST,
		"extracted_at" DESC,
		"created_at" DESC
)
DELETE FROM "game_build"
WHERE "id" NOT IN (SELECT "id" FROM "retained_game_build");--> statement-breakpoint
CREATE UNIQUE INDEX "game_build_published_product_locale_uidx" ON "game_build" USING btree ("product","locale") WHERE "game_build"."status" = 'published';
