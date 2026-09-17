export interface MarketObservation {
  readonly observedAt: Date;
  readonly priceCopper: bigint;
  readonly availableQuantity: number;
  readonly completeness: number;
}

export interface InsufficientForecast {
  readonly status: "insufficient_data";
  readonly observationCount: number;
  readonly minimumObservationCount: number;
}

export interface BaselineForecast {
  readonly status: "available";
  readonly method: "rolling-median-ewma-v1";
  readonly generatedAt: Date;
  readonly horizonMs: number;
  readonly observationCount: number;
  readonly pointPriceCopper: bigint;
  readonly lowerPriceCopper: bigint;
  readonly upperPriceCopper: bigint;
  readonly rollingMedianCopper: bigint;
  readonly medianAbsoluteDeviationCopper: bigint;
  readonly expectedSupply: number;
  readonly direction: "up" | "flat" | "down";
  readonly dataConfidenceBasisPoints: number;
}

export type PriceForecast = InsufficientForecast | BaselineForecast;

export interface ForecastOptions {
  readonly minimumObservationCount?: number;
  readonly maximumObservationCount?: number;
  readonly priceAlphaBasisPoints?: number;
  readonly supplyAlphaBasisPoints?: number;
}

const DEFAULT_MINIMUM_OBSERVATIONS = 6;
const DEFAULT_MAXIMUM_OBSERVATIONS = 48;

export function forecastPrice(
  observations: readonly MarketObservation[],
  horizonMs: number,
  options: ForecastOptions = {},
): PriceForecast {
  const minimumObservationCount = options.minimumObservationCount ?? DEFAULT_MINIMUM_OBSERVATIONS;
  const maximumObservationCount = options.maximumObservationCount ?? DEFAULT_MAXIMUM_OBSERVATIONS;
  const priceAlpha = options.priceAlphaBasisPoints ?? 2_500;
  const supplyAlpha = options.supplyAlphaBasisPoints ?? 2_000;
  validateOptions(
    minimumObservationCount,
    maximumObservationCount,
    priceAlpha,
    supplyAlpha,
    horizonMs,
  );

  const validated = observations.map(validateObservation).sort(compareObservationTimes);
  for (let index = 1; index < validated.length; index += 1) {
    if (validated[index - 1]!.observedAt.getTime() === validated[index]!.observedAt.getTime()) {
      throw new RangeError("Market observations must have unique timestamps");
    }
  }
  const window = validated.slice(-maximumObservationCount);
  if (window.length < minimumObservationCount) {
    return {
      status: "insufficient_data",
      observationCount: window.length,
      minimumObservationCount,
    };
  }

  const prices = window.map((observation) => observation.priceCopper);
  const rollingMedianCopper = median(prices);
  const medianAbsoluteDeviationCopper = median(
    prices.map((price) => absolute(price - rollingMedianCopper)),
  );
  const outlierLimit = maximum(
    1n,
    maximum(medianAbsoluteDeviationCopper * 4n, rollingMedianCopper / 10n),
  );
  const robustPrices = prices.map((price) =>
    clamp(
      price,
      maximum(1n, rollingMedianCopper - outlierLimit),
      rollingMedianCopper + outlierLimit,
    ),
  );
  const pointPriceCopper = exponentialMovingAverage(robustPrices, priceAlpha);
  const expectedSupply = exponentialMovingAverageNumber(
    window.map((observation) => observation.availableQuantity),
    supplyAlpha,
  );
  const intervalRadius = maximum(
    1n,
    maximum(medianAbsoluteDeviationCopper * 2n, rollingMedianCopper / 20n),
  );
  const latestPrice = prices.at(-1)!;
  const directionThreshold = maximum(medianAbsoluteDeviationCopper, latestPrice / 50n);
  const direction =
    pointPriceCopper > latestPrice + directionThreshold
      ? "up"
      : pointPriceCopper + directionThreshold < latestPrice
        ? "down"
        : "flat";

  const averageCompleteness =
    window.reduce((total, observation) => total + observation.completeness, 0) / window.length;
  const sampleScore = Math.min(
    5_000,
    Math.floor((window.length / maximumObservationCount) * 5_000),
  );
  const completenessScore = Math.floor(averageCompleteness * 3_000);

  return {
    status: "available",
    method: "rolling-median-ewma-v1",
    generatedAt: window.at(-1)!.observedAt,
    horizonMs,
    observationCount: window.length,
    pointPriceCopper,
    lowerPriceCopper: maximum(1n, pointPriceCopper - intervalRadius),
    upperPriceCopper: pointPriceCopper + intervalRadius,
    rollingMedianCopper,
    medianAbsoluteDeviationCopper,
    expectedSupply,
    direction,
    dataConfidenceBasisPoints: Math.min(8_000, sampleScore + completenessScore),
  };
}

function validateOptions(
  minimumObservations: number,
  maximumObservations: number,
  priceAlpha: number,
  supplyAlpha: number,
  horizonMs: number,
): void {
  if (!Number.isInteger(minimumObservations) || minimumObservations < 2) {
    throw new RangeError("Minimum observations must be an integer of at least two");
  }
  if (!Number.isInteger(maximumObservations) || maximumObservations < minimumObservations) {
    throw new RangeError("Maximum observations must not be below the minimum");
  }
  if (!Number.isInteger(horizonMs) || horizonMs <= 0) {
    throw new RangeError("Forecast horizon must be a positive integer number of milliseconds");
  }
  for (const alpha of [priceAlpha, supplyAlpha]) {
    if (!Number.isInteger(alpha) || alpha <= 0 || alpha > 10_000) {
      throw new RangeError("EWMA alpha must be an integer from 1 to 10000 basis points");
    }
  }
}

function validateObservation(observation: MarketObservation): MarketObservation {
  if (Number.isNaN(observation.observedAt.getTime()))
    throw new RangeError("Observation date is invalid");
  if (observation.priceCopper <= 0n) throw new RangeError("Observed price must be positive");
  if (!Number.isSafeInteger(observation.availableQuantity) || observation.availableQuantity < 0) {
    throw new RangeError("Observed supply must be a non-negative safe integer");
  }
  if (
    !Number.isFinite(observation.completeness) ||
    observation.completeness < 0 ||
    observation.completeness > 1
  ) {
    throw new RangeError("Observation completeness must be between zero and one");
  }
  return { ...observation, observedAt: new Date(observation.observedAt) };
}

function exponentialMovingAverage(values: readonly bigint[], alphaBasisPoints: number): bigint {
  let average = values[0]!;
  const alpha = BigInt(alphaBasisPoints);
  for (const value of values.slice(1)) {
    average = (value * alpha + average * (10_000n - alpha)) / 10_000n;
  }
  return average;
}

function exponentialMovingAverageNumber(
  values: readonly number[],
  alphaBasisPoints: number,
): number {
  let average = values[0]!;
  const alpha = alphaBasisPoints / 10_000;
  for (const value of values.slice(1)) average = value * alpha + average * (1 - alpha);
  return Math.round(average);
}

function median(values: readonly bigint[]): bigint {
  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2n;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function maximum(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function clamp(value: bigint, minimum: bigint, maximum: bigint): bigint {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

function compareObservationTimes(left: MarketObservation, right: MarketObservation): number {
  return left.observedAt.getTime() - right.observedAt.getTime();
}
