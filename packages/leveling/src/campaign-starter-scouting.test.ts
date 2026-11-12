import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { starterScoutingSource } from "./campaign-starter-scouting-source.js";
import { connectCampaignStarterScouting } from "./campaign-starter-scouting.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";

interface Fixture {
  readonly plan: CampaignPlan;
  readonly sources: readonly CampaignSource[];
  readonly combat: CombatDataset;
  readonly catalog: QuestCatalog;
}

function action(
  id: string,
  legId = "start-116",
  questId?: number,
  state?: "accepted" | "objectives-complete" | "rewarded",
  objectiveIndex: number | null = null,
): CampaignAction {
  return {
    id,
    legId,
    title: id,
    kind: questId ? "quests" : "instructions",
    instructions: [],
    source: null,
    positions: [],
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges:
      questId && state ? [{ questId, state, objectiveIndex, title: `Quest ${questId}` }] : [],
  };
}

function fixture(): Fixture {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const parsed = parseGuideChapter(
    [
      "step\n.isQuestComplete 91775\n.goto 1429,42,65\n.turnin 62\n.accept 76\n.turnin 91775\n.target Marshal Dughan",
      "step\n#optional\n#requires MurlocRune << Warrior/Rogue\n#label Jasperlode\n#completewith JasperlodeExplore\n.goto 1429,61,53 >> Enter the Jasperlode Mine",
      "step\n.goto 1429,61,51\n.complete 76,1 >> Scout through the Jasperlode Mine",
      "step\n.hs >> Hearth to Goldshire",
      "step\n.goto 1429,42,65\n.turnin 76\n.accept 239\n.target Marshal Dughan",
      "step\n.turnin 239\n.goto 1429,24,74\n.target +Deputy Rainer\n>>Click the Wanted Poster\n.accept 176\n.goto 1429,25,74",
    ].join("\n"),
    reference.id,
    "f".repeat(64),
    70205,
  );
  const ids = [
    "source-step-0086",
    "source-step-0125",
    "source-step-0126",
    "source-step-0186",
    "source-step-0192",
    "source-step-0218",
  ];
  const sources = [
    {
      reference,
      guide: {
        ...parsed,
        steps: parsed.steps.map((step, index) => ({ ...step, id: ids[index]! })),
      },
    },
  ];
  const combat = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic scouting regression fixture",
    provider: {
      repository: "https://example.test",
      revision: "b".repeat(40),
      npcSha256: "c".repeat(64),
      questSha256: "d".repeat(64),
      itemSha256: "e".repeat(64),
      layer: "forever-static-with-authored",
      limitations: ["Synthetic test data"],
    },
    quests: [76, 239].map((questId) => ({
      questId,
      requiredClasses: 0,
      creatureIds: [],
      itemCreatureIds: [],
      itemObjectives: [],
      objectiveText: [
        questId === 76
          ? "Explore the Jasperlode Mine, then report back to Marshal Dughan in Goldshire."
          : "Go to the Westbrook Garrison and speak with Deputy Rainer.",
      ],
      onlyCreatureObjectives: false,
      onlyInteractionObjectives: questId === 76,
      prerequisites: { allOf: [], anyOf: [questId === 76 ? 62 : 76] },
    })),
    npcs: [],
    dungeons: [],
    killXpEvidence: [],
  });
  const dughan = {
    npcId: 240,
    name: "Marshal Dughan",
    friendlyToAlliance: true,
    positions: [{ zone: "1429", x: 42, y: 65 }],
  };
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic scouting regression fixture",
    sourceArchiveSha256: "a".repeat(64),
    providerRevision: combat.provider.revision,
    npcSha256: combat.provider.npcSha256,
    questSha256: combat.provider.questSha256,
    areaMapSha256: "0".repeat(64),
    includesAuthoredCorrections: false,
    quests: [76, 239].map((questId) => ({
      questId,
      title: questId === 76 ? "The Jasperlode Mine" : "Westbrook Garrison Needs Help!",
      minimumLevel: questId === 76 ? 4 : 6,
      questLevel: 10,
      requiredClasses: 0,
      requiredRaces: 1,
      starts: [dughan],
      ends:
        questId === 76
          ? [dughan]
          : [
              {
                npcId: 963,
                name: "Deputy Rainer",
                friendlyToAlliance: true,
                positions: [{ zone: "1429", x: 24, y: 74 }],
              },
            ],
      prerequisites: { allOf: [], anyOf: [questId === 76 ? 62 : 76] },
      exclusiveWith: [],
      objectives: [],
      category: questId === 76 ? "unsupported" : "delivery",
      unsupportedRequirements:
        questId === 76
          ? ["exploration-trigger", "unresolved-objective-text"]
          : ["unresolved-objective-text"],
    })),
  });
  const east = "eastern-deadmines-preparation";
  const phases = (id: number, count: number): CampaignAction[] => [
    action(`${id}-accept`, east, id, "accepted"),
    ...Array.from({ length: count }, (_, index) =>
      action(`${id}-objective-${index + 1}`, east, id, "objectives-complete", index + 1),
    ),
    action(`${id}-return`, east, id, "rewarded"),
  ];
  const actions = [
    action("start-116-116-source-step-0086", "start-116", 62, "rewarded"),
    action("start-116-116-source-step-0089"),
    action("start-116-116-source-step-0139"),
    {
      ...action("start-116-116-source-step-0186"),
      source: { chapterId: parsed.chapterId, version: parsed.version, stepId: "source-step-0186" },
      movement: { kind: "hearth" as const, destination: "1429", terminal: false },
    },
    action("start-116-116-source-step-0193"),
    action("start-116-116-source-step-0218", "start-116", 176, "accepted"),
    {
      ...action("wailing-caverns-catchup-return", "wailing-caverns-catchup"),
      instructions: ["Take the ship to Stormwind.", "Continue to Lakeshire."],
    },
    action("eastern-first", east),
    ...phases(14, 3),
    action("defias-pickup", east, 65, "accepted"),
    ...phases(152, 4),
    action("defias-objective", east, 65, "objectives-complete", 1),
    action("defias-return", east, 65, "rewarded"),
  ];
  const plan: CampaignPlan = {
    release: "scouting-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: [62, 76, 239, 176],
    actions,
    legs: ["start-116", "wailing-caverns-catchup", east].map((id) => ({
      id,
      title: id,
      from: 1,
      to: 19,
      kind: "preparation",
      stopId: null,
      questIds: [],
      unresolvedQuestIds: [],
      actionIds: actions.filter((entry) => entry.legId === id).map((entry) => entry.id),
    })),
    partyPolicy: {
      revision: "five-player-kill-first-20261102-v9",
      partySize: 5,
      decisions: [],
      unresolvedPrerequisiteIds: [],
    },
    questFunding: {
      revision: "explicit-quest-funding-20261105-v81",
      providerRevision: combat.provider.revision,
      addedQuestIds: [],
      remaining: [],
      scenarios: [],
    },
    rewardFacts: [76, 239].map((questId) => ({
      questId,
      fullXp: questId === 76 ? 840 : 210,
      questLevel: 10,
      minimumLevel: questId === 76 ? 4 : 6,
      xpByLevel: [],
      status: "available",
      evidenceKind: "historical-reference",
      sourceUrl: "https://example.test",
      capturedAt: "2026-11-02T00:00:00Z",
    })),
  };
  return { plan, sources, combat, catalog };
}

describe("connected starter scouting", () => {
  it("retains on-road scouting when funding has already scheduled Westfall in another section", () => {
    const input = fixture();
    const movedIds = new Set(input.plan.actions.filter((entry) => entry.questChanges.some((change) =>
      [14, 152, 65].includes(change.questId))).map((entry) => entry.id));
    const actions = input.plan.actions.filter((entry) => entry.id !== "eastern-first").map((entry) => movedIds.has(entry.id)
      ? { ...entry, legId: entry.questChanges[0]!.questId === 65 ? "defias-unlock" : "northern-approach" }
      : entry);
    const plan: CampaignPlan = { ...input.plan, actions, legs: [
      ...input.plan.legs.filter((leg) => leg.id !== "eastern-deadmines-preparation"),
      ...["northern-approach", "defias-unlock"].map((id) => ({
        id, title: id, from: 17, to: 20, kind: "preparation" as const, stopId: null,
        questIds: [], unresolvedQuestIds: [], actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
      })),
    ] };
    const before = structuredClone(plan);
    const result = connectCampaignStarterScouting(plan, input.sources, input.combat, input.catalog);
    expect(result).not.toBe(plan);
    for (const questId of [76, 239]) {
      const phases = result.actions.flatMap((entry) => entry.questChanges.filter((change) => change.questId === questId));
      expect(phases.filter((change) => change.state === "accepted")).toHaveLength(1);
      expect(phases.filter((change) => change.state === "rewarded")).toHaveLength(1);
    }
    expect(result.actions).toHaveLength(plan.actions.length + 6);
    for (const action of plan.actions.filter((action) => movedIds.has(action.id)))
      expect(result.actions.find((entry) => entry.id === action.id)).toEqual(action);
    expect(result.actions.find((entry) => entry.id === "wailing-caverns-catchup-return")).toEqual(
      plan.actions.find((entry) => entry.id === "wailing-caverns-catchup-return"),
    );
    expect(plan).toEqual(before);
    expect(connectCampaignStarterScouting(result, input.sources, input.combat, input.catalog)).toBe(result);
  });
  it("keeps the Westfall circuit when its first eastern task is itself being moved", () => {
    const input = fixture();
    const plan: CampaignPlan = {
      ...input.plan,
      actions: input.plan.actions.filter((entry) => entry.id !== "eastern-first"),
    };
    const before = structuredClone(plan);
    const next = connectCampaignStarterScouting(plan, input.sources, input.combat, input.catalog);
    expect(next).not.toBe(plan);
    expect(next.actions.some((entry) => entry.questChanges.some((row) => row.questId === 76))).toBe(
      true,
    );
    const at = (id: string): number => next.actions.findIndex((entry) => entry.id === id);
    expect(at("14-accept")).toBeLessThan(at("152-accept"));
    expect(at("152-return")).toBeLessThan(at("14-objective-1"));
    expect(at("14-return")).toBeLessThan(at("defias-objective"));
    for (const original of plan.actions)
      expect(next.actions.filter((entry) => entry.id === original.id)).toHaveLength(1);
    expect(plan).toEqual(before);
  });

  it("works before travel metadata is attached during fresh preparation", () => {
    const input = fixture();
    const plan: CampaignPlan = {
      ...input.plan,
      actions: input.plan.actions.map((entry) => {
        if (entry.id !== "start-116-116-source-step-0186") return entry;
        const { movement: _movement, ...unlocated } = entry;
        return unlocated;
      }),
    };
    const next = connectCampaignStarterScouting(plan, input.sources, input.combat, input.catalog);
    expect(next).not.toBe(plan);
    expect(
      next.actions.some((row) => row.questChanges.some((change) => change.questId === 76)),
    ).toBe(true);
  });

  it("retains all original phases and positions while placing scouting on existing visits", () => {
    const input = fixture(),
      before = structuredClone(input);
    const next = connectCampaignStarterScouting(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    expect(next).not.toBe(input.plan);
    expect(input).toEqual(before);
    expect(next.actions).toHaveLength(input.plan.actions.length + 6);
    const index = (id: string): number => next.actions.findIndex((row) => row.id === id);
    expect(index("library-quest-76-accepted-0")).toBe(index("start-116-116-source-step-0086") + 1);
    expect(index("starter-jasperlode-entrance")).toBeLessThan(
      index("library-quest-76-objectives-complete-1"),
    );
    expect(index("library-quest-76-objectives-complete-1")).toBe(
      index("start-116-116-source-step-0139") - 1,
    );
    expect(index("library-quest-76-rewarded-0")).toBe(index("start-116-116-source-step-0186") + 1);
    expect(index("library-quest-239-accepted-0")).toBe(index("library-quest-76-rewarded-0") + 1);
    expect(index("library-quest-239-rewarded-0")).toBe(index("start-116-116-source-step-0218") - 1);
    expect(index("14-accept")).toBeLessThan(index("152-accept"));
    expect(index("defias-pickup")).toBeLessThan(index("152-accept"));
    expect(index("152-return")).toBeLessThan(index("14-objective-1"));
    expect(index("14-return")).toBeLessThan(index("eastern-first"));
    for (const old of input.plan.actions) {
      const current = next.actions.find((row) => row.id === old.id)!;
      expect(current.questChanges).toEqual(old.questChanges);
      expect(current.positions).toEqual(old.positions);
      expect(current.source).toEqual(old.source);
    }
    expect(next.questFunding!.addedQuestIds).toEqual([76, 239]);
    const courierReturn = next.actions.find((row) => row.id === "library-quest-239-rewarded-0")!;
    expect(courierReturn.positions).toHaveLength(1);
    expect(courierReturn.instructions.join(" ")).not.toContain("Wanted Poster");
    expect(
      next.partyPolicy!.decisions.map((decision) => [decision.questId, decision.included]),
    ).toEqual([
      [76, true],
      [239, true],
    ]);
    expect(
      next.actions
        .find((row) => row.id === "wailing-caverns-catchup-return")!
        .instructions.join(" "),
    ).toContain("Sentinel Hill before");
    expect(connectCampaignStarterScouting(next, input.sources, input.combat, input.catalog)).toBe(
      next,
    );
  });

  it("retains native scouting, entrance and courier commands without the discarded book guard", () => {
    const input = fixture();
    const next = connectCampaignStarterScouting(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    const native = campaignNativeInstructions(next, input.sources);
    const selected = next.actions.filter(
      (row) => row.id.startsWith("library-quest-") || row.id === "starter-jasperlode-entrance",
    );
    const commands = selected.flatMap((row) => native(row)!.directives);
    expect(
      commands
        .filter((row) => [".accept", ".complete", ".turnin"].includes(row.tag))
        .map((row) => [row.tag, row.arguments]),
    ).toEqual([
      [".accept", "76"],
      [".complete", "76,1"],
      [".turnin", "76"],
      [".accept", "239"],
      [".turnin", "239"],
    ]);
    expect(
      commands.some((row) => row.tag === ".isQuestComplete" && row.arguments === "91775"),
    ).toBe(false);
    expect(
      native(selected.find((row) => row.id === "starter-jasperlode-entrance")!)!.directives.map(
        (row) => row.tag,
      ),
    ).toEqual([".goto"]);
  });

  it.each([
    "class",
    "race",
    "minimum",
    "parent",
    "recipient",
    "skill",
    "provider",
    "source-counter",
    "source-target",
    "source-phase",
    "entrance",
  ])("declines incompatible %s evidence atomically", (kind) => {
    const input = fixture();
    const catalog: QuestCatalog = {
      ...input.catalog,
      ...(kind === "provider" ? { providerRevision: "0".repeat(40) } : {}),
      quests: input.catalog.quests.map((quest) =>
        quest.questId !== 76
          ? quest
          : {
              ...quest,
              ...(kind === "class" ? { requiredClasses: 16 } : {}),
              ...(kind === "race" ? { requiredRaces: 2 } : {}),
              ...(kind === "minimum" ? { minimumLevel: 11 } : {}),
              ...(kind === "parent" ? { prerequisites: { allOf: [], anyOf: [999] } } : {}),
              ...(kind === "recipient" ? { ends: [{ ...quest.ends[0]!, npcId: 999 }] } : {}),
              ...(kind === "skill" ? { unsupportedRequirements: ["requiredSkill"] } : {}),
            },
      ),
    };
    const sources = input.sources.map((source) => ({
      ...source,
      guide: {
        ...source.guide,
        steps: source.guide.steps
          .filter(
            (step) =>
              !(kind === "source-phase" && step.id === "source-step-0192") &&
              !(kind === "entrance" && step.id === "source-step-0125"),
          )
          .map((step) => ({
            ...step,
            directives: step.directives.map((row) => ({
              ...row,
              ...(kind === "source-counter" && row.tag === ".complete"
                ? { arguments: "76,2" }
                : {}),
              ...(kind === "source-target" && row.tag === ".target"
                ? { arguments: "Wrong recipient" }
                : {}),
            })),
          })),
      },
    }));
    expect(starterScoutingSource(input.plan, sources, input.combat, catalog)).toBeNull();
    expect(connectCampaignStarterScouting(input.plan, sources, input.combat, catalog)).toBe(
      input.plan,
    );
  });

  it.each(["missing-stop", "foreign-hearth"])(
    "preserves the fallback when %s changes",
    (kind) => {
      const input = fixture();
      const plan: CampaignPlan = {
        ...input.plan,
        actions: input.plan.actions
          .filter(
            (row) =>
              !(kind === "missing-stop" && row.id === "start-116-116-source-step-0139") &&
              !(kind === "missing-coast-counter" && row.id === "152-objective-4"),
          )
          .map((row) => ({
            ...row,
            ...(kind === "foreign-hearth" && row.movement
              ? { movement: { ...row.movement, destination: "1453" } }
              : {}),
            ...(kind === "wrong-militia-phase" && row.id === "defias-pickup"
              ? { questChanges: [{ ...row.questChanges[0]!, state: "rewarded" as const }] }
              : {}),
          })),
      };
      expect(connectCampaignStarterScouting(plan, input.sources, input.combat, input.catalog)).toBe(
        plan,
      );
    },
  );

  it.each(["missing-coast-counter", "wrong-militia-phase"])(
    "retains proven scouting without reordering an unsupported Westfall batch (%s)", (kind) => {
      const input = fixture();
      const plan: CampaignPlan = { ...input.plan, actions: input.plan.actions
        .filter((action) => !(kind === "missing-coast-counter" && action.id === "152-objective-4"))
        .map((action) => kind === "wrong-militia-phase" && action.id === "defias-pickup"
          ? { ...action, questChanges: [{ ...action.questChanges[0]!, state: "rewarded" as const }] } : action),
      };
      const result = connectCampaignStarterScouting(plan, input.sources, input.combat, input.catalog);
      expect(result.actions).toHaveLength(plan.actions.length + 6);
      for (const original of plan.actions)
        expect(result.actions.find((action) => action.id === original.id)).toEqual(original);
      expect(result.actions.filter((action) => action.questChanges.some((change) => change.questId === 76))).toHaveLength(3);
      expect(result.actions.filter((action) => action.questChanges.some((change) => change.questId === 239))).toHaveLength(2);
    },
  );
});
