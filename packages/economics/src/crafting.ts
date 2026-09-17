import {
  applyBasisPointsFloor,
  assertBasisPoints,
  calculateSignedBasisPoints,
  multiplyFractionFloor,
  type Fraction,
} from "./money.js";
import { consumeOrderBook, type OrderBookConsumption, type PriceLevel } from "./order-book.js";

export interface CraftingInputMarket {
  readonly itemId: number;
  readonly quantity: number;
  readonly priceLevels: readonly PriceLevel[];
}

export interface CraftingOutputMarket {
  readonly itemId: number;
  readonly expectedQuantity: Fraction;
  readonly expectedUnitPriceCopper: bigint;
  readonly fillRateBasisPoints: number;
}

export interface CraftingOpportunityRequest {
  readonly crafts: number;
  readonly inputs: readonly CraftingInputMarket[];
  readonly outputs: readonly CraftingOutputMarket[];
  readonly auctionHouseCutBasisPoints: number;
  readonly fixedCostCopper: bigint;
  readonly listingDepositCopper: bigint;
  readonly expectedDepositLossCopper: bigint;
  readonly cooldownOpportunityCostCopper: bigint;
}

export interface PricedCraftingOpportunityRequest {
  readonly crafts: number;
  readonly reagentCostCopper: bigint;
  readonly acquisitionByItem: ReadonlyMap<number, OrderBookConsumption>;
  readonly outputs: readonly CraftingOutputMarket[];
  readonly auctionHouseCutBasisPoints: number;
  readonly fixedCostCopper: bigint;
  readonly listingDepositCopper: bigint;
  readonly expectedDepositLossCopper: bigint;
  readonly cooldownOpportunityCostCopper: bigint;
}

export interface UnfilledCraftingInput {
  readonly itemId: number;
  readonly requestedQuantity: number;
  readonly availableQuantity: number;
}

interface CraftingOpportunityBase {
  readonly crafts: number;
  readonly acquisitionByItem: ReadonlyMap<number, OrderBookConsumption>;
  readonly unfilledInputs: readonly UnfilledCraftingInput[];
}

export interface UnavailableCraftingOpportunity extends CraftingOpportunityBase {
  readonly viable: false;
}

export interface AvailableCraftingOpportunity extends CraftingOpportunityBase {
  readonly viable: true;
  readonly reagentCostCopper: bigint;
  readonly expectedGrossRevenueCopper: bigint;
  readonly expectedAuctionHouseCutCopper: bigint;
  readonly expectedNetRevenueCopper: bigint;
  readonly expectedProfitCopper: bigint;
  readonly capitalRequiredCopper: bigint;
  readonly returnOnCapitalBasisPoints: bigint | null;
}

export type CraftingOpportunity = UnavailableCraftingOpportunity | AvailableCraftingOpportunity;

export function calculateCraftingOpportunity(
  request: CraftingOpportunityRequest,
): CraftingOpportunity {
  validateRequest(request);

  const acquisitionByItem = new Map<number, OrderBookConsumption>();
  const unfilledInputs: UnfilledCraftingInput[] = [];
  let reagentCostCopper = 0n;

  for (const input of request.inputs) {
    const requestedQuantity = input.quantity * request.crafts;
    const acquisition = consumeOrderBook(input.priceLevels, requestedQuantity);
    acquisitionByItem.set(input.itemId, acquisition);
    reagentCostCopper += acquisition.totalCostCopper;

    if (acquisition.unfilledQuantity > 0) {
      unfilledInputs.push({
        itemId: input.itemId,
        requestedQuantity,
        availableQuantity: acquisition.fulfilledQuantity,
      });
    }
  }

  if (unfilledInputs.length > 0) {
    return {
      viable: false,
      crafts: request.crafts,
      acquisitionByItem,
      unfilledInputs,
    };
  }

  return calculateAvailableOpportunity(request, reagentCostCopper, acquisitionByItem);
}

export function calculatePricedCraftingOpportunity(
  request: PricedCraftingOpportunityRequest,
): AvailableCraftingOpportunity {
  validatePricedRequest(request);
  return calculateAvailableOpportunity(
    request,
    request.reagentCostCopper,
    request.acquisitionByItem,
  );
}

function calculateAvailableOpportunity(
  request: Omit<CraftingOpportunityRequest, "inputs">,
  reagentCostCopper: bigint,
  acquisitionByItem: ReadonlyMap<number, OrderBookConsumption>,
): AvailableCraftingOpportunity {
  let expectedFilledRevenueCopper = 0n;
  for (const output of request.outputs) {
    const expectedOutputValuePerCraft = multiplyFractionFloor(
      output.expectedUnitPriceCopper,
      output.expectedQuantity,
    );
    const outputValue = expectedOutputValuePerCraft * BigInt(request.crafts);
    expectedFilledRevenueCopper += applyBasisPointsFloor(outputValue, output.fillRateBasisPoints);
  }

  const expectedAuctionHouseCutCopper = applyBasisPointsFloor(
    expectedFilledRevenueCopper,
    request.auctionHouseCutBasisPoints,
  );
  const expectedNetRevenueCopper = expectedFilledRevenueCopper - expectedAuctionHouseCutCopper;
  const expectedProfitCopper =
    expectedNetRevenueCopper -
    reagentCostCopper -
    request.fixedCostCopper -
    request.expectedDepositLossCopper -
    request.cooldownOpportunityCostCopper;
  const capitalRequiredCopper =
    reagentCostCopper + request.fixedCostCopper + request.listingDepositCopper;

  return {
    viable: true,
    crafts: request.crafts,
    acquisitionByItem,
    unfilledInputs: [],
    reagentCostCopper,
    expectedGrossRevenueCopper: expectedFilledRevenueCopper,
    expectedAuctionHouseCutCopper,
    expectedNetRevenueCopper,
    expectedProfitCopper,
    capitalRequiredCopper,
    returnOnCapitalBasisPoints: calculateSignedBasisPoints(
      expectedProfitCopper,
      capitalRequiredCopper,
    ),
  };
}

function validateRequest(request: CraftingOpportunityRequest): void {
  if (request.inputs.length === 0) {
    throw new RangeError("A crafting opportunity needs at least one input");
  }

  for (const input of request.inputs) {
    if (!Number.isInteger(input.itemId) || input.itemId <= 0) {
      throw new RangeError("Input item ID must be a positive integer");
    }

    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new RangeError("Input quantity must be a positive integer");
    }
  }

  validateOutputAndCosts(request);
}

function validatePricedRequest(request: PricedCraftingOpportunityRequest): void {
  if (request.reagentCostCopper < 0n) {
    throw new RangeError("Reagent cost cannot be negative");
  }
  validateOutputAndCosts(request);
}

function validateOutputAndCosts(request: Omit<CraftingOpportunityRequest, "inputs">): void {
  if (!Number.isInteger(request.crafts) || request.crafts <= 0) {
    throw new RangeError("Craft count must be a positive integer");
  }

  if (request.outputs.length === 0) {
    throw new RangeError("A crafting opportunity needs at least one output");
  }

  assertBasisPoints(request.auctionHouseCutBasisPoints);

  for (const output of request.outputs) {
    if (!Number.isInteger(output.itemId) || output.itemId <= 0) {
      throw new RangeError("Output item ID must be a positive integer");
    }

    if (output.expectedUnitPriceCopper <= 0n) {
      throw new RangeError("Expected output unit price must be positive");
    }

    assertBasisPoints(output.fillRateBasisPoints);
  }

  const moneyFields = [
    request.fixedCostCopper,
    request.listingDepositCopper,
    request.expectedDepositLossCopper,
    request.cooldownOpportunityCostCopper,
  ];

  if (moneyFields.some((value) => value < 0n)) {
    throw new RangeError("Crafting costs cannot be negative");
  }

  if (request.expectedDepositLossCopper > request.listingDepositCopper) {
    throw new RangeError("Expected deposit loss cannot exceed the listing deposit");
  }
}
