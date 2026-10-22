import { describe, expect, it } from "vitest";
import {
  decodeToolGroupDraft,
  encodeToolGroupDraft,
  toolGroupCreatePath,
  toolGroupDraftSchema,
  toolGroupEventType,
  type ToolGroupDraft,
} from "./tool-group-draft";

const draft: ToolGroupDraft = {
  version: 1,
  kind: "leveling",
  label: "Human leveling",
  sourceUrl: "https://kfcguild.online/tools/forever/leveling/routes/alliance-human",
  faction: "Alliance",
  capacity: 5,
};

describe("community group draft wire contract", () => {
  it("encodes portable UTF-8 plans without sharing private quest progress", () => {
    const value = { ...draft, label: "Human leveling - Δοκιμή" };
    expect(decodeToolGroupDraft(encodeToolGroupDraft(value))).toEqual(value);
    expect(toolGroupCreatePath(draft)).toBe(`/raids/new?draft=${encodeToolGroupDraft(draft)}`);
    expect(decodeToolGroupDraft("x".repeat(2401))).toBeNull();
    expect(decodeToolGroupDraft("invalid-json")).toBeNull();
  });

  it("permits only the public source family corresponding to this draft", () => {
    expect(toolGroupDraftSchema.safeParse({ ...draft, faction: "Horde" }).success).toBe(false);
    for (const sourceUrl of [
      "https://evil.test/tools/forever/leveling/routes/alliance-human",
      "https://kfcguild.online/tools/api/admin",
      "https://kfcguild.online/tools/forever/encyclopedia/quests/10",
      `${draft.sourceUrl}?token=private`,
      `${draft.sourceUrl}#private`,
    ]) {
      expect(toolGroupDraftSchema.safeParse({ ...draft, sourceUrl }).success).toBe(false);
    }
    expect(toolGroupDraftSchema.safeParse({ ...draft, approved: true }).success).toBe(false);
    expect(toolGroupDraftSchema.safeParse({ ...draft, discordChannelId: "123" }).success).toBe(
      false,
    );
  });

  it("retains dungeon branches as dungeon events rather than generic questing", () => {
    const branch = {
      ...draft,
      sourceUrl:
        "https://kfcguild.online/tools/forever/leveling/routes/alliance-human/dungeons/thanes?chapter=chapter-126-14-16-darkshore&plan=alternative",
    };
    expect(toolGroupDraftSchema.safeParse(branch).success).toBe(true);
    expect(toolGroupEventType(branch)).toBe("dungeon");
    expect(decodeToolGroupDraft(encodeToolGroupDraft(branch))).toEqual(branch);
  });
});
