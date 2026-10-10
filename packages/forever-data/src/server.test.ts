import { createDatabase } from "@wow-trader/db";
import { describe, expect, it, vi } from "vitest";

import {
  createForeverCapture,
  getPublishedForeverSnapshot,
  parseSpellbookIconsScript,
} from "./server.js";
import { foreverExportSchema } from "./schemas.js";
import type { ForeverExport } from "./schemas.js";
import { getForeverSnapshotEvidence } from "./provenance.js";

const fixture: ForeverExport = {
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
  it("looks up a historical snapshot without selecting an unjoined publication table", async () => {
    const database = createDatabase("postgres://fixture:fixture@127.0.0.1:1/fixture");
    let sql = "";
    const query = vi.spyOn(database.client, "unsafe").mockImplementation((statement) => {
      sql = statement;
      throw new Error("Captured SQL without a database connection");
    });
    try {
      await expect(getPublishedForeverSnapshot(database.db, "a".repeat(64))).rejects.toThrow();
      expect(sql).toContain('"external_data_snapshot"."published_at"');
      expect(sql).not.toContain('"external_data_publication"');
      expect(sql).toContain('"external_data_snapshot"."checksum" = $2');
    } finally {
      query.mockRestore();
      await database.close();
    }
  });

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

  it("preserves the demo format and its evidence", () => {
    const data = foreverExportSchema.parse(fixture);
    expect(data.spellbooks.Warrior?.race).toBe("Human");
    expect(getForeverSnapshotEvidence(data)).toMatchObject({ state: "demo_preview", build: null });
  });

  it("accepts build-scoped beta spellbooks, descriptions, racials and Legacy ranks", () => {
    const data = betaFixture();
    data.spell_desc["Warrior|Attack|1"] = {
      l: [],
      d: "Attack",
      s: "beta",
      src: "Client build 1.60.1.70291",
      r: "1",
      lv: "1",
      id: 6603,
    };
    data.class_racials.Priest = { note: "Beta source", races: {} };
    data.legacy.trees = [
      {
        name: "Adventure",
        icon: "inv_misc_book_11",
        perks: [
          {
            name: "Veteran",
            max: 2,
            row: 1,
            col: 1,
            icon: "ability_parry",
            ranks: ["First rank", "Second rank"],
            gate: 0,
          },
        ],
      },
    ];
    const capture = createForeverCapture(JSON.stringify(data), { spellbookIcons: {} });
    expect(capture.validation.valid).toBe(true);
    expect(capture.validation.issues).toEqual([]);
    expect(capture.data.legacy.trees[0]?.perks[0]).toEqual(data.legacy.trees[0]?.perks[0]);
    expect(getForeverSnapshotEvidence(capture.data)).toMatchObject({
      state: "beta_preview",
      build: "1.60.1.70291",
    });
  });

  it("requires an explicit build for beta spellbooks", () => {
    const data = betaFixture();
    delete data.spellbooks.Warrior!.build;
    expect(foreverExportSchema.safeParse(data).success).toBe(false);
  });

  it("does not treat a missing demo race as a beta capture", () => {
    const data = structuredClone(fixture);
    data.spellbooks.Warrior!.race = "";
    expect(foreverExportSchema.safeParse(data).success).toBe(false);
  });

  it("rejects unsafe per-class icon keys", () => {
    const data = betaFixture();
    data.spellbooks.Warrior!.icons = { Attack: "../../private" };
    expect(foreverExportSchema.safeParse(data).success).toBe(false);
  });

  it("preserves old Legacy tuples and rejects inconsistent beta rank counts", () => {
    const data = structuredClone(fixture);
    data.legacy.trees = [
      {
        name: "Adventure",
        icon: "ability_parry",
        perks: [["Veteran", 2, "Old description", "ability_parry"]],
      },
    ];
    expect(foreverExportSchema.parse(data).legacy).toEqual(data.legacy);
    data.legacy.trees[0]!.perks = [
      {
        name: "Veteran",
        max: 2,
        row: 1,
        col: 1,
        icon: "ability_parry",
        ranks: ["One"],
        gate: 0,
      },
    ];
    expect(foreverExportSchema.safeParse(data).success).toBe(false);
  });

  it("rejects duplicate talent names used by snapshot-bound allocation keys", () => {
    const data = structuredClone(fixture);
    const tree = data.talents.Warrior!.trees[0]!;
    tree.talents.push({ ...tree.talents[0]!, col: 2 });
    const capture = createForeverCapture(JSON.stringify(data), { spellbookIcons: {} });
    expect(capture.validation.valid).toBe(false);
    expect(capture.validation.issues).toContainEqual(
      expect.objectContaining({ code: "duplicate_talent_name" }),
    );
  });

  it("does not invent one build for mixed-build snapshots", () => {
    const data = betaFixture();
    data.spellbooks.Paladin = { ...data.spellbooks.Warrior!, build: "1.60.1.70260" };
    expect(getForeverSnapshotEvidence(data)).toMatchObject({ state: "beta_preview", build: null });
  });
});

function betaFixture(): ForeverExport {
  const data = structuredClone(fixture);
  const talent = data.talents.Warrior!.trees[0]!.talents[0]!;
  talent.src = "beta";
  talent.confirmed = [1];
  data.spellbooks.Warrior = {
    ...data.spellbooks.Warrior!,
    race: "",
    level: 60,
    source: "beta",
    build: "1.60.1.70291",
    icons: { Attack: "inv_sword_04" },
  };
  return data;
}
