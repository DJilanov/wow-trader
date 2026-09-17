const FRESH_SCAN_MAX_AGE_MILLISECONDS = 60 * 60 * 1_000;
const AGING_SCAN_MAX_AGE_MILLISECONDS = 3 * 60 * 60 * 1_000;

export type MarketScanFreshnessState = "fresh" | "aging" | "stale";

export interface MarketScanFreshness {
  readonly state: MarketScanFreshnessState;
  readonly label: string;
  readonly guidance: string;
}

export function getMarketScanFreshness(
  completedAt: Date,
  now: Date = new Date(),
): MarketScanFreshness {
  const ageMilliseconds = Math.max(0, now.getTime() - completedAt.getTime());
  if (ageMilliseconds <= FRESH_SCAN_MAX_AGE_MILLISECONDS) {
    return {
      state: "fresh",
      label: "Fresh scan",
      guidance: "Prices were scanned within the last hour.",
    };
  }
  if (ageMilliseconds <= AGING_SCAN_MAX_AGE_MILLISECONDS) {
    return {
      state: "aging",
      label: "Aging scan",
      guidance: "Prices are over one hour old; verify expensive purchases in game.",
    };
  }
  return {
    state: "stale",
    label: "Stale scan",
    guidance: "Prices are over three hours old and should be treated as reference-only quotes.",
  };
}
