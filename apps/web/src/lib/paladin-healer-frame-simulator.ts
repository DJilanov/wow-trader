import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { Readable } from "node:stream";
import {
  paladinHealerFrameReleaseSchema,
  paladinHealerFrameAdmissionSchema,
  type PaladinHealerFrameRelease,
} from "@wow-trader/forever-data/paladin-healer-frame-release";
import {
  parsePaladinHealerFullCatalog,
  type PaladinHealerFullCatalog,
} from "@wow-trader/forever-data/paladin-healer-catalog";
import {
  parsePaladinHealerFullPresentation,
  type PaladinHealerFullPresentation,
} from "@wow-trader/forever-data/paladin-healer-presentation";
import {
  assertPaladinHealerFrameLibraryCoverage,
  assertPaladinHealerCoreFrameCoverage,
  parsePaladinHealerFrameLibraryIndex,
  parsePaladinHealerIndexedFrame,
  type PaladinHealerFrameLibraryIndex,
} from "@wow-trader/forever-data/paladin-healer-frame-library";
import type { PaladinHealerFramePayload } from "@wow-trader/forever-data/paladin-healer-frame";
import { simulatorDirectory } from "./forever-simulator";
import { selectHealerEncoding } from "./healer-simulator";

interface AssetIdentity {
  readonly bytes: number;
  readonly sha256: string;
}
export interface PaladinHealerFrameLibraryData {
  readonly index: PaladinHealerFrameLibraryIndex;
  readonly catalog: PaladinHealerFullCatalog;
  readonly presentation: PaladinHealerFullPresentation;
  readonly initialFrame: PaladinHealerFramePayload;
}
const checkedFiles = new Map<string, Promise<void>>();
const releasePattern = /^[a-f0-9]{24}$/;
const filenamePattern = /^[a-z0-9][a-z0-9_.-]*$/;
function directoryPath(): string {
  return join(simulatorDirectory(), "healing", "healing-paladin");
}

async function manifestFile(path: string, expectedSha256?: string): Promise<unknown> {
  if ((await realpath(path)) !== path) throw new Error("Paladin manifest escaped its release");
  const info = await stat(path);
  if (!info.isFile() || info.size > 2_000_000)
    throw new Error("Paladin manifest exceeds its size limit");
  const body = await readFile(path);
  if (expectedSha256 && createHash("sha256").update(body).digest("hex") !== expectedSha256)
    throw new Error("Paladin admission checksum mismatch");
  return JSON.parse(body.toString("utf8")) as unknown;
}

export async function readPaladinHealerFrameRelease(
  directory = directoryPath(),
  release?: string,
): Promise<PaladinHealerFrameRelease | null> {
  if (release && !releasePattern.test(release)) return null;
  try {
    const base = await realpath(directory);
    const raw = await manifestFile(
      release ? join(base, release, "manifest.json") : join(base, "active.json"),
    );
    if (
      raw === null ||
      typeof raw !== "object" ||
      !("schema" in raw) ||
      raw.schema !== "kfc-paladin-healer-browser-release.v2"
    )
      return null;
    const manifest = paladinHealerFrameReleaseSchema.parse(raw);
    if (release && manifest.release !== release)
      throw new Error("Paladin release identity mismatch");
    if (!release && manifest.status !== "published")
      throw new Error("A Paladin review candidate cannot be active");
    const root = join(base, manifest.release);
    if ((await realpath(root)) !== root) throw new Error("Paladin release contains a symlink");
    const sealed = paladinHealerFrameReleaseSchema.parse(
      await manifestFile(join(root, "manifest.json")),
    );
    if (JSON.stringify(sealed) !== JSON.stringify(manifest))
      throw new Error("Paladin active pointer differs from its immutable release");
    if (manifest.status === "published") {
      const admission = paladinHealerFrameAdmissionSchema.parse(
        await manifestFile(
          join(root, "qualification.json"),
          manifest.qualification.sourceReviewSha256!,
        ),
      );
      if (
        admission.release !== manifest.release ||
        admission.scope !== manifest.scope ||
        admission.modelIdentity !== manifest.modelIdentity ||
        admission.runtimeSha256 !== manifest.runtimeSha256 ||
        admission.indexSha256 !== manifest.indexSha256 ||
        admission.catalogSha256 !== manifest.catalogSha256 ||
        admission.preparedFrames !== manifest.coverage.preparedFrames ||
        admission.preparedConfigurations !== manifest.coverage.preparedConfigurations ||
        admission.extendedPresetCoverageComplete !== manifest.coverage.complete
      )
        throw new Error("Paladin admission differs from its published release");
    }
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
  identity: AssetIdentity,
): Promise<string> {
  if (!releasePattern.test(release) || !filenamePattern.test(name) || name.includes(".."))
    throw new Error("Invalid Paladin asset path");
  const base = await realpath(directory),
    root = join(base, release);
  if ((await realpath(root)) !== root) throw new Error("Paladin release contains a symlink");
  const path = join(root, name),
    canonical = await realpath(path);
  if (canonical !== path || !canonical.startsWith(root + sep))
    throw new Error("Paladin asset escaped its release");
  const info = await stat(path);
  if (!info.isFile() || info.size !== identity.bytes || info.size > 128 * 1024 ** 2)
    throw new Error("Paladin asset size mismatch");
  const key = [path, identity.sha256, info.size, info.mtimeMs, info.ctimeMs].join(":");
  let check = checkedFiles.get(key);
  if (!check) {
    check = readFile(path).then((body: Buffer): void => {
      if (createHash("sha256").update(body).digest("hex") !== identity.sha256)
        throw new Error("Paladin asset checksum mismatch");
    });
    checkedFiles.set(key, check);
    void check.catch((): void => {
      checkedFiles.delete(key);
    });
    if (checkedFiles.size > 256) checkedFiles.delete(checkedFiles.keys().next().value!);
  }
  await check;
  return path;
}

async function jsonAsset(
  manifest: PaladinHealerFrameRelease,
  name: string,
  directory: string,
): Promise<unknown> {
  const identity = manifest.files[name];
  if (!identity || identity.bytes > 8_000_000)
    throw new Error("Paladin JSON asset exceeds its size limit");
  return JSON.parse(
    await readFile(await checkedAsset(directory, manifest.release, name, identity), "utf8"),
  ) as unknown;
}

export async function readPaladinHealerFrame(
  manifest: PaladinHealerFrameRelease,
  index: PaladinHealerFrameLibraryIndex,
  frameId: string,
  directory = directoryPath(),
): Promise<PaladinHealerFramePayload> {
  const descriptor = index.frames.find((entry): boolean => entry.frame.id === frameId);
  if (!descriptor) throw new Error("Unknown Paladin encounter preset");
  return parsePaladinHealerIndexedFrame(
    index,
    frameId,
    await jsonAsset(manifest, descriptor.asset.file, directory),
  );
}

export async function readPaladinHealerFrameLibrary(
  manifest: PaladinHealerFrameRelease,
  directory = directoryPath(),
): Promise<PaladinHealerFrameLibraryData> {
  const catalog = parsePaladinHealerFullCatalog(
    await jsonAsset(manifest, "catalog.json", directory),
  );
  const presentation = parsePaladinHealerFullPresentation(
    catalog,
    await jsonAsset(manifest, "presentation.json", directory),
    manifest.catalogSha256,
  );
  const index = parsePaladinHealerFrameLibraryIndex(
    catalog,
    presentation,
    await jsonAsset(manifest, "library-index.json", directory),
  );
  if (
    index.modelIdentity !== manifest.modelIdentity ||
    index.runtimeSha256 !== manifest.runtimeSha256 ||
    index.coverage.preparedFrames !== manifest.coverage.preparedFrames ||
    index.coverage.preparedConfigurations !== manifest.coverage.preparedConfigurations ||
    index.coverage.complete !== manifest.coverage.complete
  )
    throw new Error("Paladin frame library differs from its immutable release");
  for (const ref of [
    index.catalog,
    index.presentation,
    ...index.frames.map((entry) => entry.asset),
  ]) {
    const actual = manifest.files[ref.file];
    if (!actual || actual.bytes !== ref.bytes || actual.sha256 !== ref.byteSha256)
      throw new Error("Paladin indexed asset differs from its release");
  }
  if (manifest.status === "published") {
    if (manifest.scope === "core-three-minute-matrix") assertPaladinHealerCoreFrameCoverage(index);
    else assertPaladinHealerFrameLibraryCoverage(index);
  }
  const initialFrame = await readPaladinHealerFrame(
    manifest,
    index,
    index.defaultFrameId,
    directory,
  );
  return { index, catalog, presentation, initialFrame };
}

export async function verifyPaladinHealerFrameEngine(
  manifest: PaladinHealerFrameRelease,
  directory = directoryPath(),
): Promise<void> {
  await Promise.all(
    ["healing.wasm", "healing-worker.js", "request-codec.js", "wasm_exec.js"].map(
      async (name): Promise<void> => {
        const identity = manifest.files[name];
        if (!identity) throw new Error("Missing Paladin engine asset");
        await checkedAsset(directory, manifest.release, name, identity);
      },
    ),
  );
}

export async function servePaladinHealerFrameAsset(
  request: Request,
  manifest: PaladinHealerFrameRelease,
  name: string,
  directory = directoryPath(),
): Promise<Response> {
  if (!filenamePattern.test(name) || name.includes("..") || !Object.hasOwn(manifest.files, name))
    return new Response(null, { status: 404 });
  const identity = manifest.files[name]!;
  const available = (["br", "gzip"] as const).filter(
    (encoding) => manifest.encodings?.[name]?.[encoding],
  );
  const encoding = selectHealerEncoding(request.headers.get("accept-encoding"), available);
  if (encoding === null)
    return new Response(null, { status: 406, headers: { Vary: "Accept-Encoding" } });
  const compressed = encoding === "identity" ? undefined : manifest.encodings?.[name]?.[encoding];
  const expected = compressed ?? identity;
  const file = name + (compressed ? (encoding === "br" ? ".br" : ".gz") : "");
  const path = await checkedAsset(directory, manifest.release, file, expected);
  const etag = '"' + expected.sha256 + '"';
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
    .map((value) => value.trim().replace(/^W\//, ""));
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
