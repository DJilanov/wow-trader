import { describe, expect, it } from "vitest";
import {
  dungeonBundleKey,
  dungeonBundleSchema,
  dungeonBundleSlotKey,
  GUARANTEED_DUNGEON_IDS,
} from "./dungeon-bundle-model.js";
import {
  estimateDungeonBundleReward,
  forecastDungeonBundle,
  getDungeonBundle,
  updateDungeonBundleSlot,
} from "./dungeon-bundles.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";

describe("owner-confirmed four-quest dungeon bundles", () => {
  it("selects four independent slots for each new dungeon and faction without inventing IDs", () => {
    const keys = new Set<string>();
    for (const id of GUARANTEED_DUNGEON_IDS)
      for (const faction of ["alliance", "horde"] as const) {
        const bundle = getDungeonBundle(id, faction)!;
        expect(bundle.countProvenance).toBe("owner-confirmed");
        expect(bundle.slots).toHaveLength(4);
        expect(bundle.slots.every((slot) => slot.questId === null && slot.selected)).toBe(true);
        for (const slot of bundle.slots) keys.add(dungeonBundleSlotKey(bundle, slot.index));
      }
    expect(keys.size).toBe(24);
    expect(getDungeonBundle("dalaran", "alliance")).toBeNull();
    expect(getDungeonBundle("deadmines", "alliance")).toBeNull();
  });

  it("matches Dalaran's collected level-33 reward without applying the coefficient twice", () => {
    expect(estimateDungeonBundleReward(33, 33).xp).toBe(9400);
    const bundle = { ...getDungeonBundle("drowned-city", "alliance")!, planningQuestLevel: 33 };
    const forecast = forecastDungeonBundle(bundle, { level: 33, currentXp: 0 });
    expect(forecast.estimatedXp).toBe(37600);
    expect(forecast.referenceXp).toBe(0);
    expect(forecast.rows.every((row) => row.basis === "base-estimate")).toBe(true);
  });

  it("scales each dungeon's reward from its own configured quest level", () => {
    const totals = [40400, 49000, 67400];
    for (const [index, id] of GUARANTEED_DUNGEON_IDS.entries()) {
      const bundle = getDungeonBundle(id, "horde")!;
      const forecast = forecastDungeonBundle(bundle, {
        level: bundle.planningQuestLevel,
        currentXp: 0,
      });
      expect(forecast.estimatedXp).toBe(totals[index]);
      expect(forecast.rows.every((row) => row.questId === null)).toBe(true);
      expect(forecast.unknownSlotKeys).toEqual([]);
    }
  });

  it("uses reviewed hand-in reductions and awards no leveling XP at 60", () => {
    expect(estimateDungeonBundleReward(33, 38).xp).toBe(9400);
    expect(estimateDungeonBundleReward(33, 39).xp).toBe(7500);
    expect(estimateDungeonBundleReward(33, 40).xp).toBe(5650);
    expect(estimateDungeonBundleReward(33, 43).xp).toBe(940);
    expect(estimateDungeonBundleReward(50, 60).xp).toBe(0);
    expect(() => estimateDungeonBundleReward(0, 33)).toThrow();
    expect(() => estimateDungeonBundleReward(33, Number.NaN)).toThrow();
  });

  it("replaces a slot with a real final reward instead of creating a fifth reward", () => {
    const original = { ...getDungeonBundle("drowned-city", "alliance")!, planningQuestLevel: 33 };
    const bundle = updateDungeonBundleSlot(original, 1, { questId: 92456 });
    const forecast = forecastDungeonBundle(bundle, { level: 33, currentXp: 0 }, {}, () => ({
      xp: 10000,
      basis: "wowhead-reference",
      source: "Reviewed final reward",
    }));
    expect(bundle.slots).toHaveLength(4);
    expect(original.slots[0]!.questId).toBeNull();
    expect(forecast.referenceXp).toBe(10000);
    expect(forecast.estimatedXp).toBe(28200);
    const zero = forecastDungeonBundle(bundle, { level: 33, currentXp: 0 }, {}, () => ({
      xp: 0,
      basis: "wowhead-reference",
      source: "Authoritative zero",
    }));
    expect(zero.referenceXp + zero.estimatedXp).toBe(28200);
  });

  it("does not re-award a paid slot or a real quest when its identity becomes known", () => {
    const bundle = updateDungeonBundleSlot(
      { ...getDungeonBundle("drowned-city", "alliance")!, planningQuestLevel: 33 },
      1,
      { questId: 92456 },
    );
    for (const member of [
      { questStates: { "92456": "rewarded" } },
      { bundleSlotStates: { [dungeonBundleSlotKey(bundle, 1)]: "rewarded" as const } },
    ]) {
      const forecast = forecastDungeonBundle(bundle, { level: 33, currentXp: 0 }, member);
      expect(forecast.rows[0]!.state).toBe("rewarded");
      expect(forecast.rows[0]!.xp).toBe(0);
      expect(forecast.estimatedXp).toBe(28200);
    }
  });

  it("persists a player's skipped slot and level without changing faction alternatives", () => {
    const initial = getDungeonBundle("alcaz", "alliance")!;
    const changed = updateDungeonBundleSlot({ ...initial, planningQuestLevel: 33 }, 2, {
      selected: false,
    });
    const progress = premadeProgressSchema.parse({
      ...emptyPremadeProgress(),
      guaranteedBundles: { [dungeonBundleKey("alcaz", "alliance")]: changed },
    });
    const restored = getDungeonBundle(
      "alcaz",
      "alliance",
      premadeProgressSchema.parse(JSON.parse(JSON.stringify(progress))).guaranteedBundles,
    )!;
    expect(restored.planningQuestLevel).toBe(33);
    expect(restored.slots.filter((slot) => slot.selected)).toHaveLength(3);
    expect(forecastDungeonBundle(restored, { level: 33, currentXp: 0 }).estimatedXp).toBe(28200);
    expect(
      getDungeonBundle("alcaz", "horde", progress.guaranteedBundles)!.slots.every(
        (slot) => slot.selected,
      ),
    ).toBe(true);
  });

  it("rejects duplicate real IDs, duplicate slots and a saved faction identity mismatch", () => {
    const bundle = updateDungeonBundleSlot(getDungeonBundle("alcaz", "alliance")!, 1, {
      questId: 92456,
    });
    expect(() => updateDungeonBundleSlot(bundle, 2, { questId: 92456 })).toThrow();
    expect(() => updateDungeonBundleSlot(bundle, 5, { selected: false })).toThrow();
    expect(() =>
      dungeonBundleSchema.parse({
        ...bundle,
        slots: Array.from({ length: 4 }, () => bundle.slots[0]),
      }),
    ).toThrow();
    expect(() =>
      premadeProgressSchema.parse({
        ...emptyPremadeProgress(),
        guaranteedBundles: { "alcaz:horde": bundle },
      }),
    ).toThrow();
  });

  it("holds unresolved real rewards instead of falling back to the replaced slot estimate", () => {
    const bundle = updateDungeonBundleSlot(getDungeonBundle("alcaz", "alliance")!, 1, {
      questId: 92456,
    });
    const forecast = forecastDungeonBundle(bundle, { level: 50, currentXp: 0 }, {}, () => ({
      xp: null,
      basis: "unknown",
      source: "Identity conflict",
    }));
    expect(forecast.endpoint).toBeNull();
    expect(forecast.estimatedXp).toBe(0);
    expect(forecast.unknownSlotKeys).toHaveLength(4);
  });
  it("does not turn a known faction or class restriction into a generic guaranteed reward", () => {
    for (const [faction, questId] of [
      ["horde", 92456],
      ["alliance", 1654],
    ] as const) {
      const bundle = updateDungeonBundleSlot(getDungeonBundle("alcaz", faction)!, 1, { questId });
      const forecast = forecastDungeonBundle(
        bundle,
        { level: 50, currentXp: 0 },
        { classSlug: "warrior" },
        () => ({
          xp: 10000,
          basis: "wowhead-reference",
          source: "Not eligible for this character",
        }),
      );
      expect(forecast.endpoint).toBeNull();
      expect(forecast.referenceXp).toBe(0);
    }
  });

  it("adds defaults to legacy saves while preserving existing progress", () => {
    const legacy = {
      revision: emptyPremadeProgress().revision,
      stages: { "dalaran-clear": true },
      members: Array.from({ length: 5 }, () => ({
        level: 33,
        currentXp: 123,
        questStates: { "92456": "rewarded" },
      })),
    };
    const restored = premadeProgressSchema.parse(legacy);
    expect(restored.guaranteedBundles).toEqual({});
    expect(restored.members[0]!.bundleSlotStates).toEqual({});
    expect(restored.members[0]!.currentXp).toBe(123);
    expect(restored.members[0]!.questStates["92456"]).toBe("rewarded");
    expect(restored.stages["dalaran-clear"]).toBe(true);
  });
});
