import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { campaignActionAlias, campaignActionNeeded } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { attachCampaignCombat, createCampaignCombatState } from "./campaign-combat.js";
import {
  forecastCampaignMaterialCombat,
  type CampaignMaterialParticipant,
} from "./campaign-material-combat.js";
import { combineCampaignSourceWork } from "./campaign-source-work.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { guidePartyScenario, guidePartyAnchors } from "./campaign-guide-party.js";
import { campaignItemStateSignature } from "./campaign-items.js";
import { compileCampaignAddon } from "./campaign-addon.js";

const checksum = "a".repeat(64);

function freshProgress(): ReturnType<typeof emptyPremadeProgress> {
  const base = emptyPremadeProgress();
  return {
    ...base,
    members: base.members.map((member) => ({
      ...member,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

function fixture(
  combined = false,
  questOnly = false,
  displayOnly = false,
): { plan: CampaignPlan; source: CampaignSource; dataset: CombatDataset } {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const raw = `${combined ? "step\n.accept 200\n" : ""}step\n.goto Elwynn Forest,40,80\n>>Kill Forest Boars. Loot them for Meat\n${combined ? ".complete 200,1 >>Kill Forest Boar (x3)\n.mob Forest Boar\n" : ""}.collect 10,2,100,1${displayOnly ? ",1" : ""}\n.mob Forest Boar\nstep\n.accept 100\nstep\n.turnin 100\n${combined ? "step\n.turnin 200" : ""}`;
  const guide = parseGuideChapter(raw, reference.id, checksum, 70205);
  const source = { reference, guide };
  const actions = guide.steps.flatMap((step): CampaignAction[] => {
    const changes = step.directives.flatMap((directive): CampaignAction["questChanges"] => {
      const state =
        directive.tag === ".accept"
          ? "accepted"
          : directive.tag === ".complete"
            ? "objectives-complete"
            : directive.tag === ".turnin"
              ? "rewarded"
              : null;
      return state && directive.questId
        ? [
            {
              questId: directive.questId,
              title: `Quest ${directive.questId}`,
              state,
              objectiveIndex: state === "objectives-complete" ? 1 : null,
            },
          ]
        : [];
    });
    return changes.length
      ? [
          {
            id: `fixture-${step.id}`,
            legId: "starter",
            title: "Source task",
            instructions: step.directives
              .filter((row) => row.tag === "text")
              .map((row) => row.text),
            positions: step.directives.flatMap((row) =>
              row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
            ),
            source: campaignActionSource(guide, step, step.directives),
            kind: "quests",
            leaderOnly: true,
            raidOnly: false,
            targetLevel: null,
            targetStopId: null,
            questChanges: changes,
          },
        ]
      : [];
  });
  const dataset = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "",
    provider: {
      repository: "https://example.test/fixture",
      revision: "b".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: checksum,
      questSha256: checksum,
      itemSha256: checksum,
      limitations: ["Synthetic test"],
    },
    npcs: [
      {
        id: 1,
        name: "Forest Boar",
        minimumLevel: 1,
        maximumLevel: 1,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 100,
        creatureIds: [],
        itemCreatureIds: [1],
        objectiveText: ["Bring 2 Meat"],
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 10,
            itemName: "Meat",
            quantity: 2,
            npcIds: [1],
            sharing: "pooled",
          },
        ],
      },
      {
        questId: 200,
        creatureIds: [1],
        itemCreatureIds: [],
        onlyCreatureObjectives: true,
        objectiveText: ["Kill 3 Forest Boars"],
        killQuotas: [{ objectiveIndex: 1, npcId: 1, kills: 3, source: "Captured test quota" }],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
    lootDrops: [
      {
        itemId: 10,
        npcId: 1,
        probability: 0.5,
        probabilityBasis: "reported",
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 100,
        targetBuild: 70205,
        sourceBuild: null,
        sourceUrl: "https://example.test/item=10",
        sourceSha256: checksum,
        capturedAt: "2026-11-02T00:00:00.000Z",
        probabilityReference: {
          kind: "classic-1.12-reference",
          repository: "https://github.com/cmangos/classic-db",
          revision: "c".repeat(40),
          file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
          sha256: checksum,
          sourceBuild: 5875,
          referencedAt: "2026-11-02T00:00:00.000Z",
          itemId: 10,
          npcId: 1,
          lootEntry: 1,
          probability: 0.5,
          questOnly,
          rateMultiplier: 1,
        },
      },
    ],
  });
  actions.push({
    id: "shared-finish",
    legId: "starter",
    title: "Meet the party",
    instructions: ["Meet the party"],
    positions: [],
    source: null,
    kind: "instructions",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: [],
  });
  const base: CampaignPlan = {
    release: "material-work-fixture",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "starter",
        title: "Starter",
        kind: "starter",
        from: 1,
        to: 2,
        stopId: null,
        questIds: combined ? [100, 200] : [100],
        unresolvedQuestIds: [],
        actionIds: actions.map((action) => action.id),
      },
    ],
    rewardFacts: [100, 200].map((questId) => ({
      questId,
      fullXp: 100,
      questLevel: 1,
      minimumLevel: 1,
      xpByLevel: [],
      evidenceKind: "published-forever",
      status: "available",
      capturedAt: "2026-11-02T00:00:00.000Z",
      sourceUrl: `https://example.test/quest=${questId}`,
    })),
  };
  return { plan: attachCampaignCombat(base, [source], dataset, checksum), source, dataset };
}

describe("source-directed material combat", () => {
  function workload(combined = false): {
    plan: CampaignPlan;
    input: Parameters<typeof forecastCampaignMaterialCombat>[0];
    participant: CampaignMaterialParticipant;
  } {
    const { plan } = fixture(combined);
    const action = plan.actions.find((entry) => entry.itemCollections?.length)!;
    const combat = plan.combat!;
    const participant: CampaignMaterialParticipant = {
      position: { level: 1, currentXp: 0 },
      questStates: combined ? { "200": "accepted" } : {},
      confirmations: {},
      minimumItems: new Map(),
      freshInventoryReference: true,
      encounteredNpcIds: new Set(),
      state: createCampaignCombatState(combat, freshProgress().members[0]!),
      combat,
    };
    return {
      plan,
      participant,
      input: {
        action,
        work: combat.materialWork![0]!,
        combat,
        participants: [participant],
        lootScenario: "expected",
        xpMultiplier: 1,
      },
    };
  }

  it("credits ordinary pre-pickup gathering from a fresh reference start without accepting a quest early", () => {
    const { plan } = fixture();
    const result = forecastCampaignXp(plan, freshProgress())[0]!.members[0]!;
    expect(result.combatRows).toHaveLength(1);
    expect(result.combatRows[0]).toMatchObject({ kills: 4, basis: "reference-estimate" });
    expect(result.combatXp).toBeGreaterThan(0);
    expect(result.referenceQuestXp).toBe(100);
    expect(result.steps.findIndex((step) => step.phase === "combat")).toBeLessThan(
      result.steps.findIndex((step) => step.phase === "accepted"),
    );
    expect(result.questLog).toMatchObject({ capacity: 40, used: 0, peak: 1 });
    expect(result.issues.some((issue) => issue.code === "item-acquisition-unqualified")).toBe(true);
  });

  it.each(["separate", "together"] as const)(
    "counts one combined kill-and-material source program (%s)",
    (mode) => {
      const { plan, source } = fixture(true);
      const combined = plan.actions.find((action) => action.itemCollections?.length)!;
      expect(combined.questChanges).toEqual([
        { questId: 200, title: "Quest 200", state: "objectives-complete", objectiveIndex: 1 },
      ]);
      expect(
        plan.actions.filter((action) => action.source?.stepId === combined.source!.stepId),
      ).toHaveLength(1);
      const oldId = `starter-116-${combined.source!.stepId}-collect-100-10`;
      expect(campaignActionAlias(plan, freshProgress(), oldId)).toBe(combined.id);
      const scenario = guidePartyScenario(plan, freshProgress(), mode);
      const result = forecastCampaignXp(
        scenario.plan,
        scenario.progress,
        guidePartyAnchors(scenario, []),
      );
      for (const member of result[0]!.members) {
        expect(member.combatRows).toHaveLength(1);
        expect(member.combatRows[0]!.kills).toBe(mode === "separate" ? 5 : 20);
        expect(member.referenceQuestXp).toBe(200);
      }
      const native = compileCampaignAddon(plan, plan.actions, {
        version: "0.1.0-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        nativeSources: [source],
        includeObservers: false,
      });
      expect(
        native.documents
          .map((document) => document.content)
          .join("\n")
          .match(/\.collect 10,2,100,1/g),
      ).toHaveLength(1);
    },
  );

  it("keeps unknown recorded stock out of the fresh-inventory reference", () => {
    const { plan } = fixture();
    const base = freshProgress();
    const progress = {
      ...base,
      members: base.members.map((member) => ({ ...member, level: 2, currentXp: 0 })),
    };
    const result = forecastCampaignXp(plan, progress)[0]!.members[0]!;
    expect(result.combatRows).toHaveLength(0);
    expect(
      result.issues.find((issue) => issue.code === "item-acquisition-unqualified")?.message,
    ).toContain("not known empty");
  });

  it("uses already-held stock without paying a second gathering workload", () => {
    const { plan } = fixture(true);
    const base = freshProgress();
    const progress = {
      ...base,
      members: base.members.map((member) => ({
        ...member,
        raceId: "human" as const,
        classSlug: "warrior" as const,
        itemHoldings: {
          revision: "campaign-items-v1" as const,
          sourceBuild: 70205,
          raceId: "human" as const,
          classSlug: "warrior" as const,
          signature: campaignItemStateSignature(member.questStates, member.confirmations),
          minimums: { "10": 2 },
        },
      })),
    };
    const result = forecastCampaignXp(plan, progress)[0]!.members[0]!;
    expect(result.combatRows).toHaveLength(1);
    expect(result.combatRows[0]!.kills).toBe(3);
    expect(result.combatRows[0]!.activityId).not.toContain("material-work");
  });

  it("does not forecast quest-only items before their pickup", () => {
    const { plan } = fixture(false, true);
    const result = forecastCampaignXp(plan, freshProgress())[0]!.members[0]!;
    expect(result.combatRows).toHaveLength(0);
    expect(
      result.issues.find((issue) => issue.code === "item-acquisition-unqualified")?.message,
    ).toContain("drop without the quest");
  });

  it("keeps combined work visible when the kill quest is done but its materials are missing", () => {
    const { plan } = fixture(true);
    const action = plan.actions.find((entry) => entry.itemCollections?.length)!;
    const base = freshProgress();
    const progress = {
      ...base,
      members: base.members.map((member) => ({
        ...member,
        questStates: { "200": "rewarded" as const },
      })),
    };
    expect(campaignActionNeeded(plan, progress, action)).toBe(true);
  });

  it("does not repeat gathering after earlier fights may have supplied the materials", () => {
    const { input, participant } = workload();
    const result = forecastCampaignMaterialCombat({
      ...input,
      participants: [{ ...participant, encounteredNpcIds: new Set([1]) }],
    });
    expect(result).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("Earlier fights"),
    });
    expect(participant.state.counters.size).toBe(0);
    expect(participant.state.paid.size).toBe(0);
  });

  it("holds partial and unequal stock without mutating any participant", () => {
    const { input, participant } = workload();
    for (const participants of [
      [{ ...participant, minimumItems: new Map([[10, 1]]) }],
      [participant, { ...participant, minimumItems: new Map([[10, 2]]) }],
    ]) {
      expect(forecastCampaignMaterialCombat({ ...input, participants })).toMatchObject({
        status: "unknown",
        reason: expect.stringContaining("Unequal or partial"),
      });
    }
    expect(participant.state.paid.size).toBe(0);
  });

  it("holds a future random partial kill counter instead of crediting an invented remainder", () => {
    const { input, participant } = workload(true);
    expect(
      forecastCampaignMaterialCombat({ ...input, action: { ...input.action, questChanges: [] } }),
    ).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("random partial counter"),
    });
    const completed = forecastCampaignMaterialCombat({
      ...input,
      action: { ...input.action, questChanges: [] },
      participants: [{ ...participant, confirmations: { "campaign-objective-200-1": true } }],
    });
    expect(completed.status).toBe("planned");
    if (completed.status !== "planned") throw new Error("Expected completed-counter reference.");
    expect(completed.forecasts[0]!.rows[0]!.kills).toBe(4);
    expect(completed.forecasts[0]!.state.counters.has("200:1")).toBe(false);
  });

  it("holds missing creature rank or drop evidence atomically", () => {
    const { input, participant } = workload(true);
    for (const combat of [
      { ...input.combat, npcs: input.combat.npcs.map((npc) => ({ ...npc, rank: null })) },
      { ...input.combat, lootDrops: [] },
    ]) {
      expect(
        forecastCampaignMaterialCombat({
          ...input,
          combat,
          participants: [{ ...participant, combat }],
        }).status,
      ).toBe("unknown");
    }
    expect(participant.state.counters.size).toBe(0);
    expect(participant.state.counters.has("200:1")).toBe(false);
    expect(participant.state.paid.size).toBe(0);
  });

  it("recognizes its own accepted material objective without inventing an overlapping workload", () => {
    const { input, participant } = workload();
    const combat = {
      ...input.combat,
      activities: [
        ...input.combat.activities,
        {
          id: "later-material-objective",
          actionId: "later-material-objective",
          environment: "outdoor" as const,
          objectives: [input.work.targets[0]!.objective],
          profile: null,
        },
      ],
    };
    const own = { ...participant, questStates: { "100": "accepted" as const }, combat };
    expect(forecastCampaignMaterialCombat({ ...input, combat, participants: [own] }).status).toBe(
      "planned",
    );
    const unknown = { ...own.state, counters: new Map([["100:1", null]]) };
    expect(
      forecastCampaignMaterialCombat({
        ...input,
        combat,
        participants: [{ ...own, state: unknown }],
      }).status,
    ).toBe("unknown");
  });

  it("discards an earlier provisional calculation when a later source creature is unresolved", () => {
    const { input, participant } = workload(true);
    const target = {
      ...input.action.itemCollections![0]!,
      itemId: 20,
      confirmationKey: "second-material",
    };
    const work = {
      ...input.work,
      targets: [
        ...input.work.targets,
        {
          ...input.work.targets[0]!,
          confirmationKey: target.confirmationKey,
          objective: {
            ...input.work.targets[0]!.objective,
            npcIds: [2],
            loot: { ...input.work.targets[0]!.objective.loot!, itemId: 20 },
          },
        },
      ],
    };
    expect(
      forecastCampaignMaterialCombat({
        ...input,
        work,
        action: { ...input.action, itemCollections: [...input.action.itemCollections!, target] },
        participants: [
          { ...participant, questStates: { ...participant.questStates, "100": "accepted" } },
        ],
      }),
    ).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("no compatible XP reference"),
    });
    expect(participant.state.counters.size).toBe(0);
    expect(participant.state.paid.size).toBe(0);
  });

  it("rejects inconsistent material identities and foreign combat references", () => {
    const { input, participant } = workload();
    expect(
      forecastCampaignMaterialCombat({
        ...input,
        work: {
          ...input.work,
          targets: input.work.targets.map((target) => ({
            ...target,
            objective: { ...target.objective, loot: { ...target.objective.loot!, quantity: 3 } },
          })),
        },
      }),
    ).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("disagree"),
    });
    expect(() =>
      forecastCampaignMaterialCombat({
        ...input,
        participants: [{ ...participant, combat: { ...participant.combat, revision: "foreign" } }],
      }),
    ).toThrow("another combat input");
  });

  it("does not pay an already accounted material stream again", () => {
    const { input, participant } = workload();
    const first = forecastCampaignMaterialCombat(input);
    expect(first.status).toBe("planned");
    if (first.status !== "planned") throw new Error("Expected first material reference.");
    expect(
      forecastCampaignMaterialCombat({
        ...input,
        participants: [{ ...participant, state: first.forecasts[0]!.state }],
      }),
    ).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("already been accounted"),
    });
    expect(participant.state.paid.size).toBe(0);
  });

  it("preserves text-only collection and differing source contexts as separate programs", () => {
    const { plan } = fixture(true, false, true);
    const material = plan.actions.find((entry) => entry.itemCollections?.length)!;
    expect(material.questChanges).toHaveLength(0);
    expect(
      plan.actions.filter((entry) => entry.source?.stepId === material.source!.stepId),
    ).toHaveLength(2);
    const hardWork = plan.combat!.materialWork!.map((work) => ({
      ...work,
      targets: work.targets.map((target) => ({ ...target, sourceBlocksCompletion: true })),
    }));
    for (const key of ["leaderOnly", "raidOnly"] as const) {
      const different = {
        ...plan,
        actions: plan.actions.map((action) =>
          action.id === material.id ? { ...action, [key]: !action[key] } : action,
        ),
      };
      expect(combineCampaignSourceWork(different, hardWork)).toBe(different);
    }
  });

  it("blocks pickup at 40 quests without treating gathered stock as a free quest slot", () => {
    const { plan } = fixture();
    const base = freshProgress();
    const progress = {
      ...base,
      members: base.members.map((member) => ({
        ...member,
        questStates: Object.fromEntries(
          Array.from({ length: 40 }, (_, index) => [
            String(1000 + index),
            index % 2 ? ("accepted" as const) : ("objectives-complete" as const),
          ]),
        ),
      })),
    };
    const member = forecastCampaignXp(plan, progress)[0]!.members[0]!;
    expect(member.questLog).toEqual({ capacity: 40, used: 40, peak: 40 });
    expect(member.referenceQuestXp).toBe(0);
    expect(member.issues.some((issue) => issue.code === "quest-log-full")).toBe(true);
  });
});
