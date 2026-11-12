import { describe, expect, it } from "vitest";
import captured from "./fixtures/quest-client-timing-70205-70450.json" with { type: "json" };
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { reconcileClientQuestTiming } from "./quest-client-timing.js";
import {
  attachCampaignQuestTiming,
  campaignTimedQuestMethodIssues,
  questDeadlineLabel,
} from "./campaign-quest-timing.js";
import {
  campaignActionReasons,
  updateCampaignAction,
  type CampaignAction,
  type CampaignPlan,
} from "./campaign.js";
import {
  reportCampaignTimedQuestFailure,
  resumeCampaignTimedQuestAttempt,
  timedQuestFailureKey,
} from "./campaign-timed-progress.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { recordCampaignGuideXp } from "./campaign-guide.js";

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog; progress: PremadeProgress } {
  const catalog = reconcileClientQuestTiming({
    catalog: questCatalogSchema.parse(captured.catalog),
    snapshots: captured.snapshots,
    questIds: [257, 258, 647],
  }).catalog;
  const actions = (["accepted", "objectives-complete", "rewarded"] as const).map(
    (state, index): CampaignAction => ({
      id: `timed-${state}`,
      legId: "visit",
      title: "A Hunter's Boast",
      kind: "quests",
      instructions: ["Complete Daryl's challenge."],
      questChanges: [
        { questId: 257, title: "A Hunter's Boast", state, objectiveIndex: index === 1 ? 1 : null },
      ],
      source: null,
      positions: [],
      leaderOnly: false,
      raidOnly: false,
      targetLevel: null,
      targetStopId: null,
    }),
  );
  const plan = attachCampaignQuestTiming(
    {
      release: "timed-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: catalog.targetBuild,
      sourceArchiveSha256: catalog.sourceArchiveSha256,
      sharedQuestsOnly: true,
      actions,
      rewardFacts: [
        {
          questId: 257,
          fullXp: 1150,
          questLevel: 16,
          minimumLevel: 11,
          sourceUrl: "https://www.wowhead.com/forever/quest=257",
          capturedAt: "2026-11-03T00:00:00.000Z",
          status: "available",
          evidenceKind: "published-forever",
          rewardBasis: "final-reward",
          xpByLevel: [],
        },
      ],
      legs: [
        {
          id: "visit",
          title: "Daryl's challenge",
          kind: "preparation",
          from: 16,
          to: 17,
          stopId: null,
          actionIds: actions.map((action) => action.id),
          questIds: [257],
          unresolvedQuestIds: [],
        },
      ],
    },
    catalog,
  );
  const initial = emptyPremadeProgress();
  const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  const progress: PremadeProgress = {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      classSlug: classes[index]!,
      raceId: "human",
      level: 16,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
  return { plan, catalog, progress };
}

describe("timed quest route contracts", () => {
  it("decorates every phase without altering the source, order, positions or reward facts", () => {
    const { plan, catalog } = fixture();
    expect(plan.questTimings).toEqual([
      { questId: 257, title: "A Hunter's Boast", timeLimitSeconds: 900 },
    ]);
    expect(plan.actions[0]!.instructions.join(" ")).toContain("15 minutes from acceptance");
    expect(plan.actions[2]!.instructions.join(" ")).toContain("do not mark the hand-in complete");
    const again = attachCampaignQuestTiming(plan, catalog);
    expect(again).toEqual(plan);
    for (const [index, action] of again.actions.entries()) {
      expect(action).toBe(plan.actions[index]);
      expect(action.positions).toBe(plan.actions[index]!.positions);
    }
    expect(campaignTimedQuestMethodIssues(plan.actions, plan.questTimings).size).toBe(0);
  });

  it("preserves deadline metadata for personal starter exports without changing their indexes", () => {
    const { plan, catalog } = fixture();
    const input: CampaignPlan = {
      ...plan,
      actions: [],
      starters: {
        entries: plan.actions.map(
          ({ questTimings: _questTimings, instructions: _instructions, ...action }) => ({
            action: { ...action, instructions: [] },
            activities: [],
          }),
        ),
        routes: [{ race: "human", classSlug: "priest", legs: plan.legs, actionIndexes: [0, 1, 2] }],
      },
    };
    const result = attachCampaignQuestTiming(input, catalog);
    expect(result.starters!.routes).toBe(input.starters!.routes);
    expect(
      result.starters!.entries.every(
        (entry) => entry.action.questTimings?.[0]?.timeLimitSeconds === 900,
      ),
    ).toBe(true);
    expect(result.starters!.entries[0]!.action.instructions[0]).toContain(
      "15 minutes from acceptance",
    );
  });

  it("refuses mismatching timing references but leaves an unrelated untimed plan unchanged", () => {
    const { plan, catalog } = fixture();
    expect(() => attachCampaignQuestTiming({ ...plan, targetBuild: 70450 }, catalog)).toThrow(
      "references differ",
    );
    const empty: CampaignPlan = { ...plan, targetBuild: 70450, actions: [] };
    expect(attachCampaignQuestTiming(empty, catalog)).toBe(empty);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "refuses an invalid deadline label: %s",
    (seconds) => {
      expect(() => questDeadlineLabel(seconds)).toThrow();
    },
  );

  it("formats actual whole-minute and fractional-minute limits", () => {
    expect(questDeadlineLabel(60)).toBe("1 minute");
    expect(questDeadlineLabel(720)).toBe("12 minutes");
    expect(questDeadlineLabel(90)).toBe("90 seconds");
  });

  it("allows direct travel within an attempt and a single composite pickup and hand-in", () => {
    const { plan } = fixture();
    const travel: CampaignAction = {
      ...plan.actions[1]!,
      id: "travel",
      questChanges: [],
      movement: { kind: "road", destination: "1432", terminal: false },
    };
    expect(
      campaignTimedQuestMethodIssues(
        [plan.actions[0]!, travel, ...plan.actions.slice(1)],
        plan.questTimings,
      ).size,
    ).toBe(0);
    const composite: CampaignAction = {
      ...plan.actions[0]!,
      questChanges: plan.actions.flatMap((action) => action.questChanges),
    };
    expect(campaignTimedQuestMethodIssues([composite], plan.questTimings).size).toBe(0);
  });

  it("holds duplicate or reversed phases within one card and orphaned timed objectives", () => {
    const { plan } = fixture();
    for (const questChanges of [
      [
        ...plan.actions[0]!.questChanges,
        ...plan.actions[0]!.questChanges,
        ...plan.actions[2]!.questChanges,
      ],
      [...plan.actions[2]!.questChanges, ...plan.actions[0]!.questChanges],
      [
        ...plan.actions[1]!.questChanges,
        ...plan.actions[0]!.questChanges,
        ...plan.actions[2]!.questChanges,
      ],
      [
        ...plan.actions[0]!.questChanges,
        ...plan.actions[2]!.questChanges,
        ...plan.actions[1]!.questChanges,
      ],
      plan.actions[1]!.questChanges,
    ]) {
      expect(
        campaignTimedQuestMethodIssues(
          [{ ...plan.actions[0]!, questChanges }],
          plan.questTimings,
        ).has(257),
      ).toBe(true);
    }
  });

  it.each([
    "missing-pickup",
    "missing-return",
    "duplicate-pickup",
    "reversed",
    "unrelated-work",
    "instruction-detour",
  ])("holds incomplete or interleaved timed work: %s", (kind) => {
    const { plan } = fixture();
    const [pickup, work, handIn] = plan.actions as readonly [
      CampaignAction,
      CampaignAction,
      CampaignAction,
    ];
    const actions =
      kind === "missing-pickup"
        ? [work, handIn]
        : kind === "missing-return"
          ? [pickup, work]
          : kind === "duplicate-pickup"
            ? [pickup, { ...pickup, id: "duplicate" }, work, handIn]
            : kind === "reversed"
              ? [handIn, work, pickup]
              : [
                  pickup,
                  {
                    ...work,
                    id: "detour",
                    questChanges:
                      kind === "instruction-detour"
                        ? []
                        : [{ ...work.questChanges[0]!, questId: 258 }],
                  },
                  work,
                  handIn,
                ];
    expect(campaignTimedQuestMethodIssues(actions, plan.questTimings).has(257)).toBe(true);
    const forecast = forecastCampaignXp({ ...plan, actions }, fixture().progress);
    for (const member of forecast[0]!.members) {
      expect(member.issues.some((issue) => issue.code === "quest-timing-unverified")).toBe(true);
      expect(member.rewards).toHaveLength(0);
    }
  });

  it.each(["warrior", "priest", "mage", "rogue", "warlock"] as const)(
    "warns %s before acceptance without starting a premature helper countdown",
    (classSlug) => {
      const { plan } = fixture();
      const artifact = compileCampaignAddon(plan, plan.actions, {
        version: "0.2.0-timed-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        includeObservers: false,
        partyStarter: { race: "human", classSlug },
      });
      const text = artifact.documents
        .filter((document) => document.role === "party")
        .map((document) => document.content)
        .join("\n");
      expect(text.match(/15 minutes from acceptance/g)).toHaveLength(1);
      expect(text.indexOf("15 minutes from acceptance")).toBeLessThan(text.indexOf(".accept 257"));
      expect(text.match(/\.accept 257\b/g)).toHaveLength(1);
      expect(text.match(/\.turnin 257\b/g)).toHaveLength(1);
      expect(text).not.toContain(".timer");
    },
  );
});

describe("failed and expired quest attempts", () => {
  function active(): ReturnType<typeof fixture> {
    const data = fixture();
    return {
      ...data,
      progress: {
        ...data.progress,
        members: data.progress.members.map((member) => ({
          ...member,
          questStates: { "257": "objectives-complete" },
          confirmations: { "campaign-objective-257-1": true, "keep-unrelated": true },
        })),
      },
    };
  }

  it("retains the occupied quest slot and previous work while blocking hand-in reporting", () => {
    const { plan, progress } = active(),
      before = structuredClone(progress);
    const failed = reportCampaignTimedQuestFailure(plan, progress, 257, 3);
    expect(failed.members[3]!.xpNeedsUpdate).toBe(true);
    expect(failed.members[3]!.questStates["257"]).toBe("objectives-complete");
    expect(failed.members[3]!.confirmations["campaign-objective-257-1"]).toBe(true);
    expect(campaignActionReasons(plan.actions[2]!, failed)[0]).toContain("Player 4");
    expect(() => updateCampaignAction(plan, failed, plan.actions[2]!.id, true)).toThrow(
      "failed or expired",
    );
    expect(failed.members[0]).toEqual(progress.members[0]);
    expect(progress).toEqual(before);
  });

  it("prevents earlier party ledgers from paying while a later player's attempt is failed", () => {
    const { plan, progress } = active();
    const failed = reportCampaignTimedQuestFailure(plan, progress, 257, 4);
    for (const keepFresh of [false, true]) {
      const input = {
        ...failed,
        members: failed.members.map((member) => ({
          ...member,
          xpNeedsUpdate: keepFresh ? false : member.xpNeedsUpdate,
        })),
      };
      const rows = forecastCampaignXp(plan, input)[0]!.members;
      for (const row of rows) expect(row.rewards).toHaveLength(0);
      for (const row of rows.slice(0, 4))
        expect(row.issues.some((issue) => issue.code === "quest-attempt-failed")).toBe(true);
      expect(rows[0]!.questLog.used).toBe(1);
    }
  });

  it("requires a real active quest and a fresh XP report before explicitly confirming a retry", () => {
    const { plan, progress } = active();
    const failed = reportCampaignTimedQuestFailure(plan, progress, 257, 2);
    expect(() => resumeCampaignTimedQuestAttempt(plan, failed, 257, 2)).toThrow(
      "current level and XP",
    );
    expect(() => resumeCampaignTimedQuestAttempt(plan, progress, 257, 2)).toThrow(
      "no failed timed attempt",
    );
    expect(() => reportCampaignTimedQuestFailure(plan, fixture().progress, 257, 2)).toThrow(
      "active unhanded-in",
    );
    expect(() => reportCampaignTimedQuestFailure(plan, progress, 999, 2)).toThrow("Unknown");
    expect(() => reportCampaignTimedQuestFailure(plan, progress, 257, 5)).toThrow("Unknown");
    expect(() =>
      resumeCampaignTimedQuestAttempt(
        plan,
        {
          ...failed,
          members: failed.members.map((member) => ({
            ...member,
            level: 16,
            currentXp: 1_000_000,
            xpNeedsUpdate: false,
          })),
        },
        257,
        2,
      ),
    ).toThrow("current level and XP");
  });

  it("restarts only the failed player's objectives from the exact newly recorded XP", () => {
    const { plan, progress } = active();
    const completed: PremadeProgress = {
      ...progress,
      campaigns: {
        [plan.release]: {
          selectedActionId: "timed-rewarded",
          completion: { "timed-objectives-complete": "done", "unrelated-card": "done" },
        },
      },
    };
    const failed = reportCampaignTimedQuestFailure(plan, completed, 257, 2);
    const fresh = recordCampaignGuideXp(plan, failed, 2, 16, 123, "timed-rewarded");
    const result = resumeCampaignTimedQuestAttempt(plan, fresh, 257, 2);
    const member = result.members[2]!;
    expect(member.questStates["257"]).toBe("accepted");
    expect(member.confirmations["campaign-objective-257-1"]).toBeUndefined();
    expect(member.confirmations[timedQuestFailureKey(257)]).toBeUndefined();
    expect(member.confirmations["keep-unrelated"]).toBe(true);
    expect(member.guideXpAnchor).toMatchObject({
      actionId: "timed-objectives-complete",
      level: 16,
      currentXp: 123,
    });
    expect(result.campaigns[plan.release]!.completion).toEqual({ "unrelated-card": "done" });
    expect(result.campaigns[plan.release]!.selectedActionId).toBe("timed-objectives-complete");
    expect(result.members.filter((_entry, index) => index !== 2)).toEqual(
      progress.members.filter((_entry, index) => index !== 2),
    );
    const rows = forecastCampaignXp(plan, result, {
      anchors: [{ ...member.guideXpAnchor!, player: 3 }],
      combat: [{ actionId: "timed-objectives-complete", xpByPlayer: [0, 0, 100, 0, 0] }],
    })[0]!.members;
    expect(rows[2]!.start).toEqual({ level: 16, currentXp: 123 });
    expect(rows[2]!.referenceQuestXp).toBe(1150);
    expect(rows[2]!.combatXp).toBe(100);
    expect(rows[2]!.endpoint).toEqual({ level: 16, currentXp: 1373 });
  });
});
