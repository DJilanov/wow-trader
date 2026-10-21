import { describe, expect, it } from "vitest";
import { createCharacterProfile } from "@wow-trader/leveling";
import { readSharedCharacter } from "./leveling-experience";
import { levelingSetupHistoryPath, type LevelingSetupStage } from "./leveling-setup-navigation";

describe("leveling wizard history navigation", () => {
  it.each<[LevelingSetupStage, string]>([
    [0, "faction"],
    [1, "race"],
    [2, "style"],
  ])(
    "keeps stage %s on the actual Helper route and preserves the complete character",
    (stage, expected) => {
      const profile = createCharacterProfile("alliance"),
        url = new URL(levelingSetupHistoryPath(stage, profile), "https://kfcguild.online");
      expect(url.pathname).toBe("/tools/forever/leveling");
      expect(url.searchParams.get("stage")).toBe(expected);
      expect(readSharedCharacter(url.searchParams.get("draft"))).toEqual(profile);
      expect(url.searchParams.has("edit")).toBe(false);
    },
  );
  it("roundtrips an edited premade character without losing party choices or escaping the mount", () => {
    const profile = {
      ...createCharacterProfile("alliance"),
      raceId: "human" as const,
      classSlug: "warrior" as const,
      party: {
        size: 5 as const,
        readiness: "together" as const,
        tank: "yes" as const,
        healer: "yes" as const,
      },
    };
    const url = new URL(
      levelingSetupHistoryPath(2, profile, "character & 1"),
      "https://kfcguild.online",
    );
    expect(url.pathname).toBe("/tools/forever/leveling");
    expect(url.searchParams.get("edit")).toBe("character & 1");
    expect(readSharedCharacter(url.searchParams.get("draft"))).toEqual(profile);
  });
});
