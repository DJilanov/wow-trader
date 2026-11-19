import { createHash } from "node:crypto";
import { canonicalJson, type CatalogBundle } from "@wow-trader/contracts";
import { z } from "zod";

type RawRows = Iterable<Readonly<Record<string, unknown>>> | null;

export interface TeachingSourceRows {
  readonly itemEffects: RawRows;
  readonly itemLinks: RawRows;
  readonly abilities: RawRows;
  readonly itemSparse: RawRows;
}

export interface TeachingResolutionVerification {
  readonly sourceAvailable: boolean;
  readonly fingerprint: string;
  readonly verifiedRecipeIds: readonly number[];
}

const effectSchema = z.object({
  id: z.number().int(),
  SpellID: z.number().int(),
  TriggerType: z.number().int(),
  ParentItemID: z.number().int().optional(),
});
const linkSchema = z.object({ ItemID: z.number().int(), ItemEffectID: z.number().int() });
const abilitySchema = z.object({
  Spell: z.number().int(),
  SkillLine: z.number().int(),
  MinSkillLineRank: z.number().int(),
});
const sparseSchema = z.object({ id: z.number().int(), RequiredSkillRank: z.number().int() });

export function fingerprintTeachingResolution(bundle: CatalogBundle): string {
  const records = [
    ...bundle.recipes.map((recipe) =>
      canonicalJson({
        recipeSpellId: recipe.recipeSpellId,
        professionSkillLineId: recipe.professionSkillLineId,
        requiredSkillRank: recipe.requiredSkillRank,
        extractionStatus: recipe.extractionStatus,
      }),
    ),
    ...bundle.recipeTeachingItems.map((item) => canonicalJson(item)),
    ...bundle.items.map((item) =>
      canonicalJson({
        itemId: item.itemId,
        requiredSkillRank: item.requiredSkillRank,
      }),
    ),
  ].sort();
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

/** Verify direct learn-item links and skill ranks from checksum-verified native tables. */
export function verifyTeachingResolutions(
  bundle: CatalogBundle,
  source: TeachingSourceRows,
): TeachingResolutionVerification {
  const fingerprint = fingerprintTeachingResolution(bundle);
  if (!source.itemEffects || !source.itemLinks || !source.abilities || !source.itemSparse)
    return { sourceAvailable: false, fingerprint, verifiedRecipeIds: [] };

  const effects = new Map<number, z.infer<typeof effectSchema>>();
  for (const raw of source.itemEffects) {
    const effect = effectSchema.parse(raw);
    if (effects.has(effect.id)) throw new Error(`Duplicate source item effect ${effect.id}`);
    effects.set(effect.id, effect);
  }
  const candidateIds = new Map<number, Set<number>>();
  const addCandidate = (spellId: number, itemId: number): void => {
    if (spellId <= 0 || itemId <= 0) return;
    const ids = candidateIds.get(spellId) ?? new Set<number>();
    ids.add(itemId);
    candidateIds.set(spellId, ids);
  };
  for (const effect of effects.values())
    if (effect.TriggerType === 6) addCandidate(effect.SpellID, effect.ParentItemID ?? 0);
  for (const raw of source.itemLinks) {
    const link = linkSchema.parse(raw);
    const effect = effects.get(link.ItemEffectID);
    if (effect?.TriggerType === 6) addCandidate(effect.SpellID, link.ItemID);
  }
  const abilityRanks = new Map<string, Set<number>>();
  for (const raw of source.abilities) {
    const ability = abilitySchema.parse(raw);
    const key = `${ability.Spell}:${ability.SkillLine}`;
    const ranks = abilityRanks.get(key) ?? new Set<number>();
    ranks.add(Math.max(0, ability.MinSkillLineRank));
    abilityRanks.set(key, ranks);
  }
  const sparseRanks = new Map<number, number>();
  for (const raw of source.itemSparse) {
    const item = sparseSchema.parse(raw);
    sparseRanks.set(item.id, Math.max(0, item.RequiredSkillRank));
  }
  const readableItems = new Map(bundle.items.map((item) => [item.itemId, item]));
  const linksByRecipe = new Map<number, CatalogBundle["recipeTeachingItems"]>();
  for (const item of bundle.recipeTeachingItems) {
    const links = linksByRecipe.get(item.recipeSpellId) ?? [];
    links.push(item);
    linksByRecipe.set(item.recipeSpellId, links);
  }
  const verifiedRecipeIds: number[] = [];
  for (const recipe of bundle.recipes) {
    const ids = candidateIds.get(recipe.recipeSpellId);
    const ranks = abilityRanks.get(`${recipe.recipeSpellId}:${recipe.professionSkillLineId}`);
    const links = linksByRecipe.get(recipe.recipeSpellId) ?? [];
    if (!ids?.size || ranks?.size !== 1 || recipe.extractionStatus !== "complete") continue;
    if (
      links.length !== ids.size ||
      links.some((link) => link.learningSpellId !== null || !ids.has(link.teachingItemId))
    )
      continue;
    if (new Set(links.map((link) => link.teachingItemId)).size !== ids.size) continue;
    const items = [...ids].map((id) => readableItems.get(id));
    if (
      items.some(
        (item) =>
          !item ||
          !sparseRanks.has(item.itemId) ||
          item.requiredSkillRank !== sparseRanks.get(item.itemId),
      )
    )
      continue;
    const expectedRank = Math.max(...ranks, ...[...ids].map((id) => sparseRanks.get(id)!));
    if (recipe.requiredSkillRank === expectedRank) verifiedRecipeIds.push(recipe.recipeSpellId);
  }
  return { sourceAvailable: true, fingerprint, verifiedRecipeIds };
}
