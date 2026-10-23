import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { healingMetricsContract, renderHealingMetricsSources } from "./healing-metrics-model.mjs";

const bytes = readFileSync(
    new URL("./fixtures/healing-metrics-source.v1.json.gz", import.meta.url),
  ),
  sha = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(bytes), "f0d19cfc6c03545ac49648f3c07637c8f9ee2e79ecd2eaee34abe6b857252ff7");
const fixture = JSON.parse(gunzipSync(bytes, { maxOutputLength: 1_000_000 }).toString("utf8")),
  source = Object.freeze(
    Object.fromEntries(
      Object.entries(fixture.sources).map(([name, entry]) => {
        assert.equal(sha(entry.source), entry.byteSha256, name);
        return [name, entry.source];
      }),
    ),
  );

test("the actual source capture stays separate from healing mechanics admission", () => {
  assert.equal(fixture.schema, "kfc-healing-metrics-source-fixture.v1");
  assert.equal(fixture.parentRelease, "e945e98f232cc81948ee9060");
  assert.equal(fixture.classMechanicsAdmission, false);
  assert.equal(healingMetricsContract.classMechanicsAdmission, false);
  assert.equal(healingMetricsContract.externalHealthGainsCreditTheHealer, false);
  assert.equal(healingMetricsContract.shieldsRequireActualDamageAbsorption, true);
});

test("rendering leaves every original source unchanged and is reproducible", () => {
  const before = globalThis.structuredClone(source),
    first = renderHealingMetricsSources(source);
  assert.deepEqual(source, before);
  assert.deepEqual(first, renderHealingMetricsSources(source));
  assert.deepEqual(Object.keys(first).sort(), Object.keys(source).sort());
  for (const name of Object.keys(source)) assert.notEqual(first[name], source[name]);
  assert.throws(() => renderHealingMetricsSources(first), /anchor changed/);
});

test("new protocol fields use unique numbers across action, unit, party and raid messages", () => {
  const output = renderHealingMetricsSources(source);
  for (const name of ["TargetedActionMetrics", "UnitMetrics", "PartyMetrics", "RaidMetrics"]) {
    const body = output.api.match(new RegExp(`message ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
    assert(body, name);
    const fields = [...body.matchAll(/^\s*[\w<> ,]+\s+(\w+)\s*=\s*(\d+);/gm)];
    assert(fields.length > 0, name);
    assert.equal(new Set(fields.map((row) => row[1])).size, fields.length, name);
    assert.equal(new Set(fields.map((row) => row[2])).size, fields.length, name);
  }
});

for (const [name, anchor] of [
  ["api", "message TargetedActionMetrics {"],
  ["delivery", "func (spell *Spell) dealHealingInternal("],
  ["metrics", "unitMetrics.hps.Total += spellTargetMetrics.TotalHealing"],
  ["raid", "raid.hpsMetrics.doneIteration(sim)"],
  ["concurrent", "baseTgt.Healing += addTgt.Healing"],
])
  test(`refuses an unsupported ${name} source without returning a partial overlay`, () => {
    assert(source[name].includes(anchor));
    assert.throws(
      () =>
        renderHealingMetricsSources({
          ...source,
          [name]: source[name].replace(anchor, "unsupported-source-layout"),
        }),
      /anchor changed|Missing protocol/,
    );
  });
