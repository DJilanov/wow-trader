import { createHash } from "node:crypto";
import { canonicalJson, type CatalogBundle } from "@wow-trader/contracts";
import { z } from "zod";

const reagentRowSchema = z
  .object({
    SpellID: z.number().int().nonnegative(),
    Reagent: z.array(z.number().int()),
    ReagentCount: z.array(z.number().int()),
  })
  .refine((row) => row.Reagent.length === row.ReagentCount.length, {
    message: "Source reagent IDs and quantities must have equal lengths.",
  });

export interface RecipeReagentVerification {
  readonly sourceAvailable: boolean;
  readonly inputFingerprint: string;
  readonly verifiedRecipeIds: readonly number[];
  readonly mismatchedRecipeIds: readonly number[];
}

export function fingerprintRecipeInputs(inputs: CatalogBundle["recipeInputs"]): string {
  const records = inputs.map((input) => canonicalJson(input)).sort();
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export function verifyRecipeReagents(
  bundle: Pick<CatalogBundle, "recipes" | "recipeInputs">,
  rawRows: Iterable<Readonly<Record<string, unknown>>> | null,
): RecipeReagentVerification {
  const inputFingerprint = fingerprintRecipeInputs(bundle.recipeInputs);
  if (rawRows === null)
    return {
      sourceAvailable: false,
      inputFingerprint,
      verifiedRecipeIds: [],
      mismatchedRecipeIds: [],
    };

  const expected = new Map<number, string[]>();
  const actual = new Map<number, string[]>();
  for (const raw of rawRows) {
    const row = reagentRowSchema.parse(raw);
    const values = expected.get(row.SpellID) ?? [];
    row.Reagent.forEach((itemId, index): void => {
      const quantity = row.ReagentCount[index]!;
      if (itemId > 0 && quantity > 0) values.push(JSON.stringify([itemId, quantity, false]));
    });
    expected.set(row.SpellID, values);
  }
  for (const input of bundle.recipeInputs) {
    const values = actual.get(input.recipeSpellId) ?? [];
    values.push(JSON.stringify([input.reagentItemId, input.quantity, input.optional]));
    actual.set(input.recipeSpellId, values);
  }
  const verifiedRecipeIds: number[] = [];
  const mismatchedRecipeIds: number[] = [];
  for (const recipe of bundle.recipes) {
    const id = recipe.recipeSpellId;
    if (
      JSON.stringify((expected.get(id) ?? []).sort()) ===
      JSON.stringify((actual.get(id) ?? []).sort())
    )
      verifiedRecipeIds.push(id);
    else mismatchedRecipeIds.push(id);
  }
  return { sourceAvailable: true, inputFingerprint, verifiedRecipeIds, mismatchedRecipeIds };
}
