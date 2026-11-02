import { describe, expect, it } from "vitest";
import { batchCampaignChainVisits } from "./campaign-chain-visits.js";
import type { CampaignAction, CampaignPlan, CampaignQuestChange } from "./campaign.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import type { CombatDataset } from "./combat-model.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";

function change(questId: number, state: CampaignQuestChange["state"]): CampaignQuestChange {
  return {
    questId,
    state,
    title: `Quest ${questId}`,
    objectiveIndex: state === "objectives-complete" ? 1 : null,
  };
}
function action(
  id: string,
  legId: string,
  zone: string | null,
  questChanges: readonly CampaignQuestChange[] = [],
): CampaignAction {
  return {
    id,
    legId,
    title: id,
    instructions: [],
    questChanges,
    positions: zone
      ? [{ sourceLine: 0, position: { zone, x: 25, y: 45, floor: null, space: "map-percent" } }]
      : [],
    source: null,
    kind: questChanges.length ? "quests" : "instructions",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}
const gry = {
  npcId: 234,
  name: "Gryan Stoutmantle",
  friendlyToAlliance: true,
  positions: [{ zone: "1436", x: 56.33, y: 47.52 }],
};
const wiley = {
  npcId: 266,
  name: "Wiley the Black",
  friendlyToAlliance: true,
  positions: [{ zone: "1433", x: 21.39, y: 45.35 }],
};
const oslow = {
  npcId: 341,
  name: "Foreman Oslow",
  friendlyToAlliance: true,
  positions: [{ zone: "1433", x: 27.05, y: 48.64 }],
};
function quest(questId: number): QuestCatalogEntry {
  return {
    questId,
    title: `Quest ${questId}`,
    minimumLevel: questId === 65 || questId === 132 ? 14 : 1,
    questLevel: 18,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [questId === 125 ? oslow : questId === 132 ? wiley : gry],
    ends: [questId === 65 ? wiley : gry],
    prerequisites: { allOf: [], anyOf: questId === 132 ? [65] : [] },
    exclusiveWith: [],
    category: "delivery",
    objectives: [],
    unsupportedRequirements:
      questId === 132 ? ["provided-item-interaction", "unresolved-objective-text"] : [],
    ...(questId === 132 ? { providedItem: { itemId: 1327, name: "Wiley's Note" } } : {}),
  };
}
function fixture(level = 14): { plan: CampaignPlan; catalog: QuestCatalog; combat: CombatDataset } {
  const early = "northern-approach",
    late = "defias-unlock";
  const actions: CampaignAction[] = [
    action(
      "prior-work",
      early,
      "1439",
      (["accepted", "objectives-complete", "rewarded"] as const).map((state) =>
        change(300001, state),
      ),
    ),
    {
      ...action("class-utility", early, "1439"),
      leaderOnly: true,
      nativeUtilityTags: [".trainer"],
    },
    action(
      "militia",
      early,
      "1436",
      (["accepted", "objectives-complete", "rewarded"] as const).map((state) => change(14, state)),
    ),
    action("tools-pickup", early, "1433", [change(125, "accepted")]),
    action("tools-finish", early, "1433", [
      change(125, "objectives-complete"),
      change(125, "rewarded"),
    ]),
    { ...action("north-gate", early, "1439"), kind: "checkpoint", targetLevel: 20 },
    action("later-city", late, "1453"),
    {
      ...action("courier-pickup", late, "1436", [change(65, "accepted")]),
      source: { chapterId: "courier-source", version: "fixture", stepId: "pickup" },
    },
    {
      ...action("courier-complete", late, null, [change(65, "objectives-complete")]),
      instructions: ["Talk to Wiley the Black in Lakeshire."],
    },
    {
      ...action("courier-handin", late, "1433", [change(65, "rewarded"), change(132, "accepted")]),
      source: { chapterId: "courier-source", version: "fixture", stepId: "handoff" },
    },
    action("return-note", late, "1436", [
      change(132, "objectives-complete"),
      change(132, "rewarded"),
    ]),
    action("late-city-return", late, "1453"),
  ];
  let entryXp = 0;
  for (let at = 1; at < level; at++) entryXp += FOREVER_XP_CURVE[at]!;
  const plan: CampaignPlan = {
    release: "courier-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: "a".repeat(64),
    actions,
    legs: [early, late].map((id) => ({
      id,
      title: id,
      from: 1,
      to: 20,
      kind: "preparation",
      stopId: null,
      actionIds: actions.filter((a) => a.legId === id).map((a) => a.id),
      questIds: [
        ...new Set(
          actions
            .filter((a) => a.legId === id)
            .flatMap((a) => a.questChanges.map((c) => c.questId)),
        ),
      ],
      unresolvedQuestIds: [],
    })),
    rewardFacts: [300001, 14, 125, 65, 132].map((questId) => ({
      questId,
      fullXp: questId === 300001 ? entryXp : questId === 65 ? 1350 : 0,
      questLevel: 60,
      minimumLevel: questId === 65 || questId === 132 ? 14 : 1,
      xpByLevel: [],
      sourceUrl: "https://example.test/reward",
      capturedAt: "2026-11-01T00:00:00.000Z",
      status: "available",
      evidenceKind: "historical-reference",
    })),
  };
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic fixture",
    providerRevision: "b".repeat(40),
    questSha256: "c".repeat(64),
    npcSha256: "d".repeat(64),
    areaMapSha256: "e".repeat(64),
    sourceArchiveSha256: plan.sourceArchiveSha256!,
    includesAuthoredCorrections: false,
    quests: [65, 132, 14, 125].map(quest),
  };
  const combat: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic fixture",
    provider: {
      repository: "https://example.test/reference",
      revision: catalog.providerRevision,
      layer: "forever-static-with-authored",
      questSha256: catalog.questSha256,
      npcSha256: catalog.npcSha256,
      itemSha256: "f".repeat(64),
      limitations: ["Synthetic fixture"],
    },
    npcs: [],
    dungeons: [],
    killXpEvidence: [],
    quests: [
      {
        questId: 65,
        creatureIds: [],
        itemCreatureIds: [],
        itemObjectives: [],
        onlyCreatureObjectives: false,
        objectiveText: ["Gryan Stoutmantle wants you to talk to Wiley in Lakeshire."],
      },
      {
        questId: 132,
        creatureIds: [],
        itemCreatureIds: [],
        itemObjectives: [],
        onlyCreatureObjectives: false,
        objectiveText: ["Take Wiley's Note to Gryan Stoutmantle in Westfall."],
      },
    ],
  };
  return { plan, catalog, combat };
}

describe("required courier during existing town visits", () => {
  it("hands in the existing courier earlier, preserves every action and carries the note until the later visit", () => {
    const { plan, catalog, combat } = fixture(),
      frozen = JSON.stringify(plan);
    const next = batchCampaignChainVisits(plan, combat, catalog);
    expect(next).not.toBe(plan);
    expect(next.actions.map((a) => a.id)).toEqual([
      "prior-work",
      "class-utility",
      "militia",
      "courier-pickup",
      "courier-complete",
      "courier-handin",
      "tools-pickup",
      "tools-finish",
      "north-gate",
      "later-city",
      "return-note",
      "late-city-return",
    ]);
    expect(next.rewardFacts).toBe(plan.rewardFacts);
    expect(next.actions.find((a) => a.id === "return-note")).toBe(
      plan.actions.find((a) => a.id === "return-note"),
    );
    expect(next.actions.find((a) => a.id === "class-utility")).toBe(
      plan.actions.find((a) => a.id === "class-utility"),
    );
    for (const original of plan.actions) {
      const moved = next.actions.find((a) => a.id === original.id)!;
      const instructions =
        original.id === "courier-handin"
          ? moved.instructions.slice(0, original.instructions.length)
          : moved.instructions;
      expect({ ...moved, legId: original.legId, instructions }).toEqual(original);
    }
    expect(next.actions.find((a) => a.id === "courier-handin")!.instructions.at(-1)).toContain(
      "Keep Wiley's Note",
    );
    expect(next.legs[0]!.questIds).toContain(65);
    expect(next.legs[1]!.questIds).not.toContain(65);
    expect(next.legs[1]!.questIds).toContain(132);
    expect(JSON.stringify(plan)).toBe(frozen);
    expect(batchCampaignChainVisits(next, combat, catalog)).toBe(next);
    const start = emptyPremadeProgress();
    start.members = start.members.map((member) => ({
      ...member,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const forecast = forecastCampaignXp(next, start);
    for (const member of forecast[0]!.members) {
      expect(member.rewards.filter((r) => r.questId === 65).map((r) => r.xp)).toEqual([1350]);
      expect(member.rewards.some((r) => r.questId === 132)).toBe(false);
      expect(member.questLog.used).toBe(1);
      expect(member.checkpoints[0]!.ready).toBe(false);
    }
    expect(auditCampaignQuestLog(next, emptyPremadeProgress()).every((m) => m.withinCapacity)).toBe(
      true,
    );
    expect(campaignFundingStates(next)).toHaveLength(16);
  });

  it("does not pay an earlier already-rewarded courier again", () => {
    const { plan, catalog, combat } = fixture();
    const next = batchCampaignChainVisits(plan, combat, catalog),
      progress = emptyPremadeProgress();
    for (const member of progress.members) {
      member.level = 14;
      member.currentXp = 0;
      member.xpNeedsUpdate = false;
      member.questStates = {
        "300001": "rewarded",
        "14": "rewarded",
        "125": "rewarded",
        "65": "rewarded",
        "132": "accepted",
      };
    }
    expect(
      forecastCampaignXp(next, progress)
        .flatMap((s) => s.members.flatMap((m) => m.rewards))
        .some((r) => r.questId === 65),
    ).toBe(false);
  });

  it.each([1, 13])("keeps the existing route when the known party is only level %i", (level) => {
    const { plan, catalog, combat } = fixture(level);
    expect(batchCampaignChainVisits(plan, combat, catalog)).toBe(plan);
  });

  it("honors a stricter recorded pickup minimum for the return note", () => {
    const { plan, catalog, combat } = fixture();
    const altered = {
      ...plan,
      rewardFacts: plan.rewardFacts!.map((fact) =>
        fact.questId === 132 ? { ...fact, minimumLevel: 20 } : fact,
      ),
    };
    expect(batchCampaignChainVisits(altered, combat, catalog)).toBe(altered);
  });

  it.each(["missing anchor", "wrong order", "optional destination", "extra quest", "utility"])(
    "holds %s rather than moving unrelated work",
    (caseName) => {
      const { plan, catalog, combat } = fixture();
      let actions = [...plan.actions];
      if (caseName === "missing anchor") actions = actions.filter((a) => a.id !== "tools-pickup");
      if (caseName === "wrong order") {
        const i = actions.findIndex((a) => a.id === "militia"),
          j = actions.findIndex((a) => a.id === "tools-pickup");
        [actions[i], actions[j]] = [actions[j]!, actions[i]!];
      }
      if (caseName === "optional destination")
        actions = actions.map((a) => (a.id === "tools-pickup" ? { ...a, xpOptional: true } : a));
      if (caseName === "extra quest")
        actions = actions.map((a) =>
          a.id === "courier-handin"
            ? { ...a, questChanges: [...a.questChanges, change(300002, "accepted")] }
            : a,
        );
      if (caseName === "utility")
        actions = actions.map((a) =>
          a.id === "courier-pickup" ? { ...a, nativeUtilityTags: [".vendor"] } : a,
        );
      const altered = { ...plan, actions };
      expect(batchCampaignChainVisits(altered, combat, catalog)).toBe(altered);
    },
  );

  it("rejects distant same-zone NPCs, missing references and unproven work", () => {
    const { plan, catalog, combat } = fixture();
    const distant = {
      ...catalog,
      quests: catalog.quests.map((q) =>
        q.questId === 125
          ? { ...q, starts: [{ ...oslow, positions: [{ zone: "1433", x: 90, y: 90 }] }] }
          : q,
      ),
    };
    expect(batchCampaignChainVisits(plan, combat, distant)).toBe(plan);
    expect(batchCampaignChainVisits(plan, { ...combat, quests: [] }, catalog)).toBe(plan);
    const kill = {
      ...combat,
      quests: combat.quests.map((q) =>
        q.questId === 65
          ? { ...q, objectiveText: ["Kill gnolls, then talk to Wiley in Lakeshire."] }
          : q,
      ),
    };
    expect(batchCampaignChainVisits(plan, kill, catalog)).toBe(plan);
    const parcel = {
      ...combat,
      quests: combat.quests.map((q) =>
        q.questId === 132 ? { ...q, objectiveText: ["Use Wiley's Note to summon a creature."] } : q,
      ),
    };
    expect(batchCampaignChainVisits(plan, parcel, catalog)).toBe(plan);
  });

  it("retains data identity and quest eligibility holds", () => {
    const { plan, catalog, combat } = fixture();
    expect(
      batchCampaignChainVisits(plan, combat, { ...catalog, sourceArchiveSha256: "f".repeat(64) }),
    ).toBe(plan);
    expect(
      batchCampaignChainVisits(
        plan,
        { ...combat, provider: { ...combat.provider, npcSha256: "a".repeat(64) } },
        catalog,
      ),
    ).toBe(plan);
    for (const amendment of [
      { requiredClasses: 1 },
      { unsupportedRequirements: ["reputation"] },
      { exclusiveWith: [300009] },
    ]) {
      const changed = {
        ...catalog,
        quests: catalog.quests.map((q) => (q.questId === 65 ? { ...q, ...amendment } : q)),
      };
      expect(batchCampaignChainVisits(plan, combat, changed)).toBe(plan);
    }
  });
});
