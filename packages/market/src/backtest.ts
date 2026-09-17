import { forecastPrice, type MarketObservation } from "./forecast.js";

export interface BaselineBacktest {
  readonly predictionCount: number;
  readonly meanAbsoluteErrorCopper: bigint;
  readonly naiveMeanAbsoluteErrorCopper: bigint;
  readonly directionAccuracyBasisPoints: number;
  readonly beatsNaiveAbsoluteError: boolean;
}

export function backtestPriceBaseline(
  observations: readonly MarketObservation[],
  minimumTrainingObservations = 6,
): BaselineBacktest | null {
  if (!Number.isInteger(minimumTrainingObservations) || minimumTrainingObservations < 2) {
    throw new RangeError("Minimum training observations must be an integer of at least two");
  }
  const sorted = [...observations].sort(
    (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
  );
  if (sorted.length <= minimumTrainingObservations) return null;

  let absoluteError = 0n;
  let naiveAbsoluteError = 0n;
  let correctDirections = 0;
  let predictions = 0;
  for (let index = minimumTrainingObservations; index < sorted.length; index += 1) {
    const actual = sorted[index]!;
    const previous = sorted[index - 1]!;
    const horizonMs = actual.observedAt.getTime() - previous.observedAt.getTime();
    if (horizonMs <= 0)
      throw new RangeError("Backtest observations need unique ascending timestamps");

    const forecast = forecastPrice(sorted.slice(0, index), horizonMs, {
      minimumObservationCount: minimumTrainingObservations,
    });
    if (forecast.status !== "available") continue;
    absoluteError += absolute(forecast.pointPriceCopper - actual.priceCopper);
    naiveAbsoluteError += absolute(previous.priceCopper - actual.priceCopper);
    if (
      direction(forecast.pointPriceCopper, previous.priceCopper) ===
      direction(actual.priceCopper, previous.priceCopper)
    ) {
      correctDirections += 1;
    }
    predictions += 1;
  }
  if (predictions === 0) return null;

  const meanAbsoluteErrorCopper = absoluteError / BigInt(predictions);
  const naiveMeanAbsoluteErrorCopper = naiveAbsoluteError / BigInt(predictions);
  return {
    predictionCount: predictions,
    meanAbsoluteErrorCopper,
    naiveMeanAbsoluteErrorCopper,
    directionAccuracyBasisPoints: Math.floor((correctDirections / predictions) * 10_000),
    beatsNaiveAbsoluteError: meanAbsoluteErrorCopper < naiveMeanAbsoluteErrorCopper,
  };
}

function direction(value: bigint, reference: bigint): "up" | "flat" | "down" {
  if (value > reference) return "up";
  if (value < reference) return "down";
  return "flat";
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}
