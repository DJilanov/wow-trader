import { describe, expect, it } from "vitest";
import { attachCampaignCombat } from "./campaign-combat.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { campaignActionSource, campaignSourceChecks } from "./campaign-source-conditions.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { evaluateCampaignSourceChecks } from "./campaign-source-condition-state.js";

interface Fixture {
  readonly source: CampaignSource;
  readonly plan: CampaignPlan;
  readonly data: CombatDataset;
}

function fixture(condition = "Alliance !Hunter", stepCondition = ""): Fixture {
  const reference = { ...CHAPTER_REFERENCES.find((entry) => entry.sourceId === 128)!, condition };
  const guide = parseGuideChapter(
    `step${stepCondition ? ` << ${stepCondition}` : ""}\n.isOnQuest 246\n.goto 1433,50,50\n>>Kill Redridge Mongrels and Redridge Poachers\n.complete 246,1 >>Redridge Mongrel (10)\n.mob +Redridge Mongrel\n.complete 246,2 >>Redridge Poacher (6)\n.mob +Redridge Poacher`,
    reference.id,
    "a".repeat(64),
    70205,
  );
  const step = guide.steps[0]!;
  const action: CampaignPlan["actions"][number] = {
    id: "selected-ordinary-kills",
    legId: "redridge",
    title: "Assessing the Threat",
    instructions: ["Kill Redridge Mongrels and Redridge Poachers"],
    kind: "quests",
    source: campaignActionSource(guide, step, step.directives),
    positions: [],
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: [1, 2].map((objectiveIndex) => ({
      questId: 246,
      title: "Assessing the Threat",
      state: "objectives-complete",
      objectiveIndex,
    })),
  };
  const plan: CampaignPlan = {
    release: "source-index-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: [246],
    actions: [action],
    legs: [
      {
        id: "redridge",
        title: "Redridge",
        kind: "preparation",
        from: 18,
        to: 20,
        stopId: null,
        actionIds: [action.id],
        questIds: [246],
        unresolvedQuestIds: [],
      },
    ],
  };
  const data: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "",
    provider: {
      repository: "https://example.test/synthetic-provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      limitations: ["Synthetic source-index fixture"],
    },
    npcs: [
      {
        id: 423,
        name: "Redridge Mongrel",
        minimumLevel: 15,
        maximumLevel: 15,
        rank: 0,
        zoneIds: [44],
        xpEligibility: "assumed",
      },
      {
        id: 424,
        name: "Redridge Poacher",
        minimumLevel: 16,
        maximumLevel: 16,
        rank: 0,
        zoneIds: [44],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 246,
        requiredClasses: 0,
        creatureIds: [423, 424],
        itemCreatureIds: [],
        onlyCreatureObjectives: true,
        objectiveText: ["Kill 10 Redridge Mongrels and 6 Redridge Poachers."],
        killQuotas: [
          { objectiveIndex: 1, npcId: 423, kills: 10, source: "Synthetic captured counter" },
          { objectiveIndex: 2, npcId: 424, kills: 6, source: "Synthetic captured counter" },
        ],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  };
  return { plan, source: { reference, guide }, data };
}

function objectives(input: Fixture): readonly {
  readonly npcIds: readonly number[];
  readonly kills: number | null;
  readonly credit: string;
}[] {
  return attachCampaignCombat(input.plan, [input.source], input.data, "test")
    .combat!.activities.flatMap((activity) => activity.objectives)
    .map((objective) => ({
      npcIds: objective.npcIds,
      kills: objective.requiredKills,
      credit: objective.credit,
    }));
}

const expected = [
  { npcIds: [423], kills: 10, credit: "shared-kills" },
  { npcIds: [424], kills: 6, credit: "shared-kills" },
];

describe("selected ordinary combat from class-recommended chapters", () => {
  it.each([
    ["Alliance !Hunter", ""],
    ["Alliance Hunter", "Hunter"],
    ["Alliance Warrior", "Warrior"],
  ])("reuses the exact ordinary program from %s", (condition, stepCondition) => {
    const input = fixture(condition, stepCondition),
      before = structuredClone(input);
    const result = attachCampaignCombat(input.plan, [input.source], input.data, "test");
    expect(objectives(input)).toEqual(expected);
    expect(input).toEqual(before);
    expect(result.actions[0]!.source).toEqual(input.plan.actions[0]!.source);
    expect(campaignSourceChecks(result.actions[0]!)).toEqual(
      campaignSourceChecks(input.plan.actions[0]!),
    );
    const native = campaignNativeInstructions(result, [input.source])(result.actions[0]!);
    expect(
      native?.directives.filter((row) => row.tag === ".complete").map((row) => row.arguments),
    ).toEqual(["246,1", "246,2"]);
    expect(
      native?.directives.some((row) => row.tag === ".isOnQuest" && row.arguments === "246"),
    ).toBe(true);
    const checks = campaignSourceChecks(result.actions[0]!);
    expect(evaluateCampaignSourceChecks(checks, { questStates: { "246": "accepted" } })).toBe(
      "execute",
    );
    expect(evaluateCampaignSourceChecks(checks, { questStates: {} })).toBe("skip");
    expect(evaluateCampaignSourceChecks(checks, { questStates: { "246": "rewarded" } })).toBe(
      "skip",
    );
  });

  it.each([
    "Horde !Hunter",
    "Alliance Dwarf Hunter",
    "Alliance UnknownTrait",
    "Skip Alliance Hunter",
  ])("retains the real chapter restriction %s", (condition) => {
    expect(
      objectives(fixture(condition)).every((objective) => objective.credit === "unknown"),
    ).toBe(true);
  });

  it.each(["step", "chapter", "unknown-chapter"])("retains the %s XP-rate gate", (kind) => {
    const input = fixture();
    if (kind === "step") {
      const gate = parseGuideChapter(
        "step\n#xprate >1.5",
        input.source.guide.chapterId,
        "b".repeat(64),
        70205,
      ).steps[0]!.directives[0]!;
      input.source.guide.steps[0]!.directives.unshift(gate);
    } else {
      input.source.reference.xpRates = [
        { value: kind === "chapter" ? ">1.5" : "unsupported", condition: "" },
      ];
    }
    expect(objectives(input).every((objective) => objective.credit === "unknown")).toBe(true);
  });

  it("retains a conditional chapter XP gate when another class can match the chapter", () => {
    const input = fixture("Alliance Hunter/Alliance Priest", "Hunter");
    input.source.reference.xpRates = [{ value: ">1.5", condition: "Hunter" }];
    expect(objectives(input).every((objective) => objective.credit === "unknown")).toBe(true);
  });

  it("does not reuse a class quest or a personal action through the ordinary-party fallback", () => {
    const classQuest = fixture("Alliance Hunter", "Hunter");
    classQuest.data.quests[0]!.requiredClasses = 4;
    expect(objectives(classQuest).every((objective) => objective.credit === "unknown")).toBe(true);
    const personal = fixture();
    expect(
      objectives({
        ...personal,
        plan: {
          ...personal.plan,
          actions: personal.plan.actions.map((action) => ({ ...action, leaderOnly: true })),
        },
      }).every((objective) => objective.credit === "unknown"),
    ).toBe(true);
  });

  it("requires the exact selected chapter version and step", () => {
    for (const field of ["version", "stepId"] as const) {
      const input = fixture();
      const plan = {
        ...input.plan,
        actions: [
          {
            ...input.plan.actions[0]!,
            source: { ...input.plan.actions[0]!.source!, [field]: "not-the-captured-source" },
          },
        ],
      };
      expect(
        objectives({ ...input, plan }).every((objective) => objective.credit === "unknown"),
      ).toBe(true);
    }
  });

  it("retains unknown step conditions and rejects a class spell as the required method", () => {
    expect(
      objectives(fixture("Alliance !Hunter", "UnknownTrait")).every(
        (objective) => objective.credit === "unknown",
      ),
    ).toBe(true);
    const input = fixture("Alliance Hunter", "Hunter");
    const cast = parseGuideChapter(
      "step\n.cast 123",
      input.source.guide.chapterId,
      "b".repeat(64),
      70205,
    ).steps[0]!.directives[0]!;
    input.source.guide.steps[0]!.directives.push(cast);
    expect(objectives(input).every((objective) => objective.credit === "unknown")).toBe(true);
  });

  it("honors the approved ordinary-quest set and supports the explicit provider fallback", () => {
    const input = fixture();
    expect(
      objectives({ ...input, plan: { ...input.plan, sharedSourceQuestIds: [] } }).every(
        (objective) => objective.credit === "unknown",
      ),
    ).toBe(true);
    const { sharedSourceQuestIds: _ids, ...fallback } = input.plan;
    expect(objectives({ ...input, plan: fallback })).toEqual(expected);
  });

  it("keeps legacy class selection and missing-class behavior", () => {
    const rejected = fixture("Alliance Hunter");
    const { sharedQuestsOnly: _shared, sharedSourceQuestIds: _ids, ...legacy } = rejected.plan;
    expect(
      objectives({ ...rejected, plan: legacy }).every(
        (objective) => objective.credit === "unknown",
      ),
    ).toBe(true);
    const accepted = fixture("Alliance !Hunter");
    expect(
      objectives({ ...accepted, plan: { ...legacy, actions: accepted.plan.actions } }),
    ).toEqual(expected);
    expect(
      objectives({
        ...accepted,
        plan: { ...legacy, leaderClass: null, actions: accepted.plan.actions },
      }).every((objective) => objective.credit === "unknown"),
    ).toBe(true);
  });
});
