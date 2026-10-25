import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { eligiblePrebis } from "./prebis-pool.mjs";
import {
  collectPriestHealingEquipment,
  eligiblePriestHealingItem,
  legalPriestHealingGear,
  priestHealingHandCandidates,
} from "./priest-healing-equipment.mjs";

const bytes = readFileSync(
  new URL("./fixtures/priest-healing-equipment-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "a503d972cdcaadcdc3f38ab6a6208062c161b3fe3c3dde632cad2478705c615d",
);
const captured = JSON.parse(gunzipSync(bytes)),
  items = new Map(captured.items.map((row) => [row.id, row])),
  sources = new Map(captured.sources.map((row) => [row.id, row])),
  context = {
    ...captured.context,
    currentIds: new Set(),
    originalItems: captured.seed.items.map((row) => items.get(row.id)),
  },
  pool = collectPriestHealingEquipment(items, sources, context);

test("source-backed collection covers all 17 slots without quality or stat pruning", () => {
  assert.equal(captured.selectedRowsAreSourceSubsets, true);
  assert.equal(pool.slots.length, 17);
  assert(pool.slots.every((slot) => slot.length > 0));
  assert(pool.slots[12].includes(1490)); // A real green trinket with no healing power.
  assert(pool.slots[14].includes(2848)); // A real low-level physical mace remains a candidate.
  assert(pool.slots[12].includes(11819)); // Second Wind has real healing power plus a use effect.
  assert(pool.slots[10].includes(19325)); // PvP acquisition remains allowed.
  assert.equal(pool.statPruning, false);
  assert.equal(pool.qualityPruning, false);
  assert.equal(pool.weaponStyleLocked, false);
  assert.equal(pool.classMechanicsAdmission, false);
  assert.equal(pool.publicationAllowed, false);
});

test("the healer adapter admits both hand styles instead of inheriting the DPS APL lock", () => {
  assert.equal(context.originalItems[14].handType, 4);
  assert.equal(eligiblePrebis(items.get(13964), sources.get(13964), context, 14), false);
  assert.equal(eligiblePriestHealingItem(items.get(13964), sources.get(13964), context, 14), true);
  assert.equal(eligiblePrebis(items.get(6341), sources.get(6341), context, 15), false);
  assert.equal(eligiblePriestHealingItem(items.get(6341), sources.get(6341), context, 15), true);
  assert(pool.slots[14].includes(1155));
  assert(pool.slots[14].includes(2816));
});

test("complete gear accepts staff and one-hand/off-hand alternatives and rejects illegal pairing", () => {
  const gear = globalThis.structuredClone(captured.seed);
  assert(legalPriestHealingGear(gear, items, sources, context));
  gear.items[15] = { id: 6341 };
  assert.equal(legalPriestHealingGear(gear, items, sources, context), false);
  gear.items[14] = { id: 13964 };
  assert(legalPriestHealingGear(gear, items, sources, context));
  gear.items[15] = { id: 1936 };
  assert.equal(legalPriestHealingGear(gear, items, sources, context), false);
  gear.items[15] = { id: 0 };
  assert(legalPriestHealingGear(gear, items, sources, context));
  gear.items[15].enchant = 1;
  assert.equal(legalPriestHealingGear(gear, items, sources, context), false);
});

test("Priest hand rules reject shields, two-hand maces, off-hand weapons and held items in main hand", () => {
  const mace = items.get(2816),
    source = sources.get(2816);
  for (const change of [
    { handType: 4 },
    { weaponType: 7, handType: 3 },
    { weaponType: 5, handType: 3 },
    { weaponType: 2, handType: 3 },
  ])
    assert.equal(eligiblePriestHealingItem({ ...mace, ...change }, source, context, 14), false);
  assert.equal(eligiblePriestHealingItem(mace, source, context, 15), false);
  assert.equal(eligiblePriestHealingItem(items.get(6341), sources.get(6341), context, 14), false);
});

test("raid-dependent materials, explicit raid zones and unknown acquisition stay excluded", () => {
  assert.equal(sources.get(19682).craftAudit.status, "raid-dependent");
  assert(!pool.slots[4].includes(19682));
  assert.equal(eligiblePriestHealingItem(items.get(19682), sources.get(19682), context, 4), false);
  const item = items.get(2816),
    source = sources.get(2816);
  assert.equal(
    eligiblePriestHealingItem(
      item,
      { ...source, sources: [{ kind: "dungeon", zoneId: 3429 }] },
      context,
      14,
    ),
    false,
  );
  assert.equal(eligiblePriestHealingItem(item, undefined, context, 14), false);
  assert.equal(
    eligiblePriestHealingItem(item, { ...source, requiredLevel: undefined }, context, 14),
    false,
  );
  assert.equal(
    eligiblePriestHealingItem(item, { ...source, requiredLevel: 61 }, context, 14),
    false,
  );
});

test("the hand-style override preserves class, faction, profession and race restrictions", () => {
  const item = items.get(2816),
    source = sources.get(2816);
  assert.equal(
    eligiblePriestHealingItem({ ...item, classAllowlist: [9] }, source, context, 14),
    false,
  );
  assert.equal(
    eligiblePriestHealingItem({ ...item, factionRestriction: 2 }, source, context, 14),
    false,
  );
  assert.equal(
    eligiblePriestHealingItem({ ...item, requiredProfession: 1 }, source, context, 14),
    false,
  );
  assert.equal(
    eligiblePriestHealingItem(
      item,
      { ...source, sources: [{ kind: "pvp", faction: "Horde" }] },
      context,
      14,
    ),
    false,
  );
  assert.equal(
    eligiblePriestHealingItem(item, { ...source, raceMasks: [1, 0] }, context, 14),
    false,
  );
  assert.equal(context.currentIds.size, 0);
});

test("whole-gear checks preserve unique and quest reward ownership constraints", () => {
  const gear = globalThis.structuredClone(captured.seed);
  gear.items[10] = { id: 1156 };
  gear.items[11] = { id: 1156 };
  assert.equal(legalPriestHealingGear(gear, items, sources, context), false);
  gear.items[10] = { id: 942 };
  gear.items[11] = { id: 942 };
  assert(legalPriestHealingGear(gear, items, sources, context));
  const changedItems = new Map(items),
    changedSources = new Map(sources);
  for (const id of [942, 1156]) {
    changedItems.set(id, { ...items.get(id), sources: [{ quest: { id: 9999 } }] });
    changedSources.set(id, {
      ...sources.get(id),
      questChoice: "test-mutated-exclusive-reward",
      sources: [{ kind: "dungeon-quest", questId: 9999 }],
    });
  }
  gear.items[11] = { id: 1156 };
  assert.equal(legalPriestHealingGear(gear, changedItems, changedSources, context), false);
});

test("hand candidates include the complete Cartesian alternatives and never staff plus off-hand", () => {
  const pairs = [...priestHealingHandCandidates(pool, items)],
    staves = pool.slots[14].filter((id) => items.get(id).handType === 4),
    oneHand = pool.slots[14].filter((id) => items.get(id).handType !== 4);
  assert.equal(pairs.length, staves.length + oneHand.length * (pool.slots[15].length + 1));
  assert.equal(new Set(pairs.map((row) => `${row.mainHand}/${row.offHand}`)).size, pairs.length);
  for (const pair of pairs) {
    if (items.get(pair.mainHand).handType === 4) assert.equal(pair.offHand, 0);
    const gear = globalThis.structuredClone(captured.seed);
    gear.items[14] = { id: pair.mainHand };
    gear.items[15] = { id: pair.offHand };
    assert(legalPriestHealingGear(gear, items, sources, context));
  }
});

test("malformed and incomplete loadouts are rejected without expanding to unsupported classes", () => {
  assert.equal(legalPriestHealingGear({ items: [] }, items, sources, context), false);
  const gear = globalThis.structuredClone(captured.seed);
  gear.items[3] = { id: 0 };
  assert.equal(legalPriestHealingGear(gear, items, sources, context), false);
  gear.items[3] = { id: -1 };
  assert.equal(legalPriestHealingGear(gear, items, sources, context), false);
  assert.throws(
    () => collectPriestHealingEquipment(items, sources, { ...context, playerClass: 4 }),
    /Priest-only/,
  );
  assert.throws(() =>
    collectPriestHealingEquipment(items, sources, { ...context, requireCraftAudit: false }),
  );
});

test("pool order is stable and source data and ownership context are not mutated", () => {
  const before = JSON.stringify(captured),
    originalItems = context.originalItems.slice();
  assert.deepEqual(collectPriestHealingEquipment(items, sources, context), pool);
  assert.equal(JSON.stringify(captured), before);
  assert.deepEqual(context.originalItems, originalItems);
  assert.equal(context.currentIds.size, 0);
  for (const slot of pool.slots)
    assert.deepEqual(
      slot,
      slot.slice().sort((a, b) => a - b),
    );
});
