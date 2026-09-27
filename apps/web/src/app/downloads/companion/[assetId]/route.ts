import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { resolveCompanionAsset } from "../../../../lib/companion-release";
import { parseByteRange } from "../../../../lib/http-byte-range";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DownloadRouteContext {
  readonly params: Promise<{ readonly assetId: string }>;
}

export async function GET(request: Request, context: DownloadRouteContext): Promise<Response> {
  return serveAsset(request, context, false);
}

export async function HEAD(request: Request, context: DownloadRouteContext): Promise<Response> {
  return serveAsset(request, context, true);
}

async function serveAsset(
  request: Request,
  context: DownloadRouteContext,
  headOnly: boolean,
): Promise<Response> {
  const { assetId } = await context.params;
  const resolved = await resolveCompanionAsset(assetId);
  if (!resolved) return new Response("Download not found", { status: 404 });

  let fileSize: number;
  try {
    const file = await stat(resolved.absolutePath);
    if (!file.isFile() || file.size !== resolved.asset.byteSize) {
      return new Response("Download is temporarily unavailable", { status: 503 });
    }
    fileSize = file.size;
  } catch {
    return new Response("Download is temporarily unavailable", { status: 503 });
  }

  const range = parseByteRange(request.headers.get("range"), fileSize);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${fileSize}` },
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? fileSize - 1;
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "content-disposition": `attachment; filename="${resolved.asset.filename}"`,
    "content-length": String(end - start + 1),
    "content-type": resolved.asset.contentType,
    etag: `"sha256-${resolved.asset.sha256}"`,
    "x-content-type-options": "nosniff",
  });
  if (range) headers.set("content-range", `bytes ${start}-${end}/${fileSize}`);
  if (headOnly) return new Response(null, { status: range ? 206 : 200, headers });

  const nodeStream = createReadStream(resolved.absolutePath, { start, end });
  const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return new Response(body, { status: range ? 206 : 200, headers });
}
