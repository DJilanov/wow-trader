import { describe, expect, it } from "vitest";
import { shouldPrefetchSiteNavigation } from "./site-navigation";

describe("navigation prefetch during heavy workspace startup", () => {
  it.each([
    "/forever/simulator",
    "/forever/simulator/warrior",
    "/forever/leveling",
    "/tools/forever/leveling/routes/alliance-human",
  ])("does not compete with the active %s workspace", (pathname) => {
    for (const href of ["/", "/forever/encyclopedia", "/forever/addon", "/data-status"])
      expect(shouldPrefetchSiteNavigation(href, pathname)).toBe(false);
  });
  it("retains existing prefetch elsewhere without eagerly requesting live market pages", () => {
    expect(shouldPrefetchSiteNavigation("/forever/encyclopedia", "/forever")).toBe(true);
    expect(shouldPrefetchSiteNavigation("/forever/trader", "/forever")).toBe(false);
    expect(shouldPrefetchSiteNavigation("/tbc/trader", "/forever")).toBe(false);
  });
});
