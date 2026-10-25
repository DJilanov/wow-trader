import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  extractDraconicEmblemRules,
  renderDraconicEmblemEffect,
} from "./draconic-emblem-model.mjs";

const bytes = readFileSync(
  new URL("./fixtures/draconic-emblem-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "21a5890aac06538b01bff54d81c2c6c98bb532591061ccc8ba014f052db97dd6",
);
const evidence = JSON.parse(gunzipSync(bytes)),
  rules = extractDraconicEmblemRules(evidence),
  common = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/healer-items-client-source.v1.json.gz", import.meta.url)),
    ),
  ).engine["sim/common/item_effects.go"].source;

test("current Emblem is a harmful-cast passive with a separate damage-only creature bonus", () => {
  assert.deepEqual(
    [rules.onUse, rules.spellPower, rules.dragonkinDamage, rules.durationMs, rules.procChance],
    [false, 35, 35, 10000, 1],
  );
  assert.equal(rules.assumptions.periodicTicks, false);
  assert.equal(rules.assumptions.serverVerified, false);
  assert.equal(rules.classMechanicsAdmission, false);
  assert.equal(rules.publicationAllowed, false);
});

test("changed trigger, payload, duration, mask and target restrictions require review", () => {
  for (const mutate of [
    (value) => {
      value.tables.ItemEffect[0].TriggerType = 0;
    },
    (value) => {
      value.tables.ItemXItemEffect[0].ItemEffectID = 1;
    },
    (value) => {
      value.tables.SpellEffect[0].EffectBasePointsF = 190;
    },
    (value) => {
      value.tables.SpellEffect[2].EffectMiscValue = [1, 0];
    },
    (value) => {
      value.tables.SpellEffect[0].Variance = 0.1;
    },
    (value) => {
      value.tables.SpellEffect[0].ImplicitTarget = [6, 0];
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 1318931).ProcChance = 5;
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 1318931).ProcTypeMask = [
        81920, 0,
      ];
    },
    (value) => {
      value.tables.SpellDuration[0].Duration = 15000;
    },
    (value) => {
      value.source.clientVersion = "1.60.1.70533";
    },
    (value) => {
      value.tables.SpellEffect.push(value.tables.SpellEffect[0]);
    },
  ]) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractDraconicEmblemRules(changed));
  }
});

test("the derived runtime removes the old on-use and preserves other item registrations", () => {
  const before = JSON.stringify(evidence),
    derived = renderDraconicEmblemEffect(common, rules);
  assert(!derived.includes("NewSimpleStatOffensiveTrinketEffect(DraconicInfusedEmblem"));
  assert(derived.includes('Name: "Draconic Infusion Trigger"'));
  assert(derived.includes("ProcMask: core.ProcMaskSpellDamage,"));
  assert(derived.includes("SpellFlagsExclude: core.SpellFlagPassiveSpell,"));
  const start = common.indexOf("\t// https://www.wowhead.com/classic/item=22268/"),
    end = common.indexOf("\t// https://www.wowhead.com/classic/item=19288/", start),
    newEnd = derived.indexOf("\t// https://www.wowhead.com/classic/item=19288/", start);
  assert(start >= 0 && end > start && newEnd > start);
  assert.equal(derived.slice(0, start), common.slice(0, start));
  assert.equal(derived.slice(newEnd), common.slice(end));
  assert.equal(JSON.stringify(evidence), before);
  assert.throws(() => renderDraconicEmblemEffect(derived, rules), /changed/);
  assert.throws(() => renderDraconicEmblemEffect(common, { ...rules, dragonkinDamage: 70 }));
});
