import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./guide-auth", () => ({ guideDiscordId: vi.fn() }));
vi.mock("./guide-access-service", () => ({ getGuideDownloadAccess: vi.fn() }));
vi.mock("./guide-support", () => ({ createGuideCheckout: vi.fn() }));
vi.mock("./guide-access-config", async (original) => ({
  ...(await original<typeof Configuration>()),
  readGuideAccessSettings: vi.fn(),
}));
import type * as Configuration from "./guide-access-config";
import { guideDiscordId } from "./guide-auth";
import { readGuideAccessSettings } from "./guide-access-config";
import { getGuideDownloadAccess } from "./guide-access-service";
import { createGuideCheckout } from "./guide-support";
import { POST } from "../app/api/v1/guide-support/route";
function request(origin = "https://kfcguild.online"): Request {
  return new Request("https://kfcguild.online/tools/api/v1/guide-support", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      discordId: "attacker-selected-id",
      amount: 1,
      currency: "EUR",
      approved: true,
    }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readGuideAccessSettings).mockReturnValue({
    ready: true,
    downloadsEnabled: true,
    paymentsEnabled: true,
    origin: "https://kfcguild.online",
    clientId: "",
    clientSecret: "",
    sessionSecret: "",
    botToken: "",
  });
  vi.mocked(guideDiscordId).mockResolvedValue("407839813769756693");
  vi.mocked(getGuideDownloadAccess).mockResolvedValue({
    state: "restricted",
    downloadsEnabled: true,
    paymentsEnabled: true,
    payment: "none",
  });
  vi.mocked(createGuideCheckout).mockResolvedValue(
    "https://sandbox-checkout.revolut.com/payment-link/test",
  );
});
describe("supporter checkout boundary", () => {
  it("rejects cross-site and anonymous checkout before creating orders", async () => {
    expect((await POST(request("https://evil.example"))).status).toBe(403);
    vi.mocked(guideDiscordId).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(createGuideCheckout).not.toHaveBeenCalled();
  });
  it("uses only the authenticated identity and ignores client-provided price and approval", async () => {
    expect((await POST(request())).status).toBe(201);
    expect(createGuideCheckout).toHaveBeenCalledExactlyOnceWith(
      "407839813769756693",
      "https://kfcguild.online",
    );
  });
  it("does not sell again to certified, approved, paid, refunded or unverifiable accounts", async () => {
    for (const access of [
      { state: "certified", payment: "none" },
      { state: "supporter", payment: "approved" },
      { state: "restricted", payment: "paid" },
      { state: "restricted", payment: "revoked" },
      { state: "unavailable", payment: "unavailable" },
    ] as const) {
      vi.mocked(getGuideDownloadAccess).mockResolvedValue({
        ...access,
        downloadsEnabled: true,
        paymentsEnabled: true,
      });
      expect((await POST(request())).status).toBe(409);
    }
    expect(createGuideCheckout).not.toHaveBeenCalled();
  });
});
