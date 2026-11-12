import { describe, expect, it } from "vitest";
import { projectedFundingPrerequisitesFit } from "./campaign-funding-prerequisite-projection.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { campaignFundingBatch, requiresDungeonQuestVisit } from "./campaign-funding-quests.js";
import {
  campaignOptionalXpReady,
  type CampaignAction,
  type CampaignPlan,
  type CampaignSource,
} from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import type { CombatDataset } from "./combat-model.js";
import { enrichCampaignStarters } from "./campaign-starters.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { fundingInsertionActions } from "./campaign-funding-insertion.js";
import { unsafePartyFundingScenarios } from "./campaign-funding-quality.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { refreshFundedCampaignPartyPolicy } from "./campaign-funding-policy.js";
import { attachCampaignCombat } from "./campaign-combat.js";

const position = { zone: "1429", x: 50, y: 50 };
const giver = {
  npcId: 234,
  name: "Patrol Captain",
  friendlyToAlliance: true,
  positions: [position],
};
function quest(questId = 300002): QuestCatalogEntry {
  return {
    questId,
    title: "Forest patrol",
    minimumLevel: 1,
    questLevel: 3,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [giver],
    ends: [giver],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "shared-kills",
    objectives: [{ index: 1, npcId: 114, count: 10, positions: [position] }],
    unsupportedRequirements: [],
  };
}
function catalog(quests: readonly QuestCatalogEntry[] = [quest()]): QuestCatalog {
  return {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    sourceArchiveSha256: "e".repeat(64),
    includesAuthoredCorrections: false,
    quests: [...quests],
  };
}
function combat(): CombatDataset {
  return {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "",
    provider: {
      repository: "https://example.test/data",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Synthetic unit test"],
    },
    npcs: [
      {
        id: 114,
        name: "Forest Spider",
        minimumLevel: 2,
        maximumLevel: 2,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 300002,
        creatureIds: [114],
        itemCreatureIds: [],
        objectiveText: ["Kill 10 Forest Spiders."],
        onlyCreatureObjectives: true,
      },
      {
        questId: 300001,
        creatureIds: [],
        itemCreatureIds: [],
        objectiveText: ["Speak to the captain."],
        onlyCreatureObjectives: false,
        onlyInteractionObjectives: true,
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  };
}
function plan(): CampaignPlan {
  const base: CampaignAction = {
    id: "base",
    legId: "prepare",
    title: "First task",
    instructions: [],
    positions: [{ sourceLine: 0, position: { ...position, floor: null, space: "map-percent" } }],
    source: null,
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      questId: 300001,
      title: "First task",
      state,
      objectiveIndex: state === "objectives-complete" ? 1 : null,
    })),
  };
  const gate: CampaignAction = {
    ...base,
    id: "gate",
    questChanges: [],
    kind: "xp-check",
    targetLevel: 3,
  };
  const entry: CampaignAction = { ...gate, id: "entry", legId: "dungeon", kind: "checkpoint" };
  return {
    release: "funding-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions: [base, gate, entry],
    legs: [
      {
        id: "prepare",
        title: "Elwynn Forest",
        from: 1,
        to: 3,
        kind: "preparation",
        stopId: null,
        actionIds: ["base", "gate"],
        questIds: [300001],
        unresolvedQuestIds: [],
      },
      {
        id: "dungeon",
        title: "Dungeon",
        from: 3,
        to: 4,
        kind: "dungeon",
        stopId: null,
        actionIds: ["entry"],
        questIds: [],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [400, 1000].map((fullXp, index) => ({
      questId: 300001 + index,
      fullXp,
      questLevel: 3,
      minimumLevel: 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-10-31T00:00:00.000Z",
    })),
  };
}

function departingPlan(): { plan: CampaignPlan; source: CampaignSource } {
  const initial = plan(),
    reference = CHAPTER_REFERENCES.find((chapter) => chapter.sourceId === 116)!,
    guide = parseGuideChapter(
      "step\n.hs >>Hearth to Stormwind City",
      reference.id,
      "f".repeat(64),
      70205,
    );
  const base = { ...initial.actions[0]!, leaderOnly: true };
  const departure: CampaignAction = {
    ...base,
    id: "departure",
    kind: "instructions",
    questChanges: [],
    positions: [],
    source: { chapterId: reference.id, version: guide.version, stepId: guide.steps[0]!.id },
    instructions: ["Hearth to Stormwind City"],
  };
  const city: CampaignAction = {
    ...base,
    id: "city-handoff",
    positions: [
      { sourceLine: 0, position: { ...position, zone: "1453", floor: null, space: "map-percent" } },
    ],
    questChanges: (["accepted", "rewarded"] as const).map((state) => ({
      questId: 300003,
      title: "City delivery",
      state,
      objectiveIndex: null,
    })),
  };
  const gate = { ...initial.actions[1]!, leaderOnly: true, positions: city.positions };
  const training = {
    ...city,
    id: "training",
    questChanges: city.questChanges.map((change) => ({
      ...change,
      questId: 300004,
      title: "Class training",
    })),
  };
  const regroup: CampaignAction = {
    ...departure,
    id: "regroup",
    legId: "party",
    leaderOnly: false,
    source: null,
    instructions: ["Regroup for the next party chapter."],
  };
  const actions = [base, departure, city, gate, training, regroup];
  return {
    source: { reference, guide },
    plan: {
      ...initial,
      actions,
      legs: [
        {
          ...initial.legs[0]!,
          kind: "starter",
          actionIds: actions
            .filter((action) => action.legId === base.legId)
            .map((action) => action.id),
          questIds: [300001, 300003, 300004],
        },
        {
          ...initial.legs[0]!,
          id: "party",
          title: "Regroup",
          kind: "preparation",
          actionIds: [regroup.id],
          questIds: [],
        },
      ],
      rewardFacts: [
        ...initial.rewardFacts!,
        { ...initial.rewardFacts![0]!, questId: 300003, fullXp: 100 },
        { ...initial.rewardFacts![0]!, questId: 300004, fullXp: 0, minimumLevel: 3 },
      ],
    },
  };
}

describe("explicit quest funding", () => {
  it("funds a skipped optional quest later without moving its earlier tasks or paying either choice twice", () => {
    const initial = plan();
    const earlier: CampaignAction[] = (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      ...initial.actions[0]!, id: `preserved-${state}`, legId: "optional", xpOptional: false,
      questChanges: [{ questId: 300002, title: "Forest patrol", state,
        objectiveIndex: state === "objectives-complete" ? 1 : null }],
    }));
    const data = combat();
    const input = attachCampaignCombat({ ...initial, sharedQuestsOnly: true,
      actions: [...earlier, ...initial.actions], legs: [{ ...initial.legs[0]!, id: "optional",
        optionalQuestId: 378, actionIds: earlier.map((action) => action.id), questIds: [300002] }, ...initial.legs],
    }, [], data, "optional-funding-test");
    const funded = fundCampaignQuestGaps(input, [], data, catalog(), {
      fundingExecutor: (candidate: CampaignPlan) => {
        expect(candidate.actions.slice(0, earlier.length)).toEqual(input.actions.slice(0, earlier.length));
        return campaignFundingStates(candidate);
      },
    });
    expect(funded.questFunding?.addedQuestIds).toEqual([300002]);
    expect(funded.actions.filter((action) => action.id.startsWith("preserved-"))).toEqual(earlier);
    const fallback = funded.actions.filter((action) => action.libraryQuestId === 300002);
    expect(fallback).toHaveLength(3);
    expect(fallback.every((action) => action.excludedByOptionalQuestId === 378)).toBe(true);
    for (const included of [false, true]) {
      const base = emptyPremadeProgress();
      const progress = { ...base, selectedExtras: { "378": included }, members: base.members.map((member) => ({
        ...member, level: 1, currentXp: 0, xpNeedsUpdate: false,
      })) };
      const forecast = forecastCampaignXp(funded, progress);
      for (let player = 0; player < 5; player++) {
        const rewards = forecast.flatMap((section) => section.members[player]!.rewards);
        expect(rewards.filter((reward) => reward.questId === 300002).map((reward) => reward.xp)).toEqual([1000]);
      }
    }
  });

  it("reuses an unchanged forecast across funding policies and replays changed proposals", () => {
    for (const candidates of [[], [quest()]]) {
      const initial = plan();
      const data = combat();
      const quests = catalog(candidates);
      let calls = 0;
      const funded = fundCampaignQuestGaps(initial, [], data, quests, {
        fundingExecutor: (candidate: CampaignPlan) => {
          calls++;
          return campaignFundingStates(candidate);
        },
      });
      expect(funded).toEqual(fundCampaignQuestGaps(initial, [], data, quests));
      if (candidates.length === 0) {
        expect(calls).toBe(1);
        expect(funded.questFunding?.addedQuestIds).toEqual([]);
      } else {
        expect(calls).toBeGreaterThan(1);
        expect(funded.questFunding?.addedQuestIds).toEqual([300002]);
      }
    }
  });

  it.each([[463, false], [276, false], [277, false], [275, false], [373, true], [214, true], [96395, true], [300002, false]] as const)(
    "distinguishes outdoor preparation from entering a dungeon for quest %i", (id, expected) => {
      expect(requiresDungeonQuestVisit(id)).toBe(expected);
    },
  );

  it.each(["paid-parent", "unpaid-parent"])("handles an outdoor journal prerequisite without skipping its parent (%s)", (mode) => {
    const definition: QuestCatalogEntry = {...quest(276), title: "Tramping Paws", minimumLevel: 20,
      questLevel: 21, prerequisites: {allOf: [463], anyOf: []}, objectives: [
        {index: 1, npcId: 1007, count: 15, positions: [position]},
        {index: 2, npcId: 1008, count: 10, positions: [position]},
      ]};
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({...member, level: 22, currentXp: 0,
      xpNeedsUpdate: false, questStates: mode === "paid-parent" ? {"463": "rewarded" as const} : {}}));
    const data = combat();
    data.npcs = [1007, 1008].map((id) => ({...data.npcs[0]!, id, minimumLevel: 20, maximumLevel: 22}));
    data.quests = [{...data.quests[0]!, questId: 276, creatureIds: [1007, 1008], killQuotas: [
      {objectiveIndex: 1, npcId: 1007, kills: 15, source: "Synthetic captured counter"},
      {objectiveIndex: 2, npcId: 1008, kills: 10, source: "Synthetic captured counter"},
    ]}];
    const batch = campaignFundingBatch(definition, catalog([definition]), data, progress, {
      legId: "prepare", checkpointId: "gate", targetLevel: 25, previous: position,
      forbiddenQuestIds: new Set(), maximumQuestLevel: 25, leaderOnly: false, includePartyElites: true,
    });
    if (mode === "unpaid-parent") expect(batch).toBeNull();
    else {
      expect(batch?.questIds).toEqual([276]);
      expect(batch?.requiredKills).toBe(25);
      expect(batch?.actions.flatMap((action) => action.questChanges).filter((change) => change.state === "objectives-complete").map((change) => change.objectiveIndex)).toEqual([1, 2]);
    }
  });

  it.each(["eligible", "non-shared", "already-started", "dungeon", "missing-counter"])(
    "moves a complete future mandatory kill batch only when it is eligible (%s)", (mode) => {
      const initial = plan(), prototype = initial.actions[0]!;
      const tasks: CampaignAction[] = (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
        ...prototype, id: `future-${state}`, legId: "future", libraryRequired: true, libraryBackbone: true,
        xpOptional: false, questChanges: [{questId: 300002, title: "Forest patrol", state,
          objectiveIndex: state === "objectives-complete" ? 1 : null}],
      }));
      const selected = tasks.filter((action) => mode !== "missing-counter" || action.questChanges[0]!.state !== "objectives-complete");
      const actions = mode === "already-started"
        ? [initial.actions[0]!, selected[0]!, ...initial.actions.slice(1), ...selected.slice(1)]
        : [...initial.actions, ...selected];
      const candidate: CampaignPlan = {...initial, ...(mode === "non-shared" ? {} : {sharedQuestsOnly: true as const}), actions,
        legs: [...initial.legs, {id: "future", title: "Later forest work", from: 3, to: 4,
          kind: mode === "dungeon" ? "dungeon" : "preparation", stopId: null,
          actionIds: selected.map((action) => action.id), questIds: [300002], unresolvedQuestIds: []}],
      };
      const before = structuredClone(candidate);
      const funded = fundCampaignQuestGaps(candidate, [], combat(), catalog());
      const gateAt = funded.actions.findIndex((action) => action.id === "gate");
      const handinAt = funded.actions.findIndex((action) => action.questChanges.some((change) => change.questId === 300002 && change.state === "rewarded"));
      expect(handinAt >= 0 && handinAt < gateAt).toBe(mode === "eligible");
      expect(funded.actions.flatMap((action) => action.questChanges).filter((change) => change.questId === 300002 && change.state === "rewarded")).toHaveLength(1);
      if (mode === "eligible") {
        const work = funded.actions.filter((action) => action.questChanges.some((change) => change.questId === 300002));
        expect(work).toHaveLength(3);
        expect(work.every((action) => action.libraryBackbone && action.xpOptional === false)).toBe(true);
      }
      expect(candidate).toEqual(before);
    },
  );

  it.each(["shared-kills", "delivery"] as const)(
    "records generated %s preparation without an archived source or losing existing holds",
    (category) => {
      const held = {
        questId: 399999,
        objective: "collection" as const,
        included: false,
        requiredFor: [],
        lootCost: null,
        reason: "Unqualified collection remains held.",
      };
      const initial: CampaignPlan = {
        ...plan(),
        sharedQuestsOnly: true,
        partyPolicy: {
          revision: "five-player-kill-first-20261102-v9",
          partySize: 5,
          decisions: [held],
          unresolvedPrerequisiteIds: [],
        },
      };
      const definitions = catalog([
        { ...quest(), category, objectives: category === "delivery" ? [] : quest().objectives },
      ]);
      const before = structuredClone(initial);
      const funded = fundCampaignQuestGaps(initial, [], combat(), definitions);
      expect(funded.questFunding?.addedQuestIds).toContain(300002);
      expect(funded.partyPolicy?.decisions).toContainEqual(held);
      expect(
        funded.partyPolicy?.decisions.filter((decision) => decision.questId === 300002),
      ).toEqual([
        expect.objectContaining({
          questId: 300002,
          objective: category,
          included: true,
          lootCost: null,
        }),
      ]);
      expect(refreshFundedCampaignPartyPolicy(funded, [], combat(), definitions)).toEqual(
        funded.partyPolicy,
      );
      expect(initial).toEqual(before);
    },
  );

  it("does not promote removed funding work and rejects an active funded quest without a qualified classification", () => {
    const initial: CampaignPlan = {
      ...plan(),
      sharedQuestsOnly: true,
      partyPolicy: {
        revision: "five-player-kill-first-20261102-v9",
        partySize: 5,
        decisions: [],
        unresolvedPrerequisiteIds: [],
      },
      questFunding: {
        revision: "explicit-quest-funding-20261105-v81",
        providerRevision: catalog().providerRevision,
        addedQuestIds: [399999],
        remaining: [],
        scenarios: [],
      },
    };
    const before = structuredClone(initial);
    expect(refreshFundedCampaignPartyPolicy(initial, [], combat(), catalog())).toEqual(
      initial.partyPolicy,
    );
    expect(() =>
      refreshFundedCampaignPartyPolicy(
        {
          ...initial,
          questFunding: { ...initial.questFunding!, addedQuestIds: [300001] },
        },
        [],
        combat(),
        catalog(),
      ),
    ).toThrow(/300001.*no qualified party-policy classification/);
    expect(initial).toEqual(before);
  });

  it("keeps selected shared preparation fixed when earlier XP outcomes straddle its target", () => {
    const initial = plan();
    const funded = fundCampaignQuestGaps(
      { ...initial, sharedQuestsOnly: true },
      [],
      combat(),
      catalog(),
    );
    const tasks = funded.actions.filter((action) => action.fundingCheckpointId);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((action) => action.libraryBackbone && action.xpOptional === false)).toBe(
      true,
    );
    const base = emptyPremadeProgress();
    const progress = {
      ...base,
      members: base.members.map((member) => ({
        ...member,
        level: 1,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    const forecast = forecastCampaignXp(funded, progress, {
      initialBounds: progress.members.map(() => ({
        minimum: { level: 1, currentXp: 0 },
        maximum: { level: 2, currentXp: 800 },
      })),
    });
    for (const member of forecast.at(-1)!.members) {
      expect(member.blockedReason).toBeNull();
      expect(member.knownEndpoint!.level).toBeGreaterThanOrEqual(3);
      expect(
        forecast
          .flatMap((section) => section.members[member.player - 1]!.rewards)
          .filter((reward) => reward.questId === 300002),
      ).toHaveLength(1);
    }
    const legacy = fundCampaignQuestGaps(initial, [], combat(), catalog());
    expect(
      legacy.actions
        .filter((action) => action.fundingCheckpointId)
        .every((action) => action.xpOptional),
    ).toBe(true);
  });
  it.each(["1426", "1438"])(
    "does not send a shared Elwynn starter party to %s for filler XP",
    (zone) => {
      const initial = plan();
      const shared: CampaignPlan = {
        ...initial,
        sharedQuestsOnly: true,
        legs: initial.legs.map((leg) => (leg.id === "prepare" ? { ...leg, kind: "starter" } : leg)),
      };
      const point = { ...position, zone };
      const remote = {
        ...quest(),
        starts: [{ ...giver, positions: [point] }],
        ends: [{ ...giver, positions: [point] }],
        objectives: [{ ...quest().objectives[0]!, positions: [point] }],
      };
      const snapshot = structuredClone(shared);
      const funded = fundCampaignQuestGaps(shared, [], combat(), catalog([remote]));
      expect(funded.questFunding?.addedQuestIds).toEqual([]);
      expect(funded.questFunding?.remaining.length).toBeGreaterThan(0);
      expect(shared).toEqual(snapshot);
      const local = fundCampaignQuestGaps(shared, [], combat(), catalog());
      expect(local.questFunding?.addedQuestIds).toEqual([300002]);
    },
  );

  it("can fund a shared starter on the already planned Stormwind to Auberdine corridor", () => {
    const initial = plan();
    const shared: CampaignPlan = {
      ...initial,
      sharedQuestsOnly: true,
      actions: initial.actions.map((action) =>
        action.id === "gate"
          ? {
              ...action,
              positions: action.positions.map((entry) => ({
                ...entry,
                position: { ...entry.position, zone: "1439" },
              })),
            }
          : action,
      ),
      legs: initial.legs.map((leg) => (leg.id === "prepare" ? { ...leg, kind: "starter" } : leg)),
    };
    const point = { ...position, zone: "1453" };
    const onRoute = {
      ...quest(),
      starts: [{ ...giver, positions: [point] }],
      ends: [{ ...giver, positions: [point] }],
      objectives: [{ ...quest().objectives[0]!, positions: [point] }],
    };
    const funded = fundCampaignQuestGaps(shared, [], combat(), catalog([onRoute]));
    expect(funded.questFunding?.addedQuestIds).toEqual([300002]);
  });

  it("prepares locally before departure while preserving the city hand-in and class pickup", () => {
    const { plan: initial, source } = departingPlan(),
      before = JSON.stringify({ initial, source });
    const funded = fundCampaignQuestGaps(initial, [source], combat(), catalog());
    expect(funded.questFunding?.addedQuestIds).toEqual([300002]);
    const ids = funded.actions.map((action) => action.id),
      added = funded.actions.filter((action) => action.fundingCheckpointId === "gate");
    expect(added).toHaveLength(3);
    expect(ids.indexOf(added.at(-1)!.id)).toBeLessThan(ids.indexOf("departure"));
    expect(ids.indexOf("departure")).toBeLessThan(ids.indexOf("city-handoff"));
    expect(ids.indexOf("city-handoff")).toBeLessThan(ids.indexOf("training"));
    for (const id of ["departure", "city-handoff", "training"])
      expect(funded.actions.find((action) => action.id === id)).toEqual(
        initial.actions.find((action) => action.id === id),
      );
    const forecast = forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members[0]!;
    expect(forecast.blockedReason).toBeNull();
    expect(forecast.rewards.filter((reward) => reward.questId === 300002)).toHaveLength(1);
    expect(
      forecast.steps.find((step) => step.questId === 300003)!.before!.level,
    ).toBeGreaterThanOrEqual(3);
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.departure",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: [source],
    });
    expect(addon.lua.indexOf(".turnin 300002")).toBeLessThan(addon.lua.indexOf(".hs"));
    expect(addon.lua).toContain(".accept 300004");
    expect(JSON.stringify({ initial, source })).toBe(before);
  });
  it("cannot borrow a later city reward to qualify for preparation before departure", () => {
    const { plan: initial, source } = departingPlan();
    const input = {
      ...initial,
      actions: initial.actions.map((action) =>
        action.id === "gate" ? { ...action, targetLevel: 4 } : action,
      ),
      rewardFacts: initial.rewardFacts!.map((fact) =>
        fact.questId === 300003
          ? { ...fact, fullXp: 900 }
          : fact.questId === 300004
            ? { ...fact, minimumLevel: 4 }
            : fact,
      ),
    };
    const funded = fundCampaignQuestGaps(
      input,
      [source],
      combat(),
      catalog([{ ...quest(), minimumLevel: 3 }]),
    );
    expect(funded.questFunding?.addedQuestIds).toEqual([]);
  });
  it("uses only matching source departures within the current audience, leg and checkpoint phase", () => {
    const { plan: initial, source } = departingPlan(),
      gate = initial.actions.find((action) => action.id === "gate")!;
    expect(fundingInsertionActions(initial, [source], gate).map((action) => action.id)).toEqual([
      "gate",
      "departure",
    ]);
    expect(
      fundingInsertionActions(
        initial,
        [{ ...source, guide: { ...source.guide, version: "changed" } }],
        gate,
      ),
    ).toEqual([gate]);
    expect(
      fundingInsertionActions(
        initial,
        [{ ...source, guide: { ...source.guide, targetBuild: 70450 } }],
        gate,
      ),
    ).toEqual([gate]);
    expect(
      fundingInsertionActions(
        initial,
        [
          {
            ...source,
            guide: {
              ...source.guide,
              steps: source.guide.steps.map((step) => ({ ...step, condition: "Mage" })),
            },
          },
        ],
        gate,
      ),
    ).toEqual([gate]);
    expect(
      fundingInsertionActions(
        {
          ...initial,
          actions: initial.actions.map((action) =>
            action.id === "departure" ? { ...action, nativeUtilityTags: [".trainer"] } : action,
          ),
        },
        [source],
        gate,
      ),
    ).toEqual([gate]);
    expect(
      fundingInsertionActions(
        {
          ...initial,
          actions: initial.actions.map((action) =>
            action.id === "departure" ? { ...action, legId: "earlier" } : action,
          ),
        },
        [source],
        gate,
      ),
    ).toEqual([gate]);
    const barrier = { ...gate, id: "earlier-level-check" };
    const blocked = {
      ...initial,
      actions: [...initial.actions.slice(0, 2), barrier, ...initial.actions.slice(2)],
    };
    expect(fundingInsertionActions(blocked, [source], gate)).toEqual([gate]);
    expect(fundingInsertionActions(initial, [source], { ...gate, leaderOnly: false })).toEqual([
      { ...gate, leaderOnly: false },
    ]);
    const party = {
      ...initial,
      actions: initial.actions.map((action) => ({ ...action, leaderOnly: false })),
    };
    expect(
      fundingInsertionActions(
        party,
        [source],
        party.actions.find((action) => action.id === "gate")!,
      ).map((action) => action.id),
    ).toEqual(["gate", "departure"]);
  });
  it("closes a gap with actual eligible quest phases and their shared kill XP", () => {
    const initial = plan(),
      data = combat(),
      references = catalog(),
      before = JSON.stringify({ initial, data, references });
    const funded = fundCampaignQuestGaps(initial, [], data, references);
    expect(funded.questFunding?.addedQuestIds).toEqual([300002]);
    const row = forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!;
    expect(row.forecast.members).toHaveLength(5);
    for (const member of row.forecast.members)
      expect(member).toMatchObject({
        endpoint: { level: 3, currentXp: 210 },
        referenceQuestXp: 1400,
        combatXp: 110,
        estimatedCombatXp: 0,
        incidentalCombatXp: 0,
      });
    expect(new Set(funded.actions.map((action) => action.id)).size).toBe(funded.actions.length);
    expect(JSON.stringify({ initial, data, references })).toBe(before);
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.funding",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    expect(addon.lua).toContain(".accept 300002");
    expect(addon.lua).toContain(".complete 300002,1");
    expect(addon.lua).toContain(".turnin 300002");
  });
  it("does not borrow an ineligible future quest or invent its remaining XP", () => {
    const references = catalog([{ ...quest(), minimumLevel: 3 }]);
    const funded = fundCampaignQuestGaps(plan(), [], combat(), references);
    expect(funded.questFunding?.addedQuestIds).toEqual([]);
    expect(funded.questFunding?.remaining).toContainEqual({
      checkpointId: "gate",
      missingXpByPlayer: [900, 900, 900, 900, 900],
    });
    expect(
      forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast.members[0]!
        .endpoint,
    ).toEqual({ level: 2, currentXp: 0 });
  });
  it("does not fund from missing reward data", () => {
    const initial = plan();
    const funded = fundCampaignQuestGaps(
      { ...initial, rewardFacts: initial.rewardFacts!.slice(0, 1) },
      [],
      combat(),
      catalog(),
    );
    expect(funded.questFunding?.addedQuestIds).toEqual([]);
  });
  it("uses verified normal enemy levels when a kill quest's reference level is higher", () => {
    const initial = plan(),
      candidate = { ...quest(), questLevel: 6 },
      data = combat(),
      references = catalog([candidate]);
    const input: CampaignPlan = {
      ...initial,
      rewardFacts: initial.rewardFacts!.map((fact) =>
        fact.questId === candidate.questId ? { ...fact, questLevel: 6 } : fact,
      ),
    };
    const before = JSON.stringify({ input, data, references });
    const funded = fundCampaignQuestGaps(input, [], data, references);
    expect(funded.questFunding?.addedQuestIds).toEqual([300002]);
    expect(funded.rewardFacts!.find((fact) => fact.questId === candidate.questId)?.questLevel).toBe(
      6,
    );
    expect(JSON.stringify({ input, data, references })).toBe(before);
    for (const npc of [
      { ...data.npcs[0]!, rank: 2 },
      { ...data.npcs[0]!, maximumLevel: null },
      { ...data.npcs[0]!, maximumLevel: 7 },
    ])
      expect(
        fundCampaignQuestGaps(input, [], { ...data, npcs: [npc] }, references).questFunding
          ?.addedQuestIds,
      ).toEqual([]);
    expect(
      fundCampaignQuestGaps(input, [], data, catalog([{ ...candidate, minimumLevel: 3 }]))
        .questFunding?.addedQuestIds,
    ).toEqual([]);
  });
  it.each([
    [0, 16, true],
    [0, 17, false],
    [1, 16, true],
    [1, 17, false],
  ] as const)(
    "uses the lowest member for the +4 cap despite a low quest level and generous caller ceiling (rank %i, enemy %i)",
    (rank, enemyLevel, allowed) => {
      const candidate = quest();
      const base = combat();
      const progress = emptyPremadeProgress();
      progress.members = progress.members.map((member, index) => ({
        ...member, level: index === 4 ? 12 : 13, currentXp: 0, xpNeedsUpdate: false,
      }));
      const data = { ...base, npcs: [{ ...base.npcs[0]!, rank, minimumLevel: enemyLevel, maximumLevel: enemyLevel }] };
      const batch = campaignFundingBatch(candidate, catalog([candidate]), data, progress, {
        legId: "prepare", checkpointId: "gate", targetLevel: 14, previous: position,
        forbiddenQuestIds: new Set(), maximumQuestLevel: 99, leaderOnly: false, includePartyElites: true,
      });
      expect(batch !== null).toBe(allowed);
    },
  );
  it("considers ordinary elites by their actual level for all five players without changing rewards", () => {
    const initial = plan();
    const candidate = { ...quest(), questLevel: 6 };
    const base = combat();
    const data = { ...base, npcs: [{ ...base.npcs[0]!, rank: 1 }] };
    const references = catalog([candidate]);
    const frozen = JSON.stringify({ initial, data, references });
    const funded = fundCampaignQuestGaps(initial, [], data, references);
    expect(funded.questFunding?.addedQuestIds).toEqual([candidate.questId]);
    expect(funded.questFunding?.readyVisitReview?.stages.at(-1)).toEqual({
      policy: "party-combat",
      accepted: true,
      regressedScenarios: [],
    });
    expect(funded.rewardFacts).toBe(initial.rewardFacts);
    const members = forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members;
    for (const member of members) {
      expect(member.rewards.filter((reward) => reward.questId === candidate.questId)).toHaveLength(
        1,
      );
      expect(member.endpoint?.level).toBeGreaterThanOrEqual(3);
    }
    expect(JSON.stringify({ initial, data, references })).toBe(frozen);
  });

  it("keeps the full-party elite exception out of personal work and rejects bosses or unknown enemy levels", () => {
    const candidate = { ...quest(), questLevel: 6 };
    const base = combat();
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const options = {
      legId: "prepare",
      checkpointId: "gate",
      targetLevel: 3,
      previous: position,
      forbiddenQuestIds: new Set<number>(),
      maximumQuestLevel: 5,
      leaderOnly: false,
      includePartyElites: true,
    };
    const data = { ...base, npcs: [{ ...base.npcs[0]!, rank: 1 }] };
    expect(
      campaignFundingBatch(candidate, catalog([candidate]), data, progress, options),
    ).not.toBeNull();
    for (const input of [
      { options: { ...options, leaderOnly: true }, data, progress },
      { options: { ...options, includePartyElites: false }, data, progress },
      { options, data, progress: { ...progress, members: progress.members.slice(0, 4) } },
      ...[2, 3, 4, null].map((rank) => ({
        options,
        data: { ...data, npcs: [{ ...data.npcs[0]!, rank }] },
        progress,
      })),
      ...[null, 6].map((maximumLevel) => ({
        options,
        data: { ...data, npcs: [{ ...data.npcs[0]!, maximumLevel }] },
        progress,
      })),
    ])
      expect(
        campaignFundingBatch(
          candidate,
          catalog([candidate]),
          input.data,
          input.progress,
          input.options,
        ),
      ).toBeNull();
  });

  it("checks a new elite against the slowest player in every reached configuration", () => {
    const initial = plan();
    const candidate = { ...quest(), questLevel: 6 };
    const base = combat();
    const data = { ...base, npcs: [{ ...base.npcs[0]!, rank: 1, maximumLevel: 6 }] };
    const references = catalog([candidate]);
    const funded = fundCampaignQuestGaps(initial, [], data, references);
    const states = campaignFundingStates(funded);
    expect(funded.questFunding?.addedQuestIds).toEqual([candidate.questId]);
    expect(unsafePartyFundingScenarios(initial, states, references, data)).toEqual([]);
    const slower = states.map((state) => ({
      ...state,
      forecast: state.forecast.map((section) => ({
        ...section,
        members: section.members.map((member) => ({
          ...member,
          steps: member.steps.map((step) =>
            member.player === 5 &&
            step.questId === candidate.questId &&
            step.phase === "objectives-complete"
              ? { ...step, before: { level: 1, currentXp: 0 } }
              : step,
          ),
        })),
      })),
    }));
    expect(unsafePartyFundingScenarios(initial, slower, references, data)).toHaveLength(
      states.length,
    );
    expect(unsafePartyFundingScenarios(funded, slower, references, data)).toEqual([]);
  });

  it("rejects a new combat objective that becomes unresolved in another workload", () => {
    const initial = plan();
    const candidate = quest();
    const data = combat();
    const references = catalog([candidate]);
    const funded = fundCampaignQuestGaps(initial, [], data, references);
    const blocked = campaignFundingStates(funded).map((state) => ({
      ...state,
      forecast: state.forecast.map((section) => ({
        ...section,
        members: section.members.map((member) => ({
          ...member,
          steps: member.steps.map((step) =>
            step.questId === candidate.questId && step.phase === "objectives-complete"
              ? { ...step, status: "blocked" as const, after: null }
              : step,
          ),
        })),
      })),
    }));
    expect(unsafePartyFundingScenarios(initial, blocked, references, data)).toHaveLength(
      blocked.length,
    );
    expect(unsafePartyFundingScenarios(funded, blocked, references, data)).toEqual([]);
  });
  it("does not add penalized low-level filler to a higher-level departure", () => {
    const initial = plan(),
      levelTenXp = Array.from({ length: 9 }, (_, index) => FOREVER_XP_CURVE[index + 1]!).reduce(
        (sum, xp) => sum + xp,
        0,
      );
    const input: CampaignPlan = {
      ...initial,
      actions: initial.actions.map((action) =>
        action.kind === "xp-check" || action.kind === "checkpoint"
          ? { ...action, targetLevel: 11 }
          : action,
      ),
      rewardFacts: initial.rewardFacts!.map((fact, index) => ({
        ...fact,
        ...(index === 0 ? { fullXp: levelTenXp } : { xpByLevel: [{ level: 10, xp: 100 }] }),
      })),
    };
    const funded = fundCampaignQuestGaps(input, [], combat(), catalog());
    expect(funded.questFunding?.addedQuestIds).toEqual([]);
    expect(funded.questFunding?.remaining).toContainEqual({
      checkpointId: "gate",
      missingXpByPlayer: Array.from({ length: 5 }, () => FOREVER_XP_CURVE[10]!),
    });
  });
  it("allows a penalized prerequisite when it unlocks a current-level quest", () => {
    const initial = plan(),
      levelTenXp = Array.from({ length: 9 }, (_, index) => FOREVER_XP_CURVE[index + 1]!).reduce(
        (sum, xp) => sum + xp,
        0,
      );
    const root: QuestCatalogEntry = {
      ...quest(300003),
      title: "Current forest report",
      questLevel: 10,
      category: "delivery",
      objectives: [],
      prerequisites: { allOf: [300002], anyOf: [] },
    };
    const input: CampaignPlan = {
      ...initial,
      actions: initial.actions.map((action) =>
        action.kind === "xp-check" || action.kind === "checkpoint"
          ? { ...action, targetLevel: 11 }
          : action,
      ),
      rewardFacts: [
        { ...initial.rewardFacts![0]!, fullXp: levelTenXp },
        { ...initial.rewardFacts![1]!, xpByLevel: [{ level: 10, xp: 100 }] },
        { ...initial.rewardFacts![1]!, questId: 300003, questLevel: 10 },
      ],
    };
    const funded = fundCampaignQuestGaps(input, [], combat(), catalog([quest(), root]));
    expect(funded.questFunding?.addedQuestIds).toEqual([300002, 300003]);
    const actions = funded.actions.filter((action) => action.fundingCheckpointId === "gate");
    expect(
      actions.flatMap((action) => action.questChanges).map((change) => change.questId),
    ).toEqual([300002, 300002, 300002, 300003, 300003]);
  });
  it("moves an ordinary future quest before the gate while preserving its bookmark", () => {
    const initial = plan();
    const later: CampaignAction = {
      ...initial.actions[0]!,
      id: "later-patrol",
      legId: "later",
      questChanges: initial.actions[0]!.questChanges.map((change) => ({
        ...change,
        questId: 300002,
        title: "Forest patrol",
      })),
    };
    const input = {
      ...initial,
      actions: [...initial.actions, later],
      legs: [
        ...initial.legs,
        { ...initial.legs[0]!, id: "later", actionIds: [later.id], questIds: [300002] },
      ],
    };
    const funded = fundCampaignQuestGaps(input, [], combat(), catalog());
    expect(funded.actions.some((action) => action.id === "later-patrol")).toBe(false);
    expect(funded.bookmarkAliases?.[later.id]).toMatch(/^quest-funding-gate-300002-/);
    expect(
      funded.actions.filter((action) =>
        action.questChanges.some(
          (change) => change.questId === 300002 && change.state === "rewarded",
        ),
      ),
    ).toHaveLength(1);
  });
  it("moves an existing root quest with its source guards, instructions and world coordinates", () => {
    const candidate = quest();
    const base = plan().actions[0]!;
    const existing: CampaignAction[] = (
      ["accepted", "objectives-complete", "rewarded"] as const
    ).map((state, index) => ({
      ...base,
      id: `captured-${state}`,
      title: candidate.title,
      instructions: [`Original source instruction ${state}`],
      source: {
        chapterId: "captured-chapter",
        version: "captured-version",
        stepId: `step-${index}`,
        conditions: {
          checks: [
            {
              tag: ".isQuestAvailable",
              arguments: "384",
              condition: "",
              text: "",
              sourceLine: index,
              questId: null,
              position: null,
            },
          ],
          phases: [],
          optional: false,
        },
      },
      positions: [
        {
          sourceLine: index,
          position: { zone: "1429", x: -9465, y: 74, floor: 0, space: "world" },
        },
      ],
      questChanges: [
        {
          questId: candidate.questId,
          title: candidate.title,
          state,
          objectiveIndex: state === "objectives-complete" ? 1 : null,
        },
      ],
    }));
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const options = {
      legId: "prepare",
      checkpointId: "gate",
      targetLevel: 3,
      previous: position,
      forbiddenQuestIds: new Set<number>(),
      maximumQuestLevel: 5,
      leaderOnly: false,
      existingActions: existing,
    };
    const batch = campaignFundingBatch(
      candidate,
      catalog([candidate]),
      combat(),
      progress,
      options,
    )!;
    expect(batch).not.toBeNull();
    expect(batch.requiredKills).toBe(10);
    expect(batch.actions.map((action) => action.source)).toEqual(
      existing.map((action) => action.source),
    );
    expect(batch.actions.map((action) => action.instructions)).toEqual(
      existing.map((action) => action.instructions),
    );
    expect(batch.actions.map((action) => action.positions)).toEqual(
      existing.map((action) => action.positions),
    );
    expect(
      batch.actions.every((action) => action.id.startsWith("quest-funding-gate-300002-captured-")),
    ).toBe(true);
    expect(
      campaignFundingBatch(candidate, catalog([candidate]), combat(), progress, {
        ...options,
        existingActions: existing.slice(0, 2),
      }),
    ).toBeNull();
  });
  it("rejects cyclic, collection and mutually exclusive prerequisite chains", () => {
    const root = { ...quest(), prerequisites: { allOf: [300003], anyOf: [] } };
    for (const parent of [
      { ...quest(300003), prerequisites: { allOf: [300002], anyOf: [] } },
      { ...quest(300003), category: "unsupported" as const },
      { ...quest(300003), exclusiveWith: [300002] },
    ]) {
      const progress = emptyPremadeProgress();
      progress.members = progress.members.map((member) => ({
        ...member,
        level: 2,
        currentXp: 0,
        xpNeedsUpdate: false,
      }));
      expect(
        campaignFundingBatch(root, catalog([root, parent]), combat(), progress, {
          legId: "prepare",
          checkpointId: "gate",
          targetLevel: 3,
          previous: position,
          forbiddenQuestIds: new Set(),
          maximumQuestLevel: 5,
          leaderOnly: false,
        }),
      ).toBeNull();
    }
  });
  it("tries a usable alternative without leaking a rejected prerequisite branch", () => {
    const root = { ...quest(), prerequisites: { allOf: [], anyOf: [300003, 300004] } };
    const unavailable = { ...quest(300003), minimumLevel: 10 };
    const available = { ...quest(300004), category: "delivery" as const, objectives: [] };
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const batch = campaignFundingBatch(
      root,
      catalog([root, unavailable, available]),
      combat(),
      progress,
      {
        legId: "prepare",
        checkpointId: "gate",
        targetLevel: 3,
        previous: position,
        forbiddenQuestIds: new Set(),
        maximumQuestLevel: 5,
        leaderOnly: false,
      },
    );
    expect(batch?.questIds).toEqual([300004, 300002]);
  });
  it("skips unstarted filler when its own checkpoint is met, even if a later stop needs more levels", () => {
    const initial = plan();
    const gate = { ...initial.actions[1]!, targetLevel: 2 };
    const filler = {
      ...initial.actions[0]!,
      id: "filler",
      questChanges: [],
      xpOptional: true,
      xpTargetLevel: 2,
      fundingCheckpointId: gate.id,
    };
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(
      campaignOptionalXpReady(
        { ...initial, actions: [filler, gate, initial.actions[2]!] },
        progress,
        filler,
      ),
    ).toBe(true);
    progress.members[4]!.level = 1;
    expect(
      campaignOptionalXpReady(
        { ...initial, actions: [filler, gate, initial.actions[2]!] },
        progress,
        filler,
      ),
    ).toBe(false);
  });
  it("preserves extra route prerequisites when a provider omits the chain", () => {
    const initial = plan();
    const later: CampaignAction = {
      ...initial.actions[0]!,
      id: "later",
      requiredQuestIds: [300099],
      questChanges: initial.actions[0]!.questChanges.map((change) => ({
        ...change,
        questId: 300002,
      })),
    };
    const funded = fundCampaignQuestGaps(
      { ...initial, actions: [...initial.actions, later] },
      [],
      combat(),
      catalog(),
    );
    expect(funded.questFunding?.addedQuestIds).toEqual([]);
    expect(funded.actions.find((action) => action.id === later.id)).toEqual(later);
  });
  it("moves an already-listed collection prerequisite with its lucrative kill follow-up", () => {
    const base = plan();
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
    const guide = parseGuideChapter(
      "step\n.accept 300003\nstep\n.complete 300003,1 >>Repair the fishing nets\nstep\n.turnin 300003\n.accept 300002\nstep\n.complete 300002,1 >>Kill Forest Spider (x10)\n.mob Forest Spider\nstep\n.turnin 300002",
      reference.id,
      "f".repeat(64),
      70205,
    );
    const parent = {
      ...quest(300003),
      title: "Repair the fishing nets",
      category: "unsupported" as const,
      objectives: [],
    };
    const root = { ...quest(), prerequisites: { allOf: [300003], anyOf: [] } };
    const parentActions = (["accepted", "objectives-complete", "rewarded"] as const).map(
      (state, index): CampaignAction => ({
        ...base.actions[0]!,
        id: `parent-${state}`,
        source: {
          chapterId: guide.chapterId,
          version: guide.version,
          stepId: guide.steps[index]!.id,
        },
        questChanges: [
          {
            questId: parent.questId,
            title: parent.title,
            state,
            objectiveIndex: state === "objectives-complete" ? 1 : null,
          },
        ],
      }),
    );
    const returnWithPickup = {
      ...parentActions[2]!,
      instructions: [`Turn in ${parent.title}`, `Accept ${root.title}`],
      requiredQuestIds: [parent.questId],
      questChanges: [
        ...parentActions[2]!.questChanges,
        {
          questId: root.questId,
          title: root.title,
          state: "accepted" as const,
          objectiveIndex: null,
        },
      ],
    };
    const input = {
      ...base,
      actions: [...base.actions, ...parentActions.slice(0, 2), returnWithPickup],
      rewardFacts: [
        ...base.rewardFacts!,
        { ...base.rewardFacts![0]!, questId: parent.questId, fullXp: 100 },
      ],
    };
    const data = combat();
    data.quests.push({
      questId: parent.questId,
      creatureIds: [],
      itemCreatureIds: [],
      objectiveText: [],
      onlyCreatureObjectives: false,
      onlyInteractionObjectives: true,
    });
    const references = catalog([root, parent]);
    const funded = fundCampaignQuestGaps(input, [{ reference, guide }], data, references);
    expect(funded.questFunding?.addedQuestIds).toEqual([parent.questId, root.questId]);
    const reward = funded.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === parent.questId && change.state === "rewarded",
      ),
    )!;
    expect(reward.requiredQuestIds).toEqual([]);
    expect(reward.source).toEqual(returnWithPickup.source);
    const pickup = funded.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === root.questId && change.state === "accepted",
      ),
    )!;
    expect(pickup.source).toEqual(returnWithPickup.source);
    expect(pickup.instructions).toEqual([`Accept ${root.title}`]);
    expect(
      funded.actions.filter((action) =>
        action.questChanges.some(
          (change) => change.questId === parent.questId && change.state === "rewarded",
        ),
      ),
    ).toHaveLength(1);
    expect(
      forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast.members[0],
    ).toMatchObject({
      endpoint: { level: 3, currentXp: 310 },
      estimatedCombatXp: 0,
      incidentalCombatXp: 0,
      blockedReason: null,
    });
    const mixed = {
      ...parentActions[1]!,
      questChanges: [
        ...parentActions[1]!.questChanges,
        {
          questId: 300099,
          title: "Unrelated collection",
          state: "objectives-complete" as const,
          objectiveIndex: 1,
        },
      ],
    };
    const unsafe = {
      ...input,
      actions: input.actions.map((action) => (action.id === mixed.id ? mixed : action)),
    };
    expect(fundCampaignQuestGaps(unsafe, [], data, references).questFunding?.addedQuestIds).toEqual(
      [],
    );
  });
  it("funds every independent starter branch through the same validated transformation", () => {
    const initial = plan();
    const actions = initial.actions.slice(0, 2).map((action) => ({ ...action, leaderOnly: true }));
    const result = enrichCampaignStarters(
      {
        entries: actions.map((action) => ({ action, activities: [] })),
        routes: (["human", "night-elf"] as const).map((race) => ({
          race,
          classSlug: "warrior",
          legs: [{ ...initial.legs[0]!, kind: "starter" }],
          actionIndexes: [0, 1],
        })),
      },
      [],
      initial.rewardFacts!,
      { data: combat(), revision: "test" },
      catalog(),
    );
    expect(result.routes).toHaveLength(2);
    for (const route of result.routes)
      expect(
        route.actionIndexes.some(
          (index) => result.entries[index]!.action.libraryQuestId === 300002,
        ),
      ).toBe(true);
  });
  it("evaluates each independent starter's pickup reminder after its inserted funding tasks", () => {
    const initial = plan();
    const pickup: CampaignAction = {
      ...initial.actions[0]!,
      id: "starter-pickup",
      leaderOnly: true,
      questChanges: [
        { questId: 300004, title: "Starter task", state: "accepted", objectiveIndex: null },
      ],
    };
    const objective: CampaignAction = {
      ...pickup,
      id: "starter-objective",
      questChanges: [
        { ...pickup.questChanges[0]!, state: "objectives-complete", objectiveIndex: 1 },
      ],
    };
    const reward: CampaignAction = {
      ...pickup,
      id: "starter-reward",
      questChanges: [{ ...pickup.questChanges[0]!, state: "rewarded" }],
    };
    const actions = [pickup, objective, reward];
    const facts = [
      ...initial.rewardFacts!,
      { ...initial.rewardFacts![0]!, questId: 300004, fullXp: 0, minimumLevel: 2 },
    ];
    const result = enrichCampaignStarters(
      {
        entries: actions.map((action) => ({ action, activities: [] })),
        routes: (["human", "night-elf"] as const).map((race) => ({
          race,
          classSlug: "warrior",
          legs: [
            { ...initial.legs[0]!, kind: "starter", actionIds: actions.map((action) => action.id) },
          ],
          actionIndexes: [0, 1, 2],
        })),
      },
      [],
      facts,
      { data: combat(), revision: "test" },
      catalog(),
    );
    for (const route of result.routes) {
      const entries = route.actionIndexes.map((index) => result.entries[index]!);
      const ordered = entries.map((entry) => entry.action);
      const gateIndex = ordered.findIndex((action) => action.pickupQuestId === 300004);
      expect(gateIndex).toBeGreaterThan(0);
      expect(ordered[gateIndex + 1]!.id).toBe(pickup.id);
      expect(ordered.slice(0, gateIndex).some((action) => action.libraryQuestId === 300002)).toBe(
        true,
      );
      const forecast = forecastCampaignGuide(
        {
          ...initial,
          race: route.race,
          leaderClass: route.classSlug,
          legs: route.legs,
          actions: ordered,
          rewardFacts: facts,
          combat: { ...result.combat!, activities: entries.flatMap((entry) => entry.activities) },
        },
        emptyPremadeProgress(),
      );
      const player = forecast.sections[0]!.forecast.members[0]!;
      expect(forecast.sections[0]!.forecast.skippedOptionalActionIds).toContain(
        ordered[gateIndex]!.id,
      );
      expect(player.checkpoints.some((checkpoint) => !checkpoint.ready)).toBe(false);
      expect(player.steps.find((step) => step.actionId === pickup.id)).toMatchObject({
        phase: "accepted",
        status: "projected",
        shortfallXp: 0,
      });
    }
  });
  it("retains zone travel costs when an exact map-percent origin is unavailable", () => {
    const location = { ...position, zone: "1436" };
    const candidate = {
      ...quest(),
      starts: [{ ...giver, positions: [location] }],
      ends: [{ ...giver, positions: [location] }],
      objectives: [{ ...quest().objectives[0]!, positions: [location] }],
    };
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const batch = campaignFundingBatch(candidate, catalog([candidate]), combat(), progress, {
      legId: "prepare",
      checkpointId: "gate",
      targetLevel: 3,
      previous: null,
      previousZone: "1429",
      forbiddenQuestIds: new Set(),
      maximumQuestLevel: 5,
      leaderOnly: false,
    });
    expect(batch).not.toBeNull();
    expect(batch!.travelCost).toBeGreaterThan(0);
    const initial = plan();
    const personal = {
      ...initial,
      legs: initial.legs.map((leg) => ({ ...leg, kind: "starter" as const })),
      actions: initial.actions.map((action) => ({
        ...action,
        leaderOnly: true,
        positions: [
          {
            sourceLine: 1,
            position: { zone: "1429", x: -9465, y: 74, floor: 0, space: "world" as const },
          },
        ],
      })),
    };
    expect(
      fundCampaignQuestGaps(personal, [], combat(), catalog([candidate])).questFunding
        ?.addedQuestIds,
    ).toEqual([]);
  });
});


describe("chronological prerequisite pickup levels", () => {
  function staged(parentXp = 140): {
    initial: CampaignPlan;
    references: QuestCatalog;
    data: CombatDataset;
    progress: ReturnType<typeof emptyPremadeProgress>;
  } {
    const parent = { ...quest(300002), minimumLevel: 10, questLevel: 10 };
    const child = { ...quest(300003), minimumLevel: 11, questLevel: 11,
      prerequisites: { allOf: [300002], anyOf: [] } };
    const references = catalog([parent, child]), data = combat();
    data.quests = [...data.quests, { ...data.quests[0]!, questId: child.questId }];
    const base = plan(), initial: CampaignPlan = { ...base,
      sharedQuestsOnly: true, sourceArchiveSha256: references.sourceArchiveSha256,
      rewardFacts: [
        { ...base.rewardFacts![1]!, questId: parent.questId, questLevel: 10, minimumLevel: 10, fullXp: parentXp },
        { ...base.rewardFacts![1]!, questId: child.questId, questLevel: 11, minimumLevel: 11, fullXp: 5000 },
      ],
    };
    const progress = emptyPremadeProgress();
    progress.difficultyPolicy = "experienced-premade";
    const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
    progress.members = progress.members.map((member, index) => ({ ...member,
      raceId: "human", classSlug: classes[index]!,
      level: 10, currentXp: FOREVER_XP_CURVE[10]! - 100, xpNeedsUpdate: false }));
    return { initial, references, data, progress };
  }

  function select(input: ReturnType<typeof staged>, project = true): ReturnType<typeof campaignFundingBatch> {
    return campaignFundingBatch(input.references.quests[1]!, input.references, input.data, input.progress, {
      legId: "prepare", checkpointId: "gate", targetLevel: 11, previous: position, resumeZone: position.zone,
      maximumQuestLevel: 14, forbiddenQuestIds: new Set(), leaderOnly: false, sharedQuestsOnly: true,
      ...(project ? { prerequisiteProjection: { plan: input.initial, sources: [], lootScenario: "expected" as const } } : {}),
    });
  }

  it("uses only the earlier hand-in to unlock the later pickup", () => {
    const input = staged(), before = structuredClone(input);
    expect(select(input, false)).toBeNull();
    const selected = select(input);
    expect(selected?.questIds).toEqual([300002, 300003]);
    expect(input).toEqual(before);
    const projected = attachCampaignCombat({ ...input.initial, actions: selected!.actions.map((action) =>
      ({ ...action, xpOptional: false, libraryBackbone: true })),
      legs: [{ ...input.initial.legs[0]!, actionIds: selected!.actions.map((action) => action.id),
        questIds: [300002, 300003] }],
    }, [], input.data, "staged-regression");
    for (const member of forecastCampaignXp(projected, input.progress)[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      const pickup = member.steps.find((step) => step.questId === 300003 && step.phase === "accepted")!;
      expect(pickup.before.level).toBe(11);
      expect(member.rewards.map((reward) => reward.questId)).toEqual([300002, 300003]);
    }
  });

  it("does not borrow the follow-up's large reward to qualify its pickup", () => {
    expect(select(staged(50))).toBeNull();
  });

  it("requires every participant to reach the follow-up minimum", () => {
    const input = staged();
    input.progress.members[4]!.currentXp = FOREVER_XP_CURVE[10]! - 200;
    expect(select(input)).toBeNull();
  });

  it("keeps unknown parent rewards unresolved", () => {
    const input = staged();
    input.initial = { ...input.initial, rewardFacts: input.initial.rewardFacts!.map((fact) =>
      fact.questId === 300002 ? { ...fact, status: "unknown", fullXp: null, xpByLevel: [] } : fact) };
    expect(select(input)).toBeNull();
  });

  it("keeps the actual enemy-level limit enforced", () => {
    const input = staged();
    input.data.npcs[0]!.minimumLevel = 15;
    input.data.npcs[0]!.maximumLevel = 15;
    expect(select(input)).toBeNull();
  });
  it("does not exceed the quest log while unlocking a follow-up", () => {
    const input = staged();
    const held = Object.fromEntries(Array.from({ length: 40 }, (_, index) =>
      [String(400000 + index), "accepted" as const]));
    input.progress.members = input.progress.members.map((member) => ({ ...member, questStates: held }));
    expect(select(input)).toBeNull();
  });

  it("requires a known current bar for the prerequisite projection", () => {
    const input = staged();
    input.progress.members[4]!.currentXp = null;
    expect(select(input)).toBeNull();
  });

  it("does not bypass the catalog pickup level with a lower reward-fact minimum", () => {
    const input = staged(50);
    input.initial = { ...input.initial, rewardFacts: input.initial.rewardFacts!.map((fact) =>
      fact.questId === 300003 ? { ...fact, minimumLevel: 10 } : fact) };
    expect(select(input)).toBeNull();
  });

  it("does not substitute reference work for a missing selected source chapter", () => {
    const input = staged(), selected = select(input)!;
    const actions = selected.actions.map((action, index) => index === 0 ? { ...action,
      source: { chapterId: "missing-source", version: "missing-version", stepId: "missing-step" },
    } : action);
    expect(projectedFundingPrerequisitesFit(actions, selected.questIds, input.progress,
      input.references, input.data, { plan: input.initial, sources: [], lootScenario: "expected" })).toBe(false);
  });

});
