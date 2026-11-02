import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import type {
  CampaignAction,
  CampaignPlan,
  CampaignQuestChange,
  CampaignSource,
} from "./campaign.js";
import { attachCampaignSourceBookmarkAliases } from "./campaign-source-bookmarks.js";
import { prepareCampaignPlan } from "./campaign-preparation.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";

const prefix = "start-116-116-source-step-";

function phase(
  questId: number,
  state: CampaignQuestChange["state"] = "objectives-complete",
  objectiveIndex: number | null = state === "objectives-complete" ? 1 : null,
): CampaignQuestChange {
  return { questId, state, objectiveIndex, title: `Quest ${questId}` };
}

function fixture(
  body = "step\n.complete 52,1\n.complete 52,2\nstep\n.complete 52,1\n.complete 52,2",
  changes: readonly CampaignQuestChange[] = [phase(52), phase(52, "objectives-complete", 2)],
): { readonly plan: CampaignPlan; readonly sources: readonly CampaignSource[] } {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const guide = parseGuideChapter(body, reference.id, "a".repeat(64), 70205);
  const action: CampaignAction = {
    id: `${prefix}0001`,
    legId: "start-116",
    title: "Current quest work",
    instructions: ["Complete the selected quest objectives."],
    positions: [],
    source: { chapterId: guide.chapterId, version: guide.version, stepId: "source-step-0001" },
    kind: "quests",
    questChanges: changes,
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
  return {
    sources: [{ reference, guide }],
    plan: {
      release: "bookmark-test",
      race: "human",
      leaderClass: null,
      targetBuild: 70205,
      actions: [action],
      legs: [
        {
          id: action.legId,
          title: "Elwynn Forest",
          kind: "starter",
          from: 6,
          to: 11,
          stopId: null,
          questIds: [...new Set(changes.map((change) => change.questId))],
          unresolvedQuestIds: [],
          actionIds: [action.id],
        },
      ],
      rewardFacts: [],
    },
  };
}

describe("source bookmark compatibility", () => {
  it("redirects a deduplicated source step only when every selected phase is in one current step", () => {
    const { plan, sources } = fixture();
    const next = attachCampaignSourceBookmarkAliases(plan, sources);
    expect(next.bookmarkAliases?.[`${prefix}0002`]).toBe(`${prefix}0001`);
    expect(plan.bookmarkAliases).toBeUndefined();
    expect(next.actions).toBe(plan.actions);
    expect(next.legs).toBe(plan.legs);
    expect(next.rewardFacts).toBe(plan.rewardFacts);
    const { bookmarkAliases: ignored, ...rest } = next;
    expect(ignored).toBeDefined();
    expect(rest).toEqual(plan);
    expect(attachCampaignSourceBookmarkAliases(next, sources)).toBe(next);
  });

  it("restores a before-deferred fragment after the original NPC step can remain whole", () => {
    const { plan, sources } = fixture("step\n.turnin 62\n.accept 76\n.turnin 40", [
      phase(62, "rewarded"),
      phase(76, "accepted"),
      phase(40, "rewarded"),
    ]);
    expect(
      attachCampaignSourceBookmarkAliases(plan, sources).bookmarkAliases?.[
        `${prefix}0001-before-deferred-40`
      ],
    ).toBe(`${prefix}0001`);
  });

  it("restores separately deferred pickups when their current pickup step is shared", () => {
    const { plan, sources } = fixture("step\n.accept 40\n.accept 76", [
      phase(40, "accepted"),
      phase(76, "accepted"),
    ]);
    const next = attachCampaignSourceBookmarkAliases(plan, sources);
    for (const id of [40, 76])
      expect(next.bookmarkAliases?.[`${prefix}0001-deferred-${id}`]).toBe(`${prefix}0001`);
  });

  it("does not invent a split fragment across an objective-completion boundary", () => {
    const { plan, sources } = fixture("step\n.complete 52,1\n.turnin 62\n.turnin 40", [
      phase(52),
      phase(62, "rewarded"),
      phase(40, "rewarded"),
    ]);
    expect(attachCampaignSourceBookmarkAliases(plan, sources)).toBe(plan);
  });

  it("leaves an old source link unresolved when its current phases occur in reverse order", () => {
    const { plan, sources } = fixture(undefined, [phase(52, "objectives-complete", 2), phase(52)]);
    expect(
      attachCampaignSourceBookmarkAliases(plan, sources).bookmarkAliases?.[`${prefix}0002`],
    ).toBeUndefined();
  });

  it("does not choose between ambiguous owners or combine separate steps into one redirect", () => {
    const { plan, sources } = fixture();
    const action = plan.actions[0]!;
    const ambiguous = { ...plan, actions: [action, { ...action, id: "another-owner" }] };
    expect(attachCampaignSourceBookmarkAliases(ambiguous, sources)).toBe(ambiguous);
    const split = {
      ...plan,
      actions: [
        { ...action, questChanges: [phase(52)] },
        { ...action, id: "second-objective", questChanges: [phase(52, "objectives-complete", 2)] },
      ],
    };
    expect(attachCampaignSourceBookmarkAliases(split, sources)).toBe(split);
  });

  it("preserves explicit aliases and current action identities", () => {
    const { plan, sources } = fixture();
    const oldId = `${prefix}0002`;
    const explicit = { ...plan, bookmarkAliases: { [oldId]: "existing-destination" } };
    expect(attachCampaignSourceBookmarkAliases(explicit, sources)).toBe(explicit);
    const current = {
      ...plan,
      actions: [...plan.actions, { ...plan.actions[0]!, id: oldId, questChanges: [phase(999)] }],
    };
    expect(attachCampaignSourceBookmarkAliases(current, sources)).toBe(current);
  });

  it("does not guess a class-dependent action or a potentially excluding season gate", () => {
    for (const body of [
      "step\n.complete 52,1\nstep\n.complete 52,1 << Mage",
      "step\n.complete 52,1\nstep\n#season 2 << Mage\n.complete 52,1",
    ]) {
      const { plan, sources } = fixture(body, [phase(52)]);
      expect(attachCampaignSourceBookmarkAliases(plan, sources)).toBe(plan);
    }
  });

  it("does not cross edition, build or leg boundaries to find a phase owner", () => {
    const { plan, sources } = fixture();
    const wrongBuild = sources.map((source) => ({
      ...source,
      guide: { ...source.guide, targetBuild: 70450 },
    }));
    expect(attachCampaignSourceBookmarkAliases(plan, wrongBuild)).toBe(plan);
    const wrongFaction = sources.map((source) => ({
      ...source,
      reference: { ...source.reference, condition: "Horde" },
    }));
    expect(attachCampaignSourceBookmarkAliases(plan, wrongFaction)).toBe(plan);
    const otherLeg = {
      ...plan,
      actions: plan.actions.map((action) => ({ ...action, legId: "another-leg" })),
    };
    expect(attachCampaignSourceBookmarkAliases(otherLeg, sources)).toBe(otherLeg);
  });

  it("keeps malformed objective indices unresolved", () => {
    const { plan, sources } = fixture("step\n.complete 52,1\nstep\n.complete 52,garbled", [
      phase(52),
    ]);
    expect(attachCampaignSourceBookmarkAliases(plan, sources)).toBe(plan);
  });

  it("uses the canonical dungeon tags without enabling an excluded outdoor alternative", () => {
    for (const [tag, expected] of [
      ["DM", `${prefix}0001`],
      ["!DM", undefined],
    ] as const) {
      const { plan, sources } = fixture(
        `step\n.complete 52,1\nstep\n.dungeon ${tag}\n.complete 52,1`,
        [phase(52)],
      );
      expect(
        attachCampaignSourceBookmarkAliases(plan, sources).bookmarkAliases?.[`${prefix}0002`],
      ).toBe(expected);
    }
  });

  it("supports the explicit source namespaces of outdoor preparation blocks", () => {
    const { plan, sources } = fixture();
    const legId = "early-party-kills";
    const outdoor: CampaignPlan = {
      ...plan,
      actions: plan.actions.map((action) => ({
        ...action,
        legId,
        id: `${legId}-116-source-step-0001`,
      })),
      legs: plan.legs.map((leg) => ({
        ...leg,
        id: legId,
        kind: "preparation",
        actionIds: [`${legId}-116-source-step-0001`],
      })),
    };
    expect(
      attachCampaignSourceBookmarkAliases(outdoor, sources).bookmarkAliases?.[
        `${legId}-116-source-step-0002`
      ],
    ).toBe(`${legId}-116-source-step-0001`);
  });

  it("applies redirects in the canonical preparer used by both readers", () => {
    const work =
      ".complete 52,1 >> Young Forest Bear slain (8)\n.mob Young Forest Bear\n.complete 52,2 >> Prowler slain (5)\n.mob Prowler";
    const { plan, sources } = fixture(`step\n${work}\nstep\n${work}`);
    const prepared = prepareCampaignPlan(plan, sources, {
      starters: { entries: [], routes: [] },
      rewardFacts: [
        {
          questId: 52,
          fullXp: 100,
          questLevel: 7,
          minimumLevel: 1,
          xpByLevel: [],
          sourceUrl: "https://example.test/quest=52",
          capturedAt: "2026-11-01T00:00:00.000Z",
          status: "available",
        },
      ],
      rewardRevision: "fixture",
      rewardBuild: 70205,
      rewardNotice: null,
      combat: null,
    });
    expect(prepared.bookmarkAliases?.[`${prefix}0002`]).toBe(`${prefix}0001`);
  });

  it("preserves one-time XP when a personal quest also appears in the later party route", () => {
    const work = ".accept 4762\n.complete 4762,1\n.turnin 4762";
    const { plan, sources } = fixture(`step\n${work}\nstep\n${work}`, [
      phase(4762, "accepted"),
      phase(4762),
      phase(4762, "rewarded"),
    ]);
    const partyId = "party-water";
    const repeated: CampaignPlan = {
      ...plan,
      actions: [
        ...plan.actions,
        { ...plan.actions[0]!, id: partyId, legId: partyId, leaderOnly: false },
      ],
      legs: [
        ...plan.legs,
        { ...plan.legs[0]!, id: partyId, kind: "preparation", actionIds: [partyId] },
      ],
      rewardFacts: [
        {
          questId: 4762,
          fullXp: 800,
          questLevel: 15,
          minimumLevel: 11,
          xpByLevel: [],
          sourceUrl: "https://example.test/quest=4762",
          capturedAt: "2026-11-01T00:00:00.000Z",
          status: "available",
        },
      ],
    };
    const base = emptyPremadeProgress();
    const progress = {
      ...base,
      members: base.members.map((member) => ({
        ...member,
        level: 15,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    const next = attachCampaignSourceBookmarkAliases(repeated, sources);
    expect(next).not.toBe(repeated);
    expect(forecastCampaignXp(next, progress)).toEqual(forecastCampaignXp(repeated, progress));
    const forecast = forecastCampaignXp(next, progress);
    for (let player = 0; player < 5; player++) {
      const rewards = forecast
        .flatMap((section) => section.members[player]!.rewards)
        .filter((reward) => reward.questId === 4762);
      expect(rewards).toHaveLength(1);
      expect(rewards[0]!.xp).toBe(800);
    }
  });
});
