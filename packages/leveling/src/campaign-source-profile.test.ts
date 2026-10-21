import { describe, expect, it } from "vitest";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { chapterEligibility } from "./chapter-catalog.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter, getGuideStepView } from "./guide-archive.js";

describe("shared campaign source-selection context", () => {
  it("includes the same low-rate Hunter chapter chosen by the route constructor", () => {
    const reference = CHAPTER_REFERENCES.find(
      (entry) => entry.id === "chapter-123-6-11-dun-morogh-hunter",
    )!;
    const profile = createCampaignSourceProfile("dwarf", "hunter");
    expect(profile).toMatchObject({ xpRate: 1, party: { size: 5, readiness: "together" } });
    expect(chapterEligibility(reference, profile)).toBe("match");
    expect(chapterEligibility(reference, { ...profile, classSlug: "warrior" })).toBe("exclude");
    expect(chapterEligibility(reference, { ...profile, xpRate: 2 })).toBe("exclude");
  });
  it("keeps class and group conditions consistent without claiming a tank or healer", () => {
    const guide = parseGuideChapter(
      "step << Hunter\n.group 5\n.complete 300001,1 --Kill Target (x1)",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    const profile = createCampaignSourceProfile("dwarf", "hunter");
    expect(getGuideStepView(guide.steps[0]!, profile, { dungeons: [] }).condition).toBe("unknown");
    const plannedStep = {
      ...guide.steps[0]!,
      directives: guide.steps[0]!.directives.filter((entry) => entry.tag !== ".group"),
    };
    expect(getGuideStepView(plannedStep, profile, { dungeons: [] }).condition).toBe("match");
    expect(profile.party.tank).toBe("unknown");
    expect(profile.party.healer).toBe("unknown");
  });
});
