import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  SIMULATOR_SPECS,
  simulatorManifestSchema,
  type SimulatorManifest,
} from "@wow-trader/forever-data/simulator";
import {
  simulatorRaidDefaultsModule,
  simulatorRaidDefaultsVersion,
} from "./forever-simulator-raid-defaults";
import {
  simulatorMeasurementModule,
  simulatorMeasurementVersion,
} from "./forever-simulator-measurement";

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

function simulatorAssetStream(path: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  const source = createReadStream(path);
  const chunks: AsyncIterator<Uint8Array> = source[Symbol.asyncIterator]();
  let stopped = false;
  let abort: () => void;
  const stop = (): void => {
    stopped = true;
    signal.removeEventListener("abort", abort);
    source.destroy();
  };
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      abort = (): void => {
        if (stopped) return;
        stop();
        controller.error(signal.reason ?? new DOMException("Download aborted", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull(controller): Promise<void> {
      try {
        const chunk = await chunks.next();
        // A cancelled browser request can finish an outstanding disk read afterwards.
        if (stopped) return;
        if (chunk.done) {
          stop();
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error: unknown) {
        if (stopped) return;
        stop();
        controller.error(error);
      }
    },
    cancel(): void {
      stop();
    },
  });
}

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
    segments.some(
      (part) => !part || part === "." || part === ".." || !/^[a-z0-9_.-]+$/i.test(part),
    ) ||
    segments.includes("kfc-reviewed-presets.json") ||
    segments.includes("kfc-preset-safety.json") ||
    segments.includes("kfc-optimized-tank-profile.json") ||
    segments.includes("kfc-tank-browser-research.json") ||
    segments.includes("tank-measurements")
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
  let adaptedHtml: Buffer | undefined;
  const parameters = new URL(request.url).searchParams;
  const raidDefaults =
    parameters.getAll("raidDefaults").length === 1 &&
    parameters.get("raidDefaults") === simulatorRaidDefaultsVersion;
  const measurement =
    parameters.getAll("completionBridge").length === 1 &&
    parameters.get("completionBridge") === simulatorMeasurementVersion;
  if (extension === "html" && (raidDefaults || measurement)) {
    const html = await readFile(path, "utf8");
    if (createHash("sha256").update(html).digest("hex") !== expected.sha256)
      return new Response("Simulator entry failed integrity checks", { status: 503 });
    const module =
      /href="(\/forever-sim\/[a-f0-9]{24}\/bundle\/preset_utils-[a-zA-Z0-9_-]+\.chunk\.js)"/.exec(
        html,
      )?.[1];
    if (!module || !manifest.files[module.replace(`/forever-sim/${release}/`, "")])
      return new Response("Simulator presentation module unavailable", { status: 503 });
    const marker = '<script type="module"';
    if (!html.includes(marker)) return new Response("Simulator entry unavailable", { status: 503 });
    const adapters = [
      raidDefaults
        ? `<script type="module" data-kfc-raid-defaults="${simulatorRaidDefaultsVersion}">${simulatorRaidDefaultsModule(module)}</script>`
        : "",
      measurement
        ? `<script type="module" data-kfc-completion-bridge="${simulatorMeasurementVersion}">${simulatorMeasurementModule(module)}</script>`
        : "",
    ].filter(Boolean);
    adaptedHtml = Buffer.from(html.replace(marker, adapters.join("\n") + "\n" + marker));
  }
  const etag = `"${adaptedHtml ? createHash("sha256").update(adaptedHtml).digest("hex") : expected.sha256}"`;
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
  headers["content-length"] = String(adaptedHtml?.length ?? info.size);
  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(
    adaptedHtml ? new Uint8Array(adaptedHtml) : simulatorAssetStream(path, request.signal),
    {
      headers,
    },
  );
}
