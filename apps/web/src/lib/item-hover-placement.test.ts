import { describe, expect, it } from "vitest";

import { getItemHoverPlacement } from "./item-hover-placement";

describe("getItemHoverPlacement", () => {
  it("keeps the tooltip above when the full content fits", () => {
    expect(
      getItemHoverPlacement({
        anchorTop: 760,
        anchorBottom: 844,
        tooltipHeight: 520,
        viewportHeight: 1000,
      }),
    ).toEqual({ placement: "above", maxHeight: 680 });
  });

  it("moves the tooltip below a row near the viewport top", () => {
    expect(
      getItemHoverPlacement({
        anchorTop: 16,
        anchorBottom: 100,
        tooltipHeight: 520,
        viewportHeight: 1000,
      }),
    ).toEqual({ placement: "below", maxHeight: 680 });
  });

  it("uses the larger side and caps height inside a short viewport", () => {
    expect(
      getItemHoverPlacement({
        anchorTop: 190,
        anchorBottom: 274,
        tooltipHeight: 520,
        viewportHeight: 500,
      }),
    ).toEqual({ placement: "below", maxHeight: 205 });
  });
});
