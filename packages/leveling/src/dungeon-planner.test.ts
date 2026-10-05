import { describe, expect, it } from "vitest";
import {
  DUNGEON_FACTS,
  DUNGEON_REFERENCE,
  DUNGEON_QUESTS,
  DUNGEON_VISITS,
} from "./dungeon-catalog.js";
import {
  emptyDungeonPlan,
  evaluateDungeonGate,
  gateQuestIds,
  validateDungeonGraph,
  type DungeonQuest,
  type DungeonGate,
} from "./dungeon-model.js";
import {
  attachDungeonPreparation,
  auditDungeonCoverage,
  compareDungeonPlan,
  dungeonPrerequisiteClosure,
  dungeonRewardQuestIds,
  dungeonQuestCompatibility,
  getDungeonQuest,
  type DungeonComparisonInput,
} from "./dungeon-planner.js";
import { createCharacterProfile } from "./profile.js";
import { getGuideStepView, parseGuideChapter } from "./guide-archive.js";

function comparison(overrides: Partial<DungeonComparisonInput> = {}): DungeonComparisonInput {
  return {
    visit: DUNGEON_VISITS.find((visit) => visit.id === "wailing-caverns")!,
    profile: { ...createCharacterProfile("horde", "orc"), classSlug: "warrior", level: 20 },
    plan: { ...emptyDungeonPlan(), confirmations: { "wailing-caverns-quest-log-space": true } },
    questIds: [914],
    mode: "extra-chain",
    segments: [{ id: "one-hub-bundle", minutes: { minimum: 10, maximum: 10 }, retained: false }],
    useReferenceXp: true,
    killXp: null,
    outdoorXpPerHour: { minimum: 20_000, maximum: 20_000 },
    omittedOutdoorXp: null,
    omittedOutdoorMinutes: null,
    ...overrides,
  };
}
describe("dungeon identity and reference graph", () => {
  it("covers the supplemental audit and all current-guide quest identities without fake IDs", () => {
    expect(DUNGEON_FACTS.associations).toHaveLength(94);
    expect(new Set(DUNGEON_FACTS.associations.map((row) => row.questId)).size).toBe(92);
    expect(DUNGEON_REFERENCE.associations).toHaveLength(228);
    expect(DUNGEON_VISITS.find((visit) => visit.id === "upper-blackrock")!.questIds).toContain(
      4768,
    );
    expect(DUNGEON_REFERENCE.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const row of DUNGEON_REFERENCE.associations)
      expect(DUNGEON_VISITS.some((visit) => visit.questIds.includes(row.questId))).toBe(true);
    expect(DUNGEON_QUESTS.every((quest) => quest.id < 500_000)).toBe(true);
    expect(() => validateDungeonGraph(DUNGEON_QUESTS)).not.toThrow();
  });
  it("removes self/future prerequisites from the explosives chain", () => {
    const closure = dungeonPrerequisiteClosure([92753]).map((quest) => quest.id);
    expect(closure).toEqual([92742, 92744, 92745, 92747, 92748, 92749, 92750, 92751, 92752, 92753]);
    expect(closure).not.toContain(92819);
    expect(gateQuestIds(getDungeonQuest(92819)!.gate)).toEqual([92753]);
    expect(getDungeonQuest(92748)!.referenceXp).toBeNull();
  });
  it("uses canonical uppercase tags for the source's dungeon branch matcher", () => {
    expect(DUNGEON_VISITS.find((visit) => visit.id === "stockade")!.sourceTag).toBe("STOCKADES");
    expect(DUNGEON_VISITS.find((visit) => visit.id === "gnomeregan")!.sourceTag).toBe("GNOMER");
    expect(DUNGEON_VISITS.find((visit) => visit.id === "uldaman")!.sourceTag).toBe("ULDA");
    for (const visit of DUNGEON_VISITS)
      if (visit.sourceTag) expect(visit.sourceTag).toBe(visit.sourceTag.toUpperCase());
  });
  it("distinguishes accepted transport gates, indoor item starts and later reward stages", () => {
    expect(getDungeonQuest(2842)!.gate).toEqual({
      kind: "quest",
      questId: 2841,
      state: "accepted",
    });
    expect(getDungeonQuest(6981)!.pickupStage).toBe("inside");
    expect(getDungeonQuest(6981)!.position).toBeNull();
    expect(getDungeonQuest(1654)!.objectiveStage).toBe("multiple-visits");
    expect(getDungeonQuest(1806)!.pickupStage).toBe("after");
    expect(getDungeonQuest(2930)!.gate.kind).toBe("confirmation");
  });
  it("keeps fixed and mutually exclusive rewards separate", () => {
    expect(getDungeonQuest(865)!.rewards.fixed.map((item) => item.id)).toEqual([5342, 5343]);
    expect(getDungeonQuest(865)!.rewards.choices).toEqual([]);
    expect(getDungeonQuest(96393)!.rewards.choices.map((item) => item.id)).toEqual([
      279894, 279895, 279896,
    ]);
  });
  it("restricts class/race and faction variants without treating unknown as eligible", () => {
    expect(dungeonQuestCompatibility(getDungeonQuest(1806)!, createCharacterProfile())).toBe(
      "unknown",
    );
    expect(
      dungeonQuestCompatibility(getDungeonQuest(1806)!, {
        ...createCharacterProfile(),
        classSlug: "warrior",
      }),
    ).toBe("exclude");
    expect(dungeonQuestCompatibility(getDungeonQuest(914)!, createCharacterProfile())).toBe(
      "exclude",
    );
  });
  it("keeps wing scope and beta availability separate from catalog presence", () => {
    const graveyard = DUNGEON_VISITS.find((visit) => visit.id === "sm-graveyard")!;
    const library = DUNGEON_VISITS.find((visit) => visit.id === "sm-library")!;
    expect(graveyard.questIds).not.toContain(1049);
    expect(library.questIds).toContain(1049);
    expect(DUNGEON_VISITS.find((visit) => visit.id === "dalaran")!.availability).toBe(
      "reference-only",
    );
    expect(DUNGEON_VISITS.find((visit) => visit.id === "upper-blackrock")!.groupSize).toBeNull();
  });
  it("rejects a cycle and missing quest references before publication", () => {
    const quest = getDungeonQuest(914)!;
    expect(() =>
      validateDungeonGraph([
        { ...quest, gate: { kind: "quest", questId: 914, state: "rewarded" } },
      ]),
    ).toThrow("cycle");
    expect(() =>
      validateDungeonGraph([
        { ...quest, gate: { kind: "quest", questId: 999, state: "rewarded" } },
      ]),
    ).toThrow("Missing");
  });
});
describe("explicit prerequisite state", () => {
  const rewarded: DungeonGate = { kind: "quest", questId: 870, state: "rewarded" };
  it("does not confuse completed objectives with a hand-in", () => {
    expect(evaluateDungeonGate(rewarded, emptyDungeonPlan())).toBe("unknown");
    expect(
      evaluateDungeonGate(rewarded, {
        ...emptyDungeonPlan(),
        questStates: { 870: "objectives-complete" },
      }),
    ).toBe("blocked");
    expect(
      evaluateDungeonGate(rewarded, { ...emptyDungeonPlan(), questStates: { 870: "rewarded" } }),
    ).toBe("ready");
  });
  it("evaluates AND/OR and missing item/confirmation gates conservatively", () => {
    const item: DungeonGate = { kind: "item", itemId: 123 };
    const plan = { ...emptyDungeonPlan(), questStates: { 870: "rewarded" as const } };
    expect(evaluateDungeonGate({ kind: "all", gates: [rewarded, item] }, plan)).toBe("unknown");
    expect(evaluateDungeonGate({ kind: "any", gates: [rewarded, item] }, plan)).toBe("ready");
    expect(evaluateDungeonGate(item, { ...plan, confirmations: { "item-123": false } })).toBe(
      "blocked",
    );
  });
});
describe("equal-goal and marginal scenario accounting", () => {
  it("uses the exact reference chain total and marginal remainder", () => {
    expect(compareDungeonPlan(comparison()).addedXp).toBe(5585);
    const marginal = compareDungeonPlan(
      comparison({ plan: { ...comparison().plan, retainedQuestIds: [870, 877, 880, 1489, 1490] } }),
    );
    expect(marginal.addedXp).toBe(2200);
    expect(marginal.breakEvenMinutes?.minimum).toBeCloseTo(6.6);
    expect(marginal.decision).toBe("not-for-speed");
  });
  it("deduplicates quests across shared closures and never multiplies per-player XP by five", () => {
    const result = compareDungeonPlan(
      comparison({
        questIds: [914, 914],
        profile: {
          ...comparison().profile,
          party: { size: 5, readiness: "together", tank: "yes", healer: "yes" },
        },
      }),
    );
    expect(result.addedXp).toBe(5585);
    expect(dungeonPrerequisiteClosure([166, 214]).map((quest) => quest.id)).toEqual([
      65, 132, 135, 141, 142, 155, 166, 214,
    ]);
  });
  it("never earns a dungeon reward from an accept-only transport prerequisite", () => {
    const ids = dungeonRewardQuestIds([2843], emptyDungeonPlan());
    expect(ids).not.toContain(2841);
    expect(ids).toContain(2842);
    expect(dungeonRewardQuestIds([2843, 2841], emptyDungeonPlan())).toContain(2841);
  });
  it("never turns missing or unconfirmed current XP into zero", () => {
    expect(compareDungeonPlan(comparison({ useReferenceXp: false })).addedXp).toBeNull();
    expect(compareDungeonPlan(comparison({ useReferenceXp: false })).decision).toBe("unknown");
    const input = comparison({
      questIds: [92753],
      visit: DUNGEON_VISITS.find((visit) => visit.id === "deadmines")!,
      profile: { ...createCharacterProfile(), level: 20, classSlug: "warrior" },
    });
    expect(compareDungeonPlan(input).addedXp).toBeNull();
  });
  it("does not allow later XP to repair an earlier pickup or multi-visit reward", () => {
    expect(
      compareDungeonPlan(comparison({ profile: { ...comparison().profile, level: 5 } })).state,
    ).toBe("blocked");
    expect(
      compareDungeonPlan(
        comparison({
          questIds: [1806],
          profile: { ...createCharacterProfile(), classSlug: "paladin", level: 22 },
        }),
      ).state,
    ).toBe("blocked");
  });
  it("charges shared segments once, excludes retained work and rejects invalid bounds", () => {
    const result = compareDungeonPlan(
      comparison({
        segments: [
          { id: "route-hub", retained: true, minutes: { minimum: 30, maximum: 40 } },
          { id: "incremental", retained: false, minutes: { minimum: 2, maximum: 5 } },
        ],
      }),
    );
    expect(result.minutes).toEqual({ minimum: 2, maximum: 5 });
    expect(() =>
      compareDungeonPlan(
        comparison({
          segments: [
            { id: "duplicate", retained: false, minutes: { minimum: 1, maximum: 2 } },
            { id: "duplicate", retained: false, minutes: { minimum: 1, maximum: 2 } },
          ],
        }),
      ),
    ).toThrow("twice");
    expect(() =>
      compareDungeonPlan(comparison({ outdoorXpPerHour: { minimum: 0, maximum: 10 } })),
    ).toThrow("interval");
  });
  it("does not count a previous dungeon or outside hand-in as part of the same visit", () => {
    const stockade = compareDungeonPlan(
      comparison({
        questIds: [391],
        visit: DUNGEON_VISITS.find((visit) => visit.id === "stockade")!,
        profile: { ...createCharacterProfile(), classSlug: "warrior", level: 30 },
      }),
    );
    expect(stockade.state).toBe("blocked");
    expect(stockade.reasons.some((reason) => reason.includes("different dungeon"))).toBe(true);
    const gnomer = compareDungeonPlan(
      comparison({
        questIds: [2962],
        visit: DUNGEON_VISITS.find((visit) => visit.id === "gnomeregan")!,
        profile: { ...createCharacterProfile(), classSlug: "warrior", level: 30 },
      }),
    );
    expect(gnomer.reasons.some((reason) => reason.includes("return/later visit"))).toBe(true);
  });
  it("shows conditional outcomes and uses existing equal-goal catch-up arithmetic", () => {
    expect(
      compareDungeonPlan(
        comparison({
          segments: [{ id: "scenario", retained: false, minutes: { minimum: 5, maximum: 30 } }],
        }),
      ).decision,
    ).toBe("conditional");
    const whole = compareDungeonPlan(
      comparison({
        mode: "whole-trip",
        killXp: 0,
        omittedOutdoorXp: 10_000,
        omittedOutdoorMinutes: { minimum: 40, maximum: 40 },
      }),
    );
    expect(whole.timeSaved?.minimum).toBeCloseTo(40 - 10 - (60 * (10_000 - 5585)) / 20_000);
    expect(compareDungeonPlan(comparison({ mode: "whole-trip" })).decision).toBe("unknown");
  });
});
describe("source-safe preparation overlay", () => {
  const guide = parseGuideChapter(
    "step\n.goto Westfall,56.4,47.5\n.accept 166 >>Defias\nstep << Horde\n.accept 214 >>Other faction\n",
    "chapter-125-13-15-westfall",
    "a".repeat(64),
    70205,
  );
  const profile = { ...createCharacterProfile(), classSlug: "warrior" as const, level: 20 };
  it("is opt-in, respects applicable source variants and preserves source IDs", () => {
    const views = guide.steps.map((step) => getGuideStepView(step, profile, { dungeons: [] }));
    expect(attachDungeonPreparation(guide, views, profile, emptyDungeonPlan())).toEqual([]);
    const plan = {
      ...emptyDungeonPlan(),
      visits: { deadmines: "planned" as const },
      selectedQuests: { deadmines: [166] },
    };
    const attachments = attachDungeonPreparation(guide, views, profile, plan);
    expect(attachments.find((entry) => entry.questId === 166)?.action).toBe("source-present");
    expect(guide.steps[0]!.id).toBe("source-step-0001");
    expect(attachments.every((entry) => entry.stepId !== "source-step-0002")).toBe(true);
  });
  it("audits source presence without claiming every profile follows those branches", () => {
    const row = auditDungeonCoverage([guide]).find((entry) => entry.questId === 166)!;
    expect(row).toMatchObject({ accept: 1, turnin: 0, status: "overlay-needed" });
    expect(auditDungeonCoverage([guide]).find((entry) => entry.questId === 6981)?.status).toBe(
      "inside-start",
    );
  });
  it("has no duplicate or unknown normalized quest identities", () => {
    const ids = new Set(DUNGEON_QUESTS.map((quest) => quest.id));
    expect(ids.size).toBe(DUNGEON_QUESTS.length);
    const quests: readonly DungeonQuest[] = dungeonPrerequisiteClosure([166, 914]);
    expect(quests.every((quest) => ids.has(quest.id))).toBe(true);
  });
});
