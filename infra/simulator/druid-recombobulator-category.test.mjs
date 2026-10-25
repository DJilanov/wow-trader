import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { renderDruidRecombobulatorCategory } from "./druid-recombobulator-category.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/druid-utility-items-source.v1.json.gz", import.meta.url)),
  ),
);
const implementation = readFileSync(
  new URL("./druid-recombobulator-use.go", import.meta.url),
  "utf8",
);

test("reviewed Druid category shares the existing actor timer without changing other behavior", () => {
  const before = structuredClone(source),
    rendered = renderDruidRecombobulatorCategory(source, implementation);
  assert.deepEqual(source, before);
  assert.equal(rendered.rules.category, 1153);
  assert.equal(rendered.rules.personalCooldownMs, 300000);
  assert.equal(
    rendered.implementation.replace("resto.GetConjuredCD()", "resto.NewTimer()"),
    implementation,
  );
});

test("changed item category or cooldown needs a fresh review", () => {
  for (const field of ["SpellCategoryID", "CategoryCoolDownMSec", "CoolDownMSec"]) {
    const copy = structuredClone(source);
    copy.tables.ItemEffect.find((row) => row.SpellID === 23064)[field]++;
    assert.throws(() => renderDruidRecombobulatorCategory(copy, implementation));
  }
});

test("missing, duplicate or previously corrected timer anchors fail closed", () => {
  assert.throws(() => renderDruidRecombobulatorCategory(source, ""));
  assert.throws(() => renderDruidRecombobulatorCategory(source, implementation + implementation));
  assert.throws(() =>
    renderDruidRecombobulatorCategory(
      source,
      renderDruidRecombobulatorCategory(source, implementation).implementation,
    ),
  );
});
