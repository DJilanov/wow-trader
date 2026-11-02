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
import type { CombatDataset } from "./combat-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";

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
  it("expands a generated whole-quest dungeon task from matched objective evidence without an archive", () => {
    const { plan, evidence } = fixture();
    const action = {
      ...plan.actions[0]!,
      id: "objective",
      wholeQuestObjectives: true as const,
      questChanges: [
        {
          questId: 96394,
          title: "The Restless Dead",
          state: "objectives-complete" as const,
          objectiveIndex: 1,
        },
      ],
    };
    const pickup = {
      ...plan.actions[0]!,
      questChanges: [
        { ...action.questChanges[0]!, state: "accepted" as const, objectiveIndex: null },
      ],
    };
    const turnin = {
      ...pickup,
      id: "turnin",
      questChanges: [{ ...pickup.questChanges[0]!, state: "rewarded" as const }],
    };
    const actions = [pickup, action, turnin];
    const source: CampaignPlan = {
      ...plan,
      actions,
      legs: plan.legs.map((leg) => ({
        ...leg,
        actionIds: actions.map((entry) => entry.id),
        questIds: [96394],
      })),
    };
    const data: CombatDataset = {
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic objective coverage fixture",
      provider: {
        repository: "https://example.test/provider",
        revision: "a".repeat(40),
        layer: "forever-static-with-authored",
        npcSha256: "b".repeat(64),
        questSha256: "c".repeat(64),
        itemSha256: "d".repeat(64),
        limitations: ["Synthetic objective coverage fixture"],
      },
      npcs: [],
      quests: [
        {
          questId: 96394,
          creatureIds: [263389, 263390],
          itemCreatureIds: [],
          objectiveText: [],
          onlyCreatureObjectives: true,
          killQuotas: [
            {
              objectiveIndex: 1,
              npcId: 263389,
              kills: 15,
              source: "Synthetic captured-counter fixture",
            },
            {
              objectiveIndex: 2,
              npcId: 263390,
              kills: 10,
              source: "Synthetic captured-counter fixture",
            },
          ],
        },
      ],
      dungeons: [],
      killXpEvidence: [],
    };
    const before = structuredClone({ source, data });
    const prepared = prepareCampaignPlan(source, [], {
      ...evidence,
      combat: { data, revision: "objective-fixture" },
    });
    expect(
      prepared.actions
        .find((entry) => entry.id === action.id)
        ?.questChanges.map((change) => change.objectiveIndex),
    ).toEqual([1, 2]);
    expect({ source, data }).toEqual(before);
    const native = compileCampaignAddon(prepared, prepared.actions, {
      version: "0.2.0-local-check",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    expect(native.lua).toContain(".complete 96394,1");
    expect(native.lua).toContain(".complete 96394,2");
    const foreign = prepareCampaignPlan(source, [], {
      ...evidence,
      combat: { data: { ...data, targetBuild: 70450 }, revision: "foreign-objective-fixture" },
    });
    expect(
      foreign.actions
        .find((entry) => entry.id === action.id)
        ?.questChanges.map((change) => change.objectiveIndex),
    ).toEqual([1]);
  });

  it("keeps the restored lead-in's real pickup gate when an XP-only historical import omits its minimum", () => {
    const { plan, evidence } = fixture();
    const source = {
      ...plan,
      actions: plan.actions.map((action) => ({
        ...action,
        questChanges: action.questChanges.map((change) => ({ ...change, questId: 2990 })),
      })),
    };
    const prepared = prepareCampaignPlan(source, [], {
      ...evidence,
      rewardFacts: [
        {
          ...evidence.rewardFacts[0]!,
          questId: 2990,
          minimumLevel: null,
          questLevel: 47,
          fullXp: 2100,
          evidenceKind: "historical-reference",
        },
      ],
    });
    expect(prepared.actions.find((action) => action.pickupQuestId === 2990)?.targetLevel).toBe(40);
    expect(prepared.rewardFacts?.find((fact) => fact.questId === 2990)?.evidenceKind).toBe(
      "historical-reference",
    );
  });
  it("can load candidate reward evidence without adding held quests to the active inventory", () => {
    const inventory = {
      actions: [],
      library: { choices: [{ questId: 9, role: "held" as const }] },
    };
    expect(campaignRewardQuestIds(inventory)).toEqual([]);
    expect(campaignRewardQuestIds(inventory, { includeHeldLibrary: true })).toEqual([9]);
  });
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
    expect(prepared).toEqual({
      ...compileCampaignFunding(
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
      flowRevision: "player-route-20261031-v1",
      flightPaths: [],
    });
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
