import { describe, expect, it } from "vitest";
import { compileCampaignAddon, type CampaignAddonOptions } from "./campaign-addon.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";

function fixture(
  flag: string | null,
  compound = false,
): { plan: CampaignPlan; actions: readonly CampaignAction[]; options: CampaignAddonOptions } {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const guide = parseGuideChapter(
    `step\n.collect 769,4,700,1${flag === null ? "" : `,${flag}`} >> Required meat\n${compound ? ".accept 700\nstep\n.turnin 700" : ""}`,
    reference.id,
    "a".repeat(64),
    70205,
  );
  const action: CampaignAction = {
    id: "required-material",
    legId: "starter",
    title: "Collect four meat",
    instructions: [],
    questChanges: compound
      ? [{ questId: 700, state: "accepted", objectiveIndex: null, title: "Material quest" }]
      : [],
    positions: [],
    source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0]!.id },
    kind: "instructions",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    itemCollections: [
      {
        questId: 700,
        itemId: 769,
        quantity: 4,
        objectiveBitmask: 1,
        confirmationKey: "required-meat",
      },
    ],
  };
  const actions: readonly CampaignAction[] = compound
    ? [
        action,
        {
          ...action,
          id: "hand-in",
          title: "Hand in material quest",
          questChanges: [
            { questId: 700, state: "rewarded", objectiveIndex: null, title: "Material quest" },
          ],
          source: { ...action.source!, stepId: guide.steps[1]!.id },
          itemCollections: [],
        },
      ]
    : [action];
  const plan: CampaignPlan = {
    race: "human",
    leaderClass: "warrior",
    release: "material-control",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "starter",
        title: "Materials",
        kind: "starter",
        from: 1,
        to: 10,
        actionIds: actions.map((entry) => entry.id),
        questIds: [700],
        unresolvedQuestIds: [],
        stopId: null,
      },
    ],
  };
  return {
    plan,
    actions: plan.actions,
    options: {
      version: "0.2.0-local-check",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: [{ reference, guide }],
    },
  };
}

describe("required material step progression", () => {
  it("makes an extracted checkbox-hidden stock target blocking without changing the capture", () => {
    const value = fixture("1");
    const before = JSON.stringify(value);
    const artifact = compileCampaignAddon(value.plan, value.actions, value.options);
    for (const document of artifact.documents) {
      expect(document.content).toContain(".collect 769,4,700,1 >> Required meat");
      expect(document.content).not.toContain(".collect 769,4,700,1,1");
    }
    expect(JSON.stringify(value)).toBe(before);
    expect(value.options.nativeSources![0]!.guide.steps[0]!.directives[0]!.arguments).toBe(
      "769,4,700,1,1",
    );
  });

  it.each([null, "0"])("preserves an already blocking collection (%s)", (flag) => {
    const value = fixture(flag);
    const artifact = compileCampaignAddon(value.plan, value.actions, value.options);
    for (const document of artifact.documents)
      expect(document.content).toContain(
        `.collect 769,4,700,1${flag === null ? "" : ",0"} >> Required meat`,
      );
  });

  it("preserves the captured display flag inside an existing compound quest step", () => {
    const value = fixture("1", true);
    const artifact = compileCampaignAddon(value.plan, value.actions, value.options);
    for (const document of artifact.documents) {
      expect(document.content).toContain(".collect 769,4,700,1,1 >> Required meat");
      expect(document.content).toContain(".accept 700");
    }
  });
});
