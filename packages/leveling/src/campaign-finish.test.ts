import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { activeCampaignActions } from "./campaign.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { compileCampaignFinish } from "./campaign-finish.js";
import { FINISH_ROUTE, FINISH_PROVIDER_REVISION } from "./campaign-finish-route.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import type { CombatDataset } from "./combat-model.js";
import { refreshCampaignFundingReview } from "./campaign-funding-review.js";
import { prepareCampaignPlan } from "./campaign-preparation.js";

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog } {
  const ids = [
    ...new Set(FINISH_ROUTE.flatMap((wing) => wing.steps.flatMap((step) => step.questId ?? []))),
  ];
  const parents = new Map([
    [5526, 5527],
    [5515, 5382],
    [5384, 5515],
    [5282, 5281],
  ]);
  const quests: QuestCatalogEntry[] = ids.map((questId) => ({
    questId,
    title: `Quest ${questId}`,
    minimumLevel: 55,
    questLevel: 60,
    requiredRaces: 0,
    requiredClasses: 0,
    starts: [
      {
        npcId: questId,
        name: `NPC ${questId}`,
        friendlyToAlliance: true,
        positions: [{ zone: "1423", x: 50, y: 50 }],
      },
    ],
    ends: [
      {
        npcId: questId,
        name: `NPC ${questId}`,
        friendlyToAlliance: true,
        positions: [{ zone: "1423", x: 50, y: 50 }],
      },
    ],
    prerequisites: { allOf: [], anyOf: parents.has(questId) ? [parents.get(questId)!] : [] },
    exclusiveWith: [],
    category: "unsupported",
    objectives: [],
    unsupportedRequirements: ["non-outdoor-zone"],
  }));
  const intro: CampaignAction = {
    id: "level-60-finish-dungeon-circuit",
    legId: "level-60-finish",
    title: "Finish",
    instructions: [],
    questChanges: [],
    positions: [],
    source: null,
    kind: "xp-check",
    leaderOnly: false,
    targetLevel: 60,
    targetStopId: null,
    raidOnly: false,
    dungeonFinishOnly: true,
  };
  const checkpoint: CampaignAction = {
    ...intro,
    id: "level-60-finish-checkpoint",
    kind: "checkpoint",
    dungeonFinishOnly: false,
  };
  return {
    plan: {
      release: "finish-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sourceArchiveSha256: "f".repeat(64),
      dungeonFinish: true,
      actions: [intro, checkpoint],
      legs: [
        {
          id: "level-60-finish",
          title: "Finish",
          from: 55,
          to: 60,
          kind: "finish",
          actionIds: [intro.id, checkpoint.id],
          questIds: [],
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
      rewardFacts: quests.map((q) => ({
        questId: q.questId,
        fullXp: 1000,
        questLevel: 60,
        minimumLevel: 55,
        xpByLevel: [],
        sourceUrl: "https://example.test/quest",
        capturedAt: "2026-11-01T00:00:00.000Z",
        status: "available",
        evidenceKind: "historical-reference",
      })),
    },
    catalog: {
      schema: "forever-quest-funding-catalog.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic fixture",
      providerRevision: FINISH_PROVIDER_REVISION,
      questSha256: "a".repeat(64),
      npcSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      areaMapSha256: "d".repeat(64),
      sourceArchiveSha256: "f".repeat(64),
      includesAuthoredCorrections: true,
      quests,
    },
  };
}

function progress(): ReturnType<typeof emptyPremadeProgress> {
  const p = emptyPremadeProgress();
  return {
    ...p,
    members: p.members.map((member) => ({
      ...member,
      level: 57,
      currentXp: 0,
      xpNeedsUpdate: false,
      raceId: "human",
      classSlug: "warrior" as const,
    })),
  };
}

describe("first-clear finish task compilation", () => {
  it("expands objective references after the finish tasks are generated", () => {
    const input = fixture();
    const data: CombatDataset = {
      schema: "forever-combat-reference.v1",
      targetBuild: input.plan.targetBuild,
      publication: "private-reference",
      authorizationNote: "Synthetic finish-objective fixture",
      provider: {
        repository: "https://example.test/provider",
        revision: FINISH_PROVIDER_REVISION,
        layer: "forever-static-with-authored",
        questSha256: input.catalog.questSha256,
        npcSha256: input.catalog.npcSha256,
        itemSha256: "c".repeat(64),
        limitations: ["Synthetic finish-objective fixture"],
      },
      npcs: [],
      quests: [
        {
          questId: 5001,
          creatureIds: [],
          itemCreatureIds: [],
          objectiveText: [],
          onlyCreatureObjectives: false,
          itemObjectives: [
            { objectiveIndex: 2, itemId: 300001, quantity: 1, npcIds: [], sharing: "unknown" },
          ],
        },
      ],
      dungeons: [],
      killXpEvidence: [],
    };
    const prepared = prepareCampaignPlan(input.plan, [], {
      starters: { entries: [], routes: [] },
      rewardFacts: input.plan.rewardFacts!,
      rewardRevision: "finish-objective-fixture",
      rewardBuild: input.plan.targetBuild,
      rewardNotice: null,
      combat: { data, revision: "finish-objective-fixture" },
      questCatalog: input.catalog,
    });
    const action = prepared.actions.find((entry) =>
      entry.questChanges.some(
        (change) => change.questId === 5001 && change.state === "objectives-complete",
      ),
    );
    expect(action?.wholeQuestObjectives).toBe(true);
    expect(action?.questChanges.map((change) => change.objectiveIndex)).toEqual([1, 2]);
  });

  it("refreshes the actual remaining gates instead of reporting the replaced placeholder", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      questFunding: {
        revision: "explicit-quest-funding-20261101-v22",
        providerRevision: FINISH_PROVIDER_REVISION,
        addedQuestIds: [],
        remaining: [
          {
            checkpointId: "level-60-finish-dungeon-circuit",
            missingXpByPlayer: [100, 100, 100, 100, 100],
          },
        ],
        scenarios: [],
      },
    };
    const plan = refreshCampaignFundingReview(compileCampaignFinish(input.plan, input.catalog));
    expect(plan.questFunding?.scenarios).toHaveLength(16);
    expect(
      plan.questFunding?.remaining.some(
        (gap) => gap.checkpointId === "level-60-finish-dungeon-circuit",
      ),
    ).toBe(false);
    expect(
      plan.questFunding?.remaining.some((gap) => gap.checkpointId.endsWith("4701-accepted")),
    ).toBe(true);
    expect(plan.questFunding?.addedQuestIds).toEqual([]);
  });
  it("emits actual lifecycles and every objective slot while preserving intro/checkpoint identity", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const plan = compileCampaignFinish(input.plan, input.catalog);
    expect(plan.actions[0]).toMatchObject({
      id: "level-60-finish-dungeon-circuit",
      kind: "instructions",
      targetLevel: null,
    });
    expect(plan.actions.at(-1)).toEqual(input.plan.actions.at(-1));
    expect(plan.finishCircuitReview?.wingIds).toHaveLength(8);
    expect(plan.finishCircuitReview?.plannedQuestIds).toContain(5343);
    expect(
      plan.actions
        .filter((action) =>
          action.questChanges.some((change) => change.state === "objectives-complete"),
        )
        .every((action) => action.wholeQuestObjectives),
    ).toBe(true);
    expect(
      plan.actions
        .find((a) =>
          a.questChanges.some((c) => c.questId === 5343 && c.state === "objectives-complete"),
        )
        ?.questChanges.map((c) => c.objectiveIndex),
    ).toEqual([1, 2, 3, 4]);
    expect(
      plan.actions
        .find((a) =>
          a.questChanges.some((c) => c.questId === 5382 && c.state === "objectives-complete"),
        )
        ?.questChanges.map((c) => c.objectiveIndex),
    ).toEqual([1, 2, 3]);
    const addon = compileCampaignAddon(plan, activeCampaignActions(plan, progress()), {
      version: "0.2.0-review.finish",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    for (const index of [1, 2, 3, 4]) expect(addon.lua).toContain(`.complete 5343,${index}`);
    expect(addon.lua).toContain(".accept 5384");
    expect(JSON.stringify(input)).toBe(before);
    expect(compileCampaignFinish(plan, input.catalog)).toBe(plan);
  });

  it("keeps outside returns before later inside pickups and retains phase locations", () => {
    const input = fixture(),
      plan = compileCampaignFinish(input.plan, input.catalog);
    const phase = (id: number, state: string): number =>
      plan.actions.findIndex((a) =>
        a.questChanges.some((c) => c.questId === id && c.state === state),
      );
    expect(phase(5382, "rewarded")).toBeLessThan(phase(5515, "accepted"));
    expect(phase(5515, "rewarded")).toBeLessThan(phase(5384, "accepted"));
    expect(plan.actions[phase(5515, "accepted")]?.requiredQuestIds).toEqual([5382]);
    expect(plan.actions[phase(5382, "objectives-complete")]?.location?.insideDungeon).toBe(
      "scholomance",
    );
    expect(plan.actions[phase(5382, "rewarded")]?.location?.insideDungeon).toBeUndefined();
    const located = attachCampaignLocations(plan, []);
    expect(located.actions[phase(5382, "objectives-complete")]?.location).toEqual(
      plan.actions[phase(5382, "objectives-complete")]?.location,
    );
  });

  it("pays each player once, adds zero assumed grinding or clear XP, and excludes already-paid rewards", () => {
    const input = fixture(),
      plan = compileCampaignFinish(input.plan, input.catalog),
      p = progress();
    p.members[0]!.questStates["5343"] = "rewarded";
    const forecast = forecastCampaignXp(plan, p);
    for (const member of forecast[0]!.members) {
      expect(member.combatXp).toBe(0);
      expect(member.estimatedCombatXp).toBe(0);
      expect(member.rewards.filter((r) => r.questId === 5343)).toHaveLength(
        member.player === 1 ? 0 : 1,
      );
      expect(new Set(member.rewards.map((r) => r.questId)).size).toBe(member.rewards.length);
      expect(member.checkpoints.at(-1)?.ready).toBe(false);
    }
    const mixed = { ...p, dungeonFinish: { ...p.dungeonFinish, strategy: "mixed" as const } };
    expect(activeCampaignActions(plan, mixed).flatMap((a) => a.questChanges)).toEqual([]);
    expect(activeCampaignActions(plan, mixed).map((a) => a.id)).toEqual([
      "level-60-finish-checkpoint",
    ]);
  });

  it.each(["class", "race", "minimum", "profession", "repeatable", "exclusive", "giver"] as const)(
    "holds restricted %s work and its dependent chain",
    (reason) => {
      const input = fixture(),
        q = input.catalog.quests.find((q) => q.questId === 5382)!;
      if (reason === "class") q.requiredClasses = 1;
      if (reason === "race") q.requiredRaces = 1;
      if (reason === "minimum") q.minimumLevel = null;
      if (reason === "profession") q.unsupportedRequirements.push("requiredSkill");
      if (reason === "repeatable") q.unsupportedRequirements.push("repeatable");
      if (reason === "exclusive") q.exclusiveWith.push(5343);
      if (reason === "giver") q.starts[0]!.friendlyToAlliance = false;
      const plan = compileCampaignFinish(input.plan, input.catalog);
      for (const id of [5382, 5515, 5384]) {
        expect(plan.finishCircuitReview?.deferred.some((row) => row.questId === id)).toBe(true);
        expect(plan.actions.some((a) => a.questChanges.some((c) => c.questId === id))).toBe(false);
      }
      expect(plan.finishCircuitReview?.plannedQuestIds).toContain(5343);
    },
  );

  it("leaves conditional, repeatable, cap-only and unprepared chains outside the first-clear budget", () => {
    const input = fixture(),
      plan = compileCampaignFinish(input.plan, input.catalog);
    for (const id of [5582, 7463, 7507, 5528, 7703, 5089, 4788, 8945, 5466]) {
      expect(
        plan.finishCircuitReview?.deferred.find((row) => row.questId === id)?.reason,
      ).toBeTruthy();
      expect(plan.finishCircuitReview?.plannedQuestIds).not.toContain(id);
    }
    const parent = input.catalog.quests.find((q) => q.questId === 5526)!;
    parent.prerequisites.anyOf = [991001];
    expect(
      compileCampaignFinish(input.plan, input.catalog).finishCircuitReview?.plannedQuestIds,
    ).not.toContain(5526);
  });

  it("rejects different evidence identities and stale compiled exports", () => {
    const input = fixture();
    expect(() =>
      compileCampaignFinish(input.plan, { ...input.catalog, targetBuild: 70450 }),
    ).toThrow(/catalog/);
    expect(() =>
      compileCampaignFinish(input.plan, { ...input.catalog, providerRevision: "0".repeat(40) }),
    ).toThrow(/catalog/);
    expect(() =>
      compileCampaignFinish(input.plan, { ...input.catalog, sourceArchiveSha256: "0".repeat(64) }),
    ).toThrow(/catalog/);
    const plan = compileCampaignFinish(input.plan, input.catalog);
    expect(() =>
      compileCampaignFinish(plan, { ...input.catalog, questSha256: "0".repeat(64) }),
    ).toThrow(/Rebuild/);
  });

  it("keeps inside combat in its dungeon context and does not reinterpret unknown tuning as outdoor XP", () => {
    const input = fixture(),
      plan = compileCampaignFinish(input.plan, input.catalog);
    const dataset: CombatDataset = {
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic fixture",
      provider: {
        repository: "https://example.test",
        revision: FINISH_PROVIDER_REVISION,
        layer: "forever-static-with-authored",
        npcSha256: "b".repeat(64),
        questSha256: "a".repeat(64),
        itemSha256: "c".repeat(64),
        limitations: ["Synthetic fixture"],
      },
      npcs: [
        {
          id: 10678,
          name: "Plagued Hatchling",
          minimumLevel: 57,
          maximumLevel: 57,
          rank: 1,
          zoneIds: [2057],
          xpEligibility: "assumed",
        },
      ],
      quests: [
        {
          questId: 5529,
          creatureIds: [10678],
          itemCreatureIds: [],
          objectiveText: ["Kill 20 Plagued Hatchlings"],
          onlyCreatureObjectives: true,
        },
      ],
      dungeons: [],
      killXpEvidence: [],
    };
    const withCombat = attachCampaignCombat(plan, [], dataset, "synthetic");
    const activity = withCombat.combat?.activities.find((a) =>
      a.objectives.some((o) => o.questId === 5529),
    );
    expect(activity?.environment).toBe("dungeon");
    expect(activity?.pathId).toContain("scholomance");
    const member = forecastCampaignXp(withCombat, progress())[0]!.members[0]!;
    expect(member.combatXp).toBe(0);
    expect(member.issues.some((i) => i.code === "dungeon-objective-misordered")).toBe(false);
    const { finishCircuitReview: _review, ...unverified } = withCombat;
    expect(
      forecastCampaignXp(unverified, progress())[0]!.members[0]!.issues.some(
        (i) => i.code === "dungeon-objective-misordered",
      ),
    ).toBe(true);
  });
});
