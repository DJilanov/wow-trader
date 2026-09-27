CREATE TABLE "world_quest_objective" (
	"build_id" uuid NOT NULL,
	"objective_id" integer NOT NULL,
	"quest_id" integer NOT NULL,
	"order_index" integer NOT NULL,
	"storage_index" integer NOT NULL,
	"amount" integer NOT NULL,
	"type" integer NOT NULL,
	"object_id" integer NOT NULL,
	"description" text NOT NULL,
	"flags" integer NOT NULL,
	"raw_record" jsonb NOT NULL,
	CONSTRAINT "world_quest_objective_build_id_objective_id_pk" PRIMARY KEY("build_id","objective_id")
);
--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "bullet_text" text;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "quest_info_id" integer;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "content_tuning_id" integer;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "start_item_id" integer;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "minimum_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "maximum_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "minimum_skill_id" integer;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "minimum_skill_value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "class_mask" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "race_masks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_quest_version" ADD COLUMN "raw_cli_task" jsonb;--> statement-breakpoint
ALTER TABLE "world_quest_objective" ADD CONSTRAINT "world_quest_objective_build_id_world_snapshot_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."world_snapshot"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_quest_objective_quest_idx" ON "world_quest_objective" USING btree ("build_id","quest_id","order_index");--> statement-breakpoint
CREATE INDEX "world_quest_objective_object_idx" ON "world_quest_objective" USING btree ("build_id","type","object_id");