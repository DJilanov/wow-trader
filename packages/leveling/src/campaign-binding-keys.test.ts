import { describe, expect, it } from "vitest";
import { carryCampaignBindingKeys } from "./campaign-binding-keys.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import type { CampaignFundingExecutor } from "./campaign-funding-scenarios.js";
import data from "./fixtures/arathi-wanted-bounties-70205.json" with { type: "json" };

function fixture(): { plan: CampaignPlan; source: CampaignSource } {
  const guide = importedChapterSchema.parse(structuredClone(data.guide));
  const step = guide.steps.find((entry) => entry.id === "source-step-0011")!;
  const positions = step.directives.flatMap((directive) => directive.position
    ? [{ sourceLine: directive.sourceLine, position: directive.position }] : []);
  const base: CampaignAction = {
    id: "parent", legId: "early", title: "Turn in The Princess Trapped",
    instructions: [], positions, source: { chapterId: guide.chapterId, version: guide.version, stepId: step.id },
    kind: "quests", leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    questChanges: [{ questId: 642, state: "rewarded", title: "The Princess Trapped", objectiveIndex: null }],
  };
  const actions: CampaignAction[] = [base,
    { ...base, id: "elsewhere", title: "Other regional work", source: null, positions: [],
      questChanges: [], kind: "instructions" },
    { ...base, id: "pickup", legId: "late", title: "Accept Stones of Binding",
      questChanges: [{ questId: 651, state: "accepted", title: "Stones of Binding", objectiveIndex: null }] },
    { ...base, id: "keys", legId: "late", source: null, positions: [],
      questChanges: [1, 2, 3].map((objectiveIndex) => ({ questId: 651,
        state: "objectives-complete", title: "Stones of Binding", objectiveIndex })) },
    { ...base, id: "handin", legId: "late", source: null, positions: [],
      questChanges: [{ questId: 651, state: "rewarded", title: "Stones of Binding", objectiveIndex: null }] },
  ];
  const plan: CampaignPlan = {
    release: "binding-exchange-test", race: "human", leaderClass: "warrior", targetBuild: 70205,
    sharedQuestsOnly: true, sourceArchiveSha256: data.catalog.sourceArchiveSha256,
    actions, legs: ["early", "late"].map((id) => ({ id, title: id, from: 35, to: 36,
      kind: "preparation", stopId: null, actionIds: actions.filter((action) => action.legId === id)
        .map((action) => action.id), questIds: id === "early" ? [642] : [651], unresolvedQuestIds: [] })),
    rewardFacts: [642, 651].map((questId) => ({ questId, fullXp: questId === 651 ? 2850 : 0,
      minimumLevel: 30, questLevel: 38, xpByLevel: [], sourceUrl: "https://example.test/reward",
      capturedAt: "2026-11-04T00:00:00.000Z", status: "available", evidenceKind: "historical-reference" })),
  };
  return { plan, source: { guide, reference: CHAPTER_REFERENCES.find((entry) => entry.id === guide.chapterId)! } };
}

const states: CampaignFundingExecutor = (plan) => {
  const initial = emptyPremadeProgress();
  const progress = { ...initial, difficultyPolicy: "experienced-premade" as const,
    members: initial.members.map((member) => ({ ...member, level: 35, currentXp: 0,
      xpNeedsUpdate: false, questStates: { "642": "objectives-complete" as const } })) };
  return [{ difficultyPolicy: "experienced-premade", starterMode: "together", strategy: "dungeons",
    optionalStops: true, lootScenario: "expected", progress, actions: plan.actions,
    forecast: forecastCampaignXp(plan, progress) }];
};

describe("captured binding-key pickup exchange", () => {
  it("takes the follow-up during the earlier exact source exchange, retaining later key work and XP", () => {
    const { plan, source } = fixture(), original = structuredClone(plan);
    const next = carryCampaignBindingKeys(plan, [source], questCatalogSchema.parse(data.catalog), states);
    expect(next.actions.map((action) => action.id)).toEqual(["parent", "pickup", "elsewhere", "keys", "handin"]);
    expect(next.actions[1]).toEqual({ ...plan.actions[2]!, legId: "early" });
    expect(next.legs[0]!.actionIds).toEqual(["parent", "pickup", "elsewhere"]);
    expect(next.legs[1]!.actionIds).toEqual(["keys", "handin"]);
    const before = states(plan)[0]!, after = states(next)[0]!;
    for (let player = 0; player < 5; player++) {
      expect(after.forecast.at(-1)!.members[player]!.knownEndpoint)
        .toEqual(before.forecast.at(-1)!.members[player]!.knownEndpoint);
      expect(after.forecast.flatMap((section) => section.members[player]!.steps)
        .filter((step) => step.status === "projected" && step.phase === "rewarded" && step.questId === 651))
        .toHaveLength(1);
    }
    expect(plan).toEqual(original);
    expect(carryCampaignBindingKeys(next, [source], questCatalogSchema.parse(data.catalog), states)).toBe(next);
  });

  it.each(["locked-anchor", "locked-pickup", "different-source", "different-position", "timer", "level", "prerequisite", "capacity"])(
    "holds the original itinerary when %s prevents a safe earlier pickup", (reason) => {
      const { plan, source } = fixture();
      const catalog = questCatalogSchema.parse(data.catalog);
      const actions = [...plan.actions];
      const locked = new Set<string>();
      let executor = states;
      let captured = source;
      if (reason === "locked-anchor") locked.add("parent");
      if (reason === "locked-pickup") locked.add("pickup");
      if (reason === "different-source") actions[2] = { ...actions[2]!, source: { ...actions[2]!.source!, version: "other" } };
      if (reason === "different-position") actions[2] = { ...actions[2]!, positions: [] };
      if (reason === "timer") captured = { ...source, guide: { ...source.guide,
        steps: source.guide.steps.map((step) => step.id !== "source-step-0011" ? step : { ...step,
          directives: [...step.directives, { ...step.directives[0]!, tag: ".timer", arguments: "30" }] }) } };
      if (reason === "level" || reason === "prerequisite") executor = (candidate) => states(candidate).map((state) => ({ ...state,
        progress: { ...state.progress, members: state.progress.members.map((member) => ({ ...member,
          ...(reason === "level" ? { level: 29 } : { questStates: {} }) })) },
        forecast: forecastCampaignXp(candidate, { ...state.progress, members: state.progress.members.map((member) => ({ ...member,
          ...(reason === "level" ? { level: 29 } : { questStates: {} }) })) }),
      }));
      if (reason === "capacity") executor = (candidate) => states(candidate).map((state) => ({ ...state,
        progress: { ...state.progress, members: state.progress.members.map((member) => ({ ...member,
          questStates: { ...member.questStates, ...Object.fromEntries(Array.from({ length: 40 }, (_, index) =>
            [String(300000 + index), "accepted" as const])) } })) },
      }));
      const candidate = { ...plan, actions };
      expect(carryCampaignBindingKeys(candidate, [captured], catalog, executor, locked)).toBe(candidate);
    },
  );
});
