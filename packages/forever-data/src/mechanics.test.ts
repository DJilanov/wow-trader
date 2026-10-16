import { describe, expect, it } from "vitest";
import {
  normalizeClientMechanics,
  resolveClientItemStats,
  type MechanicsManifest,
  type MechanicsRow,
} from "./mechanics.js";

describe("Forever client item normalization", () => {
  it("resolves modern item allocations instead of treating absent legacy amounts as no stats", () => {
    expect(
      resolveClientItemStats(
        {
          InventoryType: 1,
          OverallQualityID: 3,
          StatModifier_bonusStat: [7, 4, 3, 46],
          StatPercentEditor: [7500, 4167, 2500, 2222],
        },
        { SuperiorF: [36, 27, 20, 15, 11] },
      ),
    ).toEqual([
      { statType: 7, value: 27 },
      { statType: 4, value: 15 },
      { statType: 3, value: 9 },
      { statType: 46, value: 8 },
    ]);
  });
  it("chooses the correct quality and equipment budget group", () => {
    expect(
      resolveClientItemStats(
        {
          InventoryType: 11,
          OverallQualityID: 4,
          StatModifier_bonusStat: [5],
          StatPercentEditor: [5000],
        },
        { EpicF: [45, 34, 25, 19, 14] },
      ),
    ).toEqual([{ statType: 5, value: 13 }]);
    expect(
      resolveClientItemStats(
        {
          InventoryType: 17,
          OverallQualityID: 2,
          StatModifier_bonusStat: [4],
          StatPercentEditor: [10000],
        },
        { GoodF: [27, 20, 15, 11, 9] },
      ),
    ).toEqual([{ statType: 4, value: 27 }]);
  });
  it("preserves explicit legacy values and excludes unused slots without dropping real zeros", () => {
    expect(
      resolveClientItemStats(
        { StatModifier_bonusStat: [4, -1, 7], StatModifier_bonusAmount: [12, 200, 0] },
        undefined,
      ),
    ).toEqual([{ statType: 4, value: 12 }]);
    expect(
      resolveClientItemStats(
        {
          InventoryType: 1,
          OverallQualityID: 3,
          StatModifier_bonusStat: [4],
          StatPercentEditor: [1],
        },
        { SuperiorF: [1, 1, 1, 1, 1] },
      ),
    ).toEqual([{ statType: 4, value: 0 }]);
    expect(
      resolveClientItemStats({ StatModifier_bonusStat: [], StatPercentEditor: [] }, undefined),
    ).toEqual([]);
  });
  it("does not invent budget values, silently coerce strings or truncate mismatched arrays", () => {
    for (const sparse of [
      {
        InventoryType: 1,
        OverallQualityID: 3,
        StatModifier_bonusStat: [4],
        StatPercentEditor: [5000],
      },
      {
        InventoryType: 1,
        OverallQualityID: 3,
        StatModifier_bonusStat: [4, 7],
        StatPercentEditor: [5000],
      },
      {
        InventoryType: 1,
        OverallQualityID: 3,
        StatModifier_bonusStat: [4],
        StatPercentEditor: ["5000"],
      },
    ])
      expect(() => resolveClientItemStats(sparse, undefined)).toThrow();
  });
  it("extracts all nine class trees and keeps malformed positions and missing rank numbers unresolved", () => {
    const tables = fixtureTables();
    const data = normalizeClientMechanics(manifest(), tables);
    expect(data.talents).toHaveLength(360);
    expect(new Set(data.talents.map((t) => t.className)).size).toBe(9);
    expect(
      data.talents.every((t) => t.ranks.every((r) => !r.resolved && r.text.includes("$s1"))),
    ).toBe(true);
    const bad = tables.get("TraitNode")![0]!;
    tables.set("TraitNode", [{ ...bad, PosX: 102800 }, ...tables.get("TraitNode")!.slice(1)]);
    const changed = normalizeClientMechanics(manifest(), tables);
    expect(changed.talents[0]).toMatchObject({
      layoutResolved: false,
      treeIndex: null,
      row: null,
      column: null,
      rawPosition: { x: 102800, y: 2130 },
    });
  });
  it("uses effect curves per rank without substituting zero for absent points", () => {
    const tables = fixtureTables();
    const first = tables.get("TraitDefinition")![0]!;
    tables.set("TraitDefinitionEffectPoints", [
      { id: 1, TraitDefinitionID: first.id, EffectIndex: 0, OperationType: 0, CurveID: 10 },
    ]);
    tables.set("CurvePoint", [{ id: 1, CurveID: 10, Pos: [1, 5] }]);
    const data = normalizeClientMechanics(manifest(), tables);
    expect(data.talents[0]?.ranks).toEqual([
      { rank: 1, text: "Increases damage by 5%.", resolved: true },
      { rank: 2, text: "Increases damage by $s1%.", resolved: false },
    ]);
  });
  it("joins item effects by ItemXItemEffect and resolves weapon tables without Classic replacements", () => {
    const tables = fixtureTables();
    tables.set("Item", [{ id: 872, ClassID: 2, SubclassID: 1 }]);
    tables.set("ItemSparse", [
      {
        id: 872,
        Display_lang: "Rockslicer",
        InventoryType: 17,
        ItemLevel: 23,
        OverallQualityID: 3,
        RequiredLevel: 18,
        ItemSet: 0,
        ItemDelay: 3300,
        DmgVariance: 0.4,
        Flags: [0, 0],
        StatModifier_bonusStat: [],
        StatPercentEditor: [],
      },
    ]);
    tables.set("ItemDamageTwoHand", [{ id: 23, Quality: [0, 0, 0, 19.7] }]);
    tables.set("ItemXItemEffect", [{ id: 1, ItemID: 872, ItemEffectID: 123 }]);
    const data = normalizeClientMechanics(manifest(), tables);
    expect(data.items[0]).toMatchObject({
      itemId: 872,
      weapon: { minimum: 52, maximum: 78, speedSeconds: 3.3 },
      effectIds: [123],
      issues: [],
    });
    tables.delete("ItemDamageTwoHand");
    expect(normalizeClientMechanics(manifest(), tables).items[0]).toMatchObject({
      weapon: null,
      issues: ["weapon_damage_unresolved"],
    });
  });
});

function manifest(): MechanicsManifest {
  return {
    schema: "forever-mechanics-snapshot.v1",
    build: {
      product: "wow_classic_beta",
      clientVersion: "1.60.1.70425",
      buildNumber: 70425,
      buildKey: "a".repeat(32),
      cdnKey: "b".repeat(32),
    },
    locale: "enUS",
    definitionsRevision: "c".repeat(40),
    capturedAt: "2026-10-16T00:00:00Z",
    hotfixSha256: "d".repeat(64),
    tables: {},
    unavailable: [],
    combatRatings: { path: "combatratings.txt", sha256: "e".repeat(64) },
  };
}
function fixtureTables(): Map<string, readonly MechanicsRow[]> {
  const nodes: MechanicsRow[] = [],
    links: MechanicsRow[] = [],
    entries: MechanicsRow[] = [],
    definitions: MechanicsRow[] = [],
    names: MechanicsRow[] = [],
    spells: MechanicsRow[] = [];
  let id = 1;
  for (const tree of [1082, 1089, 1091, 1100, 1111, 1112, 1114, 1116, 1117])
    for (let index = 0; index < 40; index++) {
      const treeIndex = Math.floor(index / 14),
        position = index % 14;
      nodes.push({
        id,
        TraitTreeID: tree,
        PosX: [1020, 5020, 9080][treeIndex]! + (position % 4) * 600,
        PosY: 2130 + Math.floor(position / 4) * 600,
      });
      links.push({ id, TraitNodeID: id, TraitNodeEntryID: id });
      entries.push({ id, TraitDefinitionID: id, MaxRanks: 2 });
      definitions.push({ id, SpellID: id, OverrideName_lang: "", OverrideDescription_lang: "" });
      names.push({ id, Name_lang: `Talent ${id}` });
      spells.push({ id, Description_lang: "Increases damage by $s1%." });
      id++;
    }
  return new Map([
    ["TraitNode", nodes],
    ["TraitNodeXTraitNodeEntry", links],
    ["TraitNodeEntry", entries],
    ["TraitDefinition", definitions],
    ["SpellName", names],
    ["Spell", spells],
  ]);
}
