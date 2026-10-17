import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { crawlReferences } from "./crawler.js";
import {
  MAX_REQUESTS_PER_WINDOW,
  readRequestPacing,
  REQUEST_WINDOW_MS,
  requestGate,
  validateRequestDelay,
} from "./pacing.js";

describe("durable source request pacing", () => {
  it("rejects out-of-policy delay values", () => {
    for (const value of [0, 2500, 36000, 39999, 120001, Infinity, NaN])
      expect(() => validateRequestDelay(value)).toThrow(/Crawl delay/);
    expect(validateRequestDelay(40000)).toBe(40000);
    expect(validateRequestDelay(60000)).toBe(60000);
  });

  it("spaces robots, permitted redirects and XML while reusing robots across restarts", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-"));
    let clock = Date.now();
    const requested: number[] = [];
    const urls: string[] = [];
    const fetcher: typeof fetch = async (input): Promise<Response> => {
      const url = String(input);
      requested.push(clock);
      urls.push(url);
      if (url.endsWith("robots.txt")) return new Response("User-agent: *\nAllow: /");
      if (url.endsWith("item=25"))
        return new Response(null, { status: 302, headers: { location: "/forever/item=25/test" } });
      return new Response(
        url.endsWith("&xml")
          ? '<wowhead><item id="25"><name>Test</name><class id="7">Material</class><subclass id="0">Other</subclass><link>https://www.wowhead.com/forever/item=25/test</link><htmlTooltip>Material</htmlTooltip></item></wowhead>'
          : '<link rel="canonical" href="https://www.wowhead.com/forever/item=25/test"><h1>Test</h1>',
        { headers: { "content-type": url.endsWith("&xml") ? "application/xml" : "text/html" } },
      );
    };
    const options = {
      directory: root,
      permissionRef: "test",
      fetcher,
      now: (): number => clock,
      random: (): number => 0.5,
      sleep: async (milliseconds: number): Promise<void> => {
        clock += milliseconds;
      },
    };
    try {
      await crawlReferences([{ game: "forever", kind: "item", id: 25 }], options);
      await crawlReferences([{ game: "forever", kind: "item", id: 25 }], options);
      expect(urls).toHaveLength(4);
      expect(urls.filter((url) => url.endsWith("robots.txt"))).toHaveLength(1);
      for (let index = 1; index < requested.length; index++)
        expect(requested[index]! - requested[index - 1]!).toBeGreaterThanOrEqual(81000);
      expect(await readRequestPacing(root)).toMatchObject({
        schema: "wowhead-request-pacing.v2",
        delayMs: 81000,
        lastRequestedAt: clock,
        notBefore: clock + 81000,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("honors longer robots delays and aborts before issuing a request", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-abort-"));
    const controller = new AbortController();
    let clock = Date.parse("2026-10-17T12:00:00Z");
    let requests = 0;
    try {
      await expect(
        crawlReferences([{ game: "forever", kind: "quest", id: 1 }], {
          directory: root,
          permissionRef: "test",
          signal: controller.signal,
          now: (): number => clock,
          random: (): number => 0.5,
          fetcher: async (): Promise<Response> => {
            requests++;
            return new Response("User-agent: *\nAllow: /\nCrawl-delay: 120");
          },
          sleep: async (milliseconds: number): Promise<void> => {
            clock += milliseconds;
            if (milliseconds === 120000) controller.abort(new Error("Operator stop"));
          },
        }),
      ).rejects.toThrow(/Operator stop/);
      expect(requests).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("starts each network timeout after its pacing wait", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-timeout-"));
    let requests = 0;
    vi.useFakeTimers();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((milliseconds: number): AbortSignal => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new Error("Network timeout")), milliseconds);
        return controller.signal;
      });
    try {
      await crawlReferences([{ game: "forever", kind: "quest", id: 1 }], {
        directory: root,
        permissionRef: "test",
        sleep: async (milliseconds: number): Promise<void> => {
          await vi.advanceTimersByTimeAsync(milliseconds);
        },
        fetcher: async (input, init): Promise<Response> => {
          expect(init?.signal?.aborted).toBe(false);
          requests++;
          return String(input).endsWith("robots.txt")
            ? new Response("User-agent: *\nAllow: /")
            : new Response(
                '<link rel="canonical" href="https://www.wowhead.com/forever/quest=1"><h1>Test Quest</h1>',
                { headers: { "content-type": "text/html" } },
              );
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
      const options = {
        directory: root,
        permissionRef: "test",
        now: (): number => clock,
        random: (): number => 0.5,
        sleep: async (milliseconds: number): Promise<void> => {
          clock += milliseconds;
        },
        fetcher: async (): Promise<Response> => {
          requests++;
          return new Response(null, {
            status: 429,
            headers: { "retry-after": dated ? new Date(clock + delay).toUTCString() : "600" },
          });
        },
      };
      try {
        await expect(
          crawlReferences([{ game: "forever", kind: "quest", id: 1 }], options),
        ).rejects.toThrow(/rate limited/);
        expect((await readRequestPacing(root))?.notBefore).toBe(clock + delay);
        await expect(
          crawlReferences([{ game: "forever", kind: "quest", id: 1 }], options),
        ).rejects.toThrow(/cooldown/);
        expect(requests).toBe(1);
        await readFile(join(root, ".request-pacing.json"));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  it("fails closed on malformed pacing and releases the crawl lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-invalid-"));
    let requests = 0;
    try {
      await writeFile(join(root, ".request-pacing.json"), JSON.stringify({ delayMs: 1 }));
      await expect(
        crawlReferences([{ game: "forever", kind: "quest", id: 1 }], {
          directory: root,
          permissionRef: "test",
          fetcher: async (): Promise<Response> => {
            requests++;
            return new Response("");
          },
        }),
      ).rejects.toThrow();
      expect(requests).toBe(0);
      await expect(readFile(join(root, ".crawl.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("an absent Retry-After persists a conservative five-minute pause", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-fallback-"));
    const clock = Date.now();
    try {
      const gate = await requestGate(
        root,
        async (): Promise<void> => {},
        (): number => clock,
      );
      await gate.cooldown(null, 60000);
      expect((await readRequestPacing(root))?.notBefore).toBe(clock + 300000);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("an overflowing numeric Retry-After stays blocked instead of overflowing a timer", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-overflow-"));
    const clock = Date.now();
    try {
      const gate = await requestGate(
        root,
        async (): Promise<void> => {},
        (): number => clock,
      );
      await gate.cooldown("9".repeat(400), 60000);
      expect((await readRequestPacing(root))?.notBefore).toBe(8640000000000000);
      await expect(gate.beforeRequest(60000)).rejects.toThrow(/cooldown/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("jitters each request within the configured bounds", async () => {
    const page =
      '<link rel="canonical" href="https://www.wowhead.com/forever/quest=1"><h1>Test Quest</h1>';
    for (const [sample, expected] of [
      [0, 45000],
      [1, 75000],
    ] as const) {
      const root = await mkdtemp(join(tmpdir(), "reference-pacing-jitter-"));
      let clock = Date.parse("2026-10-17T12:00:00Z");
      const delays: number[] = [];
      const fetcher: typeof fetch = async (input): Promise<Response> =>
        String(input).endsWith("/robots.txt")
          ? new Response("User-agent: *\nAllow: /")
          : new Response(page, { headers: { "content-type": "text/html" } });
      try {
        await crawlReferences([{ game: "forever", kind: "quest", id: 1 }], {
          directory: root,
          permissionRef: "test",
          fetcher,
          delayMinMs: 45000,
          delayMaxMs: 75000,
          random: (): number => sample,
          now: (): number => clock,
          sleep: async (milliseconds: number): Promise<void> => {
            delays.push(milliseconds);
            clock += milliseconds;
          },
        });
        expect(delays).toEqual([expected, expected]);
        expect((await readRequestPacing(root))?.delayMs).toBe(expected);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  it("enforces a durable 50-request rolling-hour cap independently of delay", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-window-"));
    let clock = Date.parse("2026-10-17T12:00:00Z");
    const waits: number[] = [];
    try {
      let gate = await requestGate(
        root,
        async (milliseconds: number): Promise<void> => {
          waits.push(milliseconds);
          clock += milliseconds;
        },
        (): number => clock,
      );
      for (let index = 0; index < MAX_REQUESTS_PER_WINDOW; index++) await gate.beforeRequest(40000);

      gate = await requestGate(
        root,
        async (milliseconds: number): Promise<void> => {
          waits.push(milliseconds);
          clock += milliseconds;
        },
        (): number => clock,
      );
      await gate.beforeRequest(40000);

      expect(waits.slice(0, MAX_REQUESTS_PER_WINDOW)).toEqual(
        Array.from({ length: MAX_REQUESTS_PER_WINDOW }, () => 40000),
      );
      expect(waits.at(-1)).toBe(REQUEST_WINDOW_MS - 49 * 40000);
      const pacing = await readRequestPacing(root);
      expect(pacing?.requestTimestamps).toHaveLength(MAX_REQUESTS_PER_WINDOW);
      expect(pacing?.requestTimestamps.at(-1)).toBe(clock);
      expect(clock - pacing!.requestTimestamps[0]!).toBeLessThan(REQUEST_WINDOW_MS);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrates legacy pacing state without discarding the known request", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-legacy-"));
    const lastRequestedAt = Date.parse("2026-10-17T12:00:00Z");
    try {
      await writeFile(
        join(root, ".request-pacing.json"),
        JSON.stringify({
          schema: "wowhead-request-pacing.v1",
          lastRequestedAt,
          notBefore: lastRequestedAt + 60000,
          delayMs: 60000,
        }),
      );
      expect(await readRequestPacing(root)).toEqual({
        schema: "wowhead-request-pacing.v2",
        lastRequestedAt,
        notBefore: lastRequestedAt + 60000,
        delayMs: 60000,
        requestTimestamps: [lastRequestedAt],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an inverted delay range before making a request", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-pacing-range-"));
    try {
      await expect(
        crawlReferences([{ game: "forever", kind: "quest", id: 1 }], {
          directory: root,
          permissionRef: "test",
          delayMinMs: 75000,
          delayMaxMs: 45000,
          random: (): number => 0.5,
        }),
      ).rejects.toThrow(/range/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
