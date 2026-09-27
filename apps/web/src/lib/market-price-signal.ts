import {
  analyzePriceHistory,
  bucketObservations,
  summarizeOrderBook,
  type MarketSignalKind,
} from "@wow-trader/market";

import { formatCopper, formatPercentBasisPoints } from "./format";

export interface MarketPriceObservationInput {
  readonly observedAt: Date;
  readonly completeness: number;
  readonly levels: readonly {
    readonly unitPriceCopper: bigint;
    readonly quantity: number;
    readonly listingCount: number;
  }[];
}

type MarketPriceSignalLabel =
  "Bargain" | "Normal" | "Rising" | "Spike risk" | "Oversupplied" | "Falling" | "Too thin";

export type MarketPriceSignal =
  | {
      readonly status: "collecting";
      readonly observationCount: number;
      readonly minimumObservationCount: number;
      readonly label: string;
      readonly history: readonly MarketPriceHistoryPoint[];
    }
  | {
      readonly status: "available";
      readonly observationCount: number;
      readonly kind: MarketSignalKind;
      readonly label: MarketPriceSignalLabel;
      readonly direction: "up" | "flat" | "down";
      readonly currentPrice: string;
      readonly normalPrice: string;
      readonly normalRange: string;
      readonly normalPriceCopper: string;
      readonly lowerPriceCopper: string;
      readonly upperPriceCopper: string;
      readonly differenceFromNormal: string;
      readonly confidence: string;
      readonly currentQuantity: number;
      readonly normalQuantity: number;
      readonly supplyDifference: string;
      readonly currentListingCount: number;
      readonly modelVersion: string;
      readonly history: readonly MarketPriceHistoryPoint[];
    };

export interface MarketPriceHistoryPoint {
  readonly observedAt: string;
  readonly priceCopper: string;
  readonly availableQuantity: number;
  readonly listingCount: number;
}

export function createMarketPriceSignal(
  observations: readonly MarketPriceObservationInput[],
): MarketPriceSignal {
  const byTimestamp = new Map(
    observations.map((observation) => [observation.observedAt.getTime(), observation]),
  );
  const summarized = [...byTimestamp.values()]
    .filter((observation) => observation.levels.length > 0)
    .map((observation) => ({
      ...observation,
      summary: summarizeOrderBook(observation.levels),
    }))
    .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime());
  const historyObservations = bucketObservations(
    summarized.map((observation) => ({
      observedAt: observation.observedAt,
      priceCopper: observation.summary.weightedTenthPercentilePriceCopper,
      availableQuantity: observation.summary.availableQuantity,
      listingCount: observation.summary.listingCount,
      completeness: observation.completeness,
    })),
  );
  const history = historyObservations.map((observation) => ({
    observedAt: observation.observedAt.toISOString(),
    priceCopper: String(observation.priceCopper),
    availableQuantity: observation.availableQuantity,
    listingCount: observation.listingCount,
  }));
  const intelligence = analyzePriceHistory(historyObservations, { maximumObservationCount: 48 });
  if (intelligence.status === "collecting") {
    return {
      status: "collecting",
      observationCount: intelligence.observationCount,
      minimumObservationCount: intelligence.minimumObservationCount,
      label: `Collecting ${intelligence.observationCount}/${intelligence.minimumObservationCount}`,
      history,
    };
  }

  return {
    status: "available",
    observationCount: intelligence.observationCount,
    kind: intelligence.signal,
    label: signalLabel(intelligence.signal),
    direction: intelligence.direction,
    currentPrice: formatCopper(intelligence.currentPriceCopper),
    normalPrice: formatCopper(intelligence.normalPriceCopper),
    normalRange: `${formatCopper(intelligence.lowerPriceCopper)}–${formatCopper(intelligence.upperPriceCopper)}`,
    normalPriceCopper: String(intelligence.normalPriceCopper),
    lowerPriceCopper: String(intelligence.lowerPriceCopper),
    upperPriceCopper: String(intelligence.upperPriceCopper),
    differenceFromNormal: formatSignedPercent(BigInt(intelligence.differenceBasisPoints)),
    confidence: formatPercentBasisPoints(BigInt(intelligence.confidenceBasisPoints)),
    currentQuantity: intelligence.currentQuantity,
    normalQuantity: intelligence.normalQuantity,
    supplyDifference: formatSignedPercent(BigInt(intelligence.supplyRatioBasisPoints - 10_000)),
    currentListingCount: intelligence.currentListingCount,
    modelVersion: intelligence.modelVersion,
    history,
  };
}

function signalLabel(kind: MarketSignalKind): MarketPriceSignalLabel {
  const labels: Record<MarketSignalKind, MarketPriceSignalLabel> = {
    bargain: "Bargain",
    normal: "Normal",
    rising: "Rising",
    spike_risk: "Spike risk",
    oversupplied: "Oversupplied",
    falling: "Falling",
    too_thin: "Too thin",
  };
  return labels[kind] ?? "Normal";
}

function formatSignedPercent(value: bigint): string {
  const prefix = value > 0n ? "+" : "";
  return `${prefix}${formatPercentBasisPoints(value)}`;
}
