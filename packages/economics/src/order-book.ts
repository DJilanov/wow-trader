export interface PriceLevel {
  readonly unitPriceCopper: bigint;
  readonly quantity: number;
}

export interface ConsumedPriceLevel extends PriceLevel {
  readonly quantityTaken: number;
  readonly costCopper: bigint;
}

export interface OrderBookConsumption {
  readonly requestedQuantity: number;
  readonly fulfilledQuantity: number;
  readonly unfilledQuantity: number;
  readonly totalCostCopper: bigint;
  readonly averageUnitPriceCopper: bigint | null;
  readonly highestUnitPriceCopper: bigint | null;
  readonly consumedLevels: readonly ConsumedPriceLevel[];
}

export function consumeOrderBook(
  levels: readonly PriceLevel[],
  requestedQuantity: number,
): OrderBookConsumption {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new RangeError("Requested quantity must be a positive integer");
  }

  const sortedLevels = levels.map(validateLevel).sort((left, right) => {
    if (left.unitPriceCopper < right.unitPriceCopper) return -1;
    if (left.unitPriceCopper > right.unitPriceCopper) return 1;
    return 0;
  });

  let remaining = requestedQuantity;
  let totalCostCopper = 0n;
  let highestUnitPriceCopper: bigint | null = null;
  const consumedLevels: ConsumedPriceLevel[] = [];

  for (const level of sortedLevels) {
    if (remaining === 0) break;

    const quantityTaken = Math.min(level.quantity, remaining);
    const costCopper = level.unitPriceCopper * BigInt(quantityTaken);

    consumedLevels.push({ ...level, quantityTaken, costCopper });
    totalCostCopper += costCopper;
    highestUnitPriceCopper = level.unitPriceCopper;
    remaining -= quantityTaken;
  }

  const fulfilledQuantity = requestedQuantity - remaining;

  return {
    requestedQuantity,
    fulfilledQuantity,
    unfilledQuantity: remaining,
    totalCostCopper,
    averageUnitPriceCopper:
      fulfilledQuantity === 0 ? null : totalCostCopper / BigInt(fulfilledQuantity),
    highestUnitPriceCopper,
    consumedLevels,
  };
}

function validateLevel(level: PriceLevel): PriceLevel {
  if (level.unitPriceCopper <= 0n) {
    throw new RangeError("Order-book price must be positive");
  }

  if (!Number.isInteger(level.quantity) || level.quantity <= 0) {
    throw new RangeError("Order-book quantity must be a positive integer");
  }

  return { ...level };
}
