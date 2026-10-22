import type { z } from "zod";
import { toolUsageBuildSchema, toolUsageEventSchema } from "./tool-usage-contract.mjs";
import { withHelperBasePath } from "./site-path";

export type ToolUsageEvent = z.infer<typeof toolUsageEventSchema>;
const reported = new Map<string, number>();

export function reportToolUsage(
  action: ToolUsageEvent["action"],
  edition: ToolUsageEvent["edition"],
): void {
  if (typeof window === "undefined") return;
  const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (privacy.globalPrivacyControl || privacy.doNotTrack === "1" || privacy.doNotTrack === "yes")
    return;
  const build = toolUsageBuildSchema.safeParse(document.documentElement.dataset.toolUsageBuild);
  if (!build.success) return;
  const event = toolUsageEventSchema.safeParse({
    schema: "tool-usage.v1",
    build: build.data,
    action,
    edition,
    device: window.innerWidth <= 768 ? "mobile" : "desktop",
  });
  if (!event.success) return;
  const key = `${action}:${edition}`;
  const now = Date.now();
  const previous = reported.get(key);
  if (previous !== undefined && now - previous < 30_000) return;
  reported.set(key, now);
  // Optional measurement must never make a successful local tool action fail or retry it.
  try {
    void fetch(withHelperBasePath("/api/v1/tool-usage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event.data),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Some privacy extensions replace fetch with a throwing implementation.
  }
}

export function connectSimulatorToolUsage(frame: HTMLIFrameElement): () => void {
  const host = frame.ownerDocument.defaultView;
  if (!host) return () => {};
  const receive = (event: MessageEvent<unknown>): void => {
    if (event.origin !== host.location.origin || event.source !== frame.contentWindow) return;
    const payload = event.data;
    if (
      !payload ||
      typeof payload !== "object" ||
      Object.keys(payload).length !== 2 ||
      !("type" in payload) ||
      payload.type !== "kfc-simulation-completed" ||
      !("version" in payload) ||
      payload.version !== 1
    )
      return;
    try {
      const actual = new URL(frame.contentWindow!.location.href);
      if (
        actual.origin !== host.location.origin ||
        !/^\/(?:tools\/)?forever-sim\/[a-f0-9]{24}\/[a-z_]+\/?$/.test(actual.pathname)
      )
        return;
    } catch {
      return;
    }
    reportToolUsage("simulation_completed", "forever");
  };
  host.addEventListener("message", receive);
  return () => host.removeEventListener("message", receive);
}
