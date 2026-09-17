ALTER TABLE "item_version" ADD COLUMN "item_level" integer;--> statement-breakpoint
UPDATE "item_version"
SET "item_level" = CASE
	WHEN "raw_record" #>> '{itemSparse,ItemLevel}' ~ '^[0-9]+$'
		THEN GREATEST(0, ("raw_record" #>> '{itemSparse,ItemLevel}')::integer)
	ELSE 0
END;--> statement-breakpoint
ALTER TABLE "item_version" ALTER COLUMN "item_level" SET NOT NULL;
