import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import ts from "typescript";
import { patchCombatNativeEntry } from "./combat-native-entry.mjs";
const fixture = JSON.parse(
    gunzipSync(
      await readFile(
        new URL("./fixtures/current-combat-native-library.v1.json.gz", import.meta.url),
      ),
    ),
  ),
  source = fixture.entry.source,
  payload = `/forever-sim/${"a".repeat(24)}/combat-builds.json`,
  module = `/forever-sim/${"a".repeat(24)}/combat-builds.js`;
test("adapts the actual selected Warrior entry without replacing its player or event identity", () => {
  const result = patchCombatNativeEntry(source, "warrior", payload, module, ts);
  assert(result.includes("i.raid.setPlayer(o.nextEventID(),0,e),"));
  assert(
    result.includes("__kfcMountCombatLibrary(()=>new t(document.body,e),()=>o.nextEventID(),"),
  );
  assert.equal(
    ts.createSourceFile("result.js", result, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
      .parseDiagnostics.length,
    0,
  );
});
test("wrong profiles, unexpected constructors, repeated adaptation and escaped paths fail closed", () => {
  assert.throws(() => patchCombatNativeEntry(source, "tank_warrior", payload, module, ts));
  assert.throws(() =>
    patchCombatNativeEntry(
      source.replace("SpecWarrior", "SpecTankWarrior"),
      "warrior",
      payload,
      module,
      ts,
    ),
  );
  assert.throws(() =>
    patchCombatNativeEntry(source + "new t(document.body,e);", "warrior", payload, module, ts),
  );
  const adapted = patchCombatNativeEntry(source, "warrior", payload, module, ts);
  assert.throws(() => patchCombatNativeEntry(adapted, "warrior", payload, module, ts));
  assert.throws(() =>
    patchCombatNativeEntry(
      source,
      "warrior",
      payload.replace("combat-builds", "../combat-builds"),
      module,
      ts,
    ),
  );
  assert.throws(() =>
    patchCombatNativeEntry(source, "warrior", payload, "https://example.test/library.js", ts),
  );
});
