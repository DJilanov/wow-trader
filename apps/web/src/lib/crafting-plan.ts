import type { SupportedClientProduct } from "./game-versions";
import type { MarketWorkspaceOpportunity } from "./market-workspace-data";

const STORAGE_VERSION = 2;
const MAX_PLAN_ENTRIES = 50;

export interface CraftingPlanMaterial {
  readonly itemId: number;
  readonly name: string;
  readonly quantity: number;
}

export interface CraftingPlanStep {
  readonly recipeSpellId: number;
  readonly recipeName: string;
  readonly professionName: string;
  readonly crafts: number;
  readonly outputName: string;
  readonly outputQuantity: number;
}

export interface CraftingPlanEntry {
  readonly id: string;
  readonly clientProduct: SupportedClientProduct;
  readonly market: string;
  readonly recipeSpellId: number;
  readonly recipeName: string;
  readonly outputLabel: string;
  readonly professionName: string;
  readonly routeLabel: string;
  readonly quoteCapturedAt: string;
  readonly crafts: number;
  readonly capitalCopper: string;
  readonly profitCopper: string;
  readonly inputs: readonly CraftingPlanMaterial[];
  readonly craftSteps: readonly CraftingPlanStep[];
}

interface StoredCraftingPlan {
  readonly version: number;
  readonly entries: readonly CraftingPlanEntry[];
}

export interface CraftingPlanTotals {
  readonly capitalCopper: bigint;
  readonly profitCopper: bigint;
  readonly materials: readonly CraftingPlanMaterial[];
}

export function createCraftingPlanEntry(
  opportunity: Pick<
    MarketWorkspaceOpportunity,
    | "craftSteps"
    | "executableCapitalCopper"
    | "executableCrafts"
    | "executableProfitCopper"
    | "inputs"
    | "outputLabel"
    | "professionName"
    | "quoteCapturedAt"
    | "recipeName"
    | "recipeSpellId"
    | "route"
    | "routeLabel"
  >,
  clientProduct: SupportedClientProduct,
  market: string,
): CraftingPlanEntry {
  return {
    id: `${opportunity.recipeSpellId}:${opportunity.route}`,
    clientProduct,
    market,
    recipeSpellId: opportunity.recipeSpellId,
    recipeName: opportunity.recipeName,
    outputLabel: opportunity.outputLabel,
    professionName: opportunity.professionName,
    routeLabel: opportunity.routeLabel,
    quoteCapturedAt: opportunity.quoteCapturedAt,
    crafts: opportunity.executableCrafts,
    capitalCopper: opportunity.executableCapitalCopper,
    profitCopper: opportunity.executableProfitCopper,
    inputs: opportunity.inputs.map((input) => ({
      itemId: input.itemId,
      name: input.name,
      quantity: input.quantity * opportunity.executableCrafts,
    })),
    craftSteps: opportunity.craftSteps.map((step) => ({
      recipeSpellId: step.recipeSpellId,
      recipeName: step.recipeName,
      professionName: step.professionName,
      crafts: step.crafts * opportunity.executableCrafts,
      outputName: step.outputName,
      outputQuantity: step.outputQuantity * opportunity.executableCrafts,
    })),
  };
}

export function craftingPlanStorageKey(
  clientProduct: SupportedClientProduct,
  market: string,
): string {
  return `wow-trader:crafting-plan:v${STORAGE_VERSION}:${clientProduct}:${market}`;
}

export function parseCraftingPlan(value: string | null): readonly CraftingPlanEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries.slice(0, MAX_PLAN_ENTRIES).filter(isCraftingPlanEntry);
  } catch {
    return [];
  }
}

export function serializeCraftingPlan(entries: readonly CraftingPlanEntry[]): string {
  const value: StoredCraftingPlan = {
    version: STORAGE_VERSION,
    entries: entries.slice(0, MAX_PLAN_ENTRIES),
  };
  return JSON.stringify(value);
}

export function upsertCraftingPlanEntry(
  entries: readonly CraftingPlanEntry[],
  entry: CraftingPlanEntry,
): readonly CraftingPlanEntry[] {
  return [entry, ...entries.filter((existing) => existing.id !== entry.id)].slice(
    0,
    MAX_PLAN_ENTRIES,
  );
}

export function summarizeCraftingPlan(entries: readonly CraftingPlanEntry[]): CraftingPlanTotals {
  const materials = new Map<number, CraftingPlanMaterial>();
  let capitalCopper = 0n;
  let profitCopper = 0n;
  for (const entry of entries) {
    capitalCopper += BigInt(entry.capitalCopper);
    profitCopper += BigInt(entry.profitCopper);
    for (const input of entry.inputs) {
      const current = materials.get(input.itemId);
      materials.set(input.itemId, {
        itemId: input.itemId,
        name: input.name,
        quantity: (current?.quantity ?? 0) + input.quantity,
      });
    }
  }
  return {
    capitalCopper,
    profitCopper,
    materials: [...materials.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function isCraftingPlanEntry(value: unknown): value is CraftingPlanEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.clientProduct === "wow_anniversary" || value.clientProduct === "wow_classic_beta") &&
    typeof value.market === "string" &&
    isPositiveInteger(value.recipeSpellId) &&
    typeof value.recipeName === "string" &&
    typeof value.outputLabel === "string" &&
    typeof value.professionName === "string" &&
    typeof value.routeLabel === "string" &&
    typeof value.quoteCapturedAt === "string" &&
    !Number.isNaN(Date.parse(value.quoteCapturedAt)) &&
    isPositiveInteger(value.crafts) &&
    isIntegerString(value.capitalCopper) &&
    isIntegerString(value.profitCopper) &&
    Array.isArray(value.inputs) &&
    value.inputs.every(isCraftingPlanMaterial) &&
    Array.isArray(value.craftSteps) &&
    value.craftSteps.every(isCraftingPlanStep)
  );
}

function isCraftingPlanMaterial(value: unknown): value is CraftingPlanMaterial {
  return (
    isRecord(value) &&
    isPositiveInteger(value.itemId) &&
    typeof value.name === "string" &&
    isPositiveInteger(value.quantity)
  );
}

function isCraftingPlanStep(value: unknown): value is CraftingPlanStep {
  return (
    isRecord(value) &&
    isPositiveInteger(value.recipeSpellId) &&
    typeof value.recipeName === "string" &&
    typeof value.professionName === "string" &&
    isPositiveInteger(value.crafts) &&
    typeof value.outputName === "string" &&
    isPositiveInteger(value.outputQuantity)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isIntegerString(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+$/.test(value);
}
