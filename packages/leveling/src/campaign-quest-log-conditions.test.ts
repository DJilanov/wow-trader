import { describe, expect, it } from "vitest";
import { getDungeonBundle } from "./dungeon-bundles.js";
import {
  dungeonBundleKey,
  dungeonBundleSlotKey,
  type DungeonBundle,
} from "./dungeon-bundle-model.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { parseGuideChapter } from "./guide-archive.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";

function control(): { plan: CampaignPlan; progress: PremadeProgress; bundle: DungeonBundle } {
  const base = getDungeonBundle("drowned-city", "alliance")!;
  const bundle: DungeonBundle = {
    ...base,
    slots: base.slots.map((slot) => ({
      ...slot,
      selected: slot.index === 1,
      questId: slot.index === 1 ? 300010 : null,
    })),
  };
  const step = parseGuideChapter(
    "step\n.accept 300001\n.isQuestTurnedIn 300010",
    "bundle-source-control",
    "a".repeat(64),
    70205,
  ).steps[0]!;
  const pickup: CampaignAction = {
    id: "after-bundle",
    legId: "control",
    title: "Conditional pickup control",
    instructions: [],
    positions: [],
    source: campaignActionSource(
      { chapterId: "bundle-source-control", version: "test" },
      step,
      step.directives,
    ),
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: [
      { questId: 300001, state: "accepted", objectiveIndex: null, title: "Next control quest" },
    ],
  };
  const entry: CampaignAction = {
    ...pickup,
    id: "bundle-entry",
    kind: "checkpoint",
    targetStopId: "drowned-city",
    source: null,
    questChanges: [],
  };
  const handIn: CampaignAction = {
    ...entry,
    id: "bundle-hand-in",
    kind: "instructions",
    targetStopId: null,
    bundleId: "drowned-city",
  };
  const actions = [entry, handIn, pickup];
  const plan: CampaignPlan = {
    release: "bundle-source-control",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "control",
        title: "Control",
        from: 1,
        to: 2,
        kind: "dungeon",
        bundleId: "drowned-city",
        stopId: "drowned-city",
        actionIds: actions.map((action) => action.id),
        questIds: [300001],
        unresolvedQuestIds: [],
      },
    ],
  };
  const progress = emptyPremadeProgress();
  progress.guaranteedBundles[dungeonBundleKey("drowned-city", "alliance")] = bundle;
  progress.members = progress.members.map((member) => ({
    ...member,
    questStates: Object.fromEntries(
      Array.from({ length: 38 }, (_, i) => [String(400000 + i), "accepted" as const]),
    ),
  }));
  return { plan, progress, bundle };
}

describe("source-controlled pickups after mapped dungeon hand-ins", () => {
  it("applies the modeled hand-in before evaluating the next source prerequisite", () => {
    const { plan, progress } = control();
    for (const member of auditCampaignQuestLog(plan, progress)) {
      expect(member.carriedAtEnd).toContain("quest:300001");
      expect(member.carriedAtEnd).not.toContain("quest:300010");
      expect(member.peakUpperBound).toBe(39);
    }
  });

  it("honors recorded mapped hand-ins when the bundle is already complete", () => {
    const { plan, progress, bundle } = control();
    progress.members = progress.members.map((member) => ({
      ...member,
      bundleSlotStates: { [dungeonBundleSlotKey(bundle, 1)]: "rewarded" },
    }));
    for (const member of auditCampaignQuestLog(plan, progress)) {
      expect(member.carriedAtEnd).toContain("quest:300001");
      expect(member.peakUpperBound).toBe(39);
    }
  });

  it("retains both possibilities when a saved held quest conflicts with a completed bundle", () => {
    const { plan, progress, bundle } = control();
    progress.members = progress.members.map((member) => ({
      ...member,
      bundleSlotStates: { [dungeonBundleSlotKey(bundle, 1)]: "rewarded" },
      questStates: { ...member.questStates, "300010": "accepted" },
    }));
    for (const member of auditCampaignQuestLog(plan, progress)) {
      expect(member.carriedAtEnd).toContain("quest:300001");
      expect(member.carriedAtEnd).toContain("quest:300010");
      expect(member.peakUpperBound).toBe(40);
    }
  });
});
