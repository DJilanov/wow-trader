import { describe, expect, it } from "vitest";

import { isEncyclopediaQuerySearchable, parseEncyclopediaSection } from "./encyclopedia";

describe("encyclopedia query parsing", () => {
  it("accepts known sections and defaults unknown values to all", () => {
    expect(parseEncyclopediaSection("items")).toBe("items");
    expect(parseEncyclopediaSection("recipes")).toBe("recipes");
    expect(parseEncyclopediaSection("professions")).toBe("professions");
    expect(parseEncyclopediaSection("drops")).toBe("all");
    expect(parseEncyclopediaSection(undefined)).toBe("all");
  });

  it("allows exact numeric IDs while requiring two characters for name searches", () => {
    expect(isEncyclopediaQuerySearchable("1")).toBe(true);
    expect(isEncyclopediaQuerySearchable("a")).toBe(false);
    expect(isEncyclopediaQuerySearchable("ar")).toBe(true);
    expect(isEncyclopediaQuerySearchable("  17563  ")).toBe(true);
    expect(isEncyclopediaQuerySearchable("0")).toBe(false);
    expect(isEncyclopediaQuerySearchable("")).toBe(false);
  });
});
