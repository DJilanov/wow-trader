import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { attachCampaignDungeonSources } from "./campaign-dungeon-sources.js";
import { attachCampaignSourceHints } from "./campaign-source-hints.js";

describe("archive-backed execution instructions", () => {
  it("keeps every source objective counter and replaces missing manual details without inventing XP", () => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 39)!;
    const guide = parseGuideChapter(
      "step\n.dungeon Mara\n>>Collect both scepter pieces\n.complete 7044,1\n.complete 7044,2",
      reference.id,
      "a".repeat(64),
      70205,
    );
    const action: CampaignAction = {
      id: "objective",
      legId: "mara",
      title: "Collect scepter pieces",
      instructions: [],
      questChanges: [
        { questId: 7044, state: "objectives-complete", objectiveIndex: 1, title: "Legends" },
      ],
      positions: [],
      source: null,
      kind: "quests",
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
    };
    const plan: CampaignPlan = {
      release: "source-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [action],
      legs: [],
    };
    const enriched = attachCampaignDungeonSources(plan, [{ reference, guide }]);
    expect(enriched.actions[0]!.questChanges.map((change) => change.objectiveIndex)).toEqual([
      1, 2,
    ]);
    expect(enriched.actions[0]!.id).toBe(action.id);
    expect(enriched.rewardFacts).toBeUndefined();
    expect(plan.actions[0]!.questChanges).toHaveLength(1);
  });

  it("shows a selected quest's item hint in the browser and excludes unrelated item farming", () => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 126)!;
    const guide = parseGuideChapter(
      "step\n.complete 4762,1\n.collect 12350,1,4762 >> Fill the river sampling tube\n.use 12350\n.collect 729,3,38 >> Farm Okra",
      reference.id,
      "a".repeat(64),
      70205,
    );
    const action: CampaignAction = {
      id: "river",
      legId: "darkshore",
      title: "River sample",
      instructions: [],
      questChanges: [
        {
          questId: 4762,
          state: "objectives-complete",
          objectiveIndex: 1,
          title: "The Cliffspring River",
        },
      ],
      positions: [],
      source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0]!.id },
      kind: "quests",
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
    };
    const plan: CampaignPlan = {
      release: "hint-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [action],
      legs: [],
    };
    expect(
      attachCampaignSourceHints(plan, [{ reference, guide }]).actions[0]!.instructions,
    ).toEqual(["Fill the river sampling tube"]);
  });
});
