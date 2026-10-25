CREATE TABLE "guide_support_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" text NOT NULL,
	"provider_order_id" text,
	"checkout_url" text,
	"environment" text NOT NULL,
	"amount" integer DEFAULT 999 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"state" text DEFAULT 'creating' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"approval_reason" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revocation_reason" text,
	CONSTRAINT "guide_support_order_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "guide_support_order_discord_check" CHECK ("guide_support_order"."discord_id" ~ '^[0-9]{17,20}$'),
	CONSTRAINT "guide_support_order_price_check" CHECK ("guide_support_order"."amount" = 999 AND "guide_support_order"."currency" = 'USD'),
	CONSTRAINT "guide_support_order_environment_check" CHECK ("guide_support_order"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "guide_support_order_state_check" CHECK ("guide_support_order"."state" IN ('creating', 'pending', 'paid', 'approved', 'failed', 'revoked')),
	CONSTRAINT "guide_support_order_approval_check" CHECK ("guide_support_order"."state" != 'approved' OR ("guide_support_order"."approved_at" IS NOT NULL AND "guide_support_order"."approved_by" IS NOT NULL AND "guide_support_order"."provider_order_id" IS NOT NULL AND "guide_support_order"."revoked_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "guide_support_order_discord_created_idx" ON "guide_support_order" USING btree ("discord_id","created_at");