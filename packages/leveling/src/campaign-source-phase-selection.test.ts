import { describe, expect, it } from "vitest";
import { parseGuideChapter, getGuideStepView } from "./guide-archive.js";
import { createCampaignSourcePhaseSelector } from "./campaign-source-phase-selection.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { buildCampaignPlan } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { campaignStarterSourceIds, type CampaignRace } from "./campaign-route.js";
import type { CampaignSource } from "./campaign.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { campaignSourceChecks } from "./campaign-source-conditions.js";
import { buildCampaignStarters } from "./campaign-starters.js";
import type { CombatQuestReference } from "./combat-model.js";

const profile = createCampaignSourceProfile("dwarf", "warrior");

function starterSources(race: CampaignRace, control: CampaignSource): readonly CampaignSource[] {
  return campaignStarterSourceIds(race, "warrior").map((id) => {
    if (id === control.reference.sourceId) return control;
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === id)!;
    return {
      reference,
      guide: parseGuideChapter(
        "step\n+Test-only empty companion chapter",
        reference.id,
        "a".repeat(64),
        70205,
      ),
    };
  });
}

function firstSelected(raw: string, references: readonly CombatQuestReference[] = []): boolean {
  const guide = parseGuideChapter(raw, "control", "a".repeat(64), 70205),
    step = guide.steps[0]!;
  const view = getGuideStepView(step, profile, { dungeons: [] });
  const directive = view.directives.find(
    (entry) => entry.tag === ".complete" || entry.tag === ".accept" || entry.tag === ".turnin",
  )!;
  return createCampaignSourcePhaseSelector(guide, profile, [], references)(step, view, directive);
}

describe("reliable source phase selection", () => {
  it.each([
    "step\n.abandon 418\nstep\n.turnin 418",
    "step\n.accept 418\nstep\n.turnin 418",
    "step\n.accept 419\nstep\n.turnin 418",
    "step <<Mage\n.turnin 418",
    "step\n.turnin 418\n.money >0.001",
  ])("does not cross an unsafe or unavailable following chapter (%s)", (body) => {
    const early = parseGuideChapter(
      "step\n.turnin 418\n.isQuestComplete 418",
      "early",
      "a".repeat(64),
      70205,
    );
    const later = parseGuideChapter(body, "later", "a".repeat(64), 70205);
    const references: readonly CombatQuestReference[] = [
      {
        questId: 419,
        creatureIds: [],
        itemCreatureIds: [],
        onlyCreatureObjectives: false,
        objectiveText: [],
        prerequisites: { allOf: [418], anyOf: [] },
      },
    ];
    const step = early.steps[0]!;
    const view = getGuideStepView(step, profile, { dungeons: [] });
    const turnIn = view.directives.find((row) => row.tag === ".turnin")!;
    expect(
      createCampaignSourcePhaseSelector(early, profile, [], references, [later])(
        step,
        view,
        turnIn,
      ),
    ).toBe(true);
  });

  it("uses following chapters only when the caller supplies a selected sequence", () => {
    const early = parseGuideChapter(
      "step\n.turnin 418\n.isQuestComplete 418",
      "early",
      "a".repeat(64),
      70205,
    );
    const later = parseGuideChapter("step\n.turnin 418", "later", "a".repeat(64), 70205);
    const step = early.steps[0]!;
    const view = getGuideStepView(step, profile, { dungeons: [] });
    const turnIn = view.directives.find((row) => row.tag === ".turnin")!;
    expect(createCampaignSourcePhaseSelector(early, profile, [])(step, view, turnIn)).toBe(true);
    expect(
      createCampaignSourcePhaseSelector(early, profile, [], [], [later])(step, view, turnIn),
    ).toBe(false);
  });

  it("rejects a cross-build fallback before selecting any phase", () => {
    const early = parseGuideChapter(
      "step\n.turnin 418\n.isQuestComplete 418",
      "early",
      "a".repeat(64),
      70205,
    );
    const later = parseGuideChapter("step\n.turnin 418", "later", "a".repeat(64), 70450);
    expect(() => createCampaignSourcePhaseSelector(early, profile, [], [], [later])).toThrow(
      "mixes client builds",
    );
  });

  it("keeps the mandatory hand-in in the next selected starter chapter", () => {
    const first = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 119)!;
    const last = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 122)!;
    const early = parseGuideChapter(
      "step\n.accept 418\nstep\n#optional\n.turnin 418\n.isQuestComplete 418",
      first.id,
      "a".repeat(64),
      70205,
    );
    const later = parseGuideChapter(
      "step\n.goto Loch Modan,35,48\n.collect 3172,3,418,1\nstep\n.turnin 418",
      last.id,
      "a".repeat(64),
      70205,
    );
    const sources = starterSources("dwarf", { reference: first, guide: early }).map((source) =>
      source.reference.sourceId === 122 ? { reference: last, guide: later } : source,
    );
    const original = JSON.stringify(sources);
    const plan = buildCampaignPlan("dwarf", "a".repeat(64), sources, "warrior", {
      starterOnly: true,
    });
    const handIns = plan.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 418 && change.state === "rewarded"),
    );
    expect(handIns).toHaveLength(1);
    expect(handIns[0]!.source?.chapterId).toBe(last.id);
    expect(handIns[0]!.source?.stepId).toBe(later.steps[1]!.id);
    expect(JSON.stringify(sources)).toBe(original);
  });

  it("uses the later available-quest objective after a deferred conditional hand-in", () => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 119)!;
    const raw =
      "step\n.accept 384\nstep\n#optional\n.complete 384,2\n.itemcount 2886,6\nstep\n#optional\n.turnin 384\n.isQuestComplete 384\nstep\n.goto Dun Morogh,47,52\n.complete 384,2\n.isQuestAvailable 384\nstep\n.turnin 384";
    const guide = parseGuideChapter(raw, reference.id, "a".repeat(64), 70205);
    const source = { reference, guide };
    const plan = buildCampaignPlan(
      "dwarf",
      "a".repeat(64),
      starterSources("dwarf", source),
      "warrior",
      { starterOnly: true },
    );
    const completion = plan.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === 384 && change.state === "objectives-complete",
      ),
    )!;
    expect(completion.source?.stepId).toBe(guide.steps[3]!.id);
    const handIn = plan.actions.find((action) =>
      action.questChanges.some((change) => change.questId === 384 && change.state === "rewarded"),
    )!;
    expect(handIn.source?.stepId).toBe(guide.steps[4]!.id);
    expect(
      campaignNativeInstructions(plan, [source])(completion)!.directives.some(
        (row) => row.tag === ".isQuestAvailable" && row.arguments === "384",
      ),
    ).toBe(true);
  });

  it.each([
    ["", "", ".isQuestAvailable 384"],
    ["step\n.accept 384", "step\n.turnin 384", ".isQuestAvailable 384"],
    ["step\n.accept 384", "step\n.abandon 384", ".isQuestAvailable 384"],
    ["step\n.accept 384", "step\n.accept 385\n.isQuestTurnedIn 384", ".isQuestAvailable 384"],
    ["step\n.accept 384", "", ".isQuestAvailable 999"],
    ["step\n.accept 384\n.money >0.001", "", ".isQuestAvailable 384"],
  ])(
    "keeps resource work when its later availability witness is not proved (%s, %s, %s)",
    (pickup, barrier, guard) => {
      const guide = parseGuideChapter(
        `${pickup}\nstep\n.complete 384,2\n.itemcount 2886,6\n${barrier}\nstep\n.complete 384,2\n${guard}`,
        "control",
        "a".repeat(64),
        70205,
      );
      const step = guide.steps.find((step) =>
        step.directives.some((row) => row.tag === ".itemcount"),
      )!;
      const view = getGuideStepView(step, profile, { dungeons: [] });
      const directive = view.directives.find((row) => row.tag === ".complete")!;
      expect(createCampaignSourcePhaseSelector(guide, profile, [])(step, view, directive)).toBe(
        true,
      );
    },
  );

  it("uses the full objective fallback after an optional quest-history-controlled reminder", () => {
    expect(
      firstSelected(
        "step\n#optional\n.complete 985,1\n.isQuestTurnedIn 4811\nstep\n.complete 985,1\nstep\n.turnin 985",
      ),
    ).toBe(false);
  });

  it("preserves the full two-objective fallback through main, personal, library and native output", () => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 126)!;
    const guide = parseGuideChapter(
      "step\n.accept 985\nstep <<NightElf/Warrior\n#optional\n.complete 985,1 >>Blackwood Pathfinder (8)\n.complete 985,2 >>Blackwood Windtalker (5)\n.isQuestTurnedIn 4811\nstep\n.complete 985,1 >>Blackwood Pathfinder (8)\n.complete 985,2 >>Blackwood Windtalker (5)\nstep\n.turnin 985",
      reference.id,
      "a".repeat(64),
      70205,
    );
    const sources = starterSources("night-elf", { reference, guide });
    const original = JSON.stringify(sources);
    const plan = buildCampaignPlan("night-elf", "a".repeat(64), sources, "warrior", {
      starterOnly: true,
    });
    const completion = plan.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === 985 && change.state === "objectives-complete",
      ),
    )!;
    expect(completion.source?.stepId).toBe(guide.steps[2]!.id);
    expect(completion.questChanges.map((change) => change.objectiveIndex)).toEqual([1, 2]);
    expect(campaignSourceChecks(completion)).toEqual([]);
    const starters = buildCampaignStarters("a".repeat(64), sources);
    const personal = starters.routes.find(
      (route) => route.race === "night-elf" && route.classSlug === "warrior",
    )!;
    expect(
      personal.actionIndexes
        .map((index) => starters.entries[index]!.action)
        .find((action) =>
          action.questChanges.some(
            (change) => change.questId === 985 && change.state === "objectives-complete",
          ),
        )!.source?.stepId,
    ).toBe(guide.steps[2]!.id);
    const library = buildCampaignQuestLibrary(
      [{ reference, guide }],
      createCampaignSourceProfile("night-elf", "warrior"),
      [],
    );
    expect(
      library
        .find((quest) => quest.questId === 985)!
        .actions.filter((action) =>
          action.questChanges.some((change) => change.state === "objectives-complete"),
        )
        .map((action) => action.source?.stepId),
    ).toEqual([guide.steps[2]!.id, guide.steps[2]!.id]);
    const native = campaignNativeInstructions(plan, sources)(completion)!;
    expect(
      native.directives
        .filter((directive) => directive.tag === ".complete")
        .map((directive) => directive.arguments),
    ).toEqual(["985,1", "985,2"]);
    expect(native.directives.some((directive) => directive.tag === ".isQuestTurnedIn")).toBe(false);
    expect(JSON.stringify(sources)).toBe(original);
  });

  it("does not postpone quest-guarded work across a hand-in, abandonment or dependent pickup", () => {
    for (const barrier of [".turnin 985", ".abandon 985", ".accept 986\n.isQuestTurnedIn 985"])
      expect(
        firstSelected(
          `step\n.complete 985,1\n.isQuestTurnedIn 4811\nstep\n${barrier}\nstep\n.complete 985,1`,
        ),
      ).toBe(true);
  });

  it("retains quest guards when there is no eligible unconditional fallback", () => {
    for (const fallback of [
      "step <<Mage\n.complete 985,1",
      "step\n.complete 985,1\n.isQuestTurnedIn 4811",
      "step\n.complete 985,1\n.isOnQuest 985",
      "step\n.complete 985,1\n.money >0.001",
      "step\n.complete 985,1\n.skill cooking,10",
    ])
      expect(firstSelected(`step\n.complete 985,1\n.isQuestTurnedIn 4811\n${fallback}`)).toBe(true);
    expect(firstSelected("step\n.complete 985,1\n.skill cooking,10\nstep\n.complete 985,1")).toBe(
      true,
    );
  });

  it("retains the later full objective instead of a money-limited partial reminder in main and library paths", () => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 118)!;
    const guide = parseGuideChapter(
      "step\n.accept 179\nstep\n#completewith next\n.complete 179,1 >>Tough Wolf Meat (8)\n.money >0.001\nstep\n.complete 179,1 >>Tough Wolf Meat (8)\nstep\n.turnin 179",
      reference.id,
      "a".repeat(64),
      70205,
    );
    const source = { reference, guide };
    const plan = buildCampaignPlan(
      "dwarf",
      "a".repeat(64),
      starterSources("dwarf", source),
      "warrior",
      {
        starterOnly: true,
      },
    );
    const completion = plan.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === 179 && change.state === "objectives-complete",
      ),
    )!;
    expect(completion.source?.stepId).toBe(guide.steps[2]!.id);
    expect(completion.source?.conditions).toBeUndefined();
    const library = buildCampaignQuestLibrary([source], profile, []);
    const libraryCompletion = library
      .find((quest) => quest.questId === 179)!
      .actions.find((action) =>
        action.questChanges.some((change) => change.state === "objectives-complete"),
      )!;
    expect(libraryCompletion.source?.stepId).toBe(guide.steps[2]!.id);
  });

  it("does not defer work across its hand-in, abandonment or dependent pickup", () => {
    for (const barrier of [".turnin 179", ".abandon 179", ".accept 180\n.isQuestTurnedIn 179"])
      expect(
        firstSelected(
          `step\n.complete 179,1\n.money >0.001\nstep\n${barrier}\nstep\n.complete 179,1`,
        ),
      ).toBe(true);
  });

  it("keeps a guarded pickup before any earlier required objective", () => {
    expect(
      firstSelected("step\n.accept 1638\n.money <0.5\nstep\n.complete 1638,1\nstep\n.accept 1638"),
    ).toBe(true);
  });

  it("does not use another class's or another controlled phase as a fallback", () => {
    for (const suffix of ["step <<Mage\n.complete 179,1", "step\n.complete 179,1\n.isOnQuest 179"])
      expect(firstSelected(`step\n.complete 179,1\n.money >0.001\n${suffix}`)).toBe(true);
  });

  it("uses a later resource-free phase with exactly the same quest guards", () => {
    expect(
      firstSelected(
        "step\n.turnin 489\n.itemcount 3418,3\n.isOnQuest 489\nstep\n.complete 489,1\nstep\n.turnin 489\n.isOnQuest 489",
      ),
    ).toBe(false);
  });

  it("compares guard sets independently of row order, whitespace and duplicate rows", () => {
    expect(
      firstSelected(
        "step\n.turnin 489\n.itemcount 3418,3\n.isOnQuest 489, 490\n.isQuestTurnedIn 10\nstep\n.turnin 489\n.isQuestTurnedIn 10\n.isOnQuest 489,490\n.isOnQuest 489,490",
      ),
    ).toBe(false);
  });

  it("does not replace a phase with changed, additional or unsupported guards", () => {
    for (const guards of [
      ".isNotOnQuest 489",
      ".isOnQuest 489\n.isQuestTurnedIn 10",
      ".isOnQuest 489\n.itemcount 3418,3",
      ".isOnQuest 489\n.skill cooking,10",
      ".isOnQuest 489,account",
      ".isOnQuest 9007199254740993",
    ])
      expect(
        firstSelected(
          `step\n.turnin 489\n.itemcount 3418,3\n.isOnQuest 489\nstep\n.turnin 489\n${guards}`,
        ),
      ).toBe(true);
  });

  it("keeps a phase before another referenced quest's state changes", () => {
    for (const change of [".accept 10", ".complete 10,1", ".turnin 10", ".abandon 10"])
      expect(
        firstSelected(
          `step\n.turnin 489\n.itemcount 3418,3\n.isOnQuest 489\n.isQuestTurnedIn 10\nstep\n${change}\nstep\n.turnin 489\n.isOnQuest 489\n.isQuestTurnedIn 10`,
        ),
      ).toBe(true);
  });

  it("keeps completion-sensitive guards before their own objective state changes", () => {
    for (const guard of [".isQuestComplete", ".isQuestNotComplete"])
      expect(
        firstSelected(
          `step\n.turnin 489\n.itemcount 3418,3\n${guard} 489\nstep\n.complete 489,1\nstep\n.turnin 489\n${guard} 489`,
        ),
      ).toBe(true);
  });

  it("does not defer a guarded phase across a dependent pickup or mixed-quest source", () => {
    expect(
      firstSelected(
        "step\n.turnin 489\n.itemcount 3418,3\n.isOnQuest 489\nstep\n.accept 490\n.isQuestTurnedIn 489\nstep\n.turnin 489\n.isOnQuest 489",
      ),
    ).toBe(true);
    expect(
      firstSelected(
        "step\n.turnin 489\n.accept 490\n.itemcount 3418,3\n.isOnQuest 489\nstep\n.turnin 489\n.isOnQuest 489",
      ),
    ).toBe(true);
  });

  it("honors provider prerequisites even when the dependent source pickup has no explicit guard", () => {
    for (const prerequisites of [
      { allOf: [489], anyOf: [] },
      { allOf: [], anyOf: [489] },
    ])
      expect(
        firstSelected(
          "step\n.turnin 489\n.itemcount 3418,3\n.isOnQuest 489\nstep\n.accept 490\nstep\n.turnin 489\n.isOnQuest 489",
          [
            {
              questId: 490,
              creatureIds: [],
              itemCreatureIds: [],
              objectiveText: [],
              onlyCreatureObjectives: false,
              prerequisites,
            },
          ],
        ),
      ).toBe(true);
  });

  it("preserves the guarded fallback in main, personal and library source actions and native output", () => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 114)!;
    const guide = parseGuideChapter(
      "step\n.accept 489\nstep\n.complete 489,1\nstep\n.turnin 489\n.itemcount 3418,3\n.isOnQuest 489\nstep\n.complete 489,1\n.isOnQuest 489\nstep\n.turnin 489\n.isOnQuest 489",
      reference.id,
      "a".repeat(64),
      70205,
    );
    const sources = starterSources("night-elf", { reference, guide });
    const before = JSON.stringify(sources);
    const plan = buildCampaignPlan("night-elf", "a".repeat(64), sources, "warrior", {
      starterOnly: true,
    });
    const handIn = plan.actions.find((action) =>
      action.questChanges.some((change) => change.questId === 489 && change.state === "rewarded"),
    )!;
    expect(handIn.source?.stepId).toBe(guide.steps[4]!.id);
    expect(campaignSourceChecks(handIn).map((check) => check.tag)).toEqual([".isOnQuest"]);
    const starters = buildCampaignStarters("a".repeat(64), sources);
    const personal = starters.routes.find(
      (route) => route.race === "night-elf" && route.classSlug === "warrior",
    )!;
    expect(
      personal.actionIndexes
        .map((index) => starters.entries[index]!.action)
        .find((action) =>
          action.questChanges.some(
            (change) => change.questId === 489 && change.state === "rewarded",
          ),
        )!.source?.stepId,
    ).toBe(guide.steps[4]!.id);
    const library = buildCampaignQuestLibrary(
      [{ reference, guide }],
      createCampaignSourceProfile("night-elf", "warrior"),
      [],
    );
    expect(
      library
        .find((quest) => quest.questId === 489)!
        .actions.find((action) =>
          action.questChanges.some((change) => change.state === "rewarded"),
        )!.source?.stepId,
    ).toBe(guide.steps[4]!.id);
    expect(
      campaignNativeInstructions(
        plan,
        sources,
      )(handIn)!
        .directives.filter((directive) => [".itemcount", ".isOnQuest"].includes(directive.tag))
        .map((directive) => [directive.tag, directive.arguments]),
    ).toEqual([[".isOnQuest", "489"]]);
    const actions = plan.actions.filter((action) => action.questChanges.length);
    const tested = {
      ...plan,
      actions,
      legs: plan.legs
        .map((leg) => ({
          ...leg,
          actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
        }))
        .filter((leg) => leg.actionIds.length),
      rewardFacts: [
        {
          questId: 489,
          fullXp: 100,
          questLevel: 10,
          minimumLevel: 1,
          xpByLevel: [],
          status: "available",
          evidenceKind: "published-forever",
          sourceUrl: "https://example.test/guarded-fallback",
          capturedAt: "2026-11-01T00:00:00.000Z",
        },
      ] as const,
    };
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 10,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const player = forecastCampaignXp(tested, progress)[0]!.members[0]!;
    expect(player.blockedReason).toBeNull();
    expect(player.referenceQuestXp).toBe(100);
    expect(player.rewards.map((reward) => reward.questId)).toEqual([489]);
    expect(JSON.stringify(sources)).toBe(before);
  });

  it("retains an unguarded fallback pickup while preserving the preceding training visit", () => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
    const guide = parseGuideChapter(
      "step <<Warrior\n.accept 1638\n.trainer >>Train your class spells\n.money <0.5\nstep <<Warrior\n#optional\n.accept 1638\nstep <<Warrior\n.turnin 1638",
      reference.id,
      "a".repeat(64),
      70205,
    );
    const plan = buildCampaignPlan(
      "human",
      "a".repeat(64),
      starterSources("human", { reference, guide }),
      "warrior",
      {
        starterOnly: true,
      },
    );
    expect(
      plan.actions.find((action) => action.questChanges.some((change) => change.questId === 1638))!
        .source?.stepId,
    ).toBe(guide.steps[1]!.id);
    expect(
      plan.actions.some(
        (action) =>
          action.source?.stepId === guide.steps[0]!.id &&
          action.kind === "instructions" &&
          /Train/.test(action.title),
      ),
    ).toBe(true);
  });
});
