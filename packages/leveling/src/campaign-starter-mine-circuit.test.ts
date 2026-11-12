import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { proposeCampaignStarterMineCircuit } from "./campaign-starter-mine-circuit.js";

function fixture(): { plan: CampaignPlan; sources: readonly CampaignSource[] } {
  const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 116)!;
  const parsed = parseGuideChapter(
    [
      "step\n.goto 1429,42,65\n.accept 47\n.accept 60\n.accept 62",
      "step\n.goto 1429,34,84\n.accept 85\n.accept 88",
      "step\n.isNotOnQuest 91775\n.goto 1429,40,80\n.complete 60,1\n.complete 47,1\n.mob Kobold Tunneler",
      "step\n.goto 1429,39,81\n.complete 62,1",
      "step\n.goto 1429,42,65\n.turnin 47\n.accept 40",
      "step\n.goto 1429,43,65\n.turnin 62\n.accept 76\n.turnin 40\n.accept 35\n.target Marshal Dughan",
      "step\n.goto 1429,42,66\n.turnin 60\n.accept 61\n.turnin 107\n.target William Pestle",
    ].join("\n"),
    reference.id,
    "a".repeat(64),
    70205,
  );
  const ids = ["0001", "0050", "0054", "0073", "0085", "0086", "0096"];
  const guide = {
    ...parsed,
    steps: parsed.steps.map((step, index) => ({ ...step, id: `source-step-${ids[index]}` })),
  };
  const actions: CampaignAction[] = guide.steps.map((step) => ({
    id: `start-116-116-${step.id}`,
    legId: "start-116",
    title: step.id,
    instructions: ["Follow the captured route."],
    questChanges: step.directives.flatMap((directive) => {
      const state =
        directive.tag === ".accept"
          ? "accepted"
          : directive.tag === ".turnin"
            ? "rewarded"
            : directive.tag === ".complete"
              ? "objectives-complete"
              : null;
      return state && directive.questId
        ? [
            {
              questId: directive.questId,
              state,
              title: `Quest ${directive.questId}`,
              objectiveIndex: state === "objectives-complete" ? 1 : null,
            },
          ]
        : [];
    }),
    source: campaignActionSource(guide, step, step.directives),
    positions: step.directives.flatMap((row) =>
      row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
    ),
    kind: "quests",
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  }));
  return {
    sources: [{ reference, guide }],
    plan: {
      release: "mine-circuit-fixture",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions,
      legs: [
        {
          id: "start-116",
          title: "Elwynn Forest",
          kind: "starter",
          from: 4,
          to: 10,
          stopId: null,
          questIds: [47, 60, 62, 85, 88, 40, 76, 35, 61, 107],
          unresolvedQuestIds: [],
          actionIds: actions.map((action) => action.id),
        },
      ],
    },
  };
}

describe("reviewed starter mine circuit", () => {
  it("finishes already-accepted mine work and NPC returns before the farm pickups without losing a phase", () => {
    const { plan, sources } = fixture();
    const original = structuredClone(plan);
    const result = proposeCampaignStarterMineCircuit(plan, sources)!;
    expect(result).not.toBeNull();
    expect(result.actions.map((action) => action.id)).toEqual([
      plan.actions[0]!.id,
      plan.actions[3]!.id,
      plan.actions[2]!.id,
      `${plan.actions[4]!.id}-dust-return`,
      `${plan.actions[5]!.id}-mine-return`,
      `${plan.actions[6]!.id}-candles-return`,
      plan.actions[1]!.id,
      plan.actions[4]!.id,
      plan.actions[5]!.id,
      plan.actions[6]!.id,
    ]);
    expect(
      result.actions
        .flatMap((action) => action.questChanges)
        .map((change) => JSON.stringify(change))
        .sort(),
    ).toEqual(
      plan.actions
        .flatMap((action) => action.questChanges)
        .map((change) => JSON.stringify(change))
        .sort(),
    );
    const native = campaignNativeInstructions(result, sources);
    for (const action of result.actions) {
      expect(action.source).toEqual(
        plan.actions.find((row) => row.source?.stepId === action.source?.stepId)!.source,
      );
      expect(
        native(action)!.directives.filter((row) =>
          [".accept", ".complete", ".turnin"].includes(row.tag),
        ),
      ).toHaveLength(action.questChanges.length);
    }
    expect(result.legs[0]!.actionIds).toEqual(result.actions.map((action) => action.id));
    expect(plan).toEqual(original);
    expect(proposeCampaignStarterMineCircuit(result, sources)).toBeNull();
  });

  it("places the mine circuit before the farm's associated level reminder", () => {
    const { plan, sources } = fixture();
    const gate: CampaignAction = {
      ...plan.actions[1]!,
      id: "farm-level",
      source: null,
      kind: "xp-check",
      targetLevel: 6,
      pickupQuestId: 88,
      questChanges: [],
    };
    const result = proposeCampaignStarterMineCircuit(
      { ...plan, actions: [plan.actions[0]!, gate, ...plan.actions.slice(1)] },
      sources,
    )!;
    expect(result.actions.findIndex((action) => action.id.endsWith("candles-return"))).toBeLessThan(
      result.actions.findIndex((action) => action.id === gate.id),
    );
  });

  it.each([
    "other-race",
    "missing-pickup",
    "missing-work",
    "late-acceptance",
    "different-leg",
    "party-owner",
    "unknown-utility",
    "mixed-items",
  ])("keeps an unsupported circuit unchanged: %s", (reason) => {
    const input = fixture();
    let plan = input.plan;
    if (reason === "other-race") plan = { ...plan, race: "dwarf" };
    if (reason === "missing-pickup")
      plan = { ...plan, actions: plan.actions.filter((_, index) => index !== 1) };
    if (reason === "missing-work")
      plan = { ...plan, actions: plan.actions.filter((_, index) => index !== 2) };
    if (reason === "late-acceptance")
      plan = { ...plan, actions: [...plan.actions.slice(1), plan.actions[0]!] };
    if (reason === "different-leg" || reason === "party-owner" || reason === "mixed-items")
      plan = {
        ...plan,
        actions: plan.actions.map((action, index) =>
          index !== 2
            ? action
            : {
                ...action,
                ...(reason === "different-leg"
                  ? { legId: "other" }
                  : reason === "party-owner"
                    ? { leaderOnly: false }
                    : {
                        itemCollections: [
                          {
                            questId: 86,
                            itemId: 769,
                            quantity: 4,
                            objectiveBitmask: 1,
                            confirmationKey: "meat",
                          },
                        ],
                      }),
              },
        ),
      };
    const sources =
      reason !== "unknown-utility"
        ? input.sources
        : input.sources.map((source) => ({
            ...source,
            guide: {
              ...source.guide,
              steps: source.guide.steps.map((step) =>
                step.id !== "source-step-0054"
                  ? step
                  : {
                      ...step,
                      directives: [
                        ...step.directives,
                        { ...step.directives[0]!, tag: ".use", arguments: "123" },
                      ],
                    },
              ),
            },
          }));
    expect(proposeCampaignStarterMineCircuit(plan, sources)).toBeNull();
  });
});
