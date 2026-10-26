import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { extractShamanReactiveSets, renderShamanReactiveSets } from "./shaman-reactive-sets.mjs";

const evidence = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/shaman-shared-equipment-source.v1.json.gz", import.meta.url)),
  ),
);
const extension = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/shaman-shared-equipment-text-source.v1.json.gz", import.meta.url),
    ),
  ),
);

test("binds all three reachable reactive sets to current incoming-damage payloads", () => {
  const rules = extractShamanReactiveSets(evidence, extension);
  assert.deepEqual(
    rules.definitions.map((row) => [row.setId, row.pieces]),
    [
      [162, 4],
      [163, 6],
      [182, 4],
    ],
  );
  assert.equal(rules.viper.ticks * rules.viper.amount, 100);
  assert.equal(rules.scarlet.amount, 480);
  assert.equal(rules.devout.amount, 488);
  assert.equal(rules.devout.periodicDamageEligible, false);
  assert.equal(rules.serverTriggerTimingVerified, false);
  assert.equal(rules.startsNewClassClock, false);
});

test("rejects changed thresholds, proc conditions, child payloads and cross-capture disagreements", () => {
  for (const edit of [
    (value) => {
      value.tables.ItemSetSpell.find((row) => row.SpellID === 1291796).Threshold = 3;
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 27778).ProcTypeMask[0] |= 0x80000;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 1293733).EffectBasePointsF = 500;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 1291797).EffectAuraPeriod = 2000;
    },
  ]) {
    const changed = structuredClone(evidence);
    edit(changed);
    assert.throws(() => extractShamanReactiveSets(changed, extension));
  }
  const changed = structuredClone(extension);
  changed.tables.Spell.find((row) => row.id === 1291796).Description_lang = "changed source";
  assert.throws(() => extractShamanReactiveSets(evidence, changed));
});

test("derives one health deduction and ordered owned reactions without changing the original inputs", () => {
  const actor =
    "type RestorationShaman struct {\n}\nfunc init() {\n\tresto.registerKFCShamanHealingItems()\n}\n";
  const damage = readFileSync(new URL("./shaman-healing-workload.go", import.meta.url), "utf8");
  const implementation = readFileSync(
    new URL("./shaman-reactive-sets.go", import.meta.url),
    "utf8",
  );
  const input = { evidence, extension, actor, damage, implementation };
  const rendered = renderShamanReactiveSets(input);
  assert(rendered.actor.includes("resto.registerKFCShamanReactiveSets()"));
  assert.equal(rendered.damage.split("unit.RemoveHealth(sim, result.Damage)").length, 2);
  assert(
    rendered.damage.indexOf("unit.RemoveHealth(sim, result.Damage)") <
      rendered.damage.indexOf("resto.kfcShamanReactiveAfterDamage(sim, before"),
  );
  assert(rendered.damage.includes("receive(sim, spell, result, true)"));
  assert(!rendered.implementation.includes("KFC_SHAMAN_REACTIVE_SET_VALUES"));
  assert.equal(input.actor, actor);
  assert.throws(() => renderShamanReactiveSets({ ...input, actor: actor + actor }));
});
