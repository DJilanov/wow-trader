import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { crawlReferences } from "./crawler.js";
import { readRequestPacing, requestGate, validateRequestDelay } from "./pacing.js";

describe("durable source request pacing", () => {
  it("rejects sub-100-per-hour bursts and invalid delays", () => {
    for (const value of [0, 2500, 36000, 39999, 120001, Infinity, NaN])
      expect(() => validateRequestDelay(value)).toThrow(/Crawl delay/);
    expect(validateRequestDelay(40000)).toBe(40000);
    expect(validateRequestDelay(60000)).toBe(60000);
  });

  it("spaces robots, permitted redirects, XML and restarted batches with one gate", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-"));
    let clock = Date.now();
    const requested: number[] = [];
    const urls: string[] = [];
    const fetcher: typeof fetch = async (input): Promise<Response> => {
      const url = String(input);
      requested.push(clock);
      urls.push(url);
      if (url.endsWith("robots.txt")) return new Response("User-agent: *\nAllow: /");
      if (url.endsWith("item=25")) return new Response(null, { status: 302, headers: { location: "/forever/item=25/test" } });
      return new Response(url.endsWith("&xml")
        ? '<wowhead><item id="25"><name>Test</name><class id="7">Material</class><subclass id="0">Other</subclass><link>https://www.wowhead.com/forever/item=25/test</link><htmlTooltip>Material</htmlTooltip></item></wowhead>'
        : '<link rel="canonical" href="https://www.wowhead.com/forever/item=25/test"><h1>Test</h1>',
      { headers: { "content-type": url.endsWith("&xml") ? "application/xml" : "text/html" } });
    };
    const options = { directory: root, permissionRef: "test", fetcher, now: (): number => clock,
      sleep: async (milliseconds: number): Promise<void> => { clock += milliseconds; } };
    try {
      await crawlReferences([{ game: "forever", kind: "item", id: 25 }], options);
      await crawlReferences([{ game: "forever", kind: "item", id: 25 }], options);
      expect(urls).toHaveLength(5);
      expect(urls.filter((url) => url.endsWith("robots.txt"))).toHaveLength(2);
      for (let index = 1; index < requested.length; index++)
        expect(requested[index]! - requested[index - 1]!).toBeGreaterThanOrEqual(60000);
      expect(await readRequestPacing(root)).toMatchObject({ delayMs: 60000, lastRequestedAt: clock, notBefore: clock + 60000 });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("honors longer robots delays and aborts before issuing a request", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-abort-"));
    const controller = new AbortController();
    let requests = 0;
    try {
      await expect(crawlReferences([{ game: "forever", kind: "quest", id: 1 }], {
        directory: root, permissionRef: "test", signal: controller.signal,
        fetcher: async (): Promise<Response> => { requests++; return new Response("User-agent: *\nAllow: /\nCrawl-delay: 120"); },
        sleep: async (milliseconds: number): Promise<void> => { if (milliseconds === 120000) controller.abort(new Error("Operator stop")); },
      })).rejects.toThrow(/Operator stop/);
      expect(requests).toBe(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("starts each network timeout after its pacing wait", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-timeout-"));
    let requests = 0;
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds: number): AbortSignal => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("Network timeout")), milliseconds);
      return controller.signal;
    });
    try {
      await crawlReferences([{ game: "forever", kind: "quest", id: 1 }], {
        directory: root, permissionRef: "test",
        sleep: async (milliseconds: number): Promise<void> => { await vi.advanceTimersByTimeAsync(milliseconds); },
        fetcher: async (input, init): Promise<Response> => {
          expect(init?.signal?.aborted).toBe(false);
          requests++;
          return String(input).endsWith("robots.txt")
            ? new Response("User-agent: *\nAllow: /")
            : new Response('<link rel="canonical" href="https://www.wowhead.com/forever/quest=1"><h1>Test Quest</h1>', { headers: { "content-type": "text/html" } });
        },
      });
      expect(requests).toBe(2);
      expect(timeout).toHaveBeenCalledTimes(2);
      expect(timeout).toHaveBeenNthCalledWith(1, 20000);
      expect(timeout).toHaveBeenNthCalledWith(2, 20000);
    } finally {
      timeout.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves long numeric and dated cooldowns across restarts without refetching robots", async () => {
    for (const dated of [false, true]) {
      const root = await mkdtemp(join(tmpdir(), "reference-pacing-retry-"));
      let clock = Date.parse("2026-10-07T18:00:00Z");
      let requests = 0;
      const delay = 600000;
      const options = { directory: root, permissionRef: "test", now: (): number => clock,
        sleep: async (milliseconds: number): Promise<void> => { clock += milliseconds; },
        fetcher: async (): Promise<Response> => { requests++; return new Response(null, { status: 429, headers: { "retry-after": dated ? new Date(clock + delay).toUTCString() : "600" } }); } };
      try {
        await expect(crawlReferences([{ game: "forever", kind: "quest", id: 1 }], options)).rejects.toThrow(/rate limited/);
        expect((await readRequestPacing(root))?.notBefore).toBe(clock + delay);
        await expect(crawlReferences([{ game: "forever", kind: "quest", id: 1 }], options)).rejects.toThrow(/cooldown/);
        expect(requests).toBe(1);
        await readFile(join(root, ".request-pacing.json"));
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });

  it("fails closed on malformed pacing and releases the crawl lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-invalid-"));
    let requests = 0;
    try {
      await writeFile(join(root, ".request-pacing.json"), JSON.stringify({ delayMs: 1 }));
      await expect(crawlReferences([{ game: "forever", kind: "quest", id: 1 }], {
        directory: root, permissionRef: "test", fetcher: async (): Promise<Response> => { requests++; return new Response(""); },
      })).rejects.toThrow();
      expect(requests).toBe(0);
      await expect(readFile(join(root, ".crawl.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("an absent Retry-After persists a conservative five-minute pause", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-fallback-"));
    const clock = Date.now();
    try {
      const gate = await requestGate(root, async (): Promise<void> => {}, (): number => clock);
      await gate.cooldown(null, 60000);
      expect((await readRequestPacing(root))?.notBefore).toBe(clock + 300000);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("an overflowing numeric Retry-After stays blocked instead of overflowing a timer", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-overflow-"));
    const clock = Date.now();
    try {
      const gate = await requestGate(root, async (): Promise<void> => {}, (): number => clock);
      await gate.cooldown("9".repeat(400), 60000);
      expect((await readRequestPacing(root))?.notBefore).toBe(8640000000000000);
      await expect(gate.beforeRequest(60000)).rejects.toThrow(/cooldown/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
