import { seoRumMetricSchema } from "../../../../../lib/seo-rum";
import { storeSeoRumMetric } from "../../../../../lib/seo-rum-store";
import { HELPER_SITE_ORIGIN } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  if (process.env.SEO_RUM_ENABLED !== "true" || !process.env.SEO_RUM_ROOT) {
    return new Response(null, { status: 204, headers: responseHeaders });
  }
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  if (
    !origin ||
    (origin !== requestUrl.origin && origin !== HELPER_SITE_ORIGIN) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return Response.json({ error: "invalid_origin" }, { status: 403, headers: responseHeaders });
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    return Response.json({ error: "json_required" }, { status: 415, headers: responseHeaders });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 2_048) {
    return Response.json({ error: "report_too_large" }, { status: 413, headers: responseHeaders });
  }
  let value: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 2_048) {
      return Response.json(
        { error: "report_too_large" },
        { status: 413, headers: responseHeaders },
      );
    }
    value = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid_report" }, { status: 400, headers: responseHeaders });
  }
  const parsed = seoRumMetricSchema.safeParse(value);
  if (!parsed.success) {
    return Response.json({ error: "invalid_report" }, { status: 400, headers: responseHeaders });
  }
  try {
    await storeSeoRumMetric(parsed.data);
    return new Response(null, { status: 204, headers: responseHeaders });
  } catch {
    return Response.json(
      { error: "metrics_unavailable" },
      { status: 503, headers: responseHeaders },
    );
  }
}
