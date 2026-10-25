import { describe, expect, it } from "vitest";
import {
  campaignRewardQuestIds,
  prepareCampaignPlan,
  type CampaignPreparationEvidence,
} from "./campaign-preparation.js";
import { DUNGEON_FINISH_OPTIONS } from "./dungeon-finish.js";
import type { CampaignPlan } from "./campaign.js";
import type { CampaignQuestBatch } from "./campaign-catchup.js";
import { compileCampaignFunding } from "./campaign-catchup-planner.js";
import { compileCampaignPickupGates } from "./campaign-pickup-gates.js";

function fixture(): { plan: CampaignPlan; evidence: CampaignPreparationEvidence } {
  const action = {
    id: "pickup",
    legId: "route",
    title: "Accept a quest",
    instructions: [],
    questChanges: [
      { questId: 10, state: "accepted" as const, title: "Quest", objectiveIndex: null },
    ],
    positions: [],
    source: null,
    kind: "quests" as const,
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
  const batch: CampaignQuestBatch = {
    id: "extra",
    questId: 11,
    title: "Kill objectives",
    zone: "Elwynn Forest",
    referenceLevel: 5,
    sourceIds: [],
    objectiveType: "shared-kills",
    conditional: false,
    actions: [],
  };
  return {
    plan: {
      release: "fixture",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [action],
      legs: [
        {
          id: "route",
          title: "Route",
          from: 1,
          to: 10,
          kind: "xp-bridge",
          actionIds: [action.id],
          questIds: [10],
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
      catchUpBatches: [
        batch,
        { ...batch, id: "conditional", questId: 12, conditional: true },
        { ...batch, id: "collection", questId: 13, objectiveType: "collection" },
      ],
    },
    evidence: {
      starters: { entries: [], routes: [] },
      rewardFacts: [10, 11, 12, 13, 99].map((questId) => ({
        questId,
        fullXp: 100,
        questLevel: 10,
        minimumLevel: 5,
        xpByLevel: [],
        sourceUrl: "https://example.test/quest=" + questId,
        capturedAt: "2026-10-22T00:00:00Z",
        status: "available" as const,
      })),
      rewardRevision: "fixture-evidence",
      rewardBuild: 70450,
      rewardNotice: null,
      combat: null,
    },
  };
}

describe("shared browser and offline campaign preparation", () => {
  it("loads optional circuit rewards even when the old linear route never used their quests", () => {
    const { plan, evidence } = fixture();
    const circuit = { ...plan, dungeonFinish: true };
    const wanted = campaignRewardQuestIds(circuit);
    for (const id of DUNGEON_FINISH_OPTIONS.flatMap((option) => option.questIds))
      expect(wanted).toContain(id);
    expect(new Set(wanted).size).toBe(wanted.length);
    const extraFact = { ...evidence.rewardFacts[0]!, questId: 7441 };
    expect(
      prepareCampaignPlan(circuit, [], {
        ...evidence,
        rewardFacts: [...evidence.rewardFacts, extraFact],
      }).rewardFacts,
    ).toContainEqual(extraFact);
  });
  it("uses the website's supported quest inventory and pickup/funding order without mutating inputs", () => {
    const { plan, evidence } = fixture();
    const before = structuredClone({ plan, evidence });
    const prepared = prepareCampaignPlan(plan, [], evidence);
    expect(prepared.catchUpBatches?.map((batch) => batch.id)).toEqual(["extra"]);
    expect(prepared.rewardFacts?.map((fact) => fact.questId)).toEqual([10, 11]);
    expect(prepared.actions.map((action) => action.id)).toEqual(["route-level-5-10", "pickup"]);
    expect(prepared.rewardBuild).toBe(70450);
    expect({ plan, evidence }).toEqual(before);
    expect(prepared).toEqual(
      compileCampaignFunding(
        compileCampaignPickupGates({
          ...plan,
          starters: evidence.starters,
          catchUpBatches: [plan.catchUpBatches![0]!],
          rewardFacts: evidence.rewardFacts.slice(0, 2),
          rewardRevision: evidence.rewardRevision,
          rewardBuild: evidence.rewardBuild,
          rewardNotice: evidence.rewardNotice,
        }),
      ),
    );
  });

  it("does not confuse reviewed runtime identity with the older route source build", () => {
    const { plan, evidence } = fixture();
    const prepared = prepareCampaignPlan(plan, [], { ...evidence, rewardBuild: null });
    expect(prepared.targetBuild).toBe(70205);
    expect(prepared.rewardBuild).toBeNull();
    expect(prepared.questValidationCoverage).toBeUndefined();
    expect(prepared.actions[0]!.targetLevel).toBe(5);
  });
});
