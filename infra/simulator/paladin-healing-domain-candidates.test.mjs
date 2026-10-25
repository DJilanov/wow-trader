import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  paladinHealingDomainGroups,
  paladinHealingDomainCandidates,
  paladinHealingDomainRepairs,
} from "./paladin-healing-domain-candidates.mjs";
import {
  collectPaladinHealingEquipment,
  legalPaladinHealingGear,
  paladinHealingHandCandidates,
} from "./paladin-healing-equipment.mjs";
import { paladinHealingGearCandidates } from "./paladin-healing-gear-bank.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url))));
const source = fixture("paladin-healing-gear-bank-source.v1.json.gz"),
  inspection = fixture("druid-healing-enchants-source.v1.json.gz"),
  items = new Map(source.items.map((row) => [row.id, row])),
  sources = new Map(source.sources.map((row) => [row.id, row])),
  context = { ...source.context, currentIds: new Set(), originalItems: Array(17).fill(undefined) },
  pool = collectPaladinHealingEquipment(items, sources, context),
  bank = {
    gear: source.seed,
    pool,
    items,
    sources,
    context,
    inspection,
    enchantPolicy: { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: [] },
  };

test("unchanged Paladin acquisition pools retain enchant checks without repeating common item groups", () => {
  const delta = paladinHealingDomainGroups(pool, pool, items);
  assert(delta.newIdsBySlot.every((ids) => ids.length === 0));
  assert.deepEqual(
    delta.groups,
    Array.from({ length: 17 }, (_, slot) => "enchant-" + slot),
  );
  assert.throws(() =>
    paladinHealingDomainGroups({ ...pool, schema: "another-class" }, pool, items),
  );
});

test("new jewelry and hand items retain every legal partner and both jewelry orders", () => {
  for (const [group, slots] of [
    ["rings", [10, 11]],
    ["trinkets", [12, 13]],
    ["hands", [14, 15]],
  ]) {
    const referencePool = structuredClone(pool),
      added = new Set();
    const sharedId =
      group === "hands"
        ? undefined
        : pool.slots[slots[0]].find((id) =>
            slots.every(
              (slot) => pool.slots[slot].includes(id) && source.seed.items[slot].id !== id,
            ),
          );
    for (const slot of slots) {
      const id =
        group === "hands"
          ? pool.slots[slot].find((id) => id !== source.seed.items[slot].id)
          : sharedId;
      assert(id);
      referencePool.slots[slot] = referencePool.slots[slot].filter((value) => value !== id);
      added.add(id);
    }
    assert(paladinHealingDomainGroups(referencePool, pool, items).groups.includes(group));
    const rows = [...paladinHealingDomainCandidates({ ...bank, referencePool, group })],
      expected = [...paladinHealingGearCandidates({ ...bank, group })].filter((row) =>
        slots.some(
          (slot) =>
            !referencePool.slots[slot].includes(row.gear.items[slot].id) &&
            row.gear.items[slot].id !== 0,
        ),
      );
    assert.deepEqual(rows.map((row) => row.id).sort(), expected.map((row) => row.id).sort());
    assert(rows.length > 0);
    assert(rows.every((row) => slots.some((slot) => added.has(row.gear.items[slot].id))));
    assert(rows.every((row) => legalPaladinHealingGear(row.gear, items, sources, context)));
    if (group !== "hands") {
      const pairs = new Set(
        rows.map((row) => row.gear.items[slots[0]].id + ":" + row.gear.items[slots[1]].id),
      );
      for (const pair of pairs) assert(pairs.has(pair.split(":").reverse().join(":")));
    }
  }
});

test("a new set piece retains multi-piece threshold crossings with existing pieces", () => {
  const setPiece = [...items.values()].find(
    (item) => item.setId === 516 && pool.slots.some((ids) => ids.includes(item.id)),
  );
  assert(setPiece);
  const referencePool = structuredClone(pool);
  referencePool.slots = referencePool.slots.map((ids) => ids.filter((id) => id !== setPiece.id));
  assert(paladinHealingDomainGroups(referencePool, pool, items).groups.includes("set-516"));
  const rows = [...paladinHealingDomainCandidates({ ...bank, referencePool, group: "set-516" })];
  assert(rows.length > 0);
  assert(rows.every((row) => row.gear.items.some((spec) => spec.id === setPiece.id)));
  assert(
    rows.some(
      (row) => row.gear.items.filter((spec) => items.get(spec.id)?.setId === 516).length === 8,
    ),
  );
});

test("an unavailable hand is repaired as a full legal pair without mutating the starting gear", () => {
  const restricted = structuredClone(pool),
    before = structuredClone(source.seed);
  restricted.slots[14] = restricted.slots[14].filter((id) => id !== source.seed.items[14].id);
  const repairs = [...paladinHealingDomainRepairs({ ...bank, pool: restricted })],
    expected = [...paladinHealingHandCandidates(restricted, items)].filter((pair) => {
      const gear = structuredClone(source.seed);
      gear.items[14] = { id: pair.mainHand };
      gear.items[15] = { id: pair.offHand };
      return legalPaladinHealingGear(gear, items, sources, context);
    });
  assert.equal(repairs.length, expected.length);
  assert(repairs.every((row) => row.changedSlots.join(",") === "14,15"));
  assert(repairs.every((row) => legalPaladinHealingGear(row.gear, items, sources, context)));
  assert(
    repairs.every(
      (row) => !row.gear.items[15].id || items.get(row.gear.items[14].id).handType !== 4,
    ),
  );
  assert.deepEqual(source.seed, before);
});
