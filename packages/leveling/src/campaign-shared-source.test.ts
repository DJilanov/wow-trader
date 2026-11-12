import { describe, expect, it } from "vitest";
import { sharedCampaignQuestSources } from "./campaign-shared-source.js";
import type { CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { getGuideStepView, parseGuideChapter } from "./guide-archive.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";

function source(body: string): CampaignSource {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 115)!;
  return {
    reference,
    guide: parseGuideChapter(body, reference.id, "e".repeat(64), 70205),
  };
}

function project(input: CampaignSource): CampaignSource {
  return sharedCampaignQuestSources([input], "human", new Set([3903, 3904, 3905]))[0]!;
}

describe("ordinary quests recommended to selected solo classes", () => {
  it("preserves an explicit kill/loot method while omitting its solo spell advice", () => {
    const input = source(
      "step\n.goto 1429,50,50\n>>Click the Wanted Poster << Warlock\n.accept 3904 << Warlock\nstep << Warlock\n.goto 1429,51,51\n>>Kill Hogger. Loot him for his Claw\n>>Cast [Fear] on Hogger continuously\n.complete 3904,1 >>Huge Gnoll Claw (1)\n.unitscan Hogger",
    );
    const result = project(input);
    expect(result.guide.steps.every((step) => step.condition === "")).toBe(true);
    expect(result.guide.steps[0]!.directives).toContainEqual(
      expect.objectContaining({ tag: "text", text: "Click the Wanted Poster", condition: "" }),
    );
    expect(
      result.guide.steps[1]!.directives.filter((row) => row.tag === "text").map((row) => row.text),
    ).toEqual(["Kill Hogger. Loot him for his Claw"]);
    expect(result.guide.steps[1]!.directives).toContainEqual(
      expect.objectContaining({ tag: ".complete", questId: 3904, arguments: "3904,1" }),
    );
    expect(project(result)).toBe(result);
    const conflicting = source(
      "step << Warlock\n>>Kill another creature\n>>Cast [Fear] on Hogger continuously\n.complete 3904,1 >>Huge Gnoll Claw (1)\n.unitscan Hogger",
    );
    expect(project(conflicting)).toBe(conflicting);
  });
  it("chooses the shared interaction instead of a solo spell method or another class's advice", () => {
    const input = source(
      "step << Paladin\n.goto 1429,50,50\n>>Run on top of the corpse, then cast [Divine Protection] and click it\n.turnin 3903\n.accept 3904\nstep << !Paladin\n.goto 1429,50,50\n>>Click the corpse on the ground\n>>The nearby enemies will cast [Drink Minor Potion]\n>>Pool 100 Rage and use [Hamstring] << Warrior\n>>Cast [Renew] before pulling << Priest\n.turnin 3903\n.accept 3904",
    );
    const snapshot = structuredClone(input);
    const result = project(input);
    expect(result.guide.steps[0]).toEqual(input.guide.steps[0]);
    expect(result.guide.steps[1]!.condition).toBe("");
    expect(
      result.guide.steps[1]!.directives.filter((row) => row.tag === "text").map((row) => row.text),
    ).toEqual([
      "Click the corpse on the ground",
      "The nearby enemies will cast [Drink Minor Potion]",
    ]);
    expect(
      result.guide.steps[1]!.directives.filter((row) => row.questId !== null).map(
        (row) => row.questId,
      ),
    ).toEqual([3903, 3904]);
    expect(project(result)).toBe(result);
    expect(input).toEqual(snapshot);
  });
  it("normalizes a matching Human ordinary route so its pickup lifecycle is not held as personal", () => {
    const input = source(
      "step << Human\n.goto 1429,50,50\n.accept 3904\nstep << Human\n.goto 1429,51,51\n>>Loot Milly's Harvest on the ground\n.complete 3904,1 >>Collect Milly's Harvest (x8)\nstep\n.goto 1429,50,50\n.turnin 3904 << Human",
    );
    const snapshot = structuredClone(input);
    const result = project(input);
    expect(result.guide.steps.every((step) => step.condition === "")).toBe(true);
    expect(
      result.guide.steps.flatMap((step) => step.directives).every((row) => row.condition === ""),
    ).toBe(true);
    expect(result.guide.version).toBe(input.guide.version);
    expect(input).toEqual(snapshot);
    expect(project(result)).toBe(result);
    for (const body of [
      "step << Human\n.train 123\n.accept 3904",
      "step << Human\n.accept 3904\n.accept 999",
      "step << Dwarf\n.accept 3904",
    ]) {
      const other = source(body);
      expect(project(other)).toBe(other);
    }
  });
  it("retains the ordinary object quest and removes the other solo branch's skip instruction", () => {
    const input = source(
      "step\n.goto 1429,50,50\n>>Talk to Milly Osworth\n>>Skip the followup << !Priest !Mage\n.turnin 3903\n.accept 3904 << Priest/Mage\n.target Milly Osworth\nstep << Priest/Mage\n.isOnQuest 3904\n.goto 1429,54,49\n>>Loot Milly's Harvest on the ground\n.complete 3904,1 >>Collect Milly's Harvest (x8)\nstep << Priest/Mage\n.goto 1429,50,50\n.turnin 3904\n.accept 3905\nstep << Priest/Mage\n.goto 1429,48,42\n.turnin 3905,1",
    );
    const snapshot = structuredClone(input);
    const result = project(input);
    expect(input).toEqual(snapshot);
    expect(result.guide.version).toBe(input.guide.version);
    expect(result.guide.sourceSha256).toBe(input.guide.sourceSha256);
    expect(result.guide.steps.flatMap((step) => step.directives)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "Skip the followup" })]),
    );
    const views = result.guide.steps.map((step) =>
      getGuideStepView(step, createCampaignSourceProfile("human", null), { dungeons: [] }),
    );
    expect(views.every((view) => view.condition === "match")).toBe(true);
    expect(views.flatMap((view) => view.directives).filter((row) => row.questId === 3904)).toEqual([
      expect.objectContaining({ tag: ".accept", arguments: "3904", condition: "" }),
      expect.objectContaining({
        tag: ".complete",
        arguments: "3904,1",
        text: "Collect Milly's Harvest (x8)",
      }),
      expect.objectContaining({ tag: ".turnin", arguments: "3904", condition: "" }),
    ]);
    expect(result.guide.steps[1]!.directives).toContainEqual(
      expect.objectContaining({ tag: ".isOnQuest", arguments: "3904" }),
    );
    expect(project(result)).toBe(result);
  });

  it("leaves the newly shared hand-in's item choice to the player and preserves turn-in flags", () => {
    const result = project(source("step << Priest/Mage\n.goto 1429,50,50\n.turnin 3905,2,1"));
    expect(result.guide.steps[0]!.directives.at(-1)).toMatchObject({
      tag: ".turnin",
      arguments: "3905,0,1",
      condition: "",
    });
  });

  it.each([
    ["a dedicated class quest", "step << Priest\n.accept 999"],
    ["mixed ordinary and dedicated class work", "step << Priest\n.accept 3904\n.accept 999"],
    ["spell training", "step << Priest\n.train 123\n.accept 3904"],
    ["class spell use", "step << Priest\n.cast 123\n.complete 3904,1"],
    ["a class ability in prose", "step << Rogue\n>>Pickpocket the target\n.complete 3904,1"],
    ["unknown eligibility", "step << UnknownTrait\n.accept 3904"],
    [
      "unknown per-directive eligibility",
      "step << Priest\n.accept 3904\n.goto 1429,50,50 << UnknownTrait",
    ],
    ["a different race", "step << Orc Priest\n.accept 3904"],
    ["unsupported source mode", "step << Priest\n#hardcore\n.accept 3904"],
    ["incompatible class paths", "step\n.accept 3904 << Priest\n.accept 3905 << Mage"],
    ["invalid hand-in arguments", "step << Priest\n.turnin 3905,item"],
  ])("does not widen %s", (_label, body) => {
    const input = source(body);
    expect(project(input)).toBe(input);
  });
});
