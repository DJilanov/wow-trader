import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./guide-auth", () => ({ guideDiscordId: vi.fn() }));
vi.mock("./guide-access-policy", () => ({ checkKfcCertifiedRole: vi.fn() }));
vi.mock("./guide-support", () => ({ guideSupportStatus: vi.fn() }));
vi.mock("./guide-revolut", () => ({
  guideRevolutSettings: vi.fn(() => ({ environment: "sandbox", apiKey: "test" })),
}));
vi.mock("./guide-access-config", () => ({ readGuideAccessSettings: vi.fn() }));
import { guideDiscordId } from "./guide-auth";
import { checkKfcCertifiedRole } from "./guide-access-policy";
import { guideSupportStatus } from "./guide-support";
import { readGuideAccessSettings } from "./guide-access-config";
import { getGuideDownloadAccess } from "./guide-access-service";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readGuideAccessSettings).mockReturnValue({
    ready: true,
    downloadsEnabled: true,
    paymentsEnabled: true,
    origin: "https://kfcguild.online",
    clientId: "1554796912673169428",
    clientSecret: "test",
    sessionSecret: "a".repeat(64),
    botToken: "test",
  });
  vi.mocked(guideDiscordId).mockResolvedValue("407839813769756693");
  vi.mocked(checkKfcCertifiedRole).mockResolvedValue("not_certified");
  vi.mocked(guideSupportStatus).mockResolvedValue("none");
});
describe("download entitlement resolution", () => {
  it("limits a private preview to the configured account without bypassing the certified role", async () => {
    const current = vi.mocked(readGuideAccessSettings).getMockImplementation()!();
    vi.mocked(readGuideAccessSettings).mockReturnValue({
      ...current,
      downloadsEnabled: false,
      paymentsEnabled: false,
      previewIds: ["407839813769756693"],
    });
    vi.mocked(checkKfcCertifiedRole).mockResolvedValueOnce("certified");
    expect(await getGuideDownloadAccess()).toMatchObject({
      state: "certified",
      downloadsEnabled: true,
    });
    expect(await getGuideDownloadAccess()).toMatchObject({
      state: "restricted",
      downloadsEnabled: false,
    });
    vi.mocked(guideDiscordId).mockResolvedValue("216148895888048138");
    vi.mocked(checkKfcCertifiedRole).mockResolvedValueOnce("certified");
    expect(await getGuideDownloadAccess()).toMatchObject({
      state: "certified",
      downloadsEnabled: false,
    });
  });
  it("does not confuse sign-in or ordinary server membership with the certified role", async () => {
    vi.mocked(guideDiscordId).mockResolvedValueOnce(null);
    expect((await getGuideDownloadAccess()).state).toBe("signed_out");
    expect(checkKfcCertifiedRole).not.toHaveBeenCalled();
    expect((await getGuideDownloadAccess()).state).toBe("restricted");
  });
  it("checks current roles again on the next request and does not charge certified members", async () => {
    vi.mocked(checkKfcCertifiedRole).mockResolvedValueOnce("certified");
    expect(await getGuideDownloadAccess()).toMatchObject({
      state: "certified",
      paymentsEnabled: false,
    });
    expect(guideSupportStatus).not.toHaveBeenCalled();
    expect((await getGuideDownloadAccess()).state).toBe("restricted");
    expect(checkKfcCertifiedRole).toHaveBeenCalledTimes(2);
  });
  it("requires both verified payment and staff approval and observes revocation immediately", async () => {
    vi.mocked(guideSupportStatus)
      .mockResolvedValueOnce("paid")
      .mockResolvedValueOnce("approved")
      .mockResolvedValueOnce("revoked");
    expect(await getGuideDownloadAccess()).toMatchObject({ state: "restricted", payment: "paid" });
    expect(await getGuideDownloadAccess()).toMatchObject({
      state: "supporter",
      paymentsEnabled: false,
    });
    expect(await getGuideDownloadAccess()).toMatchObject({
      state: "restricted",
      payment: "revoked",
    });
  });
  it("fails closed on membership/payment errors instead of returning an entitlement", async () => {
    vi.mocked(checkKfcCertifiedRole).mockResolvedValueOnce("unavailable");
    expect((await getGuideDownloadAccess()).state).toBe("unavailable");
    vi.mocked(guideSupportStatus).mockRejectedValueOnce(new Error("provider unavailable"));
    expect(await getGuideDownloadAccess()).toMatchObject({
      state: "unavailable",
      paymentsEnabled: false,
    });
  });
});
