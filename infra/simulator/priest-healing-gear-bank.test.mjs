import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  collectPriestHealingEquipment,
  legalPriestHealingGear,
} from "./priest-healing-equipment.mjs";
import { priestHealingGearCandidates } from "./priest-healing-gear-bank.mjs";
const evidence = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/priest-healing-equipment-source.v1.json.gz", import.meta.url)),
  ),
);
function input() {
  const items = new Map(evidence.items.map((x) => [x.id, x])),
    sources = new Map(evidence.sources.map((x) => [x.id, x])),
    context = {
      ...evidence.context,
      currentIds: new Set(evidence.context.currentIds),
      originalItems: Array(17).fill(undefined),
    };
  const pool = collectPriestHealingEquipment(items, sources, context);
  return {
    gear: globalThis.structuredClone(evidence.seed),
    items,
    sources,
    context,
    pool,
    inspection: { enchants: {} },
    enchantPolicy: { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: [] },
  };
}
test("the healer bank covers every eligible individual slot, with legal paired hands", () => {
  const source = input(),
    before = globalThis.structuredClone(source.gear),
    rows = [...priestHealingGearCandidates(source)];
  assert(rows.length > 17);
  assert.deepEqual(source.gear, before);
  assert.equal(new Set(rows.map((x) => x.id)).size, rows.length);
  for (const row of rows)
    assert(legalPriestHealingGear(row.gear, source.items, source.sources, source.context));
  for (const slot of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16])
    for (const id of source.pool.slots[slot])
      assert(
        rows.some((row) => row.gear.items[slot].id === id),
        "Missing slot candidate " + id,
      );
  assert(
    rows.some(
      (row) =>
        source.items.get(row.gear.items[14].id).handType === 4 && row.gear.items[15].id === 0,
    ),
  );
  assert(
    rows.some(
      (row) => source.items.get(row.gear.items[14].id).handType !== 4 && row.gear.items[15].id > 0,
    ),
  );
});
test("ordered jewelry and ownership restrictions remain intact", () => {
  const source = input(),
    rows = [...priestHealingGearCandidates(source)];
  for (const [left, right, name] of [
    [10, 11, "rings"],
    [12, 13, "trinkets"],
  ])
    for (const first of source.pool.slots[left])
      for (const second of source.pool.slots[right]) {
        const proposal = globalThis.structuredClone(source.gear);
        proposal.items[left] = { id: first };
        proposal.items[right] = { id: second };
        if (legalPriestHealingGear(proposal, source.items, source.sources, source.context))
          assert(
            rows.some((r) => r.gear.items[left].id === first && r.gear.items[right].id === second),
            name + " omitted a legal ordered pair",
          );
      }
});
test("an enchant that requires raid acquisition is never added", () => {
  const source = input();
  source.inspection.enchants.bad = {
    effectId: 2617,
    spellId: 25079,
    type: 7,
    extraTypes: [],
    status: "static",
    classAllowlist: [],
    armorTypes: [],
    minLevel: 0,
    maxLevel: 0,
    itemLevelMin: 0,
    itemLevelMax: 0,
    enchantType: 0,
  };
  const rows = [...priestHealingGearCandidates(source)];
  assert(rows.every((r) => r.gear.items.every((s) => s.enchant !== 2617)));
});
