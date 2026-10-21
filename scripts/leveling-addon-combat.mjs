import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import { combatDatasetSchema, combatManifestSchema } from "../packages/leveling/dist/index.js";

async function boundedJson(path, maximum, label) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > maximum)
    throw new Error(`${label} exceeds its regular-file budget.`);
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw) > maximum) throw new Error(`${label} grew beyond its size budget.`);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  return { raw, parsed };
}

/** Local review input only. Loading a private reference never authorizes its publication. */
export async function readAddonCombatReference(root, sourceBuild) {
  if (root === null) return null;
  if (!Number.isSafeInteger(sourceBuild) || sourceBuild <= 0)
    throw new Error("Invalid combat source build.");
  const input = await boundedJson(join(root, "manifest.json"), 4000, "Combat manifest");
  const manifest = combatManifestSchema.safeParse(input.parsed);
  if (!manifest.success) throw new Error("Combat manifest schema validation failed.");
  if (manifest.data.targetBuild !== sourceBuild)
    throw new Error("Combat manifest build does not match the source archive.");
  const contents = await boundedJson(join(root, manifest.data.file), 16_000_000, "Combat data");
  if (createHash("sha256").update(contents.raw).digest("hex") !== manifest.data.sha256)
    throw new Error("Combat reference checksum mismatch.");
  const data = combatDatasetSchema.safeParse(contents.parsed);
  if (!data.success) throw new Error("Combat reference schema validation failed.");
  if (data.data.targetBuild !== sourceBuild)
    throw new Error("Combat dataset build does not match the source archive.");
  return { data: data.data, revision: manifest.data.sha256 };
}
