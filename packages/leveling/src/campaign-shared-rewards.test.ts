import { describe, expect, it } from "vitest";
import { sharedCampaignRewardSources } from "./campaign-shared-rewards.js";
import type { CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { getGuideStepView, parseGuideChapter } from "./guide-archive.js";
import { LEVELING_RACES } from "./profile.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";

const alternatives =
  ".turnin 33,2 >>Wolves Across the Border << Warrior/Paladin/Rogue\n.turnin 33,1 >>Wolves Across the Border << !Warrior !Paladin !Rogue";

function source(body: string): CampaignSource {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 115)!;
  return {
    reference,
    guide: parseGuideChapter(body, reference.id, "e".repeat(64), 70205),
  };
}

function normalize(input: CampaignSource): CampaignSource {
  return sharedCampaignRewardSources([input], "human", new Set([33]))[0]!;
}

describe("ordinary shared quests with class-specific reward choices", () => {
  it("restores one common hand-in without changing its guards, location or original archive", () => {
    const input = source(
      `step\n#requires WolfMeatEnd\n.isOnQuest 33\n.goto 1429/0,-163.24,-8869.26\n>>Talk to Eagan Peltskinner\n${alternatives}\n.target Eagan Peltskinner`,
    );
    const snapshot = structuredClone(input);
    const result = normalize(input);
    expect(input).toEqual(snapshot);
    expect(result.guide.sourceSha256).toBe(input.guide.sourceSha256);
    expect(result.guide.version).toBe(input.guide.version);
    const step = result.guide.steps[0]!;
    expect(step.directives.filter((directive) => directive.tag === ".turnin")).toEqual([
      {
        ...input.guide.steps[0]!.directives.find((directive) => directive.tag === ".turnin"),
        arguments: "33",
        condition: "",
      },
    ]);
    expect(step.directives.filter((directive) => directive.tag !== ".turnin")).toEqual(
      input.guide.steps[0]!.directives.filter((directive) => directive.tag !== ".turnin"),
    );
    for (const classSlug of [
      null,
      ...LEVELING_RACES.find((race) => race.id === "human")!.classes,
    ]) {
      const view = getGuideStepView(step, createCampaignSourceProfile("human", classSlug), {
        dungeons: [],
      });
      expect(view.condition).toBe("match");
      expect(view.directives.filter((directive) => directive.tag === ".turnin")).toHaveLength(1);
    }
    expect(normalize(result)).toBe(result);
  });

  it("preserves flags that disable automatic turn-in while leaving the reward choice to each player", () => {
    const result = normalize(
      source(
        "step\n.turnin 33,2,1 << Warrior/Paladin/Rogue\n.turnin 33,1,1 << !Warrior !Paladin !Rogue",
      ),
    );
    expect(result.guide.steps[0]!.directives[0]).toMatchObject({
      arguments: "33,0,1",
      condition: "",
    });
  });

  it.each([
    ["partial class coverage", "step\n.turnin 33,1 << Warrior"],
    ["dedicated class step", `step << Warrior\n${alternatives}`],
    ["unknown reward selector", `step\n${alternatives}\n.turnin 33,3 << UnknownTrait`],
    ["class-specific location", `step\n.goto 1429,45,48 << Warrior\n${alternatives}`],
    ["class-specific access", `step\n.accept 100 << Warrior\n${alternatives}`],
    ["different hand-in label", `step\n${alternatives.replace("33,1 >>Wolves", "33,1 >>Other")}`],
    ["different flags", `step\n${alternatives.replace("33,1 >>", "33,1,1 >>")}`],
    ["unparsed reward arguments", `step\n${alternatives.replace("33,1 >>", "33,item >>")}`],
    ["uncovered extra variant", `step\n${alternatives}\n.turnin 33,3 << Druid`],
    ["excluded source mode", `step\n#hardcore\n${alternatives}`],
    ["already common hand-in", `step\n.turnin 33\n${alternatives}`],
  ])("leaves %s unchanged instead of widening eligibility", (_label, body) => {
    const input = source(body);
    expect(normalize(input)).toBe(input);
  });

  it("requires an ordinary-quest identity rather than inferring eligibility from reward text", () => {
    const input = source(`step\n${alternatives}`);
    expect(sharedCampaignRewardSources([input], "human", new Set([34]))[0]).toBe(input);
    expect(sharedCampaignRewardSources([input], "dwarf", new Set([33]))[0]).toBe(input);
  });
});
