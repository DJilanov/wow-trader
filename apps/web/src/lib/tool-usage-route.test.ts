import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ store: vi.fn(), config: vi.fn() }));
vi.mock("./tool-usage-store", () => ({
  storeToolUsage: storage.store,
  toolUsageConfig: storage.config,
}));
const input = {
  schema: "tool-usage.v1",
  build: "release-test",
  action: "talent_build_saved",
  edition: "forever",
  device: "desktop",
};

beforeEach((): void => {
  vi.resetModules();
  storage.store.mockReset().mockResolvedValue(undefined);
  storage.config.mockReset().mockReturnValue({ root: "/test", build: input.build });
});
function request(body: unknown = input, extra: Record<string, string> = {}): Request {
  return new Request("https://kfcguild.online/tools/api/v1/tool-usage", {
    method: "POST",
    headers: { origin: "https://kfcguild.online", "content-type": "application/json", ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("tool action ingestion", (): void => {
  it("stores one strict report and returns no-store/noindex without cookies", async (): Promise<void> => {
    const { POST } = await import("../app/api/v1/tool-usage/route");
    const response = await POST(request());
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(storage.store).toHaveBeenCalledWith(input);
  });

  it("drops disabled and privacy-opted-out requests before persistence", async (): Promise<void> => {
    const { POST } = await import("../app/api/v1/tool-usage/route");
    expect((await POST(request(input, { dnt: "1" }))).status).toBe(204);
    expect((await POST(request(input, { "sec-gpc": "1" }))).status).toBe(204);
    storage.config.mockReturnValue(null);
    expect((await POST(request())).status).toBe(204);
    expect(storage.store).not.toHaveBeenCalled();
  });

  it("rejects foreign origins, raw fields, stale releases, malformed and oversized reports", async (): Promise<void> => {
    const { POST } = await import("../app/api/v1/tool-usage/route");
    expect((await POST(request(input, { origin: "https://foreign.test" }))).status).toBe(403);
    expect(
      (
        await POST(
          new Request("https://foreign.test/tools/api/v1/tool-usage", {
            method: "POST",
            headers: { origin: "https://foreign.test", "content-type": "application/json" },
            body: JSON.stringify(input),
          }),
        )
      ).status,
    ).toBe(403);
    expect((await POST(request(input, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(request(input, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request({ ...input, characterName: "Private" }))).status).toBe(400);
    expect((await POST(request({ ...input, build: "older-release" }))).status).toBe(409);
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request(" ".repeat(1025)))).status).toBe(413);
    expect(storage.store).not.toHaveBeenCalled();
  });

  it("bounds incoming work without creating visitor/IP rate-limit identities", async (): Promise<void> => {
    const { POST } = await import("../app/api/v1/tool-usage/route");
    for (let index = 0; index < 120; index++) expect((await POST(request())).status).toBe(204);
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(storage.store).toHaveBeenCalledTimes(120);
  });

  it("reports unavailable storage instead of pretending a count was saved", async (): Promise<void> => {
    const { POST } = await import("../app/api/v1/tool-usage/route");
    storage.store.mockRejectedValue(new Error("disk full"));
    expect((await POST(request())).status).toBe(503);
  });
});
