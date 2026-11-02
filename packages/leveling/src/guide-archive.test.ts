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
  it("retains unconditional work when an unknown class can only enable an already-satisfied gate", () => {
    const chapter = parseGuideChapter(
      "step\n#season 0 << !Warrior !Rogue\n.complete 4762,1\n.use 12350\n.accept 123 << Mage",
      "chapter-126-14-16-darkshore",
      "a".repeat(64),
      70205,
    );
    const view = getGuideStepView(chapter.steps[0]!, createCharacterProfile(), { dungeons: [] });
    expect(view.condition).toBe("match");
    expect(
      view.directives
        .filter((directive) => directive.questId !== null)
        .map((directive) => directive.questId),
    ).toEqual([4762]);
    expect(
      view.directives.some(
        (directive) => directive.tag === ".use" && directive.arguments === "12350",
      ),
    ).toBe(true);
    expect(view.conditionalDirectives.map((directive) => directive.questId)).toEqual([123]);
  });
  it("keeps a potentially excluding class-conditioned gate unresolved until class is known", () => {
    const chapter = parseGuideChapter(
      "step\n#season 2 << Mage\n.accept 123",
      "chapter-126-14-16-darkshore",
      "a".repeat(64),
      70205,
    );
    const base = createCharacterProfile();
    expect(getGuideStepView(chapter.steps[0]!, base, { dungeons: [] }).condition).toBe("unknown");
    expect(
      getGuideStepView(chapter.steps[0]!, { ...base, classSlug: "mage" }, { dungeons: [] })
        .condition,
    ).toBe("exclude");
    expect(
      getGuideStepView(chapter.steps[0]!, { ...base, classSlug: "warrior" }, { dungeons: [] })
        .condition,
    ).toBe("match");
  });
  it("does not resolve an unknown conditional XP gate until its numerical requirement is known", () => {
    const chapter = parseGuideChapter(
      "step\n#xprate <1.5 << Mage\n.accept 123",
      "chapter-126-14-16-darkshore",
      "a".repeat(64),
      70205,
    );
    const base = createCharacterProfile();
    expect(getGuideStepView(chapter.steps[0]!, base, { dungeons: [] }).condition).toBe("unknown");
    expect(
      getGuideStepView(chapter.steps[0]!, { ...base, xpRate: 1 }, { dungeons: [] }).condition,
    ).toBe("match");
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
