import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { extractShamanElementsSource, renderShamanElements } from "./shaman-elements.mjs";

const read = (path) => String(readFileSync(new URL(path, import.meta.url))),
  parent =
    "../../artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-healing-relics-v1/f63687c632e47e148b934f2ed206fe286398f457e458f815169e3df903016e0b/build-6hiTA9/workspace/";
const evidence = JSON.parse(
    gunzipSync(
      readFileSync(new URL("fixtures/shaman-shared-equipment-source.v1.json.gz", import.meta.url)),
    ),
  ),
  extension = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("fixtures/shaman-shared-equipment-text-source.v1.json.gz", import.meta.url),
      ),
    ),
  );

test("current Elements has exact 2/3/4/5/6 thresholds and distinct explicit proc assumptions", () => {
  const source = extractShamanElementsSource(evidence, extension);
  assert.equal(source.proc.pieces, 5);
  assert.equal(source.proc.power, 65);
  assert.equal(source.proc.clientProcChance, 1);
  assert.equal(source.proc.durationMs, 10000);
  assert.equal(source.proc.rawRootFamily.SpellClassSet, 10);
  assert.equal(source.serverProcRateVerified, false);
  assert.equal(source.procRoutingVerified, false);
  assert.equal(source.disarm.classification, "inactive-in-declared-post-mitigation-assignment");
  assert.equal(source.itemIds.length, 8);
  assert.equal(source.publicationAllowed, false);
});

test("new conditions, thresholds, flat channels, duration or reused-family changes require review", () => {
  for (const mutate of [
    (data) => {
      data.tables.SpellAuraOptions.find((row) => row.SpellID === 450626).ProcChance = 4;
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 27775).EffectBasePointsF = 130;
    },
    (data) => {
      data.lookups.SpellDuration.find((row) => row.id === 1).Duration = 20000;
    },
    (data) => {
      data.tables.SpellClassOptions.find((row) => row.SpellID === 450626).SpellClassSet = 11;
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 9346).EffectMiscValue[0] = 0;
    },
  ]) {
    const changed = structuredClone(extension);
    mutate(changed);
    assert.throws(() => extractShamanElementsSource(evidence, changed));
  }
});

test("owned proc integration preserves existing flat bonus dispatch and rejects duplicate integration", () => {
  const input = {
      implementation: read("shaman-elements.go"),
      actor: read(parent + "sim/shaman/restoration/kfc_baseline.go"),
      coreSets: read(parent + "sim/core/item_sets.go"),
      evidence,
      extension,
    },
    before = structuredClone(input),
    rendered = renderShamanElements(input);
  assert.deepEqual(input, before);
  assert(rendered.actor.includes("kfcElements"));
  assert(rendered.coreSets.includes("KFCShamanAdditionalHealingSetBonuses"));
  assert(rendered.coreSets.includes("character.foreverEquippedBonuses()"));
  assert.equal(rendered.rules.proc.buffId, 27775);
  assert.throws(() => renderShamanElements({ ...input, ...rendered }));
  for (const key of ["implementation", "actor", "coreSets"])
    assert.throws(() => renderShamanElements({ ...input, [key]: "" }));
});
