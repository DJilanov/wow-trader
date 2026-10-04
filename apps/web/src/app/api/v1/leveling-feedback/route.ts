import { levelingFeedbackSchema } from "../../../../lib/leveling-feedback";
import {
  feedbackClientHash,
  storeLevelingFeedback,
  validateFeedbackPosition,
} from "../../../../lib/leveling-feedback-store";
import { HELPER_SITE_URL } from "../../../../lib/seo";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const allowedOrigins = [requestUrl.origin, HELPER_SITE_URL];
  // Next dev canonicalizes loopback Request URLs to localhost, even when browsed via 127.0.0.1.
  if (
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(requestUrl.hostname)
  ) {
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"])
      allowedOrigins.push(
        `${requestUrl.protocol}//${hostname}${requestUrl.port ? `:${requestUrl.port}` : ""}`,
      );
  }
  if (
    !origin ||
    !allowedOrigins.includes(origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return Response.json({ error: "invalid_origin" }, { status: 403, headers });
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    return Response.json({ error: "json_required" }, { status: 415, headers });
  let value: unknown;
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "invalid_report" }, { status: 400, headers });
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        return Response.json({ error: "report_too_large" }, { status: 413, headers });
      }
      chunks.push(chunk.value);
    }
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return Response.json({ error: "invalid_report" }, { status: 400, headers });
  } finally {
    reader.releaseLock();
  }
  const parsed = levelingFeedbackSchema.safeParse(value);
  if (!parsed.success) return Response.json({ error: "invalid_report" }, { status: 400, headers });
  try {
    if (!(await validateFeedbackPosition(parsed.data)))
      return Response.json({ error: "unknown_step_or_release" }, { status: 422, headers });
    const result = await storeLevelingFeedback(parsed.data, feedbackClientHash(request));
    if (result.kind === "limited")
      return Response.json(
        { error: "rate_limited" },
        { status: 429, headers: { ...headers, "Retry-After": "1800" } },
      );
    if (result.kind === "conflict")
      return Response.json({ error: "submission_conflict" }, { status: 409, headers });
    return Response.json(
      { reportId: result.id, status: "received" },
      { status: result.kind === "created" ? 201 : 200, headers },
    );
  } catch {
    return Response.json({ error: "feedback_unavailable" }, { status: 503, headers });
  }
}
