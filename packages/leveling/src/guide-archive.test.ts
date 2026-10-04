import { describe, it, expect } from "vitest";
import {
  cleanGuideText,
  getGuideStepView,
  guideArchiveManifestSchema,
  parseGuideChapter,
} from "./guide-archive.js";
import { createCharacterProfile } from "./profile.js";

const source = `#forever
step << Mage
    .goto 1429/0,-136.48,-8933.47
    >>Talk to |cRXP_FRIENDLY_Deputy Willem|r
    .accept 783 >>Accept A Threat Within
    .target Deputy Willem
step << Warrior
    .train 6673 >>Train |T132333:0|t[Battle Shout]
step
    .goto 1429,49.052,38.270,0
    .turnin 783 >>Turn in A Threat Within << Mage
    .accept 7 >>Accept Kobold Camp Cleanup
    #requires Within
    .isOnQuest 783
step
    #season 2
    .accept 123 >>SoD-only rune
step
    #season 0,1
    #era/som
    .accept 456 >>Season-zero fallback
step
    .dungeon DM
    #optional
    .accept 789 >>Dungeon option
step
    .dungeon !DM
    .accept 987 >>Outdoor alternative
step
    #xprate <1.5
    .complete 7,1 --Kobold Vermin (10)
step << skip
    .accept 333 >>Disabled source row
`;
function parsed(): ReturnType<typeof parseGuideChapter> {
  return parseGuideChapter(source, "chapter-115-1-6-northshire", "a".repeat(64), 70205);
}
describe("authorized full guide extraction", () => {
  it("keeps source order, stable step IDs, quest actions, inline conditions and coordinate spaces", () => {
    const chapter = parsed();
    expect(chapter.steps).toHaveLength(9);
    expect(chapter.steps[0]?.id).toBe("source-step-0001");
    expect(chapter.steps[0]?.directives[0]?.position).toMatchObject({
      space: "world",
      x: -136.48,
      y: -8933.47,
      floor: 0,
    });
    expect(chapter.steps[2]?.directives[0]?.position).toMatchObject({
      space: "map-percent",
      x: 49.052,
      y: 38.27,
    });
    expect(chapter.steps[2]?.directives[1]).toMatchObject({ condition: "Mage", questId: 783 });
    expect(chapter.steps[7]?.directives[1]?.text).toBe("Kobold Vermin (10)");
    expect(chapter.steps[2]?.directives.some((directive) => directive.tag === "#requires")).toBe(
      true,
    );
  });
  it("filters class and season branches without assuming unknown character details", () => {
    const chapter = parsed(),
      base = createCharacterProfile();
    expect(getGuideStepView(chapter.steps[0]!, base, { dungeons: [] }).condition).toBe("unknown");
    const mage = { ...base, classSlug: "mage" as const };
    expect(getGuideStepView(chapter.steps[0]!, mage, { dungeons: [] }).condition).toBe("match");
    expect(getGuideStepView(chapter.steps[1]!, mage, { dungeons: [] }).condition).toBe("exclude");
    expect(getGuideStepView(chapter.steps[3]!, mage, { dungeons: [] }).condition).toBe("exclude");
    expect(getGuideStepView(chapter.steps[4]!, mage, { dungeons: [] }).condition).toBe("match");
    expect(getGuideStepView(chapter.steps[8]!, mage, { dungeons: [] }).condition).toBe("exclude");
  });
  it("keeps dungeons opt-in, XP rate unknown and game-state checks visible", () => {
    const chapter = parsed(),
      profile = createCharacterProfile();
    expect(getGuideStepView(chapter.steps[5]!, profile, { dungeons: [] }).condition).toBe(
      "exclude",
    );
    expect(getGuideStepView(chapter.steps[6]!, profile, { dungeons: [] }).condition).toBe("match");
    expect(getGuideStepView(chapter.steps[5]!, profile, { dungeons: ["DM"] }).condition).toBe(
      "match",
    );
    expect(getGuideStepView(chapter.steps[6]!, profile, { dungeons: ["DM"] }).condition).toBe(
      "exclude",
    );
    expect(getGuideStepView(chapter.steps[7]!, profile, { dungeons: [] }).condition).toBe(
      "unknown",
    );
    expect(
      getGuideStepView(chapter.steps[7]!, { ...profile, xpRate: 1 }, { dungeons: [] }).condition,
    ).toBe("match");
    expect(
      getGuideStepView(chapter.steps[2]!, profile, { dungeons: [] }).runtimeChecks[0]?.tag,
    ).toBe(".isOnQuest");
  });
  it("removes game markup while leaving literal text, not executable HTML", () => {
    expect(cleanGuideText("|T132333:0|t[Battle Shout] |cRXP_WARN_Test|r")).toBe(
      "[Battle Shout] Test",
    );
    expect(cleanGuideText("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
    expect(() => parseGuideChapter("#forever", "chapter-1", "a".repeat(64), 70205)).toThrow();
    expect(guideArchiveManifestSchema.safeParse({ publication: "authorized" }).success).toBe(false);
  });
});
