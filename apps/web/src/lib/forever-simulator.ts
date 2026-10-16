import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import {
  SIMULATOR_SPECS,
  simulatorManifestSchema,
  type SimulatorManifest,
} from "@wow-trader/forever-data/simulator";

const types: Readonly<Record<string, string>> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  wasm: "application/wasm",
  woff: "font/woff",
  woff2: "font/woff2",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  bin: "application/octet-stream",
};

export function simulatorDirectory(): string {
  // Runtime-managed releases are deployed separately from the Next standalone bundle.
  return resolve(
    /* turbopackIgnore: true */ process.env.FOREVER_SIMULATOR_ROOT ||
      "../../artifacts/forever-simulator",
  );
}

export async function readSimulatorManifest(
  directory = simulatorDirectory(),
  release?: string,
): Promise<SimulatorManifest | null> {
  if (release && !/^[a-f0-9]{24}$/.test(release)) return null;
  try {
    const path = release
      ? join(directory, release, "manifest.json")
      : join(directory, "active.json");
    if ((await stat(path)).size > 8_000_000) throw new Error("Simulator manifest too large");
    const manifest = simulatorManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (release && manifest.release !== release) throw new Error("Simulator release mismatch");
    if (SIMULATOR_SPECS.some((spec) => !manifest.pages.includes(spec.page)))
      throw new Error("Missing supported simulator page");
    return manifest;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function serveSimulatorAsset(
  request: Request,
  release: string,
  segments: readonly string[],
  directory = simulatorDirectory(),
): Promise<Response> {
  if (
    !/^[a-f0-9]{24}$/.test(release) ||
    segments.some((part) => !part || part === "." || part === ".." || !/^[a-z0-9_.-]+$/i.test(part))
  )
    return new Response(null, { status: 404 });
  const manifest = await readSimulatorManifest(directory, release);
  if (!manifest) return new Response(null, { status: 404 });
  const relative = segments.join("/");
  const name = manifest.files[relative] ? relative : `${relative ? relative + "/" : ""}index.html`;
  const expected = manifest.files[name];
  const extension = name.split(".").at(-1) ?? "";
  if (!expected || !types[extension]) return new Response(null, { status: 404 });
  let root: string;
  let path: string;
  try {
    const storage = await realpath(directory);
    root = await realpath(join(storage, release));
    if (!root.startsWith(storage + "/")) return new Response(null, { status: 404 });
    path = await realpath(join(root, name));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return new Response("Simulator asset unavailable", {
        status: 503,
        headers: { "retry-after": "60" },
      });
    throw error;
  }
  if (!path.startsWith(root + "/")) return new Response(null, { status: 404 });
  const info = await stat(path);
  if (!info.isFile() || info.size !== expected.bytes)
    return new Response("Simulator asset failed integrity checks", { status: 503 });
  const etag = `"${expected.sha256}"`;
  const headers: Record<string, string> = {
    "content-type": types[extension]!,
    "cache-control": "public, max-age=31536000, immutable",
    etag: etag,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex, nofollow",
  };
  if (extension === "html") {
    headers["content-security-policy"] =
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://wow.zamimg.com; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'none'";
  }
  if (
    request.headers
      .get("if-none-match")
      ?.split(",")
      .map((value) => value.trim())
      .includes(etag)
  )
    return new Response(null, { status: 304, headers });
  headers["content-length"] = String(info.size);
  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>, {
    headers,
  });
}
