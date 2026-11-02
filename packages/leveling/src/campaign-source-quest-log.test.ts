import { describe, expect, it } from "vitest";
import { parseGuideChapter } from "./guide-archive.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { emptyPremadeProgress } from "./premade-model.js";
import {
  campaignActionNeeded,
  updateCampaignAction,
  type CampaignAction,
  type CampaignPlan,
} from "./campaign.js";
import { questLogUsage } from "./quest-log.js";
import { forecastCampaignXp } from "./campaign-xp.js";

function control(): { plan: CampaignPlan; progress: ReturnType<typeof emptyPremadeProgress> } {
  const step = parseGuideChapter(
    "step\n#optional\n.turnin 384\n.isQuestComplete 384",
    "guarded-slot-control",
    "a".repeat(64),
    70205,
  ).steps[0]!;
  const handIn: CampaignAction = {
    id: "conditional-hand-in",
    legId: "control",
    title: "Conditional hand-in",
    instructions: [],
    positions: [],
    source: campaignActionSource(
      { chapterId: "guarded-slot-control", version: "test" },
      step,
      step.directives,
    ),
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: [
      { questId: 384, state: "rewarded", objectiveIndex: null, title: "Ribs control" },
    ],
  };
  const pickup: CampaignAction = {
    ...handIn,
    id: "next-pickup",
    source: null,
    questChanges: [
      { questId: 300001, state: "accepted", objectiveIndex: null, title: "Next quest" },
    ],
  };
  const plan: CampaignPlan = {
    rewardFacts: [384, 300001].map((questId) => ({
      questId,
      fullXp: questId === 384 ? 100 : 0,
      questLevel: 10,
      minimumLevel: 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/conditional-control",
      capturedAt: "2026-11-01T00:00:00.000Z",
    })),
    release: "conditional-slot-control",
    race: "dwarf",
    leaderClass: "priest",
    targetBuild: 70205,
    actions: [handIn, pickup],
    legs: [
      {
        id: "control",
        title: "Control",
        from: 1,
        to: 2,
        kind: "preparation",
        actionIds: [handIn.id, pickup.id],
        questIds: [384, 300001],
        unresolvedQuestIds: [],
        stopId: null,
      },
    ],
  };
  const progress = emptyPremadeProgress();
  progress.members = progress.members.map((member) => ({
    ...member,
    level: 10,
    currentXp: 0,
    xpNeedsUpdate: false,
    questStates: {
      "384": "accepted",
      ...Object.fromEntries(
        Array.from({ length: 39 }, (_, index) => [String(400000 + index), "accepted" as const]),
      ),
    },
  }));
  return { plan, progress };
}

describe("conditional source hand-in capacity", () => {
  it("does not turn an inferred carried quest into certain reward history for availability guards", () => {
    const { plan, progress } = control();
    progress.members = progress.members.map((member) => ({
      ...member,
      questStates: Object.fromEntries(
        Object.entries(member.questStates).filter(([id]) => id !== "384"),
      ),
    }));
    const actions: CampaignAction[] = [
      { ...plan.actions[0]!, source: null },
      ...[300001, 300002].map((questId): CampaignAction => {
        const step = parseGuideChapter(
          `step\n.accept ${questId}\n.isQuestAvailable 384`,
          "control",
          "a".repeat(64),
          70205,
        ).steps[0]!;
        return {
          ...plan.actions[1]!,
          id: `child-${questId}`,
          source: campaignActionSource(
            { chapterId: "control", version: "test" },
            step,
            step.directives,
          ),
          questChanges: [
            { questId, state: "accepted", objectiveIndex: null, title: "Availability control" },
          ],
        };
      }),
    ];
    const tested = {
      ...plan,
      actions,
      legs: plan.legs.map((leg) => ({ ...leg, actionIds: actions.map((action) => action.id) })),
    };
    for (const member of auditCampaignQuestLog(tested, progress)) {
      expect(member.peakUpperBound).toBe(41);
      expect(member.withinCapacity).toBe(false);
    }
  });
  it.each(["already-held", "newly-accepted"] as const)(
    "includes pickups unlocked by a possibly completed %s quest",
    (start) => {
      const { plan, progress } = control();
      const guardedPickup = (questId: number): CampaignAction => {
        const step = parseGuideChapter(
          `step\n.accept ${questId}\n.isQuestTurnedIn 384`,
          "control",
          "a".repeat(64),
          70205,
        ).steps[0]!;
        return {
          ...plan.actions[1]!,
          id: `child-${questId}`,
          source: campaignActionSource(
            { chapterId: "control", version: "test" },
            step,
            step.directives,
          ),
          questChanges: [
            {
              questId,
              state: "accepted",
              objectiveIndex: null,
              title: "Conditional child control",
            },
          ],
        };
      };
      const setup: CampaignAction = {
        ...plan.actions[1]!,
        id: "setup-parent",
        questChanges: [
          {
            questId: 384,
            state: start === "already-held" ? "objectives-complete" : "accepted",
            objectiveIndex: start === "already-held" ? 2 : null,
            title: "Partial parent control",
          },
        ],
      };
      if (start === "newly-accepted")
        progress.members = progress.members.map((member) => ({
          ...member,
          questStates: Object.fromEntries(
            Object.entries(member.questStates).filter(([id]) => id !== "384"),
          ),
        }));
      const actions = [setup, plan.actions[0]!, guardedPickup(300001), guardedPickup(300002)];
      const tested: CampaignPlan = {
        ...plan,
        actions,
        legs: plan.legs.map((leg) => ({ ...leg, actionIds: actions.map((action) => action.id) })),
        combat: {
          revision: "synthetic",
          sourceRevision: "synthetic",
          targetBuild: 70205,
          npcs: [],
          activities: [],
          notice: null,
          questObjectiveIndexes: { "384": [1, 2] },
        },
      };
      for (const member of auditCampaignQuestLog(tested, progress)) {
        expect(member.peakUpperBound).toBeGreaterThanOrEqual(41);
        expect(member.withinCapacity).toBe(false);
        expect(member.carriedAtEnd).toContain("quest:300001");
        expect(member.carriedAtEnd).toContain("quest:300002");
      }
    },
  );

  it("retains a held quest when its source hand-in skips, blocking the forty-first pickup", () => {
    const { plan, progress } = control();
    for (const member of auditCampaignQuestLog(plan, progress)) {
      expect(member.peakUpperBound).toBe(41);
      expect(member.withinCapacity).toBe(false);
      expect(member.firstPotentialOverflowActionId).toBe("next-pickup");
      expect(member.carriedAtEnd).toContain("quest:384");
    }
  });

  it("frees the slot when the recorded completed quest satisfies its source guard", () => {
    const { plan, progress } = control();
    progress.members = progress.members.map((member) => ({
      ...member,
      questStates: { ...member.questStates, "384": "objectives-complete" },
    }));
    for (const member of auditCampaignQuestLog(plan, progress)) {
      expect(member.peakUpperBound).toBe(40);
      expect(member.withinCapacity).toBe(true);
      expect(member.carriedAtEnd).not.toContain("quest:384");
    }
  });

  it("keeps an uncertain resource-controlled hand-in occupied until an unconditional hand-in", () => {
    const { plan, progress } = control();
    const step = parseGuideChapter(
      "step\n.turnin 384\n.itemcount 2886,6",
      "control",
      "a".repeat(64),
      70205,
    ).steps[0]!;
    const guarded = {
      ...plan.actions[0]!,
      source: campaignActionSource(
        { chapterId: "control", version: "test" },
        step,
        step.directives,
      ),
    };
    const before = { ...plan, actions: [guarded, plan.actions[1]!] };
    expect(auditCampaignQuestLog(before, progress)[0]!.peakUpperBound).toBe(41);
    const unconditional = { ...guarded, id: "unconditional-hand-in", source: null };
    const after = {
      ...plan,
      actions: [guarded, unconditional, plan.actions[1]!],
      legs: plan.legs.map((leg) => ({
        ...leg,
        actionIds: [guarded.id, unconditional.id, plan.actions[1]!.id],
      })),
    };
    const result = auditCampaignQuestLog(after, progress)[0]!;
    expect(result.peakUpperBound).toBe(40);
    expect(result.carriedAtEnd).not.toContain("quest:384");
  });
});

describe("conditional source XP and slot accounting", () => {
  it("does not turn a skipped task into a rewarded quest when advancing the interactive guide", () => {
    const { plan, progress } = control();
    expect(campaignActionNeeded(plan, progress, plan.actions[0]!)).toBe(false);
    const updated = updateCampaignAction(plan, progress, plan.actions[0]!.id, true);
    for (const member of updated.members) {
      expect(member.questStates["384"]).toBe("accepted");
      expect(questLogUsage(member.questStates).used).toBe(40);
      expect(member.xpNeedsUpdate).toBe(false);
    }
  });
  it("skips the guarded hand-in without XP and blocks a new pickup at 40 held quests", () => {
    const { plan, progress } = control();
    for (const member of forecastCampaignXp(plan, progress)[0]!.members) {
      expect(member.rewards).toEqual([]);
      expect(member.knownEndpoint).toEqual({ level: 10, currentXp: 0 });
      expect(member.questLog).toEqual({ capacity: 40, used: 40, peak: 40 });
      expect(member.sourceSkips).toEqual([{ actionId: "conditional-hand-in", decision: "skip" }]);
      expect(member.issues.some((issue) => issue.code === "quest-log-full")).toBe(true);
      expect(member.steps.some((step) => step.questId === 384)).toBe(false);
    }
  });

  it("rewards the recorded completed quest once and frees room for the next pickup", () => {
    const { plan, progress } = control();
    progress.members = progress.members.map((member) => ({
      ...member,
      questStates: { ...member.questStates, "384": "objectives-complete" },
    }));
    for (const member of forecastCampaignXp(plan, progress)[0]!.members) {
      expect(member.referenceQuestXp).toBe(100);
      expect(member.rewards.map((reward) => reward.questId)).toEqual([384]);
      expect(member.questLog).toEqual({ capacity: 40, used: 40, peak: 40 });
      expect(member.blockedReason).toBeNull();
    }
  });

  it("does not infer ribs or a full quest completion from the vendor objective alone", () => {
    const { plan, progress } = control();
    const step = parseGuideChapter(
      "step\n#optional\n.complete 384,2\n.itemcount 2886,6",
      "control",
      "a".repeat(64),
      70205,
    ).steps[0]!;
    const purchase: CampaignAction = {
      ...plan.actions[0]!,
      id: "conditional-purchase",
      source: campaignActionSource(
        { chapterId: "control", version: "test" },
        step,
        step.directives,
      ),
      questChanges: [
        { questId: 384, state: "objectives-complete", objectiveIndex: 2, title: "Malt control" },
      ],
    };
    const tested: CampaignPlan = {
      ...plan,
      actions: [purchase, plan.actions[0]!],
      legs: plan.legs.map((leg) => ({ ...leg, actionIds: [purchase.id, plan.actions[0]!.id] })),
      combat: {
        revision: "synthetic",
        sourceRevision: "synthetic",
        targetBuild: 70205,
        npcs: [],
        activities: [],
        notice: null,
        questObjectiveIndexes: { "384": [1, 2] },
      },
    };
    for (const member of forecastCampaignXp(tested, progress)[0]!.members) {
      expect(member.rewards).toEqual([]);
      expect(member.questLog.used).toBe(40);
      expect(member.blockedReason).toBeNull();
      expect(member.sourceSkips).toEqual([
        { actionId: purchase.id, decision: "unknown" },
        { actionId: plan.actions[0]!.id, decision: "skip" },
      ]);
      expect(member.steps).toEqual([]);
    }
    const unguarded: CampaignPlan = {
      ...tested,
      actions: [
        { ...purchase, source: null },
        { ...plan.actions[0]!, source: null },
      ],
    };
    for (const member of forecastCampaignXp(unguarded, progress)[0]!.members) {
      expect(member.rewards).toEqual([]);
      expect(member.issues.some((issue) => issue.code === "quest-objectives-incomplete")).toBe(
        true,
      );
      expect(member.questLog.used).toBe(40);
    }
  });

  it("holds a required unrecorded resource condition without inventing progress", () => {
    const { plan, progress } = control();
    const step = parseGuideChapter(
      "step\n.turnin 384\n.itemcount 2886,6",
      "control",
      "a".repeat(64),
      70205,
    ).steps[0]!;
    const tested: CampaignPlan = {
      ...plan,
      actions: [
        {
          ...plan.actions[0]!,
          source: campaignActionSource(
            { chapterId: "control", version: "test" },
            step,
            step.directives,
          ),
        },
      ],
    };
    for (const member of forecastCampaignXp(tested, progress)[0]!.members) {
      expect(member.rewards).toEqual([]);
      expect(member.endpoint).toBeNull();
      expect(member.questLog.used).toBe(40);
      expect(member.issues.some((issue) => issue.code === "source-condition-unobserved")).toBe(
        true,
      );
    }
  });
});
