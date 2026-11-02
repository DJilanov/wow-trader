import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { questCatalogManifestSchema, questCatalogSchema } from "../packages/leveling/dist/index.js";

async function boundedJson(file, maximum, label) {
  const info = await stat(file);
  if (!info.isFile() || info.size > maximum)
    throw new Error(`${label} exceeds its regular-file budget.`);
  const raw = await readFile(file, "utf8");
  if (Buffer.byteLength(raw) > maximum) throw new Error(`${label} grew beyond its size budget.`);
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

/** Local review input; reading private data does not authorize publication. */
export async function readAddonQuestCatalog(root, sourceBuild, sourceArchiveSha256) {
  if (root === null) return null;
  if (
    !Number.isSafeInteger(sourceBuild) ||
    sourceBuild <= 0 ||
    !/^[a-f0-9]{64}$/.test(sourceArchiveSha256)
  )
    throw new Error("Invalid quest catalog source identity.");
  const input = await boundedJson(join(root, "manifest.json"), 4000, "Quest catalog manifest");
  const manifest = questCatalogManifestSchema.safeParse(input.parsed);
  if (!manifest.success) throw new Error("Quest catalog manifest schema validation failed.");
  if (manifest.data.targetBuild !== sourceBuild)
    throw new Error("Quest catalog manifest build differs from the archive.");
  const contents = await boundedJson(join(root, manifest.data.file), 8_000_000, "Quest catalog");
  if (createHash("sha256").update(contents.raw).digest("hex") !== manifest.data.sha256)
    throw new Error("Quest catalog checksum mismatch.");
  const data = questCatalogSchema.safeParse(contents.parsed);
  if (!data.success) throw new Error("Quest catalog schema validation failed.");
  if (
    data.data.targetBuild !== sourceBuild ||
    data.data.sourceArchiveSha256 !== sourceArchiveSha256
  )
    throw new Error("Quest catalog identity differs from the archive.");
  return { data: data.data, revision: manifest.data.sha256 };
}
