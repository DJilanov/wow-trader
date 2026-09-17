import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

interface ForeverAssetRouteContext {
  readonly params: Promise<{ readonly kind: string; readonly key: string }>;
}

export async function GET(_request: Request, context: ForeverAssetRouteContext): Promise<Response> {
  const root = process.env.FOREVER_ASSET_ROOT;
  if (!root) return new Response(null, { status: 404 });
  const { kind, key } = await context.params;
  if (!isValidAssetKey(kind, key)) return new Response(null, { status: 404 });
  const directory = kind === "icon" ? "icons" : "backgrounds";

  try {
    const image = await readFile(join(root, directory, `${key}.jpg`));
    return new Response(new Uint8Array(image), {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "image/jpeg",
      },
    });
  } catch (error: unknown) {
    if (isMissingFileError(error)) return new Response(null, { status: 404 });
    throw error;
  }
}

function isValidAssetKey(kind: string, key: string): boolean {
  if (kind === "icon") return /^[a-z0-9_]+$/i.test(key);
  if (kind === "background") return /^\d+$/.test(key);
  return false;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
