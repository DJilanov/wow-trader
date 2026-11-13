import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  catalogSnapshotManifestSchema,
  type CatalogSnapshotManifest,
  type ClientValuationPack,
} from "@wow-trader/contracts";
import { z } from "zod";

const ruleSchema = z
  .object({
    id: z.number().int().positive(),
    Class: z.number().int().nonnegative(),
    Quality: z.number().int().nonnegative(),
    MinLevel: z.number().int().nonnegative(),
    MaxLevel: z.number().int().nonnegative(),
    SkillRequired: z.number().int().nonnegative(),
    Subclass: z.number().int(),
    ExpansionID: z.number().int(),
  })
  .refine((row) => row.MinLevel <= row.MaxLevel, "Invalid disenchant level range.");
export type ClientDisenchantRule = z.infer<typeof ruleSchema>;

export interface ClientValuationItem {
  readonly itemId: number;
  readonly classId: number;
  readonly subclassId: number;
  readonly quality: number;
  readonly itemLevel: number;
  readonly binding: number;
  readonly rawRecord: unknown;
}
export interface ClientDisenchantEligibility {
  readonly eligible: boolean;
  readonly skill: number;
  readonly referenceLevel: number;
  readonly specialLoot: boolean;
}
export interface ClientDisenchantEvidence {
  readonly manifest: CatalogSnapshotManifest;
  readonly rules: readonly ClientDisenchantRule[];
  readonly sha256: string;
}
const pending = new Map<string, Promise<ClientDisenchantEvidence | null>>();

export async function loadClientDisenchantEvidence(
  catalogRoot: string | undefined,
  manifestValue: unknown,
): Promise<ClientDisenchantEvidence | null> {
  if (!catalogRoot) return null;
  if (!isAbsolute(catalogRoot)) throw new Error("The catalog reference root must be absolute.");
  const manifest = catalogSnapshotManifestSchema.parse(manifestValue);
  const artifact = manifest.rawTables["ItemDisenchantLoot.effective"];
  if (!artifact || !manifest.hotfix.sha256) return null;
  if (
    !/^[a-z0-9_]+$/.test(manifest.product) ||
    !/^[A-Za-z]{4}$/.test(manifest.locale) ||
    !/^[a-f0-9]{40}$/.test(manifest.definitions.revision)
  )
    throw new Error("Invalid catalog reference identity.");
  const name = `${manifest.product}-${manifest.buildNumber}-${manifest.locale}-${manifest.hotfix.sha256.slice(0, 8)}-${manifest.definitions.revision.slice(0, 7)}`;
  const root = resolve(catalogRoot, name);
  const file = resolve(root, artifact.path);
  const offset = relative(root, file);
  if (offset.startsWith("..") || isAbsolute(offset))
    throw new Error("Disenchant evidence escapes its catalog.");
  const key = `${file}:${artifact.sha256}:${artifact.recordCount}:${manifest.extractor.version}:${manifest.hotfix.sha256}:${manifest.definitions.revision}`;
  let promise = pending.get(key);
  if (!promise) {
    promise = (async (): Promise<ClientDisenchantEvidence | null> => {
      let bytes: Buffer;
      try {
        bytes = await readFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== artifact.sha256.toLowerCase())
        throw new Error("Disenchant rule checksum mismatch.");
      const rows = gunzipSync(bytes, { maxOutputLength: 4 * 1024 * 1024 })
        .toString("utf8")
        .split("\n")
        .filter((row) => row.trim())
        .map((row): unknown => JSON.parse(row));
      if (rows.length !== artifact.recordCount || rows.length > 10_000)
        throw new Error("Disenchant rule count mismatch.");
      if (!rows.length) return null;
      const rules = z.array(ruleSchema).parse(rows);
      if (new Set(rules.map((rule) => rule.id)).size !== rules.length)
        throw new Error("Duplicate disenchant rules.");
      return { manifest, rules, sha256 };
    })();
    pending.set(key, promise);
    if (pending.size > 8) pending.delete(pending.keys().next().value!);
  }
  try {
    const result = await promise;
    if (!result) pending.delete(key);
    return result;
  } catch (error) {
    pending.delete(key);
    throw error;
  }
}

export function createClientValuationPack(
  evidence: ClientDisenchantEvidence,
  items: readonly ClientValuationItem[],
): ClientValuationPack {
  const entries: ClientValuationPack["items"] = [];
  for (const item of items) {
    if ((item.classId !== 2 && item.classId !== 4) || item.quality < 2 || item.quality > 4)
      continue;
    const eligibility = getClientDisenchantEligibility(item, evidence.rules);
    if (!eligibility) continue;
    entries.push([
      item.itemId,
      item.classId,
      item.quality,
      item.itemLevel,
      eligibility.eligible,
      eligibility.skill,
      eligibility.referenceLevel,
      eligibility.specialLoot,
    ]);
  }
  entries.sort((left, right) => left[0] - right[0]);
  const identity = {
    clientProduct: evidence.manifest.product,
    clientBuild: evidence.manifest.buildNumber,
    hotfixSha256: evidence.manifest.hotfix.sha256!,
    definitionsRevision: evidence.manifest.definitions.revision,
  };
  return {
    schemaVersion: "client-valuation.v1",
    ...identity,
    sourceSha256: createHash("sha256")
      .update(JSON.stringify({ ...identity, ruleHash: evidence.sha256, items: entries }))
      .digest("hex"),
    items: entries,
  };
}

const sparseSchema = z.object({
  itemSparse: z.object({
    Flags: z.array(z.number().int().min(-2_147_483_648).max(4_294_967_295)).min(2),
    ExpansionID: z.number().int(),
  }),
});

export function getClientDisenchantEligibility(
  item: ClientValuationItem,
  rules: readonly ClientDisenchantRule[],
): ClientDisenchantEligibility | null {
  const sparse = sparseSchema.safeParse(item.rawRecord);
  if (!sparse.success) return null;
  const row = sparse.data.itemSparse;
  const matching = rules.filter(
    (rule) =>
      rule.Class === item.classId &&
      rule.Quality === item.quality &&
      item.itemLevel >= rule.MinLevel &&
      item.itemLevel <= rule.MaxLevel &&
      (rule.Subclass < 0 || rule.Subclass === item.subclassId) &&
      (rule.ExpansionID < 0 || rule.ExpansionID === row.ExpansionID),
  );
  if (matching.length > 1) return null;
  const rule = matching[0];
  const eligible = Boolean(rule && (row.Flags[0]! & 0x8000) === 0 && item.binding !== 4);
  let referenceLevel = item.itemLevel;
  if (referenceLevel > 65 && referenceLevel <= 99 && rule?.MinLevel === 61) referenceLevel = 65;
  if (item.classId === 2 && item.quality === 2 && referenceLevel === 5) referenceLevel = 6;
  if (item.quality === 3 && referenceLevel >= 5 && referenceLevel < 11) referenceLevel = 11;
  return {
    eligible,
    skill: rule?.SkillRequired ?? 0,
    referenceLevel,
    specialLoot: (row.Flags[1]! & 0x40000000) !== 0,
  };
}
