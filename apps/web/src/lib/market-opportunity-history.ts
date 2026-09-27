import type { MarketPriceSignal } from "./market-price-signal";

export interface MarketOpportunityHistoryPoint {
  readonly observedAt: string;
  readonly unitAskCopper: string;
  readonly grossRevenueCopper: string | null;
  readonly netRevenueCopper: string | null;
  readonly reagentCostCopper: string | null;
  readonly profitCopper: string | null;
  readonly availableQuantity: number;
  readonly listingCount: number;
  readonly missingInputCount: number;
  readonly missingOutputCount: number;
}

export interface MarketOpportunityHistory {
  readonly modelVersion: "indicative-p10-craft-history-v1";
  readonly auctionHouseCutBasisPoints: number;
  readonly primaryOutputName: string;
  readonly points: readonly MarketOpportunityHistoryPoint[];
}

interface HistoricalInput {
  readonly itemId: number;
  readonly quantity: number;
}

interface HistoricalOutput {
  readonly itemId: number;
  readonly name: string;
  readonly expectedQuantity: {
    readonly numerator: bigint;
    readonly denominator: bigint;
  };
}

export function createMarketOpportunityHistory(input: {
  readonly auctionHouseCutBasisPoints: number;
  readonly inputs: readonly HistoricalInput[];
  readonly outputs: readonly HistoricalOutput[];
  readonly primaryOutputItemId: number;
  readonly signalsByItem: ReadonlyMap<number, MarketPriceSignal>;
}): MarketOpportunityHistory | null {
  if (
    !Number.isSafeInteger(input.auctionHouseCutBasisPoints) ||
    input.auctionHouseCutBasisPoints < 0 ||
    input.auctionHouseCutBasisPoints > 10_000
  ) {
    throw new RangeError("Auction House cut must be valid basis points");
  }

  const primaryOutput = input.outputs.find((output) => output.itemId === input.primaryOutputItemId);
  const primarySignal = input.signalsByItem.get(input.primaryOutputItemId);
  if (!primaryOutput || !primarySignal || primarySignal.history.length === 0) return null;

  const observationsByItem = new Map(
    [...input.inputs, ...input.outputs].map((item) => [
      item.itemId,
      new Map(
        (input.signalsByItem.get(item.itemId)?.history ?? []).map((point) => [
          point.observedAt,
          point,
        ]),
      ),
    ]),
  );
  const cutBasisPoints = BigInt(input.auctionHouseCutBasisPoints);
  const points = primarySignal.history.map((primaryPoint): MarketOpportunityHistoryPoint => {
    const outputPrices = input.outputs.map((output) => {
      const point = observationsByItem.get(output.itemId)?.get(primaryPoint.observedAt);
      return { output, point: point && point.listingCount >= 3 ? point : undefined };
    });
    const inputPrices = input.inputs.map((recipeInput) => {
      const point = observationsByItem.get(recipeInput.itemId)?.get(primaryPoint.observedAt);
      return {
        input: recipeInput,
        point: point && point.availableQuantity >= recipeInput.quantity ? point : undefined,
      };
    });
    const missingOutputCount = outputPrices.filter(({ point }) => !point).length;
    const missingInputCount = inputPrices.filter(({ point }) => !point).length;
    const grossRevenueCopper =
      missingOutputCount === 0
        ? outputPrices.reduce(
            (total, { output, point }) =>
              total +
              multiplyFractionFloor(
                BigInt(point!.priceCopper),
                output.expectedQuantity.numerator,
                output.expectedQuantity.denominator,
              ),
            0n,
          )
        : null;
    const reagentCostCopper =
      missingInputCount === 0
        ? inputPrices.reduce(
            (total, { input: recipeInput, point }) =>
              total + BigInt(point!.priceCopper) * BigInt(recipeInput.quantity),
            0n,
          )
        : null;
    const auctionHouseCutCopper =
      grossRevenueCopper === null ? null : (grossRevenueCopper * cutBasisPoints) / 10_000n;
    const netRevenueCopper =
      grossRevenueCopper === null || auctionHouseCutCopper === null
        ? null
        : grossRevenueCopper - auctionHouseCutCopper;
    const profitCopper =
      netRevenueCopper === null || reagentCostCopper === null
        ? null
        : netRevenueCopper - reagentCostCopper;

    return {
      observedAt: primaryPoint.observedAt,
      unitAskCopper: primaryPoint.priceCopper,
      grossRevenueCopper: grossRevenueCopper?.toString() ?? null,
      netRevenueCopper: netRevenueCopper?.toString() ?? null,
      reagentCostCopper: reagentCostCopper?.toString() ?? null,
      profitCopper: profitCopper?.toString() ?? null,
      availableQuantity: primaryPoint.availableQuantity,
      listingCount: primaryPoint.listingCount,
      missingInputCount,
      missingOutputCount,
    };
  });

  return {
    modelVersion: "indicative-p10-craft-history-v1",
    auctionHouseCutBasisPoints: input.auctionHouseCutBasisPoints,
    primaryOutputName: primaryOutput.name,
    points,
  };
}

function multiplyFractionFloor(value: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("Expected output denominator must be positive");
  return (value * numerator) / denominator;
}
