import { describe, expect, it } from "vitest";

import { hasNewerMarketScan } from "./market-scan-refresh";

describe("hasNewerMarketScan", () => {
  it("requests another refresh while the rendered scan is older", () => {
    expect(hasNewerMarketScan("2026-09-27T07:31:05.000Z", "2026-09-27T05:06:21.000Z")).toBe(true);
  });

  it("stops refreshing once the rendered scan catches up", () => {
    expect(hasNewerMarketScan("2026-09-27T07:31:05.000Z", "2026-09-27T07:31:05.000Z")).toBe(false);
  });

  it("does not refresh for malformed timestamps", () => {
    expect(hasNewerMarketScan("not-a-date", "2026-09-27T07:31:05.000Z")).toBe(false);
    expect(hasNewerMarketScan("2026-09-27T07:31:05.000Z", "not-a-date")).toBe(false);
  });
});
