import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { createCharacterProfile, type CharacterProfile } from "./profile.js";
import { emptyDungeonPlan, personalDungeonPlanSchema } from "./dungeon-model.js";
import { parseGuideChapter } from "./guide-archive.js";
import {
  THANES_REPLACEMENT,
  DUNGEON_XP_CALIBRATION,
  emptyDungeonReplacement,
  calibratedDungeonQuestXp,
  estimateThanesReplacement,
  offersThanesReplacement,
  dungeonCarryoverRequirements,
  dungeonReplacementRejoinReasons,
} from "./dungeon-alternatives.js";

function character(overrides: Partial<CharacterProfile> = {}): CharacterProfile {
  return { ...createCharacterProfile(), classSlug: "warrior", level: 15, xpRate: 1, ...overrides };
}
function replacementPlan(change: Partial<ReturnType<typeof emptyDungeonReplacement>> = {}) {
  return {
    ...emptyDungeonPlan(),
    replacements: { [THANES_REPLACEMENT.chapterId]: { ...emptyDungeonReplacement(), ...change } },
  };
}
const before = parseGuideChapter(
  `step
 .accept 4762 >>Accept Cliffspring River
step
 .accept 948 >>Accept Onu
step << Mage
 .accept 963 >>Accept For Love Eternal
`,
  THANES_REPLACEMENT.chapterId,
  "a".repeat(64),
  70205,
);
const after = parseGuideChapter(
  `step
 .turnin 4762 >>Turn in Cliffspring River
step
 #optional
 .isOnQuest 948
 .turnin 948 >>Turn in Onu
step << Mage
 .turnin 963 >>Turn in For Love Eternal
step
 .accept 1138 >>Accept Fruit of the Sea
step
 .turnin 1138 >>Turn in Fruit of the Sea
`,
  THANES_REPLACEMENT.continuationId,
  "b".repeat(64),
  70205,
);

describe("Crest-calibrated dungeon alternatives", () => {
  it("uses the supplied 6200/2600 ratio, not a second bonus reduction", () => {
    expect(DUNGEON_XP_CALIBRATION.status).toBe("estimated");
    expect(calibratedDungeonQuestXp(95189, 20)).toBe(6200);
    const estimate = estimateThanesReplacement(character(), emptyDungeonPlan());
    expect(estimate.questXp).toBe(11_685);
    expect(estimate.fullBundleXp).toBe(14_427);
    expect(estimate.neededXp).toBe(14_400);
    expect(estimate.gapXp).toBe(2715);
    expect(estimate.coverage).toBe("needs-kills");
    expect(estimate.questIds).not.toContain(98423);
  });
  it("does not multiply outdoor prerequisites, kill XP or the XP curve", () => {
    expect(calibratedDungeonQuestXp(96391, 15)).toBe(1050);
    const estimate = estimateThanesReplacement(character(), replacementPlan({ killXp: 2000 }));
    expect(estimate.neededXp).toBe(14_400);
    expect(estimate.gapXp).toBe(715);
  });
  it("uses XP already earned and a per-player kill estimate exactly once", () => {
    const estimate = estimateThanesReplacement(
      character(),
      replacementPlan({ currentXp: 1000, killXp: 1715 }),
    );
    expect(estimate.neededXp).toBe(13_400);
    expect(estimate.gapXp).toBe(0);
    expect(estimate.coverage).toBe("covers");
  });
  it("excludes already paid and deliberately retained outdoor rewards", () => {
    const plan = {
      ...emptyDungeonPlan(),
      questStates: { 96395: "rewarded" as const },
      retainedQuestIds: [96403],
    };
    expect(estimateThanesReplacement(character(), plan).questXp).toBe(5962);
    expect(
      estimateThanesReplacement(character(), {
        ...emptyDungeonPlan(),
        questStates: { 96395: "objectives-complete" },
      }).questXp,
    ).toBe(11_685);
  });
  it("does not pretend an invalid XP bar is a known comparison", () => {
    for (const currentXp of [14_400, 50_000]) {
      const estimate = estimateThanesReplacement(character(), replacementPlan({ currentXp }));
      expect(estimate.coverage).toBe("unknown");
      expect(estimate.gapXp).toBeNull();
      expect(estimate.reasons).toContain(
        "XP progress must be below the XP required for the next level.",
      );
    }
  });
  it("keeps earlier night-elf questing and an already reached checkpoint distinct", () => {
    const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === THANES_REPLACEMENT.chapterId)!;
    expect(offersThanesReplacement(chapter, character({ raceId: "night-elf" }))).toBe(true);
    expect(
      estimateThanesReplacement(character({ raceId: "night-elf", level: 11 }), emptyDungeonPlan())
        .coverage,
    ).toBe("too-early");
    expect(estimateThanesReplacement(character({ level: 16 }), emptyDungeonPlan()).coverage).toBe(
      "already-ahead",
    );
    expect(offersThanesReplacement(chapter, createCharacterProfile("horde", "orc"))).toBe(false);
  });
  it("labels preview assumptions and incomplete preparation", () => {
    const estimate = estimateThanesReplacement(character({ level: null }), emptyDungeonPlan());
    expect(estimate.assumedLevel).toBe(true);
    expect(estimate.assumedProgress).toBe(true);
    expect(estimate.reasons.some((reason) => reason.includes("Underground Map"))).toBe(true);
    expect(estimate.savedMinutes).toBeNull();
  });
  it("does not report time savings until both full-trip estimates and XP coverage exist", () => {
    expect(
      estimateThanesReplacement(
        character(),
        replacementPlan({ tripMinutes: 60, outdoorMinutes: 90 }),
      ).savedMinutes,
    ).toBeNull();
    expect(
      estimateThanesReplacement(
        character(),
        replacementPlan({ killXp: 2715, tripMinutes: 60, outdoorMinutes: 90 }),
      ).savedMinutes,
    ).toBe(30);
    expect(
      estimateThanesReplacement(
        character(),
        replacementPlan({ killXp: 2715, tripMinutes: 100, outdoorMinutes: 90 }),
      ).savedMinutes,
    ).toBe(-10);
  });
  it("leaves missing and out-of-scope XP unknown rather than zero", () => {
    expect(calibratedDungeonQuestXp(499999, 15)).toBeNull();
    expect(calibratedDungeonQuestXp(96395, 60)).toBeNull();
    expect(calibratedDungeonQuestXp(96395, 0)).toBeNull();
    expect(calibratedDungeonQuestXp(96395, 15.5)).toBeNull();
  });
  it("upgrades old plan shapes without discarding their recorded game state", () => {
    const { replacements: _replacements, ...legacy } = emptyDungeonPlan();
    const restored = personalDungeonPlanSchema.parse({
      ...legacy,
      questStates: { 96395: "rewarded" },
    });
    expect(restored.replacements).toEqual({});
    expect(restored.questStates["96395"]).toBe("rewarded");
  });
  it("upgrades existing replacements without losing bookmarks or quest checks", () => {
    const {
      xpForecast: _forecast,
      xpNeedsUpdate: _needsUpdate,
      ...legacy
    } = emptyDungeonReplacement();
    const restored = personalDungeonPlanSchema.parse({
      ...emptyDungeonPlan(),
      replacements: {
        [THANES_REPLACEMENT.chapterId]: {
          ...legacy,
          active: true,
          stepId: "bridge",
          carryover: { 4762: "ready" },
        },
      },
    }).replacements[THANES_REPLACEMENT.chapterId]!;
    expect(restored).toMatchObject({
      active: true,
      stepId: "bridge",
      carryover: { 4762: "ready" },
      xpForecast: null,
      xpNeedsUpdate: false,
    });
  });
});

describe("outdoor dependency bridge", () => {
  it("finds carried quests, filters class variants and excludes new next-chapter pickups", () => {
    const carry = dungeonCarryoverRequirements(before, after, character());
    expect(carry.map((quest) => quest.questId)).toEqual([4762, 948]);
    expect(carry[0]).toMatchObject({
      title: "Cliffspring River",
      sourceStepId: "source-step-0001",
      conditional: false,
    });
    expect(carry[1]?.conditional).toBe(true);
    expect(
      dungeonCarryoverRequirements(before, after, character({ classSlug: "mage" })).map(
        (quest) => quest.questId,
      ),
    ).toContain(963);
  });
  it("keeps unknown directive-level class conditions visible for review", () => {
    const source = parseGuideChapter(
      "step\n .accept 963 >>Accept For Love Eternal << Mage",
      before.chapterId,
      "a".repeat(64),
      70205,
    );
    const next = parseGuideChapter(
      "step\n .turnin 963 >>Turn in For Love Eternal << Mage",
      after.chapterId,
      "b".repeat(64),
      70205,
    );
    expect(
      dungeonCarryoverRequirements(source, next, character({ classSlug: null }))[0],
    ).toMatchObject({ questId: 963, conditional: true });
  });
  it("does not count a later acceptance as preparation for an earlier turn-in", () => {
    const next = parseGuideChapter(
      "step\n .turnin 4762 >>Turn in Cliffspring River\nstep\n .accept 4762",
      after.chapterId,
      "b".repeat(64),
      70205,
    );
    expect(
      dungeonCarryoverRequirements(before, next, character()).map((quest) => quest.questId),
    ).toEqual([4762]);
  });
  it("does not make a required carryover optional because an earlier use was conditional", () => {
    const next = parseGuideChapter(
      "step\n #optional\n .turnin 4762\nstep\n .turnin 4762",
      after.chapterId,
      "b".repeat(64),
      70205,
    );
    expect(dungeonCarryoverRequirements(before, next, character())).toHaveLength(1);
    expect(dungeonCarryoverRequirements(before, next, character())[0]?.conditional).toBe(false);
  });
  it("preserves source-line order when known and unknown directives share a step", () => {
    const next = parseGuideChapter(
      "step\n .turnin 4762 << Mage\n .accept 4762",
      after.chapterId,
      "b".repeat(64),
      70205,
    );
    expect(
      dungeonCarryoverRequirements(before, next, character({ classSlug: null }))[0],
    ).toMatchObject({ questId: 4762, conditional: true });
  });
  it("does not treat a runtime-conditional next pickup as guaranteed carried preparation", () => {
    const next = parseGuideChapter(
      "step\n .isQuestAvailable 4762\n .accept 4762\nstep\n .turnin 4762",
      after.chapterId,
      "b".repeat(64),
      70205,
    );
    expect(
      dungeonCarryoverRequirements(before, next, character()).map((quest) => quest.questId),
    ).toEqual([4762]);
  });
  it("cannot unlock a chronological checkpoint using forecast XP", () => {
    const replacement = emptyDungeonReplacement();
    const plan = replacementPlan({ killXp: 50_000 });
    expect(estimateThanesReplacement(character(), plan).coverage).toBe("covers");
    expect(dungeonReplacementRejoinReasons(character(), replacement, [], 70205)).not.toEqual([]);
    expect(
      dungeonReplacementRejoinReasons(character(), { ...replacement, returnLevel: 15 }, [], 70205),
    ).not.toEqual([]);
  });
  it("requires the actual checkpoint and every applicable carryover, not Done clicks", () => {
    const carry = dungeonCarryoverRequirements(before, after, character());
    const replacement = {
      ...emptyDungeonReplacement(),
      returnLevel: 16,
      progress: { rejoin: "done" as const },
    };
    expect(dungeonReplacementRejoinReasons(character(), replacement, carry, 70205)).toHaveLength(2);
    const reviewed = {
      ...replacement,
      carryover: { 4762: "ready" as const, 948: "not-needed" as const },
    };
    expect(dungeonReplacementRejoinReasons(character(), reviewed, carry, 70205)).toEqual([]);
    expect(
      dungeonReplacementRejoinReasons(
        character(),
        { ...reviewed, carryover: { 4762: "not-needed", 948: "not-needed" } },
        carry,
        70205,
      ),
    ).toHaveLength(1);
  });
  it("does not silently approve a different build or unresolved profile", () => {
    expect(
      dungeonCarryoverRequirements({ ...before, targetBuild: 70000 }, after, character()),
    ).toEqual([]);
    expect(
      dungeonReplacementRejoinReasons(
        character(),
        { ...emptyDungeonReplacement(), returnLevel: 16 },
        [],
        70000,
      ),
    ).not.toEqual([]);
    expect(
      dungeonReplacementRejoinReasons(
        character({ classSlug: null, xpRate: null }),
        { ...emptyDungeonReplacement(), returnLevel: 16 },
        [],
        70205,
      ),
    ).not.toEqual([]);
  });
});
