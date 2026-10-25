import { restedXpExportRequestSchema } from "../../../../lib/leveling-restedxp-contract";
import {
  buildCampaignReviewExport,
  campaignReviewAddonZip,
  restedXpReviewExportAvailable,
} from "../../../../lib/leveling-restedxp-export";
import { guideSameOrigin, readGuideAccessSettings } from "../../../../lib/guide-access-config";
import { getGuideDownloadAccess } from "../../../../lib/guide-access-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
let busy = false;

function failure(error: string, status: number): Response {
  return Response.json({ error }, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
  const review = restedXpReviewExportAvailable() && loopbackHosts.includes(url.hostname);
  const settings = readGuideAccessSettings();
  if (!review && !settings.downloadsEnabled && !settings.previewIds?.length)
    return failure("export_disabled", 404);
  const origins = loopbackHosts.map(
    (host) => `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`,
  );
  if (
    !(review
      ? origins.includes(request.headers.get("origin") ?? "")
      : guideSameOrigin(request, settings)) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return failure("invalid_origin", 403);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    return failure("json_required", 415);
  const reader = request.body?.getReader();
  if (!reader) return failure("invalid_export", 400);
  let body: unknown;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 100_000) {
        await reader.cancel();
        return failure("export_too_large", 413);
      }
      chunks.push(chunk.value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return failure("invalid_export", 400);
  } finally {
    reader.releaseLock();
  }
  const input = restedXpExportRequestSchema.safeParse(body);
  if (!input.success) return failure("invalid_export", 400);
  if (!review) {
    const access = await getGuideDownloadAccess();
    if (access.state === "signed_out") return failure("sign_in_required", 401);
    if (access.state === "unavailable") return failure("access_unavailable", 503);
    if (!["certified", "supporter"].includes(access.state))
      return failure("guide_access_required", 403);
    if (!access.downloadsEnabled) return failure("export_disabled", 404);
  }
  if (busy)
    return Response.json(
      { error: "export_busy" },
      { status: 429, headers: { ...headers, "Retry-After": "1" } },
    );
  busy = true;
  try {
    const result = await buildCampaignReviewExport(input.data);
    if ("error" in result)
      return failure(result.error, result.error === "export_unavailable" ? 503 : 409);
    if (input.data.format === "documents") return Response.json(result.documents, { headers });
    const bytes = campaignReviewAddonZip(result);
    return new Response(new Uint8Array(bytes).buffer, {
      headers: {
        ...headers,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="kfc-forever-${input.data.race}-${input.data.classSlug}-${result.identity.slice(0, 16)}.zip"`,
      },
    });
  } catch {
    return failure("export_unavailable", 503);
  } finally {
    busy = false;
  }
}
