import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignQuestChange } from "./campaign.js";
import type { CampaignFundingBatch } from "./campaign-funding-quests.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { batchFundingNpcVisit } from "./campaign-funding-visit.js";

const firstId = 430001,
  secondId = 430002,
  seedId = 430003,
  anchorId = 430004,
  farId = 430005,
  endId = 430006;

function action(
  id: string,
  questId: number,
  states: readonly CampaignQuestChange["state"][],
  zone = "1431",
): CampaignAction {
  return {
    id,
    legId: "prepare",
    kind: "quests",
    title: id,
    instructions: [],
    source: null,
    positions: [
      { sourceLine: 0, position: { zone, x: 50, y: 50, floor: null, space: "map-percent" } },
    ],
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: states.map((state) => ({ questId, title: id, state, objectiveIndex: null })),
  };
}

function fixture(): { plan: CampaignPlan; batch: CampaignFundingBatch; catalog: QuestCatalog } {
  const batchActions = [firstId, secondId].flatMap((id) =>
    (["accepted", "rewarded"] as const).map((phase) => ({
      ...action(`${id}-${phase}`, id, [phase]),
      fundingCheckpointId: "gate",
      libraryBackbone: true,
      ...(id === secondId && phase === "accepted" ? { requiredQuestIds: [firstId] } : {}),
    })),
  );
  const actions: CampaignAction[] = [
    { ...action("seed", seedId, ["accepted", "rewarded"]), legId: "start" },
    action("anchor", anchorId, ["accepted", "rewarded"]),
    action("far", farId, ["accepted", "rewarded"], "1439"),
    ...batchActions,
    action("end", endId, ["accepted", "rewarded"], "1442"),
    { ...action("gate", endId, []), kind: "xp-check", targetLevel: 3 },
  ];
  const quests: QuestCatalogEntry[] = [firstId, secondId].map((questId) => ({
    questId,
    title: `Quest ${questId}`,
    minimumLevel: 2,
    questLevel: 3,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [
      {
        npcId: 123,
        name: "Sender",
        friendlyToAlliance: true,
        positions: [{ zone: "1431", x: 50, y: 50 }],
      },
    ],
    ends: [
      {
        npcId: 124,
        name: "Recipient",
        friendlyToAlliance: true,
        positions: [{ zone: "1431", x: 50, y: 50 }],
      },
    ],
    prerequisites: { allOf: questId === secondId ? [firstId] : [], anyOf: [] },
    exclusiveWith: [],
    category: "delivery",
    objectives: [],
    unsupportedRequirements: [],
  }));
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic visit placement fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    itemSha256: "d".repeat(64),
    areaMapSha256: "e".repeat(64),
    sourceArchiveSha256: "f".repeat(64),
    includesAuthoredCorrections: true,
    quests,
  };
  const plan: CampaignPlan = {
    release: "funding-visit-test",
    race: "human",
    leaderClass: "warrior",
    sharedQuestsOnly: true,
    targetBuild: 70205,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    actions,
    legs: ["start", "prepare"].map((id) => ({
      id,
      title: id,
      kind: id === "start" ? "starter" : "preparation",
      from: 1,
      to: 3,
      stopId: null,
      actionIds: actions.filter((a) => a.legId === id).map((a) => a.id),
      questIds: [],
      unresolvedQuestIds: [],
    })),
    rewardFacts: [firstId, secondId, seedId, anchorId, farId, endId].map((questId) => ({
      questId,
      fullXp: questId === seedId ? 1000 : [firstId, secondId].includes(questId) ? 100 : 0,
      questLevel: 3,
      minimumLevel: [firstId, secondId].includes(questId) ? 2 : 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-03T00:00:00.000Z",
    })),
  };
  return {
    plan,
    catalog,
    batch: {
      questIds: [firstId, secondId],
      actions: batchActions,
      requiredKills: 0,
      travelCost: 1,
      returnTravelCost: 1,
    },
  };
}

function run(input: ReturnType<typeof fixture>): ReturnType<typeof batchFundingNpcVisit> {
  return batchFundingNpcVisit(
    input.plan,
    input.batch,
    input.catalog,
    campaignFundingStates(input.plan),
  );
}

describe("already-qualified funding delivery visits", () => {
  it("does not insert unrelated deliveries between a timed pickup and return", () => {
    const input = fixture();
    input.catalog.quests.push({
      ...input.catalog.quests[0]!,
      questId: anchorId,
      timeLimitSeconds: 900,
    });
    input.plan = {
      ...input.plan,
      actions: input.plan.actions.map((entry) =>
        entry.id === "anchor"
          ? {
              ...entry,
              questChanges: entry.questChanges.filter((change) => change.state === "accepted"),
            }
          : entry.id === "far"
            ? {
                ...entry,
                questChanges: [
                  {
                    questId: anchorId,
                    title: "Timed visit",
                    state: "rewarded",
                    objectiveIndex: null,
                  },
                  ...entry.questChanges,
                ],
              }
            : entry,
      ),
    };
    expect(run(input).plan).toBe(input.plan);
  });

  it("keeps a whole chain in an earlier zone visit, preserving phases, source objects and every original-start endpoint", () => {
    const input = fixture(),
      original = JSON.stringify(input),
      before = campaignFundingStates(input.plan);
    const result = run(input);
    expect(result.plan.actions.map((a) => a.id)).toEqual([
      "seed",
      "anchor",
      ...input.batch.actions.map((a) => a.id),
      "far",
      "end",
      "gate",
    ]);
    for (const entry of result.plan.actions)
      expect(entry).toBe(input.plan.actions.find((a) => a.id === entry.id));
    expect(result.states).toHaveLength(24);
    expect(
      result.states.map((s) => s.forecast.at(-1)!.members.map((m) => m.knownEndpoint)),
    ).toEqual(before.map((s) => s.forecast.at(-1)!.members.map((m) => m.knownEndpoint)));
    expect(result.plan.legs[1]!.actionIds).toEqual(result.plan.actions.slice(1).map((a) => a.id));
    expect(JSON.stringify(input)).toBe(original);
    expect(batchFundingNpcVisit(result.plan, input.batch, input.catalog, result.states).plan).toBe(
      result.plan,
    );
  });

  it("keeps the visit later when the earlier party is below the actual pickup minimum", () => {
    const input = fixture();
    input.catalog.quests[0]!.minimumLevel = 3;
    input.plan = {
      ...input.plan,
      rewardFacts: input.plan.rewardFacts!.map((f) => ({
        ...f,
        minimumLevel: f.questId === firstId ? 3 : f.minimumLevel,
        fullXp: f.questId === farId ? 1000 : f.questId === seedId ? 400 : f.fullXp,
      })),
    };
    expect(run(input).plan).toBe(input.plan);
  });

  it("does not move a chain before a required hand-in", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      actions: input.plan.actions.map((a) =>
        a.id === `${firstId}-accepted` ? { ...a, requiredQuestIds: [farId] } : a,
      ),
    };
    expect(run(input).plan).toBe(input.plan);
  });

  it("does not cross a level checkpoint or leg boundary", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      actions: input.plan.actions.map((a) =>
        a.id === "far" ? { ...a, kind: "xp-check", questChanges: [], targetLevel: 2 } : a,
      ),
    };
    expect(run(input).plan).toBe(input.plan);
  });

  it("keeps the later visit when an earlier pickup would be the forty-first active quest", () => {
    const input = fixture();
    const held = Array.from({ length: 41 }, (_value, index) => 440000 + index);
    const phase = (questId: number, state: CampaignQuestChange["state"]): CampaignQuestChange => ({
      questId,
      title: `Held ${questId}`,
      state,
      objectiveIndex: null,
    });
    input.plan = {
      ...input.plan,
      actions: input.plan.actions.map((entry) => {
        if (entry.id === "seed")
          return {
            ...entry,
            questChanges: [
              ...entry.questChanges,
              ...held.slice(0, 40).map((id) => phase(id, "accepted")),
            ],
          };
        if (entry.id === "anchor")
          return {
            ...entry,
            questChanges: [phase(held[0]!, "rewarded"), phase(held[40]!, "accepted")],
          };
        if (entry.id === "far") return { ...entry, questChanges: [phase(held[1]!, "rewarded")] };
        return entry;
      }),
      rewardFacts: [
        ...input.plan.rewardFacts!,
        ...held.map((questId) => ({
          ...input.plan.rewardFacts![0]!,
          questId,
          fullXp: 0,
          minimumLevel: 1,
        })),
      ],
    };
    const states = campaignFundingStates(input.plan);
    expect(
      states.every((state) =>
        state.forecast
          .flatMap((section) => section.members)
          .every((member) => member.blockedReason === null),
      ),
    ).toBe(true);
    expect(batchFundingNpcVisit(input.plan, input.batch, input.catalog, states).plan).toBe(
      input.plan,
    );
  });

  it.each([
    "combat",
    "object",
    "personal",
    "utility",
    "partial",
    "mixed-zone",
    "unsupported",
    "not-contiguous",
  ] as const)("holds %s work", (variant) => {
    const input = fixture();
    if (variant === "combat") input.batch = { ...input.batch, requiredKills: 1 };
    if (variant === "object") input.catalog.quests[0]!.category = "unsupported";
    if (variant === "unsupported")
      input.catalog.quests[0]!.unsupportedRequirements = ["unresolved-objective-text"];
    const first = input.plan.actions.find((a) => a.id === `${firstId}-accepted`)!;
    let replacement = first;
    if (variant === "personal") {
      const { sharedQuestsOnly, ...legacy } = input.plan;
      expect(sharedQuestsOnly).toBe(true);
      input.plan = legacy;
      replacement = { ...first, leaderOnly: true };
    }
    if (variant === "utility") replacement = { ...first, nativeUtilityTags: [".fly"] };
    if (variant === "partial") replacement = { ...first, questChanges: [] };
    if (variant === "mixed-zone")
      replacement = {
        ...first,
        positions: input.plan.actions.find((a) => a.id === "far")!.positions,
      };
    input.plan = {
      ...input.plan,
      actions: input.plan.actions.map((entry) => (entry === first ? replacement : entry)),
    };
    if (variant === "not-contiguous") {
      const entries = [...input.plan.actions];
      entries.splice(entries.indexOf(first) + 1, 0, {
        ...action("interruption", anchorId, []),
        kind: "instructions",
      });
      input.plan = { ...input.plan, actions: entries };
    }
    expect(run(input).plan).toBe(input.plan);
  });
});
