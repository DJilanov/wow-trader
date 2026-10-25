import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractShamanHealingTalentSource,
  extractShamanHealingPassiveSource,
} from "./shaman-healing-talents-source.mjs";
import {
  extractShamanHealingWaterSource,
  integrateShamanHealingWaterTotems,
  renderShamanHealingWaterTotems,
} from "./shaman-healing-water-source.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  evidence = fixture("shaman-client-healing-source.v1.json.gz"),
  adapter = fixture("shaman-healing-talents-source.v1.json.gz"),
  domain = extractShamanHealingTalentSource({ evidence, adapter }),
  passives = extractShamanHealingPassiveSource({ evidence, domain }),
  input = { evidence, domain, passives },
  source = extractShamanHealingWaterSource(input),
  implementation = String(readFileSync(new URL("./shaman-healing-water.go", import.meta.url)));

test("water source preserves five Stream and four Tide ranks with source-bound costs and effects", () => {
  assert.equal(source.ranks.length, 9);
  const stream = source.ranks.filter((row) => row.family === "healing-stream"),
    tide = source.ranks.filter((row) => row.family === "mana-tide");
  assert.equal(stream.length, 5);
  assert.deepEqual(
    tide.map((row) => [row.id, row.mana, row.amount, row.requiredLevel]),
    [
      [16190, 10, 88, 25],
      [17354, 20, 133, 38],
      [17359, 30, 197, 48],
      [1325256, 60, 290, 58],
    ],
  );
  assert(source.ranks.every((row) => row.totemicFocusAffectsCost && !row.purificationAffectsPulse));
  assert(stream.every((row) => row.restorativeTotemsAffectsPulse));
  assert(tide.every((row) => !row.restorativeTotemsAffectsPulse));
  assert.deepEqual(source.costReductionByRank, [0, -5, -10, -15, -20, -25]);
  assert.deepEqual(source.healingStreamBonusByRank, [0, 10, 20, 30, 40, 50]);
  assert.equal(source.fullClassAdmission, false);
  assert.equal(source.serverRecipientScopeVerified, false);
  assert.equal(source.firstPulseTimingVerified, false);
  assert.equal(source.startsNewClassClock, false);
});

test("water source rejects changed summon masks, healing masks and invented Purification eligibility", () => {
  const changedEvidence = structuredClone(evidence);
  changedEvidence.rawTables.SpellClassOptions.find(
    (row) => row.SpellID === 10461,
  ).SpellClassMask[0] = 16384;
  assert.throws(() => extractShamanHealingWaterSource({ ...input, evidence: changedEvidence }));
  const changedPassives = structuredClone(passives);
  changedPassives.talents.find((row) => row.field === "purification").effects[0].mask[0] |= 8192;
  assert.throws(() => extractShamanHealingWaterSource({ ...input, passives: changedPassives }));
  const wrongCosts = structuredClone(passives);
  wrongCosts.talents.find((row) => row.field === "totemicFocus").effects[0].byRank[5] = -30;
  assert.throws(() => extractShamanHealingWaterSource({ ...input, passives: wrongCosts }));
});

test("water source and renderer do not mutate or alias captured client evidence", () => {
  const before = structuredClone(input),
    rendered = renderShamanHealingWaterTotems({ implementation, source });
  assert(!rendered.includes("// KFC_SHAMAN_WATER_TOTEM_VALUES"));
  assert.equal((rendered.match(/Family:"healing-stream"/g) ?? []).length, 5);
  assert.equal((rendered.match(/Family:"mana-tide"/g) ?? []).length, 4);
  assert.deepEqual(input, before);
  const changed = extractShamanHealingWaterSource(input);
  changed.ranks[0].summonMask[0] = 0;
  changed.costReductionByRank[5] = 0;
  assert.equal(source.ranks[0].summonMask[0], 524288);
  assert.equal(source.costReductionByRank[5], -25);
  assert.throws(() => renderShamanHealingWaterTotems({ implementation: "", source }));
});

test("actual parent integration replaces only explicit water boundaries behind a default-false flag", () => {
  const bytes = readFileSync(
    new URL("./fixtures/shaman-water-parent-source.v1.json.gz", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "9cc5be86360ff77b9c4f0dc39fa693a878d55880da44372cdb19a251158ae27d",
  );
  const parent = JSON.parse(gunzipSync(bytes));
  for (const file of Object.values(parent.files))
    assert.equal(createHash("sha256").update(file.source).digest("hex"), file.byteSha256);
  const original = Object.fromEntries(
      Object.entries(parent.files).map(([name, row]) => [name, row.source]),
    ),
    before = structuredClone(original),
    integrated = integrateShamanHealingWaterTotems(original);
  assert.deepEqual(original, before);
  assert(integrated.shaman.includes("KFCControlledWaterTotems bool"));
  assert.equal((integrated.shaman.match(/if !shaman.KFCControlledWaterTotems/g) ?? []).length, 2);
  const constructor = integrated.shaman.slice(
    integrated.shaman.indexOf("func NewShaman("),
    integrated.shaman.indexOf("var shamanImbues"),
  );
  assert(!constructor.includes("KFCControlledWaterTotems"));
  assert(integrated.baseline.includes("resto.KFCControlledWaterTotems = true"));
  assert(integrated.baseline.includes("resto.registerKFCShamanWaterTotems()"));
  assert(integrated.passives.includes("kfcShamanWaterTalentAllowed(field, value)"));
  assert.throws(() => integrateShamanHealingWaterTotems(integrated));
});
