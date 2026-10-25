import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  applyMageSorcererDispatch,
  applyMageSorcererArmorDependency,
  applyMageSorcererDiminishingReturns,
} from "./mage-sorcerer-dispatch.mjs";

const fixture = JSON.parse(
    gunzipSync(
      await readFile(new URL("./fixtures/mage-sorcerer-source.v1.json.gz", import.meta.url)),
    ),
  ),
  base = {
    itemSets: fixture.engine["core/item_sets.go"],
    foreverSets: fixture.engine["core/forever_equipment_sets.go"],
  };

test("exact base-ID dispatch preserves existing class handlers and the same-name alternate", () => {
  const before = structuredClone(base),
    patched = applyMageSorcererDispatch(base);
  assert.deepEqual(base, before);
  assert.equal(patched.itemSets.split("character.kfcSorcererBonuses()").length, 2);
  for (const name of ["kfcBeastmasterBonuses", "kfcDarkmantleBonuses", "kfcValorBonuses"])
    assert.equal(patched.itemSets.split("character." + name + "()").length, 2);
  assert.match(
    patched.foreverSets,
    /if id == 517 \{ return kfcSorcererBonusSupported\(id, pieces\) \}/,
  );
  assert.match(patched.foreverSets, /if id == 517 \{ continue \}/);
  assert(!patched.foreverSets.includes("if id == 1671"));
});

test("changed, ambiguous or already-patched dispatch inputs fail without mutation", () => {
  assert.throws(() => applyMageSorcererDispatch(applyMageSorcererDispatch(base)));
  for (const change of [
    (value) => {
      value.itemSets = value.itemSets.replace("character.kfcBeastmasterBonuses()", "changed()");
    },
    (value) => {
      value.foreverSets += "\nfunc overridesForeverEquipmentSet(id int32) bool {";
    },
    (value) => {
      value.foreverSets = value.foreverSets.replace("for _, id := range ids {", "changed {");
    },
  ]) {
    const source = structuredClone(base);
    change(source);
    const before = structuredClone(source);
    assert.throws(() => applyMageSorcererDispatch(source));
    assert.deepEqual(source, before);
  }
});

test("bonus armor is restored only in Forever initialization, before stat finalization", () => {
  const source = "func (mage *Mage) Initialize() {\n\tregisterSpells()\n}",
    patched = applyMageSorcererArmorDependency(source);
  assert.match(patched, /if mage.Env.IsForever\(\) \{/);
  assert.match(patched, /AddStatDependency\(stats.BonusArmor, stats.Armor, 1\)/);
  assert(patched.indexOf("AddStatDependency") < patched.indexOf("registerSpells"));
  assert.throws(() => applyMageSorcererArmorDependency(patched));
  assert.throws(() => applyMageSorcererArmorDependency(source + source));
});

test("current mask4 adds shared group3 without replacing existing root/proc-stun groups or DR policy", () => {
  const source =
      "CrowdControlDRRoot     int32 = 1\nCrowdControlDRStunProc int32 = 10\nif group != CrowdControlDRRoot && group != CrowdControlDRStunProc {\n}",
    patched = applyMageSorcererDiminishingReturns(source);
  assert.match(patched, /CrowdControlDRStun {5}int32 = 3/);
  assert.match(
    patched,
    /group != CrowdControlDRRoot && group != CrowdControlDRStun && group != CrowdControlDRStunProc/,
  );
  assert.match(patched, /CrowdControlDRStunProc int32 = 10/);
  assert.throws(() => applyMageSorcererDiminishingReturns(patched));
  assert.throws(() =>
    applyMageSorcererDiminishingReturns(source.replace("int32 = 1", "int32 = 2")),
  );
});
