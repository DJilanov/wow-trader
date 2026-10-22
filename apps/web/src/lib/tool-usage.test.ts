import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addToolUsage,
  toolUsageAggregateSchema,
  toolUsageEventSchema,
} from "./tool-usage-contract.mjs";
import type { ToolUsageEvent } from "./tool-usage";
import type * as ToolUsageModule from "./tool-usage";

const input = {
  schema: "tool-usage.v1",
  build: "release-test",
  action: "talent_build_saved",
  edition: "forever",
  device: "mobile",
} satisfies ToolUsageEvent;

afterEach((): void => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("privacy-minimal tool action contract", (): void => {
  it("admits implemented actions only, with no visitor, URL, character or item payload", (): void => {
    expect(toolUsageEventSchema.safeParse(input).success).toBe(true);
    for (const extra of [
      { userId: "407839813769756693" },
      { ip: "127.0.0.1" },
      { sessionId: "x" },
      { itemId: 2447 },
      { name: "Tester" },
      { url: "/tools?setup=private" },
    ])
      expect(toolUsageEventSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    expect(toolUsageEventSchema.safeParse({ ...input, action: "page_view" }).success).toBe(false);
    expect(toolUsageEventSchema.safeParse({ ...input, edition: "tbc" }).success).toBe(false);
    expect(
      toolUsageEventSchema.safeParse({ ...input, edition: "tbc", action: "market_item_watched" })
        .success,
    ).toBe(true);
  });

  it("folds events into bounded daily counts without retaining individual timestamps", (): void => {
    const now = new Date("2026-10-22T12:34:56.000Z");
    const first = addToolUsage(null, input, now);
    const twice = addToolUsage(first, input, now);
    expect(Object.values(twice.groups)).toEqual([
      {
        build: input.build,
        action: input.action,
        edition: input.edition,
        device: input.device,
        count: 2,
      },
    ]);
    expect(twice.updatedAt).toBe("2026-10-22T12:34:00.000Z");
    expect(() => addToolUsage(twice, input, new Date("2026-10-23T00:00:00Z"))).toThrow(
      /date mismatch/,
    );
    const changed = structuredClone(twice);
    changed.groups["untrusted"] = Object.values(changed.groups)[0]!;
    expect(toolUsageAggregateSchema.safeParse(changed).success).toBe(false);
    const saturated = structuredClone(twice);
    Object.values(saturated.groups)[0]!.count = 1_000_000;
    expect(() => addToolUsage(saturated, input, now)).toThrow();
  });
});

async function browser(
  privacy: { doNotTrack?: string; globalPrivacyControl?: boolean } = {},
): Promise<{
  host: EventTarget & { location: URL; innerWidth: number };
  fetch: ReturnType<typeof vi.fn>;
  module: typeof ToolUsageModule;
}> {
  vi.resetModules();
  const host = Object.assign(new EventTarget(), {
    location: new URL("http://localhost:19410"),
    innerWidth: 390,
  });
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("window", host);
  vi.stubGlobal("document", { documentElement: { dataset: { toolUsageBuild: "release-test" } } });
  vi.stubGlobal("navigator", privacy);
  vi.stubGlobal("fetch", fetch);
  return { host, fetch, module: await import("./tool-usage") };
}

describe("tool action browser boundary", (): void => {
  it("sends anonymous successful actions without cookies/referrers and suppresses rapid repeats", async (): Promise<void> => {
    const { fetch, module } = await browser();
    module.reportToolUsage("talent_build_saved", "forever");
    module.reportToolUsage("talent_build_saved", "forever");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe("/tools/api/v1/tool-usage");
    expect(options).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
    });
    expect(JSON.parse(options.body as string)).toEqual(input);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 30_001);
    module.reportToolUsage("talent_build_saved", "forever");
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockRejectedValue(new Error("offline"));
    expect(() => module.reportToolUsage("leveling_setup_saved", "forever")).not.toThrow();
    fetch.mockImplementation((): never => {
      throw new Error("privacy extension");
    });
    expect(() => module.reportToolUsage("market_item_watched", "forever")).not.toThrow();
    await Promise.resolve();
  });

  it.each([{ doNotTrack: "1" }, { doNotTrack: "yes" }, { globalPrivacyControl: true }])(
    "respects browser privacy controls %j",
    async (privacy): Promise<void> => {
      const { fetch, module } = await browser(privacy);
      module.reportToolUsage("talent_build_saved", "forever");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("does nothing without a valid enabled release", async (): Promise<void> => {
    const { fetch, module } = await browser();
    delete document.documentElement.dataset.toolUsageBuild;
    module.reportToolUsage("talent_build_saved", "forever");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts only the current same-origin simulator frame's strict completion envelope and disposes", async (): Promise<void> => {
    const { host, fetch, module } = await browser();
    const child = {
      location: {
        href: `${host.location.origin}/tools/forever-sim/${"a".repeat(24)}/feral_tank_druid/`,
      },
    };
    const frame = {
      ownerDocument: { defaultView: host },
      contentWindow: child,
    } as unknown as HTMLIFrameElement;
    const send = (data: unknown, origin = host.location.origin, source: unknown = child): void => {
      const event = new Event("message");
      Object.defineProperties(event, {
        data: { value: data },
        origin: { value: origin },
        source: { value: source },
      });
      host.dispatchEvent(event);
    };
    const stop = module.connectSimulatorToolUsage(frame);
    const complete = { type: "kfc-simulation-completed", version: 1 };
    send(complete, "https://foreign.test");
    send(complete, host.location.origin, {});
    send({ ...complete, result: { damage: 100 } });
    send({ type: "runOnce" });
    child.location.href = `${host.location.origin}/tools/forever/trader`;
    send(complete);
    expect(fetch).not.toHaveBeenCalled();
    child.location.href = `${host.location.origin}/tools/forever-sim/${"a".repeat(24)}/feral_tank_druid/`;
    send(complete);
    expect(fetch).toHaveBeenCalledTimes(1);
    stop();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 30_001);
    send(complete);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
