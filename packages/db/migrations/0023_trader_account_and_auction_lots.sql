CREATE TABLE "trader_installation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "trader_installation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "trader_pairing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_hash" text NOT NULL,
	"user_hash" text NOT NULL,
	"label" text NOT NULL,
	"owner_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"last_poll_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trader_pairing_device_hash_unique" UNIQUE("device_hash"),
	CONSTRAINT "trader_pairing_user_hash_unique" UNIQUE("user_hash")
);
--> statement-breakpoint
CREATE TABLE "trader_request_bucket" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trader_sync_change" (
	"installation_id" uuid NOT NULL,
	"change_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trader_sync_change_installation_id_change_id_pk" PRIMARY KEY("installation_id","change_id")
);
--> statement-breakpoint
CREATE TABLE "trader_trade" (
	"owner_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"installation_id" uuid,
	"source_key" text NOT NULL,
	"data" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trader_trade_owner_id_event_id_pk" PRIMARY KEY("owner_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "trader_watch" (
	"owner_id" text NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trader_watch_owner_id_key_pk" PRIMARY KEY("owner_id","key")
);
--> statement-breakpoint
ALTER TABLE "auction_price_level" ADD COLUMN "lots" jsonb;--> statement-breakpoint
ALTER TABLE "market_item_observation" ADD COLUMN "has_lot_evidence" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_upload" ADD COLUMN "collector_installation_id" uuid;--> statement-breakpoint
ALTER TABLE "trader_sync_change" ADD CONSTRAINT "trader_sync_change_installation_id_trader_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."trader_installation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trader_trade" ADD CONSTRAINT "trader_trade_installation_id_trader_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."trader_installation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trader_installation_owner_idx" ON "trader_installation" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "trader_pairing_expiry_idx" ON "trader_pairing" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trader_trade_source_uidx" ON "trader_trade" USING btree ("owner_id","source_key");--> statement-breakpoint
ALTER TABLE "raw_upload" ADD CONSTRAINT "raw_upload_collector_installation_id_trader_installation_id_fk" FOREIGN KEY ("collector_installation_id") REFERENCES "public"."trader_installation"("id") ON DELETE no action ON UPDATE no action;