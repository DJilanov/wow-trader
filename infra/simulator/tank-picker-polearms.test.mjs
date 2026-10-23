import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { patchTankPickerPolearms } from "./tank-picker-polearms.mjs";

const table = `const weapons = {
  [Classes.ClassDruid]: [
    {weaponType: Weapons.WeaponTypeDagger},
    {weaponType: Weapons.WeaponTypeFist},
    {weaponType: Weapons.WeaponTypeMace, canUseTwoHand: true},
    {weaponType: Weapons.WeaponTypeOffHand},
    {weaponType: Weapons.WeaponTypeStaff, canUseTwoHand: true},
  ],
  [Classes.ClassPaladin]: [{weaponType: Weapons.WeaponTypeSword}],
};`;

test("presentation patch adds two-handed polearms only to the known Druid table", () => {
  const patched = patchTankPickerPolearms(table, ts);
  assert.equal(patched.matched, 1);
  assert.equal(patched.modified, 1);
  assert(patched.source.includes("{weaponType:Weapons.WeaponTypePolearm,canUseTwoHand:true}"));
  assert(
    patched.source.includes("[Classes.ClassPaladin]: [{weaponType: Weapons.WeaponTypeSword}]"),
  );
  const second = patchTankPickerPolearms(patched.source, ts);
  assert.equal(second.matched, 1);
  assert.equal(second.modified, 0);
  assert.equal(second.source, patched.source);
});

test("minified aliases do not control Druid proficiency admission", () => {
  const minified = table.replaceAll("Classes", "c").replaceAll("Weapons", "F");
  const patched = patchTankPickerPolearms(minified, ts);
  assert.equal(patched.modified, 1);
  assert(patched.source.includes("weaponType:F.WeaponTypePolearm"));
});

test("changed or ambiguous weapon tables require review rather than a guessed patch", () => {
  assert.throws(
    () => patchTankPickerPolearms(table.replace("WeaponTypeStaff", "WeaponTypeSword"), ts),
    /table changed/,
  );
  assert.throws(
    () => patchTankPickerPolearms(table + table.replace("const weapons", "const otherWeapons"), ts),
    /Ambiguous/,
  );
});

test("unrelated class arrays and other chunks remain byte-identical", () => {
  const source = "const armor = {[C.ClassDruid]:[1,2]}; const item={weaponType:W.WeaponTypeStaff};";
  assert.deepEqual(patchTankPickerPolearms(source, ts), { source, matched: 0, modified: 0 });
});
