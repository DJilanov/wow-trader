import { describe, expect, it } from "vitest";

import { resolveItemIconPath } from "./item-icons.js";

describe("resolveItemIconPath", () => {
  it("resolves a positive file data ID under an absolute media root", () => {
    expect(resolveItemIconPath("/srv/wow-trader/icons", "134739")).toBe(
      "/srv/wow-trader/icons/134739.png",
    );
  });

  it("rejects traversal, non-numeric IDs, zero, and relative roots", () => {
    expect(resolveItemIconPath("/srv/icons", "../secret")).toBeNull();
    expect(resolveItemIconPath("/srv/icons", "12.webp")).toBeNull();
    expect(resolveItemIconPath("/srv/icons", "0")).toBeNull();
    expect(resolveItemIconPath("relative/icons", "123")).toBeNull();
  });
});
