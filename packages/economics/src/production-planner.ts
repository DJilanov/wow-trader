import { consumeOrderBook, type OrderBookConsumption, type PriceLevel } from "./order-book.js";

const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_ALTERNATIVES = 6;

export interface ProductionRequirement {
  readonly itemId: number;
  readonly quantity: number;
}

export interface ProductionRecipeInput {
  readonly itemId: number;
  readonly quantity: number;
}

export interface ProductionRecipe {
  readonly kind: "profession" | "item_use";
  readonly recipeSpellId: number;
  readonly recipeName: string;
  readonly professionSlug: string;
  readonly professionName: string;
  readonly requiredSkillRank: number;
  readonly cooldownMs: number;
  readonly categoryCooldownMs: number;
  readonly inputs: readonly ProductionRecipeInput[];
  readonly outputItemId: number;
  readonly outputName: string;
  readonly guaranteedOutputQuantity: number;
}

export interface ProductionPlannerOptions {
  readonly recipes: readonly ProductionRecipe[];
  readonly priceLevelsByItem: ReadonlyMap<number, readonly PriceLevel[]>;
  readonly allowedRecipeSpellIds?: ReadonlySet<number>;
  readonly maxDepth?: number;
  readonly maxAlternatives?: number;
}

export interface ProductionPlanRequest {
  readonly requirements: readonly ProductionRequirement[];
  readonly consumerProfessionSlug?: string;
}

export interface ProductionPurchase {
  readonly itemId: number;
  readonly quantity: number;
  readonly acquisition: OrderBookConsumption;
}

export interface ProductionCraftStep {
  readonly kind: "profession" | "item_use";
  readonly recipeSpellId: number;
  readonly recipeName: string;
  readonly professionSlug: string;
  readonly professionName: string;
  readonly requiredSkillRank: number;
  readonly crafts: number;
  readonly inputs: readonly ProductionRecipeInput[];
  readonly outputItemId: number;
  readonly outputName: string;
  readonly outputQuantity: number;
  readonly requiredOutputQuantity: number;
  readonly leftoverQuantity: number;
}

interface ProductionPlanBase {
  readonly requirements: readonly ProductionRequirement[];
  readonly directPurchaseCostCopper: bigint | null;
}

export interface UnavailableProductionPlan extends ProductionPlanBase {
  readonly viable: false;
}

export interface AvailableProductionPlan extends ProductionPlanBase {
  readonly viable: true;
  readonly totalCostCopper: bigint;
  readonly savingsVsDirectPurchaseCopper: bigint | null;
  readonly purchases: readonly ProductionPurchase[];
  readonly craftSteps: readonly ProductionCraftStep[];
  readonly crossProfessionTransferCount: number;
}

export type ProductionPlan = UnavailableProductionPlan | AvailableProductionPlan;

interface CandidatePlan {
  readonly leafQuantities: ReadonlyMap<number, number>;
  readonly craftSteps: readonly ProductionCraftStep[];
}

interface PricedCandidate {
  readonly candidate: CandidatePlan;
  readonly totalCostCopper: bigint;
  readonly purchases: readonly ProductionPurchase[];
}

export interface ProductionPlanner {
  plan(request: ProductionPlanRequest): ProductionPlan;
}

export function isTimeGatedCraft(cooldownMs: number, categoryCooldownMs: number): boolean {
  if (cooldownMs < 0 || categoryCooldownMs < 0) {
    throw new RangeError("Craft cooldowns cannot be negative");
  }
  return Math.max(cooldownMs, categoryCooldownMs) > 0;
}

export function createProductionPlanner(options: ProductionPlannerOptions): ProductionPlanner {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxAlternatives = options.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES;
  validatePlannerOptions(maxDepth, maxAlternatives);

  const recipesByOutput = groupEligibleRecipes(options);
  const memo = new Map<string, readonly CandidatePlan[]>();

  function priceCandidate(candidate: CandidatePlan): PricedCandidate | null {
    const purchases: ProductionPurchase[] = [];
    let totalCostCopper = 0n;
    for (const [itemId, quantity] of [...candidate.leafQuantities].sort(
      ([left], [right]) => left - right,
    )) {
      const acquisition = consumeOrderBook(options.priceLevelsByItem.get(itemId) ?? [], quantity);
      if (acquisition.unfilledQuantity > 0) return null;
      totalCostCopper += acquisition.totalCostCopper;
      purchases.push({ itemId, quantity, acquisition });
    }
    return { candidate, totalCostCopper, purchases };
  }

  function retainBest(candidates: readonly CandidatePlan[]): readonly CandidatePlan[] {
    const unique = new Map<string, CandidatePlan>();
    for (const candidate of candidates) {
      const signature = planSignature(candidate);
      const existing = unique.get(signature);
      if (!existing || candidate.craftSteps.length < existing.craftSteps.length) {
        unique.set(signature, candidate);
      }
    }
    return [...unique.values()]
      .flatMap((candidate) => {
        const priced = priceCandidate(candidate);
        return priced ? [priced] : [];
      })
      .sort(comparePricedCandidates)
      .slice(0, maxAlternatives)
      .map(({ candidate }) => candidate);
  }

  function candidatesFor(
    itemId: number,
    quantity: number,
    depth: number,
  ): readonly CandidatePlan[] {
    const key = `${itemId}:${quantity}:${maxDepth - depth}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const candidates: CandidatePlan[] = [
      { leafQuantities: new Map([[itemId, quantity]]), craftSteps: [] },
    ];
    if (depth < maxDepth) {
      for (const recipe of recipesByOutput.get(itemId) ?? []) {
        const crafts = Math.ceil(quantity / recipe.guaranteedOutputQuantity);
        let combinations: readonly CandidatePlan[] = [
          { leafQuantities: new Map(), craftSteps: [] },
        ];
        let viable = true;
        for (const input of recipe.inputs) {
          const inputCandidates = candidatesFor(input.itemId, input.quantity * crafts, depth + 1);
          if (inputCandidates.length === 0) {
            viable = false;
            break;
          }
          combinations = retainBest(
            combinations.flatMap((combination) =>
              inputCandidates.map((inputCandidate) => combinePlans(combination, inputCandidate)),
            ),
          );
          if (combinations.length === 0) {
            viable = false;
            break;
          }
        }
        if (!viable) continue;
        const outputQuantity = crafts * recipe.guaranteedOutputQuantity;
        for (const combination of combinations) {
          candidates.push({
            leafQuantities: combination.leafQuantities,
            craftSteps: [
              ...combination.craftSteps,
              {
                kind: recipe.kind,
                recipeSpellId: recipe.recipeSpellId,
                recipeName: recipe.recipeName,
                professionSlug: recipe.professionSlug,
                professionName: recipe.professionName,
                requiredSkillRank: recipe.requiredSkillRank,
                crafts,
                inputs: recipe.inputs.map((input) => ({
                  itemId: input.itemId,
                  quantity: input.quantity * crafts,
                })),
                outputItemId: recipe.outputItemId,
                outputName: recipe.outputName,
                outputQuantity,
                requiredOutputQuantity: quantity,
                leftoverQuantity: outputQuantity - quantity,
              },
            ],
          });
        }
      }
    }

    const retained = retainBest(candidates);
    memo.set(key, retained);
    return retained;
  }

  return {
    plan(request: ProductionPlanRequest): ProductionPlan {
      const requirements = combineRequirements(request.requirements);
      if (requirements.length === 0) {
        throw new RangeError("A production plan needs at least one item requirement");
      }

      const direct = priceCandidate({
        leafQuantities: new Map(requirements.map((entry) => [entry.itemId, entry.quantity])),
        craftSteps: [],
      });
      let combinedCandidates: readonly CandidatePlan[] = [
        { leafQuantities: new Map(), craftSteps: [] },
      ];
      for (const requirement of requirements) {
        const itemCandidates = candidatesFor(requirement.itemId, requirement.quantity, 0);
        combinedCandidates = retainBest(
          combinedCandidates.flatMap((combined) =>
            itemCandidates.map((candidate) => combinePlans(combined, candidate)),
          ),
        );
      }

      const bestCandidate = combinedCandidates
        .flatMap((candidate) => {
          const priced = priceCandidate(candidate);
          return priced ? [priced] : [];
        })
        .sort(comparePricedCandidates)[0];
      if (!bestCandidate) {
        return {
          viable: false,
          requirements,
          directPurchaseCostCopper: direct?.totalCostCopper ?? null,
        };
      }

      return {
        viable: true,
        requirements,
        directPurchaseCostCopper: direct?.totalCostCopper ?? null,
        totalCostCopper: bestCandidate.totalCostCopper,
        savingsVsDirectPurchaseCopper: direct
          ? direct.totalCostCopper - bestCandidate.totalCostCopper
          : null,
        purchases: bestCandidate.purchases,
        craftSteps: bestCandidate.candidate.craftSteps,
        crossProfessionTransferCount: countCrossProfessionTransfers(
          bestCandidate.candidate.craftSteps,
          requirements,
          request.consumerProfessionSlug,
        ),
      };
    },
  };
}

function groupEligibleRecipes(
  options: ProductionPlannerOptions,
): ReadonlyMap<number, readonly ProductionRecipe[]> {
  const grouped = new Map<number, ProductionRecipe[]>();
  for (const recipe of options.recipes) {
    validateRecipe(recipe);
    if (
      recipe.kind === "profession" &&
      options.allowedRecipeSpellIds &&
      !options.allowedRecipeSpellIds.has(recipe.recipeSpellId)
    ) {
      continue;
    }
    if (isTimeGatedCraft(recipe.cooldownMs, recipe.categoryCooldownMs)) {
      continue;
    }
    if (recipe.inputs.some((input) => input.itemId === recipe.outputItemId)) continue;
    const recipes = grouped.get(recipe.outputItemId);
    if (recipes) recipes.push(recipe);
    else grouped.set(recipe.outputItemId, [recipe]);
  }
  return grouped;
}

function combineRequirements(
  requirements: readonly ProductionRequirement[],
): readonly ProductionRequirement[] {
  const combined = new Map<number, number>();
  for (const requirement of requirements) {
    if (!Number.isInteger(requirement.itemId) || requirement.itemId <= 0) {
      throw new RangeError("Required item ID must be a positive integer");
    }
    if (!Number.isInteger(requirement.quantity) || requirement.quantity <= 0) {
      throw new RangeError("Required item quantity must be a positive integer");
    }
    combined.set(
      requirement.itemId,
      (combined.get(requirement.itemId) ?? 0) + requirement.quantity,
    );
  }
  return [...combined].map(([itemId, quantity]) => ({ itemId, quantity }));
}

function combinePlans(left: CandidatePlan, right: CandidatePlan): CandidatePlan {
  const leafQuantities = new Map(left.leafQuantities);
  for (const [itemId, quantity] of right.leafQuantities) {
    leafQuantities.set(itemId, (leafQuantities.get(itemId) ?? 0) + quantity);
  }
  return {
    leafQuantities,
    craftSteps: [...left.craftSteps, ...right.craftSteps],
  };
}

function planSignature(candidate: CandidatePlan): string {
  const leaves = [...candidate.leafQuantities]
    .sort(([left], [right]) => left - right)
    .map(([itemId, quantity]) => `${itemId}:${quantity}`)
    .join(",");
  const crafts = candidate.craftSteps
    .map((step) => `${step.recipeSpellId}:${step.crafts}`)
    .join(",");
  return `${leaves}|${crafts}`;
}

function comparePricedCandidates(left: PricedCandidate, right: PricedCandidate): number {
  if (left.totalCostCopper < right.totalCostCopper) return -1;
  if (left.totalCostCopper > right.totalCostCopper) return 1;
  return left.candidate.craftSteps.length - right.candidate.craftSteps.length;
}

function countCrossProfessionTransfers(
  steps: readonly ProductionCraftStep[],
  requirements: readonly ProductionRequirement[],
  consumerProfessionSlug: string | undefined,
): number {
  let transfers = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (step.kind === "item_use") continue;
    const consumer = steps
      .slice(index + 1)
      .find((candidate) => candidate.inputs.some((input) => input.itemId === step.outputItemId));
    if (consumer?.kind === "profession") {
      if (consumer.professionSlug !== step.professionSlug) transfers += 1;
    } else if (
      consumerProfessionSlug &&
      requirements.some((requirement) => requirement.itemId === step.outputItemId) &&
      consumerProfessionSlug !== step.professionSlug
    ) {
      transfers += 1;
    }
  }
  return transfers;
}

function validatePlannerOptions(maxDepth: number, maxAlternatives: number): void {
  if (!Number.isInteger(maxDepth) || maxDepth <= 0) {
    throw new RangeError("Maximum production depth must be a positive integer");
  }
  if (!Number.isInteger(maxAlternatives) || maxAlternatives <= 0) {
    throw new RangeError("Maximum alternatives must be a positive integer");
  }
}

function validateRecipe(recipe: ProductionRecipe): void {
  if (!Number.isInteger(recipe.recipeSpellId) || recipe.recipeSpellId <= 0) {
    throw new RangeError("Recipe spell ID must be a positive integer");
  }
  if (!Number.isInteger(recipe.outputItemId) || recipe.outputItemId <= 0) {
    throw new RangeError("Recipe output item ID must be a positive integer");
  }
  if (!Number.isInteger(recipe.guaranteedOutputQuantity) || recipe.guaranteedOutputQuantity <= 0) {
    throw new RangeError("Guaranteed recipe output must be a positive integer");
  }
  if (recipe.inputs.length === 0) {
    throw new RangeError("Production recipes need at least one input");
  }
  if (recipe.cooldownMs < 0 || recipe.categoryCooldownMs < 0) {
    throw new RangeError("Recipe cooldowns cannot be negative");
  }
  for (const input of recipe.inputs) {
    if (!Number.isInteger(input.itemId) || input.itemId <= 0) {
      throw new RangeError("Recipe input item ID must be a positive integer");
    }
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new RangeError("Recipe input quantity must be a positive integer");
    }
  }
}
