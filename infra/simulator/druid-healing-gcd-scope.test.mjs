import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  extractDruidHealingGCDScope,
  renderDruidHealingGCDScope,
} from "./druid-healing-gcd-scope.mjs";

const evidence = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/druid-client-healing-source.v1.json.gz", import.meta.url)),
    ),
  ),
  scope = extractDruidHealingGCDScope(evidence);
test("the client GCD mask excludes Swiftmend while retaining other healing families", () => {
  assert.deepEqual(scope.excluded, [18562]);
  assert.equal(scope.included.length, 38);
  for (const id of [9889, 9858, 9841, 9863, 1238215]) assert(scope.included.includes(id));
  assert.equal(scope.reductionPercent, 10);
});
test("scope rendering preserves the parent implementation and changes only the extra GCD condition", () => {
  const source = readFileSync(new URL("./druid-healing-advanced.go", import.meta.url), "utf8"),
    derived = renderDruidHealingGCDScope(source, scope);
  assert(source.includes("if spell.DefaultCast.GCD > 0 {"));
  assert(derived.includes("kfcDruidGraceGCDSpells[spell.ActionID.SpellID]"));
  assert.throws(() => renderDruidHealingGCDScope("no import or scope", scope));
});
