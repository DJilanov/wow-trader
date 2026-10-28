import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { updatePriestHealingCooldowns } from "./priest-healing-cooldowns.mjs";

const bytes = await readFile(
  new URL("./fixtures/priest-healing-cooldowns-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "47c9beaf9c27d1b0dac516b8ff6a5efbd78fd7bb1f85abd5cd9c1e6c447db588",
);
const fixture = JSON.parse(gunzipSync(bytes));
assert.equal(fixture.schema, "kfc-priest-healing-cooldowns-source.v1");
assert.equal(
  fixture.source.librarySha256,
  "194461a8f95a71ca85bfe997a38a0b3a4b07e6bd8bb4b6a0239bdb7d3bf5ae01",
);
const options = (row) => ({
  baseline: row.cooldowns,
  gear: row.gear,
  defaultConjured: row.defaultConjured,
  troll: row.troll,
});

test("all 40 authentic presets retain their exact activation order and thresholds", () => {
  assert.equal(fixture.cases.length, 40);
  for (const row of fixture.cases) {
    const before = structuredClone(row);
    assert.deepEqual(updatePriestHealingCooldowns(options(row)), row.cooldowns, row.id);
    assert.deepEqual(row, before);
  }
});
test("equipping and removing each admitted active item updates its cooldown", () => {
  for (const [owner, spellId, itemId] of [
    [11819, 15604],
    [18371, 1302205],
    [13143, 17252],
    [272439, undefined, 272439],
  ]) {
    const equipped = fixture.cases.find((row) => row.gear.some((item) => item.id === owner));
    const unequipped = fixture.cases.find((row) => !row.gear.some((item) => item.id === owner));
    assert(equipped && unequipped);
    const matches = (policy) => (spellId ? policy.spellId === spellId : policy.itemId === itemId);
    assert(
      updatePriestHealingCooldowns({ ...options(unequipped), gear: equipped.gear }).some(matches),
    );
    assert(
      !updatePriestHealingCooldowns({ ...options(equipped), gear: unequipped.gear }).some(matches),
    );
  }
});
test("race and Demonic Rune choices update ownership in both directions", () => {
  const row = fixture.cases[0];
  const human = updatePriestHealingCooldowns({ ...options(row), troll: false, defaultConjured: 0 });
  assert(!human.some((policy) => policy.spellId === 20554 || policy.itemId === 12662));
  const troll = updatePriestHealingCooldowns({
    ...options(row),
    baseline: human,
    troll: true,
    defaultConjured: 2,
  });
  assert(troll.some((policy) => policy.spellId === 20554));
  assert(troll.some((policy) => policy.itemId === 12662));
  assert.equal(troll[0].spellId, 20554);
});
test("changed conditions, unknown actions and duplicate policies require a new review", () => {
  const row = fixture.cases[0];
  for (const baseline of [
    [...row.cooldowns, row.cooldowns[0]],
    [...row.cooldowns, { spellId: 99999999, requireHealingDemand: true }],
    row.cooldowns.map((policy) =>
      policy.itemId === 13444 ? { ...policy, minimumMissingMana: 0 } : policy,
    ),
    row.cooldowns.filter((policy) => policy.itemId !== 13444),
  ])
    assert.throws(() => updatePriestHealingCooldowns({ ...options(row), baseline }));
  assert.throws(() => updatePriestHealingCooldowns({ ...options(row), gear: [] }));
});
