import { toolUsageEventSchema } from "../../../../lib/tool-usage-contract.mjs";
import { storeToolUsage, toolUsageConfig } from "../../../../lib/tool-usage-store";
import { HELPER_SITE_ORIGIN } from "../../../../lib/seo";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
let windowStart = 0;
let received = 0;

export async function POST(request: Request): Promise<Response> {
  const config = toolUsageConfig();
  if (!config || request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1")
    return new Response(null, { status: 204, headers });
  const url = new URL(request.url);
  const origins = [url.origin, HELPER_SITE_ORIGIN];
  if (
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"])
      origins.push(`${url.protocol}//${hostname}${url.port ? `:${url.port}` : ""}`);
  if (
    !origins.includes(request.headers.get("origin") ?? "") ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return Response.json({ error: "invalid_origin" }, { status: 403, headers });
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    return Response.json({ error: "json_required" }, { status: 415, headers });
  if (Date.now() - windowStart >= 60_000) {
    windowStart = Date.now();
    received = 0;
  }
  if (++received > 120)
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { ...headers, "Retry-After": "60" } },
    );
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "invalid_report" }, { status: 400, headers });
  let value: unknown;
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1024) {
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
  const parsed = toolUsageEventSchema.safeParse(value);
  if (!parsed.success) return Response.json({ error: "invalid_report" }, { status: 400, headers });
  if (parsed.data.build !== config.build)
    return Response.json({ error: "release_mismatch" }, { status: 409, headers });
  try {
    await storeToolUsage(parsed.data);
    return new Response(null, { status: 204, headers });
  } catch {
    return Response.json({ error: "measurement_unavailable" }, { status: 503, headers });
  }
}
