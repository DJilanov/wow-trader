import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinBlessingOfLight,
  renderPaladinBlessingOfLight,
  integratePaladinBlessingOfLight,
} from "./paladin-blessing-of-light.mjs";

const fixture = JSON.parse(
  gunzipSync(
    await readFile(
      new URL("./fixtures/paladin-blessing-of-light-source.v1.json.gz", import.meta.url),
    ),
  ),
);

test("Blessing of Light retains captured ranks and explicitly uncertain server rules", () => {
  const data = extractPaladinBlessingOfLight(fixture);
  assert.deepEqual(
    data.ranks.map((row) => [row.spellId, row.holyLight, row.flashOfLight]),
    [
      [19977, 210, 60],
      [19978, 300, 85],
      [19979, 400, 115],
      [25890, 400, 115],
    ],
  );
  assert.equal(data.healingRanks.length, 15);
  assert(data.healingRanks.every((row) => ![20473, 1311606, 25914].includes(row.spellId)));
  assert.equal(data.serverMechanicsVerified, false);
  assert.equal(data.classMechanicsAdmission, false);
});

test("Blessing of Light rejects changed values, missing ranks and unsupported payload scope", () => {
  for (const mutate of [
    (f) => {
      f.tables.SpellEffect[0].EffectBasePointsF += 1;
    },
    (f) => {
      f.tables.SpellName.pop();
    },
    (f) => {
      f.tables.SpellEffect[0].EffectTriggerSpell = 1;
    },
    (f) => {
      f.healingRanks[0].name = "Holy Shock";
    },
    (f) => {
      f.healingRanks[0].spellId = f.healingRanks[1].spellId;
    },
  ]) {
    const copy = structuredClone(fixture);
    mutate(copy);
    assert.throws(() => extractPaladinBlessingOfLight(copy));
  }
});

test("Blessing of Light rendering checks exact integration anchors", async () => {
  const implementation = String(
    await readFile(new URL("./paladin-blessing-of-light.go", import.meta.url)),
  );
  const rendered = renderPaladinBlessingOfLight({
    implementation,
    blessing: extractPaladinBlessingOfLight(fixture),
  });
  assert(rendered.includes("19979:{60,400,115,3600000}"));
  assert(!rendered.includes("// KFC_PALADIN_BLESSING_OF_LIGHT_VALUES"));
  assert.throws(() =>
    renderPaladinBlessingOfLight({
      implementation: "",
      blessing: extractPaladinBlessingOfLight(fixture),
    }),
  );
  assert.throws(() => integratePaladinBlessingOfLight({ baseline: "", workload: "" }));
});
