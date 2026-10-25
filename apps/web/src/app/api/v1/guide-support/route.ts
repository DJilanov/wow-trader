import { guideDiscordId } from "../../../../lib/guide-auth";
import { readGuideAccessSettings, guideSameOrigin } from "../../../../lib/guide-access-config";
import { getGuideDownloadAccess } from "../../../../lib/guide-access-service";
import { createGuideCheckout } from "../../../../lib/guide-support";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
export async function POST(request: Request): Promise<Response> {
  const settings = readGuideAccessSettings();
  if (!guideSameOrigin(request, settings))
    return Response.json({ error: "invalid_origin" }, { status: 403, headers });
  if (!settings.paymentsEnabled)
    return Response.json({ error: "payments_unavailable" }, { status: 503, headers });
  try {
    const id = await guideDiscordId();
    if (!id) return Response.json({ error: "sign_in_required" }, { status: 401, headers });
    const access = await getGuideDownloadAccess();
    if (access.state === "certified" || access.state === "supporter")
      return Response.json({ error: "already_has_access" }, { status: 409, headers });
    if (access.state === "unavailable" || ["paid", "revoked"].includes(access.payment))
      return Response.json(
        { error: access.payment === "paid" ? "approval_pending" : "payment_check_required" },
        { status: 409, headers },
      );
    return Response.json(
      { checkoutUrl: await createGuideCheckout(id, settings.origin) },
      { status: 201, headers },
    );
  } catch (error: unknown) {
    const code =
      error instanceof Error &&
      ["guide_checkout_limited", "approval_pending"].includes(error.message)
        ? error.message
        : "payments_unavailable";
    return Response.json(
      { error: code === "guide_checkout_limited" ? "rate_limited" : code },
      {
        status: code === "guide_checkout_limited" ? 429 : code === "approval_pending" ? 409 : 503,
        headers,
      },
    );
  }
}
