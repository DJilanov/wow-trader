import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  integrateShamanHealingFullBuild,
  renderShamanHealingFullBuild,
  renderShamanHealingFullBuildTests,
} from "./shaman-healing-full-build.v2.mjs";
import { assertShamanHealingTalentBuild } from "./shaman-healing-talents.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  evidence = fixture("shaman-client-healing-source.v1.json.gz"),
  adapter = fixture("shaman-healing-talents-source.v1.json.gz"),
  implementation = String(readFileSync(new URL("./shaman-healing-full-build.go", import.meta.url))),
  input = { implementation, evidence, adapter },
  rendered = renderShamanHealingFullBuild(input);

test("full-build rendering retains all source positions, classifications and legal seeds", () => {
  const { source } = rendered;
  assert.equal(source.domain.fields.length, 50);
  assert.equal((rendered.implementation.match(/ProtoField:/g) ?? []).length, 50);
  assert.equal(source.requiredLevel, 60);
  assert.equal(source.requiredPoints, 51);
  assert.equal(source.workloadMustValidateFullBuild, true);
  assert.equal(source.partialControlsRetained, true);
  for (const seed of source.seeds) {
    assert.deepEqual(
      assertShamanHealingTalentBuild(source.domain, seed.talentsString),
      seed.fields,
    );
    assert.equal(
      Object.values(seed.fields).reduce((a, b) => a + b, 0),
      51,
    );
    assert.equal(seed.optimized, false);
  }
  for (const key of [
    "fullClassAdmission",
    "numericalQualification",
    "startsNewClassClock",
    "publicationAllowed",
  ])
    assert.equal(source[key], false);
});

test("full-build source rendering rejects layout drift and preserves caller data", () => {
  const before = structuredClone(input);
  renderShamanHealingFullBuild(input);
  assert.deepEqual(input, before);
  const changed = structuredClone(adapter);
  changed.trees[2].talents.at(-1).prereqLocation = null;
  assert.throws(() => renderShamanHealingFullBuild({ ...input, adapter: changed }));
  assert.throws(() => renderShamanHealingFullBuild({ ...input, implementation: "" }));
  const next = renderShamanHealingFullBuild(input);
  next.source.domain.fields[0].maximum = 9;
  assert.notEqual(rendered.source.domain.fields[0].maximum, 9);
});

test("native seed controls use the exact JavaScript-validated source builds", () => {
  const tests = String(
      readFileSync(new URL("./shaman-healing-full-build_test.go", import.meta.url)),
    ),
    output = renderShamanHealingFullBuildTests({ implementation: tests, source: rendered.source });
  for (const seed of rendered.source.seeds)
    assert(output.includes(JSON.stringify(seed.talentsString)));
  assert(!output.includes("// KFC_SHAMAN_HEALING_STUDY_SEEDS"));
  assert.throws(() =>
    renderShamanHealingFullBuildTests({ implementation: "", source: rendered.source }),
  );
});

test("actual factory validates before proto conversion and keeps controlled partial checks", () => {
  const bytes = readFileSync(
    new URL("./fixtures/shaman-full-build-parent-source.v1.json.gz", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "341470693aaa60dd7300d4bcd09664e19ceed6e4fe0477c72c16c16d8d234ad6",
  );
  const parent = JSON.parse(gunzipSync(bytes));
  assert.equal(createHash("sha256").update(parent.source).digest("hex"), parent.byteSha256);
  const output = integrateShamanHealingFullBuild(parent.source);
  assert(output.includes("validateKFCShamanComponentTalentEncoding(player.TalentsString)"));
  assert(
    output.indexOf("validateKFCShamanHealingStudyFactory(player)") <
      output.indexOf("shaman.NewShaman(character"),
  );
  assert(output.includes("if kfcShamanScopedUtilityAllowed(field) { return true }"));
  assert(output.includes("if kfcShamanWaterTalentAllowed(field, value) { return true }"));
  assert.throws(() => integrateShamanHealingFullBuild(output));
});
