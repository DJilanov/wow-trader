import { readFile, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

interface ForeverAssetRouteContext {
  readonly params: Promise<{ readonly kind: string; readonly key: string }>;
}

export async function GET(request: Request, context: ForeverAssetRouteContext): Promise<Response> {
  const { kind, key } = await context.params;
  if (!isValidAssetKey(kind, key)) return new Response(null, { status: 404 });
  const legacyRoot = process.env.FOREVER_ASSET_ROOT;
  const releases = process.env.FOREVER_ASSET_RELEASES_ROOT;
  const version = new URL(request.url).searchParams.get("v");
  let root = legacyRoot;
  if (releases && version && /^(?:[a-f0-9]{12}|[a-f0-9]{64})$/.test(version)) {
    try {
      const entries = (await readdir(releases)).filter(
        (name) => /^[a-f0-9]{64}$/.test(name) && name.startsWith(version),
      );
      if (entries.length > 1) return new Response(null, { status: 409 });
      if (entries.length === 1) root = join(releases, entries[0]!);
    } catch (error: unknown) {
      if (!isMissingFileError(error)) throw error;
    }
  }
  if (!root) return new Response(null, { status: 404 });
  const directory = kind === "icon" ? "icons" : "backgrounds";

  try {
    const assetRoot = await realpath(root);
    if (releases && root !== legacyRoot && !assetRoot.startsWith((await realpath(releases)) + "/"))
      return new Response(null, { status: 404 });
    const path = await realpath(join(assetRoot, directory, `${key}.jpg`));
    if (!path.startsWith(assetRoot + "/")) return new Response(null, { status: 404 });
    const image = await readFile(path);
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
  if (key.length > 160) return false;
  if (kind === "icon") return /^[a-z0-9_]+$/i.test(key);
  if (kind === "background") return /^\d+$/.test(key);
  return false;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
