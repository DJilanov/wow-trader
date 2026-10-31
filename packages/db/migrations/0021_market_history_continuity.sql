CREATE TABLE "market_history_link" (
	"client_product" text NOT NULL,
	"region" text NOT NULL,
	"realm_id" text NOT NULL,
	"auction_house_type" "auction_house_type" NOT NULL,
	"from_build" integer NOT NULL,
	"to_build" integer NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_history_link_client_product_region_realm_id_auction_house_type_from_build_to_build_pk" PRIMARY KEY("client_product","region","realm_id","auction_house_type","from_build","to_build"),
	CONSTRAINT "market_history_link_build_check" CHECK ("market_history_link"."from_build" > 0 AND "market_history_link"."to_build" > "market_history_link"."from_build"),
	CONSTRAINT "market_history_link_reason_check" CHECK (length(trim("market_history_link"."reason")) >= 12)
);
