import { createHash } from "node:crypto";
import console from "node:console";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { Readable } from "node:stream";
import {
  shamanHealerReleaseSchema,
  shamanHealerPresentationSchema,
  type ShamanHealerRelease,
  type ShamanHealerPresentation,
} from "@wow-trader/forever-data/shaman-healer-release";
import {
  shamanHealerLibraryIndexSchema,
  parseShamanHealerGroupPayload,
  parseShamanHealerCatalogPayload,
  type ShamanHealerGroupPayload,
  type ShamanHealerLibraryIndex,
} from "@wow-trader/forever-data/shaman-healer-library";
import { simulatorDirectory } from "./forever-simulator";
import { selectHealerEncoding } from "./healer-simulator";

interface AssetIdentity {
  readonly bytes: number;
  readonly sha256: string;
}
const verifiedFiles = new Map<string, Promise<void>>();
const releasePattern = /^[a-f0-9]{24}$/;
const filenamePattern = /^[a-z0-9][a-z0-9_.-]*$/;
let reportedAvailabilityError: string | undefined;

export function shamanHealerDirectory(): string {
  return join(simulatorDirectory(), "healing", "healing-shaman");
}

async function readManifest(path: string): Promise<ShamanHealerRelease> {
  if ((await realpath(path)) !== path) throw new Error("Shaman manifest escaped its release");
  const entry = await stat(path);
  if (!entry.isFile() || entry.size > 2_000_000)
    throw new Error("Shaman manifest exceeds its size limit");
  return shamanHealerReleaseSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function readShamanHealerRelease(
  directory = shamanHealerDirectory(),
  release?: string,
): Promise<ShamanHealerRelease | null> {
  if (release && !releasePattern.test(release)) return null;
  try {
    const base = await realpath(directory);
    const selectedPath = release ? join(base, release, "manifest.json") : join(base, "active.json");
    const manifest = await readManifest(selectedPath);
    if (release && manifest.release !== release)
      throw new Error("Shaman release identity mismatch");
    const root = join(base, manifest.release);
    if ((await realpath(root)) !== root) throw new Error("Shaman release contains a symlink");
    const sealed = await readManifest(join(root, "manifest.json"));
    if (JSON.stringify(manifest) !== JSON.stringify(sealed))
      throw new Error("Shaman active pointer differs from its immutable release");
    return manifest;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function checkedAsset(
  directory: string,
  release: string,
  name: string,
  expected: AssetIdentity,
): Promise<string> {
  if (!releasePattern.test(release) || !filenamePattern.test(name) || name.includes(".."))
    throw new Error("Invalid Shaman asset path");
  const base = await realpath(directory),
    root = join(base, release);
  if ((await realpath(root)) !== root) throw new Error("Shaman release contains a symlink");
  const path = join(root, name),
    canonical = await realpath(path);
  if (canonical !== path || !canonical.startsWith(root + sep))
    throw new Error("Shaman asset escaped its release");
  const entry = await stat(path);
  if (!entry.isFile() || entry.size !== expected.bytes || entry.size > 128 * 1024 ** 2)
    throw new Error("Shaman asset size mismatch");
  const key = [path, expected.sha256, entry.size, entry.mtimeMs, entry.ctimeMs].join(":");
  let check = verifiedFiles.get(key);
  if (!check) {
    check = readFile(path).then((bytes: Buffer): void => {
      if (createHash("sha256").update(bytes).digest("hex") !== expected.sha256)
        throw new Error("Shaman asset checksum mismatch");
    });
    verifiedFiles.set(key, check);
    void check.catch((): void => {
      verifiedFiles.delete(key);
    });
    if (verifiedFiles.size > 256) verifiedFiles.delete(verifiedFiles.keys().next().value!);
  }
  await check;
  return path;
}

async function readJsonAsset(
  manifest: ShamanHealerRelease,
  name: string,
  directory: string,
): Promise<unknown> {
  const identity = manifest.files[name];
  if (!identity || identity.bytes > 8_000_000)
    throw new Error("Shaman JSON asset exceeds its size limit");
  const path = await checkedAsset(directory, manifest.release, name, identity);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function readShamanHealerIndex(
  manifest: ShamanHealerRelease,
  directory = shamanHealerDirectory(),
): Promise<ShamanHealerLibraryIndex> {
  const index = shamanHealerLibraryIndexSchema.parse(
    await readJsonAsset(manifest, "library-index.json", directory),
  );
  if (
    index.modelIdentity !== manifest.modelIdentity ||
    index.runtimeIdentity !== manifest.runtimeIdentity
  )
    throw new Error("Shaman index model mismatch");
  for (const ref of [index.catalog, ...index.groups.map((entry) => entry.asset)]) {
    const identity = manifest.files[ref.file];
    if (!identity || identity.bytes !== ref.bytes || identity.sha256 !== ref.byteSha256)
      throw new Error("Shaman index asset differs from its release");
  }
  return index;
}

export async function readShamanHealerPresentation(
  manifest: ShamanHealerRelease,
  index: ShamanHealerLibraryIndex,
  directory = shamanHealerDirectory(),
): Promise<ShamanHealerPresentation> {
  const presentation = shamanHealerPresentationSchema.parse(
    await readJsonAsset(manifest, "presentation.json", directory),
  );
  if (
    presentation.modelIdentity !== manifest.modelIdentity ||
    presentation.runtimeIdentity !== index.runtimeIdentity ||
    presentation.libraryIndexSha256 !== manifest.libraryIndexSha256
  )
    throw new Error("Shaman presentation model mismatch");
  const catalog = parseShamanHealerCatalogPayload(
    index,
    await readJsonAsset(manifest, index.catalog.file, directory),
  );
  const profiles = new Set(presentation.profiles.map((entry) => entry.id));
  const ids = new Set(
    catalog.catalog
      .filter((entry) => entry.availableProfileIds.some((id) => profiles.has(id)))
      .map((entry) => entry.item.id),
  );
  if (
    presentation.items.length !== ids.size ||
    presentation.items.some((item) => !ids.has(item.id))
  )
    throw new Error("Shaman presentation catalog is incomplete");
  return presentation;
}

export async function readShamanHealerGroup(
  manifest: ShamanHealerRelease,
  index: ShamanHealerLibraryIndex,
  groupId: string,
  directory = shamanHealerDirectory(),
): Promise<ShamanHealerGroupPayload> {
  const descriptor = index.groups.find((entry) => entry.group.id === groupId);
  if (!descriptor) throw new Error("Unknown Shaman build group");
  return parseShamanHealerGroupPayload(
    index,
    await readJsonAsset(manifest, descriptor.asset.file, directory),
  );
}

export async function isShamanHealerAvailable(
  directory = shamanHealerDirectory(),
): Promise<boolean> {
  try {
    const manifest = await readShamanHealerRelease(directory);
    if (!manifest) return false;
    const index = await readShamanHealerIndex(manifest, directory);
    await readShamanHealerPresentation(manifest, index, directory);
    await Promise.all(
      ["healing.wasm", "healing-worker.js", "request-codec.js", "wasm_exec.js"].map(
        async (name): Promise<void> => {
          const identity = manifest.files[name];
          if (!identity) throw new Error("Missing Shaman engine asset");
          await checkedAsset(directory, manifest.release, name, identity);
        },
      ),
    );
    reportedAvailabilityError = undefined;
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown Shaman release failure";
    if (reportedAvailabilityError !== message)
      console.warn("[healer-simulator] Shaman release unavailable:", message);
    reportedAvailabilityError = message;
    return false;
  }
}

export async function serveShamanHealerAsset(
  request: Request,
  release: string,
  name: string,
  directory = shamanHealerDirectory(),
): Promise<Response> {
  if (!releasePattern.test(release) || !filenamePattern.test(name) || name.includes(".."))
    return new Response(null, { status: 404 });
  const manifest = await readShamanHealerRelease(directory, release),
    identity = manifest?.files[name];
  if (!manifest || !identity) return new Response(null, { status: 404 });
  const available = (["br", "gzip"] as const).filter(
    (encoding) => manifest.encodings?.[name]?.[encoding],
  );
  const encoding = selectHealerEncoding(request.headers.get("accept-encoding"), available);
  if (encoding === null)
    return new Response(null, { status: 406, headers: { Vary: "Accept-Encoding" } });
  const compressed = encoding === "identity" ? undefined : manifest.encodings?.[name]?.[encoding];
  const expected = compressed ?? identity,
    file = name + (compressed ? (encoding === "br" ? ".br" : ".gz") : "");
  const path = await checkedAsset(directory, release, file, expected),
    etag = '"' + expected.sha256 + '"';
  const mime: Readonly<Record<string, string>> = {
    json: "application/json; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    wasm: "application/wasm",
  };
  const headers = new Headers({
    "Content-Type": mime[name.split(".").at(-1) ?? ""] ?? "application/octet-stream",
    "Content-Length": String(expected.bytes),
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    Vary: "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  if (compressed) headers.set("Content-Encoding", encoding);
  const matched = request.headers
    .get("if-none-match")
    ?.split(",")
    .map((token) => token.trim().replace(/^W\//, ""));
  if (matched?.includes(etag) || matched?.includes("*"))
    return new Response(null, { status: 304, headers });
  const body =
    request.method === "HEAD"
      ? null
      : (Readable.toWeb(
          createReadStream(path, { signal: request.signal }),
        ) as ReadableStream<Uint8Array>);
  return new Response(body, { headers });
}
