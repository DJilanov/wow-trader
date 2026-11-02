import { describe, expect, it } from "vitest";
import { attachCampaignItemWork } from "./campaign-item-work.js";
import { parseGuideChapter } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { updateCampaignAction } from "./campaign.js";
import { activeCampaignActions } from "./campaign.js";
import { campaignActionNeeded, campaignOptionalXpReady } from "./campaign.js";
import type { CombatQuestReference } from "./combat-model.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { recordPremadeXp } from "./premade.js";
import {
  campaignFundingProgressBefore,
  type CampaignFundingState,
} from "./campaign-funding-scenarios.js";

const raw =
  "step\n.goto Elwynn Forest,40,80\n>>Kill boars and loot their meat\n.collect 769,4,86,1\n.mob Stonetusk Boar\nstep\n.goto Elwynn Forest,42,80\n.accept 86\nstep\n.goto Elwynn Forest,43,80\n.turnin 86";

function reference(objectiveIndex = 1): CombatQuestReference {
  return {
    questId: 86,
    creatureIds: [],
    itemCreatureIds: [],
    objectiveText: ["Bring 4 Chunks of Boar Meat to Billy Maclure."],
    onlyCreatureObjectives: false,
    itemObjectives: [
      {
        objectiveIndex,
        itemId: 769,
        itemName: "Chunk of Boar Meat",
        quantity: null,
        npcIds: [],
        sharing: "pooled",
      },
    ],
  };
}

function control(body = raw, quest = reference()): { source: CampaignSource; plan: CampaignPlan } {
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const guide = parseGuideChapter(body, chapter.id, "a".repeat(64), 70205);
  const source = { reference: chapter, guide };
  const actions = guide.steps.flatMap((step): CampaignAction[] => {
    const questChanges = step.directives.flatMap(
      (row): CampaignAction["questChanges"][number][] => {
        const state =
          row.tag === ".accept"
            ? "accepted"
            : row.tag === ".complete"
              ? "objectives-complete"
              : row.tag === ".turnin"
                ? "rewarded"
                : null;
        return state && row.questId !== null
          ? [
              {
                questId: row.questId,
                state,
                title: "Test item quest",
                objectiveIndex:
                  state === "objectives-complete" ? Number(row.arguments.split(",")[1] ?? 1) : null,
              },
            ]
          : [];
      },
    );
    return questChanges.length
      ? [
          {
            id: `item-control-${step.id}`,
            legId: "item-control",
            title: "Test item quest",
            instructions: [],
            questChanges,
            source: campaignActionSource(guide, step, step.directives),
            positions: step.directives.flatMap((row) =>
              row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
            ),
            kind: "quests",
            leaderOnly: true,
            raidOnly: false,
            targetLevel: null,
            targetStopId: null,
          },
        ]
      : [];
  });
  const base: CampaignPlan = {
    release: "item-work-control",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "item-control",
        title: "Test item work",
        kind: "starter",
        from: 1,
        to: 10,
        actionIds: actions.map((action) => action.id),
        questIds: [86],
        unresolvedQuestIds: [],
        stopId: null,
      },
    ],
    rewardFacts: [
      {
        questId: 86,
        fullXp: 100,
        questLevel: 10,
        minimumLevel: 1,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/item-work",
        capturedAt: "2026-11-01T00:00:00.000Z",
      },
    ],
  };
  return { source, plan: attachCampaignItemWork(base, [source], [quest]) };
}

function progress(): ReturnType<typeof emptyPremadeProgress> {
  const value = emptyPremadeProgress();
  value.members = value.members.map((member) => ({
    ...member,
    level: 10,
    currentXp: 0,
    xpNeedsUpdate: false,
  }));
  return value;
}

describe("source-backed pre-accept item work", () => {
  it("keeps one captured gathering route for all three materials of its hand-in", () => {
    const quest: CombatQuestReference = {
      ...reference(),
      itemObjectives: [769, 772, 773].map((itemId, index) => ({
        itemId,
        itemName: `Material ${index + 1}`,
        objectiveIndex: index + 1,
        quantity: 3,
        npcIds: [],
        sharing: "pooled",
      })),
    };
    const { plan, source } = control(
      "step\n.goto Elwynn Forest,40,80\n.accept 86\nstep\n.goto Elwynn Forest,41,80\n>>Gather these three materials on this loop\n.collect 769,3,86,1\n.collect 772,3,86,1\n.collect 773,3,86,1\nstep\n.goto Elwynn Forest,42,80\n.turnin 86",
      quest,
    );
    const collections = plan.actions.filter((action) => action.itemCollections?.length);
    expect(collections).toHaveLength(1);
    expect(collections[0]!.itemCollections!.map((target) => target.itemId)).toEqual([
      769, 772, 773,
    ]);
    const native = campaignNativeInstructions(plan, [source])(collections[0]!)!;
    expect(native.directives.filter((row) => row.tag === ".collect")).toHaveLength(3);
    expect(native.directives.filter((row) => row.tag === ".goto")).toHaveLength(1);
    const player = forecastCampaignXp(plan, progress())[0]!.members[0]!;
    expect(player.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([[86, 100]]);
    expect(player.combatXp).toBe(0);
    expect(attachCampaignItemWork(plan, [source], [quest])).toEqual(plan);
  });

  it("extracts a full collection from a mixed objective step without taking its other quest phases", () => {
    const body =
      "step\n.goto Elwynn Forest,40,80\n.complete 300001,1\n.collect 769,4,86,1,1\nstep\n.goto Elwynn Forest,42,80\n.accept 86\n.turnin 86";
    const { plan, source } = control(body);
    const collection = plan.actions.find((action) => action.itemCollections?.length);
    expect(collection?.itemCollections).toEqual([
      expect.objectContaining({ questId: 86, itemId: 769, quantity: 4 }),
    ]);
    expect(collection?.questChanges).toEqual([]);
    expect(collection?.title).toContain("4");
    const retained = plan.actions.find((action) =>
      action.questChanges.some((change) => change.questId === 300001),
    )!;
    expect(plan.actions.indexOf(collection!)).toBeLessThan(plan.actions.indexOf(retained));
    const native = campaignNativeInstructions(plan, [source])(collection!)!;
    expect(
      native.directives.filter((row) => row.tag === ".collect").map((row) => row.arguments),
    ).toEqual(["769,4,86,1,1"]);
    expect(
      native.directives.some((row) => [".accept", ".complete", ".turnin"].includes(row.tag)),
    ).toBe(false);
    const saved = progress();
    saved.members[0]!.questStates["300001"] = "accepted";
    const player = forecastCampaignXp(plan, saved)[0]!.members[0]!;
    expect(player.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([[86, 100]]);
    expect(player.combatXp).toBe(0);
    expect(player.issues.some((issue) => issue.code === "item-acquisition-unqualified")).toBe(true);
    expect(attachCampaignItemWork(plan, [source], [reference()])).toEqual(plan);
  });

  it("preserves an item's own availability check when extracting work after its pickup", () => {
    const body =
      "step\n.goto Elwynn Forest,39,80\n.accept 86\nstep\n.goto Elwynn Forest,40,80\n.complete 300001,1\n.collect 769,4,86,1\n.isQuestAvailable 86\nstep\n.goto Elwynn Forest,42,80\n.turnin 86";
    const { plan, source } = control(body);
    const task = plan.actions.find((action) => action.itemCollections?.length)!;
    expect(task).toBeDefined();
    const native = campaignNativeInstructions(plan, [source])(task)!;
    expect(
      native.directives
        .filter((row) => row.tag === ".isQuestAvailable")
        .map((row) => row.arguments),
    ).toEqual(["86"]);
    const saved = progress();
    saved.members[0]!.questStates["300001"] = "accepted";
    expect(forecastCampaignXp(plan, saved)[0]!.members[0]!.referenceQuestXp).toBe(100);
  });

  it("cannot bypass a full quest log after gathering from a mixed source step", () => {
    const body =
      "step\n.goto Elwynn Forest,40,80\n.complete 300001,1\n.collect 769,4,86,1,1\nstep\n.goto Elwynn Forest,42,80\n.accept 86\n.turnin 86";
    const { plan } = control(body);
    const saved = progress();
    saved.members[0]!.questStates = {
      "300001": "accepted",
      ...Object.fromEntries(
        Array.from({ length: 39 }, (_unused, index) => [
          String(400000 + index),
          "objectives-complete" as const,
        ]),
      ),
    };
    const player = forecastCampaignXp(plan, saved)[0]!.members[0]!;
    expect(player.questLog).toEqual({ capacity: 40, used: 40, peak: 40 });
    expect(player.rewards).toEqual([]);
    expect(player.issues.some((issue) => issue.code === "quest-log-full")).toBe(true);
  });

  it.each([
    ".disablecheckbox",
    ".use 769",
    ".turnin 300001",
    ".money >0.001",
    ".itemcount 769,4",
    ".isOnQuest 300001",
  ])("holds an inseparable mixed collection control (%s)", (guard) => {
    const body = `step\n.goto Elwynn Forest,40,80\n.complete 300001,1\n.collect 769,4,86,1\n${guard}\nstep\n.goto Elwynn Forest,42,80\n.accept 86\n.turnin 86`;
    expect(control(body).plan.actions.some((action) => action.itemCollections?.length)).toBe(false);
  });

  it("keeps visible collection before pickup, with no quest slot or invented kill XP", () => {
    const { plan } = control();
    expect(
      plan.actions.map((action) => action.itemCollections?.length ?? action.questChanges[0]?.state),
    ).toEqual([1, "accepted", "rewarded"]);
    expect(plan.actions[0]!.positions).not.toEqual([]);
    const before = JSON.stringify(plan);
    const player = forecastCampaignXp(plan, progress())[0]!.members[0]!;
    expect(player.rewards.map((row) => [row.questId, row.xp])).toEqual([[86, 100]]);
    expect(player.knownEndpoint).toEqual({ level: 10, currentXp: 100 });
    expect(player.combatXp).toBe(0);
    expect(player.questLog).toEqual({ capacity: 40, used: 0, peak: 1 });
    expect(
      player.issues.some(
        (issue) => issue.code === "item-acquisition-unqualified" && issue.blocksForecast,
      ),
    ).toBe(true);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it("binds by item identity to the corrected provider index, not the source bitmask", () => {
    const { plan } = control(raw, reference(2));
    expect(plan.itemRequirements).toEqual([
      { questId: 86, objectiveIndex: 2, itemId: 769, quantity: 4 },
    ]);
    expect(plan.actions[0]!.itemCollections![0]!.objectiveBitmask).toBe(1);
    expect(forecastCampaignXp(plan, progress())[0]!.members[0]!.rewards[0]!.xp).toBe(100);
  });

  it("does not promote a partial collection target to the whole hand-in requirement", () => {
    const quest = reference();
    const { plan } = control(raw, {
      ...quest,
      objectiveText: ["Bring 8 Chunks of Boar Meat to Billy Maclure."],
      itemObjectives: quest.itemObjectives!.map((item) => ({
        ...item,
        itemName: "Chunk of Boar Meat",
      })),
    });
    expect(plan.itemRequirements![0]!.quantity).toBe(8);
    expect(forecastCampaignXp(plan, progress())[0]!.members[0]!.rewards).toEqual([]);
  });

  it("keeps a verified retained-item starter in its original compound source action", () => {
    const body =
      "step\n.goto Elwynn Forest,40,80\n>>Loot the meat and use it to start the quest\n.use 769\n.collect 769,4,86,1\n.accept 86\nstep\n.goto Elwynn Forest,43,80\n.turnin 86";
    const quest = { ...reference(), startItem: { itemId: 769, name: "Chunk of Boar Meat" } };
    const { plan, source } = control(body, quest);
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0]!.itemCollections).toEqual([
      expect.objectContaining({ itemId: 769, quantity: 4, questId: 86 }),
    ]);
    const native = campaignNativeInstructions(plan, [source])(plan.actions[0]!)!;
    expect(
      native.directives
        .filter((row) => [".use", ".collect", ".accept"].includes(row.tag))
        .map((row) => [row.tag, row.arguments]),
    ).toEqual([
      [".use", "769"],
      [".collect", "769,4,86,1"],
      [".accept", "86"],
    ]);
    const player = forecastCampaignXp(plan, progress())[0]!.members[0]!;
    expect(player.rewards.map((row) => row.xp)).toEqual([100]);
    expect(player.questLog).toEqual({ capacity: 40, used: 0, peak: 1 });
    expect(player.issues.some((issue) => issue.code === "item-acquisition-unqualified")).toBe(true);
    expect(attachCampaignItemWork(plan, [source], [quest])).toEqual(plan);
    const withoutHandIn = { ...plan, actions: [plan.actions[0]!] };
    expect(
      activeCampaignActions(withoutHandIn, progress()).some((action) =>
        action.questChanges.some((change) => change.state === "accepted"),
      ),
    ).toBe(true);
    const full = progress();
    full.members[0]!.questStates = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        String(400000 + index),
        "objectives-complete" as const,
      ]),
    );
    const blocked = forecastCampaignXp(plan, full)[0]!.members[0]!;
    expect(blocked.questLog).toEqual({ capacity: 40, used: 40, peak: 40 });
    expect(blocked.issues.some((issue) => issue.code === "quest-log-full")).toBe(true);
    expect(blocked.rewards).toEqual([]);
  });

  it.each([
    [".use 769", undefined],
    [".use 770", { itemId: 769, name: "Chunk of Boar Meat" }],
    [".use 769,extra", { itemId: 769, name: "Chunk of Boar Meat" }],
    [".use 769\n.cast 123", { itemId: 769, name: "Chunk of Boar Meat" }],
    [".use 769", { itemId: 769, name: "Another Item" }],
  ] as const)("holds unqualified or mixed item use (%s)", (use, startItem) => {
    const body = `step\n.goto Elwynn Forest,40,80\n${use}\n.collect 769,4,86,1\n.accept 86\nstep\n.turnin 86`;
    const { plan } = control(body, { ...reference(), ...(startItem ? { startItem } : {}) });
    expect(plan.actions.some((action) => action.itemCollections?.length)).toBe(false);
    expect(forecastCampaignXp(plan, progress())[0]!.members[0]!.rewards).toEqual([]);
  });

  it("is idempotent and preserves exactly one native collect element", () => {
    const { plan, source } = control();
    expect(attachCampaignItemWork(plan, [source], [reference()])).toEqual(plan);
    const native = campaignNativeInstructions(plan, [source])(plan.actions[0]!)!;
    expect(
      native.directives.filter((row) => row.tag === ".collect").map((row) => row.arguments),
    ).toEqual(["769,4,86,1"]);
  });

  it("does not force optional hand-ins or profession material targets", () => {
    expect(
      control(raw.replace(".turnin 86", "#optional\n.turnin 86")).plan.actions.some(
        (action) => action.itemCollections?.length,
      ),
    ).toBe(false);
    expect(
      control(raw.replace("769,4,86,1", "769,10,86,1,0x20,cooking")).plan.actions.some(
        (action) => action.itemCollections?.length,
      ),
    ).toBe(false);
  });

  it("holds conflicting full objective quantities instead of selecting one", () => {
    const quest = {
      ...reference(),
      objectiveText: [
        "Bring 4 Chunks of Boar Meat to Billy Maclure.",
        "Bring 5 Chunks of Boar Meat to Billy Maclure.",
      ],
    };
    const { plan } = control(
      raw.replace(".collect 769,4,86,1", ".collect 769,4,86,1\n.collect 769,5,86,1"),
      quest,
    );
    expect(plan.itemRequirements![0]).toMatchObject({ quantity: null, conflict: true });
    expect(plan.actions.some((action) => action.itemCollections?.length)).toBe(false);
  });

  it("retains source skip controls and never grants skipped collection items", () => {
    const { plan, source } = control(
      raw.replace(".collect 769,4,86,1", ".collect 769,4,86,1\n.isOnQuest 86"),
    );
    const player = forecastCampaignXp(plan, progress())[0]!.members[0]!;
    expect(player.rewards).toEqual([]);
    expect(player.issues.some((issue) => issue.code === "quest-objectives-incomplete")).toBe(true);
    expect(
      campaignNativeInstructions(plan, [source])(plan.actions[0]!)!.directives.some(
        (row) => row.tag === ".isOnQuest",
      ),
    ).toBe(true);
  });

  it("does not turn collection into a forty-first active quest", () => {
    const { plan } = control();
    const saved = progress();
    saved.members[0]!.questStates = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [String(400000 + index), "accepted" as const]),
    );
    const player = forecastCampaignXp(plan, saved)[0]!.members[0]!;
    expect(player.questLog.used).toBe(40);
    expect(player.questLog.peak).toBe(40);
    expect(player.issues.some((issue) => issue.code === "quest-log-full")).toBe(true);
    expect(player.rewards).toEqual([]);
  });

  it("keeps collection and its payout personal when the other four players help elsewhere", () => {
    const { plan } = control();
    const players = forecastCampaignXp(plan, progress())[0]!.members;
    expect(players.map((player) => player.referenceQuestXp)).toEqual([100, 0, 0, 0, 0]);
    expect(players.slice(1).every((player) => player.questLog.peak === 0)).toBe(true);
  });

  it("respects a different personal owner for the complete item lifecycle", () => {
    const { plan } = control();
    const owners = Object.fromEntries(plan.actions.map((action) => [action.id, 3]));
    expect(
      forecastCampaignXp(plan, progress(), { personalActionPlayers: owners })[0]!.members.map(
        (player) => player.referenceQuestXp,
      ),
    ).toEqual([0, 0, 100, 0, 0]);
  });

  it("drops collection work when its matching hand-in is no longer selected", () => {
    const { plan } = control();
    const withoutHandIn = {
      ...plan,
      actions: plan.actions.filter(
        (action) => !action.questChanges.some((change) => change.state === "rewarded"),
      ),
    };
    expect(
      activeCampaignActions(withoutHandIn, progress()).some(
        (action) => action.itemCollections?.length,
      ),
    ).toBe(false);
  });

  it("keeps needed collection for an accepted quest after reaching its optional XP target", () => {
    const { plan } = control();
    const task = { ...plan.actions[0]!, xpOptional: true, xpTargetLevel: 5 };
    const saved = progress();
    saved.members[0]!.questStates["86"] = "accepted";
    expect(campaignOptionalXpReady(plan, saved, task)).toBe(false);
    expect(campaignActionNeeded(plan, saved, task)).toBe(true);
    saved.members[0]!.questStates["86"] = "rewarded";
    expect(campaignActionNeeded(plan, saved, task)).toBe(false);
  });

  it("cannot spend the same stack on a second projected hand-in", () => {
    const { plan } = control();
    const first = plan.actions[1]!,
      handIn = plan.actions[2]!;
    const pickup: CampaignAction = {
      ...first,
      id: "item-control-second-pickup",
      source: null,
      questChanges: [
        {
          questId: 300001,
          state: "accepted",
          objectiveIndex: null,
          title: "Second stack consumer",
        },
      ],
    };
    const secondHandIn: CampaignAction = {
      ...pickup,
      id: "item-control-second-hand-in",
      questChanges: pickup.questChanges.map((change) => ({ ...change, state: "rewarded" })),
    };
    const actions = [plan.actions[0]!, first, pickup, handIn, secondHandIn];
    const tested: CampaignPlan = {
      ...plan,
      actions,
      legs: plan.legs.map((leg) => ({ ...leg, actionIds: actions.map((action) => action.id) })),
      itemRequirements: [
        ...plan.itemRequirements!,
        { questId: 300001, objectiveIndex: 1, itemId: 769, quantity: 4 },
      ],
      rewardFacts: [...plan.rewardFacts!, { ...plan.rewardFacts![0]!, questId: 300001 }],
    };
    const player = forecastCampaignXp(tested, progress())[0]!.members[0]!;
    expect(player.rewards.map((reward) => reward.questId)).toEqual([86]);
    expect(player.questLog.used).toBe(1);
    expect(player.blockedReason).toContain("300001: required objectives");
  });

  it("persists physical reports, consumes once, and does not reconstruct items from the old done flag", () => {
    const { plan } = control();
    let saved = updateCampaignAction(plan, progress(), plan.actions[0]!.id, true);
    expect(saved.members[0]!.itemHoldings?.minimums).toEqual({ "769": 4 });
    expect(saved.members[0]!.questStates).toEqual({});
    saved = recordPremadeXp(saved, 0, 10, 0);
    saved = updateCampaignAction(plan, saved, plan.actions[1]!.id, true);
    expect(saved.members[0]!.questStates["86"]).toBe("objectives-complete");
    saved = updateCampaignAction(plan, saved, plan.actions[2]!.id, true);
    expect(saved.members[0]!.itemHoldings?.minimums).toEqual({});
    saved = recordPremadeXp(saved, 0, 10, 100);
    saved.members[0]!.questStates["86"] = "accepted";
    saved = premadeProgressSchema.parse(saved);
    const player = forecastCampaignXp(plan, saved)[0]!.members[0]!;
    expect(player.rewards).toEqual([]);
    expect(player.issues.some((issue) => issue.code === "quest-objectives-incomplete")).toBe(true);
  });

  it("invalidates projected holdings when an actual anchor corrects quest state", () => {
    const { plan } = control();
    const player = forecastCampaignXp(plan, progress(), {
      anchors: [
        {
          release: plan.release,
          actionId: plan.actions[2]!.id,
          player: 1,
          level: 10,
          currentXp: 0,
          questStates: { "86": "accepted" },
          confirmations: {},
          bundleSlotStates: {},
        },
      ],
    })[0]!.members[0]!;
    expect(player.rewards).toEqual([]);
    expect(player.issues.some((issue) => issue.code === "quest-objectives-incomplete")).toBe(true);
  });

  it("carries zero-XP item transitions into intermediate funding progress", () => {
    const { plan } = control();
    const saved = progress();
    const state: CampaignFundingState = {
      difficultyPolicy: "at-level",
      starterMode: "separate",
      strategy: "dungeons",
      optionalStops: true,
      sourceBuild: plan.targetBuild,
      itemRequirements: plan.itemRequirements!,
      progress: saved,
      actions: activeCampaignActions(plan, saved),
      forecast: forecastCampaignXp(plan, saved),
    };
    const resumed = campaignFundingProgressBefore(state, plan.actions[2]!.id);
    expect(resumed.members[0]!.questStates["86"]).toBe("objectives-complete");
    expect(resumed.members[0]!.itemHoldings?.minimums).toEqual({ "769": 4 });
    expect(resumed.members[0]!.questStates["null"]).toBeUndefined();
    const remaining = forecastCampaignXp(plan, resumed, { fromActionId: plan.actions[2]!.id })[0]!
      .members[0]!;
    expect(remaining.rewards.map((row) => row.xp)).toEqual([100]);
    expect(remaining.combatXp).toBe(0);
  });

  it("does not reconstruct a partial non-item objective as whole-quest completion", () => {
    const { plan } = control();
    const pickup: CampaignAction = {
      ...plan.actions[1]!,
      id: "partial-pickup",
      source: null,
      questChanges: [
        { questId: 300001, state: "accepted", objectiveIndex: null, title: "Two objectives" },
      ],
    };
    const objective = (index: number): CampaignAction => ({
      ...pickup,
      id: `partial-objective-${index}`,
      questChanges: [
        { ...pickup.questChanges[0]!, state: "objectives-complete", objectiveIndex: index },
      ],
    });
    const pause: CampaignAction = {
      ...pickup,
      id: "partial-resume",
      kind: "instructions",
      questChanges: [],
    };
    const handIn: CampaignAction = {
      ...pickup,
      id: "partial-hand-in",
      questChanges: [{ ...pickup.questChanges[0]!, state: "rewarded" }],
    };
    const actions = [pickup, objective(1), pause, objective(2), handIn];
    const tested: CampaignPlan = {
      ...plan,
      itemRequirements: [],
      actions,
      legs: plan.legs.map((leg) => ({ ...leg, actionIds: actions.map((action) => action.id) })),
      rewardFacts: [{ ...plan.rewardFacts![0]!, questId: 300001 }],
    };
    const saved = progress();
    const state: CampaignFundingState = {
      difficultyPolicy: "at-level",
      starterMode: "separate",
      strategy: "dungeons",
      optionalStops: true,
      progress: saved,
      actions,
      forecast: forecastCampaignXp(tested, saved),
    };
    const resumed = campaignFundingProgressBefore(state, pause.id);
    expect(resumed.members[0]!.questStates["300001"]).toBe("accepted");
    expect(resumed.members[0]!.confirmations["campaign-objective-300001-1"]).toBe(true);
    expect(resumed.members[0]!.confirmations["campaign-objective-300001-2"]).toBeUndefined();
  });
});
