import { describe, expect, it } from "vitest";

import { getIneligibilityReasons } from "./eligibility.js";
import { optimizeLoadouts } from "./optimizer.js";
import { createRuleBasedEvaluator, type RuleBasedEvaluatorConfig } from "./rule-based-evaluator.js";
import type {
  CharacterProfile,
  EquipmentSlot,
  GearItem,
  OptimizationContext,
  SlotDefinition,
} from "./types.js";

const BUILD_NUMBER = 69_795;

describe("optimizeLoadouts", () => {
  it("selects a whole-loadout set bonus over higher standalone item scores", () => {
    const result = optimizeLoadouts({
      items: [
        item(1, "Set helm", ["head"], { power: 10 }, { setId: 100 }),
        item(2, "Set chest", ["chest"], { power: 10 }, { setId: 100 }),
        item(3, "Standalone helm", ["head"], { power: 15 }),
        item(4, "Standalone chest", ["chest"], { power: 15 }),
      ],
      slots: [slot("head"), slot("chest")],
      setBonuses: [{ setId: 100, threshold: 2, spellId: 9_001 }],
      candidateCoverage: "complete",
      context: context(),
      evaluator: evaluator({
        effectRules: [effectRule(9_001, "Two-piece bonus", 20)],
      }),
    });

    expect(result.loadouts[0]?.loadout.items.map(({ item: value }) => value.itemId)).toEqual([
      2, 1,
    ]);
    expect(result.loadouts[0]?.evaluation.score).toBe(40);
    expect(result.loadouts[0]?.classification).toBe("definitive");
    expect(result.diagnostics.searchMode).toBe("exhaustive");
  });

  it("optimizes around a stat cap and rejects loadouts below a hard minimum", () => {
    const result = optimizeLoadouts({
      items: [
        item(10, "Over-cap ring", ["finger1", "finger2"], { hit: 20 }),
        item(11, "Cap ring", ["finger1", "finger2"], { hit: 10, power: 9 }),
        item(12, "Power ring", ["finger1", "finger2"], { power: 30 }),
        item(13, "Second power ring", ["finger1", "finger2"], { power: 29 }),
      ],
      slots: [slot("finger1", "finger"), slot("finger2", "finger")],
      setBonuses: [],
      candidateCoverage: "complete",
      context: context({ baseStats: { hit: 90 } }),
      evaluator: evaluator({
        statRules: [
          {
            stat: "hit",
            label: "Hit before cap",
            segments: [
              { upTo: 100, weight: 2 },
              { upTo: null, weight: 0 },
            ],
          },
          linearStat("power", 1),
        ],
        minimumStats: [{ stat: "hit", label: "Required hit", minimum: 100 }],
      }),
    });

    expect(result.loadouts[0]?.loadout.items.map(({ item: value }) => value.itemId).sort()).toEqual(
      [11, 12],
    );
    expect(result.loadouts[0]?.evaluation.totalStats).toMatchObject({ hit: 100, power: 39 });
    expect(result.diagnostics.rejectedLoadoutCount).toBeGreaterThan(0);
  });

  it("enforces two-hand slot blocking, per-item limits, and shared unique categories", () => {
    const result = optimizeLoadouts({
      items: [
        item(20, "Two hand", ["mainHand"], { power: 100 }, { blocksSlots: ["offHand"] }),
        item(21, "One hand", ["mainHand"], { power: 60 }),
        item(22, "Off hand", ["offHand"], { power: 50 }),
        item(23, "Unique trinket A", ["trinket1", "trinket2"], { power: 30 }, unique(7)),
        item(24, "Unique trinket B", ["trinket1", "trinket2"], { power: 30 }, unique(7)),
        item(25, "Other trinket", ["trinket1", "trinket2"], { power: 20 }),
      ],
      slots: [
        slot("mainHand"),
        slot("offHand", null, false),
        slot("trinket1", "trinket"),
        slot("trinket2", "trinket"),
      ],
      setBonuses: [],
      candidateCoverage: "complete",
      context: context(),
      evaluator: evaluator(),
    });

    const itemIds = result.loadouts[0]?.loadout.items.map(({ item: value }) => value.itemId);
    expect(itemIds).toContain(21);
    expect(itemIds).toContain(22);
    expect(itemIds).toContain(25);
    expect([itemIds?.includes(23), itemIds?.includes(24)].filter(Boolean)).toHaveLength(1);
  });

  it("keeps unknown client-visible items provisional and reports unsupported effects", () => {
    const result = optimizeLoadouts({
      items: [
        item(30, "Known item", ["head"], { power: 10 }),
        item(
          31,
          "Forever candidate",
          ["head"],
          { power: 20 },
          {
            availability: "unknown",
            effectSpellIds: [7_777],
          },
        ),
      ],
      slots: [slot("head")],
      setBonuses: [],
      candidateCoverage: "complete",
      context: context(),
      evaluator: evaluator(),
      options: { availabilityPolicy: "include_unknown" },
    });

    expect(result.loadouts[0]?.loadout.items[0]?.item.itemId).toBe(31);
    expect(result.loadouts[0]?.classification).toBe("candidate");
    expect(result.loadouts[0]?.confidenceIssues.map(({ code }) => code)).toEqual([
      "unresolved_item_effect",
      "unknown_item_availability",
    ]);
  });

  it("labels a truncated deterministic beam as best-found rather than definitive", () => {
    const request = {
      items: [
        item(40, "Head A", ["head"], { power: 3 }),
        item(41, "Head B", ["head"], { power: 2 }),
        item(42, "Chest A", ["chest"], { power: 3 }),
        item(43, "Chest B", ["chest"], { power: 2 }),
      ],
      slots: [slot("head"), slot("chest")],
      setBonuses: [],
      candidateCoverage: "complete",
      context: context(),
      evaluator: evaluator(),
      options: { beamWidth: 1 },
    } as const;

    const first = optimizeLoadouts(request);
    const second = optimizeLoadouts(request);
    expect(first).toEqual(second);
    expect(first.diagnostics.searchMode).toBe("beam");
    expect(first.diagnostics.truncatedStateCount).toBeGreaterThan(0);
    expect(first.loadouts[0]?.classification).toBe("candidate");
    expect(first.loadouts[0]?.confidenceIssues[0]?.code).toBe("search_not_exhaustive");
  });

  it("rejects inconsistent shared unique-category limits", () => {
    expect(() =>
      optimizeLoadouts({
        items: [
          item(60, "First unique item", ["head"], { power: 1 }, unique(9)),
          item(
            61,
            "Inconsistent unique item",
            ["head"],
            { power: 2 },
            {
              uniqueGroupId: 9,
              uniqueGroupMaximum: 2,
            },
          ),
        ],
        slots: [slot("head")],
        setBonuses: [],
        candidateCoverage: "complete",
        context: context(),
        evaluator: evaluator(),
      }),
    ).toThrow("Unique group 9 has inconsistent maximum-equipped values");
  });

  it("does not claim a definitive optimum when an unselected candidate effect is unresolved", () => {
    const result = optimizeLoadouts({
      items: [
        item(70, "Selected known item", ["head"], { power: 20 }),
        item(
          71,
          "Lower item with unknown proc",
          ["head"],
          { power: 10 },
          {
            effectSpellIds: [8_888],
          },
        ),
      ],
      slots: [slot("head")],
      setBonuses: [],
      candidateCoverage: "complete",
      context: context(),
      evaluator: evaluator(),
    });

    expect(result.loadouts[0]?.loadout.items[0]?.item.itemId).toBe(70);
    expect(result.loadouts[0]?.classification).toBe("candidate");
    expect(result.diagnostics.unresolvedCandidateEffectSpellIds).toEqual([8_888]);
  });
});

describe("getIneligibilityReasons", () => {
  it("explains character, profession, phase, and availability failures independently", () => {
    const value = item(
      50,
      "Restricted item",
      ["head"],
      { power: 1 },
      {
        allowedClassIds: [2],
        allowedRaceIds: [3],
        allowedFactions: ["horde"],
        requiredLevel: 80,
        requiredProfessionId: 164,
        requiredProfessionSpecializationId: 9788,
        requiredProficiencyIds: [4],
        requiredAbilityIds: [5_555],
        requiredSkillId: 164,
        requiredSkillRank: 375,
        requiredReputation: { factionId: 932, minimumRank: 7 },
        availableFromPhase: 4,
        availability: "unknown",
      },
    );

    expect(getIneligibilityReasons(value, context(), "available_only")).toEqual([
      "availability_unknown",
      "level",
      "class",
      "race",
      "faction",
      "profession",
      "profession_specialization",
      "proficiency",
      "ability",
      "skill_rank",
      "reputation",
      "phase",
    ]);
  });
});

type ItemOverrides = Partial<Omit<GearItem, "itemId" | "name" | "slots" | "stats">>;

function item(
  itemId: number,
  name: string,
  slots: readonly EquipmentSlot[],
  stats: Readonly<Record<string, number>>,
  overrides: ItemOverrides = {},
): GearItem {
  return {
    itemId,
    variantId: `${itemId}:base`,
    name,
    slots,
    stats,
    effectSpellIds: [],
    setId: null,
    requiredLevel: 70,
    allowedClassIds: [],
    allowedRaceIds: [],
    allowedFactions: [],
    requiredProfessionId: null,
    requiredProfessionSpecializationId: null,
    requiredProficiencyIds: [],
    requiredAbilityIds: [],
    requiredSkillId: null,
    requiredSkillRank: 0,
    requiredReputation: null,
    availableFromPhase: null,
    availableThroughPhase: null,
    availability: "available",
    uniqueGroupId: null,
    uniqueGroupMaximum: 1,
    maximumEquipped: 1,
    blocksSlots: [],
    ...overrides,
  };
}

function unique(groupId: number): ItemOverrides {
  return { uniqueGroupId: groupId, uniqueGroupMaximum: 1 };
}

function slot(
  value: EquipmentSlot,
  interchangeableGroup: string | null = null,
  required = true,
): SlotDefinition {
  return { slot: value, required, interchangeableGroup };
}

function context(characterOverrides: Partial<CharacterProfile> = {}): OptimizationContext {
  return {
    build: { product: "wow_anniversary", buildNumber: BUILD_NUMBER, phase: 3 },
    character: {
      level: 70,
      classId: 1,
      raceId: 1,
      specializationId: "warrior:fury",
      faction: "alliance",
      professionIds: [],
      professionSpecializationIds: [],
      proficiencyIds: [],
      abilityIds: [],
      skillRanks: {},
      reputationRanks: {},
      baseStats: {},
      ...characterOverrides,
    },
    encounter: {
      id: "raid-boss",
      targetLevel: 73,
      targetArmor: 6_200,
      targetCreatureType: "demon",
      durationSeconds: 180,
      targetCount: 1,
      attributes: {},
    },
  };
}

function evaluator(overrides: Partial<RuleBasedEvaluatorConfig> = {}) {
  return createRuleBasedEvaluator({
    metadata: {
      modelId: "tbc-fury-test",
      version: "1.0.0",
      product: "wow_anniversary",
      buildNumber: BUILD_NUMBER,
      specializationId: "warrior:fury",
      objectiveId: "damage",
      validationStatus: "validated",
    },
    statRules: [linearStat("power", 1)],
    minimumStats: [],
    effectRules: [],
    ignoredEffectSpellIds: [],
    ...overrides,
  });
}

function linearStat(stat: string, weight: number) {
  return {
    stat,
    label: stat,
    segments: [{ upTo: null, weight }],
  } as const;
}

function effectRule(spellId: number, label: string, flatScore: number) {
  return {
    spellId,
    label,
    statBonuses: {},
    flatScore,
    condition: null,
  } as const;
}
