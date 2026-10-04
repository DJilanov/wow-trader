CREATE TABLE "leveling_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"chapter_id" text NOT NULL,
	"route_version" text NOT NULL,
	"client_build" integer NOT NULL,
	"step_id" text NOT NULL,
	"profile" jsonb NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"client_hash" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leveling_feedback_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "leveling_feedback_category_check" CHECK ("leveling_feedback"."category" IN ('wrong-location', 'quest-unavailable', 'confusing-instruction', 'broken-transition', 'other')),
	CONSTRAINT "leveling_feedback_status_check" CHECK ("leveling_feedback"."status" IN ('new', 'reviewed', 'resolved', 'dismissed')),
	CONSTRAINT "leveling_feedback_message_check" CHECK (length("leveling_feedback"."message") BETWEEN 10 AND 1500)
);
--> statement-breakpoint
CREATE INDEX "leveling_feedback_client_created_idx" ON "leveling_feedback" USING btree ("client_hash","created_at");--> statement-breakpoint
CREATE INDEX "leveling_feedback_status_created_idx" ON "leveling_feedback" USING btree ("status","created_at");