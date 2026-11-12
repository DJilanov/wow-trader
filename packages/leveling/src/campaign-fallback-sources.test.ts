import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { resolveCampaignFallbackSources } from "./campaign-fallback-sources.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { campaignActionAlias } from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { applyCampaignPartyQuestPolicy } from "./campaign-party-policy.js";
import { selectSharedCampaignQuests } from "./campaign-shared-quests.js";

interface Fixture {
  plan: CampaignPlan;
  catalog: QuestCatalog;
  combat: CombatDataset;
  sources: CampaignSource[];
}

function fixture(): Fixture {
  const position = { zone: "1437", x: 56, y: 40 };
  const recipient = {
    npcId: 2,
    name: "Rethiel the Greenwarden",
    friendlyToAlliance: true,
    positions: [position],
  };
  const parent: QuestCatalogEntry = {
    questId: 320001,
    title: "The Greenwarden",
    minimumLevel: 20,
    questLevel: 21,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [{ ...recipient, npcId: 1, name: "Messenger", positions: [{ ...position, x: 10 }] }],
    ends: [recipient],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "delivery",
    objectives: [],
    unsupportedRequirements: ["unresolved-objective-text"],
  };
  const child: QuestCatalogEntry = {
    ...parent,
    questId: 320002,
    title: "Camp foes",
    starts: [recipient],
    category: "shared-kills",
    objectives: [{ index: 1, npcId: 3, count: 2, positions: [{ ...position, x: 60, y: 70 }] }],
    unsupportedRequirements: ["unresolved-source-prerequisite"],
  };
  const actions: CampaignAction[] = [parent, child].flatMap((quest) =>
    (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      id: `old-${quest.questId}-${state}`,
      legId: "prepare",
      title: quest.title,
      instructions: [],
      source: null,
      positions: [],
      kind: "quests",
      leaderOnly: false,
      raidOnly: false,
      targetLevel: null,
      targetStopId: null,
      questChanges: [
        {
          questId: quest.questId,
          title: quest.title,
          state,
          objectiveIndex: state === "objectives-complete" ? 1 : null,
        },
      ],
    })),
  );
  const plan: CampaignPlan = {
    release: "synthetic-source-reconciliation",
    race: "human",
    leaderClass: "warrior",
    sharedQuestsOnly: true,
    sharedSourceQuestIds: [320001, 320002],
    targetBuild: 70205,
    sourceArchiveSha256: "f".repeat(64),
    actions,
    legs: [
      {
        id: "prepare",
        title: "Wetlands",
        kind: "preparation",
        from: 20,
        to: 23,
        stopId: null,
        actionIds: actions.map((action) => action.id),
        questIds: [320001, 320002],
        unresolvedQuestIds: [],
      },
    ],
  };
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic source-reconciliation fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    itemSha256: "d".repeat(64),
    areaMapSha256: "e".repeat(64),
    sourceArchiveSha256: "f".repeat(64),
    includesAuthoredCorrections: false,
    quests: [parent, child],
  };
  const combat: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic source-reconciliation fixture",
    provider: {
      repository: "https://example.test/data",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      questSha256: "b".repeat(64),
      npcSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      limitations: ["Synthetic fixture"],
    },
    quests: [
      {
        questId: 320001,
        creatureIds: [],
        itemCreatureIds: [],
        onlyCreatureObjectives: false,
        objectiveText: ["Find the Greenwarden."],
      },
      {
        questId: 320002,
        creatureIds: [3],
        itemCreatureIds: [],
        onlyCreatureObjectives: true,
        objectiveText: ["Kill two camp foes, then return to the Greenwarden."],
        prerequisites: { allOf: [], anyOf: [] },
        killQuotas: [
          { objectiveIndex: 1, npcId: 3, kills: 2, source: "Synthetic captured counter" },
        ],
      },
    ],
    npcs: [
      {
        id: 3,
        name: "Camp foe",
        minimumLevel: 20,
        maximumLevel: 21,
        rank: 0,
        zoneIds: [11],
        xpEligibility: "assumed",
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  };
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.sourceId === 116)!;
  const body =
    "step\n.goto 1437,10,60\n.target Messenger\n.accept 320001\n" +
    "step\n.goto 1437,56,40\n.target Rethiel the Greenwarden\n.turnin 320001\n.accept 320002\n.isOnQuest 320001\n" +
    "step\n.goto 1437,60,70\n>>Kill Camp foes\n.complete 320002,1\n.mob Camp foe\n.isOnQuest 320002\n" +
    "step\n.goto 1437,56,40\n.target Rethiel the Greenwarden\n.turnin 320002\n.isQuestComplete 320002\n";
  return {
    plan,
    catalog,
    combat,
    sources: [{ reference, guide: parseGuideChapter(body, reference.id, "f".repeat(64), 70205) }],
  };
}

describe("source qualification for generic quest tasks", () => {
  it("keeps the recovered prerequisite when party policy rebuilds the pickup", () => {
    const input = fixture();
    const resolved = resolveCampaignFallbackSources(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    const selected = applyCampaignPartyQuestPolicy(
      resolved.plan,
      input.sources,
      input.combat,
      resolved.catalog,
    );
    const pickup = selected.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === 320002 && change.state === "accepted",
      ),
    );
    expect(pickup?.requiredQuestIds).toContain(320001);
    expect(
      selected.actions.some((action) =>
        action.questChanges.some(
          (change) => change.questId === 320001 && change.state === "rewarded",
        ),
      ),
    ).toBe(true);
  });

  it("keeps a replaced placeholder bookmark valid when its real hand-in moves again", () => {
    const input = fixture();
    const resolved = resolveCampaignFallbackSources(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    const before = "old-320001-rewarded",
      after = "moved-320001-rewarded";
    const moved = {
      ...resolved.plan,
      actions: resolved.plan.actions.map((action) =>
        action.id === before ? { ...action, id: after } : action,
      ),
      bookmarkAliases: { ...resolved.plan.bookmarkAliases, [before]: after, [after]: after },
    };
    const selected = selectSharedCampaignQuests(moved, resolved.catalog);
    expect(
      campaignActionAlias(selected, emptyPremadeProgress(), "old-320001-objectives-complete"),
    ).toBe(after);
  });

  it("replaces the false NPC objective and retains the real child counters and required parent", () => {
    const input = fixture(),
      before = structuredClone(input);
    const resolved = resolveCampaignFallbackSources(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    const parent = resolved.plan.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 320001),
    );
    expect(parent.map((action) => action.questChanges[0]!.state)).toEqual(["accepted", "rewarded"]);
    expect(parent.every((action) => action.source !== null)).toBe(true);
    expect(parent.map((action) => action.id)).toEqual([
      "old-320001-accepted",
      "old-320001-rewarded",
    ]);
    expect(resolved.plan.bookmarkAliases?.["old-320001-objectives-complete"]).toBe(
      "old-320001-rewarded",
    );
    const child = resolved.plan.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 320002),
    );
    expect(child.map((action) => action.questChanges)).toEqual(
      input.plan.actions
        .filter((action) => action.questChanges[0]!.questId === 320002)
        .map((action) => action.questChanges),
    );
    expect(child[0]!.requiredQuestIds).toEqual([320001]);
    expect(child.every((action) => action.source === null)).toBe(true);
    expect(resolved.catalog.quests[1]!.prerequisites.allOf).toEqual([320001]);
    expect(resolved.catalog.quests[1]!.unsupportedRequirements).toEqual([]);
    expect(resolved.catalog.quests[1]!.objectives).toEqual(input.catalog.quests[1]!.objectives);
    expect(resolved.plan.legs[0]!.actionIds).toEqual(
      resolved.plan.actions.map((action) => action.id),
    );
    expect(input).toEqual(before);
    const again = resolveCampaignFallbackSources(
      resolved.plan,
      input.sources,
      input.combat,
      resolved.catalog,
    );
    expect(again.plan).toBe(resolved.plan);
    expect(again.catalog).toBe(resolved.catalog);
    const artifact = compileCampaignAddon(resolved.plan, resolved.plan.actions, {
      version: "0.2.0-source-test",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(artifact.lua).not.toContain(".complete 320001");
    expect(artifact.lua).toContain(".complete 320002,1");
  });

  it.each(["captured-method", "mixed-quest", "native-action", "different-leg", "extra-parent"])(
    "preserves an existing NPC program that cannot be safely replaced (%s)",
    (reason) => {
      const input = fixture();
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.map((action): CampaignAction => {
          if (action.id !== "old-320001-objectives-complete") return action;
          if (reason === "captured-method")
            return {
              ...action,
              source: {
                chapterId: input.sources[0]!.guide.chapterId,
                version: input.sources[0]!.guide.version,
                stepId: input.sources[0]!.guide.steps[0]!.id,
              },
            };
          if (reason === "mixed-quest")
            return {
              ...action,
              questChanges: [
                ...action.questChanges,
                { ...action.questChanges[0]!, questId: 999999 },
              ],
            };
          if (reason === "native-action") return { ...action, nativeUtilityTags: [".hs"] };
          if (reason === "different-leg") return { ...action, legId: "another-visit" };
          return { ...action, requiredQuestIds: [999999] };
        }),
      };
      const resolved = resolveCampaignFallbackSources(
        input.plan,
        input.sources,
        input.combat,
        input.catalog,
      );
      expect(
        resolved.plan.actions.filter((action) =>
          action.questChanges.some((change) => change.questId === 320001),
        ),
      ).toEqual(
        input.plan.actions.filter((action) =>
          action.questChanges.some((change) => change.questId === 320001),
        ),
      );
    },
  );

  it.each([
    "wrong-parent-npc",
    "wrong-quota",
    "item-work",
    "extra-restriction",
    "unrelated-guard",
    "pickup-item",
    "provider-mismatch",
    "missing-counter",
    "duplicate-counter",
    "wrong-counter",
    "backward-lifecycle",
  ])(
    "holds the missing prerequisite without complete handoff and counter evidence (%s)",
    (reason) => {
      const input = fixture();
      if (reason === "wrong-parent-npc")
        input.catalog.quests[0]!.ends = [{ ...input.catalog.quests[0]!.ends[0]!, npcId: 999 }];
      if (reason === "wrong-quota") input.combat.quests[1]!.killQuotas![0]!.kills = 3;
      if (reason === "item-work") input.combat.quests[1]!.itemCreatureIds.push(3);
      if (reason === "extra-restriction")
        input.catalog.quests[1]!.unsupportedRequirements.push("requiredSkill");
      if (reason === "provider-mismatch") input.combat.provider.npcSha256 = "0".repeat(64);
      if (
        ["missing-counter", "duplicate-counter", "wrong-counter", "backward-lifecycle"].includes(
          reason,
        )
      ) {
        const objective = input.plan.actions.find(
          (action) => action.id === "old-320002-objectives-complete",
        )!;
        if (reason === "missing-counter")
          input.plan = {
            ...input.plan,
            actions: input.plan.actions.filter((action) => action !== objective),
          };
        if (reason === "duplicate-counter")
          input.plan = {
            ...input.plan,
            actions: [...input.plan.actions, { ...objective, id: "duplicate-counter" }],
          };
        if (reason === "wrong-counter")
          input.plan = {
            ...input.plan,
            actions: input.plan.actions.map((action) =>
              action === objective
                ? { ...action, questChanges: [{ ...action.questChanges[0]!, objectiveIndex: 2 }] }
                : action,
            ),
          };
        if (reason === "backward-lifecycle")
          input.plan = { ...input.plan, actions: [...input.plan.actions].reverse() };
      }
      const pickup = input.sources[0]!.guide.steps[1]!;
      if (reason === "unrelated-guard")
        pickup.directives.find((row) => row.tag === ".isOnQuest")!.arguments = "999999";
      if (reason === "pickup-item")
        pickup.directives.push({
          tag: ".use",
          arguments: "123",
          text: "",
          condition: "",
          sourceLine: 1,
          questId: null,
          position: null,
        });
      const resolved = resolveCampaignFallbackSources(
        input.plan,
        input.sources,
        input.combat,
        input.catalog,
      );
      expect(resolved.catalog.quests[1]).toBe(input.catalog.quests[1]);
      expect(
        resolved.plan.actions.filter((action) => action.questChanges[0]?.questId === 320002),
      ).toEqual(input.plan.actions.filter((action) => action.questChanges[0]?.questId === 320002));
    },
  );
});
