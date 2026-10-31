import {
  characterInventoryItems,
  characterKnownRecipes,
  characterProfessions,
  characterProfessionSnapshots,
  characterProfessionSpecializations,
  rawUploads,
  traderInstallations,
  traderTrades,
  listTraderWatches,
} from "@wow-trader/db";
import { traderTradeSchema, type TraderTrade } from "@wow-trader/contracts";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "./database";

export interface TraderCharacter {
  readonly snapshotId: string;
  readonly product: string;
  readonly clientBuild: number;
  readonly region: string;
  readonly realm: string;
  readonly name: string;
  readonly faction: string;
  readonly moneyCopper: string;
  readonly inventoryScope: string;
  readonly observedAt: string;
  readonly inventory: readonly { readonly itemId: number; readonly quantity: number }[];
  readonly recipes: readonly {
    readonly recipeSpellId: number;
    readonly professionSkillLineId: number;
    readonly isDayCooldown: boolean | null;
  }[];
  readonly professions: readonly {
    readonly professionSkillLineId: number;
    readonly name: string;
    readonly skillLevel: number;
    readonly recipeListComplete: boolean;
  }[];
  readonly specializationSpellIds: readonly number[];
}

export async function loadTraderAccount(ownerId: string): Promise<{
  devices: {
    id: string;
    label: string;
    createdAt: string;
    lastSeenAt: string | null;
    revokedAt: string | null;
  }[];
  characters: TraderCharacter[];
  trades: TraderTrade[];
  watches: Awaited<ReturnType<typeof listTraderWatches>>;
}> {
  const database = getDatabase();
  const [devices, candidates, events, watches] = await Promise.all([
    database
      .select({
        id: traderInstallations.id,
        label: traderInstallations.label,
        createdAt: traderInstallations.createdAt,
        lastSeenAt: traderInstallations.lastSeenAt,
        revokedAt: traderInstallations.revokedAt,
      })
      .from(traderInstallations)
      .where(eq(traderInstallations.ownerId, ownerId))
      .orderBy(desc(traderInstallations.createdAt))
      .limit(50),
    database
      .select({ snapshot: characterProfessionSnapshots })
      .from(characterProfessionSnapshots)
      .innerJoin(rawUploads, eq(rawUploads.payloadId, characterProfessionSnapshots.payloadId))
      .innerJoin(
        traderInstallations,
        and(
          eq(traderInstallations.id, rawUploads.collectorInstallationId),
          eq(traderInstallations.ownerId, ownerId),
        ),
      )
      .orderBy(
        desc(characterProfessionSnapshots.completedAt),
        desc(characterProfessionSnapshots.snapshotId),
      )
      .limit(500),
    database
      .select({ data: traderTrades.data })
      .from(traderTrades)
      .where(eq(traderTrades.ownerId, ownerId))
      .orderBy(desc(traderTrades.recordedAt))
      .limit(10_000),
    listTraderWatches(database, ownerId),
  ]);
  const unique = new Map<string, (typeof candidates)[number]["snapshot"]>();
  for (const { snapshot } of candidates) {
    const key = `${snapshot.clientProduct}:${snapshot.region}:${snapshot.realmId}:${snapshot.characterFaction}:${snapshot.characterGuid || snapshot.characterName.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, snapshot);
  }
  const snapshots = [...unique.values()].slice(0, 50),
    ids = snapshots.map((row) => row.snapshotId);
  const [inventory, recipes, professions, specializations] = ids.length
    ? await Promise.all([
        database
          .select()
          .from(characterInventoryItems)
          .where(inArray(characterInventoryItems.snapshotId, ids)),
        database
          .select()
          .from(characterKnownRecipes)
          .where(inArray(characterKnownRecipes.snapshotId, ids)),
        database
          .select()
          .from(characterProfessions)
          .where(inArray(characterProfessions.snapshotId, ids)),
        database
          .select()
          .from(characterProfessionSpecializations)
          .where(inArray(characterProfessionSpecializations.snapshotId, ids)),
      ])
    : [[], [], [], []];
  return {
    devices: devices.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    })),
    characters: snapshots.map((row) => ({
      snapshotId: row.snapshotId,
      product: row.clientProduct,
      clientBuild: row.clientBuild,
      region: row.region,
      realm: row.realmId,
      name: row.characterName,
      faction: row.characterFaction,
      moneyCopper: row.moneyCopper.toString(),
      inventoryScope: row.inventoryScope,
      observedAt: row.completedAt.toISOString(),
      inventory: inventory
        .filter((item) => item.snapshotId === row.snapshotId)
        .map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
      recipes: recipes
        .filter((recipe) => recipe.snapshotId === row.snapshotId)
        .map((recipe) => ({
          recipeSpellId: recipe.recipeSpellId,
          professionSkillLineId: recipe.professionSkillLineId,
          isDayCooldown: recipe.isDayCooldown,
        })),
      professions: professions
        .filter((profession) => profession.snapshotId === row.snapshotId)
        .map((profession) => ({
          professionSkillLineId: profession.professionSkillLineId,
          name: profession.name,
          skillLevel: profession.skillLevel,
          recipeListComplete: profession.recipeListComplete,
        })),
      specializationSpellIds: specializations
        .filter((entry) => entry.snapshotId === row.snapshotId)
        .map((entry) => entry.specializationSpellId),
    })),
    trades: events.map((event) => traderTradeSchema.parse(event.data)),
    watches,
  };
}
