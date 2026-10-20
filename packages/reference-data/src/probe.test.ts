import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CRAWLER_AGENT } from "./identity.js";
import { readRequestPacing, SourceCooldownError } from "./pacing.js";
import { probeSource, probeUrl } from "./probe.js";

const DENIAL =
  "<html><head><title>ERROR: The request could not be satisfied</title></head>" +
  "<body><h1>403 ERROR</h1>Request blocked</body></html>";
const QUEST = "https://www.wowhead.com/forever/quest=581/hunt-for-yenniku";

describe("source access probe", () => {
  it("records a CloudFront denial as evidence under the declared crawler identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "source-probe-"));
    let clock = Date.UTC(2026, 9, 17, 6, 21, 29);
    const seen: { url: string; init?: RequestInit }[] = [];
    try {
      const evidence = await probeSource({
        directory: root,
        url: QUEST,
        now: (): number => clock,
        sleep: async (milliseconds: number): Promise<void> => {
          clock += milliseconds;
        },
        fetcher: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
          seen.push({ url: String(input), ...(init ? { init } : {}) });
          return new Response(DENIAL, {
            status: 403,
            headers: {
              server: "CloudFront",
              "content-type": "text/html",
              "x-cache": "Error from cloudfront",
              "x-amz-cf-pop": "SOF50-P1",
            },
          });
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]!.url).toBe(QUEST);
      expect((seen[0]!.init?.headers as Record<string, string>)["user-agent"]).toBe(CRAWLER_AGENT);
      expect(seen[0]!.init?.redirect).toBe("manual");
      expect(evidence).toMatchObject({
        schema: "source-access-probe.v1",
        url: QUEST,
        userAgent: CRAWLER_AGENT,
        status: 403,
        ok: false,
        redirectedTo: null,
        bodyBytes: Buffer.byteLength(DENIAL),
        pageTitle: "ERROR: The request could not be satisfied",
        challengeMarkers: ["cloudfront_access_denied"],
      });
      expect(evidence.headers).toMatchObject({
        server: "CloudFront",
        "x-cache": "Error from cloudfront",
        "x-amz-cf-pop": "SOF50-P1",
      });
      expect(evidence.bodySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await readRequestPacing(root)).toMatchObject({
        schema: "wowhead-request-pacing.v2",
        delayMs: 72000,
        lastRequestedAt: clock,
        notBefore: clock + 72000,
        requestTimestamps: [clock],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to probe while a durable source cooldown is active", async () => {
    const root = await mkdtemp(join(tmpdir(), "source-probe-cooldown-"));
    const clock = Date.UTC(2026, 9, 17, 6, 21, 29);
    let requests = 0;
    try {
      await writeFile(
        join(root, ".request-pacing.json"),
        JSON.stringify({
          schema: "wowhead-request-pacing.v1",
          lastRequestedAt: clock,
          notBefore: clock + 6 * 3600000,
          delayMs: 60000,
        }),
      );
      await expect(
        probeSource({
          directory: root,
          url: QUEST,
          now: (): number => clock,
          sleep: async (): Promise<void> => undefined,
          fetcher: async (): Promise<Response> => {
            requests++;
            return new Response(DENIAL, { status: 403 });
          },
        }),
      ).rejects.toBeInstanceOf(SourceCooldownError);
      expect(requests).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("only accepts exact public entity paths or robots.txt", () => {
    expect(probeUrl(QUEST)).toBe(QUEST);
    expect(probeUrl("https://www.wowhead.com/forever/quest=581")).toBe(
      "https://www.wowhead.com/forever/quest=581",
    );
    expect(probeUrl("https://www.wowhead.com/robots.txt")).toBe(
      "https://www.wowhead.com/robots.txt",
    );
    expect(probeUrl("https://www.wowhead.com/forever/spell=3275/linen-bandage")).toBe(
      "https://www.wowhead.com/forever/spell=3275/linen-bandage",
    );
    for (const value of [
      "https://www.wowhead.com/forever/quest=581?xml",
      "https://www.wowhead.com/forever/quests?notFound=581",
      "https://www.wowhead.com/forever/npc=1",
      "https://example.com/forever/quest=581",
      "http://www.wowhead.com/forever/quest=581",
      "not a url",
    ])
      expect(() => probeUrl(value)).toThrow(/Probe URL/);
  });
});
