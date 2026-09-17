import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import {
  catalogGameClassSchema,
  catalogGameRaceSchema,
  catalogGemPropertySchema,
  catalogItemBonusSchema,
  catalogItemBonusTreeNodeSchema,
  catalogItemBonusTreeSchema,
  catalogItemClassDefinitionSchema,
  catalogItemDamageSchema,
  catalogItemEffectSchema,
  catalogItemEnchantmentEffectSchema,
  catalogItemEnchantmentSchema,
  catalogItemLimitCategorySchema,
  catalogItemRandomEnchantmentSchema,
  catalogItemResistanceSchema,
  catalogItemSchema,
  catalogItemSetEffectSchema,
  catalogItemSetMemberSchema,
  catalogItemSetSchema,
  catalogItemSocketSchema,
  catalogItemStatSchema,
  catalogItemSubclassDefinitionSchema,
  catalogProfessionSchema,
  catalogRecipeInputSchema,
  catalogRecipeOutputSchema,
  catalogRecipeSchema,
  catalogRecipeTeachingItemSchema,
  catalogSnapshotManifestSchema,
  catalogSpellSchema,
  catalogTransformationInputSchema,
  catalogTransformationOutputSchema,
  catalogTransformationSchema,
  type CatalogBundle,
} from "@wow-trader/contracts";
import type { z } from "zod";

export async function loadCatalogSnapshot(manifestPath: string): Promise<CatalogBundle> {
  const absoluteManifestPath = resolve(manifestPath);
  const snapshotDirectory = dirname(absoluteManifestPath);
  const manifest = catalogSnapshotManifestSchema.parse(
    JSON.parse(await readFile(absoluteManifestPath, "utf8")) as unknown,
  );

  const loadArtifact = async <T>(name: string, schema: z.ZodType<T>): Promise<T[]> => {
    const artifact = manifest.normalizedArtifacts[name];
    if (!artifact) throw new Error(`Manifest is missing normalized artifact '${name}'`);

    const artifactPath = resolveArtifactPath(snapshotDirectory, artifact.path);
    const checksum = await sha256File(artifactPath);
    if (checksum !== artifact.sha256.toLowerCase()) {
      throw new Error(
        `Checksum mismatch for '${name}': expected ${artifact.sha256}, received ${checksum}`,
      );
    }

    const records = await readNdjson(artifactPath, schema);
    if (records.length !== artifact.recordCount) {
      throw new Error(
        `Record count mismatch for '${name}': expected ${artifact.recordCount}, received ${records.length}`,
      );
    }
    return records;
  };

  const [
    items,
    spells,
    itemStats,
    itemDamages,
    itemResistances,
    itemSockets,
    itemEffects,
    itemSets,
    itemSetMembers,
    itemSetEffects,
    gameClasses,
    gameRaces,
    itemClasses,
    itemSubclasses,
    itemLimitCategories,
    gemProperties,
    itemEnchantments,
    itemEnchantmentEffects,
    itemRandomEnchantments,
    itemBonusTrees,
    itemBonusTreeNodes,
    itemBonuses,
    professions,
    recipes,
    recipeInputs,
    recipeOutputs,
    recipeTeachingItems,
    transformations,
    transformationInputs,
    transformationOutputs,
  ] = await Promise.all([
    loadArtifact("items", catalogItemSchema),
    loadArtifact("spells", catalogSpellSchema),
    loadArtifact("item-stats", catalogItemStatSchema),
    loadArtifact("item-damages", catalogItemDamageSchema),
    loadArtifact("item-resistances", catalogItemResistanceSchema),
    loadArtifact("item-sockets", catalogItemSocketSchema),
    loadArtifact("item-effects", catalogItemEffectSchema),
    loadArtifact("item-sets", catalogItemSetSchema),
    loadArtifact("item-set-members", catalogItemSetMemberSchema),
    loadArtifact("item-set-effects", catalogItemSetEffectSchema),
    loadArtifact("game-classes", catalogGameClassSchema),
    loadArtifact("game-races", catalogGameRaceSchema),
    loadArtifact("item-classes", catalogItemClassDefinitionSchema),
    loadArtifact("item-subclasses", catalogItemSubclassDefinitionSchema),
    loadArtifact("item-limit-categories", catalogItemLimitCategorySchema),
    loadArtifact("gem-properties", catalogGemPropertySchema),
    loadArtifact("item-enchantments", catalogItemEnchantmentSchema),
    loadArtifact("item-enchantment-effects", catalogItemEnchantmentEffectSchema),
    loadArtifact("item-random-enchantments", catalogItemRandomEnchantmentSchema),
    loadArtifact("item-bonus-trees", catalogItemBonusTreeSchema),
    loadArtifact("item-bonus-tree-nodes", catalogItemBonusTreeNodeSchema),
    loadArtifact("item-bonuses", catalogItemBonusSchema),
    loadArtifact("professions", catalogProfessionSchema),
    loadArtifact("recipes", catalogRecipeSchema),
    loadArtifact("recipe-inputs", catalogRecipeInputSchema),
    loadArtifact("recipe-outputs", catalogRecipeOutputSchema),
    loadArtifact("recipe-teaching-items", catalogRecipeTeachingItemSchema),
    loadArtifact("transformations", catalogTransformationSchema),
    loadArtifact("transformation-inputs", catalogTransformationInputSchema),
    loadArtifact("transformation-outputs", catalogTransformationOutputSchema),
  ]);

  return {
    manifest,
    items,
    spells,
    itemStats,
    itemDamages,
    itemResistances,
    itemSockets,
    itemEffects,
    itemSets,
    itemSetMembers,
    itemSetEffects,
    gameClasses,
    gameRaces,
    itemClasses,
    itemSubclasses,
    itemLimitCategories,
    gemProperties,
    itemEnchantments,
    itemEnchantmentEffects,
    itemRandomEnchantments,
    itemBonusTrees,
    itemBonusTreeNodes,
    itemBonuses,
    professions,
    recipes,
    recipeInputs,
    recipeOutputs,
    recipeTeachingItems,
    transformations,
    transformationInputs,
    transformationOutputs,
  };
}

async function readNdjson<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
  const source = createReadStream(path);
  const input = extname(path) === ".gz" ? source.pipe(createGunzip()) : source;
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  const records: T[] = [];
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim().length === 0) continue;

    try {
      records.push(schema.parse(JSON.parse(line) as unknown));
    } catch (error) {
      throw new Error(`Invalid record in ${path}:${lineNumber}`, { cause: error });
    }
  }

  return records;
}

function resolveArtifactPath(snapshotDirectory: string, artifactPath: string): string {
  const absolutePath = resolve(snapshotDirectory, artifactPath);
  const traversal = relative(snapshotDirectory, absolutePath);
  if (
    traversal.startsWith("..") ||
    traversal.includes(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error(`Artifact path escapes the snapshot directory: ${artifactPath}`);
  }
  return absolutePath;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}
