export interface PriceHistoryObservation {
  readonly observedAt: Date;
  readonly priceCopper: bigint;
  readonly availableQuantity: number;
  readonly listingCount: number;
  readonly completeness: number;
}

export type MarketSignalKind =
  "bargain" | "normal" | "rising" | "spike_risk" | "oversupplied" | "falling" | "too_thin";

export type PriceIntelligence =
  | {
      readonly status: "collecting";
      readonly observationCount: number;
      readonly minimumObservationCount: number;
    }
  | {
      readonly status: "available";
      readonly modelVersion: "robust-market-signal-v1";
      readonly signal: MarketSignalKind;
      readonly observationCount: number;
      readonly currentPriceCopper: bigint;
      readonly normalPriceCopper: bigint;
      readonly lowerPriceCopper: bigint;
      readonly upperPriceCopper: bigint;
      readonly differenceBasisPoints: number;
      readonly currentQuantity: number;
      readonly normalQuantity: number;
      readonly supplyRatioBasisPoints: number;
      readonly currentListingCount: number;
      readonly confidenceBasisPoints: number;
      readonly direction: "up" | "flat" | "down";
      readonly generatedAt: Date;
    };

export interface PriceIntelligenceOptions {
  readonly minimumObservationCount?: number;
  readonly maximumObservationCount?: number;
  readonly bucketMilliseconds?: number;
}

const DEFAULT_MINIMUM_OBSERVATIONS = 6;
const DEFAULT_MAXIMUM_OBSERVATIONS = 336;
const DEFAULT_BUCKET_MILLISECONDS = 30 * 60_000;

export function analyzePriceHistory(
  observations: readonly PriceHistoryObservation[],
  options: PriceIntelligenceOptions = {},
): PriceIntelligence {
  const minimumObservationCount = options.minimumObservationCount ?? DEFAULT_MINIMUM_OBSERVATIONS;
  const maximumObservationCount = options.maximumObservationCount ?? DEFAULT_MAXIMUM_OBSERVATIONS;
  const bucketMilliseconds = options.bucketMilliseconds ?? DEFAULT_BUCKET_MILLISECONDS;
  validateOptions(minimumObservationCount, maximumObservationCount, bucketMilliseconds);

  const window = bucketObservations(observations, bucketMilliseconds).slice(
    -maximumObservationCount,
  );
  if (window.length < minimumObservationCount) {
    return {
      status: "collecting",
      observationCount: window.length,
      minimumObservationCount,
    };
  }

  const current = window.at(-1)!;
  const prices = window.map((observation) => observation.priceCopper);
  const quantities = window.map((observation) => observation.availableQuantity);
  const normalPriceCopper = medianBigInt(prices);
  const normalQuantity = medianNumber(quantities);
  const medianAbsoluteDeviation = medianBigInt(
    prices.map((price) => absolute(price - normalPriceCopper)),
  );
  const bandRadius = maximum(1n, maximum(normalPriceCopper / 20n, medianAbsoluteDeviation * 2n));
  const lowerPriceCopper = maximum(1n, normalPriceCopper - bandRadius);
  const upperPriceCopper = normalPriceCopper + bandRadius;
  const differenceBasisPoints = toSafeNumber(
    ((current.priceCopper - normalPriceCopper) * 10_000n) / normalPriceCopper,
  );
  const supplyRatioBasisPoints =
    normalQuantity === 0
      ? 10_000
      : Math.round((current.availableQuantity / normalQuantity) * 10_000);
  const thinSupply =
    current.listingCount <= 2 ||
    current.availableQuantity < Math.max(3, Math.floor(normalQuantity * 0.25));
  const recentPrices = window.slice(-3).map((observation) => observation.priceCopper);
  const direction = detectDirection(recentPrices, bandRadius);
  const signal = classifySignal({
    currentPriceCopper: current.priceCopper,
    lowerPriceCopper,
    upperPriceCopper,
    supplyRatioBasisPoints,
    thinSupply,
    direction,
  });
  const averageCompleteness =
    window.reduce((total, observation) => total + observation.completeness, 0) / window.length;
  const sampleScore = Math.min(5_000, Math.floor((window.length / 48) * 5_000));
  const completenessScore = Math.floor(averageCompleteness * 3_000);
  const breadthScore = Math.min(
    2_000,
    current.listingCount * 200 + Math.min(1_000, current.availableQuantity * 20),
  );

  return {
    status: "available",
    modelVersion: "robust-market-signal-v1",
    signal,
    observationCount: window.length,
    currentPriceCopper: current.priceCopper,
    normalPriceCopper,
    lowerPriceCopper,
    upperPriceCopper,
    differenceBasisPoints,
    currentQuantity: current.availableQuantity,
    normalQuantity,
    supplyRatioBasisPoints,
    currentListingCount: current.listingCount,
    confidenceBasisPoints: Math.min(10_000, sampleScore + completenessScore + breadthScore),
    direction,
    generatedAt: new Date(current.observedAt),
  };
}

export function bucketObservations(
  observations: readonly PriceHistoryObservation[],
  bucketMilliseconds: number = DEFAULT_BUCKET_MILLISECONDS,
): PriceHistoryObservation[] {
  if (!Number.isSafeInteger(bucketMilliseconds) || bucketMilliseconds <= 0) {
    throw new RangeError("bucketMilliseconds must be a positive safe integer");
  }
  const buckets = new Map<number, PriceHistoryObservation>();
  for (const source of observations) {
    const observation = validateObservation(source);
    const bucket = Math.floor(observation.observedAt.getTime() / bucketMilliseconds);
    const existing = buckets.get(bucket);
    if (
      !existing ||
      observation.completeness > existing.completeness ||
      (observation.completeness === existing.completeness &&
        observation.observedAt.getTime() > existing.observedAt.getTime())
    ) {
      buckets.set(bucket, observation);
    }
  }
  return [...buckets.values()].sort(
    (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
  );
}

function classifySignal(input: {
  readonly currentPriceCopper: bigint;
  readonly lowerPriceCopper: bigint;
  readonly upperPriceCopper: bigint;
  readonly supplyRatioBasisPoints: number;
  readonly thinSupply: boolean;
  readonly direction: "up" | "flat" | "down";
}): MarketSignalKind {
  if (input.currentPriceCopper > input.upperPriceCopper) {
    if (input.thinSupply || input.supplyRatioBasisPoints <= 6_000) return "spike_risk";
    if (input.direction === "up") return "rising";
  }
  if (input.currentPriceCopper < input.lowerPriceCopper) {
    if (input.supplyRatioBasisPoints >= 15_000) return "oversupplied";
    if (input.direction === "down") return "falling";
    if (!input.thinSupply) return "bargain";
  }
  return input.thinSupply ? "too_thin" : "normal";
}

function detectDirection(
  recentPrices: readonly bigint[],
  bandRadius: bigint,
): "up" | "flat" | "down" {
  if (recentPrices.length < 3) return "flat";
  const first = recentPrices[0]!;
  const last = recentPrices.at(-1)!;
  const threshold = maximum(1n, bandRadius / 2n);
  const nonDecreasing = recentPrices.every(
    (price, index) => index === 0 || price >= recentPrices[index - 1]!,
  );
  const nonIncreasing = recentPrices.every(
    (price, index) => index === 0 || price <= recentPrices[index - 1]!,
  );
  if (nonDecreasing && last - first > threshold) return "up";
  if (nonIncreasing && first - last > threshold) return "down";
  return "flat";
}

function validateOptions(minimum: number, maximum: number, bucketMilliseconds: number): void {
  if (!Number.isSafeInteger(minimum) || minimum < 2) {
    throw new RangeError("minimumObservationCount must be at least two");
  }
  if (!Number.isSafeInteger(maximum) || maximum < minimum) {
    throw new RangeError("maximumObservationCount must not be below the minimum");
  }
  if (!Number.isSafeInteger(bucketMilliseconds) || bucketMilliseconds <= 0) {
    throw new RangeError("bucketMilliseconds must be a positive safe integer");
  }
}

function validateObservation(observation: PriceHistoryObservation): PriceHistoryObservation {
  const observedAt = new Date(observation.observedAt);
  if (Number.isNaN(observedAt.getTime())) throw new RangeError("Observation date is invalid");
  if (observation.priceCopper <= 0n) throw new RangeError("Observed price must be positive");
  if (!Number.isSafeInteger(observation.availableQuantity) || observation.availableQuantity < 0) {
    throw new RangeError("Observed quantity must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(observation.listingCount) || observation.listingCount < 0) {
    throw new RangeError("Observed listing count must be a non-negative safe integer");
  }
  if (
    !Number.isFinite(observation.completeness) ||
    observation.completeness < 0 ||
    observation.completeness > 1
  ) {
    throw new RangeError("Observation completeness must be between zero and one");
  }
  return { ...observation, observedAt };
}

function medianBigInt(values: readonly bigint[]): bigint {
  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2n;
}

function medianNumber(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function maximum(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function toSafeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError("Calculated basis points exceed range");
  return result;
}
