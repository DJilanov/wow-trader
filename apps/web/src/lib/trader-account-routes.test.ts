import type * as DatabaseModule from "@wow-trader/db";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owner: null as string | null,
  principal: null as { installationId: string; ownerId: string } | null,
  rate: vi.fn(),
  approve: vi.fn(),
  clear: vi.fn(),
  sync: vi.fn(),
  watches: vi.fn(),
  manual: vi.fn(),
}));
vi.mock("./database", () => ({ getDatabase: () => ({}) }));
vi.mock("./guide-auth", () => ({ guideDiscordId: async () => mocks.owner }));
vi.mock("./trader-account-data", () => ({ loadTraderAccount: vi.fn() }));
vi.mock("./trader-gold-plan", async () => {
  const { z } = await import("zod");
  return { goldPlanRequestSchema: z.object({}), createTraderGoldPlan: vi.fn() };
});
vi.mock("@wow-trader/db", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  authenticateTraderInstallation: async () => mocks.principal,
  consumeTraderRate: mocks.rate,
  approveTraderPairing: mocks.approve,
  clearTraderWatches: mocks.clear,
  synchronizeTraderAccount: mocks.sync,
  listTraderWatches: mocks.watches,
  recordManualTraderEvent: mocks.manual,
}));
import { handleTraderAccountRequest } from "./trader-account-routes";
const owner = "407839813769756693",
  installationId = "440532b2-b976-45df-8cb3-ddfa7a00e81a";
const fingerprint = createHash("sha256")
  .update("trader-account:" + owner)
  .digest("hex");
function request(
  action: string,
  method = "GET",
  value?: unknown,
  extra: Record<string, string> = {},
): Request {
  return new Request("https://kfcguild.online/tools/api/trader/" + action, {
    method,
    headers: {
      origin: "https://kfcguild.online",
      "content-type": "application/json",
      "x-trader-account": fingerprint,
      ...extra,
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner = null;
  mocks.principal = null;
  mocks.watches.mockResolvedValue([]);
  vi.stubEnv("GUIDE_SITE_ORIGIN", "https://kfcguild.online");
  vi.stubEnv("GUIDE_DISCORD_CLIENT_ID", "1554796912673169428");
  vi.stubEnv("GUIDE_DISCORD_CLIENT_SECRET", "test-client");
  vi.stubEnv("GUIDE_AUTH_SECRET", "a".repeat(64));
  vi.stubEnv("GUIDE_DISCORD_BOT_TOKEN", "test-bot");
});
describe("private Trader routes", () => {
  it("requires authentication and disables private response caching", async () => {
    const response = await handleTraderAccountRequest(request("account"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain(owner);
  });
  it("rejects cross-site browser writes and switched-account edits", async () => {
    mocks.owner = owner;
    expect(
      (
        await handleTraderAccountRequest(
          request(
            "pairing/approve",
            "POST",
            { code: "ABCD-2345" },
            { origin: "https://attacker.test" },
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleTraderAccountRequest(
          request(
            "pairing/approve",
            "POST",
            { code: "ABCD-2345" },
            { "x-trader-account": "b".repeat(64) },
          ),
        )
      ).status,
    ).toBe(409);
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it("requires explicit owner approval of the matching browser pairing code", async () => {
    mocks.owner = owner;
    const response = await handleTraderAccountRequest(
      request("pairing/approve", "POST", { code: "ABCD-2345", ownerId: "someone-else" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.approve).toHaveBeenCalledWith({}, owner, "ABCD-2345");
  });
  it("clears watches in one owner-scoped transaction", async () => {
    mocks.owner = owner;
    const response = await handleTraderAccountRequest(request("watches/clear", "POST", {}));
    expect(response.status).toBe(200);
    expect(mocks.clear).toHaveBeenCalledWith({}, owner);
    expect(await response.json()).toEqual({ items: [], accountFingerprint: fingerprint });
  });
  it("uses installation ownership for desktop sync without needing browser cookies", async () => {
    mocks.principal = { installationId, ownerId: owner };
    mocks.sync.mockResolvedValue({
      tradesAccepted: 0,
      watchChangesAccepted: [],
      watches: [],
      generatedAt: new Date().toISOString(),
    });
    const response = await handleTraderAccountRequest(
      request(
        "sync",
        "POST",
        { trades: [], ownerId: "someone-else" },
        { authorization: "Bearer wtc_" + "a".repeat(43), origin: "null" },
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith({}, mocks.principal, { trades: [], watchChanges: [] });
  });
  it("rejects a revoked or unknown installation instead of falling back to a browser session", async () => {
    mocks.owner = owner;
    expect(
      (
        await handleTraderAccountRequest(
          request("sync", "POST", {}, { authorization: "Bearer wtc_" + "a".repeat(43) }),
        )
      ).status,
    ).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("bounds incoming JSON before parsing account changes", async () => {
    mocks.owner = owner;
    expect(
      (
        await handleTraderAccountRequest(
          request("pairing/approve", "POST", { code: "x".repeat(2000) }),
        )
      ).status,
    ).toBe(413);
    expect(mocks.approve).not.toHaveBeenCalled();
  });
});
