import { describe, expect, it } from "vitest";

import { includesMaskValue, includesSplitMaskValue } from "./data";
import {
  calculateWeaponDps,
  damageTypeName,
  formatItemEffect,
  formatStat,
  reputationStandingName,
} from "./item-tooltip";

describe("item tooltip facts", () => {
  it("formats the TBC Warglaive stats and DPS", () => {
    expect(formatStat(3, 22)).toBe("+22 Agility");
    expect(formatStat(31, 21)).toBe("+21 Hit Rating");
    expect(calculateWeaponDps(214, 398, 2_800)).toBeCloseTo(109.2857, 4);
  });

  it("resolves the stable attack-power item spell name", () => {
    expect(
      formatItemEffect({
        spellId: 15_810,
        name: "Attack Power 44",
        description: "",
        auraDescription: "",
        triggerType: 1,
        charges: 0,
        cooldownMs: -1,
        categoryCooldownMs: -1,
        procChance: null,
        procCharges: null,
        procCooldownMs: null,
        durationMs: 0,
        descriptionVariables: "",
        rawRecord: {},
      }),
    ).toEqual({ prefix: "Equip:", text: "Increases attack power by 44.", exact: true });
  });

  it("decodes signed class and split race masks", () => {
    expect(includesMaskValue(9, 1)).toBe(true);
    expect(includesMaskValue(9, 4)).toBe(true);
    expect(includesMaskValue(9, 2)).toBe(false);
    expect(includesMaskValue(-1, 11)).toBe(true);
    expect(includesSplitMaskValue([1, 2], 1)).toBe(true);
    expect(includesSplitMaskValue([1, 2], 34)).toBe(true);
    expect(includesSplitMaskValue([1, 2], 2)).toBe(false);
  });

  it("labels elemental damage and reputation requirements", () => {
    expect(damageTypeName(0)).toBe("Damage");
    expect(damageTypeName(2)).toBe("Fire Damage");
    expect(reputationStandingName(6)).toBe("Revered");
  });
});
