import { describe, expect, it } from "vitest";
import { displayOnlyQuestPhases } from "./campaign-source-display.js";
import { parseGuideChapter, getGuideStepView } from "./guide-archive.js";
import { createCampaignSourcePhaseSelector } from "./campaign-source-phase-selection.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { createCampaignSourceConditions } from "./campaign-source-conditions.js";
import { indexCombatReferences, resolveCombatObjectives } from "./campaign-combat.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { buildCampaignPlan, type CampaignAction, type CampaignSource } from "./campaign.js";
import { campaignStarterSourceIds } from "./campaign-route.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";

const raw = [
  "step",
  ".accept 300001",
  ".accept 300002",
  "step",
  ".complete 300001,1 >>Kill Forest Spider (x10)",
  ".complete 300002,1 >>Stolen Book (8)",
  ".disablecheckbox",
  ".mob Forest Spider",
  "step",
  ".turnin 300001",
  "step",
  ".complete 300002,1 >>Stolen Book (8)",
  ".mob Forest Spider",
  "step",
  ".turnin 300002",
].join("\n");
const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 115)!;
const guide = parseGuideChapter(raw, reference.id, "a".repeat(64), 70205);

describe("text-only source quest reminders", () => {
  it.each([".accept", ".complete", ".turnin"])(
    "does not turn a disabled %s reminder into a quest transition",
    (tag) => {
      const parsed = parseGuideChapter(
        `step\n${tag} 300001,1\n.disablecheckbox`,
        "test",
        "a".repeat(64),
        70205,
      );
      const step = parsed.steps[0]!;
      const profile = createCampaignSourceProfile("human", "warrior");
      const view = getGuideStepView(step, profile, { dungeons: [] });
      expect(displayOnlyQuestPhases(view.directives).size).toBe(1);
      expect(
        createCampaignSourcePhaseSelector(parsed, profile, [])(step, view, view.directives[0]!),
      ).toBe(false);
      const conditions = createCampaignSourceConditions([
        ...view.directives,
        { ...view.directives[0]!, tag: ".isOnQuest", arguments: "300001", questId: null },
      ]);
      expect(conditions?.phases).toEqual([]);
    },
  );
  it("keeps the real later completion and its source identity", () => {
    const sources: CampaignSource[] = campaignStarterSourceIds("human", "warrior").map((id) => {
      const row = CHAPTER_REFERENCES.find((entry) => entry.sourceId === id)!;
      return {
        reference: row,
        guide:
          id === 115
            ? guide
            : parseGuideChapter("step\n+Empty test companion", row.id, "a".repeat(64), 70205),
      };
    });
    const plan = buildCampaignPlan("human", "a".repeat(64), sources, "warrior", {
      starterOnly: true,
    });
    const completions = plan.actions.filter((action) =>
      action.questChanges.some(
        (change) => change.questId === 300002 && change.state === "objectives-complete",
      ),
    );
    expect(completions).toHaveLength(1);
    expect(completions[0]!.source?.stepId).toBe(guide.steps[3]!.id);
  });
  it("does not count a displayed collection or let it obscure a real kill objective", () => {
    const objectives = resolveCombatObjectives(
      guide.steps[1]!.directives,
      indexCombatReferences({
        npcs: [
          {
            id: 114,
            name: "Forest Spider",
            minimumLevel: 2,
            maximumLevel: 2,
            rank: 0,
            zoneIds: [12],
            xpEligibility: "assumed",
          },
        ],
        quests: [
          {
            questId: 300001,
            creatureIds: [114],
            itemCreatureIds: [],
            objectiveText: ["Kill 10 Forest Spiders."],
            onlyCreatureObjectives: true,
          },
        ],
      }),
      "source",
    );
    expect(objectives).toMatchObject([
      { questId: 300001, requiredKills: 10, credit: "shared-kills" },
    ]);
    expect(objectives).toHaveLength(1);
  });
  it("retains the native reminder together with its disabling directive, without requiring it", () => {
    const step = guide.steps[1]!;
    const action: CampaignAction = {
      id: "work",
      legId: "starter",
      title: "Spiders",
      instructions: [],
      positions: [],
      source: { chapterId: guide.chapterId, version: guide.version, stepId: step.id },
      kind: "quests",
      leaderOnly: true,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
      questChanges: [
        { questId: 300001, title: "Spiders", state: "objectives-complete", objectiveIndex: 1 },
      ],
    };
    const plan = {
      release: "fixture",
      race: "human" as const,
      leaderClass: "warrior" as const,
      targetBuild: 70205,
      actions: [action],
      legs: [],
    };
    const native = campaignNativeInstructions(plan, [{ reference, guide }])(action)!;
    expect(native.directives.map((directive) => directive.tag)).toEqual([
      ".complete",
      ".complete",
      ".disablecheckbox",
      ".mob",
    ]);
    expect(native.directives[1]!.questId).toBe(300002);
    const corrupt = {
      ...action,
      questChanges: [...action.questChanges, { ...action.questChanges[0]!, questId: 300002 }],
    };
    expect(() => campaignNativeInstructions(plan, [{ reference, guide }])(corrupt)).toThrow();
  });
  it("does not borrow a checkbox from another parent or a filtered class branch", () => {
    const parsed = parseGuideChapter(
      "step\n.complete 300001,1\n.target Spider\n.disablecheckbox\n.complete 300002,1\n.disablecheckbox <<Mage",
      "test",
      "a".repeat(64),
      70205,
    );
    const step = parsed.steps[0]!;
    for (const classSlug of ["warrior", "mage"] as const) {
      const view = getGuideStepView(step, createCampaignSourceProfile("human", classSlug), {
        dungeons: [],
      });
      const disabled = [...displayOnlyQuestPhases(view.directives)];
      expect(disabled.map((directive) => directive.questId)).toEqual(
        classSlug === "mage" ? [300002] : [],
      );
    }
  });
});
