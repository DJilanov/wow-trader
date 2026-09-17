import { readFile } from "node:fs/promises";

import { resolveItemIconPath } from "../../../../lib/item-icons";

export const dynamic = "force-dynamic";

interface ItemIconRouteContext {
  readonly params: Promise<{ readonly fileDataId: string }>;
}

export async function GET(_request: Request, context: ItemIconRouteContext): Promise<Response> {
  const mediaRoot = process.env.WOW_TRADER_MEDIA_ROOT;
  const { fileDataId } = await context.params;
  const filePath = mediaRoot ? resolveItemIconPath(mediaRoot, fileDataId) : null;
  if (!filePath) return new Response(null, { status: 404 });

  try {
    const image = await readFile(filePath);
    return new Response(new Uint8Array(image), {
      headers: {
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        "content-type": "image/png",
      },
    });
  } catch (error: unknown) {
    if (isMissingFileError(error)) return new Response(null, { status: 404 });
    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
