import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./market-scan-status", () => ({ getLatestMarketScanStatus: vi.fn() }));
import { GET } from "../app/api/v1/market-scan-status/route";
import { getLatestMarketScanStatus } from "./market-scan-status";

const status = vi.mocked(getLatestMarketScanStatus);
beforeEach(() => {
  status.mockReset();
  status.mockResolvedValue(null);
});

describe("faction-specific scan polling", () => {
  it("returns missing Horde data rather than an Alliance scan, without caching", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/v1/market-scan-status?product=wow_classic_beta&auctionHouseType=horde",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ scanId: null, completedAt: null });
    expect(status).toHaveBeenCalledWith({
      clientProduct: "wow_classic_beta",
      auctionHouseType: "horde",
    });
  });

  it("keeps exact region and realm restrictions when supplied", async () => {
    status.mockResolvedValue({
      scanId: "horde-scan",
      completedAt: new Date("2026-10-01T16:00:00Z"),
    });
    const response = await GET(
      new Request(
        "http://localhost/api/v1/market-scan-status?product=wow_classic_beta&auctionHouseType=horde&region=UNKNOWN&realm=ClassicBetaPvP",
      ),
    );
    expect(status).toHaveBeenCalledWith({
      clientProduct: "wow_classic_beta",
      auctionHouseType: "horde",
      region: "UNKNOWN",
      realmId: "ClassicBetaPvP",
    });
    expect(await response.json()).toEqual({
      scanId: "horde-scan",
      completedAt: "2026-10-01T16:00:00.000Z",
    });
  });

  it("rejects incomplete scopes, unsupported products/factions and oversized selectors", async () => {
    for (const query of [
      "product=wow_classic_beta&auctionHouseType=horde&region=UNKNOWN",
      "product=wow_classic_beta&auctionHouseType=horde&realm=ClassicBetaPvP",
      "product=wow_classic_beta&auctionHouseType=horde&region=&realm=",
      "product=invalid&auctionHouseType=horde",
      "product=wow_classic_beta&auctionHouseType=invalid",
      `product=wow_classic_beta&auctionHouseType=horde&region=UNKNOWN&realm=${"a".repeat(129)}`,
    ])
      expect(
        (await GET(new Request(`http://localhost/api/v1/market-scan-status?${query}`))).status,
      ).toBe(400);
    expect(status).not.toHaveBeenCalled();
  });

  it("reports unavailable data without returning or exposing another market", async () => {
    status.mockRejectedValue(new Error("private database detail"));
    const response = await GET(
      new Request(
        "http://localhost/api/v1/market-scan-status?product=wow_classic_beta&auctionHouseType=alliance",
      ),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "data_unavailable" });
  });
});
