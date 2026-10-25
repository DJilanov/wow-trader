import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractDormantHeartFamily,
  renderDruidDormantHeartFamily,
} from "./dormant-heart-family.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/dormant-heart-family-source.v1.json.gz", import.meta.url)),
  ),
);

test("Dormant Heart retains each named class family and combat restriction", () => {
  const rules = extractDormantHeartFamily(source);
  assert.deepEqual(rules.families, {
    priest: "greater-heal",
    druid: "healing-touch",
    paladin: "holy-light",
    shaman: "healing-wave",
  });
  assert.equal(rules.requiresCombat, true);
  assert.equal(rules.healingPower, 40);
  assert.equal(rules.spellDamage, 13);
  assert.equal(rules.durationMs, 15000);
  assert.equal(rules.chanceAndEventPoliciesUnchanged, true);
  assert.equal(rules.serverMechanicsVerified, false);
});

test("changed family text, link, proc mask or payload requires a fresh review", () => {
  for (const mutate of [
    (row) => {
      row.tables.Spell.find((spell) => spell.id === 1249118).Description_lang =
        "Your healing spells grant Eternal Power.";
    },
    (row) => {
      row.tables.ItemXItemEffect[0].ItemID = 249474;
    },
    (row) => {
      row.tables.SpellAuraOptions.find((spell) => spell.SpellID === 1249118).ProcTypeMask[0] =
        81920;
    },
    (row) => {
      row.tables.SpellEffect.find((spell) => spell.SpellID === 1249119).EffectBasePointsF = 80;
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => extractDormantHeartFamily(changed));
  }
});

test("derived Druid correction preserves frozen sources and only updates two obsolete trigger fixtures", () => {
  const implementation = readFileSync(
      new URL("./druid-item-resources.go", import.meta.url),
      "utf8",
    ),
    controls = readFileSync(new URL("./druid-item-resources_test.go", import.meta.url), "utf8"),
    input = { implementation, controls, rules: extractDormantHeartFamily(source) },
    before = structuredClone(input),
    result = renderDruidDormantHeartFamily(input);
  assert.deepEqual(input, before);
  assert(result.implementation.includes('range resto.familySpells["healing-touch"]'));
  assert(result.implementation.includes("sim.CurrentTime >= 0"));
  assert.equal(
    result.controls.split("parent := healer.GetSpell(core.ActionID{SpellID: 774})").length,
    1,
  );
  assert.equal(
    result.controls,
    controls.replaceAll(
      "parent := healer.GetSpell(core.ActionID{SpellID: 774})",
      "parent := healer.GetSpell(core.ActionID{SpellID: 5185})",
    ),
  );
  assert.throws(() => renderDruidDormantHeartFamily({ ...input, implementation: "" }));
});
