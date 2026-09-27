CREATE TABLE "market_item_observation" (
	"scan_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"market_key" text NOT NULL,
	"minimum_price_copper" bigint NOT NULL,
	"tenth_percentile_price_copper" bigint NOT NULL,
	"median_price_copper" bigint NOT NULL,
	"ninetieth_percentile_price_copper" bigint NOT NULL,
	"available_quantity" integer NOT NULL,
	"listing_count" integer NOT NULL,
	"quantity_within_five_percent" integer NOT NULL,
	"quantity_within_ten_percent" integer NOT NULL,
	CONSTRAINT "market_item_observation_scan_id_market_key_pk" PRIMARY KEY("scan_id","market_key"),
	CONSTRAINT "market_item_observation_item_check" CHECK ("market_item_observation"."item_id" > 0),
	CONSTRAINT "market_item_observation_price_check" CHECK ("market_item_observation"."minimum_price_copper" > 0),
	CONSTRAINT "market_item_observation_quantity_check" CHECK ("market_item_observation"."available_quantity" > 0),
	CONSTRAINT "market_item_observation_listing_check" CHECK ("market_item_observation"."listing_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "market_item_signal" (
	"client_product" text NOT NULL,
	"client_build" integer NOT NULL,
	"region" text NOT NULL,
	"realm_id" text NOT NULL,
	"auction_house_type" "auction_house_type" NOT NULL,
	"item_id" integer NOT NULL,
	"as_of_scan_id" uuid NOT NULL,
	"signal" text NOT NULL,
	"observation_count" integer NOT NULL,
	"minimum_observation_count" integer DEFAULT 6 NOT NULL,
	"current_price_copper" bigint,
	"normal_price_copper" bigint,
	"lower_price_copper" bigint,
	"upper_price_copper" bigint,
	"difference_basis_points" integer,
	"current_quantity" integer,
	"normal_quantity" integer,
	"supply_ratio_basis_points" integer,
	"current_listing_count" integer,
	"confidence_basis_points" integer,
	"direction" text,
	"model_version" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "market_item_signal_client_product_client_build_region_realm_id_auction_house_type_item_id_pk" PRIMARY KEY("client_product","client_build","region","realm_id","auction_house_type","item_id"),
	CONSTRAINT "market_item_signal_item_check" CHECK ("market_item_signal"."item_id" > 0),
	CONSTRAINT "market_item_signal_observation_check" CHECK ("market_item_signal"."observation_count" >= 0),
	CONSTRAINT "market_item_signal_kind_check" CHECK ("market_item_signal"."signal" IN ('collecting', 'bargain', 'normal', 'rising', 'spike_risk', 'oversupplied', 'falling', 'too_thin')),
	CONSTRAINT "market_item_signal_direction_check" CHECK ("market_item_signal"."direction" IS NULL OR "market_item_signal"."direction" IN ('up', 'flat', 'down'))
);
--> statement-breakpoint
ALTER TABLE "market_item_observation" ADD CONSTRAINT "market_item_observation_scan_id_market_scan_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."market_scan"("scan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_item_signal" ADD CONSTRAINT "market_item_signal_as_of_scan_id_market_scan_scan_id_fk" FOREIGN KEY ("as_of_scan_id") REFERENCES "public"."market_scan"("scan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_item_observation_item_idx" ON "market_item_observation" USING btree ("item_id","scan_id");--> statement-breakpoint
CREATE INDEX "market_item_signal_market_idx" ON "market_item_signal" USING btree ("client_product","region","realm_id","auction_house_type","generated_at");--> statement-breakpoint
WITH "market_totals" AS (
	SELECT
		"scan_id",
		"item_id",
		"market_key",
		MIN("unit_price_copper") AS "minimum_price_copper",
		SUM("quantity")::integer AS "available_quantity",
		SUM("listing_count")::integer AS "listing_count"
	FROM "auction_price_level"
	GROUP BY "scan_id", "item_id", "market_key"
),
"ranked_levels" AS (
	SELECT
		"level".*,
		"totals"."minimum_price_copper",
		"totals"."available_quantity",
		"totals"."listing_count" AS "total_listing_count",
		SUM("level"."quantity") OVER (
			PARTITION BY "level"."scan_id", "level"."market_key"
			ORDER BY "level"."unit_price_copper"
			ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
		)::bigint AS "cumulative_quantity"
	FROM "auction_price_level" AS "level"
	INNER JOIN "market_totals" AS "totals"
		ON "totals"."scan_id" = "level"."scan_id"
		AND "totals"."market_key" = "level"."market_key"
)
INSERT INTO "market_item_observation" (
	"scan_id", "item_id", "market_key", "minimum_price_copper",
	"tenth_percentile_price_copper", "median_price_copper", "ninetieth_percentile_price_copper",
	"available_quantity", "listing_count", "quantity_within_five_percent", "quantity_within_ten_percent"
)
SELECT
	"scan_id",
	MIN("item_id") AS "item_id",
	"market_key",
	MIN("minimum_price_copper") AS "minimum_price_copper",
	MIN("unit_price_copper") FILTER (WHERE "cumulative_quantity" * 10 >= "available_quantity") AS "tenth_percentile_price_copper",
	MIN("unit_price_copper") FILTER (WHERE "cumulative_quantity" * 2 >= "available_quantity") AS "median_price_copper",
	MIN("unit_price_copper") FILTER (WHERE "cumulative_quantity" * 10 >= "available_quantity" * 9) AS "ninetieth_percentile_price_copper",
	MIN("available_quantity") AS "available_quantity",
	MIN("total_listing_count") AS "listing_count",
	SUM("quantity") FILTER (WHERE "unit_price_copper" * 100 <= "minimum_price_copper" * 105)::integer AS "quantity_within_five_percent",
	SUM("quantity") FILTER (WHERE "unit_price_copper" * 100 <= "minimum_price_copper" * 110)::integer AS "quantity_within_ten_percent"
FROM "ranked_levels"
GROUP BY "scan_id", "market_key"
ON CONFLICT DO NOTHING;
