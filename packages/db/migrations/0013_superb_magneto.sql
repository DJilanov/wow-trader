ALTER TABLE "market_scan" ADD COLUMN "provider" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "api_flavor" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "market_key_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "reported_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "visited_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "priced_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "no_buyout_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "unresolved_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "invalid_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "secret_row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "scan_duration_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "auction_house_stayed_open" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "quality_accepted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "market_scan" ADD COLUMN "quality_reason" text;--> statement-breakpoint
CREATE INDEX "market_scan_quality_time_idx" ON "market_scan" USING btree ("quality_accepted","completed_at");--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_market_key_version_check" CHECK ("market_scan"."market_key_version" > 0);--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_reported_rows_check" CHECK ("market_scan"."reported_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_visited_rows_check" CHECK ("market_scan"."visited_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_priced_rows_check" CHECK ("market_scan"."priced_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_no_buyout_rows_check" CHECK ("market_scan"."no_buyout_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_unresolved_rows_check" CHECK ("market_scan"."unresolved_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_invalid_rows_check" CHECK ("market_scan"."invalid_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_secret_rows_check" CHECK ("market_scan"."secret_row_count" >= 0);--> statement-breakpoint
ALTER TABLE "market_scan" ADD CONSTRAINT "market_scan_duration_check" CHECK ("market_scan"."scan_duration_ms" >= 0);