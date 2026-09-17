import { describe, expect, it } from "vitest";

import { getMarketScanFreshness } from "./market-freshness";

const NOW = new Date("2026-09-16T12:00:00.000Z");

describe("market scan freshness", () => {
  it("classifies scans against the intended half-hour collection cadence", () => {
    expect(getMarketScanFreshness(new Date("2026-09-16T11:30:00.000Z"), NOW).state).toBe("fresh");
    expect(getMarketScanFreshness(new Date("2026-09-16T10:30:00.000Z"), NOW).state).toBe("aging");
    expect(getMarketScanFreshness(new Date("2026-09-16T08:59:59.000Z"), NOW).state).toBe("stale");
  });

  it("does not mark a future client timestamp stale", () => {
    expect(getMarketScanFreshness(new Date("2026-09-16T12:01:00.000Z"), NOW).state).toBe("fresh");
  });
});
