import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import ts from "typescript";
import { patchCombatNativeEntry } from "./combat-native-entry-v2.mjs";
import { combatNativeProfiles } from "./combat-native-profiles.mjs";

const fixture = JSON.parse(
    gunzipSync(
      await readFile(new URL("./fixtures/combat-native-entries.v2.json.gz", import.meta.url)),
    ),
  ),
  payload = `/forever-sim/${"a".repeat(24)}/combat-builds.json`,
  module = `/forever-sim/${"a".repeat(24)}/combat-builds.js`;

test("adapts every actual supported damage-class entry while retaining its constructor and player", () => {
  assert.deepEqual(Object.keys(fixture.entries), Object.keys(combatNativeProfiles));
  for (const [profile, entry] of Object.entries(fixture.entries)) {
    assert.equal(createHash("sha256").update(entry.source).digest("hex"), entry.byteSha256);
    const result = patchCombatNativeEntry(entry.source, profile, payload, module, ts);
    assert(result.includes("__kfcMountCombatLibrary(()=>new "));
    assert.equal(
      ts.createSourceFile("adapted.js", result, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
        .parseDiagnostics.length,
      0,
    );
    assert.throws(
      () => patchCombatNativeEntry(result, profile, payload, module, ts),
      /already adapted/,
    );
  }
});
test("a Mage entry cannot authorize a different class factory or a healing profile", () => {
  for (const profile of ["warrior", "warlock", "shadow_priest", "healing_priest", "__proto__"])
    assert.throws(() =>
      patchCombatNativeEntry(fixture.entries.mage.source, profile, payload, module, ts),
    );
});
test("external payloads and traversal remain blocked", () => {
  assert.throws(() =>
    patchCombatNativeEntry(
      fixture.entries.mage.source,
      "mage",
      payload.replace("combat-builds", "../combat-builds"),
      module,
      ts,
    ),
  );
  assert.throws(() =>
    patchCombatNativeEntry(
      fixture.entries.mage.source,
      "mage",
      payload,
      "https://example.test/library.js",
      ts,
    ),
  );
});
