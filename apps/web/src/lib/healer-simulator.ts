import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { Readable } from "node:stream";
import {
  healerLibrarySchema,
  healerReleaseSchema,
  type HealerLibrary,
  type HealerRelease,
} from "@wow-trader/forever-data/healing-simulator";
import {
  druidHealerLibrarySchema,
  druidHealerReleaseSchema,
  type DruidHealerLibrary,
  type DruidHealerRelease,
} from "@wow-trader/forever-data/druid-healing-simulator";
import {
  anyHealerReleaseSchema,
  type AnyHealerRelease,
  type HealerProfile,
} from "@wow-trader/forever-data/healer-workspace";
import { simulatorDirectory } from "./forever-simulator";
import console from "node:console";

interface AssetIdentity {
  readonly bytes: number;
  readonly sha256: string;
}
const verifiedFiles = new Map<string, Promise<void>>();
const reportedAvailabilityErrors = new Map<HealerProfile, string>();
const mediaTypes: Readonly<Record<string, string>> = {
  json: "application/json; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  wasm: "application/wasm",
};
export function healerSimulatorDirectory(profile: HealerProfile = "healing-priest"): string {
  const directory = join(simulatorDirectory(), "healing");
  return profile === "healing-priest" ? directory : join(directory, profile);
}
export async function isHealerSimulatorAvailable(
  profile: HealerProfile = "healing-priest",
): Promise<boolean> {
  try {
    if (profile === "healing-priest") {
      const manifest = await readHealerRelease();
      if (!manifest) return false;
      await readHealerLibrary(manifest);
    } else {
      const manifest = await readDruidHealerRelease();
      if (!manifest) return false;
      await readDruidHealerLibrary(manifest);
    }
    reportedAvailabilityErrors.delete(profile);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown healer release failure";
    if (reportedAvailabilityErrors.get(profile) !== message) {
      console.warn("[healer-simulator] Optional healing release unavailable:", profile, message);
      reportedAvailabilityErrors.set(profile, message);
    }
    return false;
  }
}
export async function readHealerRelease(
  directory = healerSimulatorDirectory(),
  release?: string,
): Promise<HealerRelease | null> {
  const manifest = await readClassRelease("healing-priest", directory, release);
  return manifest ? healerReleaseSchema.parse(manifest) : null;
}
export async function readDruidHealerRelease(
  directory = healerSimulatorDirectory("healing-druid"),
  release?: string,
): Promise<DruidHealerRelease | null> {
  const manifest = await readClassRelease("healing-druid", directory, release);
  return manifest ? druidHealerReleaseSchema.parse(manifest) : null;
}
async function readClassRelease(
  profile: HealerProfile,
  directory: string,
  release?: string,
): Promise<AnyHealerRelease | null> {
  if (release && !/^[a-f0-9]{24}$/.test(release)) return null;
  const path = release ? join(directory, release, "manifest.json") : join(directory, "active.json");
  let bytes: Buffer;
  try {
    if ((await stat(path)).size > 2_000_000)
      throw new Error("Healer manifest exceeds its size limit");
    bytes = await readFile(path);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const manifest = anyHealerReleaseSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (manifest.profile !== profile) throw new Error("Healer release class mismatch");
  if (release && manifest.release !== release) throw new Error("Healer release identity mismatch");
  const sealed = anyHealerReleaseSchema.parse(
    JSON.parse(await readFile(join(directory, manifest.release, "manifest.json"), "utf8")),
  );
  if (JSON.stringify(sealed) !== JSON.stringify(manifest))
    throw new Error("Healer active pointer differs from its immutable release");
  return manifest;
}
async function checkedAsset(
  directory: string,
  release: string,
  name: string,
  expected: AssetIdentity,
): Promise<string> {
  const base = await realpath(directory),
    root = join(base, release);
  if ((await realpath(root)) !== root) throw new Error("Healer release contains a symlink");
  const path = join(root, name),
    canonical = await realpath(path);
  if (canonical !== path || !canonical.startsWith(root + sep))
    throw new Error("Healer asset escaped its release");
  const entry = await stat(path);
  if (!entry.isFile() || entry.size !== expected.bytes || entry.size > 128 * 1024 ** 2)
    throw new Error("Healer asset size mismatch");
  const key = [path, expected.sha256, entry.mtimeMs, entry.ctimeMs, entry.size].join(":");
  let check = verifiedFiles.get(key);
  if (!check) {
    check = readFile(path).then((bytes: Buffer): void => {
      if (createHash("sha256").update(bytes).digest("hex") !== expected.sha256)
        throw new Error("Healer asset checksum mismatch");
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
export async function readHealerLibrary(
  manifest: HealerRelease,
  directory = healerSimulatorDirectory(),
): Promise<HealerLibrary> {
  const expected = manifest.files["library.json"]!;
  if (expected.bytes > 8_000_000) throw new Error("Healer library exceeds its size limit");
  const path = await checkedAsset(directory, manifest.release, "library.json", expected),
    library = healerLibrarySchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (library.modelIdentity !== manifest.modelIdentity || library.profile !== manifest.profile)
    throw new Error("Healer library model mismatch");
  return library;
}

export async function readDruidHealerLibrary(
  manifest: DruidHealerRelease,
  directory = healerSimulatorDirectory("healing-druid"),
): Promise<DruidHealerLibrary> {
  const expected = manifest.files["library.json"]!;
  if (expected.bytes > 8_000_000) throw new Error("Healer library exceeds its size limit");
  const path = await checkedAsset(directory, manifest.release, "library.json", expected),
    library = druidHealerLibrarySchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (library.modelIdentity !== manifest.modelIdentity || library.profile !== manifest.profile)
    throw new Error("Healer library model mismatch");
  return library;
}

export function selectHealerEncoding(
  header: string | null,
  available: readonly ("br" | "gzip")[] = ["br", "gzip"],
): "br" | "gzip" | "identity" | null {
  const values = new Map<string, number>();
  for (const token of (header ?? "").split(",")) {
    const [name, ...parameters] = token.trim().toLowerCase().split(";");
    if (!name) continue;
    const parameter = parameters
        .map((value) => value.trim())
        .find((value) => value.startsWith("q=")),
      quality = parameter === undefined ? 1 : Number(parameter.slice(2));
    values.set(name, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0);
  }
  const compressed = available
    .map((name) => ({ name, quality: values.get(name) ?? values.get("*") ?? 0 }))
    .sort((a, b) => b.quality - a.quality);
  const best = compressed[0],
    identity = values.get("identity") ?? (values.get("*") === 0 ? 0 : 1);
  if (values.has("identity") && identity > (best?.quality ?? 0)) return "identity";
  return best && best.quality > 0 ? best.name : identity > 0 ? "identity" : null;
}
export async function serveHealerAsset(
  request: Request,
  release: string,
  name: string,
  directory = healerSimulatorDirectory(),
  profile: HealerProfile = "healing-priest",
): Promise<Response> {
  if (!/^[a-f0-9]{24}$/.test(release) || !/^[a-z0-9][a-z0-9_.-]*$/i.test(name))
    return new Response(null, { status: 404 });
  const manifest = await readClassRelease(profile, directory, release),
    identity = manifest?.files[name];
  if (!manifest || !identity) return new Response(null, { status: 404 });
  const available = (["br", "gzip"] as const).filter(
    (encoding) => manifest.encodings?.[name]?.[encoding],
  );
  const encoding = selectHealerEncoding(request.headers.get("accept-encoding"), available);
  if (encoding === null)
    return new Response(null, { status: 406, headers: { Vary: "Accept-Encoding" } });
  const compressed = encoding === "identity" ? undefined : manifest.encodings?.[name]?.[encoding],
    actualEncoding = compressed ? encoding : "identity",
    expected = compressed ?? identity,
    filename = name + (compressed ? (encoding === "br" ? ".br" : ".gz") : ""),
    path = await checkedAsset(directory, release, filename, expected),
    etag = '"' + expected.sha256 + '"',
    headers = new Headers({
      "Content-Type": mediaTypes[name.split(".").at(-1) ?? ""] ?? "application/octet-stream",
      "Content-Length": String(expected.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
      Vary: "Accept-Encoding",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
  if (actualEncoding !== "identity") headers.set("Content-Encoding", actualEncoding);
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
