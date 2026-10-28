import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import ts from "typescript";
import { withTankRulesetIdentity } from "./tank-native-ruleset.mjs";

const source = await readFile(new URL("./tank-native-library.ts", import.meta.url), "utf8"),
  derived = withTankRulesetIdentity(source, ts),
  fixture = JSON.parse(
    gunzipSync(
      await readFile(
        new URL("./fixtures/current-tank-ruleset-identity.v1.json.gz", import.meta.url),
      ),
    ),
  );
async function identity(input) {
  const result = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  return (
    await import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString("base64")}`)
  ).tankCombatIdentity;
}
const oldIdentity = await identity(source),
  currentIdentity = await identity(derived);
test("new tank references distinguish Classic and Forever in all six recorded Warrior contexts", () => {
  assert.equal(
    fixture.source.byteSha256,
    "22dc237872a9a8232460989e198388aa28cf731e61727b1ed78db0b32b1c04c0",
  );
  assert.equal(fixture.settings.length, 6);
  for (const { proto } of fixture.settings) {
    const classic = structuredClone(proto);
    classic.settings.ruleset = 0;
    assert.equal(oldIdentity(proto), oldIdentity(classic));
    assert.notEqual(currentIdentity(proto), currentIdentity(classic));
  }
});
test("sampling and display changes preserve the reference while gear changes invalidate it", () => {
  for (const { proto } of fixture.settings) {
    const changed = structuredClone(proto);
    changed.player.name = "Saved tank";
    changed.settings.iterations = 32;
    changed.settings.fixedRngSeed = "1";
    assert.equal(currentIdentity(proto), currentIdentity(changed));
    changed.player.equipment.items[0].id = 0;
    assert.notEqual(currentIdentity(proto), currentIdentity(changed));
  }
});
test("ambiguous and repeated source adaptation fail closed", () => {
  assert.throws(() => withTankRulesetIdentity(derived, ts), /already applied/);
  assert.throws(
    () =>
      withTankRulesetIdentity(
        source.replace("function tankCombatIdentity(", "function renamedIdentity("),
        ts,
      ),
    /Expected one/,
  );
  assert.throws(
    () =>
      withTankRulesetIdentity(
        source +
          "\nexport function tankCombatIdentity(settings: TankNativeProto): string { return ''; }",
        ts,
      ),
    /Expected one/,
  );
});
