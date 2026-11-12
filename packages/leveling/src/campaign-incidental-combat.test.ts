import { describe, expect, it } from "vitest";
import {
  addIncidentalCombatXp,
  incidentalCombatMessage,
  incidentalCombatRowFields,
  validateIncidentalKillXpPercent,
} from "./campaign-incidental-combat.js";
import type { BoundedCombatKillEstimate } from "./campaign-xp-bounds.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

function estimate(): BoundedCombatKillEstimate {
  return {
    xp: 100,
    maximumXp: 150,
    exit: { level: 1, currentXp: 390 },
    maximumExit: { level: 2, currentXp: 40 },
    basis: "observed",
    reason: null,
    observedSources: ["Synthetic payout evidence"],
  };
}

describe("incidental kill XP planning allowance", () => {
  it("keeps payout evidence and applies the allowance after the required batch, including level overflow", () => {
    const required = estimate(),
      saved = structuredClone(required);
    const result = addIncidentalCombatXp(required, 10);
    expect(result).toEqual({
      ...required,
      xp: 110,
      maximumXp: 165,
      exit: { level: 2, currentXp: 0 },
      maximumExit: { level: 2, currentXp: 55 },
      basis: "reference-estimate",
      requiredBasis: "observed",
      incidentalXp: 10,
      maximumIncidentalXp: 15,
    });
    expect(required).toEqual(saved);
    expect(incidentalCombatRowFields(result)).toEqual({
      incidentalXp: 10,
      maximumIncidentalXp: 15,
      requiredBasis: "observed",
    });
    expect(incidentalCombatMessage(result, 10)).toContain("no additional quest or item credit");
  });

  it("preserves zero-percent estimates byte-for-byte", () => {
    const required = estimate();
    expect(addIncidentalCombatXp(required, 0)).toBe(required);
    expect(incidentalCombatRowFields(required)).toEqual({});
    expect(incidentalCombatMessage(required, 0)).toBeNull();
  });

  it("does not manufacture XP for unknown or excluded kills", () => {
    const unknown = {
      ...estimate(),
      xp: null,
      maximumXp: null,
      maximumExit: null,
      basis: "unknown" as const,
    };
    expect(addIncidentalCombatXp(unknown, 10)).toBe(unknown);
    const incomplete = { ...estimate(), maximumXp: null, maximumExit: null };
    expect(addIncidentalCombatXp(incomplete, 10)).toBe(incomplete);
    const excluded = { ...estimate(), xp: 0, maximumXp: 0, basis: "excluded" as const };
    expect(addIncidentalCombatXp(excluded, 10)).toBe(excluded);
  });

  it("rounds down once per batch", () => {
    const required = {
      ...estimate(),
      xp: 19,
      maximumXp: 19,
      maximumExit: { level: 1, currentXp: 390 },
    };
    const result = addIncidentalCombatXp(required, 10);
    expect(result.xp).toBe(20);
    expect(result.incidentalXp).toBe(1);
    expect(result.maximumXp).toBe(20);
    expect(result.maximumExit).toEqual({ level: 1, currentXp: 391 });
    expect(result.maximumIncidentalXp).toBe(1);
  });

  it("cannot apply the same allowance twice", () => {
    expect(() => addIncidentalCombatXp(addIncidentalCombatXp(estimate(), 10), 10)).toThrow("twice");
  });

  it("labels an upper-bound allowance even when its minimum rounds to zero", () => {
    const result = addIncidentalCombatXp({ ...estimate(), xp: 0, maximumXp: 11 }, 10);
    expect(result.incidentalXp).toBe(0);
    expect(result.maximumIncidentalXp).toBe(1);
    expect(incidentalCombatMessage(result, 10)).toContain("0–1 estimated");
    expect(result.basis).toBe("reference-estimate");
  });

  it("stops incidental credit at the level cap", () => {
    const capped = {
      ...estimate(),
      exit: { level: 60, currentXp: 0 },
      maximumExit: { level: 60, currentXp: 0 },
    };
    expect(addIncidentalCombatXp(capped, 10)).toBe(capped);
    const near = {
      ...estimate(),
      xp: 100,
      maximumXp: 100,
      exit: { level: 59, currentXp: FOREVER_XP_CURVE[59]! - 1 },
      maximumExit: { level: 59, currentXp: FOREVER_XP_CURVE[59]! - 1 },
    };
    expect(addIncidentalCombatXp(near, 10)).toMatchObject({
      xp: 101,
      maximumXp: 101,
      incidentalXp: 1,
      maximumIncidentalXp: 1,
      exit: { level: 60, currentXp: 0 },
      maximumExit: { level: 60, currentXp: 0 },
    });
  });

  it("keeps cap-room uncertainty separate from marginal earned XP", () => {
    const required = {
      ...estimate(),
      xp: 100,
      maximumXp: 102,
      exit: { level: 59, currentXp: FOREVER_XP_CURVE[59]! - 2 },
      maximumExit: { level: 60, currentXp: 0 },
    };
    expect(addIncidentalCombatXp(required, 10)).toMatchObject({
      xp: 100,
      maximumXp: 104,
      incidentalXp: 0,
      maximumIncidentalXp: 2,
      exit: { level: 60, currentXp: 0 },
      maximumExit: { level: 60, currentXp: 0 },
    });
  });

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid percentage: %s",
    (percent) => {
      expect(() => validateIncidentalKillXpPercent(percent)).toThrow("between 0 and 100");
      expect(() => addIncidentalCombatXp(estimate(), percent)).toThrow("between 0 and 100");
    },
  );
});
