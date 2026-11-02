import { describe, expect, it } from "vitest";
import { campaignAddonQuestActions } from "./campaign-addon-lifecycle.js";
import type { CampaignAction } from "./campaign.js";
import type { GroundPickupReference } from "./quest-ground-pickup.js";

const ground: GroundPickupReference = {
  questId: 12,
  itemId: 2998,
  objectiveIndex: 1,
  objectId: 1166,
  objectName: "Test chest",
  positions: [{ zone: "1436", x: 36, y: 54 }],
  sourceArchiveSha256: "a".repeat(64),
  source: { chapterId: "test", version: "v1", stepId: "step-1" },
};

function opportunity(checkpoint: string, optional = true): readonly CampaignAction[] {
  return (["accepted", "objectives-complete", "rewarded"] as const).map(
    (state): CampaignAction => ({
      id: `${checkpoint}-${state}`,
      legId: checkpoint,
      title: "The People's Militia",
      instructions: [],
      positions: [],
      source: null,
      kind: "quests",
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
      questChanges: [
        {
          questId: 12,
          title: "The People's Militia",
          state,
          objectiveIndex: state === "objectives-complete" ? 1 : null,
        },
      ],
      libraryQuestId: 12,
      libraryObjective: "shared-kills",
      fundingCheckpointId: checkpoint,
      xpOptional: optional,
    }),
  );
}

describe("native optional quest opportunities", () => {
  it("retains both verified ground-pickup opportunities with one-time quest guards", () => {
    const actions = [...opportunity("early"), ...opportunity("later")].map(
      (action): CampaignAction => ({
        ...action,
        libraryObjective: "interaction",
        fundingGroundPickup: ground,
      }),
    );
    const output = campaignAddonQuestActions(actions, "party");
    expect(output.actions).toEqual(actions);
    expect(output.guards.size).toBe(6);
    expect(output.guards.get("later-accepted")).toEqual({ tag: ".isQuestAvailable", questId: 12 });
    expect(output.guards.get("later-objectives-complete")).toEqual({
      tag: ".isOnQuest",
      questId: 12,
    });
  });

  it("does not generalize independent opportunities to unproven or conflicting interactions", () => {
    const actions = [...opportunity("early"), ...opportunity("later")].map(
      (action): CampaignAction => ({ ...action, libraryObjective: "interaction" }),
    );
    expect(campaignAddonQuestActions(actions, "leader").actions).toHaveLength(3);
    const conflicting = actions.map((action, index): CampaignAction => ({
      ...action,
      fundingGroundPickup: index < 3 ? ground : { ...ground, objectId: 999 },
    }));
    expect(campaignAddonQuestActions(conflicting, "leader").actions).toHaveLength(3);
  });

  it("does not accept a ground-pickup opportunity without its object objective", () => {
    const actions = [...opportunity("early"), ...opportunity("later")]
      .filter((action) => action.id !== "early-objectives-complete")
      .map((action): CampaignAction => ({
        ...action,
        libraryObjective: "interaction",
        fundingGroundPickup: ground,
      }));
    expect(() => campaignAddonQuestActions(actions, "leader")).toThrow(
      "without its object objective",
    );
  });

  it("retains a required later opportunity after optional work, including remaining objective slots", () => {
    const early = opportunity("early");
    const later = opportunity("later", false);
    const secondObjective: CampaignAction = {
      ...later[1]!,
      id: "later-second-counter",
      questChanges: [{ ...later[1]!.questChanges[0]!, objectiveIndex: 2 }],
    };
    const actions = [...early, ...later.slice(0, 2), secondObjective, later[2]!];
    const output = campaignAddonQuestActions(actions, "leader");
    expect(output.actions).toEqual(actions);
    expect(output.guards.get("later-accepted")).toEqual({ tag: ".isQuestAvailable", questId: 12 });
    expect(output.guards.get(secondObjective.id)).toEqual({ tag: ".isOnQuest", questId: 12 });
    expect(output.guards.get("later-rewarded")).toEqual({ tag: ".isOnQuest", questId: 12 });
  });

  it("does not borrow a later hand-in to complete an earlier opportunity", () => {
    expect(() =>
      campaignAddonQuestActions(
        [...opportunity("early").slice(0, 2), ...opportunity("later")],
        "leader",
      ),
    ).toThrow("leaves quest 12 without a hand-in");
  });

  it("does not borrow an earlier pickup for an orphan later opportunity", () => {
    expect(() =>
      campaignAddonQuestActions(
        [...opportunity("early"), ...opportunity("later").slice(1)],
        "party",
      ),
    ).toThrow("before its pickup");
  });

  it("keeps ordinary duplicate normalization when both opportunities are mandatory", () => {
    const early = opportunity("early", false);
    const output = campaignAddonQuestActions([...early, ...opportunity("later", false)], "party");
    expect(output.actions).toEqual(early);
    expect(output.guards.size).toBe(0);
  });

  it("normalizes duplicate phases within the same optional opportunity", () => {
    const early = opportunity("early");
    const repeated = early.map((action): CampaignAction => ({
      ...action,
      id: `copy-${action.id}`,
    }));
    const later = opportunity("later");
    expect(campaignAddonQuestActions([...early, ...repeated, ...later], "leader").actions).toEqual([
      ...early,
      ...later,
    ]);
  });

  it("does not reinterpret source-owned repeats as generated independent opportunities", () => {
    const early = opportunity("early").map((action): CampaignAction => ({
      ...action,
      source: { chapterId: "source", version: "source-version", stepId: "step" },
    }));
    const output = campaignAddonQuestActions([...early, ...opportunity("later")], "leader");
    expect(output.actions).toEqual(early);
    expect(output.guards.size).toBe(0);
  });
});
