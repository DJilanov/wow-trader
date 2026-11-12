import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  emptyPremadeProgress,
  timedQuestFailureKey,
  type CampaignPlan,
  type PremadeProgress,
} from "@wow-trader/leveling";
import { LevelingTimedQuestStatus } from "./leveling-timed-quest-status";

const plan: CampaignPlan = {
  release: "timed-ui-test",
  targetBuild: 70205,
  sourceArchiveSha256: "f".repeat(64),
  race: "human",
  leaderClass: "warrior",
  questTimings: [{ questId: 257, title: "A Hunter's Boast", timeLimitSeconds: 900 }],
  legs: [],
  actions: [
    {
      id: "challenge",
      legId: "visit",
      title: "Challenge",
      kind: "quests",
      instructions: [],
      questChanges: [
        { questId: 257, title: "A Hunter's Boast", state: "accepted", objectiveIndex: null },
      ],
      source: null,
      positions: [],
      leaderOnly: false,
      raidOnly: false,
      targetLevel: null,
      targetStopId: null,
    },
  ],
};

function render(progress: PremadeProgress, disabled = false, currentPlan = plan): string {
  return renderToStaticMarkup(
    <LevelingTimedQuestStatus
      plan={currentPlan}
      progress={progress}
      disabled={disabled}
      onChange={() => {}}
    />,
  );
}

function active(): PremadeProgress {
  const initial = emptyPremadeProgress();
  return {
    ...initial,
    members: initial.members.map((member, index) =>
      index === 2
        ? {
            ...member,
            questStates: { "257": "accepted" },
            level: 16,
            currentXp: 123,
            xpNeedsUpdate: false,
          }
        : member,
    ),
  };
}

describe("timed quest recovery controls", () => {
  it("hides inactive and alternate starter quests", () => {
    expect(render(emptyPremadeProgress())).toBe("");
    expect(render(active(), false, { ...plan, actions: [] })).toBe("");
  });

  it("shows only the active player with the actual deadline and failure control", () => {
    const markup = render(active());
    expect(markup).toContain("15 minutes from acceptance");
    expect(markup).toContain("Player 3");
    expect(markup).not.toContain("Player 1");
    expect(markup).toContain("Failed or expired");
    expect(markup).not.toContain('disabled=""');
    expect(render(active(), true)).toContain('disabled=""');
  });

  it("requires a fresh XP report to unlock a failed player's explicit retry confirmation", () => {
    const progress = active();
    const failed: PremadeProgress = {
      ...progress,
      members: progress.members.map((member, index) =>
        index === 2
          ? { ...member, xpNeedsUpdate: true, confirmations: { [timedQuestFailureKey(257)]: true } }
          : member,
      ),
    };
    const markup = render(failed);
    expect(markup).toContain("Reaccept it in game");
    expect(markup).toContain("level / XP update");
    expect(markup).toContain("I accepted a new attempt");
    expect(markup).toContain('disabled=""');
    const fresh = {
      ...failed,
      members: failed.members.map((member) => ({ ...member, xpNeedsUpdate: false })),
    };
    expect(render(fresh)).not.toContain('disabled=""');
  });

  it("removes completed quests even if an old failure confirmation remains", () => {
    const progress = active();
    const rewarded: PremadeProgress = {
      ...progress,
      members: progress.members.map((member, index) =>
        index === 2
          ? {
              ...member,
              questStates: { "257": "rewarded" },
              confirmations: { [timedQuestFailureKey(257)]: true },
            }
          : member,
      ),
    };
    expect(render(rewarded)).toBe("");
  });
});
