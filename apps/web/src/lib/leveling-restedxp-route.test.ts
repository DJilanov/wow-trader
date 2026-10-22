import { beforeEach, describe, expect, it, vi } from "vitest";
import { restedXpTestFixture } from "./leveling-restedxp.test-fixture";
vi.mock("./leveling-restedxp-export", () => ({
  buildCampaignReviewExport: vi.fn(),
  campaignReviewAddonZip: vi.fn(),
  restedXpReviewExportAvailable: vi.fn(),
}));
import {
  buildCampaignReviewExport,
  campaignReviewAddonZip,
  restedXpReviewExportAvailable,
} from "./leveling-restedxp-export";
import { POST } from "../app/api/v1/leveling-restedxp-export/route";

function request(
  body: unknown = restedXpTestFixture().input,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost:3000/api/v1/leveling-restedxp-export", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restedXpReviewExportAvailable).mockReturnValue(true);
  const fixture = restedXpTestFixture();
  vi.mocked(buildCampaignReviewExport).mockResolvedValue({
    artifact: fixture.artifact,
    documents: fixture.documents,
    identity: "a".repeat(64),
  });
  vi.mocked(campaignReviewAddonZip).mockReturnValue(new Uint8Array([80, 75, 3, 4]));
});
describe("review export request boundary", () => {
  it("refuses disabled access before loading any guide content", async () => {
    vi.mocked(restedXpReviewExportAvailable).mockReturnValue(false);
    expect((await POST(request())).status).toBe(404);
    expect(buildCampaignReviewExport).not.toHaveBeenCalled();
  });
  it("does not expose review content on a LAN or public host when the flag is enabled", async () => {
    for (const origin of ["http://192.168.1.20:3334", "https://kfcguild.online"]) {
      const response = await POST(
        new Request(origin + "/tools/api/v1/leveling-restedxp-export", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(restedXpTestFixture().input),
        }),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "export_disabled" });
    }
    expect(buildCampaignReviewExport).not.toHaveBeenCalled();
  });
  it("only accepts same-site JSON without account or personal progress fields", async () => {
    for (const headers of [
      { origin: "" },
      { origin: "https://attacker.example" },
      { "sec-fetch-site": "cross-site" },
    ])
      expect((await POST(request(undefined, headers))).status).toBe(403);
    expect((await POST(request(undefined, { "content-type": "text/plain" }))).status).toBe(415);
    for (const extra of [
      { battleTag: "NeverSend#1234" },
      { account: "NeverSend#1234" },
      { members: [] },
    ])
      expect((await POST(request({ ...restedXpTestFixture().input, ...extra }))).status).toBe(400);
    expect(buildCampaignReviewExport).not.toHaveBeenCalled();
  });
  it("bounds streamed input and rejects malformed requests and invalid race/class pairs", async () => {
    expect((await POST(request({ value: "a".repeat(100001) }))).status).toBe(413);
    expect(
      (await POST(request({ ...restedXpTestFixture().input, race: "gnome", classSlug: "druid" })))
        .status,
    ).toBe(400);
    const malformed = new Request("http://localhost:3000/api/v1/leveling-restedxp-export", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: "{bad",
    });
    expect((await POST(malformed)).status).toBe(400);
    expect(buildCampaignReviewExport).not.toHaveBeenCalled();
  });
  it("returns non-cached review documents or a named binary ZIP", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(restedXpTestFixture().documents);
    const zip = await POST(request({ ...restedXpTestFixture().input, format: "addon" }));
    expect(zip.headers.get("content-type")).toBe("application/zip");
    expect(zip.headers.get("content-disposition")).toMatch(
      /kfc-forever-human-warrior-[a-f0-9]+\.zip/,
    );
    expect([...new Uint8Array(await zip.arrayBuffer())]).toEqual([80, 75, 3, 4]);
  });
  it("reports stale content and sanitized failures and releases the concurrency guard", async () => {
    vi.mocked(buildCampaignReviewExport).mockResolvedValueOnce({ error: "route_changed" });
    expect((await POST(request())).status).toBe(409);
    vi.mocked(buildCampaignReviewExport).mockRejectedValueOnce(
      new Error("private server paths or credentials"),
    );
    const failure = await POST(request());
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ error: "export_unavailable" });
    expect((await POST(request())).status).toBe(200);
  });
  it("bounds expensive concurrent exports without starting a second compilation", async () => {
    const fixture = restedXpTestFixture();
    let release!: (result: Awaited<ReturnType<typeof buildCampaignReviewExport>>) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.mocked(buildCampaignReviewExport).mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const first = POST(request());
    await started;
    const second = await POST(request());
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("1");
    expect(buildCampaignReviewExport).toHaveBeenCalledTimes(1);
    release({ artifact: fixture.artifact, documents: fixture.documents, identity: "a".repeat(64) });
    expect((await first).status).toBe(200);
  });
});
