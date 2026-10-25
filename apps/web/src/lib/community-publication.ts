import { communityReferenceSnapshots } from "@wow-trader/db";
import { sql, type SQL } from "drizzle-orm";

export function communitySnapshotFreshnessCondition(now: Date = new Date()): SQL {
  return sql`(COALESCE(${communityReferenceSnapshots.manifest}->>'sourceKind','') NOT IN ('wowhead_profession_review','profession_reference_review')
    OR COALESCE(${communityReferenceSnapshots.manifest}->>'validUntil', '') > ${now.toISOString()})`;
}
