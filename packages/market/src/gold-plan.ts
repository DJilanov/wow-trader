import { costWholeAuctionStacks, type SelectedAuctionLot } from "./auction-lots.js";
import type { MarketPriceLevel } from "./order-book-summary.js";

export interface GoldPlanCandidate {
  readonly id: string;
  readonly name: string;
  readonly kind: "buy" | "auction_house" | "vendor" | "disenchant";
  readonly itemId: number;
  readonly expectedNetRevenueCopper: bigint;
  readonly maximumExecutions: number;
  readonly inputs: readonly { readonly itemId: number; readonly quantity: number }[];
  readonly purchases?: readonly {
    readonly itemId: number;
    readonly lots: readonly SelectedAuctionLot[];
  }[];
  readonly detail: string;
  readonly outputCaps?: readonly {
    readonly itemId: number;
    readonly quantity: number;
    readonly limit: number;
  }[];
}
export interface GoldPlanInventory {
  readonly itemId: number;
  readonly quantity: number;
  readonly opportunityValueCopper: bigint;
}
export interface GoldPlanAction {
  readonly candidate: GoldPlanCandidate;
  readonly purchaseCostCopper: bigint;
  readonly ownedMaterialValueCopper: bigint;
  readonly expectedProfitCopper: bigint;
  readonly purchases: readonly {
    readonly itemId: number;
    readonly lots: readonly SelectedAuctionLot[];
  }[];
  readonly ownedInputs: readonly { readonly itemId: number; readonly quantity: number }[];
}
export interface GoldPlan {
  readonly actions: readonly GoldPlanAction[];
  readonly spentCopper: bigint;
  readonly remainingCopper: bigint;
  readonly expectedProfitCopper: bigint;
  readonly ownedMaterialValueCopper: bigint;
}
interface Stock {
  quantity: number;
  value: bigint;
}
interface PlanState {
  stock: Map<number, Stock>;
  surplus: Map<number, number>;
  lots: Map<string, number>;
  outputs: Map<number, number>;
}
function lotKey(itemId: number, lot: SelectedAuctionLot): string {
  return `${itemId}:${lot.stackSize}:${lot.buyoutCopper}`;
}
function clone(state: PlanState): PlanState {
  return {
    stock: new Map([...state.stock].map(([id, row]) => [id, { ...row }])),
    surplus: new Map(state.surplus),
    lots: new Map(state.lots),
    outputs: new Map(state.outputs),
  };
}

export function buildSharedGoldPlan(input: {
  readonly budgetCopper: bigint;
  readonly candidates: readonly GoldPlanCandidate[];
  readonly books: ReadonlyMap<number, readonly MarketPriceLevel[]>;
  readonly inventory: readonly GoldPlanInventory[];
  readonly maximumActions?: number;
}): GoldPlan {
  if (input.budgetCopper < 0n) throw new RangeError("A gold plan needs a nonnegative budget");
  const maximum = input.maximumActions ?? 30;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100)
    throw new RangeError("Invalid action limit");
  const initial: PlanState = {
    stock: new Map(),
    surplus: new Map(),
    lots: new Map(),
    outputs: new Map(),
  };
  for (const row of input.inventory) {
    if (!Number.isSafeInteger(row.quantity) || row.quantity < 0 || row.opportunityValueCopper < 0n)
      throw new RangeError("Invalid owned inventory");
    const previous = initial.stock.get(row.itemId);
    if (previous && previous.value !== row.opportunityValueCopper)
      throw new RangeError("Conflicting inventory valuations");
    initial.stock.set(row.itemId, {
      quantity: (previous?.quantity ?? 0) + row.quantity,
      value: row.opportunityValueCopper,
    });
  }
  for (const [itemId, book] of input.books)
    for (const level of book)
      for (const lot of level.lots ?? [])
        initial.lots.set(
          lotKey(itemId, lot),
          (initial.lots.get(lotKey(itemId, lot)) ?? 0) + lot.listingCount,
        );
  const assess = (
    candidate: GoldPlanCandidate,
    state: PlanState,
    budget: bigint,
  ): { action: GoldPlanAction; state: PlanState } | null => {
    const next = clone(state),
      purchases: { itemId: number; lots: readonly SelectedAuctionLot[] }[] = [],
      ownedInputs: { itemId: number; quantity: number }[] = [];
    let cost = 0n,
      value = 0n;
    for (const output of candidate.outputCaps ?? []) {
      const committed = next.outputs.get(output.itemId) ?? 0;
      if (
        !Number.isSafeInteger(output.quantity) ||
        output.quantity < 1 ||
        committed + output.quantity > output.limit
      )
        return null;
      next.outputs.set(output.itemId, committed + output.quantity);
    }
    if (candidate.purchases) {
      for (const purchase of candidate.purchases)
        for (const lot of purchase.lots) {
          const key = lotKey(purchase.itemId, lot),
            count = next.lots.get(key) ?? 0;
          if (count < lot.listingCount) return null;
          next.lots.set(key, count - lot.listingCount);
          cost += lot.buyoutCopper * BigInt(lot.listingCount);
        }
      purchases.push(...candidate.purchases);
    }
    for (const required of candidate.inputs) {
      let quantity = required.quantity;
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) return null;
      const surplus = Math.min(quantity, next.surplus.get(required.itemId) ?? 0);
      quantity -= surplus;
      next.surplus.set(required.itemId, (next.surplus.get(required.itemId) ?? 0) - surplus);
      const stock = next.stock.get(required.itemId);
      if (stock && quantity > 0) {
        const used = Math.min(quantity, stock.quantity);
        stock.quantity -= used;
        quantity -= used;
        value += stock.value * BigInt(used);
        if (used) ownedInputs.push({ itemId: required.itemId, quantity: used });
      }
      if (quantity > 0) {
        const seenLots = new Set<string>();
        const levels = (input.books.get(required.itemId) ?? []).flatMap((level) => {
          if (!level.lots) return [];
          const lots = level.lots.flatMap((lot) => {
            const key = lotKey(required.itemId, lot);
            if (seenLots.has(key)) return [];
            seenLots.add(key);
            const count = next.lots.get(key) ?? 0;
            return count > 0 ? [{ ...lot, listingCount: count }] : [];
          });
          return lots.length
            ? [
                {
                  ...level,
                  lots,
                  quantity: lots.reduce((sum, lot) => sum + lot.stackSize * lot.listingCount, 0),
                  listingCount: lots.reduce((sum, lot) => sum + lot.listingCount, 0),
                },
              ]
            : [];
        });
        const bought = costWholeAuctionStacks(levels, quantity, budget - cost);
        if (!bought) return null;
        cost += bought.costCopper;
        purchases.push({ itemId: required.itemId, lots: bought.lots });
        next.surplus.set(
          required.itemId,
          (next.surplus.get(required.itemId) ?? 0) + bought.quantity - quantity,
        );
        for (const lot of bought.lots) {
          const key = lotKey(required.itemId, lot);
          next.lots.set(key, (next.lots.get(key) ?? 0) - lot.listingCount);
        }
      }
    }
    const profit = candidate.expectedNetRevenueCopper - cost - value;
    if (cost > budget || profit <= 0n) return null;
    return {
      action: {
        candidate,
        purchaseCostCopper: cost,
        ownedMaterialValueCopper: value,
        expectedProfitCopper: profit,
        purchases,
        ownedInputs,
      },
      state: next,
    };
  };
  const plans: GoldPlan[] = [];
  for (const strategy of ["profit", "return"] as const) {
    let state = clone(initial),
      spent = 0n,
      profit = 0n,
      owned = 0n;
    const actions: GoldPlanAction[] = [],
      executions = new Map<string, number>();
    for (let step = 0; step < maximum; step++) {
      let best: ReturnType<typeof assess> = null;
      for (const candidate of input.candidates.slice(0, 200)) {
        if ((executions.get(candidate.id) ?? 0) >= candidate.maximumExecutions) continue;
        const proposal = assess(candidate, state, input.budgetCopper - spent);
        if (!proposal) continue;
        const a = proposal.action,
          b = best?.action;
        const better =
          !b ||
          (strategy === "profit"
            ? a.expectedProfitCopper > b.expectedProfitCopper
            : a.expectedProfitCopper * (b.purchaseCostCopper + b.ownedMaterialValueCopper + 1n) >
              b.expectedProfitCopper * (a.purchaseCostCopper + a.ownedMaterialValueCopper + 1n));
        if (better) best = proposal;
      }
      if (!best) break;
      actions.push(best.action);
      state = best.state;
      spent += best.action.purchaseCostCopper;
      profit += best.action.expectedProfitCopper;
      owned += best.action.ownedMaterialValueCopper;
      executions.set(best.action.candidate.id, (executions.get(best.action.candidate.id) ?? 0) + 1);
    }
    plans.push({
      actions,
      spentCopper: spent,
      remainingCopper: input.budgetCopper - spent,
      expectedProfitCopper: profit,
      ownedMaterialValueCopper: owned,
    });
  }
  return plans.reduce((best, plan) =>
    plan.expectedProfitCopper > best.expectedProfitCopper ? plan : best,
  );
}
