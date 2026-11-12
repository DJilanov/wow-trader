import { describe, expect, it } from "vitest";
import { PREMADE_STOPS, selectedPremadeQuests } from "./premade.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { isDungeonCollectionException } from "./dungeon-party-selection.js";
import { getDungeonQuest } from "./dungeon-planner.js";
import { activeCampaignActions, buildCampaignPlan } from "./campaign.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { batchCampaignDungeonFlow } from "./campaign-dungeon-flow.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";

describe("owner-selected dungeon additions", () => {
  it("retains the twelve selections in shared-party planning without disabling checklist opt-outs", () => {
    const expected = [214, 388, 98815, 2928, 2924, 2904, 2945, 2947, 2948, 2951, 2925, 2931];
    const marked = PREMADE_STOPS.flatMap((stop) =>
      stop.quests.filter((quest) => quest.sharedPartyDefault),
    );
    expect(marked.map((quest) => quest.questId).sort((a, b) => a - b)).toEqual(
      [...expected].sort((a, b) => a - b),
    );
    for (const questId of expected) {
      const stop = PREMADE_STOPS.find((stop) =>
        stop.quests.some((quest) => quest.questId === questId),
      )!;
      const initial = emptyPremadeProgress();
      expect(selectedPremadeQuests(stop, initial).map((quest) => quest.questId)).toContain(questId);
      expect(
        selectedPremadeQuests(stop, { ...initial, selectedExtras: { [questId]: false } }).map(
          (quest) => quest.questId,
        ),
      ).not.toContain(questId);
    }
  });

  it("keeps Deviate Hides and Researching the Corruption outside the full-run assumption", () => {
    expect(isDungeonCollectionException(1486)).toBe(true);
    expect(isDungeonCollectionException(1275)).toBe(true);
    for (const questId of [214, 388, 98815, 2928, 2924])
      expect(isDungeonCollectionException(questId)).toBe(false);
  });

  it("retains real courier pickup locations and levels, rather than inventing Ironforge pickups", () => {
    expect(getDungeonQuest(2925)).toMatchObject({
      minimumLevel: 24,
      position: { mapId: 1457 },
      objectiveStage: "before",
    });
    expect(getDungeonQuest(2931)).toMatchObject({
      minimumLevel: 25,
      position: { mapId: 1442 },
      objectiveStage: "before",
    });
    expect(getDungeonQuest(214)!.gate).toEqual({ kind: "quest", questId: 155, state: "rewarded" });
  });

  it("includes the one-time Sparklematic reward after cleaning and removes both when opted out", () => {
    const sources = [115, 116, 117].map((id) => {
      const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === id)!;
      return { reference, guide: parseGuideChapter("step\n>>Travel together", reference.id, "a".repeat(64), 70205) };
    });
    const plan = batchCampaignDungeonFlow(attachCampaignLocations(
      buildCampaignPlan("human", "a".repeat(64), sources, "warrior"), sources,
    ));
    const phases = plan.actions.flatMap((action) => action.questChanges)
      .filter((change) => change.questId === 2951 || change.questId === 2952);
    expect(phases.map((change) => [change.questId, change.state])).toEqual([
      [2951, "accepted"], [2951, "objectives-complete"], [2951, "rewarded"],
      [2952, "accepted"], [2952, "rewarded"],
    ]);
    const initial = emptyPremadeProgress();
    const active = activeCampaignActions(plan, {
      ...initial, selectedExtras: { ...initial.selectedExtras, 2951: false },
    });
    expect(active.flatMap((action) => action.questChanges)
      .filter((change) => change.questId === 2951 || change.questId === 2952)).toEqual([]);
    const selected = plan.actions.filter((action) => action.questChanges.some(
      (change) => change.questId === 2951 || change.questId === 2952,
    ));
    const addon = compileCampaignAddon(plan, selected, {
      version: "0.1.0", runtimeBuild: 70450, interfaceVersion: 11508,
      restedXpVersion: "v4.11.27",
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role)
        .map((document) => document.content).join("\n");
      expect(text.match(/\.turnin 2951\b/g)).toHaveLength(1);
      expect(text.match(/\.accept 2952\b/g)).toHaveLength(1);
      expect(text.match(/\.turnin 2952\b/g)).toHaveLength(1);
      expect(text).not.toContain(".complete 2952");
      expect(text.indexOf(".turnin 2951")).toBeLessThan(text.indexOf(".accept 2952"));
    }
  });
});
