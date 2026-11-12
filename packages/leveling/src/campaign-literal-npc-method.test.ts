import { describe, expect, it } from "vitest";
import { isCommonCampaignQuestMethod } from "./campaign-shared-source.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { getGuideStepView, importedStepSchema, parseGuideChapter } from "./guide-archive.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { characterProfileSchema } from "./profile.js";
import fixture from "./fixtures/literal-npc-dialogue-70205.json" with { type: "json" };

const ordinary = new Set([3903, 3904]);

function directives(text: string, target = "Arch Druid Fandral Staghelm", extra = ""): ReturnType<typeof parseGuideChapter>["steps"][number]["directives"] {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 115)!;
  return parseGuideChapter([
    "step", ".goto 1457,34,9", ">>" + text,
    ".turnin 3903", ".accept 3904", ".target " + target, extra,
  ].join("\n"), reference.id, "a".repeat(64), 70205).steps[0]!.directives;
}

describe("ordinary dialogue with class words in NPC names", () => {
  it.each([
    ["Talk to Arch Druid Fandral Staghelm at the top floor of the tree", "Arch Druid Fandral Staghelm"],
    ["Talk to Arch Druid Fandral Staghelm atop the Tree", "Arch Druid Fandral Staghelm"],
    ["Speak with High Priest Rohan inside the temple.", "High Priest Rohan"],
  ])("permits the literal NPC instruction: %s", (text, target) => {
    const input = directives(text, target), before = structuredClone(input);
    expect(isCommonCampaignQuestMethod(input, ordinary)).toBe(true);
    expect(input).toEqual(before);
  });

  it.each(fixture.cases)("retains the catalog-confirmed source method at $chapterId/$step.id", (entry) => {
    const step = importedStepSchema.parse(entry.step);
    const ids = new Set(step.directives.flatMap((row) => row.questId === null ? [] : [row.questId]));
    for (const value of entry.classes) {
      const classSlug = characterProfileSchema.shape.classSlug.parse(value);
      const view = getGuideStepView(step, createCampaignSourceProfile("human", classSlug), { dungeons: [] });
      expect(view.condition).toBe("match");
      expect(view.conditionalDirectives).toEqual([]);
      expect(isCommonCampaignQuestMethod(view.directives, ids)).toBe(true);
    }
  });

  it.each([
    "Talk to Arch Druid Fandral Staghelm if you are a Druid",
    "Talk to Arch Druid Fandral Staghelm at the tree then cast Teleport",
    "Talk to Arch Druid Fandral Staghelm and use Prowl",
    "Talk to Arch Druid Fandral Staghelm. Train your new skills",
    "Talk to Arch Druid Fandral Staghelm only after dying",
    "Pool Rage as a Warrior before talking to Arch Druid Fandral Staghelm",
  ])("keeps actual class or extra functional advice held: %s", (text) => {
    expect(isCommonCampaignQuestMethod(directives(text), ordinary)).toBe(false);
  });

  it.each(["no-target", "partial-target", "multiple-targets", "single-class-name", "class-training", "unknown-quest"])(
    "does not relax another source requirement: %s", (reason) => {
      let input = directives("Talk to Arch Druid Fandral Staghelm at the top floor of the tree");
      if (reason === "no-target") input = input.filter((row) => row.tag !== ".target");
      if (reason === "partial-target") input = directives("Talk to Arch Druid Fandral Staghelm", "Fandral Staghelm");
      if (reason === "multiple-targets") input = directives("Talk to Arch Druid Fandral Staghelm",
        "Arch Druid Fandral Staghelm", ".target Another Druid");
      if (reason === "single-class-name") input = directives("Talk to Druid", "Druid");
      if (reason === "class-training") input = directives("Talk to Arch Druid Fandral Staghelm",
        "Arch Druid Fandral Staghelm", ".train 123");
      if (reason === "unknown-quest") input = directives("Talk to Arch Druid Fandral Staghelm",
        "Arch Druid Fandral Staghelm", ".accept 999999");
      expect(isCommonCampaignQuestMethod(input, ordinary)).toBe(false);
    },
  );
});

describe("ordinary instructions with class words in creature names", () => {
  function combat(text: string, targets: readonly string[]): ReturnType<typeof directives> {
    return [...directives(text), ...targets.map((target) => ({ ...directives(text)[0]!,
      tag: ".mob", arguments: target,
    })), { ...directives(text)[0]!, tag: ".complete", questId: 3904, arguments: "3904,1" }];
  }

  it.each([
    ["Kill Ley Hunters, Mana Eaters and Mage Hunters. Loot them for their Brains",
      ["+Ley Hunter", "+Mana Eater", "+Mage Hunter"]],
    ["Slay Mage Hunters. Loot their emblems", ["Mage Hunter"]],
  ] as const)("keeps the captured creature instruction: %s", (text, targets) => {
    expect(isCommonCampaignQuestMethod(combat(text, targets), ordinary)).toBe(true);
  });

  it.each([
    "Kill Mage Hunters as a Priest",
    "Kill Mage Hunters. Then cast Renew",
    "Kill Mage Hunters and use your shield",
    "Kill Mage Hunters, then train",
    "Kill Mage Hunters and Druid Defenders",
  ])("keeps actual ability advice and unbound class words held: %s", (text) => {
    expect(isCommonCampaignQuestMethod(combat(text, ["Mage Hunter"]), ordinary)).toBe(false);
  });

  it.each([{ targets: [] }, { targets: ["Priest"] }, { targets: ["Forest Warrior"] }])("requires the complete captured name: $targets", ({ targets }) => {
    expect(isCommonCampaignQuestMethod(combat("Kill Mage Hunters", targets), ordinary)).toBe(false);
  });

  it("preserves functional directives and known ordinary-quest requirements", () => {
    const rows = combat("Kill Mage Hunters", ["Mage Hunter"]);
    for (const extra of [
      { ...rows[0]!, tag: ".cast", arguments: "12345" },
      { ...rows[0]!, tag: ".use", arguments: "12345" },
      { ...rows[0]!, tag: ".accept", arguments: "99999", questId: 99999 },
    ]) expect(isCommonCampaignQuestMethod([...rows, extra], ordinary)).toBe(false);
  });
});
