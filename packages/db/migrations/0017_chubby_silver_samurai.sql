CREATE TABLE "character_inventory_item" (
	"snapshot_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "character_inventory_item_snapshot_id_item_id_pk" PRIMARY KEY("snapshot_id","item_id"),
	CONSTRAINT "character_inventory_item_quantity_check" CHECK ("character_inventory_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "character_known_recipe" (
	"snapshot_id" uuid NOT NULL,
	"profession_skill_line_id" integer NOT NULL,
	"recipe_spell_id" integer NOT NULL,
	"name" text,
	"cooldown_seconds_remaining" integer,
	"is_day_cooldown" boolean,
	"charges" integer,
	"maximum_charges" integer,
	CONSTRAINT "character_known_recipe_snapshot_id_profession_skill_line_id_recipe_spell_id_pk" PRIMARY KEY("snapshot_id","profession_skill_line_id","recipe_spell_id"),
	CONSTRAINT "character_known_recipe_cooldown_check" CHECK ("character_known_recipe"."cooldown_seconds_remaining" IS NULL OR "character_known_recipe"."cooldown_seconds_remaining" >= 0)
);
--> statement-breakpoint
CREATE TABLE "character_profession_snapshot" (
	"snapshot_id" uuid PRIMARY KEY NOT NULL,
	"payload_id" uuid NOT NULL,
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"locale" text NOT NULL,
	"region" text NOT NULL,
	"realm_id" text NOT NULL,
	"character_name" text NOT NULL,
	"character_faction" text NOT NULL,
	"character_guid" text,
	"anonymous_installation_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"money_copper" bigint NOT NULL,
	"inventory_scope" text NOT NULL,
	"profession_count" integer NOT NULL,
	"known_recipe_count" integer NOT NULL,
	"inventory_item_count" integer NOT NULL,
	CONSTRAINT "character_profession_snapshot_payload_id_unique" UNIQUE("payload_id"),
	CONSTRAINT "character_profession_snapshot_money_check" CHECK ("character_profession_snapshot"."money_copper" >= 0),
	CONSTRAINT "character_profession_snapshot_scope_check" CHECK ("character_profession_snapshot"."inventory_scope" IN ('bags', 'bags_and_bank'))
);
--> statement-breakpoint
CREATE TABLE "character_profession_specialization" (
	"snapshot_id" uuid NOT NULL,
	"profession_skill_line_id" integer NOT NULL,
	"specialization_spell_id" integer NOT NULL,
	CONSTRAINT "character_profession_specialization_snapshot_id_profession_skill_line_id_specialization_spell_id_pk" PRIMARY KEY("snapshot_id","profession_skill_line_id","specialization_spell_id")
);
--> statement-breakpoint
CREATE TABLE "character_profession" (
	"snapshot_id" uuid NOT NULL,
	"profession_skill_line_id" integer NOT NULL,
	"parent_profession_skill_line_id" integer,
	"name" text NOT NULL,
	"skill_level" integer NOT NULL,
	"maximum_skill_level" integer NOT NULL,
	"skill_modifier" integer NOT NULL,
	"api_flavor" text NOT NULL,
	"recipe_list_complete" boolean NOT NULL,
	CONSTRAINT "character_profession_snapshot_id_profession_skill_line_id_pk" PRIMARY KEY("snapshot_id","profession_skill_line_id"),
	CONSTRAINT "character_profession_skill_check" CHECK ("character_profession"."skill_level" >= 0),
	CONSTRAINT "character_profession_max_skill_check" CHECK ("character_profession"."maximum_skill_level" >= 0)
);
--> statement-breakpoint
ALTER TABLE "character_inventory_item" ADD CONSTRAINT "character_inventory_item_snapshot_id_character_profession_snapshot_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."character_profession_snapshot"("snapshot_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_known_recipe" ADD CONSTRAINT "character_known_recipe_snapshot_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."character_profession_snapshot"("snapshot_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_known_recipe" ADD CONSTRAINT "character_known_recipe_profession_fk" FOREIGN KEY ("snapshot_id","profession_skill_line_id") REFERENCES "public"."character_profession"("snapshot_id","profession_skill_line_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_profession_snapshot" ADD CONSTRAINT "character_profession_snapshot_payload_id_raw_upload_payload_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_upload"("payload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_profession_specialization" ADD CONSTRAINT "character_profession_specialization_snapshot_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."character_profession_snapshot"("snapshot_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_profession_specialization" ADD CONSTRAINT "character_profession_specialization_profession_fk" FOREIGN KEY ("snapshot_id","profession_skill_line_id") REFERENCES "public"."character_profession"("snapshot_id","profession_skill_line_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_profession" ADD CONSTRAINT "character_profession_snapshot_id_character_profession_snapshot_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."character_profession_snapshot"("snapshot_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_inventory_item_item_idx" ON "character_inventory_item" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "character_known_recipe_recipe_idx" ON "character_known_recipe" USING btree ("recipe_spell_id");--> statement-breakpoint
CREATE INDEX "character_profession_snapshot_character_idx" ON "character_profession_snapshot" USING btree ("client_product","client_build","realm_id","character_name","completed_at");--> statement-breakpoint
CREATE INDEX "character_profession_specialization_spell_idx" ON "character_profession_specialization" USING btree ("specialization_spell_id");--> statement-breakpoint
CREATE INDEX "character_profession_skill_line_idx" ON "character_profession" USING btree ("profession_skill_line_id");
