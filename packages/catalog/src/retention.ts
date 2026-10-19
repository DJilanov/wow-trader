import { gameBuilds, type WowTraderDatabase } from "@wow-trader/db";
import { and, eq, inArray } from "drizzle-orm";

type CatalogBuildStatus = typeof gameBuilds.$inferSelect.status;

export interface CatalogBuildRetentionCandidate {
  readonly id: string;
  readonly product: string;
  readonly locale: string;
  readonly status: CatalogBuildStatus;
}

export interface CatalogBuildRetentionScope {
  readonly currentBuildId: string;
  readonly product: string;
  readonly locale: string;
  readonly publishing: boolean;
}

type CatalogRetentionDatabase = Pick<WowTraderDatabase, "delete" | "select">;

export function selectSupersededCatalogBuildIds(
  candidates: readonly CatalogBuildRetentionCandidate[],
  scope: CatalogBuildRetentionScope,
): string[] {
  return candidates
    .filter((candidate) => {
      if (candidate.id === scope.currentBuildId) return false;
      if (candidate.product !== scope.product || candidate.locale !== scope.locale) return false;
      return scope.publishing || candidate.status !== "published";
    })
    .map((candidate) => candidate.id);
}

export async function pruneSupersededCatalogBuilds(
  database: CatalogRetentionDatabase,
  scope: CatalogBuildRetentionScope,
): Promise<number> {
  const candidates = await database
    .select({
      id: gameBuilds.id,
      product: gameBuilds.product,
      locale: gameBuilds.locale,
      status: gameBuilds.status,
    })
    .from(gameBuilds)
    .where(and(eq(gameBuilds.product, scope.product), eq(gameBuilds.locale, scope.locale)));
  const supersededBuildIds = selectSupersededCatalogBuildIds(candidates, scope);
  if (supersededBuildIds.length === 0) return 0;

  const deleted = await database
    .delete(gameBuilds)
    .where(inArray(gameBuilds.id, supersededBuildIds))
    .returning({ id: gameBuilds.id });
  return deleted.length;
}
