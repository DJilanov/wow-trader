import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { assertForeverBrowserCapture } from "./forever-capture-context.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/forever-capture-context.v1.json.gz", import.meta.url)),
  ),
);

test("rejects all fifteen actual Classic-mode Warrior browser captures", () => {
  assert.equal(fixture.schema, "kfc-forever-browser-capture-context.v1");
  assert.equal(fixture.cases.length, 15);
  assert.equal(new Set(fixture.cases.map((entry) => entry.label)).size, 15);
  for (const entry of fixture.cases) {
    assert.equal(entry.settings.settings.ruleset ?? 0, 0);
    assert.equal(entry.request.simOptions.ruleset ?? 0, 0);
    assert.throws(
      () => assertForeverBrowserCapture(entry.settings, entry.request),
      /UI settings/,
      entry.label,
    );
  }
});

test("changing a captured wire to Forever cannot repair its Classic UI provenance", () => {
  for (const entry of fixture.cases) {
    const request = structuredClone(entry.request);
    request.simOptions.ruleset = "RulesetForever";
    assert.throws(
      () => assertForeverBrowserCapture(entry.settings, request),
      /UI settings/,
      entry.label,
    );
  }
});

test("Forever UI metadata cannot qualify a Classic request", () => {
  for (const entry of fixture.cases) {
    const settings = structuredClone(entry.settings);
    settings.settings.ruleset = "RulesetForever";
    assert.throws(
      () => assertForeverBrowserCapture(settings, entry.request),
      /request must execute/,
      entry.label,
    );
  }
});

test("accepts explicit Forever mode in decoded messages and canonical protobuf JSON", () => {
  for (const selected of [1, "RulesetForever"])
    for (const executed of [1, "RulesetForever"])
      assertForeverBrowserCapture(
        { settings: { ruleset: selected } },
        { simOptions: { ruleset: executed } },
      );
});

test("rejects missing, Classic, unknown and incorrectly typed UI modes", () => {
  for (const selected of [undefined, 0, 2, "RulesetClassic", "1", true])
    assert.throws(
      () =>
        assertForeverBrowserCapture(
          { settings: { ruleset: selected } },
          { simOptions: { ruleset: 1 } },
        ),
      /UI settings/,
    );
  assert.throws(
    () => assertForeverBrowserCapture(undefined, { simOptions: { ruleset: 1 } }),
    /UI settings/,
  );
});

test("rejects missing, Classic, unknown and incorrectly typed request modes", () => {
  for (const executed of [undefined, 0, 2, "RulesetClassic", "1", true])
    assert.throws(
      () =>
        assertForeverBrowserCapture(
          { settings: { ruleset: 1 } },
          { simOptions: { ruleset: executed } },
        ),
      /request must execute/,
    );
  assert.throws(
    () => assertForeverBrowserCapture({ settings: { ruleset: 1 } }, undefined),
    /request must execute/,
  );
});

test("does not add a ruleset or modify rejected capture evidence", () => {
  const entry = structuredClone(fixture.cases[0]);
  const before = structuredClone(entry);
  assert.throws(() => assertForeverBrowserCapture(entry.settings, entry.request));
  assert.deepEqual(entry, before);
});
