import { describe, expect, it } from "vitest";

import { compileCampaignAddon, type CampaignAddonOptions } from "./campaign-addon.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";

const options: CampaignAddonOptions = {
  version: "0.2.0-review.1",
  runtimeBuild: 70450,
  interfaceVersion: 16001,
  restedXpVersion: "v4.11.26",
};

function action(
  id: string,
  legId: string,
  leaderOnly: boolean,
  questId: number,
  state: "accepted" | "objectives-complete" | "rewarded",
): CampaignAction {
  return {
    id,
    legId,
    title: `${state} Quest ${questId}`,
    instructions: [`Review ${state} for Quest ${questId}.`],
    questChanges: [
      {
        questId,
        title: `Quest ${questId}`,
        state,
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      },
    ],
    positions:
      state === "accepted"
        ? [
            {
              sourceLine: 1,
              position: {
                zone: "Elwynn Forest",
                floor: null,
                x: 42.125,
                y: 64.5,
                space: "map-percent",
              },
            },
          ]
        : [],
    source: null,
    kind: "quests",
    leaderOnly,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}

function fixture(): { readonly plan: CampaignPlan; readonly actions: readonly CampaignAction[] } {
  const leader = [
    action("leader-accept", "start", true, 1, "accepted"),
    action("leader-complete", "start", true, 1, "objectives-complete"),
    action("leader-turnin", "start", true, 1, "rewarded"),
  ];
  const shared = [
    action("party-accept", "shared", false, 2, "accepted"),
    action("party-complete", "shared", false, 2, "objectives-complete"),
    action("party-turnin", "shared", false, 2, "rewarded"),
    {
      ...action("party-xp", "shared", false, 3, "accepted"),
      kind: "xp-check" as const,
      instructions: [
        "Wait for all five.\n.accept 999 << Rogue -- never parse this as a directive.",
      ],
      questChanges: [],
      targetLevel: 20,
      targetCurrentXp: 1000,
      xpOptional: true,
    },
  ];
  const actions = [...leader, ...shared];
  return {
    actions,
    plan: {
      release: "campaign-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions,
      legs: [
        {
          id: "start",
          title: "Northshire",
          from: 1,
          to: 6,
          kind: "starter",
          actionIds: leader.map((entry) => entry.id),
          questIds: [1],
          unresolvedQuestIds: [],
          stopId: null,
        },
        {
          id: "shared",
          title: "Elwynn Forest",
          from: 6,
          to: 20,
          kind: "xp-bridge",
          actionIds: shared.map((entry) => entry.id),
          questIds: [2],
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
    },
  };
}

describe("full campaign RestedXP compiler", () => {
  it("chains a different member's personal starter into shared work without copying the leader's starter", () => {
    const { plan, actions } = fixture();
    const personal = [
      action("priest-accept", "dwarf-start", true, 600, "accepted"),
      action("priest-complete", "dwarf-start", true, 600, "objectives-complete"),
      action("priest-turnin", "dwarf-start", true, 600, "rewarded"),
    ];
    const memberPlan: CampaignPlan = {
      ...plan,
      starters: {
        entries: personal.map((entry) => ({ action: entry, activities: [] })),
        routes: [
          {
            race: "dwarf",
            classSlug: "priest",
            actionIndexes: [0, 1, 2],
            legs: [
              {
                ...plan.legs[0]!,
                id: "dwarf-start",
                title: "Coldridge",
                actionIds: personal.map((entry) => entry.id),
                questIds: [600],
              },
            ],
          },
        ],
      },
    };
    const addon = compileCampaignAddon(memberPlan, actions, {
      ...options,
      partyStarter: { race: "dwarf", classSlug: "priest" },
    });
    const party = addon.documents.filter((document) => document.role === "party");
    expect(party).toHaveLength(2);
    expect(party[0]!.content).toContain("<< Alliance Forever Dwarf Priest");
    expect(party[0]!.content).toContain(`#next ${party[1]!.name}`);
    expect(party[0]!.content).toContain("#label kfc-party-personal-priest-accept");
    expect(party[0]!.content).toContain(".accept 600");
    expect(party[1]!.content).toContain(".accept 2");
    expect(party.map((document) => document.content).join("\n")).not.toContain(".accept 1 ");
    expect(addon.documents.find((document) => document.role === "leader")!.content).toContain(
      "<< Alliance Forever Human Warrior",
    );
    expect(addon.readme).toContain("Dwarf Priest member's own starter");
    expect(() =>
      compileCampaignAddon(plan, actions, {
        ...options,
        partyStarter: { race: "dwarf", classSlug: "priest" },
      }),
    ).toThrow("personal starter is unavailable");
  });

  it("uses the leader-equivalent personal branch when the member has the same race/class", () => {
    const { plan, actions } = fixture();
    const addon = compileCampaignAddon(plan, actions, {
      ...options,
      partyStarter: { race: "human", classSlug: "warrior" },
    });
    const party = addon.documents.filter((document) => document.role === "party");
    expect(party).toHaveLength(2);
    expect(party[0]!.content).toContain(".accept 1");
    expect(party[0]!.content).not.toContain("Leader-only step");
    expect(party[0]!.actionIds).toEqual(
      actions.filter((entry) => entry.leaderOnly).map((entry) => `party-personal-${entry.id}`),
    );
    expect(party[1]!.content).toContain(".accept 2");
  });
  it("binds passive prerequisite capture to the disputed quest without adding prerequisite actions", () => {
    const { plan, actions } = fixture();
    const extra = [
      {
        ...action("gate-accept", "shared", false, 92744, "accepted"),
        sourceGateConflictQuestIds: [92744],
      },
      action("gate-objective", "shared", false, 92744, "objectives-complete"),
      action("gate-reward", "shared", false, 92744, "rewarded"),
    ];
    const artifact = compileCampaignAddon(plan, [...actions, ...extra], options);
    expect(artifact.lua).toContain("namespace.questValidationPrerequisites = {");
    expect(artifact.lua).toContain("[92744] = { 92742 },");
    expect(artifact.lua).not.toContain(".accept 92742");
  });
  it("labels guaranteed bundles without generating invented quest or location directives", () => {
    const { plan, actions } = fixture();
    const planning: CampaignAction = {
      ...actions[0]!,
      id: "guaranteed-bundle",
      legId: "shared",
      leaderOnly: false,
      kind: "instructions",
      questChanges: [],
      positions: [],
      instructions: ["Four guaranteed quests; IDs pending."],
      bundleId: "drowned-city",
    };
    const artifact = compileCampaignAddon(plan, [...actions, planning], options);
    expect(artifact.lua).toContain("PLANNING ONLY: four owner-confirmed faction quests");
    expect(artifact.lua.match(/\.accept 2 /g)).toHaveLength(2);
    expect(artifact.lua).not.toContain(".accept 0");
    expect(artifact.lua).not.toContain(".turnin drowned-city");
    expect(() =>
      compileCampaignAddon(
        plan,
        [...actions, { ...planning, positions: actions[0]!.positions }],
        options,
      ),
    ).toThrow("cannot emit quest or location");
  });
  it("emits deterministic leader and party chains from the same campaign actions", () => {
    const { plan, actions } = fixture();
    const first = compileCampaignAddon(plan, actions, options);
    const second = compileCampaignAddon(plan, actions, options);

    expect(first).toEqual(second);
    expect(first.documents).toHaveLength(3);
    for (const document of first.documents) {
      expect(first.lua).toContain(document.content);
      expect(document.content).toContain(`#name ${document.name}\n`);
      expect(document.content).toContain(`#group ${document.group}\n`);
    }
    expect(
      first.documents
        .filter((document) => document.role === "party")
        .flatMap((document) => document.actionIds),
    ).toEqual(sharedActionIds(actions));
    expect(first.guides.map((guide) => [guide.role, guide.names.length])).toEqual([
      ["leader", 2],
      ["party", 1],
    ]);
    expect(first.lua).toContain("#forever");
    expect(first.lua).toContain("namespace.sourceBuild = 70205");
    expect(first.lua).toContain("namespace.runtimeBuild = 70450");
    expect(first.lua).toContain('["party-xp"] = true');
    expect(first.lua.match(/\.accept 1 /g)).toHaveLength(1);
    expect(first.lua.match(/\.accept 2 /g)).toHaveLength(2);
    expect(first.lua.match(/\.xp 20\+1000/g)).toHaveLength(2);
    expect(first.lua).not.toContain("/kfcguide grind party-xp");
    expect(first.lua.match(/#label kfc-party-xp-party-ready/g)).toHaveLength(2);
    expect(first.lua).toContain("Is everyone level 20 with at least 1,000 XP into that level?");
    expect(first.nativePolicy).toBe("normalized-v1");
    expect(first.lua).not.toContain("\n.accept 999");
    expect(first.lua).not.toContain("<< Rogue");
    expect(first.toc).toContain("## Interface: 16001");
    expect(first.toc).toContain("GrindObserver.lua");
    expect(first.readme).toContain("/kfcguide grind <checkpoint-id>");
    expect(first.readme).toContain("Other party members finish their own normal personal starter");
  });

  it("rejects an orphan lifecycle instead of producing a broken in-game guide", () => {
    const { plan, actions } = fixture();
    const broken = actions.filter((entry) => entry.id !== "party-accept");
    expect(() => compileCampaignAddon(plan, broken, options)).toThrow("before its pickup");

    expect(() =>
      compileCampaignAddon(
        plan,
        actions.filter((entry) => entry.id !== "party-turnin"),
        options,
      ),
    ).toThrow("leaves quest 2 without a hand-in");

    const repeated = [
      action("accept-again", "shared", false, 2, "accepted"),
      action("complete-again", "shared", false, 2, "objectives-complete"),
      action("turnin-again", "shared", false, 2, "rewarded"),
    ];
    const normalized = compileCampaignAddon(plan, [...actions, ...repeated], options);
    expect(normalized.lua.match(/\.accept 2 /g)).toHaveLength(2);
    for (const guide of normalized.guides) {
      expect(guide.requestedActionIds).toContain("accept-again");
      expect(guide.actionIds).not.toContain("accept-again");
      expect(guide.normalizations).toEqual(
        repeated.map((entry) => ({
          actionId: entry.id,
          reason: "duplicate-one-time-quest-phase",
          removedQuestChanges: entry.questChanges,
        })),
      );
    }

    expect(() =>
      compileCampaignAddon(
        plan,
        [...actions, action("accept-again", "shared", false, 2, "accepted")],
        options,
      ),
    ).toThrow("repeats quest 2 without a matching hand-in");

    expect(() =>
      compileCampaignAddon(
        plan,
        [...actions, action("complete-after-reward", "shared", false, 2, "objectives-complete")],
        options,
      ),
    ).toThrow("changes rewarded quest 2 back to objectives-complete");
  });

  it("rejects unverified route actions and mismatched package legs", () => {
    const { plan, actions } = fixture();
    expect(() =>
      compileCampaignAddon(
        plan,
        actions.map((entry, index) =>
          index === 0 ? { ...entry, kind: "unverified" as const } : entry,
        ),
        options,
      ),
    ).toThrow("cannot enter the addon package");
    expect(() =>
      compileCampaignAddon(plan, [{ ...actions[0]!, legId: "missing" }], options),
    ).toThrow("no package leg");
  });
});

function sharedActionIds(actions: readonly CampaignAction[]): readonly string[] {
  return actions.filter((entry) => !entry.leaderOnly).map((entry) => entry.id);
}
