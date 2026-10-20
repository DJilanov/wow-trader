import { describe, expect, it } from "vitest";

import { entityGraphHref, normalizeEntityGraphRelation } from "./entity-graph";

describe("entity graph", () => {
  it.each([
    ["sold_by_npc", "sold_by"],
    ["dropped_by_object", "dropped_by"],
    ["rewarded_by_quest", "rewarded_by"],
    ["started_by", "starts_quest"],
    ["finishes_quest", "ends_quest"],
    ["teaches_spell", "teaches_recipe"],
    ["requires_item", "requires_item"],
  ] as const)("normalizes %s as %s", (relationKind, expected) => {
    expect(
      normalizeEntityGraphRelation({
        direction: "outgoing",
        relationKind,
        relatedKind: relationKind === "teaches_spell" ? "spell" : "npc",
        relatedId: 25,
      }).normalizedKind,
    ).toBe(expected);
  });

  it("links supported entity routes without inventing unknown destinations", () => {
    expect(entityGraphHref("npc", 5)).toBe("/forever/encyclopedia/npcs/5");
    expect(entityGraphHref("spell", 3275, "teaches_spell")).toBe(
      "/forever/encyclopedia/recipes/3275",
    );
    expect(entityGraphHref("spell", 133, "requires_spell")).toBeNull();
    expect(entityGraphHref("npc", 0)).toBeNull();
  });
});
