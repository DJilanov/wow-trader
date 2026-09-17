import { describe, expect, it } from "vitest";

import { createForeverCapture, parseSpellbookIconsScript } from "./server.js";

const fixture = {
  _readme: "fixture",
  license: "CC-BY-4.0",
  attribution: "fixture",
  generated: "2026-09-16",
  talents: {
    Warrior: {
      icon: "class_warrior",
      source: "fixture",
      trees: [
        {
          name: "Arms",
          bg: 1,
          icon: "ability_parry",
          talents: [
            {
              name: "Deflection",
              max: 1,
              row: 1,
              col: 1,
              passive: true,
              icon: "ability_parry",
              desc: ["One"],
              complete: true,
              classic: { status: "same" },
            },
          ],
          removed: [],
        },
      ],
    },
  },
  spellbooks: {
    Warrior: {
      race: "Human",
      level: 38,
      seen: "fixture",
      missing: [],
      general: [["Attack", ""]],
      tabs: [],
      notes: [],
    },
  },
  spell_desc: {},
  racials: {},
  class_racials: {},
  class_abilities: { Warrior: [] },
  legacy: { note: "fixture", trees: [] },
  changelog: [],
};

describe("Forever source ingestion", () => {
  it("parses the supplemental icon assignment without executing JavaScript", () => {
    expect(
      parseSpellbookIconsScript('window.SPELLBOOK_ICONS = {"Attack":"inv_sword_04"};'),
    ).toEqual({ spellbookIcons: { Attack: "inv_sword_04" } });
  });

  it("creates a deterministic validated capture", () => {
    const raw = JSON.stringify(fixture);
    const first = createForeverCapture(raw, { spellbookIcons: { Attack: "inv_sword_04" } });
    const second = createForeverCapture(raw, { spellbookIcons: { Attack: "inv_sword_04" } });
    expect(first.validation.valid).toBe(true);
    expect(first.validation.counts.talents).toBe(1);
    expect(first.checksum).toBe(second.checksum);
  });
});
