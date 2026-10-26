import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  assertShamanHealingConsumeCandidate,
  collectShamanHealingEnchants,
  shamanHealingConsumeCandidates,
} from "./shaman-healing-improvements.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name + ".json.gz", import.meta.url))));
const equipment = fixture("shaman-healing-equipment-source.v1");
const { enchants } = fixture("druid-healing-enchants-source.v1");
const types = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14];
const slots = types.map((type) =>
  equipment.items.filter((row) => row.type === type).map((row) => row.id),
);
const input = { items: equipment.items, slots, enchants };

test("Shaman enchants preserve all supplied slot/item pairs and exclude the known raid recipes", () => {
  const domain = collectShamanHealingEnchants(input);
  assert.equal(domain.itemSlots.length, slots.flat().length);
  for (const row of domain.itemSlots) assert(row.noEnchantAllowed);
  assert(!domain.enchants.some((row) => [22749, 22750, 25079].includes(row.spellId)));
  assert(domain.enchants.some((row) => row.effectId === 2566));
  assert(domain.enchants.some((row) => row.effectId === 1898 && row.status === "provisional"));
  assert.equal(domain.statPruning, false);
  assert.equal(domain.physicalProcReferencesRequireNoOffensiveActions, true);
});

test("shield, held-offhand, class and slot restrictions remain attached to each enchant", () => {
  const domain = collectShamanHealingEnchants(input);
  const byKey = new Map(domain.enchants.map((row) => [row.key, row]));
  for (const row of domain.itemSlots) {
    const item = equipment.items.find((item) => item.id === row.itemId);
    if (item.weaponType === 5) assert.deepEqual(row.enchantKeys, []);
    if (item.weaponType === 7)
      assert(!row.enchantKeys.some((key) => [1898, 1900, 2564].includes(byKey.get(key).effectId)));
    if ([1, 10, 11, 12, 13, 16].includes(row.slot)) assert.deepEqual(row.enchantKeys, []);
    for (const key of row.enchantKeys) {
      const enchant = byKey.get(key);
      assert(!enchant.classAllowlist.length || enchant.classAllowlist.includes(7));
    }
  }
});

test("ambiguous, changed profession and nonfinite enchant data cannot silently narrow the domain", () => {
  for (const edit of [
    (value) => {
      value.slots[0].push(value.slots[0][0]);
    },
    (value) => {
      value.slots[0].push(999999999);
    },
    (value) => {
      Object.values(value.enchants)[0].requiredProfession = 4;
    },
    (value) => {
      Object.values(value.enchants)[0].stats[0] = NaN;
    },
  ]) {
    const changed = structuredClone(input);
    edit(changed);
    assert.throws(() => collectShamanHealingEnchants(changed));
  }
});

test("enchants retain source status and independently owned caller data", () => {
  const before = structuredClone(input),
    first = collectShamanHealingEnchants(input);
  first.enchants[0].stats[0] = 999;
  assert.deepEqual(input, before);
  const second = collectShamanHealingEnchants(input);
  assert.notEqual(second.enchants[0].stats[0], 999);
  assert.equal(second.currentClassRuntimeAdmission, false);
  assert.equal(second.numericalQualification, false);
});

test("all 1320 nonraid consume contexts remain available, including the no-consume control", () => {
  const rows = [...shamanHealingConsumeCandidates()];
  assert.equal(rows.length, 1320);
  assert.equal(new Set(rows.map((row) => JSON.stringify(row))).size, 1320);
  for (const row of rows) {
    assertShamanHealingConsumeCandidate(row);
    assert(Object.isFrozen(row));
  }
  assert(rows.some((row) => Object.values(row).every((value) => value === 0)));
  assert(!rows.some((row) => row.food === 5));
});

test("raid oils, raid food, unknown fields and nonfinite consumes are rejected", () => {
  const [base] = shamanHealingConsumeCandidates();
  for (const changes of [
    { food: 5 },
    { mainHandImbue: 21 },
    { defaultPotion: 99 },
    { manaRegenElixir: NaN },
    { extra: 0 },
  ])
    assert.throws(() => assertShamanHealingConsumeCandidate({ ...base, ...changes }));
});
