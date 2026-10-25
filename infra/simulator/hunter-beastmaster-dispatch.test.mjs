import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { applyHunterBeastmasterDispatch } from "./hunter-beastmaster-dispatch.mjs";
import { applyWarriorHeroismDispatch } from "./warrior-heroism-model.mjs";

const fixture = JSON.parse(
    gunzipSync(
      await readFile(new URL("./fixtures/hunter-beastmaster-source.v1.json.gz", import.meta.url)),
    ),
  ),
  source = {
    itemSets: fixture.engine["core/item_sets.go"],
    foreverSets: fixture.engine["core/forever_equipment_sets.go"],
  };

test("base-ID dispatch composes with existing Darkmantle and an independently prepared Heroism override", () => {
  const before = globalThis.structuredClone(source),
    patched = applyHunterBeastmasterDispatch(source);
  assert.deepEqual(source, before);
  for (const next of [
    patched,
    applyHunterBeastmasterDispatch(applyWarriorHeroismDispatch(source)),
    applyWarriorHeroismDispatch(patched),
  ]) {
    assert.equal(next.itemSets.split("character.kfcBeastmasterBonuses()").length, 2);
    assert.equal(next.itemSets.split("character.kfcDarkmantleBonuses()").length, 2);
    assert.match(next.foreverSets, /if id == 515 \{ continue \}/);
    assert.match(next.foreverSets, /if id == 515 \{ return true \}/);
    assert(!next.foreverSets.includes("if id == 1669"));
  }
});

test("repeated, missing and ambiguous anchors fail before source mutation", () => {
  assert.throws(() => applyHunterBeastmasterDispatch(applyHunterBeastmasterDispatch(source)));
  for (const mutate of [
    (x) => {
      x.itemSets = x.itemSets.replace("character.kfcValorBonuses()", "renamed()");
    },
    (x) => {
      x.foreverSets = x.foreverSets.replace("func overridesForeverEquipmentSet", "func renamed");
    },
    (x) => {
      x.foreverSets += "\nfunc ForeverEquipmentBonusSupported(id, pieces int32) bool {";
    },
  ]) {
    const changed = globalThis.structuredClone(source);
    mutate(changed);
    const before = globalThis.structuredClone(changed);
    assert.throws(() => applyHunterBeastmasterDispatch(changed));
    assert.deepEqual(changed, before);
  }
});
