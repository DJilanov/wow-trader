import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import {
  traderTradeSchema,
  traderWatchSchema,
  type TraderTrade,
  type TraderWatch,
  type TraderSync,
} from "@wow-trader/contracts";
import type { WowTraderDatabase } from "./client.js";
import {
  traderInstallations,
  traderPairings,
  traderRequestBuckets,
  traderSyncChanges,
  traderTrades,
  traderWatches,
} from "./schema.js";

export interface TraderPrincipal {
  readonly installationId: string;
  readonly ownerId: string;
}
export class TraderAccountError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function traderSecretHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function traderWatchKey(item: Pick<TraderWatch, "product" | "market" | "itemId">): string {
  return `${item.product}:${item.market}:${item.itemId}`;
}

export async function consumeTraderRate(
  database: WowTraderDatabase,
  key: string,
  maximum: number,
  seconds = 60,
): Promise<void> {
  const now = new Date(),
    expires = new Date(now.getTime() + seconds * 1000);
  const [row] = await database
    .insert(traderRequestBuckets)
    .values({ key, count: 1, expiresAt: expires })
    .onConflictDoUpdate({
      target: traderRequestBuckets.key,
      set: {
        count: sql`CASE WHEN ${traderRequestBuckets.expiresAt} <= ${now.toISOString()}::timestamptz THEN 1 ELSE ${traderRequestBuckets.count} + 1 END`,
        expiresAt: sql`CASE WHEN ${traderRequestBuckets.expiresAt} <= ${now.toISOString()}::timestamptz THEN ${expires.toISOString()}::timestamptz ELSE ${traderRequestBuckets.expiresAt} END`,
      },
    })
    .returning({ count: traderRequestBuckets.count });
  if (!row || row.count > maximum)
    throw new TraderAccountError(
      "rate_limited",
      429,
      "Too many requests. Please wait before trying again.",
    );
}

export async function startTraderPairing(
  database: WowTraderDatabase,
  label: string,
  origin: string,
): Promise<{
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  intervalSeconds: 5;
}> {
  const deviceCode = randomBytes(32).toString("base64url");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const characters = [...randomBytes(8)].map((byte) => alphabet[byte % alphabet.length]).join("");
  const userCode = characters.slice(0, 4) + "-" + characters.slice(4);
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await database.insert(traderPairings).values({
    deviceHash: traderSecretHash(deviceCode),
    userHash: traderSecretHash(userCode),
    label,
    expiresAt,
  });
  await database
    .delete(traderPairings)
    .where(lt(traderPairings.expiresAt, new Date(Date.now() - 86_400_000)));
  await database
    .delete(traderRequestBuckets)
    .where(lt(traderRequestBuckets.expiresAt, new Date(Date.now() - 86_400_000)));
  return {
    deviceCode,
    userCode,
    verificationUri: `${origin}/tools/forever/trader/account?code=${userCode}`,
    expiresAt: expiresAt.toISOString(),
    intervalSeconds: 5,
  };
}

export async function traderPairingPreview(
  database: WowTraderDatabase,
  userCode: string,
): Promise<{ label: string; expiresAt: string } | null> {
  const [row] = await database
    .select()
    .from(traderPairings)
    .where(eq(traderPairings.userHash, traderSecretHash(userCode)))
    .limit(1);
  return row && row.expiresAt.getTime() > Date.now() && !row.consumedAt
    ? { label: row.label, expiresAt: row.expiresAt.toISOString() }
    : null;
}

export async function approveTraderPairing(
  database: WowTraderDatabase,
  ownerId: string,
  userCode: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"trader-owner:" + ownerId}))`,
    );
    const devices = await transaction
      .select({ id: traderInstallations.id })
      .from(traderInstallations)
      .where(and(eq(traderInstallations.ownerId, ownerId), isNull(traderInstallations.revokedAt)));
    if (devices.length >= 5)
      throw new TraderAccountError(
        "device_limit",
        409,
        "Disconnect an old installation before adding another. Five active installations are supported.",
      );
    const rows = await transaction
      .update(traderPairings)
      .set({ ownerId })
      .where(
        and(
          eq(traderPairings.userHash, traderSecretHash(userCode)),
          isNull(traderPairings.ownerId),
          isNull(traderPairings.consumedAt),
          sql`${traderPairings.expiresAt} > now()`,
        ),
      )
      .returning({ id: traderPairings.id });
    if (!rows.length)
      throw new TraderAccountError(
        "pairing_unavailable",
        409,
        "This code has expired or was already approved. Start a new connection in Companion.",
      );
  });
}

export async function pollTraderPairing(
  database: WowTraderDatabase,
  deviceCode: string,
): Promise<
  | { status: "pending" }
  | { status: "expired" }
  | { status: "connected"; credential: string; installationId: string }
> {
  return database.transaction(async (transaction) => {
    const [row] = await transaction
      .select()
      .from(traderPairings)
      .where(eq(traderPairings.deviceHash, traderSecretHash(deviceCode)))
      .for("update");
    if (!row || row.expiresAt.getTime() <= Date.now() || row.consumedAt)
      return { status: "expired" };
    if (row.lastPollAt && Date.now() - row.lastPollAt.getTime() < 4_000)
      throw new TraderAccountError("slow_down", 429, "Poll at most once every five seconds.");
    await transaction
      .update(traderPairings)
      .set({ lastPollAt: new Date() })
      .where(eq(traderPairings.id, row.id));
    if (!row.ownerId) return { status: "pending" };
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"trader-owner:" + row.ownerId}))`,
    );
    const devices = await transaction
      .select({ id: traderInstallations.id })
      .from(traderInstallations)
      .where(
        and(eq(traderInstallations.ownerId, row.ownerId), isNull(traderInstallations.revokedAt)),
      );
    if (devices.length >= 5)
      throw new TraderAccountError(
        "device_limit",
        409,
        "The account already has five active installations.",
      );
    const credential = "wtc_" + randomBytes(32).toString("base64url");
    const [installation] = await transaction
      .insert(traderInstallations)
      .values({ ownerId: row.ownerId, label: row.label, tokenHash: traderSecretHash(credential) })
      .returning({ id: traderInstallations.id });
    if (!installation) throw new Error("Installation was not created");
    await transaction
      .update(traderPairings)
      .set({ consumedAt: new Date() })
      .where(eq(traderPairings.id, row.id));
    return { status: "connected", credential, installationId: installation.id };
  });
}

export async function authenticateTraderInstallation(
  database: WowTraderDatabase,
  token: string,
): Promise<TraderPrincipal | null> {
  if (!/^wtc_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await database
    .select({ installationId: traderInstallations.id, ownerId: traderInstallations.ownerId })
    .from(traderInstallations)
    .where(
      and(
        eq(traderInstallations.tokenHash, traderSecretHash(token)),
        isNull(traderInstallations.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listTraderWatches(
  database: Pick<WowTraderDatabase, "select">,
  ownerId: string,
): Promise<TraderWatch[]> {
  const rows = await database
    .select({ data: traderWatches.data })
    .from(traderWatches)
    .where(eq(traderWatches.ownerId, ownerId))
    .orderBy(desc(traderWatches.updatedAt))
    .limit(50);
  return rows.map((row) => traderWatchSchema.parse(row.data));
}

export async function updateTraderWatch(
  database: WowTraderDatabase,
  ownerId: string,
  item: TraderWatch,
  remove: boolean,
): Promise<TraderWatch[]> {
  await database.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"trader-owner:" + ownerId}))`,
    );
    const key = traderWatchKey(item);
    if (remove)
      await transaction
        .delete(traderWatches)
        .where(and(eq(traderWatches.ownerId, ownerId), eq(traderWatches.key, key)));
    else {
      const watches = await listTraderWatches(transaction, ownerId);
      if (watches.length >= 50 && !watches.some((watch) => traderWatchKey(watch) === key))
        throw new TraderAccountError(
          "watch_limit",
          409,
          "Remove a watched item before adding another. The account holds 50 watches.",
        );
      await transaction
        .insert(traderWatches)
        .values({ ownerId, key, data: item })
        .onConflictDoUpdate({
          target: [traderWatches.ownerId, traderWatches.key],
          set: { data: item, updatedAt: new Date() },
        });
    }
  });
  return listTraderWatches(database, ownerId);
}

export async function synchronizeTraderAccount(
  database: WowTraderDatabase,
  principal: TraderPrincipal,
  input: TraderSync,
): Promise<{
  tradesAccepted: number;
  watchChangesAccepted: string[];
  watches: TraderWatch[];
  generatedAt: string;
}> {
  let tradesAccepted = 0;
  const watchChangesAccepted: string[] = [];
  await database.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"trader-owner:" + principal.ownerId}))`,
    );
    for (const event of input.trades) {
      const parsed = traderTradeSchema.parse(event);
      const rows = await transaction
        .insert(traderTrades)
        .values({
          ownerId: principal.ownerId,
          eventId: parsed.eventId,
          installationId: principal.installationId,
          sourceKey: parsed.sourceKey,
          data: parsed,
        })
        .onConflictDoNothing()
        .returning({ id: traderTrades.eventId });
      tradesAccepted += rows.length;
    }
    for (const change of input.watchChanges) {
      const applied = await transaction
        .insert(traderSyncChanges)
        .values({ installationId: principal.installationId, changeId: change.changeId })
        .onConflictDoNothing()
        .returning();
      if (applied.length) {
        const key = traderWatchKey(change.item);
        if (change.action === "unwatch")
          await transaction
            .delete(traderWatches)
            .where(and(eq(traderWatches.ownerId, principal.ownerId), eq(traderWatches.key, key)));
        else {
          const watches = await listTraderWatches(transaction, principal.ownerId);
          if (watches.length >= 50 && !watches.some((watch) => traderWatchKey(watch) === key))
            throw new TraderAccountError(
              "watch_limit",
              409,
              "The synced watchlist is full. Remove an item first.",
            );
          await transaction
            .insert(traderWatches)
            .values({ ownerId: principal.ownerId, key, data: change.item })
            .onConflictDoUpdate({
              target: [traderWatches.ownerId, traderWatches.key],
              set: { data: change.item, updatedAt: new Date() },
            });
        }
      }
      watchChangesAccepted.push(change.changeId);
    }
    await transaction
      .update(traderInstallations)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(traderInstallations.id, principal.installationId),
          isNull(traderInstallations.revokedAt),
        ),
      );
  });
  return {
    tradesAccepted,
    watchChangesAccepted,
    watches: await listTraderWatches(database, principal.ownerId),
    generatedAt: new Date().toISOString(),
  };
}

export async function recordManualTraderEvent(
  database: WowTraderDatabase,
  ownerId: string,
  event: TraderTrade,
): Promise<void> {
  if (event.evidence !== "manual")
    throw new TraderAccountError(
      "invalid_evidence",
      400,
      "Browser entries must be marked as manual.",
    );
  await database
    .insert(traderTrades)
    .values({ ownerId, eventId: event.eventId, sourceKey: "manual:" + event.eventId, data: event })
    .onConflictDoNothing();
}
