import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { extendDruidFeralheartCatalog } from "./druid-feralheart-model.mjs";
import { legalDruidHealingGear } from "./druid-healing-equipment.mjs";
import {
  druidEquippedControlIds,
  renderDruidEquippedSlots,
} from "./druid-healing-equipped-slots.mjs";

function fixture(name) {
  return JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url))));
}
const original = fixture("druid-healing-equipment-source.v1.json.gz");
const extended = extendDruidFeralheartCatalog(
  { items: original.items },
  fixture("druid-feralheart-source.v1.json.gz"),
);
const items = new Map(
    [...extended.db.items, ...fixture("druid-healing-idol-source.v1.json.gz").items].map((row) => [
      row.id,
      row,
    ]),
  ),
  sources = new Map([...original.sources, ...extended.sources].map((row) => [row.id, row])),
  context = {
    ...original.context,
    originalItems: Array(17).fill(undefined),
    currentIds: new Set(),
  };

test("all equipped control requests have legal ordered slots for every healing idol", () => {
  for (const id of [22398, 249396, 272429, 279250]) {
    const gear = { items: druidEquippedControlIds.map((itemId) => ({ id: itemId })) };
    gear.items[16].id = id;
    assert(legalDruidHealingGear(gear, items, sources, context));
    [gear.items[5], gear.items[7]] = [gear.items[7], gear.items[5]];
    assert.equal(legalDruidHealingGear(gear, items, sources, context), false);
  }
});
test("derived engine controls correct archived arrays and verify actual actor slot identity", () => {
  const source = {
    feralheart: readFileSync(new URL("./druid-feralheart-model_test.go", import.meta.url), "utf8"),
    idols: readFileSync(new URL("./druid-healing-idols_test.go", import.meta.url), "utf8"),
  };
  const result = renderDruidEquippedSlots(source);
  assert(result.feralheart.includes("slots := []int{7, 9, 5, 0, 6, 8, 2, 4}"));
  assert(result.idols.includes("seed := kfcDruidEquippedControlIds"));
  assert(result.controls.includes("character.Equipment[slot].ID != spec.Id"));
  assert.throws(() => renderDruidEquippedSlots(result));
  assert.throws(() =>
    renderDruidEquippedSlots({ ...source, feralheart: source.feralheart.repeat(2) }),
  );
});
