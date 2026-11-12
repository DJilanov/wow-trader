import { describe, expect, it } from "vitest";
import type { CampaignSource } from "./campaign.js";
import type { CombatQuestReference } from "./combat-model.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { campaignSourceChecks } from "./campaign-source-conditions.js";
import { evaluateCampaignSourceChecks } from "./campaign-source-condition-state.js";
import { parseGuideChapter } from "./guide-archive.js";

const ordinary = new Set([246]);
const references: readonly CombatQuestReference[] = [
  {
    questId: 246,
    requiredClasses: 0,
    creatureIds: [423, 424],
    itemCreatureIds: [],
    onlyCreatureObjectives: true,
    objectiveText: ["Kill 10 Redridge Mongrels and 6 Redridge Poachers."],
    prerequisites: { allOf: [], anyOf: [] },
  },
];
function source(
  condition = "Alliance !Hunter",
  body?: string,
  defaults = ["Human Warrior"],
): CampaignSource {
  const reference = {
    ...CHAPTER_REFERENCES.find((ref) => ref.sourceId === 128)!,
    condition,
    defaults,
    labels: [{ value: "15-17 Redridge", condition: "Warrior/Hunter" }],
  };
  return {
    reference,
    guide: parseGuideChapter(
      body ??
        "step\n.goto 1433,50,50\n.accept 246 >>Accept Assessing the Threat\nstep\n.isOnQuest 246\n.goto 1433,51,51\n>>Kill Redridge Mongrels and Redridge Poachers\n.complete 246,1 >>Redridge Mongrel (10)\n.mob +Redridge Mongrel\n.complete 246,2 >>Redridge Poacher (6)\n.mob +Redridge Poacher\nstep\n.goto 1433,50,50\n.turnin 246 >>Turn in Assessing the Threat",
      reference.id,
      "a".repeat(64),
      70205,
    ),
  };
}
function library(
  input: CampaignSource,
  ids = ordinary,
): ReturnType<typeof buildCampaignQuestLibrary> {
  return buildCampaignQuestLibrary(
    [input],
    createCampaignSourceProfile("human", null),
    [],
    new Set(),
    references,
    { ordinaryQuestIds: ids },
  );
}

describe("ordinary shared-source quest library", () => {
  it("restores a complete ordinary program and retains its source guards and counters", () => {
    const input = source(),
      before = structuredClone(input);
    const quest = library(input).find((entry) => entry.questId === 246)!;
    expect(quest).toMatchObject({
      complete: true,
      held: false,
      objective: "shared-kills",
      referenceLevel: 15,
      zone: "Redridge",
    });
    expect(
      quest.actions
        .flatMap((action) => action.questChanges)
        .map((change) => [change.state, change.objectiveIndex]),
    ).toEqual([
      ["accepted", null],
      ["objectives-complete", 1],
      ["objectives-complete", 2],
      ["rewarded", null],
    ]);
    for (const action of quest.actions) {
      expect(action.source?.chapterId).toBe(input.guide.chapterId);
      expect(action.source?.version).toBe(input.guide.version);
    }
    const completion = quest.actions.find(
      (action) => action.questChanges[0]?.state === "objectives-complete",
    )!;
    const checks = campaignSourceChecks(completion);
    expect(checks.map((check) => check.tag)).toContain(".isOnQuest");
    expect(evaluateCampaignSourceChecks(checks, { questStates: { "246": "accepted" } })).toBe(
      "execute",
    );
    expect(evaluateCampaignSourceChecks(checks, { questStates: {} })).toBe("skip");
    expect(input).toEqual(before);
  });

  it("keeps the legacy library unchanged without the explicit ordinary set", () => {
    const input = source();
    expect(
      buildCampaignQuestLibrary(
        [input],
        createCampaignSourceProfile("human", null),
        [],
        new Set(),
        references,
      ),
    ).toEqual([]);
    expect(library(input, new Set())).toEqual([]);
  });

  it.each([
    "Horde !Hunter",
    "Alliance Dwarf Hunter",
    "Alliance UnknownTrait",
    "Skip Alliance Hunter",
  ])("retains the real header constraint %s", (condition) => {
    expect(library(source(condition)).every((quest) => !quest.complete || quest.held)).toBe(true);
  });

  it.each(["Dwarf Warrior", "Skip", "Human UnknownTrait"])(
    "retains the incompatible or unknown default %s",
    (value) => {
      expect(
        library(source("Alliance !Hunter", undefined, [value])).every(
          (quest) => !quest.complete || quest.held,
        ),
      ).toBe(true);
    },
  );

  it("retains chapter XP gates including conditional gates for another class", () => {
    for (const condition of ["", "Hunter"]) {
      const input = source("Alliance Hunter/Alliance Priest", undefined, []);
      input.reference.xpRates = [{ value: ">1.5", condition }];
      expect(library(input).every((quest) => !quest.complete || quest.held)).toBe(true);
    }
  });

  it("does not admit unknown step selectors, resource gates or class spell methods", () => {
    for (const body of [
      "step << UnknownTrait\n.accept 246\n.complete 246,1\n.turnin 246",
      "step\n.itemcount 123,1\n.accept 246\n.complete 246,1\n.turnin 246",
      "step\n.cast 123\n.accept 246\n.complete 246,1\n.turnin 246",
      "step\n>>Cast [Fear] continuously\n.accept 246\n.complete 246,1\n.turnin 246",
      "step\n.accept 246\n.accept 999\n.complete 246,1\n.turnin 246",
    ])
      expect(
        library(source("Alliance !Hunter", body)).every((quest) => !quest.complete || quest.held),
      ).toBe(true);
  });

  it("does not turn a forged approved class quest into an ordinary program", () => {
    const input = source();
    const quests = buildCampaignQuestLibrary(
      [input],
      createCampaignSourceProfile("human", null),
      [],
      new Set(),
      [{ ...references[0]!, requiredClasses: 4 }],
      { ordinaryQuestIds: ordinary },
    );
    expect(quests.every((quest) => !quest.complete || quest.held)).toBe(true);
  });

  it.each(["Alliance !Hunter", "Alliance Human"])(
    "keeps an already-qualified common program ahead of %s",
    (condition) => {
      const common = source("Alliance", undefined, []),
        recommended = source(condition);
      const preferred = {
        ...common,
        reference: { ...common.reference, id: "chapter-common", sourceId: 9999 },
        guide: { ...common.guide, chapterId: "chapter-common" },
      };
      const quests = buildCampaignQuestLibrary(
        [recommended, preferred],
        createCampaignSourceProfile("human", null),
        [],
        new Set(),
        references,
        { ordinaryQuestIds: ordinary },
      );
      expect(
        quests
          .find((quest) => quest.questId === 246)
          ?.actions.every((action) => action.source?.chapterId === "chapter-common"),
      ).toBe(true);
    },
  );

  it("treats an already-matching Human header as a recommendation for an approved ordinary method", () => {
    expect(
      library(source("Alliance Human", undefined, [])).find((quest) => quest.questId === 246),
    ).toMatchObject({ complete: true, held: false });
  });

  it("keeps a common completion ahead of a more descriptive background recommendation", () => {
    const common = source(
      "Alliance",
      "step\n.accept 246\nstep\n#optional\n.isOnQuest 246\n.complete 246,1\n.complete 246,2\nstep\n.turnin 246",
      [],
    );
    const preferred: CampaignSource = {
      ...common,
      reference: { ...common.reference, id: "chapter-common", sourceId: 9999 },
      guide: { ...common.guide, chapterId: "chapter-common" },
    };
    const recommended = source(
      "Alliance !Hunter",
      "step\n.accept 246\nstep\n#completewith next\n>>Kill Redridge Mongrels and Redridge Poachers\n>>Do not go out of your way; finish later\n.complete 246,1 >>Redridge Mongrel (10)\n.mob +Redridge Mongrel\n.complete 246,2 >>Redridge Poacher (6)\n.mob +Redridge Poacher\nstep\n.turnin 246",
    );
    const quest = buildCampaignQuestLibrary(
      [recommended, preferred],
      createCampaignSourceProfile("human", null),
      [],
      new Set(),
      references,
      { ordinaryQuestIds: ordinary },
    ).find((entry) => entry.questId === 246)!;
    expect(
      quest.actions
        .filter((action) => action.questChanges[0]!.state === "objectives-complete")
        .every((action) => action.source?.chapterId === "chapter-common"),
    ).toBe(true);
  });
});
