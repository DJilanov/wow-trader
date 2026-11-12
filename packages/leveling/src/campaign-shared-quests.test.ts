import { describe, expect, it } from "vitest";
import { prepareCampaignPlan } from "./campaign-preparation.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { buildCampaignPlan, type CampaignPlan, type CampaignSource } from "./campaign.js";
import { parseGuideChapter } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { selectSharedCampaignQuests } from "./campaign-shared-quests.js";

function catalog(): QuestCatalog {
  return questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic shared-route fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    includesAuthoredCorrections: true,
    sourceArchiveSha256: "e".repeat(64),
    quests: [300001, 300002, 300003, 300004].map((questId) => ({
      questId,
      title: `Quest ${questId}`,
      minimumLevel: 1,
      questLevel: 1,
      requiredRaces: 1,
      requiredClasses: questId === 300002 ? 1 : 0,
      starts: [],
      ends: [],
      prerequisites: { allOf: questId === 300003 ? [300002] : [], anyOf: [] },
      exclusiveWith: [],
      category: "delivery",
      objectives: [],
      unsupportedRequirements: [],
    })),
  });
}

function sourceRoute(body: string): readonly CampaignSource[] {
  return [115, 116, 117].map((sourceId) => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === sourceId)!;
    const content = sourceId === 115 ? body : "step\n.goto 1429,45,48\n.fp >>Learn the flight path";
    return { reference, guide: parseGuideChapter(content, reference.id, "e".repeat(64), 70205) };
  });
}

function fixture(): CampaignPlan {
  const actions = [300001, 300002, 300003, 300004].map((questId) => ({
    id: `quest-${questId}`,
    legId: "northshire",
    title: `Quest ${questId}`,
    instructions: [],
    questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      questId,
      state,
      title: `Quest ${questId}`,
      objectiveIndex: state === "objectives-complete" ? 1 : null,
    })),
    positions: [],
    source: null,
    kind: "quests" as const,
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  }));
  return {
    release: "shared-party-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: "e".repeat(64),
    actions,
    legs: [
      {
        id: "northshire",
        title: "Northshire",
        from: 1,
        to: 6,
        kind: "starter",
        stopId: null,
        actionIds: actions.map((action) => action.id),
        questIds: [300001, 300002, 300003, 300004],
        unresolvedQuestIds: [],
      },
    ],
  };
}

function prepare(plan = fixture(), questCatalog: QuestCatalog | null = catalog()): CampaignPlan {
  return prepareCampaignPlan(
    plan,
    [],
    {
      starters: { entries: [], routes: [] },
      rewardFacts: catalog().quests.map((quest) => ({
        questId: quest.questId,
        fullXp: 100,
        questLevel: 1,
        minimumLevel: 1,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: `https://example.test/quest=${quest.questId}`,
        capturedAt: "2026-11-02T00:00:00Z",
      })),
      rewardRevision: "test",
      rewardBuild: 70205,
      rewardNotice: null,
      combat: null,
      questCatalog,
    },
    { sharedQuestsOnly: true },
  );
}

const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
function party(): ReturnType<typeof emptyPremadeProgress> {
  const progress = emptyPremadeProgress();
  return {
    ...progress,
    members: progress.members.map((member, index) => ({
      ...member,
      raceId: "human",
      classSlug: classes[index]!,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

describe("one ordinary-quest route for five Humans", () => {
  it("retains chained bookmarks only when they resolve to a retained shared task", () => {
    const plan = {
      ...fixture(),
      bookmarkAliases: {
        "old-objective": "old-hand-in",
        "old-hand-in": "quest-300001",
        "personal-objective": "personal-hand-in",
        "personal-hand-in": "quest-300002",
        "missing-objective": "missing-hand-in",
        "cycle-a": "cycle-b",
        "cycle-b": "cycle-a",
        self: "self",
      },
    };
    const before = structuredClone(plan);
    const selected = selectSharedCampaignQuests(plan, catalog());
    expect(selected.bookmarkAliases).toEqual({
      "old-objective": "quest-300001",
      "old-hand-in": "quest-300001",
    });
    expect(plan).toEqual(before);
    expect(selectSharedCampaignQuests(selected, catalog()).bookmarkAliases).toEqual(
      selected.bookmarkAliases,
    );
  });

  it.each(["requiredSkill", "requiredSpell", "requiredSpecialization", "requiredRanks"])(
    "does not assume every class satisfies %s",
    (requirement) => {
      const evidence = catalog();
      const plan = prepare(fixture(), {
        ...evidence,
        quests: evidence.quests.map((quest) =>
          quest.questId === 300004 ? { ...quest, unsupportedRequirements: [requirement] } : quest,
        ),
      });
      expect(
        plan.actions.some((action) =>
          action.questChanges.some((change) => change.questId === 300004),
        ),
      ).toBe(false);
    },
  );
  it("retains ordinary dungeon, delivery and exploration quests when their objective model needs work", () => {
    const evidence = catalog();
    const plan = prepare(fixture(), {
      ...evidence,
      quests: evidence.quests.map((quest) =>
        quest.questId === 300004
          ? {
              ...quest,
              unsupportedRequirements: [
                "non-outdoor-zone",
                "provided-item-interaction",
                "unresolved-objective-text",
                "exploration-trigger",
              ],
            }
          : quest,
      ),
    });
    expect(
      plan.actions.some((action) =>
        action.questChanges.some((change) => change.questId === 300004),
      ),
    ).toBe(true);
  });
  it("builds and exports the common source branch without a Warrior quest or trainer detour", () => {
    const sources = sourceRoute(
      "step\n.accept 300001 >>Accept Ordinary Quest\n.accept 300002 >>Accept Warrior Quest << Warrior\nstep\n.goto 1429,45,48\n.vendor 123 >>Visit the Warrior trainer << Warrior\nstep\n.complete 300001,1 >>Kill Forest Wolf (x5)\n.mob Forest Wolf\nstep\n.turnin 300001 >>Turn in Ordinary Quest",
    );
    const raw = buildCampaignPlan("human", "e".repeat(64), sources, "warrior", {
      starterOnly: true,
      sharedQuestsOnly: true,
    });
    expect(raw.actions.every((action) => !action.leaderOnly)).toBe(true);
    expect(
      raw.actions
        .flatMap((action) => action.questChanges)
        .some((change) => change.questId === 300002),
    ).toBe(false);
    expect(
      raw.actions.some((action) =>
        action.instructions.some((line) => line.includes("Warrior trainer")),
      ),
    ).toBe(false);
    const plan = prepareCampaignPlan(
      raw,
      sources,
      {
        starters: { entries: [], routes: [] },
        rewardFacts: [],
        rewardRevision: "test",
        rewardBuild: 70205,
        rewardNotice: null,
        combat: null,
        questCatalog: catalog(),
      },
      { sharedQuestsOnly: true },
    );
    const artifact = compileCampaignAddon(plan, plan.actions, {
      version: "0.2.0-local-test",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      partyStarter: { race: "human", classSlug: "priest" },
      nativeSources: sources,
      includeObservers: false,
    });
    const content = artifact.documents.map((document) => document.content).join("\n");
    expect(content).toContain(".accept 300001");
    expect(content).not.toContain(".accept 300002");
    expect(content).not.toContain(".vendor 123");
  });

  it("removes class quests and their dependent chain before awarding shared quest XP", () => {
    const input = fixture();
    const snapshot = structuredClone(input);
    const plan = prepare(input);
    expect(plan.sharedQuestsOnly).toBe(true);
    expect(
      plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
    ).toEqual([300001, 300001, 300001, 300004, 300004, 300004]);
    expect(plan.actions.every((action) => !action.leaderOnly)).toBe(true);
    expect(plan.leaderClass).toBe("warrior");
    expect(input).toEqual(snapshot);
    const scenario = guidePartyScenario(plan, party(), "together");
    expect(scenario.progress.members.map((member) => member.classSlug)).toEqual(classes);
    const guide = forecastCampaignGuide(plan, party());
    expect(guide.sections[0]!.audience).toBe("party");
    for (const member of guide.sections[0]!.forecast.members) {
      expect(member.referenceQuestXp).toBe(200);
      expect(member.rewards.map((reward) => reward.questId)).toEqual([300001, 300004]);
    }
  });

  it("keeps ordinary hand-ins with different class reward choices in the common route", () => {
    const sources = sourceRoute(
      "step\n.accept 300001 >>Accept Ordinary Quest\n.accept 300002 >>Accept Warrior Quest << Warrior\nstep\n.complete 300001,1 >>Kill Forest Wolf (x5)\n.mob Forest Wolf\nstep\n.goto 1429,45,48\n.turnin 300001,1 >>Turn in Ordinary Quest << Warrior/Paladin/Rogue\n.turnin 300001,2 >>Turn in Ordinary Quest << !Warrior !Paladin !Rogue\n.target Deputy Willem",
    );
    const raw = buildCampaignPlan("human", "e".repeat(64), sources, "warrior", {
      starterOnly: true,
      sharedQuestsOnly: true,
    });
    const plan = prepareCampaignPlan(raw, sources, {
      starters: { entries: [], routes: [] },
      rewardFacts: [],
      rewardRevision: "test",
      rewardBuild: 70205,
      rewardNotice: null,
      combat: null,
      questCatalog: catalog(),
    });
    expect(
      plan.actions
        .flatMap((action) => action.questChanges)
        .filter((change) => change.questId === 300001),
    ).toEqual([
      expect.objectContaining({ state: "accepted" }),
      expect.objectContaining({ state: "objectives-complete" }),
      expect.objectContaining({ state: "rewarded" }),
    ]);
    for (const classSlug of classes) {
      const artifact = compileCampaignAddon(plan, plan.actions, {
        version: "0.2.0-local-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        partyStarter: { race: "human", classSlug },
        nativeSources: sources,
        includeObservers: false,
      });
      const content = artifact.documents
        .filter((document) => document.role === "party")
        .map((document) => document.content)
        .join("\n");
      expect(content.match(/^\s*\.turnin 300001(?:\s.*)?$/gm)).toHaveLength(1);
      expect(content).not.toContain(".turnin 300001,");
      expect(content).not.toContain(".accept 300002");
    }
  });

  it("uses an ordinary quest recommended to solo casters for every class in the shared party", () => {
    const sources = sourceRoute(
      "step\n.goto 1429,50,50\n>>Skip the followup << !Priest !Mage\n.accept 300001 << Priest/Mage\nstep << Priest/Mage\n.goto 1429,54,49\n.complete 300001,1 >>Kill Forest Wolf (x5)\n.mob Forest Wolf\nstep << Priest/Mage\n.goto 1429,50,50\n.turnin 300001,1\n.accept 300004\nstep << Warrior\n.accept 300002",
    );
    const raw = buildCampaignPlan("human", "e".repeat(64), sources, "warrior", {
      starterOnly: true,
      sharedQuestsOnly: true,
    });
    const plan = prepareCampaignPlan(raw, sources, {
      starters: { entries: [], routes: [] },
      rewardFacts: [],
      rewardRevision: "test",
      rewardBuild: 70205,
      rewardNotice: null,
      combat: null,
      questCatalog: catalog(),
    });
    expect(
      plan.actions.flatMap((action) => action.questChanges).map((change) => change.state),
    ).toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(plan.actions.every((action) => !action.leaderOnly)).toBe(true);
    for (const classSlug of classes) {
      const artifact = compileCampaignAddon(plan, plan.actions, {
        version: "0.2.0-local-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        partyStarter: { race: "human", classSlug },
        nativeSources: sources,
        includeObservers: false,
      });
      const content = artifact.documents
        .filter((document) => document.role === "party")
        .map((document) => document.content)
        .join("\n");
      expect(content).toContain(".accept 300001");
      expect(content).toContain(".complete 300001,1");
      expect(content).toContain(".turnin 300001");
      expect(content).not.toContain(".accept 300002");
      expect(content).not.toContain(".accept 300004");
      expect(content).not.toContain("Skip the followup");
      expect(content).not.toMatch(/<<\s*(?:Priest|Mage)/);
    }
  });

  it("requires matching quest eligibility evidence and rejects a different starting race", () => {
    expect(() => prepare(fixture(), null)).toThrow(/catalog/);
    expect(() => prepare(fixture(), { ...catalog(), targetBuild: 70450 })).toThrow(/build/);
    const progress = party();
    progress.members[1] = { ...progress.members[1]!, raceId: "dwarf" };
    expect(() => guidePartyScenario(prepare(), progress, "together")).toThrow(/race/);
  });

  it("preserves genuine prerequisites instead of removing a gate whose quest is unavailable", () => {
    const input = fixture();
    const checkpoint = {
      ...input.actions[0]!,
      id: "required-quest-gate",
      kind: "checkpoint" as const,
      questChanges: [],
      requiredQuestIds: [300002],
    };
    const plan = prepare({ ...input, actions: [...input.actions, checkpoint] });
    expect(plan.actions.find((action) => action.id === checkpoint.id)?.requiredQuestIds).toEqual([
      300002,
    ]);
  });

  it("exports the same ordinary quest path for all five classes without personal starter guides", () => {
    const plan = prepare();
    for (const classSlug of classes) {
      const artifact = compileCampaignAddon(plan, plan.actions, {
        version: "0.2.0-local-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        partyStarter: { race: "human", classSlug },
        includeObservers: false,
      });
      const partyDocuments = artifact.documents.filter((document) => document.role === "party");
      expect(partyDocuments.flatMap((document) => document.actionIds)).toEqual(
        plan.actions.map((action) => action.id),
      );
      const content = partyDocuments.map((document) => document.content).join("\n");
      expect(content).not.toContain("party-personal-");
      expect(content).not.toMatch(/\.(?:accept|complete|turnin) 30000[23](?:\D|$)/);
    }
  });
});
