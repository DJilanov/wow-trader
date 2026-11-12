import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { combatDatasetSchema } from "./combat-model.js";
import { importedChapterSchema } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { attachCampaignHakkarEvent } from "./campaign-hakkar-event.js";
import guideData from "./fixtures/hakkar-event-source-guide.json" with { type: "json" };
import combatData from "./fixtures/hakkar-event-input-combat.json" with { type: "json" };
import reviewed from "./fixtures/hakkar-event-70205.json" with { type: "json" };

interface Fixture {
  plan: CampaignPlan;
  data: CombatDataset;
  sources: CampaignSource[];
}
function fixture(): Fixture {
  const actions: CampaignPlan["actions"] = (
    ["accepted", "objectives-complete", "rewarded"] as const
  ).map((state) => ({
    id: state,
    legId: "temple",
    kind: "quests",
    title: "The God Hakkar",
    instructions: [],
    positions: [],
    source: null,
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    ...(state === "objectives-complete" ? { wholeQuestObjectives: true as const } : {}),
    ...(state === "accepted" ? { requiredQuestIds: [4787] } : {}),
    questChanges: [
      {
        questId: 3528,
        title: "The God Hakkar",
        state,
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      },
    ],
  }));
  return {
    plan: {
      release: "staged-hakkar-method",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sourceArchiveSha256: reviewed.sourceArchiveSha256,
      sharedQuestsOnly: true,
      actions,
      legs: [
        {
          id: "temple",
          kind: "dungeon",
          title: "Sunken Temple",
          from: 55,
          to: 56,
          stopId: "sunken-temple",
          questIds: [3528],
          unresolvedQuestIds: [],
          actionIds: actions.map((action) => action.id),
        },
      ],
      rewardFacts: [
        {
          questId: 3528,
          fullXp: 1000,
          minimumLevel: 40,
          questLevel: 53,
          xpByLevel: [],
          status: "available",
          evidenceKind: "published-forever",
          sourceUrl: "https://example.test/synthetic-event-reward",
          capturedAt: "2026-11-04T00:00:00Z",
        },
      ],
    },
    data: combatDatasetSchema.parse(structuredClone(combatData)),
    sources: [
      {
        reference: CHAPTER_REFERENCES.find((entry) => entry.id === reviewed.archive.chapterId)!,
        guide: importedChapterSchema.parse(structuredClone(guideData)),
      },
    ],
  };
}

function integrated(input: Fixture): CampaignPlan {
  return attachCampaignCombat(input.plan, input.sources, input.data, "staged-production-hook");
}

function progressAt(level: number): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress();
  return {
    ...initial,
    members: initial.members.map((member) => ({
      ...member,
      level,
      currentXp: 0,
      xpNeedsUpdate: false,
      questStates: { "4787": "rewarded" as const },
    })),
  };
}

describe("isolated production-hook candidate; active production remains unchanged", () => {
  it("retains the final Egg counter, all physical event enemies and the supplied-item instructions", () => {
    const input = fixture(),
      before = structuredClone(input);
    const method = attachCampaignHakkarEvent(input.plan, input.sources, input.data);
    expect(method.objectives.get("objectives-complete")).toMatchObject({
      questId: 3528,
      objectiveIndex: 1,
      credit: "non-combat",
      npcIds: [],
      requiredKills: null,
      combatAccess: { npcIds: [8437, 8438, 8443, 8497], itemId: 10662, quantity: 1 },
    });
    expect(method.objectives.get("objectives-complete")!.loot).toBeUndefined();
    expect(method.plan.actions[0]!.instructions.join(" ")).toContain("receives an Egg of Hakkar");
    expect(method.plan.actions[1]!.instructions.join(" ")).toContain(
      "Each player loots an Essence",
    );
    expect(method.plan.actions.map((action) => action.questChanges)).toEqual(
      input.plan.actions.map((action) => action.questChanges),
    );
    expect(method.plan.actions[0]!.requiredQuestIds).toEqual([4787]);
    expect(input).toEqual(before);
    expect(attachCampaignHakkarEvent(method.plan, input.sources, input.data)).toEqual(method);
  });

  it.each([
    "wrong-provider",
    "wrong-build",
    "wrong-archive",
    "wrong-output",
    "wrong-quantity",
    "wrong-objective",
    "changed-source",
    "duplicate-source",
    "missing-enemy",
    "partial-action",
    "wrong-context",
    "duplicate-event",
  ])("rejects an unqualified conversion (%s)", (change) => {
    const input = fixture();
    if (change === "wrong-provider") input.data.provider.revision = "0".repeat(40);
    if (change === "wrong-build") input.data.targetBuild = 70450;
    if (change === "wrong-archive")
      input.plan = { ...input.plan, sourceArchiveSha256: "0".repeat(64) };
    if (change === "wrong-output") input.data.quests[0]!.itemObjectives![0]!.itemId = 10663;
    if (change === "wrong-quantity") input.data.quests[0]!.itemObjectives![0]!.quantity = 2;
    if (change === "wrong-objective")
      input.data.quests[0]!.objectiveText = ["A different conversion"];
    if (change === "changed-source")
      input.sources[0]!.guide.steps[0]!.directives.find((row) => row.tag === ".use")!.arguments =
        "10662";
    if (change === "duplicate-source") input.sources.push(structuredClone(input.sources[0]!));
    if (change === "missing-enemy") input.data.npcs.pop();
    if (change === "partial-action")
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.map((action) => {
          const copy = { ...action };
          delete copy.wholeQuestObjectives;
          return copy;
        }),
      };
    if (change === "wrong-context")
      input.plan = {
        ...input.plan,
        legs: input.plan.legs.map((leg) => ({ ...leg, stopId: "dalaran" })),
      };
    if (change === "duplicate-event")
      input.plan = {
        ...input.plan,
        actions: [...input.plan.actions, { ...input.plan.actions[1]!, id: "second-event" }],
      };
    const result = attachCampaignHakkarEvent(input.plan, input.sources, input.data);
    expect(result.plan).toBe(input.plan);
    expect(result.objectives.size).toBe(0);
  });

  it("retains missing physical levels as a hold rather than filling them from the fixture", () => {
    const input = fixture();
    input.data.npcs[0]!.minimumLevel = null;
    input.data.npcs[0]!.maximumLevel = null;
    const plan = integrated(input);
    expect(createCampaignCombatReadiness(plan)(plan.actions[1]!).unknownNpcIds).toEqual([8437]);
    expect(plan.combat!.npcs.find((npc) => npc.id === 8437)!.maximumLevel).toBeNull();
  });

  it.each([
    [45, true],
    [46, false],
  ] as const)(
    "retains the ordinary +4 cap at party level %i without a new boss exemption",
    (level, blocked) => {
      const plan = integrated(fixture());
      for (const member of forecastCampaignXp(plan, progressAt(level))[0]!.members) {
        expect(member.blockedAtActionId).toBe(blocked ? "objectives-complete" : null);
        expect(member.rewards.filter((reward) => reward.questId === 3528)).toHaveLength(
          blocked ? 0 : 1,
        );
      }
    },
  );

  it("retains the Ancient Egg prerequisite before starting the event quest", () => {
    const plan = integrated(fixture()),
      initial = progressAt(55);
    const progress = {
      ...initial,
      members: initial.members.map((member) => ({ ...member, questStates: {} })),
    };
    for (const member of forecastCampaignXp(plan, progress)[0]!.members) {
      expect(member.blockedAtActionId).toBe("accepted");
      expect(member.rewards).toEqual([]);
    }
  });

  it("pays the hand-in once per player and adds no inferred event or conversion XP", () => {
    const input = fixture();
    const progress = progressAt(55);
    const unqualified = attachCampaignCombat(
      input.plan,
      [],
      input.data,
      "unqualified-event",
    );
    expect(
      forecastCampaignXp(unqualified, progress)[0]!.members[0]!.blockedAtActionId,
    ).not.toBeNull();
    const plan = integrated(input);
    for (const member of forecastCampaignXp(plan, progress)[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.knownEndpoint).toEqual({ level: 55, currentXp: 1000 });
      expect(member.rewards.filter((reward) => reward.questId === 3528)).toHaveLength(1);
      expect(member.combatXp).toBe(0);
      expect(member.incidentalCombatXp).toBe(0);
    }
    const compiled = compileCampaignAddon(plan, plan.actions, {
      version: "0.2.0-staged-event-contract",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    const native = compiled.documents
      .filter((document) => document.role === "party")
      .map((document) => document.content)
      .join("\n");
    for (const tag of ["accept", "turnin"])
      expect(native.match(new RegExp("\\." + tag + " 3528\\b", "g"))).toHaveLength(1);
    expect(native.match(/\.complete 3528,1\b/g)).toHaveLength(1);
    expect(native).not.toContain(".collect 10663,");
  });
});
