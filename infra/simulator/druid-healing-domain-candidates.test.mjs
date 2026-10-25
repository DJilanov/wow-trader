import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { collectDruidHealingEquipment, legalDruidHealingGear } from "./druid-healing-equipment.mjs";
import {
  druidHealingDomainGroups,
  druidHealingDomainCandidates,
  druidHealingDomainRepairs,
} from "./druid-healing-domain-candidates.mjs";

function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum);
  return JSON.parse(gunzipSync(bytes));
}
const source = fixture(
    "druid-healing-gear-bank-source.v1.json.gz",
    "444cc59f2fc397ab10d9380c201baa59cb561ab08f7b0553f7a18730d716169f",
  ),
  inspection = fixture(
    "druid-healing-enchants-source.v1.json.gz",
    "9d6425e608685a4d78d70c0db0dd827a2d2fcc93f511adee659166032e2c9e2e",
  ),
  items = new Map(source.items.map((row) => [row.id, row])),
  sources = new Map(source.sources.map((row) => [row.id, row])),
  referenceContext = {
    ...source.context,
    currentIds: new Set(),
    originalItems: source.seed.items.map((row) => items.get(row.id)),
  },
  referencePool = collectDruidHealingEquipment(items, sources, referenceContext),
  base = {
    items,
    sources,
    inspection,
    enchantPolicy: { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: [] },
    referencePool,
  };
function bank(faction, professions) {
  const context = {
    ...referenceContext,
    faction,
    factionName: faction === 1 ? "Alliance" : "Horde",
    professions,
  };
  return {
    ...base,
    context,
    pool: collectDruidHealingEquipment(items, sources, context),
    gear: source.seed,
  };
}
test("new faction necks and both jewelry orders are included without repeating common pairs", () => {
  const input = bank(2, [4, 11]),
    groups = druidHealingDomainGroups(referencePool, input.pool, items);
  assert(groups.newIdsBySlot[1].includes(19534));
  assert(groups.groups.includes("rings"));
  const necks = [...druidHealingDomainCandidates({ ...input, group: "slot-1" })];
  assert(necks.some((row) => row.gear.items[1].id === 19534));
  const rings = [...druidHealingDomainCandidates({ ...input, group: "rings" })];
  assert(rings.some((row) => row.gear.items[10].id === 19518));
  assert(rings.some((row) => row.gear.items[11].id === 19518));
  assert(
    rings.every(
      (row) =>
        groups.newIdsBySlot[10].includes(row.gear.items[10].id) ||
        groups.newIdsBySlot[11].includes(row.gear.items[11].id),
    ),
  );
  assert(rings.every((row) => legalDruidHealingGear(row.gear, items, sources, input.context)));
});
test("new profession items and weapon styles remain candidates regardless of damage stats", () => {
  const input = bank(1, [8, 11]),
    groups = druidHealingDomainGroups(referencePool, input.pool, items);
  assert(groups.newIdsBySlot.flat().includes(227803));
  assert(
    [...druidHealingDomainCandidates({ ...input, group: "slot-4" })].some(
      (row) => row.gear.items[4].id === 227803,
    ),
  );
  const horde = bank(2, [4, 11]),
    hands = [...druidHealingDomainCandidates({ ...horde, group: "hands" })];
  assert(hands.some((row) => row.gear.items[14].id === 19566 && row.gear.items[15].id === 0));
  assert(hands.some((row) => row.gear.items[14].id === 19542 && row.gear.items[15].id !== 0));
});
test("missing Tailoring boots are replaced by every legal available boot", () => {
  const input = bank(1, [4, 8]),
    gear = structuredClone(source.seed);
  gear.items[9] = { id: 227862, enchant: 851 };
  assert.equal(legalDruidHealingGear(gear, items, sources, input.context), false);
  const rows = [...druidHealingDomainRepairs({ ...input, gear })];
  assert.deepEqual(
    rows.map((row) => row.gear.items[9].id).sort((a, b) => a - b),
    input.pool.slots[9],
  );
  assert(rows.every((row) => JSON.stringify(row.changedSlots) === "[9]"));
  assert(rows.every((row) => legalDruidHealingGear(row.gear, items, sources, input.context)));
  assert(
    rows.every((row) =>
      row.gear.items.slice(0, 9).every((item, slot) => item.id === gear.items[slot].id),
    ),
  );
});
test("unchanged pools only require enchant review and retain a legal seed exactly", () => {
  const input = bank(1, [4, 11]),
    coverage = druidHealingDomainGroups(referencePool, input.pool, items);
  assert(coverage.newIdsBySlot.every((ids) => ids.length === 0));
  assert(coverage.groups.every((name) => name.startsWith("enchant-")));
  assert.deepEqual(
    [...druidHealingDomainRepairs(input)].map((row) => row.gear),
    [source.seed],
  );
});
