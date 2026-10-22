import assert from "node:assert/strict";
import { test } from "node:test";
import { auditWeaponLoadout } from "./weapon-audit.mjs";

function fixture(overrides = {}) {
  const item = {
    id: 1,
    name: "Test weapon",
    type: 13,
    handType: 1,
    stats: Array(44).fill(0),
    ...overrides,
  };
  const gear = { items: Array.from({ length: 17 }, () => ({})) };
  gear.items[14] = { id: item.id, enchant: 2568 };
  return { profile: "shadow_priest", playerClass: 5, gear, items: [item] };
}

test("flags a caster's melee-style main hand without removing its universal crit", () => {
  const input = fixture();
  input.items[0].stats[19] = 1;
  const before = JSON.stringify(input);
  const audit = auditWeaponLoadout(input);
  assert.deepEqual(audit.findings, [
    { code: "caster-main-hand-needs-explicit-comparison", slot: 14, itemId: 1 },
  ]);
  assert.equal(audit.weapons[0].stats.universalItemCrit, 1);
  assert.equal(JSON.stringify(input), before);
});

test("generic and school-specific spell power are distinguished", () => {
  const input = fixture();
  input.items[0].stats[11] = 19;
  assert.deepEqual(auditWeaponLoadout(input).findings, []);
  assert.equal(auditWeaponLoadout(input).weapons[0].stats.relevantSchoolPower, 19);
  input.profile = "smite_priest";
  assert.equal(
    auditWeaponLoadout(input).findings[0].code,
    "caster-main-hand-needs-explicit-comparison",
  );
  input.items[0].stats[42] = 30;
  assert.deepEqual(auditWeaponLoadout(input).findings, []);
});

test("does not treat physical proc weapons or feral stat sticks as caster errors", () => {
  for (const [profile, playerClass] of [
    ["warrior", 9],
    ["rogue", 6],
    ["feral_druid", 1],
  ]) {
    assert.deepEqual(auditWeaponLoadout({ ...fixture(), profile, playerClass }).findings, []);
  }
});

test("a Fire-only weapon does not silently pass the Frost weapon review", () => {
  const input = { ...fixture(), profile: "mage", variant: "frost", playerClass: 3 };
  input.items[0].stats[7] = 40;
  assert.equal(
    auditWeaponLoadout(input).findings[0].code,
    "caster-main-hand-needs-explicit-comparison",
  );
  input.variant = "fire";
  assert.deepEqual(auditWeaponLoadout(input).findings, []);
});

test("checks paired-hand geometry and explicit wearer restrictions", () => {
  const input = fixture({ handType: 4, classAllowlist: [9] });
  input.gear.items[15] = { id: 2 };
  input.items.push({ id: 2, name: "Off hand", type: 13, handType: 3, stats: Array(44).fill(0) });
  assert(auditWeaponLoadout(input).findings.some((row) => row.code === "two-hand-plus-off-hand"));
  assert(
    auditWeaponLoadout(input).findings.some((row) => row.code === "explicit-class-restriction"),
  );
});

test("fails closed on missing items, partial loadouts and non-finite stats", () => {
  assert.throws(() => auditWeaponLoadout({ ...fixture(), items: [] }), /missing from/);
  assert.throws(() => auditWeaponLoadout({ ...fixture(), gear: { items: [] } }), /17-slot/);
  const input = fixture();
  input.items[0].stats[5] = Number.NaN;
  assert.throws(() => auditWeaponLoadout(input), /Non-finite/);
});
