CREATE TYPE "public"."external_snapshot_status" AS ENUM('review_required', 'published', 'rejected');--> statement-breakpoint
CREATE TABLE "external_data_publication" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_data_publication_snapshot_id_unique" UNIQUE("snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "external_data_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"checksum" text NOT NULL,
	"source_payload_checksum" text NOT NULL,
	"supplemental_checksum" text,
	"byte_size" integer NOT NULL,
	"upstream_generated_date" text NOT NULL,
	"parser_version" text NOT NULL,
	"status" "external_snapshot_status" DEFAULT 'review_required' NOT NULL,
	"raw_payload" text NOT NULL,
	"payload" jsonb NOT NULL,
	"supplemental_payload" jsonb NOT NULL,
	"validation_report" jsonb NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_data_snapshot_byte_size_check" CHECK ("external_data_snapshot"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "external_data_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"homepage_url" text NOT NULL,
	"data_url" text NOT NULL,
	"license" text NOT NULL,
	"license_url" text NOT NULL,
	"attribution" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_data_publication" ADD CONSTRAINT "external_data_publication_source_id_external_data_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."external_data_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_data_publication" ADD CONSTRAINT "external_data_publication_snapshot_id_external_data_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."external_data_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_data_snapshot" ADD CONSTRAINT "external_data_snapshot_source_id_external_data_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."external_data_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_data_snapshot_source_checksum_uidx" ON "external_data_snapshot" USING btree ("source_id","checksum");--> statement-breakpoint
CREATE INDEX "external_data_snapshot_source_status_idx" ON "external_data_snapshot" USING btree ("source_id","status","retrieved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "external_data_source_slug_uidx" ON "external_data_source" USING btree ("slug");