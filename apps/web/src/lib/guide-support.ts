import { and, desc, eq, gt, sql } from "drizzle-orm";
import { guideSupportOrders } from "@wow-trader/db";
import { z } from "zod";
import { getDatabase } from "./database";
import {
  guideCheckoutUrl,
  guideRevolutSettings,
  isSettledGuidePayment,
  requestGuideRevolutOrder,
} from "./guide-revolut";

export type GuidePaymentStatus =
  "none" | "pending" | "paid" | "approved" | "failed" | "revoked" | "unavailable";

export async function guideSupportStatus(discordId: string): Promise<GuidePaymentStatus> {
  const provider = guideRevolutSettings();
  if (!provider) return "none";
  const [order] = await getDatabase()
    .select()
    .from(guideSupportOrders)
    .where(
      and(
        eq(guideSupportOrders.discordId, discordId),
        eq(guideSupportOrders.environment, provider.environment),
      ),
    )
    .orderBy(desc(guideSupportOrders.createdAt))
    .limit(1);
  if (!order) return "none";
  if (order.state === "revoked" || order.revokedAt) return "revoked";
  if (!order.providerOrderId) return order.state === "failed" ? "failed" : "pending";
  const remote = await requestGuideRevolutOrder(provider, { providerId: order.providerOrderId });
  if (
    remote.id !== order.providerOrderId ||
    remote.amount !== order.amount ||
    remote.currency !== order.currency ||
    remote.merchant_order_data.reference !== `kfc-guide:${order.id}`
  )
    throw new Error("Guide payment identity mismatch");
  if (isSettledGuidePayment(remote, order.id, order.providerOrderId)) {
    return order.state === "approved" && order.approvedAt && order.approvedBy ? "approved" : "paid";
  }
  if (order.state === "approved" || order.state === "paid") return "revoked";
  return ["pending", "processing", "authorised"].includes(remote.state) ? "pending" : "failed";
}

export async function createGuideCheckout(discordId: string, origin: string): Promise<string> {
  const provider = guideRevolutSettings();
  if (!provider) throw new Error("Guide payments are not configured");
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"guide-support:" + discordId}))`,
    );
    const [latest] = await transaction
      .select()
      .from(guideSupportOrders)
      .where(
        and(
          eq(guideSupportOrders.discordId, discordId),
          eq(guideSupportOrders.environment, provider.environment),
        ),
      )
      .orderBy(desc(guideSupportOrders.createdAt))
      .limit(1);
    if (latest?.state === "pending" && latest.checkoutUrl && latest.providerOrderId) {
      const remote = await requestGuideRevolutOrder(provider, {
        providerId: latest.providerOrderId,
      });
      if (
        remote.id !== latest.providerOrderId ||
        remote.amount !== latest.amount ||
        remote.currency !== latest.currency ||
        remote.merchant_order_data.reference !== `kfc-guide:${latest.id}`
      )
        throw new Error("Guide payment identity mismatch");
      if (isSettledGuidePayment(remote, latest.id, latest.providerOrderId))
        throw new Error("approval_pending");
      if (["pending", "processing", "authorised"].includes(remote.state)) {
        const url = guideCheckoutUrl(latest.checkoutUrl, provider.environment);
        if (!url) throw new Error("Invalid stored guide checkout URL");
        return url;
      }
    }
    const recent = await transaction
      .select()
      .from(guideSupportOrders)
      .where(
        and(
          eq(guideSupportOrders.discordId, discordId),
          eq(guideSupportOrders.environment, provider.environment),
          gt(guideSupportOrders.createdAt, new Date(Date.now() - 30 * 60_000)),
        ),
      )
      .orderBy(desc(guideSupportOrders.createdAt))
      .limit(5);
    if (recent.length >= 3) throw new Error("guide_checkout_limited");
    // Insert only checkout-owned columns so the web role cannot write staff approval fields.
    const created = await transaction.execute(
      sql`INSERT INTO guide_support_order (discord_id, environment) VALUES (${discordId}, ${provider.environment}) RETURNING id`,
    );
    const local = z.object({ id: z.uuid() }).parse(created[0]);
    const remote = await requestGuideRevolutOrder(provider, {
      id: local.id,
      redirectUrl: `${origin}/tools/forever/leveling/access`,
    });
    if (
      remote.amount !== 999 ||
      remote.currency !== "USD" ||
      remote.merchant_order_data.reference !== `kfc-guide:${local.id}`
    )
      throw new Error("Guide payment identity mismatch");
    const checkoutUrl =
      remote.checkout_url && guideCheckoutUrl(remote.checkout_url, provider.environment);
    if (!checkoutUrl) throw new Error("Invalid guide checkout URL");
    await transaction
      .update(guideSupportOrders)
      .set({ providerOrderId: remote.id, checkoutUrl, state: "pending" })
      .where(eq(guideSupportOrders.id, local.id));
    return checkoutUrl;
  });
}
