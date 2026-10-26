import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { paladinHealingGearCandidates } from "./paladin-healing-gear-bank.mjs";
import { paladinHealingQuestTradeCandidates } from "./paladin-healing-quest-trades.mjs";
import {
  collectPaladinHealingEquipment,
  legalPaladinHealingGear,
  paladinHealingHandCandidates,
} from "./paladin-healing-equipment.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

function fixture(name, expected) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  return JSON.parse(gunzipSync(bytes));
}
const source = fixture(
    "paladin-healing-quest-trades-source.v1.json.gz",
    "7dc245885a9ea3279d589499fec16a96f294d913f473f8d9dd299be66bf35014",
  ),
  inspection = fixture(
    "druid-healing-enchants-source.v1.json.gz",
    "9d6425e608685a4d78d70c0db0dd827a2d2fcc93f511adee659166032e2c9e2e",
  ),
  items = new Map(source.items.map((row) => [row.id, row])),
  sources = new Map(source.sources.map((row) => [row.id, row])),
  context = {
    ...source.context,
    currentIds: new Set(),
    originalItems: Array(17).fill(undefined),
  },
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

test("the actual Fordring reward conflict is explored through legal neck/ring trades", () => {
  assert(pool.slots[1].includes(15411));
  assert(source.seed.items.slice(10, 12).some((row) => row.id === 16058));
  const ordinary = [...paladinHealingGearCandidates({ ...bank, group: "slot-1" })];
  assert(!ordinary.some((row) => row.gear.items[1].id === 15411));
  const trades = [...paladinHealingQuestTradeCandidates(bank)].filter(
    (row) => row.trade.anchorItemId === 15411,
  );
  assert(trades.length > 0);
  for (const row of trades) {
    assert.equal(row.gear.items[1].id, 15411);
    assert(!row.gear.items.some((spec) => spec.id === 16058));
    assert(legalPaladinHealingGear(row.gear, items, sources, context));
    assert.equal(simulationHash(row.gear), row.id);
    assert.equal(row.trade.anchorItemId, 15411);
    assert.deepEqual(row.trade.displacedSlots, [11]);
  }
  const expected = pool.slots[11].filter((id) => {
    const gear = structuredClone(source.seed);
    gear.items[1] = { id: 15411 };
    gear.items[11] = { id };
    return legalPaladinHealingGear(gear, items, sources, context);
  });
  assert.deepEqual(
    trades.map((row) => row.gear.items[11].id).sort((a, b) => a - b),
    expected,
  );
  assert(trades.some((row) => row.gear.items[11].id === 942));
});

test("a trade preserves all unrelated items, enchants and source objects", () => {
  const before = structuredClone(source.seed),
    sourceBefore = JSON.stringify([...sources]);
  const rows = [...paladinHealingQuestTradeCandidates(bank)];
  for (const row of rows)
    for (const [slot, spec] of source.seed.items.entries())
      if (![row.trade.anchorSlot, ...row.trade.displacedSlots].includes(slot))
        assert.deepEqual(row.gear.items[slot], spec);
  assert.deepEqual(source.seed, before);
  assert.equal(JSON.stringify([...sources]), sourceBefore);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
});

test("already compatible reward selections do not produce a fabricated trade", () => {
  const gear = structuredClone(source.seed);
  gear.items[11] = { id: 942 };
  assert(legalPaladinHealingGear(gear, items, sources, context));
  assert.deepEqual([...paladinHealingQuestTradeCandidates({ ...bank, gear })], []);
});

test("illegal seeds and unreviewed enchants are rejected before proposing repairs", () => {
  const illegal = structuredClone(source.seed);
  illegal.items[1] = { id: 15411 };
  assert.throws(() => [...paladinHealingQuestTradeCandidates({ ...bank, gear: illegal })]);
  const badEnchant = structuredClone(source.seed);
  badEnchant.items[14].enchant = 999999999;
  assert.throws(
    () => [...paladinHealingQuestTradeCandidates({ ...bank, gear: badEnchant })],
    /Unreviewed seed enchant/,
  );
});

const handSource = fixture(
  "paladin-healing-quest-hands-source.v1.json.gz",
  "bb44a6986042f96289aa3cb15e59f1eeb0eb4fd3d0fadf97a39db28ab6b04ac9",
);
function handBank(gear) {
  const allItems = new Map([...source.items, ...handSource.items].map((row) => [row.id, row])),
    allSources = new Map([...source.sources, ...handSource.sources].map((row) => [row.id, row]));
  return {
    ...bank,
    gear,
    items: allItems,
    sources: allSources,
    pool: collectPaladinHealingEquipment(allItems, allSources, context),
  };
}

test("trading the two-handed quest weapon repairs the complete main/off-hand pair", () => {
  const gear = structuredClone(source.seed);
  gear.items[14] = { id: 20504 };
  gear.items[15] = { id: 0 };
  const input = handBank(gear);
  assert(legalPaladinHealingGear(gear, input.items, input.sources, context));
  const rows = [...paladinHealingQuestTradeCandidates(input)].filter(
    (row) => row.trade.anchorSlot === 10 && row.trade.anchorItemId === 20505,
  );
  assert(rows.length > 1);
  assert(rows.some((row) => row.gear.items[15].id !== 0));
  assert(rows.some((row) => input.items.get(row.gear.items[14].id).handType === 4));
  const expected = [...paladinHealingHandCandidates(input.pool, input.items)].filter((pair) => {
    const proposal = structuredClone(gear);
    proposal.items[10] = { id: 20505 };
    proposal.items[14] = { id: pair.mainHand };
    proposal.items[15] = { id: pair.offHand };
    return legalPaladinHealingGear(proposal, input.items, input.sources, context);
  });
  assert.deepEqual(
    new Set(rows.map((row) => row.gear.items[14].id + ":" + row.gear.items[15].id)),
    new Set(expected.map((row) => row.mainHand + ":" + row.offHand)),
  );
  for (const row of rows) {
    assert(!row.gear.items.some((spec) => spec.id === 20504));
    assert(legalPaladinHealingGear(row.gear, input.items, input.sources, context));
    assert.deepEqual(row.trade.displacedSlots, [14]);
    if (input.items.get(row.gear.items[14].id).handType === 4)
      assert.equal(row.gear.items[15].id, 0);
  }
});

test("choosing the two-handed reward replaces its conflicting ring and clears the held item", () => {
  const gear = structuredClone(source.seed);
  gear.items[10] = { id: 20505 };
  const input = handBank(gear);
  assert(legalPaladinHealingGear(gear, input.items, input.sources, context));
  const rows = [...paladinHealingQuestTradeCandidates(input)].filter(
    (row) => row.trade.anchorSlot === 14 && row.trade.anchorItemId === 20504,
  );
  assert(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.gear.items[14].id, 20504);
    assert.equal(row.gear.items[15].id, 0);
    assert(!row.gear.items.some((spec) => spec.id === 20505));
    assert(legalPaladinHealingGear(row.gear, input.items, input.sources, context));
  }
  assert.deepEqual(gear.items[15], source.seed.items[15]);
});
