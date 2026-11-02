import { describe, expect, it } from "vitest";
import { deferCampaignStarterVisits } from "./campaign-starter-visits.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { campaignTravelActions, attachCampaignMovements } from "./campaign-flow.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { emptyPremadeProgress } from "./premade-model.js";

function phase(
  id: string,
  questChanges: CampaignAction["questChanges"],
  legId = "start-116",
): CampaignAction {
  return {
    id,
    legId,
    questChanges,
    title: id,
    instructions: [],
    positions: [],
    source: null,
    kind: questChanges.length ? "quests" : "instructions",
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}

function work(id: string, questId: number): CampaignAction {
  return phase(
    id,
    (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      questId,
      title: id,
      state,
      objectiveIndex: state === "objectives-complete" ? 1 : null,
    })),
  );
}

function fixture(
  options: {
    readonly alreadyTen?: boolean;
    readonly pickupUtility?: string;
    readonly includeRats?: boolean;
  } = {},
): {
  readonly plan: CampaignPlan;
  readonly sources: readonly CampaignSource[];
  readonly catalog: QuestCatalog;
} {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const guide = parseGuideChapter(
    [
      "step",
      ".accept 1638 >> Accept A Warrior's Training",
      ".target Lyria Du Lac",
      options.pickupUtility ?? "",
      "step",
      ".turnin 1638",
      ".accept 1639",
      "step",
      ".turnin 1639",
      ".accept 1640",
      "step",
      ".complete 1640,1",
      "step",
      ".turnin 1640",
      ".accept 1665",
      "step",
      ".turnin 1665",
      ...(options.includeRats
        ? [
            "step",
            ">>Take the Deeprun Tram to the Ironforge side",
            ".accept 6661",
            ".target Monty",
            "step",
            ".complete 6661,1",
            ".use 17117",
            "step",
            ".turnin 6661",
            ".target Monty",
          ]
        : []),
    ].join("\n"),
    reference.id,
    "a".repeat(64),
    70205,
  );
  const classActions = guide.steps.map((step): CampaignAction => ({
    ...phase(
      `class-${step.id}`,
      step.directives.flatMap((directive) => {
        const state =
          directive.tag === ".accept"
            ? "accepted"
            : directive.tag === ".turnin"
              ? "rewarded"
              : directive.tag === ".complete"
                ? "objectives-complete"
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
      }),
    ),
    source: campaignActionSource(guide, step, step.directives),
    location: { zone: step === guide.steps[0] ? "1429" : "1453" },
  }));
  const actions = [
    work("early-work", 300001),
    ...classActions,
    { ...work("later-work", 300002), legId: "start-117", location: { zone: "1426" } },
    ...(options.includeRats
      ? [
          {
            ...phase("start-117-117-source-step-0050", [], "start-117"),
            movement: { kind: "flight" as const, destination: "1455", terminal: false },
          },
        ]
      : []),
    { ...phase("start-117-117-source-step-0076", [], "start-117"), location: { zone: "1453" } },
    {
      ...phase("shared-gate", [], "shared"),
      kind: "xp-check" as const,
      leaderOnly: false,
      targetLevel: 12,
    },
  ];
  let entryXp = options.alreadyTen ? 0 : 5000;
  for (let level = 1; level < (options.alreadyTen ? 10 : 9); level++)
    entryXp += FOREVER_XP_CURVE[level]!;
  const plan: CampaignPlan = {
    release: "starter-visit-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: "a".repeat(64),
    actions,
    legs: ["start-116", "start-117", "shared"].map((id) => ({
      id,
      title: id,
      from: 1,
      to: 12,
      kind: id === "shared" ? "xp-bridge" : "starter",
      stopId: null,
      actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
      questIds: [],
      unresolvedQuestIds: [],
    })),
    combat: {
      revision: "test",
      sourceRevision: "b".repeat(40),
      targetBuild: 70205,
      npcs: [],
      activities: [],
      notice: null,
    },
    rewardFacts: [
      300001,
      300002,
      1638,
      1639,
      1640,
      1665,
      ...(options.includeRats ? [6661] : []),
    ].map((questId) => ({
      questId,
      fullXp: questId === 300001 ? entryXp : questId === 300002 ? 2000 : 0,
      questLevel: 60,
      minimumLevel: questId < 300000 ? 10 : 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/reward",
      capturedAt: "2026-11-01T00:00:00.000Z",
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
    includesAuthoredCorrections: false,
    sourceArchiveSha256: "a".repeat(64),
    quests: [
      {
        questId: 1638,
        title: "A Warrior's Training",
        minimumLevel: 10,
        questLevel: 10,
        requiredRaces: 0,
        requiredClasses: 1,
        category: "delivery",
        objectives: [],
        unsupportedRequirements: [],
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        ends: [],
        starts: [
          {
            npcId: 5480,
            name: "Ilsa Corbin",
            friendlyToAlliance: true,
            positions: [{ zone: "1453", x: 80.41, y: 59.8 }],
          },
        ],
      },
      ...(options.includeRats
        ? [
            {
              questId: 6661,
              title: "Deeprun Rat Roundup",
              minimumLevel: 10,
              questLevel: 12,
              requiredRaces: 0,
              requiredClasses: 0,
              category: "shared-kills" as const,
              objectives: [],
              unsupportedRequirements: [],
              prerequisites: { allOf: [], anyOf: [] },
              exclusiveWith: [],
              starts: [{ npcId: 12997, name: "Monty", friendlyToAlliance: true, positions: [] }],
              ends: [],
            },
          ]
        : []),
    ],
  };
  return { plan, sources: [{ reference, guide }], catalog };
}

function westfallFixture(): ReturnType<typeof fixture> {
  const base = fixture({ includeRats: true });
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const guide = parseGuideChapter(
    [
      "step",
      ".zone Westfall",
      "step",
      ".turnin 184",
      ".accept 36",
      "step",
      ".turnin 36",
      "step",
      ".turnin 109",
      "step",
      ".accept 6181",
      "step",
      ".turnin 6181",
      ".accept 6281",
      "step",
      ".fly Stormwind",
      ".target Thor",
      "step",
      ".turnin 6281",
      ".accept 6261",
      "step",
      ".turnin 6261",
    ].join("\n"),
    reference.id,
    "f".repeat(64),
    70205,
  );
  const ids = ["0227", "0228", "0232", "0237", "0239", "0241", "0242", "0295", "0057"];
  const visit = guide.steps.map((step, index): CampaignAction => ({
    ...phase(
      index === 8 ? "start-117-117-source-step-0057" : `start-116-116-source-step-${ids[index]!}`,
      step.directives.flatMap((directive) => {
        const state =
          directive.tag === ".accept"
            ? "accepted"
            : directive.tag === ".turnin"
              ? "rewarded"
              : null;
        return state && directive.questId
          ? [{ questId: directive.questId, title: "Courier", state, objectiveIndex: null }]
          : [];
      }),
    ),
    source: campaignActionSource(guide, step, step.directives),
    location: { zone: index > 6 ? "1453" : "1436" },
  }));
  const carry = phase(
    "carry",
    [184, 109].flatMap((questId) =>
      (["accepted", "objectives-complete"] as const).map((state) => ({
        questId,
        title: "Carried task",
        state,
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      })),
    ),
  );
  const militia: CampaignAction = {
    ...work("militia", 12),
    libraryQuestId: 12,
    libraryObjective: "shared-kills",
    fundingCheckpointId: "class-check",
    xpOptional: true,
    xpTargetLevel: 10,
  };
  const late = {
    ...phase("start-117-117-source-step-0084", [], "start-117"),
    movement: { kind: "flight" as const, destination: "1436", terminal: true },
  };
  const actions = [
    base.plan.actions[0]!,
    carry,
    militia,
    ...base.plan.actions.slice(1, 7),
    ...visit,
    ...base.plan.actions.slice(7, -1),
    late,
    base.plan.actions.at(-1)!,
  ];
  return {
    ...base,
    sources: [...base.sources, { reference, guide }],
    plan: {
      ...base.plan,
      actions,
      rewardFacts: [
        ...base.plan.rewardFacts!,
        ...[12, 184, 36, 109, 6181, 6281, 6261].map((questId) => ({
          ...base.plan.rewardFacts![0]!,
          questId,
          fullXp: 0,
          minimumLevel: [6181, 6281, 6261].includes(questId) ? 10 : 1,
        })),
      ],
    },
    catalog: {
      ...base.catalog,
      quests: [
        ...base.catalog.quests,
        { ...base.catalog.quests[0]!, questId: 6181, requiredClasses: 0 },
      ],
    },
  };
}

describe("level-ten starter tasks on later authored visits", () => {
  it("consolidates Westfall once, preserving carried hand-ins and the obsolete transfer bookmark", () => {
    const { plan, sources, catalog } = westfallFixture();
    const result = deferCampaignStarterVisits(plan, sources, catalog);
    expect(result).not.toBe(plan);
    const phases = (route: CampaignPlan): readonly string[] =>
      route.actions
        .flatMap((action) => action.questChanges.map((change) => JSON.stringify(change)))
        .sort();
    expect(phases(result)).toEqual(phases(plan));
    expect(result.actions).toHaveLength(plan.actions.length - 1);
    expect(result.bookmarkAliases?.["start-116-116-source-step-0227"]).toBe(
      "start-117-117-source-step-0084",
    );
    expect(
      result.actions.some(
        (action) => action.legId === "start-116" && action.location?.zone === "1436",
      ),
    ).toBe(false);
    expect(result.actions.find((action) => action.id === "militia")).toMatchObject({
      legId: "start-117",
      xpTargetLevel: 14,
      fundingCheckpointId: "start-117-117-source-step-0084",
    });
    const route = campaignTravelActions(result, attachCampaignMovements(result, sources).actions);
    expect(route.filter((action) => action.movement?.destination === "1436")).toHaveLength(1);
    expect(deferCampaignStarterVisits(result, sources, catalog)).toBe(result);
  });

  it("does not discard a flight unlock attached to the obsolete early transfer", () => {
    const { plan, sources, catalog } = westfallFixture();
    const transfer = plan.actions.find((action) => action.id === "start-116-116-source-step-0227")!;
    const amended: CampaignSource = {
      ...sources[1]!,
      guide: parseGuideChapter(
        "step\n.zone Westfall\n.fp Sentinel Hill",
        sources[1]!.reference.id,
        "e".repeat(64),
        70205,
      ),
    };
    const actions = plan.actions.map((action) =>
      action === transfer
        ? {
            ...action,
            source: campaignActionSource(
              amended.guide,
              amended.guide.steps[0]!,
              amended.guide.steps[0]!.directives,
            ),
          }
        : action,
    );
    const protectedPlan = { ...plan, actions };
    expect(deferCampaignStarterVisits(protectedPlan, [...sources, amended], catalog)).toBe(
      protectedPlan,
    );
  });

  it("moves a compound class/tram schedule while preserving the flute and Ironforge access", () => {
    const { plan, sources, catalog } = fixture({ includeRats: true });
    const result = deferCampaignStarterVisits(plan, sources, catalog);
    expect(result).not.toBe(plan);
    const rat = result.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 6661),
    );
    expect(rat).toHaveLength(3);
    const located = attachCampaignLocations(result, sources);
    expect(
      located.actions
        .filter((action) => rat.some((entry) => entry.id === action.id))
        .every((action) => action.location?.zone === "1455"),
    ).toBe(true);
    const lowered = campaignNativeInstructions(result, sources)(rat[1]!);
    expect(
      lowered?.directives.some(
        (directive) => directive.tag === ".use" && directive.arguments === "17117",
      ),
    ).toBe(true);
    expect(rat[0]!.instructions.join(" ")).toContain("From Ironforge");
    const routed = campaignTravelActions(located, located.actions).find(
      (action) => action.id === rat[0]!.id,
    )!;
    expect(routed.travelInstructions?.join(" ") ?? "").not.toContain("Stormwind");
  });

  it("schedules the level-five Priest chain after eligible Elwynn work and keeps its original NPC sources", () => {
    const base = fixture();
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
    const guide = parseGuideChapter(
      "step\n.accept 5623\n.target Priestess Anetta\nstep\n.turnin 5623\n.accept 5624\n.target Priestess Josetta\nstep\n.complete 5624,1\n.target Guard Roberts\nstep\n.turnin 5624\n.target Priestess Josetta",
      reference.id,
      "c".repeat(64),
      70205,
    );
    const classActions = guide.steps.map((step): CampaignAction => ({
      ...phase(
        `priest-${step.id}`,
        step.directives.flatMap((directive) => {
          const state =
            directive.tag === ".accept"
              ? ("accepted" as const)
              : directive.tag === ".turnin"
                ? ("rewarded" as const)
                : directive.tag === ".complete"
                  ? ("objectives-complete" as const)
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
        }),
      ),
      source: campaignActionSource(guide, step, step.directives),
      location: { zone: "1429" },
    }));
    const actions = [
      work("early", 300001),
      ...classActions,
      work("later", 300002),
      { ...phase("start-116-116-source-step-0109", []), location: { zone: "1429" } },
    ];
    const plan: CampaignPlan = {
      ...base.plan,
      leaderClass: "priest",
      actions,
      legs: [{ ...base.plan.legs[0]!, actionIds: actions.map((action) => action.id) }],
      rewardFacts: [300001, 300002, 5623, 5624].map((questId) => ({
        ...base.plan.rewardFacts![0]!,
        questId,
        fullXp: questId === 300001 ? 3200 : questId === 300002 ? 1700 : 150,
        minimumLevel: questId < 300000 ? 5 : 1,
      })),
    };
    const catalog = {
      ...base.catalog,
      quests: [5623, 5624].map((questId) => ({
        ...base.catalog.quests[0]!,
        questId,
        minimumLevel: 5,
      })),
    };
    const before = JSON.stringify(plan);
    const result = deferCampaignStarterVisits(plan, [{ reference, guide }], catalog);
    expect(result.actions.map((action) => action.id)).toEqual([
      "early",
      "later",
      "start-116-116-source-step-0109",
      ...classActions.map((action) => action.id),
    ]);
    expect(
      result.actions
        .filter((action) => action.id.startsWith("priest-"))
        .map((action) => action.source),
    ).toEqual(classActions.map((action) => action.source));
    expect(JSON.stringify(plan)).toBe(before);
    expect(deferCampaignStarterVisits(result, [{ reference, guide }], catalog)).toBe(result);
    const addon = compileCampaignAddon(result, result.actions, {
      version: "0.2.0-test",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: [{ reference, guide }],
      includeObservers: false,
      partyStarter: { race: "human", classSlug: "priest" },
    });
    expect(addon.lua).toContain(".target Priestess Anetta");
    expect(addon.lua).toContain(".target Priestess Josetta");
    expect(addon.lua).toContain(".target Guard Roberts");
  });

  it("moves the complete training chain after earned levels while preserving phases, identities and input", () => {
    const { plan, sources, catalog } = fixture();
    const before = structuredClone(plan);
    const result = deferCampaignStarterVisits(plan, sources, catalog);
    expect(result).not.toBe(plan);
    expect(plan).toEqual(before);
    expect(result.actions.flatMap((action) => action.questChanges)).toEqual(
      [
        ...plan.actions.filter((action) => !action.id.startsWith("class-")),
        ...plan.actions.filter((action) => action.id.startsWith("class-")),
      ].flatMap((action) => action.questChanges),
    );
    const target = result.actions.findIndex(
      (action) => action.id === "start-117-117-source-step-0076",
    );
    const moved = result.actions.filter((action) => action.id.startsWith("class-"));
    expect(moved).toHaveLength(6);
    expect(
      moved.every(
        (action) => action.legId === "start-117" && result.actions.indexOf(action) > target,
      ),
    ).toBe(true);
    expect(moved[0]).toMatchObject({
      source: null,
      location: { zone: "1453", visitOverride: true },
      positions: [{ position: { zone: "1453", x: 80.41, y: 59.8 } }],
    });
    expect(
      attachCampaignLocations(result, sources).actions.find((action) => action.id === moved[0]!.id)
        ?.location?.zone,
    ).toBe("1453");
    expect(deferCampaignStarterVisits(result, sources, catalog)).toBe(result);
    const addon = compileCampaignAddon(result, result.actions, {
      version: "0.2.0-test",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: sources,
      includeObservers: false,
      partyStarter: { race: "human", classSlug: "warrior" },
    });
    expect(addon.lua).toContain("Talk to Ilsa Corbin in Stormwind");
    expect(addon.lua).not.toContain(".target Lyria Du Lac");
  });

  it("leaves the existing order when level ten is already earned", () => {
    const { plan, sources, catalog } = fixture({ alreadyTen: true });
    expect(deferCampaignStarterVisits(plan, sources, catalog)).toBe(plan);
  });

  it.each([".use 17117", ".fp Stormwind", ".isOnQuest 85"])(
    "retains a pickup with unsupported source behavior: %s",
    (pickupUtility) => {
      const { plan, sources, catalog } = fixture({ pickupUtility });
      expect(deferCampaignStarterVisits(plan, sources, catalog)).toBe(plan);
    },
  );

  it("requires an eligible alternative giver and an existing later visit", () => {
    const { plan, sources, catalog } = fixture();
    const unavailable = {
      ...catalog,
      quests: catalog.quests.map((quest) => ({ ...quest, starts: [] })),
    };
    expect(deferCampaignStarterVisits(plan, sources, unavailable)).toBe(plan);
    const missingVisit = {
      ...plan,
      actions: plan.actions.filter((action) => action.id !== "start-117-117-source-step-0076"),
    };
    expect(deferCampaignStarterVisits(missingVisit, sources, catalog)).toBe(missingVisit);
    expect(deferCampaignStarterVisits(plan, sources, { ...catalog, targetBuild: 1 })).toBe(plan);
  });

  it("rejects a partial deferral when another prerequisite prevents reaching the replacement pickup", () => {
    const { plan, sources, catalog } = fixture();
    const dependent = { ...work("needs-training", 300003), requiredQuestIds: [1665] };
    const actions = [...plan.actions.slice(0, 7), dependent, ...plan.actions.slice(7)];
    const blocked = { ...plan, actions };
    expect(deferCampaignStarterVisits(blocked, sources, catalog)).toBe(blocked);
  });

  it("keeps a valid forty-slot itinerary instead of deferring its class work into a forty-first slot", () => {
    const { plan, sources, catalog } = fixture();
    const held = Array.from({ length: 40 }, (_, index) =>
      phase(
        `held-${index}`,
        [{ questId: 400000 + index, title: "Held task", state: "accepted", objectiveIndex: null }],
        "start-117",
      ),
    );
    const target = plan.actions.findIndex(
      (action) => action.id === "start-117-117-source-step-0076",
    );
    const initial: CampaignPlan = {
      ...plan,
      actions: [...plan.actions.slice(0, target), ...held, ...plan.actions.slice(target)],
      rewardFacts: [
        ...plan.rewardFacts!,
        ...held.map((action) => ({
          ...plan.rewardFacts![0]!,
          questId: action.questChanges[0]!.questId,
          fullXp: 0,
          minimumLevel: 1,
        })),
      ],
    };
    expect(auditCampaignQuestLog(initial, emptyPremadeProgress())[0]!.peakUpperBound).toBe(40);
    expect(deferCampaignStarterVisits(initial, sources, catalog)).toBe(initial);
  });
});
