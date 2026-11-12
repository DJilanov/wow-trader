import { describe, expect, it } from "vitest";
import { attachCampaignCombat } from "./campaign-combat.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { importedChapterSchema } from "./guide-archive.js";
import method from "./fixtures/gnomeregan-punch-card-method-70205.json" with { type: "json" };

function dataset(): CombatDataset {
  return combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Test fixture; captured puzzle method, no measured payout.",
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      limitations: ["Puzzle method test"],
    },
    npcs: [],
    quests: [
      {
        questId: 2930,
        creatureIds: [],
        itemCreatureIds: [],
        onlyCreatureObjectives: false,
        objectiveText: ["Bring a Prismatic Punch Card to Master Mechanic Castpipe in Ironforge."],
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 9316,
            itemName: "Prismatic Punch Card",
            quantity: 1,
            npcIds: [],
            objectIds: [142696],
            sharing: "shared-roll",
          },
        ],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
}

function sources(): CampaignSource[] {
  const reference = CHAPTER_REFERENCES.find((row) => row.id === method.chapterId)!;
  const guide = importedChapterSchema.parse({
    schemaVersion: 1,
    sourceName: "RestedXP Forever Guide",
    chapterId: method.chapterId,
    version: method.version,
    targetBuild: 70205,
    sourceSha256: method.chapterSourceSha256,
    steps: method.steps,
  });
  return [{ reference, guide }];
}

function plan(): CampaignPlan {
  const base = {
    legId: "dungeon-gnomeregan",
    positions: [],
    source: null,
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
  };
  const actions: CampaignPlan["actions"] = [
    {
      ...base,
      id: "dungeon-gnomeregan-brief",
      kind: "instructions",
      title: "Gnomeregan",
      instructions: ["Prepare outside the instance."],
      questChanges: [],
    },
    ...(["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      ...base,
      id: `dungeon-gnomeregan-${state}-2930`,
      kind: "quests" as const,
      title: "Data Rescue",
      instructions: ["Bring a Prismatic Punch Card to Ironforge."],
      wholeQuestObjectives: true as const,
      questChanges: [
        {
          questId: 2930,
          title: "Data Rescue",
          state,
          objectiveIndex: state === "objectives-complete" ? 1 : null,
        },
      ],
    })),
  ];
  return {
    release: "punch-card-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: method.sourceArchiveSha256,
    actions,
    legs: [
      {
        id: "dungeon-gnomeregan",
        title: "Gnomeregan",
        from: 29,
        to: 30,
        kind: "dungeon",
        stopId: "gnomeregan",
        questIds: [2930],
        unresolvedQuestIds: [],
        actionIds: actions.map((action) => action.id),
      },
    ],
  };
}

describe("Data Rescue punch-card puzzle", () => {
  it("keeps the final card requirement and real hand-in without an invented farming stream", () => {
    const input = plan(),
      data = dataset(),
      captured = sources();
    const before = JSON.stringify({ input, data, captured });
    const result = attachCampaignCombat(input, captured, data, "puzzle-test");
    expect(result.combat!.activities).toEqual([]);
    expect(result.itemRequirements).toContainEqual({
      questId: 2930,
      objectiveIndex: 1,
      itemId: 9316,
      quantity: 1,
    });
    expect(result.itemRequirements!.map((item) => item.itemId)).toEqual([9316]);
    expect(result.actions.map((action) => action.questChanges)).toEqual(
      input.actions.map((action) => action.questChanges),
    );
    const brief = result.actions[0]!.instructions.join(" ");
    expect(brief).toContain("White Punch Card");
    expect(brief).toContain("3005-A");
    expect(brief).toContain("outside");
    const puzzle = result.actions[2]!.instructions.join(" ");
    for (const terminal of ["3005-B", "3005-C", "3005-D"]) expect(puzzle).toContain(terminal);
    expect(createCampaignCombatReadiness(result)(result.actions[2]!).unknownNpcIds).toEqual([]);
    expect(result.combat!.killXpEvidence).toEqual([]);
    expect(JSON.stringify({ input, data, captured })).toBe(before);
    expect(attachCampaignCombat(result, captured, data, "puzzle-test")).toEqual(result);
  });

  it.each([
    "missing-source",
    "changed-output",
    "changed-guard",
    "reordered",
    "wrong-build",
    "wrong-item",
    "wrong-object",
    "mob-source",
    "missing-outside-brief",
  ])("does not qualify incomplete or conflicting puzzle evidence (%s)", (change) => {
    let input = plan();
    const data = dataset(),
      captured = sources();
    if (change === "missing-source") captured[0]!.guide.steps.splice(2, 1);
    if (change === "changed-output")
      captured[0]!.guide.steps[1]!.directives.find((row) => row.tag === ".collect")!.arguments =
        "9999,1,2930,1";
    if (change === "changed-guard") captured[0]!.guide.steps[2]!.condition = "Mage";
    if (change === "reordered") captured[0]!.guide.steps.reverse();
    if (change === "wrong-build") captured[0]!.guide.targetBuild = 70450;
    if (change === "wrong-item") data.quests[0]!.itemObjectives![0]!.itemId = 9279;
    if (change === "wrong-object") data.quests[0]!.itemObjectives![0]!.objectIds = [1];
    if (change === "mob-source") data.quests[0]!.itemObjectives![0]!.npcIds = [1];
    if (change === "missing-outside-brief") input = { ...input, actions: input.actions.slice(1) };
    expect(
      attachCampaignCombat(input, captured, data, "puzzle-test").combat!.activities,
    ).toHaveLength(1);
  });

  it.each(["warrior", "priest", "mage", "rogue", "warlock"] as const)(
    "exports one final card counter and hand-in for %s, without retaining all consumed cards",
    (leaderClass) => {
      const input = { ...plan(), leaderClass };
      const result = attachCampaignCombat(input, sources(), dataset(), "puzzle-test");
      const output = compileCampaignAddon(result, result.actions, {
        version: "1.0.0",
        runtimeBuild: 70205,
        interfaceVersion: 11508,
        restedXpVersion: "v4.11.27",
        nativeSources: sources(),
      })
        .documents.filter((document) => document.role === "leader")
        .map((document) => document.content)
        .join("\n");
      expect(output).toContain(".complete 2930,1");
      expect(output.match(/\.turnin 2930\b/g)).toHaveLength(1);
      expect(output).not.toMatch(/\.collect (9279|9280|9282|9281),/);
      for (const terminal of ["3005-A", "3005-B", "3005-C", "3005-D"])
        expect(output).toContain(terminal);
    },
  );

  it("forecasts one completed puzzle reward for each player and zero fabricated kill XP", () => {
    const input: CampaignPlan = {
      ...plan(),
      rewardFacts: [
        {
          questId: 2930,
          fullXp: 6500,
          minimumLevel: 25,
          questLevel: 30,
          xpByLevel: [],
          status: "available",
          evidenceKind: "published-forever",
          sourceUrl: "https://example.test/synthetic-puzzle-reward",
          capturedAt: "2026-11-03T00:00:00Z",
        },
      ],
    };
    const result = attachCampaignCombat(input, sources(), dataset(), "puzzle-test");
    const initial = emptyPremadeProgress();
    const forecast = forecastCampaignXp(result, {
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        level: 29,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    });
    expect(forecast).toHaveLength(1);
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.referenceQuestXp).toBe(6500);
      expect(member.combatXp).toBe(0);
      expect(member.knownEndpoint).toEqual({ level: 29, currentXp: 6500 });
      expect(member.rewards.filter((reward) => reward.questId === 2930)).toHaveLength(1);
    }
  });
});
