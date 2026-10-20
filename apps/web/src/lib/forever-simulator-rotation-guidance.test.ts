import { describe, expect, it } from "vitest";
import { rotationGuidanceText } from "./forever-simulator-rotation-guidance";

describe("display-only rotation guidance spacing", () => {
  it.each([
    ["Level60,300-second fight", "Level 60, 300-second fight"],
    ["at3+ combo points with2 seconds", "at 3+ combo points with 2 seconds"],
    ["active,60+ energy,1 or fewer points", "active, 60+ energy, 1 or fewer points"],
    ["30/21/0 · first-pass tested", "30/21/0 · first-pass tested"],
    ["At 3+ points, use Eviscerate.", "At 3+ points, use Eviscerate."],
    [
      "Level60 with Greater Mageblood Elixir (20MP5).",
      "Level 60 with Greater Mageblood Elixir (20MP5).",
    ],
  ])("makes %s readable without changing numbers", (source, expected) => {
    expect(rotationGuidanceText(source)).toBe(expected);
    expect(source.match(/\d+(?:\.\d+)?/g)).toEqual(expected.match(/\d+(?:\.\d+)?/g));
  });
});
