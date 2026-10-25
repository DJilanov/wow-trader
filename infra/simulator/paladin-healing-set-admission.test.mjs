import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinHealingSetAdmission,
  renderPaladinHealingSetAdmission,
} from "./paladin-healing-set-admission.mjs";

const json = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url))));
const source = json("paladin-healing-sets-source.v1.json.gz");
const targets = json("paladin-healing-set-targets.v1.json.gz");
const generated = gunzipSync(
  readFileSync(
    new URL("./fixtures/paladin-healing-sets-generated-parent.v1.txt.gz", import.meta.url),
  ),
).toString();
const rules = extractPaladinHealingSetAdmission(source, generated, targets.text);

test("Paladin admission accounts for all 134 thresholds and retains the thirteen scoped effects", () => {
  assert.equal(rules.sets.length, 43);
  assert.equal(
    rules.sets.reduce((sum, row) => sum + row.thresholds.length, 0),
    134,
  );
  assert.equal(rules.decisions.length, 13);
  assert.equal(rules.remainingUnclassifiedThresholds, 0);
  assert(rules.decisions.every((row) => row.retainedInEquipmentDomain));
  assert.equal(rules.globalOtherClassSupportChanged, false);
  assert.equal(rules.assignmentScoringRequired, "external-demand-v1");
  assert.equal(rules.publicationAllowed, false);
});

test("Paladin admission distinguishes cast mana,control removal,enemy recipients and movement", () => {
  assert.equal(
    rules.decisions.filter((row) => row.classification === "existing-runtime-qualified").length,
    2,
  );
  assert.equal(rules.decisions.find((row) => row.setId === 185).kind, "movement");
  assert.equal(rules.decisions.find((row) => row.setId === 81).kind, "hostile-reflection");
  assert.equal(rules.decisions.find((row) => row.setId === 188).kind, "hostile-control");
  assert.deepEqual(rules.sets.find((row) => row.id === 516).thresholds, [2, 4, 6, 8]);
  assert(!rules.sets.some((row) => row.id === 1673));
  assert.equal(rules.sets.find((row) => row.id === 444).profession, 2);
});

test("Paladin metadata rendering changes only the optional names hook,not application", () => {
  const implementation = readFileSync(
    new URL("./paladin-healing-set-admission.go", import.meta.url),
    "utf8",
  );
  const result = renderPaladinHealingSetAdmission(rules, implementation, source.integration.sets);
  assert(result.implementation.includes('Name:"Soulforge Armor"'));
  assert(result.coreSets.includes("provider.KFCReviewedHealingEquipmentSetNames()"));
  const before = source.integration.sets.slice(
    0,
    source.integration.sets.indexOf("func (character *Character) GetActiveSetBonusNames()"),
  );
  assert(result.coreSets.startsWith(before));
  assert(result.coreSets.includes("activeSetBonus.BonusEffect(agent)"));
  assert(!result.coreSets.includes("ForeverEquipmentBonusSupported"));
  assert.throws(() => renderPaladinHealingSetAdmission(rules, implementation, "unexpected parent"));
});

test("Paladin admission rejects changed enemy targeting,utility payloads and reference definitions", () => {
  for (const change of [
    (copy) => {
      copy.tables.SpellEffect.find((row) => row.SpellID === 1302715).ImplicitTarget[0] = 1;
    },
    (copy) => {
      copy.tables.SpellEffect.find((row) => row.SpellID === 1302707).EffectAura = 192;
    },
    (copy) => {
      copy.tables.SpellEffect.find((row) => row.SpellID === 450554).EffectBasePointsF = 300;
    },
  ]) {
    const copy = structuredClone(source);
    change(copy);
    assert.throws(() => extractPaladinHealingSetAdmission(copy, generated, targets.text));
  }
  assert.throws(() =>
    extractPaladinHealingSetAdmission(source, generated, targets.text.replace("= 6,", "= 7,")),
  );
});
