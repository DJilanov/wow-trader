import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

export const dynamic = "force-dynamic";

interface ForeverMapMediaRouteContext {
  readonly params: Promise<{ readonly fileDataId: string }>;
}

export async function GET(
  _request: Request,
  context: ForeverMapMediaRouteContext,
): Promise<Response> {
  const { fileDataId } = await context.params;
  if (!/^\d{1,10}$/.test(fileDataId) || Number(fileDataId) <= 0) {
    return new Response(null, { status: 404 });
  }
  const root = resolveWorldSnapshotRoot();
  if (!root) return new Response(null, { status: 404 });
  try {
    const image = await readFile(join(root, "media", "map-art", `${fileDataId}.png`));
    return new Response(new Uint8Array(image), {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "image/png",
      },
    });
  } catch (error: unknown) {
    if (isMissingFileError(error)) return new Response(null, { status: 404 });
    throw error;
  }
}

function resolveWorldSnapshotRoot(): string | null {
  const configuredRoot = process.env.WOW_TRADER_WORLD_MEDIA_ROOT;
  if (configuredRoot) return requireAbsolutePath(configuredRoot, "WOW_TRADER_WORLD_MEDIA_ROOT");
  const manifestPath = process.env.WOW_TRADER_WORLD_SNAPSHOT;
  return manifestPath
    ? dirname(requireAbsolutePath(manifestPath, "WOW_TRADER_WORLD_SNAPSHOT"))
    : null;
}

function requireAbsolutePath(value: string, environmentName: string): string {
  if (!isAbsolute(value)) throw new Error(`${environmentName} must be an absolute path`);
  return value;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
