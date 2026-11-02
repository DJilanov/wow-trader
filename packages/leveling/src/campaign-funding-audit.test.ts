import { describe, expect, it } from "vitest";
import { auditCampaignGuideFunding } from "./campaign-funding-audit.js";
import { forecastCampaignGuide, recordCampaignGuideXp } from "./campaign-guide.js";
import { emptyPremadeProgress } from "./premade-model.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";

function fixture(reward = 7400): CampaignPlan {
  const base: CampaignAction = {
    id: "quests",
    legId: "prepare",
    title: "Shared quest batch",
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      questId: 300001,
      title: "Shared patrol",
      state,
      objectiveIndex: state === "objectives-complete" ? 1 : null,
    })),
  };
  const gate: CampaignAction = {
    ...base,
    id: "departure",
    questChanges: [],
    kind: "xp-check",
    targetLevel: 16,
    targetStopId: null,
  };
  const entry: CampaignAction = {
    ...gate,
    id: "entry",
    legId: "dungeon-thanes",
    kind: "checkpoint",
  };
  return {
    release: "funding-audit-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions: [base, gate, entry],
    legs: [
      {
        id: "prepare",
        title: "Preparation",
        from: 10,
        to: 16,
        kind: "xp-bridge",
        stopId: null,
        actionIds: [base.id, gate.id],
        questIds: [300001],
        unresolvedQuestIds: [],
      },
      {
        id: "dungeon-thanes",
        title: "Example level-16 dungeon",
        from: 16,
        to: 18,
        kind: "dungeon",
        stopId: null,
        actionIds: [entry.id],
        questIds: [],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [
      {
        questId: 300001,
        fullXp: reward,
        minimumLevel: 1,
        questLevel: 60,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/quest=300001",
        capturedAt: "2026-10-31T00:00:00.000Z",
      },
    ],
  };
}
function startingAt(
  plan: CampaignPlan,
  level: number,
  xp = 0,
): ReturnType<typeof emptyPremadeProgress> {
  let progress = emptyPremadeProgress();
  for (let index = 0; index < 5; index++)
    progress = recordCampaignGuideXp(plan, progress, index, level, xp, "quests");
  return progress;
}

describe("independent no-grind XP witness", () => {
  it("checks bounded contributions and rejects a displayed endpoint that disagrees with its enclosure", () => {
    const base = fixture(7400);
    const plan: CampaignPlan = {
      ...base,
      combat: {
        revision: "range-fixture",
        sourceRevision: "range-fixture",
        targetBuild: 70205,
        notice: null,
        npcs: [
          {
            id: 1,
            name: "Synthetic patrol",
            minimumLevel: 10,
            maximumLevel: 12,
            rank: 0,
            zoneIds: [12],
            xpEligibility: "assumed",
          },
        ],
        activities: [
          {
            id: "range-work",
            actionId: "quests",
            environment: "outdoor",
            profile: null,
            objectives: [
              {
                questId: 300001,
                objectiveIndex: 1,
                npcIds: [1],
                credit: "shared-kills",
                requiredKills: 5,
                source: "Synthetic fixed kill quota",
                reason: null,
              },
            ],
          },
        ],
      },
    };
    const input = startingAt(plan, 10, 7500);
    const forecast = forecastCampaignGuide(plan, input);
    expect(forecast.sections[0]!.forecast.members[0]!.xpBounds).toBeDefined();
    expect(auditCampaignGuideFunding(plan, input, forecast).witnessPassed).toBe(true);
    const corrupted = {
      ...forecast,
      sections: forecast.sections.map((section, index) =>
        index !== 0
          ? section
          : {
              ...section,
              forecast: {
                ...section.forecast,
                members: section.forecast.members.map((member) => ({
                  ...member,
                  knownEndpoint: member.knownEndpoint
                    ? { ...member.knownEndpoint, currentXp: member.knownEndpoint.currentXp + 1 }
                    : null,
                })),
              },
            },
      ),
    };
    expect(auditCampaignGuideFunding(plan, input, corrupted).witnessPassed).toBe(false);
  });
  it("exposes the 10.47-to-16 preparation deficit for every party member", () => {
    const plan = fixture(),
      progress = startingAt(plan, 10, 3600);
    const before = JSON.stringify({ plan, progress });
    const audit = auditCampaignGuideFunding(plan, progress);
    expect(audit.witnessPassed).toBe(true);
    expect(audit.funded).toBe(false);
    const preparation = audit.chapters[0]!;
    expect(preparation.players).toHaveLength(5);
    for (const player of preparation.players)
      expect(player).toMatchObject({
        questXp: 7400,
        requiredKillXp: 0,
        start: { level: 10, currentXp: 3600 },
        finish: { level: 11, currentXp: 3400 },
        missingXp: 54200,
        failedCheckpointIds: ["departure"],
        funded: false,
        witnessErrors: [],
      });
    expect(audit.chapters[1]!.funded).toBe(false);
    expect(JSON.stringify({ plan, progress })).toBe(before);
  });
  it("detects an invented checkpoint award even when the displayed level arithmetic balances", () => {
    const plan = fixture(),
      progress = startingAt(plan, 10, 3600);
    const forecast = forecastCampaignGuide(plan, progress);
    const first = forecast.sections[0]!;
    const corrupted = {
      ...forecast,
      sections: [
        {
          ...first,
          forecast: {
            ...first.forecast,
            members: first.forecast.members.map((member, index) =>
              index
                ? member
                : {
                    ...member,
                    endpoint: { level: 16, currentXp: 0 },
                    knownEndpoint: { level: 16, currentXp: 0 },
                    combatXp: 54200,
                    estimatedCombatXp: 54200,
                  },
            ),
          },
        },
        ...forecast.sections.slice(1),
      ],
    };
    const audit = auditCampaignGuideFunding(plan, progress, corrupted);
    expect(audit.witnessPassed).toBe(false);
    expect(audit.chapters[0]!.players[0]!.witnessErrors).toContain(
      "Combat XP has no matching required-kill rows.",
    );
    expect(audit.chapters[0]!.players[0]!.witnessErrors).toContain(
      "The forecast contains extra grinding XP.",
    );
  });
  it("does not count a missing hand-in reward or certify later blocked chapters", () => {
    const plan = { ...fixture(), rewardFacts: [] },
      progress = startingAt(plan, 10, 3600);
    const audit = auditCampaignGuideFunding(plan, progress);
    expect(audit.funded).toBe(false);
    expect(audit.chapters.every((chapter) => !chapter.funded)).toBe(true);
    expect(audit.chapters[0]!.players[0]!.questXp).toBe(0);
    expect(audit.chapters[0]!.players[0]!.finish).toBeNull();
  });
  it("accepts a genuine funded checkpoint with full hand-in XP for each player", () => {
    const plan = fixture(61600),
      progress = startingAt(plan, 10, 3600);
    const audit = auditCampaignGuideFunding(plan, progress);
    expect(
      audit.chapters[0]!.players.every(
        (player) =>
          player.questXp === 61600 &&
          player.requiredKillXp === 0 &&
          player.missingXp === 0 &&
          player.funded,
      ),
    ).toBe(true);
    expect(audit.witnessPassed).toBe(true);
  });
  it("accounts for XP discarded at the level-60 cap without reporting a false imbalance", () => {
    const base = fixture(500000);
    const plan = {
      ...base,
      legs: base.legs.map((leg, index) => (index ? leg : { ...leg, kind: "preparation" as const })),
    };
    const progress = startingAt(plan, 59);
    const audit = auditCampaignGuideFunding(plan, progress);
    expect(audit.witnessPassed).toBe(true);
    expect(audit.chapters[0]!.players[0]!.finish).toEqual({ level: 60, currentXp: 0 });
  });
  it("holds later reward forecasting after a conflicting kill quota", () => {
    const plan: CampaignPlan = {
      ...fixture(61600),
      combat: {
        revision: "synthetic-conflict",
        sourceRevision: "synthetic",
        targetBuild: 70205,
        notice: null,
        npcs: [
          {
            id: 1,
            name: "Wolf",
            minimumLevel: 1,
            maximumLevel: 1,
            rank: 0,
            zoneIds: [12],
            xpEligibility: "assumed",
          },
        ],
        activities: [
          {
            id: "combat-quests",
            actionId: "quests",
            environment: "outdoor",
            profile: null,
            objectives: [
              {
                questId: 300001,
                objectiveIndex: 1,
                npcIds: [1],
                requiredKills: null,
                credit: "unknown",
                source: "synthetic",
                quotaConflict: true,
                reason: "Kill quota references conflict.",
              },
            ],
          },
        ],
      },
    };
    const progress = startingAt(plan, 10, 3600);
    const forecast = forecastCampaignGuide(plan, progress);
    const audit = auditCampaignGuideFunding(plan, progress, forecast);
    expect(audit.witnessPassed).toBe(true);
    expect(audit.funded).toBe(false);
    expect(audit.chapters[0]!.players[0]).toMatchObject({ missingXp: null, funded: false });
    expect(audit.chapters[0]!.players[0]!.blockedReason).toContain(
      "reward at the next hand-in is unresolved",
    );
    expect(
      forecast.sections[0]!.forecast.members[0]!.issues.some((issue) =>
        issue.message.includes("Kill quota references conflict"),
      ),
    ).toBe(true);
  });
});
