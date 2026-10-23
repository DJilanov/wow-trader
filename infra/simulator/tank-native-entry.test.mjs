import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { patchTankNativeEntry } from "./tank-native-entry.mjs";

const source =
  'import{TankWarriorSimUI as Tank}from"./sim-engine.chunk.js";import{T as Event}from"./core.js";const player=new Player(S.SpecTankWarrior,sim);raid.setPlayer(Event.nextEventID(),0,player),new Tank(document.body,player);';
const payload = `/forever-sim/${"a".repeat(24)}/tank-builds.json`,
  module = `/forever-sim/${"a".repeat(24)}/tank-builds.js`;
test("entry adapter owns exactly the known tank instance and preserves player creation", () => {
  const result = patchTankNativeEntry(source, "tank_warrior", payload, module, ts);
  assert(result.includes("raid.setPlayer(Event.nextEventID(),0,player),"));
  assert(
    result.includes(
      "__kfcMountTankLibrary(()=>new Tank(document.body,player),()=>Event.nextEventID(),",
    ),
  );
  assert.equal(
    ts.createSourceFile("output.js", result, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
      .parseDiagnostics.length,
    0,
  );
});
test("changed entry signatures, event calls and repeat adaptation fail closed", () => {
  assert.throws(
    () =>
      patchTankNativeEntry(
        source
          .replace(",new Tank", ",save(new Tank")
          .replace("(document.body,player);", "(document.body,player));"),
        "tank_warrior",
        payload,
        module,
        ts,
      ),
    /unused/,
  );
  assert.throws(
    () => patchTankNativeEntry(source, "protection_paladin", payload, module, ts),
    /profile/,
  );
  assert.throws(() =>
    patchTankNativeEntry(
      source.replace("document.body", "document.documentElement"),
      "tank_warrior",
      payload,
      module,
      ts,
    ),
  );
  assert.throws(
    () =>
      patchTankNativeEntry(source + "Event.nextEventID();", "tank_warrior", payload, module, ts),
    /identity/,
  );
  assert.throws(() =>
    patchTankNativeEntry(source, "tank_warrior", payload + "/../escape.json", module, ts),
  );
  assert.throws(
    () =>
      patchTankNativeEntry(
        patchTankNativeEntry(source, "tank_warrior", payload, module, ts),
        "tank_warrior",
        payload,
        module,
        ts,
      ),
    /already/,
  );
});
test("Druid's minified export alias is resolved through its module and profile player", () => {
  const druid = source
    .replace("TankWarriorSimUI as Tank", "F as Minified")
    .replaceAll("SpecTankWarrior", "SpecFeralTankDruid")
    .replace("new Tank(document.body,player)", "new Minified(document.body,player)");
  const result = patchTankNativeEntry(druid, "feral_tank_druid", payload, module, ts);
  assert(result.includes("()=>new Minified(document.body,player)"));
  assert.throws(
    () =>
      patchTankNativeEntry(
        druid.replace(
          "new Minified(document.body,player)",
          "new Minified(document.body,otherPlayer)",
        ),
        "feral_tank_druid",
        payload,
        module,
        ts,
      ),
    /profile player/,
  );
});
