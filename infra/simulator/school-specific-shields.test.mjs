import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { renderSchoolSpecificShields } from "./school-specific-shields.mjs";

const input = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/shaman-active-item-source.v1.json.gz", import.meta.url)),
  ),
).code.shield;

test("adds explicit masks and propagates them into the finite pool", () => {
  const output = renderSchoolSpecificShields(input);
  assert(output.includes("AbsorbSchoolMask SpellSchool"));
  assert(output.includes("absorbSchoolMask: config.AbsorbSchoolMask"));
  assert(output.includes("!shield.absorbSchoolMask.Matches(incoming.SpellSchool)"));
  assert(output.includes("shield.absorbSchoolMask != 0"));
  assert(output.includes("index = 0"));
  assert(output.includes("invalid shield absorption school mask"));
});

test("preserves existing pool application, replacement and metric logic", () => {
  const output = renderSchoolSpecificShields(input);
  for (const name of ["RemainingAbsorb", "Apply", "createShields"]) {
    const start = input.indexOf(name + "("),
      next = input.indexOf("\nfunc ", start);
    const body = input.slice(start, next === -1 ? undefined : next);
    if (name !== "createShields") assert(output.includes(body));
  }
  assert(output.includes("result.AbsorbedDamage += amount"));
  assert(output.includes("TotalAbsorbedShielding += amount"));
  assert(output.includes("shield.onDepleted(sim, incoming, result)"));
});

test("rejects repeated or structurally changed source integration", () => {
  assert.throws(() => renderSchoolSpecificShields(renderSchoolSpecificShields(input)));
  assert.throws(() =>
    renderSchoolSpecificShields(input.replace("remainingAbsorb float64", "remainingAbsorb int")),
  );
  assert.throws(() => renderSchoolSpecificShields(input + "\ntype ShieldConfig struct {\n"));
});
