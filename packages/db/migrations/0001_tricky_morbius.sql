ALTER TABLE "raw_upload" ADD COLUMN "envelope_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD COLUMN "cooldown_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD COLUMN "cooldown_category_id" integer;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD COLUMN "category_cooldown_ms" integer DEFAULT 0 NOT NULL;