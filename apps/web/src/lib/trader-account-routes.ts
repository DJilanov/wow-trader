import { createHmac } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  approveTraderPairing,
  authenticateTraderInstallation,
  consumeTraderRate,
  listTraderWatches,
  pollTraderPairing,
  recordManualTraderEvent,
  startTraderPairing,
  synchronizeTraderAccount,
  TraderAccountError,
  traderInstallations,
  traderPairingPreview,
  updateTraderWatch,
} from "@wow-trader/db";
import {
  pairingPollSchema,
  pairingStartSchema,
  traderSyncResponseSchema,
  traderSyncSchema,
  traderTradeSchema,
  traderWatchSchema,
} from "@wow-trader/contracts";
import { getDatabase } from "./database";
import { guideDiscordId } from "./guide-auth";
import { guideSameOrigin, readGuideAccessSettings } from "./guide-access-config";
import { loadTraderAccount } from "./trader-account-data";

const headers = { "Cache-Control": "no-store", Vary: "Cookie, Authorization" };
const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/),
});
async function body(request: Request, limit = 512_000): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new TraderAccountError("json_required", 415, "JSON is required.");
  const reader = request.body?.getReader();
  if (!reader) throw new TraderAccountError("invalid_body", 400, "A request body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new TraderAccountError("body_too_large", 413, "This request is too large.");
      }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof TraderAccountError) throw error;
    throw new TraderAccountError("invalid_json", 400, "The request is not valid JSON.");
  } finally {
    reader.releaseLock();
  }
}

export async function handleTraderAccountRequest(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname.replace(/^\/tools\//, "/");
  const action = pathname.startsWith("/api/trader/") ? pathname.slice("/api/trader/".length) : "";
  const reply = (value: unknown, status = 200): Response =>
    Response.json(value, { status, headers });
  try {
    const database = getDatabase(),
      settings = readGuideAccessSettings();
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer (wtc_[A-Za-z0-9_-]{43})$/)?.[1];
    const principal = bearer ? await authenticateTraderInstallation(database, bearer) : null;
    if (request.headers.has("authorization") && !principal)
      throw new TraderAccountError(
        "invalid_installation",
        401,
        "Reconnect this installation in Companion.",
      );
    const pairingAction = action === "pairing/start" || action === "pairing/poll";
    if (
      request.method !== "GET" &&
      !principal &&
      !pairingAction &&
      !guideSameOrigin(request, settings)
    )
      throw new TraderAccountError(
        "invalid_origin",
        403,
        "Use the account page on the same website.",
      );
    if (pairingAction) {
      if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
      if (!settings.ready)
        throw new TraderAccountError(
          "pairing_unavailable",
          503,
          "Account sign-in is temporarily unavailable.",
        );
      const address = request.headers.get("x-real-ip")?.slice(0, 128) || "local";
      const hash = createHmac("sha256", settings.sessionSecret)
        .update(`trader:${action}:${address}`)
        .digest("hex");
      await consumeTraderRate(database, "public-pairing-global", 600);
      await consumeTraderRate(database, hash, action.endsWith("start") ? 8 : 24);
      const value = await body(request, 1_024);
      if (action.endsWith("start"))
        return reply(
          await startTraderPairing(
            database,
            pairingStartSchema.parse(value).label,
            settings.origin,
          ),
          201,
        );
      return reply(await pollTraderPairing(database, pairingPollSchema.parse(value).deviceCode));
    }
    if (action === "sync") {
      if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
      if (!principal)
        throw new TraderAccountError(
          "account_pairing_required",
          401,
          "Connect Companion to your account to synchronize private data.",
        );
      await consumeTraderRate(database, "sync:" + principal.installationId, 30);
      return reply(
        traderSyncResponseSchema.parse(
          await synchronizeTraderAccount(
            database,
            principal,
            traderSyncSchema.parse(await body(request)),
          ),
        ),
      );
    }
    const ownerId = await guideDiscordId();
    if (!ownerId)
      throw new TraderAccountError(
        "sign_in_required",
        401,
        "Sign in with Discord to access your private Trader account.",
      );
    await consumeTraderRate(database, "owner:" + ownerId, 120);
    if (action === "account" && request.method === "GET")
      return reply(await loadTraderAccount(ownerId));
    if (action === "pairing/preview" && request.method === "GET") {
      const { code } = codeSchema.parse({ code: new URL(request.url).searchParams.get("code") });
      const preview = await traderPairingPreview(database, code);
      return reply(preview ? { code, ...preview } : { error: "code_expired" }, preview ? 200 : 404);
    }
    if (action === "pairing/approve" && request.method === "POST") {
      const { code } = codeSchema.parse(await body(request, 1_024));
      await approveTraderPairing(database, ownerId, code);
      return reply({ status: "approved" });
    }
    if (action === "devices/revoke" && request.method === "POST") {
      const { id } = z.object({ id: z.string().uuid() }).parse(await body(request, 1_024));
      const rows = await database
        .update(traderInstallations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(traderInstallations.id, id),
            eq(traderInstallations.ownerId, ownerId),
            isNull(traderInstallations.revokedAt),
          ),
        )
        .returning({ id: traderInstallations.id });
      return reply(
        rows.length ? { status: "revoked" } : { error: "device_not_found" },
        rows.length ? 200 : 404,
      );
    }
    if (action === "watches") {
      if (request.method === "GET")
        return reply({ items: await listTraderWatches(database, ownerId) });
      if (["POST", "DELETE"].includes(request.method)) {
        const item = traderWatchSchema.parse(await body(request, 4_096));
        return reply({
          items: await updateTraderWatch(database, ownerId, item, request.method === "DELETE"),
        });
      }
      return reply({ error: "method_not_allowed" }, 405);
    }
    if (action === "ledger" && request.method === "POST") {
      const event = traderTradeSchema.parse(await body(request, 8_192));
      await recordManualTraderEvent(database, ownerId, event);
      return reply({ status: "recorded" }, 201);
    }
    return reply({ error: "not_found" }, 404);
  } catch (error: unknown) {
    if (error instanceof TraderAccountError)
      return Response.json(
        { error: error.code, message: error.message },
        {
          status: error.status,
          headers: { ...headers, ...(error.status === 429 ? { "Retry-After": "5" } : {}) },
        },
      );
    if (error instanceof z.ZodError)
      return reply(
        { error: "invalid_request", message: "Check the provided fields and try again." },
        400,
      );
    console.error(
      "Trader account request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return reply(
      {
        error: "trader_unavailable",
        message: "Trader account data is temporarily unavailable. Please retry.",
      },
      503,
    );
  }
}
