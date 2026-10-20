import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditPresetGear,
  presetAcquisitionProblem,
  repairStarterPreset,
} from "../infra/simulator/preset-acquisition.mjs";

function fixture() {
  const make = (id, type, armorType) => ({ id, name: String(id), type, armorType, ilvl: 65 });
  const db = {
    items: [
      make(19999, 1, 1),
      make(19687, 6, 2),
      make(13404, 1, 2),
      make(22267, 1, 1),
      make(18375, 6, 2),
    ],
  };
  const sources = new Map(
    db.items.map((item) => [
      item.id,
      {
        sources: [
          item.id < 19000 || item.id === 22267
            ? { kind: "dungeon", zoneId: 2557 }
            : { kind: "crafted" },
        ],
        craftAudit: { status: "raid-dependent" },
      },
    ]),
  );
  const gear = { items: Array.from({ length: 17 }, () => ({})) };
  gear.items[0] = { id: 19999 };
  gear.items[5] = { id: 19687 };
  return { db, sources, gear, inspection: { enchants: {} } };
}

test("crafted raid materials and unresolved recipes cannot pass as a pre-raid starter", () => {
  const { db, sources } = fixture();
  assert.match(presetAcquisitionProblem(db.items[0], sources.get(19999)), /Raid-dependent/);
  assert.match(
    presetAcquisitionProblem(db.items[0], { sources: [{ kind: "crafted" }] }),
    /Unresolved/,
  );
  assert.match(presetAcquisitionProblem(db.items[0], null), /Missing/);
});

test("raid drops, world bosses and raid reputations are blocked independently of crafting", () => {
  const item = { id: 1 };
  for (const source of [
    { drop: { zoneId: 1977 } },
    { drop: { npcId: 6109 } },
    { rep: { repFactionId: 270 } },
    { kind: "raid" },
  ])
    assert.match(presetAcquisitionProblem(item, { sources: [source] }), /Raid/);
});

test("replaces both reported Rogue items without changing the source or inventing damage evidence", () => {
  const input = fixture();
  const before = globalThis.structuredClone(input.gear);
  const result = repairStarterPreset(
    { profile: "rogue", playerClass: 6, gear: input.gear },
    input.db,
    input.sources,
    input.inspection,
  );
  assert.equal(result.gear.items[0].id, 13404);
  assert.equal(result.gear.items[5].id, 18375);
  assert.equal(result.changes.length, 2);
  assert.deepEqual(input.gear, before);
  assert.deepEqual(auditPresetGear(result.gear, input.db, input.sources, input.inspection), []);
  assert.equal(result.dps, undefined);
});

test("caster replacement remains cloth and unknown unsafe items fail closed", () => {
  const input = fixture();
  input.gear.items[5] = {};
  const result = repairStarterPreset(
    { profile: "mage", playerClass: 3, gear: input.gear },
    input.db,
    input.sources,
    input.inspection,
  );
  assert.equal(result.gear.items[0].id, 22267);
  input.gear.items[0] = { id: 987654 };
  assert.throws(
    () =>
      repairStarterPreset(
        { profile: "mage", playerClass: 3, gear: input.gear },
        input.db,
        input.sources,
        input.inspection,
      ),
    /No reviewed/,
  );
});
