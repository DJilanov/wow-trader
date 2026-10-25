import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import { createShamanHealingSpellPolicy } from "./shaman-healing-eligibility.mjs";
import { extractShamanHealingTalentSource } from "./shaman-healing-talents-source.mjs";
import {
  extractShamanHealingResourceActives,
  integrateShamanHealingResourceActives,
  renderShamanHealingResourceActives,
} from "./shaman-healing-resource-actives.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  evidence = fixture("shaman-client-healing-source.v1.json.gz"),
  adapter = fixture("shaman-healing-talents-source.v1.json.gz"),
  bookSource = fixture("healer-spell-eligibility-source.v1.json.gz"),
  books = linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(bookSource.atlas.source),
    tables: new Map(Object.entries(bookSource.tables)),
    source: bookSource.source,
  }),
  domain = extractShamanHealingTalentSource({ evidence, adapter }),
  spellPolicy = createShamanHealingSpellPolicy({ classSource: evidence, books }),
  input = { evidence, domain, spellPolicy },
  source = extractShamanHealingResourceActives(input),
  implementation = String(
    readFileSync(new URL("./shaman-healing-resource-actives.go", import.meta.url)),
  );

test("resource source retains current cooldowns, charges, mana and exact eligible healing masks", () => {
  assert.equal(source.waterShield.cooldownMs, 0);
  assert.equal(source.waterShield.charges, 3);
  assert.equal(source.waterShield.internalCooldownMs, 3500);
  assert.equal(source.waterShield.maximumManaPercent, 2);
  assert.equal(source.waterShield.requiredLevel, 20);
  assert.equal(source.naturesSwiftness.cooldownMs, 180000);
  assert.equal(source.naturesSwiftness.charges, 1);
  assert.equal(source.naturesSwiftness.requiredLevel, 30);
  assert.equal(source.classHealIds.length, 21);
  assert.equal(source.swiftnessEligibleIds.length, 18);
  assert(source.classHealIds.includes(1239243));
  assert(!source.swiftnessEligibleIds.includes(1239243));
  assert(!source.classHealIds.includes(25357));
  assert.deepEqual(
    source.talentMaximums.map((row) => row.length),
    [16, 18, 16],
  );
  assert.equal(source.talentMaximums[2][8], 1);
  assert.equal(source.talentMaximums[2][13], 1);
  assert.equal(source.fullClassAdmission, false);
  assert.equal(source.startsNewClassClock, false);
});

test("resource extraction rejects lost spell masks, policy coverage and source identities", () => {
  const changed = structuredClone(evidence);
  changed.rawTables.SpellClassOptions.find((row) => row.SpellID === 331).SpellClassMask = [
    0, 0, 0, 0,
  ];
  assert.throws(() => extractShamanHealingResourceActives({ ...input, evidence: changed }));
  const wrongPolicy = structuredClone(spellPolicy);
  wrongPolicy.actions = wrongPolicy.actions.filter((row) => row.spellId !== 10396);
  assert.throws(() => extractShamanHealingResourceActives({ ...input, spellPolicy: wrongPolicy }));
  assert.throws(() =>
    extractShamanHealingResourceActives({ ...input, domain: { ...domain, sourceBuild: "other" } }),
  );
});

test("resource renderer preserves numeric source values without aliasing or claiming full builds", () => {
  const before = structuredClone(input),
    rendered = renderShamanHealingResourceActives({ implementation, source });
  assert(!rendered.includes("// KFC_SHAMAN_RESOURCE_ACTIVE_VALUES"));
  assert(rendered.includes("const kfcShamanShieldICDMs = 3500"));
  assert(rendered.includes("const kfcShamanSwiftnessCooldownMs = 180000"));
  assert(rendered.includes("1239243:true"));
  assert.deepEqual(input, before);
  const next = extractShamanHealingResourceActives(input);
  next.classHealIds[0] = 0;
  next.talentMaximums[2][8] = 9;
  assert.notEqual(source.classHealIds[0], 0);
  assert.equal(source.talentMaximums[2][8], 1);
  assert.throws(() => renderShamanHealingResourceActives({ implementation: "", source }));
});

test("actual parent integration extends healer ownership and migrates only its obsolete NS rejection", () => {
  const bytes = readFileSync(
    new URL("./fixtures/shaman-resource-parent-source.v1.json.gz", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "cfabaee0e261eaeb221a35a6641a3c29fe4154631f0c7b8b963a4846fdd33485",
  );
  const parent = JSON.parse(gunzipSync(bytes));
  for (const file of Object.values(parent.files))
    assert.equal(createHash("sha256").update(file.source).digest("hex"), file.byteSha256);
  const original = Object.fromEntries(
      Object.entries(parent.files).map(([name, file]) => [name, file.source]),
    ),
    before = structuredClone(original),
    integrated = integrateShamanHealingResourceActives(original);
  assert.deepEqual(original, before);
  assert(integrated.shaman.includes("if !shaman.KFCControlledHealingActives"));
  assert(
    !integrated.shaman
      .slice(
        integrated.shaman.indexOf("func NewShaman("),
        integrated.shaman.indexOf("var shamanImbues"),
      )
      .includes("KFCControlledHealingActives"),
  );
  assert(integrated.baseline.includes("resto.KFCControlledHealingActives = true"));
  assert(integrated.baseline.includes("resto.registerKFCShamanResourceActives()"));
  assert(
    integrated.passives.includes("validateKFCShamanComponentTalentEncoding(player.TalentsString)"),
  );
  assert(integrated.passives.includes("kfcShamanResourceTalentAllowed(field)"));
  assert.equal(
    integrated.guardTests,
    original.guardTests.replace('"--00000000000001"', '"000000000000005"'),
  );
  assert.throws(() => integrateShamanHealingResourceActives(integrated));
});
