import { createHash } from "node:crypto";
import type { CatalogBundle } from "@wow-trader/contracts";
import { z } from "zod";
import type { CommunityReferenceImportBundle } from "./community-import.js";
import { professionReferenceBundleSchema } from "./profession-reference.js";

const itemFields = [
  "classId",
  "subclassId",
  "requiredSkillId",
  "requiredSkillRank",
  "binding",
  "requiredLevel",
  "requiredAbilityId",
  "minimumFactionId",
  "minimumReputation",
  "allowableClassMask",
  "allowableRaceMask",
] as const;
type SourceItem = Pick<
  CatalogBundle["items"][number],
  "itemId" | "name" | (typeof itemFields)[number]
>;
export interface ClientProfessionSource {
  readonly build: {
    readonly product: string;
    readonly buildNumber: number;
    readonly locale: string;
    readonly hotfixHash: string;
  };
  readonly items: readonly SourceItem[];
  readonly recipes: readonly Pick<
    CatalogBundle["recipes"][number],
    "recipeSpellId" | "professionSkillLineId" | "rawRecord"
  >[];
  readonly inputs: CatalogBundle["recipeInputs"];
  readonly outputs: CatalogBundle["recipeOutputs"];
  readonly teachingItems: CatalogBundle["recipeTeachingItems"];
  readonly artifacts: CommunityReferenceImportBundle["artifacts"];
}

const nullableId = z.number().int().positive().nullable();
export const publishedProfessionIdentitySchema = z.object({
  build: z.object({
    id: z.uuid(),
    product: z.string(),
    buildNumber: z.number().int().positive(),
    locale: z.string(),
    hotfixHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  items: z.array(
    z.object({
      itemId: z.number().int().positive(),
      name: z.string(),
      classId: z.number().int(),
      subclassId: z.number().int(),
      requiredSkillId: nullableId,
      requiredSkillRank: z.number().int().nonnegative(),
      binding: z.number().int(),
      requiredLevel: z.number().int(),
      requiredAbilityId: nullableId,
      minimumFactionId: nullableId,
      minimumReputation: z.number().int(),
      allowableClassMask: z.number().int(),
      allowableRaceMask: z.array(z.number().int()),
    }),
  ),
  recipes: z.array(
    z.object({
      id: z.number().int().positive(),
      professionId: z.number().int().positive(),
      ability: z.record(z.string(), z.unknown()).nullable(),
      inputs: z.array(z.tuple([z.number().int(), z.number().int(), z.boolean()])),
      outputs: z.array(
        z.tuple([
          nullableId,
          nullableId,
          z.number().int(),
          z.number().int(),
          z.string(),
          z.string(),
        ]),
      ),
    }),
  ),
});

export interface ClientProfessionLinkResult {
  readonly bundle: CommunityReferenceImportBundle;
  readonly report: {
    readonly baseBuildId: string;
    readonly baseHotfix: string;
    readonly sourceHotfix: string;
    readonly candidates: number;
    readonly qualified: number;
    readonly rejected: Readonly<Record<string, number>>;
  };
}

export const clientProfessionLinksEnvelopeSchema = z.object({
  bundle: professionReferenceBundleSchema.extend({
    sourceKind: z.literal("client_profession_relations"),
    validUntil: z.iso.datetime().optional(),
  }),
  report: z.object({
    baseBuildId: z.uuid(),
    baseHotfix: z.string().regex(/^[a-f0-9]{64}$/),
    sourceHotfix: z.string().regex(/^[a-f0-9]{64}$/),
    candidates: z.number().int().nonnegative(),
    qualified: z.number().int().positive(),
    rejected: z.record(z.string(), z.number().int().nonnegative()),
  }),
});

export function qualifyClientProfessionLinks(
  source: ClientProfessionSource,
  rawBase: unknown,
): ClientProfessionLinkResult {
  const base = publishedProfessionIdentitySchema.parse(rawBase);
  if (
    base.build.product !== source.build.product ||
    base.build.buildNumber !== source.build.buildNumber ||
    base.build.locale !== source.build.locale
  )
    throw new Error(
      "Client profession relations must match the published product, build and locale.",
    );
  const sourceItems = new Map(source.items.map((item) => [item.itemId, item]));
  const baseItems = new Map(base.items.map((item) => [item.itemId, item]));
  const sourceRecipes = new Map(source.recipes.map((recipe) => [recipe.recipeSpellId, recipe]));
  const baseRecipes = new Map(base.recipes.map((recipe) => [recipe.id, recipe]));
  const rejected: Record<string, number> = {};
  const reject = (reason: string): void => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };
  const relations: CommunityReferenceImportBundle["relations"][number][] = [];
  const entities = new Map<number, CommunityReferenceImportBundle["entities"][number]>();
  const seen = new Set<string>();
  for (const link of source.teachingItems) {
    const key = `${link.teachingItemId}:${link.recipeSpellId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = sourceItems.get(link.teachingItemId);
    const baseItem = baseItems.get(link.teachingItemId);
    const recipe = sourceRecipes.get(link.recipeSpellId);
    const old = baseRecipes.get(link.recipeSpellId);
    if (!item || item.classId !== 9) {
      reject("not_a_recipe_item");
      continue;
    }
    if (!baseItem || !recipe || !old) {
      reject("not_in_published_catalog");
      continue;
    }
    if (
      itemFields.some((field) => JSON.stringify(item[field]) !== JSON.stringify(baseItem[field]))
    ) {
      reject("item_requirements_changed");
      continue;
    }
    const ability = recipe.rawRecord.skillLineAbility;
    if (
      !ability ||
      typeof ability !== "object" ||
      Array.isArray(ability) ||
      !old.ability ||
      skillBandKey(ability) !== skillBandKey(old.ability) ||
      recipe.professionSkillLineId !== old.professionId
    ) {
      reject("profession_or_skill_bands_changed");
      continue;
    }
    const floor = (ability as Record<string, unknown>).MinSkillLineRank;
    const previousFloor = old.ability.MinSkillLineRank;
    if (floor !== previousFloor && !(previousFloor === 0 && floor === 1)) {
      reject("craft_skill_floor_changed");
      continue;
    }
    const inputs = source.inputs
      .filter((input) => input.recipeSpellId === link.recipeSpellId)
      .map((input) => [input.reagentItemId, input.quantity, input.optional]);
    const outputs = source.outputs
      .filter((output) => output.recipeSpellId === link.recipeSpellId)
      .map((output) => [
        output.outputItemId,
        output.enchantmentId,
        output.minimumQuantity,
        output.maximumQuantity,
        String(output.expectedQuantityNumerator),
        String(output.expectedQuantityDenominator),
      ]);
    if (rowsKey(inputs) !== rowsKey(old.inputs) || rowsKey(outputs) !== rowsKey(old.outputs)) {
      reject("craft_inputs_or_outputs_changed");
      continue;
    }
    if (item.requiredSkillId !== null && item.requiredSkillId !== recipe.professionSkillLineId) {
      reject("profession_requirement_mismatch");
      continue;
    }
    entities.set(item.itemId, {
      kind: "item",
      id: item.itemId,
      name: item.name,
      data: { requiredSkillRank: item.requiredSkillRank, requiredSkillId: item.requiredSkillId },
    });
    relations.push({
      sourceKind: "item",
      sourceId: item.itemId,
      relationKind: "teaches_spell",
      targetKind: "spell",
      targetId: recipe.recipeSpellId,
      evidence: {
        source: "installed_client",
        matchMethod: "client_item_effect",
        learningSpellId: link.learningSpellId,
        clientBuild: source.build.buildNumber,
        sourceHotfix: source.build.hotfixHash,
        catalogHotfix: base.build.hotfixHash,
        catalogBuildId: base.build.id,
        compatibility: "matching_item_requirements_reagents_outputs_profession_and_skill_bands",
      },
    });
  }
  relations.sort((left, right) => left.sourceId - right.sourceId || left.targetId - right.targetId);
  const payload = {
    formatVersion: 1 as const,
    sourceKind: "client_profession_relations",
    sourceVersion: `Forever ${source.build.buildNumber}`,
    licenseRef: "https://www.blizzard.com/en-us/legal",
    includedAuthored: false,
    artifacts: source.artifacts,
    upstreamSources: [
      {
        name: "Installed WoW Forever client",
        revision: source.build.hotfixHash,
        checksum: source.build.hotfixHash,
        licenseRef: "https://www.blizzard.com/en-us/legal",
      },
    ],
    entities: [...entities.values()].sort((left, right) => left.id - right.id),
    relations,
  };
  const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return {
    bundle: { ...payload, checksum, sourceRevision: `client-${checksum}` },
    report: {
      baseBuildId: base.build.id,
      baseHotfix: base.build.hotfixHash,
      sourceHotfix: source.build.hotfixHash,
      candidates: seen.size,
      qualified: relations.length,
      rejected,
    },
  };
}

function rowsKey(rows: readonly (readonly unknown[])[]): string {
  return JSON.stringify(rows.map((row) => JSON.stringify(row)).sort());
}

function skillBandKey(raw: object): string {
  const record = raw as Record<string, unknown>;
  return JSON.stringify([
    record.TrivialSkillLineRankLow,
    record.TrivialSkillLineRankHigh,
    record.NumSkillUps,
    record.ClassMask ?? 0,
    record.RaceMasks ?? [record.RaceMask ?? 0, 0],
  ]);
}
