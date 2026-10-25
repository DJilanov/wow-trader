import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinSoulforgeRules,
  extendPaladinSoulforgeCatalog,
  renderPaladinSoulforge,
} from "./paladin-soulforge.mjs";
const fixture = JSON.parse(
  gunzipSync(
    await readFile(new URL("./fixtures/paladin-soulforge-source.v1.json.gz", import.meta.url)),
  ),
);

test("Soulforge uses exact current base bonuses and keeps melee-only procs outside healing", () => {
  const rules = extractPaladinSoulforgeRules(fixture);
  assert.equal(rules.setId, 516);
  assert.equal(rules.excludedVariant, 1673);
  assert.equal(rules.resistancesAtTwo, 8);
  assert.equal(rules.attackPowerAtSix, 40);
  assert.equal(rules.bonusArmorAtEight, 200);
  assert.deepEqual(rules.fourPiece.procTypeMask, [4, 0]);
  assert.equal(rules.classMechanicsAdmission, false);
});
test("Soulforge adds all eight current records with Paladin and Alliance quest ownership", () => {
  const parent = { items: [] },
    result = extendPaladinSoulforgeCatalog(parent, fixture);
  assert.equal(result.additions.length, 8);
  assert.equal(result.sources.length, 8);
  for (const item of result.additions) {
    assert.deepEqual(item.classAllowlist, [4]);
    assert.equal(item.factionRestriction, 1);
    assert.equal(item.setId, 516);
    assert.equal(item.armorType, 4);
  }
  assert.deepEqual(
    result.additions.map((item) => item.stats[5]),
    [12, 12, 8, 14, 11, 14, 11, 12],
  );
  assert(
    result.sources.every(
      (row) => row.requiredLevel === 58 && row.sources[0].faction === "Alliance",
    ),
  );
  assert.deepEqual(parent, { items: [] });
  assert.equal(result.publicationAllowed, false);
  assert.throws(() => extendPaladinSoulforgeCatalog(result.db, fixture));
});
test("Soulforge refuses merged variants, new bonus formulas and unverified reward-choice semantics", () => {
  for (const mutate of [
    (f) => {
      f.normalized.sets.find((s) => s.id === 516).id = 1673;
    },
    (f) => {
      f.tables.SpellEffect.find((r) => r.SpellID === 14049).EffectBasePointsF = 41;
    },
    (f) => {
      f.tables.SpellAuraOptions.find((r) => r.SpellID === 27498).ProcTypeMask = [81920, 0];
    },
    (f) => {
      f.acquisition.relations[0].rewardDelivery = "choice";
    },
    (f) => {
      f.questEvidence[0].requiredClasses = 1024;
    },
    (f) => {
      f.itemRewardEvidence[0].questRewards = [];
    },
  ]) {
    const copy = structuredClone(fixture);
    mutate(copy);
    assert.throws(() => extractPaladinSoulforgeRules(copy));
  }
});
test("Soulforge rendering requires the exact template marker", async () => {
  const implementation = String(await readFile(new URL("./paladin-soulforge.go", import.meta.url)));
  assert(
    renderPaladinSoulforge({
      implementation,
      rules: extractPaladinSoulforgeRules(fixture),
    }).includes("const kfcSoulforgeResistances = 8"),
  );
  assert.throws(() =>
    renderPaladinSoulforge({ implementation: "", rules: extractPaladinSoulforgeRules(fixture) }),
  );
});
