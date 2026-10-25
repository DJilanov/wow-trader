import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { simulationHash as hash } from "./simulation-cache.mjs";
import { applyDruidFeralheartDpsDispatch } from "./druid-feralheart-dps-dispatch.mjs";
import { extendDruidFeralheartCatalog } from "./druid-feralheart-model.mjs";

const root = resolve(import.meta.dirname, "../.."),
  model = JSON.parse(
    readFileSync(
      resolve(
        root,
        "artifacts/forever-simulator/optimization/mage-full-raid-model-v1/context.json",
      ),
    ),
  ),
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(hash(model), "f51c94d2c23307628b4b89cf95c60bbbbb07a47de3a6df3ccb4d83a2d8849157");

function parentSource(path) {
  const full = model.workspace + "/" + path,
    pin = model.sourcePins.find((row) => row.path === full),
    bytes = readFileSync(resolve(root, full));
  assert(pin, "Missing frozen DPS parent input " + path);
  assert.equal(sha(bytes), pin.byteSha256);
  return bytes.toString();
}

const base = {
  itemSets: parentSource("sim/core/item_sets.go"),
  foreverSets: parentSource("sim/core/forever_equipment_sets.go"),
};

test("current DPS dispatch preserves every existing exact-ID handler and isolates Feralheart 513", () => {
  const before = globalThis.structuredClone(base),
    patched = applyDruidFeralheartDpsDispatch(base);
  assert.deepEqual(base, before);
  for (const name of [
    "kfcSorcererBonuses",
    "kfcBeastmasterBonuses",
    "kfcDarkmantleBonuses",
    "kfcValorBonuses",
    "kfcForeverDungeonManaBonuses",
    "kfcFeralheartBonuses",
  ])
    assert.equal(patched.itemSets.split("character." + name + "()").length, 2, name);
  assert.match(
    patched.foreverSets,
    /if id == 513 \{ return kfcFeralheartBonusSupported\(id, pieces\) \}/,
  );
  assert.match(patched.foreverSets, /if id == 513 \{ continue \}/);
  assert(!patched.foreverSets.includes("if id == 1667"));
  assert.equal(
    patched.itemSets.replace(
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcFeralheartBonuses()...)",
      "",
    ),
    base.itemSets,
  );
});

test("changed, duplicate and repeated DPS dispatch sources fail without mutating caller inputs", () => {
  assert.throws(() => applyDruidFeralheartDpsDispatch(applyDruidFeralheartDpsDispatch(base)));
  for (const change of [
    (value) => {
      value.itemSets = value.itemSets.replace("character.kfcSorcererBonuses()", "changed()");
    },
    (value) => {
      value.foreverSets += "\nfunc overridesForeverEquipmentSet(id int32) bool {";
    },
    (value) => {
      value.foreverSets = value.foreverSets.replace("for _, id := range ids {", "changed {");
    },
  ]) {
    const source = globalThis.structuredClone(base);
    change(source);
    const before = globalThis.structuredClone(source);
    assert.throws(() => applyDruidFeralheartDpsDispatch(source));
    assert.deepEqual(source, before);
  }
});

test("the actual complete DPS database accepts exactly eight current Feralheart additions", () => {
  const databasePath = model.databasePath,
    bytes = readFileSync(resolve(root, databasePath)),
    expected = model.generatedInputs.find((row) => row.path === databasePath);
  assert(expected, "Missing frozen DPS database pin");
  assert.equal(sha(bytes), expected.byteSha256);
  const parent = JSON.parse(bytes),
    before = JSON.stringify(parent),
    evidence = JSON.parse(
      gunzipSync(
        readFileSync(new URL("./fixtures/druid-feralheart-source.v1.json.gz", import.meta.url)),
      ),
    ),
    result = extendDruidFeralheartCatalog(parent, evidence);
  assert.equal(parent.items.length, 2695);
  assert.equal(result.db.items.length, 2703);
  assert.equal(JSON.stringify(parent), before);
  assert.deepEqual(result.db.items.slice(0, parent.items.length), parent.items);
  for (const key of Object.keys(parent).filter((key) => key !== "items"))
    assert.deepEqual(result.db[key], parent[key], key);
  assert.deepEqual(
    result.additions.map((row) => row.id),
    [22106, 22107, 22108, 22109, 22110, 22111, 22112, 22113],
  );
  assert.equal(result.numericalReuseAllowed, false);
  assert.equal(result.publicationAllowed, false);
});
