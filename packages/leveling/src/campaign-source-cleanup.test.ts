import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import type { CampaignAction, CampaignSource } from "./campaign.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { parseGuideChapter } from "./guide-archive.js";
import { hasOnlyPostTurnInCleanup } from "./campaign-source-cleanup.js";

const questId = 420002;
const profile = createCampaignSourceProfile("human", "warrior");
const cleanup = "step\n#optional\n#season 0\n#completewith NextTown\n.abandon 420002";
const hiddenCleanup = "step\n#hidewindow\n#completewith next\n.abandon 420002";
const lifecycle = "step\n.accept 420002\nstep\n.complete 420002,1\nstep\n.turnin 420002";

function source(body: string, sourceId = 116, targetBuild = 70205): CampaignSource {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === sourceId)!;
  return { reference, guide: parseGuideChapter(body, reference.id, "f".repeat(64), targetBuild) };
}
function actions(input: CampaignSource): readonly CampaignAction[] {
  return input.guide.steps.flatMap((step) => {
    const questChanges = step.directives.flatMap((directive): CampaignAction["questChanges"] => {
      const state =
        directive.tag === ".accept"
          ? "accepted"
          : directive.tag === ".complete"
            ? "objectives-complete"
            : directive.tag === ".turnin"
              ? "rewarded"
              : null;
      return state && directive.questId === questId
        ? [
            {
              questId,
              title: "Spider Trophy",
              state,
              objectiveIndex: state === "objectives-complete" ? 1 : null,
            },
          ]
        : [];
    });
    return questChanges.length
      ? [
          {
            id: step.id,
            legId: "review",
            title: "Spider Trophy",
            instructions: [],
            positions: [],
            source: {
              chapterId: input.guide.chapterId,
              version: input.guide.version,
              stepId: step.id,
            },
            kind: "quests",
            leaderOnly: false,
            raidOnly: false,
            targetLevel: null,
            targetStopId: null,
            questChanges,
          },
        ]
      : [];
  });
}
function qualify(body: string): boolean {
  const input = source(body);
  return hasOnlyPostTurnInCleanup(questId, actions(input), [input], profile, 70205);
}

const groupLifecycle = [
  "step << Hunter/Warlock",
  ".solo",
  ".accept 420002",
  ".isQuestTurnedIn 420001",
  "step",
  ".group",
  ".accept 420002",
  ".isQuestTurnedIn 420001",
  "step",
  ".group 3",
  ".complete 420002,1",
  ".isOnQuest 420002",
  "step << Hunter/Warlock",
  ".solo",
  ".complete 420002,1",
  ".isOnQuest 420002",
  "step",
  ".turnin 420002",
  ".isQuestComplete 420002",
].join("\n");

function groupProgram(body = groupLifecycle + "\n" + cleanup): {
  readonly input: CampaignSource;
  readonly selected: readonly CampaignAction[];
} {
  const input = source(body);
  const selectedIds = new Set([1, 2, 4].map((index) => input.guide.steps[index]!.id));
  return {
    input,
    selected: actions(input).filter((action) => selectedIds.has(action.source!.stepId)),
  };
}

describe("post-turn-in optional source cleanup", () => {
  it.each(["#era", "#era/som", "#softcore", "#softcoreserver"])(
    "accepts a resolved current-mode marker on passive cleanup: %s", (marker) => {
      expect(qualify(`${lifecycle}\nstep\n${marker}\n#optional\n.abandon ${questId}`)).toBe(true);
    },
  );

  it.each(["after hand-in", "after cleanup"])(
    "holds a solo restart %s instead of treating it as an unused alternative",
    (where) => {
      const group = lifecycle
        .replace(".accept 420002", ".group\n.accept 420002")
        .replace(".complete 420002,1", ".group 3\n.complete 420002,1");
      const restart = "step\n.solo\n.accept 420002";
      const body =
        where === "after hand-in"
          ? [group, restart, cleanup].join("\n")
          : [group, cleanup, restart].join("\n");
      const input = source(body);
      expect(
        hasOnlyPostTurnInCleanup(questId, actions(input).slice(0, 3), [input], profile, 70205),
      ).toBe(false);
    },
  );

  it("holds a captured extra objective even when that unselected step has no unknown condition", () => {
    const input = source(
      lifecycle.replace("step\n.turnin", "step\n.complete 420002,2\nstep\n.turnin") +
        "\n" +
        cleanup,
    );
    const selected = actions(input).filter(
      (action) => action.questChanges[0]!.objectiveIndex !== 2,
    );
    expect(hasOnlyPostTurnInCleanup(questId, selected, [input], profile, 70205)).toBe(false);
  });

  it("does not bypass a selected group's size or condition through the general cleanup path", () => {
    for (const group of [".group 6", ".group 3 << Unknown", ".group invalid"]) {
      const input = source(
        lifecycle.replace(".complete 420002,1", `${group}\n.complete 420002,1`) + "\n" + cleanup,
      );
      expect(hasOnlyPostTurnInCleanup(questId, actions(input), [input], profile, 70205)).toBe(
        false,
      );
    }
  });

  it("rejects a forged objective counter even without alternative source branches", () => {
    const input = source(lifecycle + "\n" + cleanup);
    const selected = actions(input).map((action) =>
      action.questChanges[0]!.state === "objectives-complete"
        ? { ...action, questChanges: [{ ...action.questChanges[0]!, objectiveIndex: 2 }] }
        : action,
    );
    expect(hasOnlyPostTurnInCleanup(questId, selected, [input], profile, 70205)).toBe(false);
  });

  it("audits the complete chosen group program without importing unused solo alternatives", () => {
    const { input, selected } = groupProgram();
    const unrelated = source("step\n.abandon 420002", 115);
    const original = structuredClone({ input, selected, unrelated });
    expect(
      hasOnlyPostTurnInCleanup(
        questId,
        selected,
        [unrelated, input],
        createCampaignSourceProfile("human", null),
        70205,
        new Set([questId]),
      ),
    ).toBe(true);
    expect({ input, selected, unrelated }).toEqual(original);
    expect(selected.flatMap((action) => action.questChanges.map((change) => change.state))).toEqual(
      ["accepted", "objectives-complete", "rewarded"],
    );
  });

  it("keeps a complete group method when only optional class tips or video links are conditional", () => {
    const body = groupLifecycle.replace(".group 3", [
      ".group 3",
      ">>Warlocks can fear the target << Warlock",
      ".link https://example.test/hunter-video >>Optional Hunter strategy << Hunter",
    ].join("\n")) + "\n" + cleanup;
    const { input, selected } = groupProgram(body);
    expect(hasOnlyPostTurnInCleanup(questId, selected, [input],
      createCampaignSourceProfile("human", null), 70205, new Set([questId]))).toBe(true);
  });

  it("allows an ordinary pickup when the selected combat step explicitly requires a group", () => {
    const { input, selected } = groupProgram();
    const pickup = input.guide.steps.find((step) => step.id === selected[0]!.source!.stepId)!;
    pickup.directives = pickup.directives.filter((row) => row.tag !== ".group");
    expect(hasOnlyPostTurnInCleanup(questId, selected, [input],
      createCampaignSourceProfile("human", null), 70205, new Set([questId]))).toBe(true);
  });

  it("still requires the selected combat step's group marker when the pickup has none", () => {
    const { input, selected } = groupProgram();
    for (const action of selected.slice(0, -1)) {
      const step = input.guide.steps.find((step) => step.id === action.source!.stepId)!;
      step.directives = step.directives.filter((row) => row.tag !== ".group");
    }
    expect(hasOnlyPostTurnInCleanup(questId, selected, [input],
      createCampaignSourceProfile("human", null), 70205, new Set([questId]))).toBe(false);
  });

  it.each([".use 123", ".complete 420002,2", ".goto Elwynn Forest,50,50"])(
    "keeps conditional functional work on hold: %s", (directive) => {
      const body = groupLifecycle.replace(".group 3", `.group 3\n${directive} << Warlock`) + "\n" + cleanup;
      const { input, selected } = groupProgram(body);
      expect(hasOnlyPostTurnInCleanup(questId, selected, [input],
        createCampaignSourceProfile("human", null), 70205, new Set([questId]))).toBe(false);
    },
  );

  it.each([
    ["unmarked unknown alternative", groupLifecycle.replace(".solo", ".group") + "\n" + cleanup],
    [
      "conditional solo marker",
      groupLifecycle.replace(".solo", ".solo << Unknown") + "\n" + cleanup,
    ],
    ["oversized group", groupLifecycle.replace(".group 3", ".group 6") + "\n" + cleanup],
    [
      "conditional group",
      groupLifecycle.replace(".group 3", ".group 3 << Unknown") + "\n" + cleanup,
    ],
    ["missing group marker", groupLifecycle.replace(".group 3", "") + "\n" + cleanup],
    [
      "unselected objective",
      groupLifecycle.replace(
        ".complete 420002,1\n.isOnQuest 420002\nstep\n.turnin",
        ".complete 420002,2\n.isOnQuest 420002\nstep\n.turnin",
      ) +
        "\n" +
        cleanup,
    ],
    [
      "early abandonment",
      groupLifecycle.replace(".group 3", ".group 3\n.abandon 420002") + "\n" + cleanup,
    ],
    ["later restart", groupLifecycle + "\n" + cleanup + "\nstep\n.accept 420002"],
    [
      "unknown sequential work",
      groupLifecycle + "\nstep << Unknown\n.complete 420002,1\n" + cleanup,
    ],
    ["conditional cleanup", groupLifecycle + "\n" + cleanup.replace("step\n", "step << Unknown\n")],
  ])("keeps a chosen group program on hold with %s", (_reason, body) => {
    const { input, selected } = groupProgram(body);
    expect(
      hasOnlyPostTurnInCleanup(
        questId,
        selected,
        [input],
        createCampaignSourceProfile("human", null),
        70205,
        new Set([questId]),
      ),
    ).toBe(false);
  });

  it("requires every chosen group phase to match its captured source", () => {
    const { input, selected } = groupProgram();
    const forged = selected.map((action) =>
      action.questChanges[0]!.state === "objectives-complete"
        ? { ...action, questChanges: [{ ...action.questChanges[0]!, objectiveIndex: 2 }] }
        : action,
    );
    expect(
      hasOnlyPostTurnInCleanup(
        questId,
        forged,
        [input],
        createCampaignSourceProfile("human", null),
        70205,
      ),
    ).toBe(false);
  });

  it("distinguishes a completed lifecycle from its later optional cleanup", () => {
    expect(qualify(lifecycle + "\n" + cleanup)).toBe(true);
    expect(qualify(lifecycle)).toBe(false);
  });

  it("recognizes a hidden next-step journal cleanup after the completed hand-in", () => {
    expect(qualify(lifecycle + "\n" + hiddenCleanup)).toBe(true);
  });

  it("uses the same ordinary class-recommended sources as the shared quest library", () => {
    const input = source(lifecycle + "\n" + hiddenCleanup, 7);
    const shared = createCampaignSourceProfile("human", null);
    expect(hasOnlyPostTurnInCleanup(questId, actions(input), [input], shared, 70205)).toBe(false);
    expect(
      hasOnlyPostTurnInCleanup(questId, actions(input), [input], shared, 70205, new Set([questId])),
    ).toBe(true);
  });

  it.each([
    lifecycle.replace(".complete 420002,1", ">>Cast Fireball\n.complete 420002,1"),
    lifecycle.replace(".accept 420002", ".accept 420003\n.accept 420002"),
  ])("holds class work or an unqualified companion phase in a recommended source", (body) => {
    const input = source(body + "\n" + hiddenCleanup, 7);
    expect(
      hasOnlyPostTurnInCleanup(
        questId,
        actions(input),
        [input],
        createCampaignSourceProfile("human", null),
        70205,
        new Set([questId]),
      ),
    ).toBe(false);
  });

  it.each([
    ["before pickup", hiddenCleanup + "\n" + lifecycle],
    ["before hand-in", lifecycle.replace("step\n.turnin", hiddenCleanup + "\nstep\n.turnin")],
    ["missing hidden marker", lifecycle + "\n" + hiddenCleanup.replace("#hidewindow\n", "")],
    [
      "missing next-step marker",
      lifecycle + "\n" + hiddenCleanup.replace("#completewith next\n", ""),
    ],
    [
      "another destination",
      lifecycle + "\n" + hiddenCleanup.replace("#completewith next", "#completewith Town"),
    ],
    [
      "hidden marker arguments",
      lifecycle + "\n" + hiddenCleanup.replace("#hidewindow", "#hidewindow 1"),
    ],
    ["runtime condition", lifecycle + "\n" + hiddenCleanup + "\n.isQuestComplete 420002"],
    ["extra operation", lifecycle + "\n" + hiddenCleanup + "\n.use 123"],
    ["other quest", lifecycle + "\n" + hiddenCleanup + "\n.abandon 420003"],
    ["later restart", lifecycle + "\n" + hiddenCleanup + "\nstep\n.accept 420002"],
    [
      "conditional cleanup",
      lifecycle + "\n" + hiddenCleanup.replace("step\n", "step << UnknownCondition\n"),
    ],
    [
      "conditional marker",
      lifecycle + "\n" + hiddenCleanup.replace("#hidewindow", "#hidewindow << UnknownCondition"),
    ],
    [
      "extra abandonment arguments",
      lifecycle + "\n" + hiddenCleanup.replace(".abandon 420002", ".abandon 420002,1"),
    ],
  ])("holds hidden cleanup with %s", (_reason, body) => {
    expect(qualify(body)).toBe(false);
  });

  it.each([
    ["before pickup", cleanup + "\n" + lifecycle],
    ["before hand-in", lifecycle.replace("step\n.turnin", cleanup + "\nstep\n.turnin")],
    ["required abandonment", lifecycle + "\nstep\n.abandon 420002"],
    ["missing optional marker", lifecycle + "\n" + cleanup.replace("#optional\n", "")],
    ["runtime condition", lifecycle + "\n" + cleanup + "\n.isQuestComplete 420002"],
    ["unsupported operation", lifecycle + "\n" + cleanup + "\n.use 123"],
    [
      "unresolved directive condition",
      lifecycle + "\n" + cleanup.replace(".abandon 420002", ".abandon 420002 << UnknownCondition"),
    ],
    [
      "unresolved step condition",
      lifecycle + "\n" + cleanup.replace("step\n", "step << UnknownCondition\n"),
    ],
    ["another abandonment in the same step", lifecycle + "\n" + cleanup + "\n.abandon 420003"],
    ["later restarted lifecycle", lifecycle + "\n" + cleanup + "\nstep\n.accept 420002"],
    [
      "extra abandonment arguments",
      lifecycle + "\n" + cleanup.replace(".abandon 420002", ".abandon 420002,1"),
    ],
    [
      "incomplete lifecycle",
      lifecycle.replace(".complete 420002,1", ">>Carry the quest") + "\n" + cleanup,
    ],
  ])("holds %s", (_reason, body) => {
    expect(qualify(body)).toBe(false);
  });

  it("uses source chronology rather than caller array order across chapters", () => {
    const first = source(lifecycle, 116),
      last = source(cleanup, 127);
    expect(hasOnlyPostTurnInCleanup(questId, actions(first), [last, first], profile, 70205)).toBe(
      true,
    );
    const earlier = source(cleanup, 115);
    expect(
      hasOnlyPostTurnInCleanup(questId, actions(first), [first, earlier], profile, 70205),
    ).toBe(false);
  });

  it("requires the selected source identities and target build to match", () => {
    const input = source(lifecycle + "\n" + cleanup),
      selected = actions(input);
    expect(
      hasOnlyPostTurnInCleanup(
        questId,
        selected.map((action) => ({
          ...action,
          source: { ...action.source!, version: "different" },
        })),
        [input],
        profile,
        70205,
      ),
    ).toBe(false);
    expect(hasOnlyPostTurnInCleanup(questId, selected, [input], profile, 70450)).toBe(false);
  });
});
