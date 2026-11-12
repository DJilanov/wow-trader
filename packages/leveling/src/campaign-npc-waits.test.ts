import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { attachCampaignNpcWaits } from "./campaign-npc-waits.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { compileCampaignAddon } from "./campaign-addon.js";

const position = { zone: "1440", floor: null, x: 37, y: 52, space: "map-percent" as const };
const npc = {
  npcId: 123,
  name: "Quest Keeper",
  friendlyToAlliance: true,
  positions: [{ zone: "1440", x: 37, y: 52 }],
};
const body =
  "step\n#xprate <1.59\n.goto 1440,37,52\n.target Quest Keeper\n.turnin 320001\n.timer 24,Quest roleplay\n.accept 320002";

function source(content = body, sourceId = 130): CampaignSource {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === sourceId)!;
  return {
    reference,
    guide: parseGuideChapter(content, reference.id, "f".repeat(64), 70205),
  };
}

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog; sources: CampaignSource[] } {
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic NPC waiting fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    includesAuthoredCorrections: false,
    sourceArchiveSha256: "f".repeat(64),
    quests: [320001, 320002].map((questId, index) => ({
      questId,
      title: index === 0 ? "The Cure" : "The Tear",
      minimumLevel: 1,
      questLevel: 1,
      requiredRaces: 4294967373,
      requiredClasses: 0,
      starts: [npc],
      ends: [npc],
      prerequisites: { allOf: index === 0 ? [] : [320001], anyOf: [] },
      exclusiveWith: [],
      category: "delivery",
      objectives: [],
      unsupportedRequirements: [],
    })),
  });
  const actions: CampaignAction[] = (
    [
      [320001, "accepted"],
      [320001, "rewarded"],
      [320002, "accepted"],
      [320002, "rewarded"],
    ] as const
  ).map(([questId, state], index) => ({
    id: `action-${index}`,
    legId: "visit",
    title: "Visit Quest Keeper",
    kind: "quests",
    instructions: ["Talk to Quest Keeper."],
    questChanges: [
      {
        questId: Number(questId),
        title: questId === 320001 ? "The Cure" : "The Tear",
        state,
        objectiveIndex: null,
      },
    ],
    source: null,
    positions: [{ sourceLine: 0, position }],
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
  }));
  const plan: CampaignPlan = {
    release: "npc-wait-test",
    race: "human",
    leaderClass: "warrior",
    sharedQuestsOnly: true,
    targetBuild: 70205,
    sourceArchiveSha256: "f".repeat(64),
    actions,
    legs: [
      {
        id: "visit",
        title: "Visit Quest Keeper",
        kind: "preparation",
        from: 1,
        to: 2,
        stopId: null,
        actionIds: actions.map((action) => action.id),
        questIds: [320001, 320002],
        unresolvedQuestIds: [],
      },
    ],
  };
  return { plan, catalog, sources: [source()] };
}

describe("captured NPC handoff waits", () => {
  it("explains the actual wait in the browser and native instructions without changing execution", () => {
    const input = fixture();
    const before = structuredClone(input);
    const result = attachCampaignNpcWaits(input.plan, input.sources, input.catalog);
    const child = result.actions[2]!;
    expect(child.instructions).toContain(
      "After turning in The Cure, stay with Quest Keeper for about 24 seconds. Accept The Tear when the quest becomes available.",
    );
    expect(child.questChanges).toBe(input.plan.actions[2]!.questChanges);
    expect(child.positions).toBe(input.plan.actions[2]!.positions);
    expect(child.source).toBeNull();
    expect(result.actions.slice(0, 2)).toEqual(input.plan.actions.slice(0, 2));
    expect(input).toEqual(before);
    expect(attachCampaignNpcWaits(result, input.sources, input.catalog)).toBe(result);
    const artifact = compileCampaignAddon(result, result.actions, {
      version: "0.2.0-wait-test",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      partyStarter: { race: "human", classSlug: "priest" },
      includeObservers: false,
    });
    const text = artifact.documents
      .filter((document) => document.role === "party")
      .map((document) => document.content)
      .join("\n");
    expect(text).toContain("for about 24 seconds");
    expect(text.match(/\.accept 320002\b/g)).toHaveLength(1);
    expect(text).not.toContain(".timer");
  });

  it.each([
    body.replace(".timer 24", ".timer 0"),
    body.replace(".timer 24", ".timer -24"),
    body.replace(".timer 24", ".timer 24.5"),
    body.replace(".timer 24", ".timer 301"),
    body.replace(".timer 24", ".timer unknown"),
    body.replace(".timer 24,Quest roleplay\n", ""),
    body + "\n.timer 26,Another timer",
    body.replace(".target Quest Keeper", ".target Different NPC"),
    body.replace(".goto 1440", ".goto 1431"),
    body.replace(".turnin 320001", ".turnin 999999"),
    body.replace(".accept 320002", ".accept 999999"),
    body.replace(
      ".timer 24,Quest roleplay\n.accept 320002",
      ".accept 320002\n.timer 24,Quest roleplay",
    ),
    body + "\n.use 123",
    body.replace("#xprate <1.59", "#xprate >1.59"),
    body + "\n#optional",
    body + "\n#season 2",
    body + "\n.isQuestComplete 999999",
  ])("rejects an unqualified or ambiguous timer program: %s", (content) => {
    const input = fixture();
    expect(attachCampaignNpcWaits(input.plan, [source(content)], input.catalog)).toBe(input.plan);
  });

  it("rejects conflicting eligible durations but ignores an incompatible SoD method", () => {
    const input = fixture();
    const different = source(body.replace(".timer 24", ".timer 26"), 129);
    expect(attachCampaignNpcWaits(input.plan, [...input.sources, different], input.catalog)).toBe(
      input.plan,
    );
    const sod = source(body.replace(".timer 24", ".timer 26"), 22);
    const result = attachCampaignNpcWaits(input.plan, [...input.sources, sod], input.catalog);
    expect(result.actions[2]!.instructions.join(" ")).toContain("24 seconds");
    expect(result.actions[2]!.instructions.join(" ")).not.toContain("26 seconds");
  });

  it("requires a directly preceding parent return in the same visit", () => {
    const input = fixture();
    const detour = {
      ...input.plan.actions[0]!,
      id: "detour",
      kind: "instructions" as const,
      questChanges: [],
      positions: [{ sourceLine: 0, position: { ...position, x: 70 } }],
    };
    const plan = {
      ...input.plan,
      actions: [...input.plan.actions.slice(0, 2), detour, input.plan.actions[2]!],
    };
    expect(attachCampaignNpcWaits(plan, input.sources, input.catalog)).toBe(plan);
    const differentReturn = {
      ...input.plan,
      actions: input.plan.actions.map((action, index) =>
        index === 1 ? { ...action, positions: detour.positions } : action,
      ),
    };
    expect(attachCampaignNpcWaits(differentReturn, input.sources, input.catalog)).toBe(
      differentReturn,
    );
  });

  it("retains existing source-bound execution and rejects mismatched data or unproven parents", () => {
    const input = fixture();
    const sourceBound = {
      ...input.plan,
      actions: input.plan.actions.map((action, index) =>
        index === 2
          ? {
              ...action,
              source: {
                chapterId: input.sources[0]!.guide.chapterId,
                version: input.sources[0]!.guide.version,
                stepId: "source-step-0001",
              },
            }
          : action,
      ),
    };
    expect(attachCampaignNpcWaits(sourceBound, input.sources, input.catalog)).toBe(sourceBound);
    for (const catalog of [
      { ...input.catalog, targetBuild: 12345 },
      { ...input.catalog, sourceArchiveSha256: "0".repeat(64) },
      {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) => ({
          ...quest,
          prerequisites: { allOf: [], anyOf: [] },
        })),
      },
    ])
      expect(attachCampaignNpcWaits(input.plan, input.sources, catalog)).toBe(input.plan);
  });
});
