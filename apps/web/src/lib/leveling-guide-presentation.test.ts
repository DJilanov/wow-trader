import { describe, expect, it } from "vitest";
import { guideBarLabel, guideGroupBarLabel } from "./leveling-guide-presentation";

describe("readable guide XP labels", () => {
  it("formats useful level/percentage labels, including the level-60 cap", () => {
    expect(guideBarLabel({ level: 1, currentXp: 0 })).toBe("Level 1 · 0%");
    expect(guideBarLabel({ level: 1, currentXp: 200 })).toBe("Level 1 · 50%");
    expect(guideBarLabel({ level: 60, currentXp: 0 })).toBe("Level 60");
    expect(guideBarLabel(null)).toBe("Estimate needs an update");
  });
  it("makes party differences explicit instead of repeating the same five rows", () => {
    expect(
      guideGroupBarLabel([
        { level: 5, currentXp: 0 },
        { level: 5, currentXp: 0 },
      ]),
    ).toBe("Level 5 · 0%");
    expect(
      guideGroupBarLabel([
        { level: 5, currentXp: 0 },
        { level: 6, currentXp: 0 },
      ]),
    ).toBe("Levels 5–6");
    expect(guideGroupBarLabel([{ level: 5, currentXp: 0 }, null])).toBe(
      "Some player estimates need an update",
    );
  });
});
