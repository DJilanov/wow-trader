import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import type { CampaignAction, CampaignSource } from "./campaign.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { parseGuideChapter } from "./guide-archive.js";
import { hasOnlyPostTurnInCleanup } from "./campaign-source-cleanup.js";

const questId = 420002;
const profile = createCampaignSourceProfile("human", "warrior");
const cleanup = "step\n#optional\n#season 0\n#completewith NextTown\n.abandon 420002";
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

describe("post-turn-in optional source cleanup", () => {
  it("distinguishes a completed lifecycle from its later optional cleanup", () => {
    expect(qualify(lifecycle + "\n" + cleanup)).toBe(true);
    expect(qualify(lifecycle)).toBe(false);
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
