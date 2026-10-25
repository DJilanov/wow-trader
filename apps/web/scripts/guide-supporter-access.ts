import { parseArgs } from "node:util";
import process from "node:process";
import { createDatabase, guideSupportOrders } from "@wow-trader/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  guideRevolutSettings,
  isSettledGuidePayment,
  requestGuideRevolutOrder,
} from "../src/lib/guide-revolut";

const { values } = parseArgs({
  options: {
    mode: { type: "string" },
    order: { type: "string" },
    actor: { type: "string" },
    reason: { type: "string" },
  },
});
const mode = z.enum(["list", "approve", "revoke"]).parse(values.mode);
if (!process.env.DATABASE_URL) throw new Error("Use the protected staff database environment");
const database = createDatabase(process.env.DATABASE_URL);
try {
  if (mode === "list") {
    const rows = await database.db
      .select({
        id: guideSupportOrders.id,
        discordId: guideSupportOrders.discordId,
        state: guideSupportOrders.state,
        environment: guideSupportOrders.environment,
        createdAt: guideSupportOrders.createdAt,
        approvedAt: guideSupportOrders.approvedAt,
      })
      .from(guideSupportOrders)
      .orderBy(desc(guideSupportOrders.createdAt))
      .limit(50);
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  } else {
    const orderId = z.uuid().parse(values.order);
    const actor = z
      .string()
      .regex(/^\d{17,20}$/)
      .parse(values.actor);
    const reason = z.string().trim().min(10).max(300).parse(values.reason);
    const [order] = await database.db
      .select()
      .from(guideSupportOrders)
      .where(eq(guideSupportOrders.id, orderId))
      .limit(1);
    if (!order) throw new Error("Unknown guide support order");
    if (mode === "approve") {
      const provider = guideRevolutSettings();
      if (!provider || provider.environment !== order.environment || !order.providerOrderId)
        throw new Error("Payment environment/order mismatch");
      const remote = await requestGuideRevolutOrder(provider, {
        providerId: order.providerOrderId,
      });
      if (!isSettledGuidePayment(remote, order.id, order.providerOrderId))
        throw new Error("Payment is not fully settled for this exact USD 9.99 order");
      if (order.state === "approved") {
        process.stdout.write("Guide support order already approved; original audit preserved\n");
      } else {
        const rows = await database.db
          .update(guideSupportOrders)
          .set({
            state: "approved",
            approvedAt: new Date(),
            approvedBy: actor,
            approvalReason: reason,
            checkedAt: new Date(),
          })
          .where(
            and(
              eq(guideSupportOrders.id, orderId),
              eq(guideSupportOrders.state, "pending"),
              isNull(guideSupportOrders.revokedAt),
            ),
          )
          .returning({ id: guideSupportOrders.id });
        if (rows.length !== 1) throw new Error("Order is not pending or changed during approval");
        process.stdout.write(`Approved guide supporter order ${orderId}\n`);
      }
    } else {
      if (order.state === "revoked")
        process.stdout.write("Guide support order already revoked; original audit preserved\n");
      else {
        const rows = await database.db
          .update(guideSupportOrders)
          .set({
            state: "revoked",
            revokedAt: new Date(),
            revokedBy: actor,
            revocationReason: reason,
          })
          .where(and(eq(guideSupportOrders.id, orderId), isNull(guideSupportOrders.revokedAt)))
          .returning({ id: guideSupportOrders.id });
        if (rows.length !== 1) throw new Error("Order changed during revocation");
        process.stdout.write(`Revoked guide supporter order ${orderId}\n`);
      }
    }
  }
} finally {
  await database.close();
}
